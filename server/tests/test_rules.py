import pytest

from app.models import Rule
from app.rules import RuleValidationError, run_rules, validate_rule_params

from .conftest import block_containing
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


def test_llm_rule_without_provider_fails(sample_blocks):
    with pytest.raises(RuleValidationError):
        run_rules([make_rule(1, "llm", {"instruction": "No numbers"})], sample_blocks, None)
