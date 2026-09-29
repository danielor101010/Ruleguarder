import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db import Base
from app.migrations import upgrade_legacy_severities
from app.models import Rule
from app.schemas import ReportSummary, RuleCreate, Violation


@pytest.mark.parametrize(
    ("legacy", "new"),
    [("error", "high"), ("warning", "medium"), ("info", "low"), ("high", "high")],
)
def test_legacy_severity_is_upgraded_on_read(legacy, new):
    violation = Violation(id="1-0", rule_id=1, rule_name="r", severity=legacy, message="m", location="x")
    assert violation.severity == new


def test_unknown_severity_rejected():
    with pytest.raises(ValidationError):
        RuleCreate(name="r", type="llm", severity="critical")


def test_default_severity_is_high():
    assert RuleCreate(name="r", type="llm").severity == "high"


def test_summary_keys_upgraded_and_merged():
    summary = ReportSummary(total=4, by_severity={"error": 2, "high": 1, "info": 1}, rules_checked=2)
    assert summary.by_severity == {"high": 3, "low": 1}


def test_stored_rules_upgraded_once():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all(
            [
                Rule(name="a", type="llm", params={}, severity="error"),
                Rule(name="b", type="llm", params={}, severity="info"),
                Rule(name="c", type="llm", params={}, severity="medium"),
            ]
        )
        db.commit()

    assert upgrade_legacy_severities(engine) == 2
    assert upgrade_legacy_severities(engine) == 0  # idempotent
    with Session(engine) as db:
        assert list(db.scalars(select(Rule.severity).order_by(Rule.name))) == ["high", "low", "medium"]
