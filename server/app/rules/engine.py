from collections import Counter
from typing import Any

from ..llm import LlmProvider, LlmRule
from ..models import Rule
from ..schemas import Block, ReportSummary, Violation
from .llm_check import check_llm_rules
from .registry import LLM_RULE_TYPE, RULE_TYPES, Finding

_EXCERPT_CONTEXT = 40


class RuleValidationError(ValueError):
    pass


def validate_rule_params(rule_type: str, params: dict[str, Any]) -> dict[str, Any]:
    """Validate + normalise params for a rule type. Returns params with defaults filled in."""
    rt = RULE_TYPES.get(rule_type)
    if rt is None:
        raise RuleValidationError(f"Unknown rule type '{rule_type}'. Known: {', '.join(RULE_TYPES)}")
    try:
        return rt.params_model.model_validate(params).model_dump()
    except ValueError as exc:
        raise RuleValidationError(str(exc)) from exc


def run_rules(rules: list[Rule], blocks: list[Block], llm: LlmProvider | None) -> tuple[list[Violation], ReportSummary]:
    """Run every rule against the document. Raises LlmError if the LLM call fails."""
    findings: dict[int, list[Finding]] = {}

    llm_rules = [r for r in rules if r.type == LLM_RULE_TYPE]
    if llm_rules:
        if llm is None:
            raise RuleValidationError("AI rules need an LLM provider, but none is configured.")
        findings.update(
            check_llm_rules(
                llm,
                [LlmRule(r.id, r.name, r.params["instruction"]) for r in llm_rules],
                blocks,
            )
        )

    for rule in rules:
        rt = RULE_TYPES.get(rule.type)
        if rt is None or rt.check is None:
            continue
        findings[rule.id] = list(rt.check(rt.params_model.model_validate(rule.params), blocks))

    by_id = {b.id: b for b in blocks}
    violations: list[Violation] = []
    for rule in rules:
        for i, f in enumerate(findings.get(rule.id, [])):
            block = by_id.get(f.block_id) if f.block_id is not None else None
            violations.append(
                Violation(
                    id=f"{rule.id}-{i}",
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=f.message,
                    block_id=f.block_id,
                    start=f.start,
                    end=f.end,
                    excerpt=_excerpt(block, f.start, f.end),
                    location=_location(block),
                )
            )

    violations.sort(key=lambda v: (v.block_id is not None, v.block_id or 0, v.start or 0))
    summary = ReportSummary(
        total=len(violations),
        by_severity=dict(Counter(v.severity for v in violations)),
        rules_checked=len(rules),
    )
    return violations, summary


def _excerpt(block: Block | None, start: int | None, end: int | None) -> str:
    if block is None:
        return ""
    if start is None or end is None:
        return block.text[: _EXCERPT_CONTEXT * 2]
    lo = max(0, start - _EXCERPT_CONTEXT)
    hi = min(len(block.text), end + _EXCERPT_CONTEXT)
    return ("…" if lo > 0 else "") + block.text[lo:hi] + ("…" if hi < len(block.text) else "")


def _location(block: Block | None) -> str:
    if block is None:
        return "Whole document"
    parts = [block.label]
    if block.heading_context:
        parts.append(f'under "{block.heading_context}"')
    return ", ".join(parts)
