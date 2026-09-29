from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["info", "warning", "error"]
BlockKind = Literal["paragraph", "heading", "table_cell"]


# ---------- Parsed document ----------


class Run(BaseModel):
    """A contiguous piece of text with uniform formatting. Offsets are into Block.text."""

    start: int
    end: int
    text: str
    font: str | None = None
    size_pt: float | None = None
    bold: bool | None = None
    italic: bool | None = None


class Block(BaseModel):
    """One paragraph of the document (body paragraph, heading, or a paragraph inside a table cell)."""

    id: int
    kind: BlockKind
    text: str
    style: str | None = None
    heading_level: int | None = None
    heading_context: str | None = None  # nearest preceding heading
    label: str  # human readable position, e.g. "Paragraph 4" / "Table 1, row 2, column 3"
    paragraph_index: int | None = None
    table_index: int | None = None
    row: int | None = None
    col: int | None = None
    runs: list[Run] = []


# ---------- Rules ----------


class RuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    type: str
    params: dict[str, Any] = {}
    severity: Severity = "error"
    enabled: bool = True


class RuleCreate(RuleBase):
    pass


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    params: dict[str, Any] | None = None
    severity: Severity | None = None
    enabled: bool | None = None


class RuleOut(RuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class RuleTypeOut(BaseModel):
    key: str
    label: str
    description: str
    params_schema: dict[str, Any]


# ---------- Documents & reports ----------


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    size_bytes: int
    uploaded_at: datetime


class DocumentOut(DocumentSummary):
    blocks: list[Block]


class Violation(BaseModel):
    id: str
    rule_id: int
    rule_name: str
    severity: Severity
    message: str
    block_id: int | None = None  # None => applies to the whole document
    start: int | None = None
    end: int | None = None
    excerpt: str = ""
    location: str


class CheckRequest(BaseModel):
    # None => all enabled rules
    rule_ids: list[int] | None = None


class ReportSummary(BaseModel):
    total: int
    by_severity: dict[str, int]
    rules_checked: int


class ReportOut(BaseModel):
    check_id: int
    checked_at: datetime
    document: DocumentOut
    violations: list[Violation]
    summary: ReportSummary
