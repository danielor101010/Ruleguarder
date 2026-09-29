"""Rule types.

The main rule type is "llm": a natural-language instruction that the LLM checks
(e.g. "the document must not reveal numeric performance figures of the system").
The other types are deterministic, free and exact - use them for formatting rules
(fonts, sizes) that an LLM cannot see, or for plain forbidden words.

To add a new deterministic type: define a params model + a checker function (here, or in
its own module when it is larger, like pii.py), then register it in RULE_TYPES. The client
builds its form from the params JSON schema, so no client change is needed.
"""

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, model_validator

from ..schemas import Block, Run
from .acronyms import AcronymParams, check_acronym_definitions
from .cross_references import CrossReferenceParams, check_cross_references
from .finding import Finding
from .pii import PiiParams, check_pii

# Each checker takes its own params model; the registry pairs them via RuleType.params_model
Checker = Callable[[Any, list[Block]], Iterable[Finding]]


@dataclass
class RuleType:
    key: str
    label: str
    description: str
    params_model: type[BaseModel]
    # None => evaluated by the LLM (see llm_check.py)
    check: Checker | None


# ---------- params models ----------


class LlmParams(BaseModel):
    instruction: str = Field(
        min_length=3,
        title="Rule (in plain language)",
        description='What is not allowed / required, e.g. "No numeric figures that reveal the '
        "system's performance (ranges, speeds, accuracy...)\".",
        json_schema_extra={"format": "textarea"},
    )


class TextPatternParams(BaseModel):
    pattern: str = Field(min_length=1, title="Text / pattern")
    is_regex: bool = Field(default=False, title="Treat as regular expression")
    case_sensitive: bool = Field(default=False, title="Case sensitive")

    @model_validator(mode="after")
    def _valid_regex(self) -> "TextPatternParams":
        try:
            self.compiled()
        except re.error as exc:
            raise ValueError(f"Invalid regular expression: {exc}") from exc
        return self

    def compiled(self) -> re.Pattern[str]:
        source = self.pattern if self.is_regex else re.escape(self.pattern)
        return re.compile(source, 0 if self.case_sensitive else re.IGNORECASE)


class MaxWordsParams(BaseModel):
    max_words: int = Field(gt=0, title="Maximum words")


class AllowedFontsParams(BaseModel):
    fonts: list[str] = Field(min_length=1, title="Allowed fonts")


class FontSizeRangeParams(BaseModel):
    min_pt: float = Field(default=0, ge=0, title="Minimum size (pt)")
    max_pt: float = Field(default=200, gt=0, title="Maximum size (pt)")

    @model_validator(mode="after")
    def _ordered(self) -> "FontSizeRangeParams":
        if self.min_pt > self.max_pt:
            raise ValueError("min_pt must be <= max_pt")
        return self


# ---------- checkers ----------

_WORD_RE = re.compile(r"\S+")
_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]*")


def _check_forbidden_text(params: TextPatternParams, blocks: list[Block]) -> Iterable[Finding]:
    pattern = params.compiled()
    for block in blocks:
        for m in pattern.finditer(block.text):
            if m.end() == m.start():
                continue
            yield Finding(f'Forbidden text "{m.group(0)}"', block.id, m.start(), m.end())


def _check_required_text(params: TextPatternParams, blocks: list[Block]) -> Iterable[Finding]:
    pattern = params.compiled()
    if not any(pattern.search(b.text) for b in blocks):
        yield Finding(f'Required text "{params.pattern}" was not found anywhere in the document')


def _check_max_sentence_words(params: MaxWordsParams, blocks: list[Block]) -> Iterable[Finding]:
    for block in blocks:
        for m in _SENTENCE_RE.finditer(block.text):
            words = len(_WORD_RE.findall(m.group(0)))
            if words > params.max_words:
                # trim leading whitespace so the highlight starts on the first word
                lead = len(m.group(0)) - len(m.group(0).lstrip())
                yield Finding(
                    f"Sentence has {words} words (max {params.max_words})",
                    block.id,
                    m.start() + lead,
                    m.end(),
                )


