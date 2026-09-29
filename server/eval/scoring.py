"""Score AI findings against labelled quotes.

A label and a finding match when they are in the same block and their character spans overlap.
A finding without a span (the model's quote wasn't found in the text) matches a label of its rule
anywhere in its block. It is counted, and also reported as "unlocated", because the UI can only
flag the whole paragraph for it.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from app.rules.finding import Finding
from app.rules.llm_check import find_span
from app.schemas import Block

from .dataset import EvalDoc


@dataclass(frozen=True)
class Label:
    rule_id: int | None  # None for traps (no rule may flag them)
    kind: str  # "expected" | "optional" | "trap"
    quote: str
    block_id: int
    start: int
    end: int


@dataclass
class RuleScore:
    expected: int = 0
    caught: int = 0
    findings: int = 0
    true_positives: int = 0
    optional_hits: int = 0
    false_positives: int = 0

    @property
    def recall(self) -> float | None:
        return self.caught / self.expected if self.expected else None

    @property
    def precision(self) -> float | None:
        judged = self.true_positives + self.false_positives
        return self.true_positives / judged if judged else None


@dataclass
class DocResult:
    name: str
    missed: list[Label] = field(default_factory=list)
    false_positives: list[tuple[int, str]] = field(default_factory=list)  # (rule id, flagged text)
    trap_hits: list[tuple[int, str]] = field(default_factory=list)
    unlocated: int = 0


class LabelError(ValueError):
    """A label's quote doesn't occur in the built document (a dataset bug)."""


def locate_labels(doc: EvalDoc, blocks: list[Block]) -> list[Label]:
    labels: list[Label] = []
    groups: list[tuple[int | None, str, list[str]]] = [
        *((rule_id, "expected", quotes) for rule_id, quotes in doc.expected.items()),
        *((rule_id, "optional", quotes) for rule_id, quotes in doc.optional.items()),
        (None, "trap", doc.traps),
    ]
    for rule_id, kind, quotes in groups:
        for quote in quotes:
            for block in blocks:
                span = find_span(block.text, quote)
                if span:
                    labels.append(Label(rule_id, kind, quote, block.id, *span))
                    break
            else:
                raise LabelError(f"{doc.name}: label {quote!r} not found in the document")
    return labels


def _overlaps(label: Label, finding: Finding) -> bool:
    if finding.block_id != label.block_id:
        return False
    if finding.start is None or finding.end is None:
        return True  # unlocated finding: whole block
    return finding.start < label.end and label.start < finding.end


def score_document(
    doc: EvalDoc,
    blocks: list[Block],
    findings: dict[int, list[Finding]],
    scores: dict[int, RuleScore],
) -> DocResult:
    """Adds this document's counts to `scores` (per rule id) and returns its misses and false positives."""
    labels = locate_labels(doc, blocks)
    by_id = {b.id: b for b in blocks}
    result = DocResult(doc.name)

    for rule_id, rule_findings in findings.items():
        score = scores.setdefault(rule_id, RuleScore())
        expected = [lb for lb in labels if lb.rule_id == rule_id and lb.kind == "expected"]
        optional = [lb for lb in labels if lb.rule_id == rule_id and lb.kind == "optional"]
        traps = [lb for lb in labels if lb.kind == "trap"]

        score.expected += len(expected)
        caught = {id(lb) for lb in expected if any(_overlaps(lb, f) for f in rule_findings)}
        score.caught += len(caught)
        result.missed += [lb for lb in expected if id(lb) not in caught]

        for f in rule_findings:
            score.findings += 1
            if f.block_id is not None and (f.start is None or f.end is None):
                result.unlocated += 1
            text = _finding_text(f, by_id)
            if any(_overlaps(lb, f) for lb in expected):
                score.true_positives += 1
            elif any(_overlaps(lb, f) for lb in optional):
                score.optional_hits += 1
            else:
                score.false_positives += 1
                result.false_positives.append((rule_id, text))
                if any(_overlaps(lb, f) for lb in traps):
                    result.trap_hits.append((rule_id, text))
    return result


def _finding_text(f: Finding, by_id: dict[int, Block]) -> str:
    if f.block_id is None:
        return f"<document> {f.message}"
    block = by_id[f.block_id]
    if f.start is None or f.end is None:
        return f"<whole block> {block.text}"
    return block.text[f.start : f.end]


def totals(scores: dict[int, RuleScore]) -> RuleScore:
    total: defaultdict[str, int] = defaultdict(int)
    for s in scores.values():
        for name in ("expected", "caught", "findings", "true_positives", "optional_hits", "false_positives"):
            total[name] += getattr(s, name)
    return RuleScore(**total)
