from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator

# Names used before the high/medium/low rename; old rules and stored reports still load.
LEGACY_SEVERITY = {"error": "high", "warning": "medium", "info": "low"}


def _upgrade_severity(value: Any) -> Any:
    return LEGACY_SEVERITY.get(value, value) if isinstance(value, str) else value


Severity = Annotated[Literal["low", "medium", "high"], BeforeValidator(_upgrade_severity)]
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
    severity: Severity = "high"
    enabled: bool = True


class RuleCreate(RuleBase):
    pass


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    params: dict[str, Any] | None = None
    severity: Severity | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def _no_explicit_nulls(self) -> "RuleUpdate":
        # A field left out keeps its value; an explicit null would reach a NOT NULL column
        nulls = sorted(name for name in self.model_fields_set if getattr(self, name) is None)
        if nulls:
            raise ValueError(f"{', '.join(nulls)} cannot be null (leave a field out to keep its value)")
        return self


class RuleOut(RuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class RuleTypeOut(BaseModel):
    key: str
    label: str
    description: str
    params_schema: dict[str, Any]


TemplateCategory = Literal["security", "privacy", "style", "structure", "ai"]


class RuleTemplate(BaseModel):
    """A ready-made rule the user can add as is, or edit first."""

    id: str  # stable slug, e.g. "pii-all"
    label: str
    description: str
    category: TemplateCategory
    in_sample_set: bool = False
    rule: RuleCreate  # ready to POST /api/rules


class SampleRulesResult(BaseModel):
    created: list[RuleOut]
    skipped: list[str]  # names of sample rules that already existed


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


class FailedRule(BaseModel):
    """A rule that could not be checked (e.g. the AI is unavailable); the other rules' results still count."""

    rule_id: int
    rule_name: str
    error: str


class ReportSummary(BaseModel):
    total: int
    by_severity: dict[str, int]
    rules_checked: int  # rules that ran successfully
    failed_rules: list[FailedRule] = []  # absent in reports stored before this field existed

    @field_validator("by_severity", mode="before")
    @classmethod
    def _upgrade_keys(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        upgraded: dict[str, int] = {}
        for key, count in value.items():
            new_key = LEGACY_SEVERITY.get(str(key), str(key))
            upgraded[new_key] = upgraded.get(new_key, 0) + count
        return upgraded


class ReportOut(BaseModel):
    check_id: int
    checked_at: datetime
    document: DocumentOut
    violations: list[Violation]
    summary: ReportSummary
