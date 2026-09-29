import pytest

from app.rules import RuleValidationError, validate_rule_params
from app.rules.pii import PiiParams, check_pii, luhn_valid

from .conftest import paragraphs, spans

B = chr(0x2022)  # the mask character


def find(text: str, **params) -> list[tuple[str, str]]:
    blocks = paragraphs(text)
    findings = list(check_pii(PiiParams(**params), blocks))
    return list(zip(spans(blocks, findings), [f.message for f in findings], strict=True))


@pytest.mark.parametrize(
    "text,value,message",
    [
        ("Contact john.doe@example.com today.", "john.doe@example.com", f"Email address (j{B * 3}@example.com)"),
        ("Mail: a_b+tag@mail.co.uk.", "a_b+tag@mail.co.uk", f"Email address (a{B * 3}@mail.co.uk)"),
        ("SSN 123-45-6789 on file.", "123-45-6789", f"Social security number ({B * 3}-{B * 2}-6789)"),
        ("Card 4111 1111 1111 1111 exp 12/25.", "4111 1111 1111 1111", f"Credit card number ({B * 4} 1111)"),
        ("Card 4111-1111-1111-1111.", "4111-1111-1111-1111", f"Credit card number ({B * 4} 1111)"),
        ("Card 5555555555554444.", "5555555555554444", f"Credit card number ({B * 4} 4444)"),
        ("Amex 3782 822463 10005.", "3782 822463 10005", f"Credit card number ({B * 4} 0005)"),
        ("Call (555) 234-5678 now.", "(555) 234-5678", f"Phone number (({B * 3}) {B * 3}-{B * 2}78)"),
        ("Call 555-234-5678.", "555-234-5678", f"Phone number ({B * 3}-{B * 3}-{B * 2}78)"),
        ("Call 555.234.5678.", "555.234.5678", f"Phone number ({B * 3}.{B * 3}.{B * 2}78)"),
        ("Call 1-800-555-0199.", "1-800-555-0199", f"Phone number ({B}-{B * 3}-{B * 3}-{B * 2}99)"),
        ("Call +1 (555) 234-5678.", "+1 (555) 234-5678", f"Phone number (+{B} ({B * 3}) {B * 3}-{B * 2}78)"),
        ("London +44 20 7946 0958.", "+44 20 7946 0958", f"Phone number (+{B * 2} {B * 2} {B * 4} {B * 2}58)"),
        ("Mobile +972-50-123-4567.", "+972-50-123-4567", f"Phone number (+{B * 3}-{B * 2}-{B * 3}-{B * 2}67)"),
        ("Mobile +972501234567.", "+972501234567", f"Phone number (+{B * 10}67)"),
        ("Office 020 7946 0958.", "020 7946 0958", f"Phone number ({B * 3} {B * 4} {B * 2}58)"),
        ("Office 03-1234567.", "03-1234567", f"Phone number ({B * 2}-{B * 5}67)"),
    ],
)
def test_detects_and_masks(text, value, message):
    assert find(text) == [(value, message)]


@pytest.mark.parametrize(
    "text",
    [
        "The maximum detection range is 50 km and the tracking accuracy is 3 m.",
        "Released 2024-01-15, reviewed 15/01/2024 and 01.02.2024, at 12:30:45.",
        "Upgrade from version 10.2.33.4411 to v1.2.3 (build 2024.10.15).",
        "Budget 1,250,000 USD for 8 000 000 users; 3.14159265 is pi.",
        "Server 192.168.100.200 on port 8080.",
        "ISBN 978-3-16-148410-0.",
        "Invoice 5552345678 and order 123456789.",  # plain numbers: no separators
        "Card 4111 1111 1111 1112 fails the checksum.",
        "Number 1234 5678 9012 3456 has no card prefix.",
        "Never issued: 000-12-3456, 666-12-3456, 900-12-3456, 123-00-4567.",
        "Not an address: user@localhost or @handle.",
        "Numbers 100 200 3000 and 555-0199.",
    ],
)
def test_no_false_positives(text):
    assert find(text) == []


def test_ssn_is_not_reported_as_phone():
    assert find("SSN 123-45-6789.", categories=["phone"]) == []


def test_card_and_email_digits_are_not_reported_as_phone():
    text = "Card 4111 1111 1111 1111, mail 555-234-5678@example.com"
    assert find(text, categories=["phone"]) == []


def test_categories_filter():
    text = "Mail jane@example.com or call 555-234-5678."
    assert [v for v, _ in find(text, categories=["email"])] == ["jane@example.com"]
    assert [v for v, _ in find(text, categories=["phone"])] == ["555-234-5678"]


def test_findings_are_in_text_order():
    text = "Call 555-234-5678 or mail jane@example.com, SSN 123-45-6789."
    assert [v for v, _ in find(text)] == ["555-234-5678", "jane@example.com", "123-45-6789"]


def test_sample_document_has_no_pii(sample_blocks):
    assert list(check_pii(PiiParams(), sample_blocks)) == []


def test_luhn():
    assert luhn_valid("4111111111111111")
    assert luhn_valid("378282246310005")
    assert not luhn_valid("4111111111111112")


def test_params_default_and_validation():
    assert validate_rule_params("pii", {})["categories"] == ["ssn", "phone", "email", "credit_card"]
    with pytest.raises(RuleValidationError):
        validate_rule_params("pii", {"categories": []})
    with pytest.raises(RuleValidationError):
        validate_rule_params("pii", {"categories": ["passport"]})
