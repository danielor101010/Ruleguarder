import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..docx_parser import DocxParseError, parse_docx
from ..llm import LlmError, get_llm_provider
from ..models import CheckRun, Document, Rule
from ..rules import RuleValidationError, run_rules
from ..schemas import (
    Block,
    CheckRequest,
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

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = settings.upload_dir / f"{uuid.uuid4().hex}.docx"
    stored_path.write_bytes(content)

    try:
        blocks = parse_docx(str(stored_path))
    except DocxParseError as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    doc = Document(
        filename=filename,
        stored_path=str(stored_path),
        size_bytes=len(content),
        blocks=[b.model_dump() for b in blocks],
    )
    db.add(doc)
    db.commit()
    return doc


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, db: Session = Depends(get_db)) -> Document:
    return _get_or_404(db, document_id)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)) -> None:
    doc = _get_or_404(db, document_id)
    Path(doc.stored_path).unlink(missing_ok=True)
    db.delete(doc)
    db.commit()


@router.post("/{document_id}/check", response_model=ReportOut)
def check_document(document_id: int, body: CheckRequest | None = None, db: Session = Depends(get_db)) -> ReportOut:
    """Run rules against the document and store the report.

    Sync handler on purpose: FastAPI runs it in a worker thread, so a long LLM call
    doesn't block the event loop.
    """
    doc = _get_or_404(db, document_id)

    query = select(Rule).order_by(Rule.id)
    if body and body.rule_ids is not None:
        query = query.where(Rule.id.in_(body.rule_ids))
    else:
        query = query.where(Rule.enabled.is_(True))
    rules = list(db.scalars(query))
    if not rules:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No rules to check. Create or enable a rule first.")

    blocks = [Block.model_validate(b) for b in doc.blocks]
    run = CheckRun(document_id=doc.id, rule_ids=[r.id for r in rules])
    try:
        llm = get_llm_provider() if any(r.type == "llm" for r in rules) else None
        violations, summary = run_rules(rules, blocks, llm)
    except (LlmError, RuleValidationError) as exc:
        run.status, run.error = "failed", str(exc)
        db.add(run)
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    run.status = "completed"
    run.violations = [v.model_dump() for v in violations]
    run.summary = summary.model_dump()
    db.add(run)
    db.commit()
    return _report(doc, run)


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


def _get_or_404(db: Session, document_id: int) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc
