"""Cross-references ("see Section 3.2", "Fig. 4", "Table 2") must point at something that exists.

Targets:
- section: a heading whose text starts with the number ("3.2 Results", "Section 3.2: Results"),
  or whose computed outline number matches. Word's automatic heading numbering is not part
  of the paragraph text, so the outline number is recomputed from the heading levels
  (Title excluded). Numbers of explicitly numbered headings imply their parents ("3.2" => "3").
- figure: a caption - a paragraph in the "Caption" style, or one starting "Figure N" followed by
  a delimiter (":", ".", a dash) or nothing. A Caption-style paragraph without a number (Word's
  auto-number field is not always in the text) gets its position among the figure captions.
- table: a caption "Table N" (same rules), or simply the N-th table in the document.

A caption's own label ("Figure 4: Block diagram") is not a reference; later references in the
same caption are. References into other documents ("Section 5 of the ISO 9001 standard") are skipped.
"""

import re
from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas import Block
from .finding import Finding

RefKind = Literal["section", "figure", "table"]
REF_KINDS: tuple[RefKind, ...] = ("section", "figure", "table")

# "3.2", "3-1" (chapter-figure numbering); in a plural reference a hyphen is a range ("Tables 1-3")
_NUM = r"\d+(?:[.-]\d+)*"
_GAP = r"[ \t" + chr(0xA0) + "]*"  # spaces, tabs, no-break spaces
_DASHES = chr(0x2013) + chr(0x2014)  # en and em dash
# Keyword + first number, then optional list/range continuations ("Figures 2, 3 and 5", "Tables 1 to 3")
_REF_RE = re.compile(
    r"(?<![\w.])(?:(?P<section>sections?|secs?\.)|(?P<figure>figures?|figs?\.?)|(?P<table>tables?))"
    rf"{_GAP}(?P<first>{_NUM})(?![\w-])"
    rf"(?P<more>(?:\s*(?:[,&{_DASHES}]|\band\b|\bor\b|\bto\b)\s*{_NUM}(?![\w-]))*)",
    re.IGNORECASE,
)
_NUM_RE = re.compile(_NUM)
# "Section 5 of the ISO 9001 standard", "Section 230 of Title 47": a reference into another document
_EXTERNAL_RE = re.compile(r"\s+of\s+(?:the\s+)?(?!This\b)[A-Z]")
# A caption's label. Without the Caption style, the number must be followed by a delimiter or
# the end of the text, so a sentence like "Figure 4 shows ..." is a reference, not a caption.
_CAPTION_RE = re.compile(
    rf"^\s*(?:(?P<figure>figure|fig\.?)|(?P<table>table))"
    rf"(?:{_GAP}(?P<num>{_NUM})(?![\w-])(?P<delim>\s*(?:[:.{_DASHES}-]|$))?)?",
    re.IGNORECASE,
)
_HEADING_NUM_RE = re.compile(rf"^\s*(?:(?:section|sec\.|chapter){_GAP})?(?P<num>{_NUM})\.?(?![\w-])", re.IGNORECASE)

_LABELS: dict[RefKind, str] = {"section": "Section", "figure": "Figure", "table": "Table"}


class CrossReferenceParams(BaseModel):
    kinds: list[RefKind] = Field(
        default_factory=lambda: list(REF_KINDS),
        min_length=1,
        title="Reference kinds",
        description="Which kinds of references to check.",
    )


def _norm(number: str) -> str:
    """ "3.02" / "3-2" / "3.2." -> "3.2", so differently written numbers compare equal."""
    return ".".join(str(int(part)) for part in re.split(r"[.-]", number.strip(".-")))


def _caption(block: Block) -> tuple[RefKind, re.Match[str] | None] | None:
    """(kind, label match) if the block is a figure/table caption, else None."""
    if block.kind == "heading":
        return None
    m = _CAPTION_RE.match(block.text)
    is_caption_style = (block.style or "").strip().lower() == "caption"
    if m and (m.group("delim") is not None or (is_caption_style and m.group("num"))):
        return ("table" if m.group("table") else "figure"), m
    if is_caption_style:
        # Numberless caption: the kind still comes from its first word if it has one
        return ("table" if m and m.group("table") else "figure"), None
    return None


def _targets(blocks: list[Block]) -> dict[RefKind, set[str]]:
    targets: dict[RefKind, set[str]] = {kind: set() for kind in REF_KINDS}
    outline: list[int] = []
    caption_count: dict[RefKind, int] = {"figure": 0, "table": 0}
    table_count = 0

    for block in blocks:
        if block.table_index is not None:
            table_count = max(table_count, block.table_index)

        level = block.heading_level
        if block.kind == "heading" and level and block.text.strip():
            # Outline numbering: bump this level, drop deeper ones; skipped levels count as 0
            outline = (outline + [0] * level)[:level]
            outline[-1] += 1
            targets["section"].add(".".join(map(str, outline)))
            explicit = _HEADING_NUM_RE.match(block.text)
            if explicit:
                parts = _norm(explicit.group("num")).split(".")
                targets["section"].update(".".join(parts[:i]) for i in range(1, len(parts) + 1))
            continue

        caption = _caption(block)
        if caption:
            kind, m = caption
            caption_count[kind] += 1
            num = m.group("num") if m else None
            targets[kind].add(_norm(num) if num else str(caption_count[kind]))

    targets["table"].update(str(n) for n in range(1, table_count + 1))
    return targets


def _own_label_end(block: Block) -> int:
    """End of a caption's / heading's own label ("Figure 4", "Section 2"), which is not a reference."""
    caption = _caption(block)
    if caption and caption[1]:
        return caption[1].end("num") if caption[1].group("num") else -1
    if block.kind == "heading":
        own = _HEADING_NUM_RE.match(block.text)
        return own.end("num") if own else -1
    return -1


def _numbers(m: re.Match[str]) -> list[tuple[str, int, int]]:
    """Every (number, start, end) of a reference. The first span includes the keyword."""
    numbers = [(m.group("first"), m.start(), m.end("first"))]
    base = m.start("more")
    numbers += [(n.group(0), base + n.start(), base + n.end()) for n in _NUM_RE.finditer(m.group("more"))]
    keyword = m.group(0)[: m.start("first") - m.start()].strip().rstrip(".").lower()
    if not keyword.endswith("s"):
        return numbers
    # Plural: "Tables 1-3" is a range, so each side of a hyphen is its own number
    split: list[tuple[str, int, int]] = []
    for number, start, end in numbers:
        offset = end - len(number)
        for part in _NUM_RE.finditer(number.replace("-", " ")):
            split.append((part.group(0), start if part.start() == 0 else offset + part.start(), offset + part.end()))
    return split


def check_cross_references(params: CrossReferenceParams, blocks: list[Block]) -> Iterable[Finding]:
    wanted = set(params.kinds)
    targets = _targets(blocks)
    for block in blocks:
        label_end = _own_label_end(block)
        for m in _REF_RE.finditer(block.text):
            if m.end("first") <= label_end:
                continue
            kind: RefKind = next(k for k in REF_KINDS if m.group(k))
            if kind not in wanted or _EXTERNAL_RE.match(block.text, m.end()):
                continue
            for number, start, end in _numbers(m):
                if _norm(number) not in targets[kind]:
                    yield Finding(
                        f"Reference to {_LABELS[kind]} {number}: no such {kind} in the document",
                        block.id,
                        start,
                        end,
                    )
