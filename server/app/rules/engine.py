import logging
from collections import Counter
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from ..llm import LlmError, LlmProvider, LlmRule
from ..models import Rule
from ..schemas import Block, FailedRule, ReportSummary, Violation
from .finding import Finding
from .llm_check import check_llm_rules
from .registry import REGEX_TIMEOUT_SECONDS, RULE_TYPES

log = logging.getLogger(__name__)

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


def run_rules(
    rules: list[Rule], blocks: list[Block], llm: Callable[[], LlmProvider] | None
) -> tuple[list[Violation], ReportSummary]:
    """Run every rule against the document.

    Each rule is isolated: a rule that can't be checked (AI unavailable, stored params no longer
    valid, a regex that runs too long, a checker bug) is listed in `summary.failed_rules`, and the
    other rules' results are still returned. `llm` creates the provider; it is only called when
    there are AI rules, so a missing API key fails those rules and nothing else.
    """
    findings: dict[int, list[Finding]] = {}
    failed: dict[int, str] = {}
    llm_rules: list[tuple[Rule, LlmRule]] = []

    for rule in rules:
        try:
            rt = RULE_TYPES.get(rule.type)
            if rt is None:
                raise _RuleCheckError(f"Unknown rule type '{rule.type}'.")
            params = _stored_params(rule, rt.params_model)
            if rt.check is None:
                llm_rules.append((rule, LlmRule(rule.id, rule.name, params.instruction)))
                continue
            findings[rule.id] = list(rt.check(params, blocks))
        except _RuleCheckError as exc:
            failed[rule.id] = str(exc)
        except TimeoutError:
            failed[rule.id] = (
                f"The check took longer than {REGEX_TIMEOUT_SECONDS:g} s and was stopped. "
                "Simplify the regular expression."
            )
        except Exception:
            log.exception("Rule %s (%s) failed", rule.id, rule.type)
            failed[rule.id] = "Internal error while checking this rule."

    if llm_rules:
        try:
            if llm is None:
                raise LlmError("AI rules need an LLM provider, but none is configured.")
            findings.update(check_llm_rules(llm(), [lr for _, lr in llm_rules], blocks))
        except LlmError as exc:
            failed.update({rule.id: str(exc) for rule, _ in llm_rules})
        except Exception:
            log.exception("AI rules failed")
            failed.update({rule.id: "Internal error while running the AI check." for rule, _ in llm_rules})

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
        rules_checked=len(rules) - len(failed),
        failed_rules=[FailedRule(rule_id=r.id, rule_name=r.name, error=failed[r.id]) for r in rules if r.id in failed],
    )
    return violations, summary


class _RuleCheckError(Exception):
    """A rule that can't run; the message is shown to the user."""


def _stored_params(rule: Rule, model: type[BaseModel]) -> Any:
    """Params as saved in the DB, validated again: a schema change can make an old rule invalid."""
    try:
        return model.model_validate(rule.params)
    except ValidationError as exc:
        details = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'params'}: {e['msg']}" for e in exc.errors())
        raise _RuleCheckError(f"This rule's settings are no longer valid ({details}). Edit and save the rule.") from exc


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
