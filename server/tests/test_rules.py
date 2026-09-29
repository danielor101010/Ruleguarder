import time

import pytest

from app.llm import LlmError
from app.models import Rule
from app.rules import RULE_TYPES, RuleValidationError, registry, run_rules, validate_rule_params
from app.schemas import ReportSummary

from .conftest import block_containing, paragraphs
from .sample_doc import INTRO, LONG_SENTENCE, WRONG_FONT


def make_rule(rule_id: int, type_: str, params: dict, severity: str = "high") -> Rule:
    return Rule(
        id=rule_id,
        name=f"rule {rule_id}",
        type=type_,
        params=validate_rule_params(type_, params),
        severity=severity,
        enabled=True,
    )


def highlighted(blocks, violation) -> str:
    block = next(b for b in blocks if b.id == violation.block_id)
    return block.text[violation.start : violation.end]


def test_forbidden_text_is_located(sample_blocks):
    violations, summary = run_rules([make_rule(1, "forbidden_text", {"pattern": "top secret"})], sample_blocks, None)
    assert summary.total == 1
    v = violations[0]
    assert highlighted(sample_blocks, v) == "TOP SECRET"
    assert v.block_id == block_containing(sample_blocks, INTRO).id
    assert 'under "Introduction"' in v.location


def test_required_text_missing_is_document_level(sample_blocks):
    violations, _ = run_rules([make_rule(1, "required_text", {"pattern": "Revision history"})], sample_blocks, None)
    assert len(violations) == 1
    assert violations[0].block_id is None
    assert violations[0].location == "Whole document"


def test_required_text_present(sample_blocks):
    violations, _ = run_rules([make_rule(1, "required_text", {"pattern": "falcon"})], sample_blocks, None)
    assert violations == []


def test_max_sentence_words(sample_blocks):
    violations, _ = run_rules([make_rule(1, "max_sentence_words", {"max_words": 25})], sample_blocks, None)
    assert [highlighted(sample_blocks, v) for v in violations] == [LONG_SENTENCE]


def test_allowed_fonts_flags_only_other_fonts(sample_blocks):
    violations, _ = run_rules([make_rule(1, "allowed_fonts", {"fonts": ["Calibri"]})], sample_blocks, None)
    # Headings use the theme's heading font, so only look at the body paragraph
    body = [v for v in violations if v.block_id == block_containing(sample_blocks, WRONG_FONT).id]
    assert [highlighted(sample_blocks, v) for v in body] == [WRONG_FONT]
    assert "Comic Sans MS" in body[0].message


def test_font_size_range(sample_blocks):
    violations, _ = run_rules([make_rule(1, "font_size_range", {"min_pt": 12, "max_pt": 20})], sample_blocks, None)
    assert any(highlighted(sample_blocks, v) == INTRO for v in violations)


def test_severity_summary(sample_blocks):
    rules = [
        make_rule(1, "forbidden_text", {"pattern": "secret"}, "high"),
        make_rule(2, "forbidden_text", {"pattern": "radar"}, "medium"),
    ]
    _, summary = run_rules(rules, sample_blocks, None)
    assert summary.by_severity == {"high": 1, "medium": 1}
    assert summary.rules_checked == 2


@pytest.mark.parametrize(
    "type_,params",
    [
        ("forbidden_text", {"pattern": "(unclosed", "is_regex": True}),
        ("max_sentence_words", {"max_words": 0}),
        ("font_size_range", {"min_pt": 20, "max_pt": 10}),
        ("llm", {"instruction": ""}),
        ("no_such_type", {}),
    ],
)
def test_invalid_params_rejected(type_, params):
    with pytest.raises(RuleValidationError):
        validate_rule_params(type_, params)


# ---------- failure isolation: one rule that can't run never sinks the others ----------


def stored_rule(rule_id: int, type_: str, params: dict) -> Rule:
    """A rule as it may sit in the DB: params are NOT validated (e.g. saved under an older schema)."""
    return Rule(id=rule_id, name=f"rule {rule_id}", type=type_, params=params, severity="high", enabled=True)


