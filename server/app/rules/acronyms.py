"""Acronyms must be defined at their first use: "Full Name (ABC)" or "ABC (Full Name)".

Only the first occurrence of each acronym is judged, and each acronym is reported at most once.
Headings are skipped (a style guide defines acronyms in the running text, not in titles), and
so are stretches of shouted text such as "TOP SECRET" or "DO NOT COPY".
"""

import re
from collections.abc import Iterable

from pydantic import BaseModel, Field, model_validator

from ..schemas import Block
from .finding import Finding

DEFAULT_IGNORED = ["OK", "PDF", "USA", "UK", "EU", "ID", "TV", "AM", "PM"]

# All-caps token, digits allowed after the first letter, optional plural "s" (APIs)
_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z][A-Z0-9]*)(s?)(?![A-Za-z0-9])")
_ROMAN_RE = re.compile(r"^[IVX]+$")
# Two or more consecutive all-caps words: a marking or shouted text, not acronyms
_SHOUTED_RE = re.compile(r"(?<![A-Za-z0-9])[A-Z]{2,}(?:[ \t]+[A-Z]{2,})+(?![A-Za-z0-9])")
# Words before "(ABC)" that may hold the full name; stops at sentence/clause punctuation
_NAME_BEFORE_RE = re.compile(r"([^.;:!?()\"]*)\(\s*$")
_WORD_RE = re.compile(r"[A-Za-z][\w'-]*")


class AcronymParams(BaseModel):
    min_length: int = Field(default=2, ge=2, le=20, title="Minimum length")
    max_length: int = Field(default=6, ge=2, le=20, title="Maximum length")
    ignore: list[str] = Field(
        default_factory=lambda: list(DEFAULT_IGNORED),
        title="Ignore",
        description="Acronyms that never need a definition.",
    )

    @model_validator(mode="after")
    def _ordered(self) -> "AcronymParams":
        if self.min_length > self.max_length:
            raise ValueError("min_length must be <= max_length")
        return self


def _is_expansion(acronym: str, words: list[str]) -> bool:
    """True if some word starts with the acronym's first letter and the rest of its letters
    follow in order: "Application Programming Interface" expands API, "see below" doesn't.
    An X may stand for "ex" (eXtensible Markup Language => XML)."""
    letters = [c for c in acronym.lower() if c.isalpha()]
    for i, word in enumerate(words):
        lower = word.lower()
        first = 0 if lower[0] == letters[0] else 1 if letters[0] == "x" and lower.startswith("ex") else -1
        if first < 0:
            continue
        rest = iter(" ".join(words[i:]).lower()[first + 1 :])
        if all(c in rest for c in letters[1:]):
            return True
    return False


def _defined_here(text: str, start: int, end: int, acronym: str) -> bool:
    # "Full Name (ABC)": the token is the whole parenthesis and the words before it expand it
    before = _NAME_BEFORE_RE.search(text[:start])
    if before and re.match(r"\s*\)", text[end:]):
        # A name has at most a few more words than letters ("Department of Defense (DoD)")
        words = _WORD_RE.findall(before.group(1))[-(len(acronym) * 2 + 2) :]
        if words and _is_expansion(acronym, words):
            return True
    # "ABC (Full Name)"
    after = re.match(r"\s*\(([^()]*)\)", text[end:])
    return bool(after and not after.group(1).isupper() and _is_expansion(acronym, _WORD_RE.findall(after.group(1))))


def check_acronym_definitions(params: AcronymParams, blocks: list[Block]) -> Iterable[Finding]:
    ignored = {a.strip().upper() for a in params.ignore}
    seen: set[str] = set()
    for block in blocks:
        if block.kind == "heading":
            continue
        shouted = [m.span() for m in _SHOUTED_RE.finditer(block.text)]
        for m in _TOKEN_RE.finditer(block.text):
            acronym = m.group(1)
            start, end = m.span()
            if (
                acronym in seen
                or acronym in ignored
                or not params.min_length <= len(acronym) <= params.max_length
                or sum(c.isalpha() for c in acronym) < 2  # "A4", "Q3", "F16" are names, not acronyms
                or _ROMAN_RE.match(acronym)
                or any(s <= start and end <= e for s, e in shouted)
            ):
                continue
            seen.add(acronym)
            if not _defined_here(block.text, start, end, acronym):
                yield Finding(
                    f'Acronym "{acronym}" is not defined at its first use '
                    f'(write "Full Name ({acronym})" or "{acronym} (Full Name)")',
                    block.id,
                    start,
                    start + len(acronym),
                )
