"""Progress reporting and cancellation for a running check.

The engine calls `begin(total)` once it knows the number of steps (built-in rules count as one step,
each AI request as one), `advance(label)` after each finished step, and `cancelled()` between steps.
"""

from typing import Protocol


class CheckCancelled(Exception):
    """The check was cancelled; unwinds the engine without recording rule failures."""


class Progress(Protocol):
    def begin(self, total: int) -> None: ...

    def advance(self, label: str) -> None: ...

    def cancelled(self) -> bool: ...


class NoProgress:
    """For synchronous checks: nothing to report, never cancelled."""

    def begin(self, total: int) -> None:
        pass

    def advance(self, label: str) -> None:
        pass

    def cancelled(self) -> bool:
        return False