def failed(summary) -> dict[int, str]:
    return {f.rule_id: f.error for f in summary.failed_rules}


def test_llm_rule_without_provider_is_reported_and_others_still_run(sample_blocks):
    rules = [make_rule(1, "llm", {"instruction": "No numbers"}), make_rule(2, "forbidden_text", {"pattern": "secret"})]
    violations, summary = run_rules(rules, sample_blocks, None)
    assert [v.rule_id for v in violations] == [2]
    assert "none is configured" in failed(summary)[1]
    assert summary.rules_checked == 1


def test_unavailable_ai_fails_only_the_ai_rules(sample_blocks):
    def provider():
        raise LlmError("All Gemini models are unavailable right now")

    rules = [make_rule(1, "llm", {"instruction": "No numbers"}), make_rule(2, "forbidden_text", {"pattern": "secret"})]
    violations, summary = run_rules(rules, sample_blocks, provider)
    assert [v.rule_id for v in violations] == [2]
    assert failed(summary) == {1: "All Gemini models are unavailable right now"}
    assert [f.rule_name for f in summary.failed_rules] == ["rule 1"]


def test_provider_is_not_created_without_ai_rules(sample_blocks):
    def provider():
        raise AssertionError("must not be called")

    _, summary = run_rules([make_rule(1, "forbidden_text", {"pattern": "secret"})], sample_blocks, provider)
    assert summary.failed_rules == []


def test_unexpected_ai_error_is_contained(sample_blocks):
    class Broken:
        def find_violations(self, rules, blocks):
            raise IndexError("boom")

    rules = [make_rule(1, "llm", {"instruction": "No numbers"}), make_rule(2, "forbidden_text", {"pattern": "secret"})]
    violations, summary = run_rules(rules, sample_blocks, Broken)
    assert [v.rule_id for v in violations] == [2]
    assert failed(summary) == {1: "Internal error while running the AI check."}


@pytest.mark.parametrize(
    "type_,params,expected",
    [
        ("acronym_definitions", {"max_length": 50}, "max_length"),  # limit added after the rule was saved
        ("llm", {}, "instruction"),
        ("no_such_type", {}, "Unknown rule type"),
    ],
)
def test_rule_with_invalid_stored_params_is_reported(sample_blocks, type_, params, expected):
    rules = [stored_rule(1, type_, params), make_rule(2, "forbidden_text", {"pattern": "secret"})]
    violations, summary = run_rules(rules, sample_blocks, None)
    assert [v.rule_id for v in violations] == [2]
    assert expected in failed(summary)[1]


def test_crashing_checker_is_contained(sample_blocks, monkeypatch):
    def crash(params, blocks):
        raise ZeroDivisionError

    monkeypatch.setattr(RULE_TYPES["max_paragraph_words"], "check", crash)
    rules = [
        make_rule(1, "max_paragraph_words", {"max_words": 5}),
        make_rule(2, "forbidden_text", {"pattern": "secret"}),
    ]
    violations, summary = run_rules(rules, sample_blocks, None)
    assert [v.rule_id for v in violations] == [2]
    assert failed(summary) == {1: "Internal error while checking this rule."}


@pytest.mark.parametrize("type_", ["forbidden_text", "required_text"])
def test_catastrophic_regex_is_stopped(monkeypatch, type_):
    monkeypatch.setattr(registry, "REGEX_TIMEOUT_SECONDS", 0.2)
    blocks = paragraphs("a" * 40 + "b", "a" * 40 + "b")
    # Exponential backtracking, also in the `regex` module (which optimises the classic "(a+)+$")
    rule = make_rule(1, type_, {"pattern": "(a|aa)+$", "is_regex": True})
    started = time.monotonic()
    _, summary = run_rules([rule], blocks, None)
    assert time.monotonic() - started < 5
    assert "took longer" in failed(summary)[1]


def test_old_reports_without_failed_rules_still_load():
    summary = ReportSummary.model_validate({"total": 0, "by_severity": {}, "rules_checked": 1})
    assert summary.failed_rules == []
