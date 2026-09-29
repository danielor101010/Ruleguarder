"""Background checks: run a document's rules in a worker thread and record progress on its CheckRun.

One runner per process (created in `main.lifespan`). State lives in the database, so the client
can poll `GET /api/checks/{id}` and a reloaded page can reconnect; cancellation is an in-memory
flag the engine polls between steps.
"""

import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from .llm import LlmProvider
from .migrations import ACTIVE_CHECK_STATES
from .models import CheckRun, Document, Rule
from .rules import run_rules
from .rules.progress import CheckCancelled
from .schemas import Block, ReportSummary, Violation

log = logging.getLogger(__name__)


def finish_run(run: CheckRun, violations: list[Violation], summary: ReportSummary) -> None:
    """Record a finished check. With no rule checked at all the run is `failed`, so the last good
    report stays the one shown; otherwise it's `completed` (possibly listing failed rules)."""
    run.finished_at = datetime.now(UTC)
    if summary.failed_rules and summary.rules_checked == 0:
        errors = list(dict.fromkeys(f.error for f in summary.failed_rules))
        run.status, run.error = "failed", f"No rule could be checked. {' '.join(errors)}"
        return
    run.status = "completed"
    run.violations = [v.model_dump() for v in violations]
    run.summary = summary.model_dump()


class _DbProgress:
    """Writes progress to the CheckRun row; cancellation comes from the runner's flag."""

    def __init__(self, session_factory: sessionmaker[Session], run_id: int, cancel: threading.Event) -> None:
        self._sessions = session_factory
        self._run_id = run_id
        self._cancel = cancel
        self._done = 0

    def _write(self, **values: object) -> None:
        with self._sessions() as db:
            db.execute(
                update(CheckRun).where(CheckRun.id == self._run_id, CheckRun.status == "running").values(**values)
            )
            db.commit()

    def begin(self, total: int) -> None:
        self._write(progress_total=total, progress_done=0, step="Starting")

    def advance(self, label: str) -> None:
        self._done += 1
        self._write(progress_done=self._done, step=label)

    def cancelled(self) -> bool:
        return self._cancel.is_set()


def get_runner(request: Request) -> "CheckRunner":
    """FastAPI dependency: the process-wide runner created at startup."""
    runner: CheckRunner = request.app.state.check_runner
    return runner


class CheckRunner:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        llm: Callable[[], LlmProvider] | None,
        workers: int = 2,
    ) -> None:
        self._sessions = session_factory
        self._llm = llm
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="check")
        self._cancel_flags: dict[int, threading.Event] = {}
        # Serialises "is there an active check for this document?" + "create one"
        self._start_lock = threading.Lock()

    def start(self, db: Session, document: Document, rules: list[Rule]) -> CheckRun:
        """Queue a check, or return the document's check that is already queued/running."""
        with self._start_lock:
            active = db.scalars(
                select(CheckRun)
                .where(CheckRun.document_id == document.id, CheckRun.status.in_(ACTIVE_CHECK_STATES))
                .order_by(CheckRun.id.desc())
                .limit(1)
            ).first()
            if active is not None:
                return active
            run = CheckRun(document_id=document.id, rule_ids=[r.id for r in rules], status="queued")
            db.add(run)
            db.commit()
            self._cancel_flags[run.id] = threading.Event()
        self._pool.submit(self._execute, run.id)
        return run

    def cancel(self, db: Session, run: CheckRun) -> CheckRun:
        """Mark a queued/running check cancelled right away; the worker stops at its next step."""
        if run.status in ACTIVE_CHECK_STATES:
            flag = self._cancel_flags.get(run.id)
            if flag is not None:
                flag.set()
            run.status, run.finished_at = "cancelled", datetime.now(UTC)
            db.commit()
        return run

    def shutdown(self) -> None:
        for flag in self._cancel_flags.values():
            flag.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    def _execute(self, run_id: int) -> None:
        cancel = self._cancel_flags.get(run_id, threading.Event())
        try:
            with self._sessions() as db:
                run = db.get(CheckRun, run_id)
                if run is None or run.status != "queued":
                    return  # cancelled before it started
                run.status = "running"
                db.commit()
                document = db.get(Document, run.document_id)
                rules = list(db.scalars(select(Rule).where(Rule.id.in_(run.rule_ids)).order_by(Rule.id)))
                if document is None or not rules:
                    run.status, run.error = "failed", "The document or its rules were deleted before the check ran."
                    run.finished_at = datetime.now(UTC)
                    db.commit()
                    return
                blocks = [Block.model_validate(b) for b in document.blocks]

            progress = _DbProgress(self._sessions, run_id, cancel)
            try:
                violations, summary = run_rules(rules, blocks, self._llm, progress)
            except CheckCancelled:
                return  # already marked cancelled by `cancel`
            except Exception:
                log.exception("Check %s failed", run_id)
                self._fail(run_id, "Internal error while checking the document.")
                return

            with self._sessions() as db:
                run = db.get(CheckRun, run_id)
                if run is None or run.status != "running":
                    return  # cancelled (or deleted) while the last step was running: discard the result
                finish_run(run, violations, summary)
                db.commit()
        except Exception:
            log.exception("Check %s could not be recorded", run_id)
            self._fail(run_id, "Internal error while recording the check.")
        finally:
            self._cancel_flags.pop(run_id, None)

    def _fail(self, run_id: int, error: str) -> None:
        with self._sessions() as db:
            db.execute(
                update(CheckRun)
                .where(CheckRun.id == run_id, CheckRun.status.in_(ACTIVE_CHECK_STATES))
                .values(status="failed", error=error, finished_at=datetime.now(UTC))
            )
            db.commit()
