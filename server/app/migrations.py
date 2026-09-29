"""Idempotent data upgrades run at startup (until Alembic is introduced, see ADR-001)."""

from sqlalchemy import Engine, case, func, inspect, text, update

from .models import CheckRun, Rule
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


# Columns added to existing tables after the first release: (table, column, DDL type + default)
_ADDED_COLUMNS = [
    ("check_runs", "progress_done", "INTEGER NOT NULL DEFAULT 0"),
    ("check_runs", "progress_total", "INTEGER NOT NULL DEFAULT 0"),
    ("check_runs", "step", "VARCHAR(200)"),
    ("check_runs", "finished_at", "TIMESTAMP WITH TIME ZONE"),
]

ACTIVE_CHECK_STATES = ("queued", "running")


def add_missing_columns(engine: Engine) -> list[str]:
    """`create_all` doesn't alter existing tables; add the columns introduced since. Returns what was added."""
    added: list[str] = []
    inspector = inspect(engine)
    existing = {table: {c["name"] for c in inspector.get_columns(table)} for table in {t for t, _, _ in _ADDED_COLUMNS}}
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if column not in existing[table]:
                if engine.dialect.name == "sqlite":
                    ddl = ddl.replace("TIMESTAMP WITH TIME ZONE", "DATETIME")
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                added.append(f"{table}.{column}")
    return added


def fail_interrupted_checks(engine: Engine) -> int:
    """Checks that were queued or running when the server stopped will never finish; mark them failed."""
    stmt = (
        update(CheckRun)
        .where(CheckRun.status.in_(ACTIVE_CHECK_STATES))
        .values(status="failed", error="Interrupted by a server restart.", finished_at=func.now())
    )
    with engine.begin() as conn:
        return conn.execute(stmt).rowcount