def _check_max_paragraph_words(params: MaxWordsParams, blocks: list[Block]) -> Iterable[Finding]:
    for block in blocks:
        words = len(_WORD_RE.findall(block.text))
        if words > params.max_words:
            yield Finding(
                f"Paragraph has {words} words (max {params.max_words})",
                block.id,
                0,
                len(block.text),
            )


def _merge_run_findings(
    blocks: list[Block], bad_value: Callable[[Run], Any], describe: Callable[[Any], str]
) -> Iterable[Finding]:
    """Emit one finding per stretch of consecutive runs sharing the same offending value."""
    for block in blocks:
        span: tuple[int, int, Any] | None = None
        for run in block.runs:
            value = bad_value(run) if run.text.strip() else None
            if span and value is not None and value == span[2] and run.start == span[1]:
                span = (span[0], run.end, value)
                continue
            if span:
                yield Finding(describe(span[2]), block.id, span[0], span[1])
            span = (run.start, run.end, value) if value is not None else None
        if span:
            yield Finding(describe(span[2]), block.id, span[0], span[1])


def _check_allowed_fonts(params: AllowedFontsParams, blocks: list[Block]) -> Iterable[Finding]:
    allowed = {f.strip().lower() for f in params.fonts}
    return _merge_run_findings(
        blocks,
        # Unknown font (theme font, not resolvable) is not reported
        lambda run: run.font if run.font and run.font.lower() not in allowed else None,
        lambda font: f'Font "{font}" is not allowed (allowed: {", ".join(params.fonts)})',
    )


def _check_font_size_range(params: FontSizeRangeParams, blocks: list[Block]) -> Iterable[Finding]:
    return _merge_run_findings(
        blocks,
        lambda run: (
            run.size_pt if run.size_pt is not None and not (params.min_pt <= run.size_pt <= params.max_pt) else None
        ),
        lambda size: f"Font size {size}pt is outside {params.min_pt}-{params.max_pt}pt",
    )


LLM_RULE_TYPE = "llm"

RULE_TYPES: dict[str, RuleType] = {
    t.key: t
    for t in [
        RuleType(
            LLM_RULE_TYPE,
            "AI rule (plain language)",
            "Describe the rule in your own words (any language). The AI reads the whole "
            "document and flags every place that breaks it.",
            LlmParams,
            None,
        ),
        RuleType(
            "forbidden_text",
            "Forbidden text",
            "Flags every occurrence of a word, phrase or regex.",
            TextPatternParams,
            _check_forbidden_text,
        ),
        RuleType(
            "required_text",
            "Required text",
            "The document must contain this word, phrase or regex at least once.",
            TextPatternParams,
            _check_required_text,
        ),
        RuleType(
            "max_sentence_words",
            "Max sentence length",
            "Flags sentences longer than N words.",
            MaxWordsParams,
            _check_max_sentence_words,
        ),
        RuleType(
            "max_paragraph_words",
            "Max paragraph length",
            "Flags paragraphs longer than N words.",
            MaxWordsParams,
            _check_max_paragraph_words,
        ),
        RuleType(
            "allowed_fonts",
            "Allowed fonts",
            "Flags text written in a font that is not in the list.",
            AllowedFontsParams,
            _check_allowed_fonts,
        ),
        RuleType(
            "font_size_range",
            "Font size range",
            "Flags text whose font size is outside the range.",
            FontSizeRangeParams,
            _check_font_size_range,
        ),
        RuleType(
            "pii",
            "Personal data (PII)",
            "Flags social security numbers, phone numbers, email addresses and credit card "
            "numbers. The report shows them masked.",
            PiiParams,
            check_pii,
        ),
        RuleType(
            "acronym_definitions",
            "Acronym definitions",
            'Every acronym must be defined at its first use, as "Full Name (ABC)" or "ABC (Full Name)".',
            AcronymParams,
            check_acronym_definitions,
        ),
        RuleType(
            "cross_references",
            "Cross-references",
            'Flags references such as "Section 3.2", "Figure 4" or "Table 2" whose target does not exist.',
            CrossReferenceParams,
            check_cross_references,
        ),
    ]
}
