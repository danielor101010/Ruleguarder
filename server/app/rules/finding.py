from dataclasses import dataclass


@dataclass
class Finding:
    """One rule violation. block_id None => whole document; start/end None => whole block."""

    message: str
    block_id: int | None = None
    start: int | None = None
    end: int | None = None
