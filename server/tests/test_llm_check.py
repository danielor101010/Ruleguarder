"""LLM pipeline tests with a fake provider (no network)."""

import pytest

from app.config import get_settings
from app.llm import LlmBlock, LlmRule, LlmViolation
from app.rules.llm_check import check_llm_rules, find_span

from .conftest import block_containing
from .sample_doc import PERFORMANCE


class FakeProvider:
    def __init__(self, answer):
        self.answer = answer  # callable(rules, blocks) -> list[LlmViolation]
        self.calls: list[list[LlmBlock]] = []

    def find_violations(self, rules, blocks):
        self.calls.append(blocks)
        return self.answer(rules, blocks)


RULE = LlmRule(7, "No performance figures", "No numeric figures that reveal system performance")


def test_quote_is_mapped_to_exact_offsets(sample_blocks):
    perf = block_containing(sample_blocks, PERFORMANCE)
    provider = FakeProvider(
        lambda rules, blocks: [
            LlmViolation(7, perf.id, "maximum detection range is 50 km", "Reveals range"),
            LlmViolation(7, perf.id, "tracking accuracy is 3 m", "Reveals accuracy"),
        ]
    )
    findings = check_llm_rules(provider, [RULE], sample_blocks)[7]
    assert [perf.text[f.start : f.end] for f in findings] == [
        "maximum detection range is 50 km",
        "tracking accuracy is 3 m",
    ]
    assert all(f.block_id == perf.id for f in findings)


def test_wrong_block_id_is_corrected_within_chunk(sample_blocks):
    perf = block_containing(sample_blocks, PERFORMANCE)
    provider = FakeProvider(lambda rules, blocks: [LlmViolation(7, 0, "50 km", "Reveals range")])
    [finding] = check_llm_rules(provider, [RULE], sample_blocks)[7]
    assert finding.block_id == perf.id
    assert perf.text[finding.start : finding.end] == "50 km"


def test_unfound_quote_flags_whole_block(sample_blocks):
    perf = block_containing(sample_blocks, PERFORMANCE)
    provider = FakeProvider(lambda rules, blocks: [LlmViolation(7, perf.id, "made-up text", "Hallucinated")])
    [finding] = check_llm_rules(provider, [RULE], sample_blocks)[7]
    assert (finding.block_id, finding.start, finding.end) == (perf.id, None, None)
    assert "made-up text" in finding.message


def test_document_level_and_unknown_rules(sample_blocks):
    provider = FakeProvider(
        lambda rules, blocks: [
            LlmViolation(7, None, "", "Missing classification banner"),
            LlmViolation(999, 1, "x", "rule that was not requested"),
        ]
    )
    findings = check_llm_rules(provider, [RULE], sample_blocks)
    assert set(findings) == {7}
    assert [(f.block_id, f.message) for f in findings[7]] == [(None, "Missing classification banner")]


def test_duplicates_are_removed(sample_blocks):
    perf = block_containing(sample_blocks, PERFORMANCE)
    dup = LlmViolation(7, perf.id, "50 km", "Reveals range")
    provider = FakeProvider(lambda rules, blocks: [dup, dup])
    assert len(check_llm_rules(provider, [RULE], sample_blocks)[7]) == 1


def test_long_documents_are_chunked(sample_blocks, monkeypatch):
    monkeypatch.setattr(get_settings(), "llm_chunk_chars", 100)
    provider = FakeProvider(lambda rules, blocks: [])
    check_llm_rules(provider, [RULE], sample_blocks)
    assert len(provider.calls) > 1
    sent = [b.id for chunk in provider.calls for b in chunk]
    assert sent == sorted(set(sent))  # every non-empty block sent once, in order
    assert all(b.text.strip() for chunk in provider.calls for b in chunk)


@pytest.mark.parametrize(
    "quote",
    [
        'range is 50 "km"',  # straight quotes vs curly quotes in the text
        "range  is\n50 “km”",  # extra whitespace
        "RANGE IS 50 “KM”",  # case
    ],
)
def test_find_span_normalises(quote):
    text = "The detection range is 50 “km” at sea."
    start, end = find_span(text, quote)
    assert text[start:end] == "range is 50 “km”"


def test_find_span_hebrew_gershayim():
    text = "טווח הגילוי המירבי הוא 50 ק״מ."
    start, end = find_span(text, 'הוא 50 ק"מ')
    assert text[start:end] == "הוא 50 ק״מ"


def test_find_span_missing():
    assert find_span("abc", "xyz") is None
