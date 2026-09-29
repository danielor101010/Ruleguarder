import io
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..checks import CheckRunner, finish_run, get_runner
from ..config import get_settings
from ..db import get_db
from ..docx_parser import DocxParseError, parse_docx
from ..llm import get_llm_provider
from ..models import CheckRun, Document, Rule
from ..rules import run_rules
from ..schemas import (
    Block,
    CheckRequest,
    CheckStatus,
    DocumentOut,
    DocumentSummary,
    ReportOut,
    ReportSummary,
    Violation,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])

_DOCX_MAGIC = b"PK\x03\x04"  # .docx is a zip archive


@router.get("", response_model=list[DocumentSummary])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return list(db.scalars(select(Document).order_by(Document.uploaded_at.desc())))


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile, db: Session = Depends(get_db)) -> Document:
    settings = get_settings()
    filename = Path(file.filename or "document.docx").name
    if not filename.lower().endswith(".docx"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .docx files are supported")

    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File is larger than {settings.max_upload_mb} MB"
        )
    if not content.startswith(_DOCX_MAGIC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a valid .docx document")

    # Parse before anything is written, so a rejected file leaves nothing behind
    try:
        blocks = parse_docx(io.BytesIO(content))
    except DocxParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = settings.upload_dir / f"{uuid.uuid4().hex}.docx"
    stored_path.write_bytes(content)
    doc = Document(
        filename=filename,
        stored_path=str(stored_path),
        size_bytes=len(content),
        blocks=[b.model_dump() for b in blocks],
    )
    try:
        db.add(doc)
        db.commit()
    except Exception:
        stored_path.unlink(missing_ok=True)
        raise
    return doc


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, db: Session = Depends(get_db)) -> Document:
    return _get_or_404(db, document_id)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)) -> None:
    doc = _get_or_404(db, document_id)
    stored_path = Path(doc.stored_path)
    db.delete(doc)
    db.commit()
    # After the commit: if the DB delete fails, the document stays complete
    try:
        stored_path.unlink(missing_ok=True)
    except OSError:
        log.warning("Could not remove %s", stored_path, exc_info=True)


@router.post("/{document_id}/check", response_model=ReportOut)
def check_document(document_id: int, body: CheckRequest | None = None, db: Session = Depends(get_db)) -> ReportOut:
    """Run rules against the document and store the report.

    A rule that can't be checked is listed in `summary.failed_rules` and the others still count.
    Only when no rule could be checked at all does the request fail (502), so the latest
    completed report stays the one shown.

    Sync handler on purpose: FastAPI runs it in a worker thread, so a long LLM call
    doesn't block the event loop.
    """
    doc = _get_or_404(db, document_id)
    rules = _rules_for(db, body)

    blocks = [Block.model_validate(b) for b in doc.blocks]
    run = CheckRun(document_id=doc.id, rule_ids=[r.id for r in rules])
    violations, summary = run_rules(rules, blocks, get_llm_provider)
    finish_run(run, violations, summary)
    db.add(run)
    db.commit()
    if run.status == "failed":
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, run.error)
    return _report(doc, run)


@router.post("/{document_id}/checks", response_model=CheckStatus, status_code=status.HTTP_202_ACCEPTED)
def start_check(
    document_id: int,
    body: CheckRequest | None = None,
    db: Session = Depends(get_db),
    runner: CheckRunner = Depends(get_runner),
) -> CheckRun:
    """Start a background check (or return the document's check that is already running)."""
    doc = _get_or_404(db, document_id)
    return runner.start(db, doc, _rules_for(db, body))


@router.get("/{document_id}/checks/latest", response_model=CheckStatus)
def latest_check(document_id: int, db: Session = Depends(get_db)) -> CheckRun:
    doc = _get_or_404(db, document_id)
    run = db.scalars(
        select(CheckRun).where(CheckRun.document_id == doc.id).order_by(CheckRun.id.desc()).limit(1)
    ).first()
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This document has not been checked yet")
    return run


@router.get("/{document_id}/report", response_model=ReportOut)
def latest_report(document_id: int, db: Session = Depends(get_db)) -> ReportOut:
    doc = _get_or_404(db, document_id)
    run = db.scalars(
        select(CheckRun)
        .where(CheckRun.document_id == doc.id, CheckRun.status == "completed")
        .order_by(CheckRun.created_at.desc(), CheckRun.id.desc())
        .limit(1)
    ).first()
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This document has not been checked yet")
    return _report(doc, run)


def _report(doc: Document, run: CheckRun) -> ReportOut:
    return ReportOut(
        check_id=run.id,
        checked_at=run.created_at,
        document=DocumentOut.model_validate(doc),
        violations=[Violation.model_validate(v) for v in run.violations],
        summary=ReportSummary.model_validate(run.summary),
    )


def _rules_for(db: Session, body: CheckRequest | None) -> list[Rule]:
    """The requested rules, or all enabled ones."""
    query = select(Rule).order_by(Rule.id)
    if body and body.rule_ids is not None:
        query = query.where(Rule.id.in_(body.rule_ids))
    else:
        query = query.where(Rule.enabled.is_(True))
    rules = list(db.scalars(query))
    if not rules:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No rules to check. Create or enable a rule first.")
    return rules


def _get_or_404(db: Session, document_id: int) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc
