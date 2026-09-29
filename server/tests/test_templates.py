import pytest

from app.models import Rule
from app.rules import RULE_TYPES, run_rules, validate_rule_params
from app.rules.templates import RULE_TEMPLATES
from app.schemas import RuleTemplate

from .conftest import block_containing
from .sample_doc import INTRO


@pytest.mark.parametrize("template", RULE_TEMPLATES, ids=lambda t: t.id)
def test_template_rule_is_valid(template: RuleTemplate):
    assert template.rule.type in RULE_TYPES
    # Params are stored normalised: validating them again changes nothing
    assert validate_rule_params(template.rule.type, template.rule.params) == template.rule.params
    assert template.label and template.description


def test_ids_and_names_are_unique():
    assert len({t.id for t in RULE_TEMPLATES}) == len(RULE_TEMPLATES)
    # Names identify existing sample rules, so they must be unique too
    assert len({t.rule.name for t in RULE_TEMPLATES}) == len(RULE_TEMPLATES)


def test_sample_set():
    sample = {t.id: t for t in RULE_TEMPLATES if t.in_sample_set}
    assert set(sample) == {
        "pii-all",
        "classification-markings",
        "acronym-definitions",
        "cross-references",
        "max-sentence-40",
        "ai-no-performance-figures",
    }
    assert sample["pii-all"].rule.params["categories"] == ["ssn", "phone", "email", "credit_card"]
    assert sample["max-sentence-40"].rule.params["max_words"] == 40
    # The only AI rule is created disabled: running it spends LLM quota
    ai = [t for t in sample.values() if t.rule.type == "llm"]
    assert [t.id for t in ai] == ["ai-no-performance-figures"]
    assert ai[0].category == "ai"
    assert not ai[0].rule.enabled
    assert all(t.rule.enabled for t in sample.values() if t.rule.type != "llm")


def test_deterministic_samples_on_sample_document(sample_blocks):
    rules = [
        Rule(id=i, name=t.rule.name, type=t.rule.type, params=t.rule.params, severity=t.rule.severity, enabled=True)
        for i, t in enumerate(RULE_TEMPLATES, start=1)
        if t.in_sample_set and t.rule.type != "llm"
    ]
    assert len(rules) == 5
    violations, _ = run_rules(rules, sample_blocks, None)
    # The sample document has no PII, acronyms or cross-references, and its longest sentence has 37 words
    assert [v.rule_name for v in violations] == ["No classification markings"]
    assert violations[0].block_id == block_containing(sample_blocks, INTRO).id
