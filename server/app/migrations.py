"""Idempotent data upgrades run at startup (until Alembic is introduced, see ADR-001)."""

from sqlalchemy import Engine, case, update

from .models import Rule
from .schemas import LEGACY_SEVERITY


def upgrade_legacy_severities(engine: Engine) -> int:
    """error/warning/info -> high/medium/low on stored rules. Returns the number of rows changed.

    Stored reports (check_runs) are upgraded when read, by the Severity validator.
    """
    stmt = (
        update(Rule)
        .where(Rule.severity.in_(LEGACY_SEVERITY))
        .values(severity=case(LEGACY_SEVERITY, value=Rule.severity))
    )
    with engine.begin() as conn:
        return conn.execute(stmt).rowcount
