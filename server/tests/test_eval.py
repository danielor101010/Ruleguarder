"""The evaluation harness itself: dataset validity and scoring, with a fake provider (no LLM calls)."""

import pytest

from app.llm import LlmViolation
from app.rules.finding import Finding
from app.rules.llm_check import check_llm_rules
from eval.dataset import ARCH, DOCS, PERF, EvalDoc
from eval.run import build_blocks, main
from eval.scoring import LabelError, RuleScore, locate_labels, score_document, totals


@pytest.mark.parametrize("doc", DOCS, ids=lambda d: d.name)
def test_every_label_occurs_in_its_document(doc: EvalDoc):
    labels = locate_labels(doc, build_blocks(doc))
    assert len(labels) == sum(map(len, doc.expected.values())) + sum(map(len, doc.optional.values())) + len(doc.traps)


def test_dataset_shape():
    assert {d.language for d in DOCS} == {"en", "he"}
    assert any(not d.expected for d in DOCS), "needs a clean document (precision on no-violation text)"
    assert sum(len(d.traps) for d in DOCS) >= 15
    assert len({d.name for d in DOCS}) == len(DOCS)


def test_missing_label_is_a_dataset_error():
    doc = EvalDoc("bad", "en", "T", ["Some text."], expected={PERF.id: ["not in the text"]})
    with pytest.raises(LabelError):
        locate_labels(doc, build_blocks(doc))


RADAR = next(d for d in DOCS if d.name == "radar_overview")


def _findings_for(doc: EvalDoc, quotes: list[str], rule_id: int = PERF.id) -> dict[int, list[Finding]]:
    """Findings located exactly like the real pipeline, from a fake model that returns `quotes`."""
    blocks = build_blocks(doc)

    class Fake:
        def find_violations(self, rules, chunk):
            out = []
            for quote in quotes:
                block = next(b for b in chunk if quote in b.text)
                out.append(LlmViolation(rule_id, block.id, quote, "fake"))
            return out

    return check_llm_rules(Fake(), [PERF, ARCH], blocks)


def test_perfect_answers_score_100_percent():
    scores: dict[int, RuleScore] = {}
    findings = _findings_for(RADAR, ["85 km", "every 2 seconds", "accuracy of 3 meters"])
    result = score_document(RADAR, build_blocks(RADAR), findings, scores)
    assert scores[PERF.id].recall == 1.0
    assert scores[PERF.id].precision == 1.0
    assert result.missed == [] and result.false_positives == []


def test_misses_and_trap_hits_are_reported():
    scores: dict[int, RuleScore] = {}
    findings = _findings_for(RADAR, ["85 km", "2021"])
    result = score_document(RADAR, build_blocks(RADAR), findings, scores)
    s = scores[PERF.id]
    assert (s.caught, s.expected) == (1, 3)
    assert (s.true_positives, s.false_positives) == (1, 1)
    assert s.precision == 0.5
    assert [lb.quote for lb in result.missed] == ["every 2 seconds", "positional accuracy of 3 meters"]
    assert result.trap_hits == [(PERF.id, "2021")]


def test_partial_overlap_counts_as_caught():
    scores: dict[int, RuleScore] = {}
    # The model quoted the whole sentence; the label is part of it
    findings = _findings_for(RADAR, ["The maximum detection range is 85 km against small aerial targets."])
    score_document(RADAR, build_blocks(RADAR), findings, scores)
    assert scores[PERF.id].caught == 1


def test_optional_labels_count_neither_way():
    doc = next(d for d in DOCS if d.name == "archive_storage")
    scores: dict[int, RuleScore] = {}
    findings = _findings_for(doc, ["400 TB", "30 days"])
    score_document(doc, build_blocks(doc), findings, scores)
    s = scores[PERF.id]
    assert (s.true_positives, s.optional_hits, s.false_positives) == (1, 1, 0)


def test_unlocated_finding_matches_its_block():
    blocks = build_blocks(RADAR)
    block = next(b for b in blocks if "85 km" in b.text)
    scores: dict[int, RuleScore] = {}
    result = score_document(RADAR, blocks, {PERF.id: [Finding("whole block", block.id)]}, scores)
    assert scores[PERF.id].caught == 1
    assert result.unlocated == 1


def test_totals_sum_rules():
    t = totals(
        {
            1: RuleScore(expected=4, caught=3, true_positives=3, false_positives=1),
            2: RuleScore(expected=2, caught=2, true_positives=2),
        }
    )
    assert (t.caught, t.expected) == (5, 6)
    assert t.precision == 5 / 6


def test_plan_only_by_default_makes_no_llm_call(capsys, monkeypatch):
    def forbidden():
        raise AssertionError("the plan must not create an LLM provider")

    monkeypatch.setattr("eval.run.get_llm_provider", forbidden)
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "API calls: 10" in out
    assert "Plan only" in out


def test_run_needs_confirmation_when_not_interactive(monkeypatch):
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    with pytest.raises(SystemExit):
        main(["--run"])


def test_unknown_document_is_rejected():
    with pytest.raises(SystemExit):
        main(["--docs", "nope"])
