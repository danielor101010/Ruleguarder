"""Personal data (PII) detection: US social security numbers, phone numbers, emails, credit cards.

Deliberately conservative: every pattern needs the structure the value is normally written
with (dashes in an SSN, separators or a "+" in a phone number, a valid Luhn checksum and
card prefix for a credit card), so dates, version numbers, plain quantities ("50 km") and
IDs are not reported. Values are masked in the messages - the report must not become a
second copy of the personal data.
"""

import re
from collections.abc import Callable, Iterable
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas import Block
from .finding import Finding

PiiCategory = Literal["ssn", "phone", "email", "credit_card"]
PII_CATEGORIES: tuple[PiiCategory, ...] = ("ssn", "phone", "email", "credit_card")

_MASK = chr(0x2022)  # bullet


class PiiParams(BaseModel):
    categories: list[PiiCategory] = Field(
        default_factory=lambda: list(PII_CATEGORIES),
        min_length=1,
        title="Categories",
        description="Kinds of personal data to flag.",
    )


# ---------- patterns ----------

_EMAIL_RE = re.compile(r"(?<![\w.%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])")

# US SSN, dashed form only: an undashed 9-digit number is far more often an ID or an amount.
# Area 000/666/9xx, group 00 and serial 0000 are never issued.
_SSN_RE = re.compile(r"(?<![\w-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\w-])")

# 13-19 digits written as one number, in groups of 4 (4-4-4-x) or Amex/Diners style (4-6-5, 4-6-4),
# with one kind of separator. Fixed grouping keeps a following number ("... 1111 12/25") out.
_CARD_RE = re.compile(r"(?<![\w-])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{4,5})(?![\w-])")

# Phone formats. Each needs separators, a "+" or a trunk "0" so plain numbers don't match.
_PHONE_RES = [
    # International: +CC then 2-6 groups, e.g. +44 20 7946 0958, +1 (555) 123-4567, +972501234567
    re.compile(r"(?<![\w+])\+\d{1,3}(?:[ .-]?(?:\(\d{1,4}\)|\d{1,4})){2,6}(?!\w|[.-]\d)"),
    # North American: (555) 123-4567, 555-123-4567, 555.123.4567, 1-555-123-4567
    re.compile(r"(?<![\w.+-])(?:1[ .-])?(?:\([2-9]\d{2}\)[ ]?|[2-9]\d{2}[ .-])[2-9]\d{2}[ .-]\d{4}(?!\w|[.-]\d)"),
    # National with trunk prefix 0: 020 7946 0958, 03-1234567, 050-123-4567
    re.compile(r"(?<![\w.+-])0\d{1,3}[ -]\d{3,4}(?:[ -]?\d{3,4})?(?!\w|[.-]\d)"),
]

_CARD_PREFIX_RE = re.compile(
    r"^(?:4"  # Visa
    r"|5[0-9]"  # Mastercard, Maestro
    r"|2(?:2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720)"  # Mastercard 2221-2720
    r"|220[0-4]"  # Mir
    r"|3[0-8]"  # Amex, Diners, JCB
    r"|6)"  # Discover, UnionPay, Maestro
)


# ---------- validation + masking ----------


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def luhn_valid(number: str) -> bool:
    """Luhn (mod 10) checksum used by every payment card number."""
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def _card_number(text: str) -> bool:
    digits = _digits(text)
    return 13 <= len(digits) <= 19 and bool(_CARD_PREFIX_RE.match(digits)) and luhn_valid(digits)


def _phone_number(text: str) -> bool:
    count = len(_digits(text))
    return 8 <= count <= 15 if text.startswith("+") else 9 <= count <= 11


def _mask_keep_last(text: str, keep: int) -> str:
    """Replace every digit except the last `keep` ones; separators and "+" stay readable."""
    remaining = len(_digits(text))
    out = []
    for ch in text:
        if ch.isdigit():
            out.append(ch if remaining <= keep else _MASK)
            remaining -= 1
        else:
            out.append(ch)
    return "".join(out)


def _mask_email(text: str) -> str:
    local, domain = text.split("@", 1)
    return f"{local[0]}{_MASK * 3}@{domain}"


def _mask_card(text: str) -> str:
    return f"{_MASK * 4} {_digits(text)[-4:]}"


# ---------- checker ----------

_Detector = tuple[list[re.Pattern[str]], Callable[[str], bool], str, Callable[[str], str]]

# Order matters: a span claimed by an earlier category is not reported again by a later one
# (e.g. digits inside an email address, or a card number that also looks like a phone number).
_DETECTORS: dict[PiiCategory, _Detector] = {
    "email": ([_EMAIL_RE], lambda _: True, "Email address", _mask_email),
    "credit_card": ([_CARD_RE], _card_number, "Credit card number", _mask_card),
    "ssn": ([_SSN_RE], lambda _: True, "Social security number", lambda t: _mask_keep_last(t, 4)),
    "phone": (_PHONE_RES, _phone_number, "Phone number", lambda t: _mask_keep_last(t, 2)),
}


def check_pii(params: PiiParams, blocks: list[Block]) -> Iterable[Finding]:
    wanted = set(params.categories)
    for block in blocks:
        taken: list[tuple[int, int]] = []
        found: list[Finding] = []
        for category, (patterns, valid, label, mask) in _DETECTORS.items():
            for pattern in patterns:
                for m in pattern.finditer(block.text):
                    start, end = m.span()
                    if any(start < e and s < end for s, e in taken) or not valid(m.group(0)):
                        continue
                    # Claim the span even for an unwanted category, so e.g. a card number is
                    # not reported as a phone number when only phones are checked.
                    taken.append((start, end))
                    if category in wanted:
                        found.append(Finding(f"{label} ({mask(m.group(0))})", block.id, start, end))
        yield from sorted(found, key=lambda f: f.start or 0)
