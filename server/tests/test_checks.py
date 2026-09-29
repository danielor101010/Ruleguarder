"""Background checks: state transitions, progress, cancellation and recovery (SQLite, fake AI)."""

import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.checks import CheckRunner
from app.config import get_settings
from app.db import Base
from app.llm import LlmError, LlmViolation
from app.migrations import add_missing_columns, fail_interrupted_checks
from app.models import CheckRun, Document, Rule
from app.rules import validate_rule_params
from app.schemas import CheckStatus

TERMINAL = {"completed", "failed", "cancelled"}


class FakeAi:
    """Returns no violations; with `hold`, each request waits until released (to test cancel)."""

    def __init__(self, hold: bool = False, error: Exception | None = None) -> None:
        self.calls = 0
        self.started = threading.Event()
        self.release = threading.Event()
        self.hold = hold
        self.error = error

    def find_violations(self, rules, blocks) -> list[LlmViolation]:
        self.calls += 1
        self.started.set()
        if self.hold:
            assert self.release.wait(5), "test never released the fake AI"
        if self.error:
            raise self.error
        return []


@pytest.fixture
def sessions(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    engine = create_engine(f"sqlite:///{tmp_path / 'checks.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def _seed(
    sessions, *, ai_rule: bool = False, builtin_rule: bool = True, paragraphs: int = 3
) -> tuple[Document, list[Rule]]:
    blocks = [
        {
            "id": i,
            "kind": "paragraph",
            "text": f"Paragraph {i} mentions TOP SECRET data.",
            "label": f"Paragraph {i + 1}",
        }
        for i in range(paragraphs)
    ]
    rules = []
    if builtin_rule:
        rules.append(
            Rule(
                name="Markings",
                type="forbidden_text",
                params=validate_rule_params("forbidden_text", {"pattern": "top secret"}),
            )
        )
    if ai_rule:
        rules.append(Rule(name="AI", type="llm", params={"instruction": "No numbers"}))
    with sessions() as db:
        doc = Document(filename="d.docx", stored_path="/tmp/d.docx", size_bytes=1, blocks=blocks)
        db.add(doc)
        db.add_all(rules)
        db.commit()
        return doc, rules


def _wait(sessions, run_id: int, states=TERMINAL, timeout: float = 5) -> CheckRun:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with sessions() as db:
            run = db.get(CheckRun, run_id)
            assert run is not None
            if run.status in states:
                return run
        time.sleep(0.02)
    raise AssertionError(f"check {run_id} did not reach {states}")


def _start(runner: CheckRunner, sessions, doc: Document, rules: list[Rule]) -> CheckRun:
    with sessions() as db:
        return runner.start(db, db.get(Document, doc.id), [db.get(Rule, r.id) for r in rules])


def test_builtin_check_completes_with_progress(sessions):
    doc, rules = _seed(sessions)
    runner = CheckRunner(sessions, None)
    run = _wait(sessions, _start(runner, sessions, doc, rules).id)
    assert run.status == "completed"
    assert (run.progress_done, run.progress_total, run.step) == (1, 1, "Built-in rules")
    assert len(run.violations) == 3
    assert run.finished_at is not None
    status = CheckStatus.model_validate(run)
    assert status.check_id == run.id and status.status == "completed"


def test_ai_progress_counts_each_request(sessions, monkeypatch):
    monkeypatch.setattr(get_settings(), "llm_chunk_chars", 60)  # one paragraph per request
    doc, rules = _seed(sessions, ai_rule=True, paragraphs=4)
    ai = FakeAi()
    runner = CheckRunner(sessions, lambda: ai)
    run = _wait(sessions, _start(runner, sessions, doc, rules).id)
    assert run.status == "completed"
    assert ai.calls == 4
    assert (run.progress_done, run.progress_total, run.step) == (5, 5, "AI rules: part 4 of 4")


def test_cancel_stops_before_the_next_ai_request(sessions, monkeypatch):
    monkeypatch.setattr(get_settings(), "llm_chunk_chars", 60)
    monkeypatch.setattr(get_settings(), "llm_max_parallel", 1)
    doc, rules = _seed(sessions, ai_rule=True, builtin_rule=False, paragraphs=3)
    ai = FakeAi(hold=True)
    runner = CheckRunner(sessions, lambda: ai)
    run_id = _start(runner, sessions, doc, rules).id
    assert ai.started.wait(5)

    with sessions() as db:
        cancelled = runner.cancel(db, db.get(CheckRun, run_id))
        assert cancelled.status == "cancelled"  # immediately, while the request is still in flight
    ai.release.set()

    time.sleep(0.2)  # let the worker finish its in-flight request
    run = _wait(sessions, run_id)
    assert run.status == "cancelled"
    assert run.violations == []
    assert ai.calls == 1, "no further AI requests after cancelling"


def test_only_one_active_check_per_document(sessions):
    doc, rules = _seed(sessions, ai_rule=True, builtin_rule=False)
    ai = FakeAi(hold=True)
    runner = CheckRunner(sessions, lambda: ai)
    first = _start(runner, sessions, doc, rules)
    assert ai.started.wait(5)
    second = _start(runner, sessions, doc, rules)
    assert second.id == first.id
    ai.release.set()
    assert _wait(sessions, first.id).status == "completed"
    # Once finished, a new check can start
    third = _start(runner, sessions, doc, rules)
    assert third.id != first.id
    _wait(sessions, third.id)


def test_all_rules_failing_marks_the_check_failed(sessions):
    doc, rules = _seed(sessions, ai_rule=True, builtin_rule=False)
    runner = CheckRunner(sessions, lambda: FakeAi(error=LlmError("All Gemini models are unavailable right now")))
    run = _wait(sessions, _start(runner, sessions, doc, rules).id)
    assert run.status == "failed"
    assert "unavailable" in (run.error or "")


def test_partial_failure_still_completes(sessions):
    doc, rules = _seed(sessions, ai_rule=True)
    runner = CheckRunner(sessions, lambda: FakeAi(error=LlmError("quota")))
    run = _wait(sessions, _start(runner, sessions, doc, rules).id)
    assert run.status == "completed"
    assert [f["rule_name"] for f in run.summary["failed_rules"]] == ["AI"]
    assert len(run.violations) == 3


def test_rules_deleted_before_the_check_ran(sessions):
    doc, _ = _seed(sessions)
    with sessions() as db:
        run = CheckRun(document_id=doc.id, rule_ids=[999], status="queued")
        db.add(run)
        db.commit()
    runner = CheckRunner(sessions, None)
    runner._execute(run.id)  # run inline
    run = _wait(sessions, run.id)
    assert run.status == "failed"
    assert "deleted" in (run.error or "")


def test_interrupted_checks_are_failed_at_startup(sessions):
    doc, _ = _seed(sessions)
    with sessions() as db:
        db.add_all([CheckRun(document_id=doc.id, status=s) for s in ("queued", "running", "completed")])
        db.commit()
    engine = sessions.kw["bind"]
    assert fail_interrupted_checks(engine) == 2
    with sessions() as db:
        states = sorted((r.status, r.error) for r in db.query(CheckRun).all())
    assert states == [
        ("completed", None),
        ("failed", "Interrupted by a server restart."),
        ("failed", "Interrupted by a server restart."),
    ]


def test_missing_columns_are_added_to_an_old_table(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE check_runs (id INTEGER PRIMARY KEY, document_id INTEGER, status VARCHAR(20))"))
    assert set(add_missing_columns(engine)) == {
        "check_runs.progress_done",
        "check_runs.progress_total",
        "check_runs.step",
        "check_runs.finished_at",
    }
    assert add_missing_columns(engine) == []  # idempotent
