import pytest

from app.rules import RuleValidationError, validate_rule_params
from app.rules.acronyms import AcronymParams, check_acronym_definitions

from .conftest import make_block, paragraphs, spans


def undefined(*texts: str, **params) -> list[str]:
    blocks = paragraphs(*texts)
    return spans(blocks, check_acronym_definitions(AcronymParams(**params), blocks))


@pytest.mark.parametrize(
    "text",
    [
        "The World Health Organization (WHO) published it. WHO says so.",
        "WHO (World Health Organization) published it.",
        "Data is stored as Extensible Markup Language (XML).",
        "The Department of Defense (DOD) approved it.",
        "Several Application Programming Interfaces (APIs) exist.",
        "The North Atlantic Treaty Organization ( NATO ) met.",
    ],
)
def test_defined_at_first_use(text):
    assert undefined(text) == []


def test_first_use_undefined_is_reported_once():
    blocks = paragraphs(
        "The API is fast.",
        "Application Programming Interface (API) is defined too late. The API again.",
    )
    findings = list(check_acronym_definitions(AcronymParams(), blocks))
    assert spans(blocks, findings) == ["API"]
    assert findings[0].block_id == 0
    assert "API" in findings[0].message


def test_each_acronym_reported_separately_in_order():
    assert undefined("NATO and the IAEA met.", "Then NATO left and SIPRI came.") == ["NATO", "IAEA", "SIPRI"]


@pytest.mark.parametrize(
    "text",
    [
        "The API (see below) is fast.",  # the parenthesis doesn't expand the acronym
        "Values are high (API).",  # the words before don't expand it
        "Remember (API) is not a definition.",
        "The API (APPLICATION PROGRAMMING INTERFACE) is shouted, not defined.",
    ],
)
def test_not_a_definition(text):
    assert undefined(text) == ["API"]


def test_plural_and_digits():
    assert undefined("Our APIs play MP3 files.") == ["API", "MP3"]


@pytest.mark.parametrize(
    "text",
    [
        "Print it on A4 paper in Q3 with an F16.",  # fewer than two letters
        "Phase II and Annex IV follow.",  # Roman numerals
        "The Falcon radar is a TOP SECRET prototype.",  # shouted text / markings
        "OK, send the PDF to the EU and the UK at 9 AM.",  # default ignore list
        "Loaded ABCDEFG from disk.",  # longer than max_length
        "Lowercase words, CamelCase and iPhone are not acronyms.",
    ],
)
def test_not_reported(text):
    assert undefined(text) == []


def test_ignore_list_and_length_bounds():
    assert undefined("NATO met the AU.", ignore=["nato"]) == ["AU"]
    assert undefined("NATO met the AU.", min_length=3) == ["NATO"]
    assert undefined("Loaded ABCDEFG.", max_length=7) == ["ABCDEFG"]


def test_headings_are_skipped():
    blocks = [
        make_block(0, "NATO Overview", "heading", heading_level=1),
        make_block(1, "The North Atlantic Treaty Organization (NATO) was founded in 1949."),
    ]
    assert list(check_acronym_definitions(AcronymParams(), blocks)) == []


def test_sample_document(sample_blocks):
    assert list(check_acronym_definitions(AcronymParams(), sample_blocks)) == []


def test_params_validation():
    assert validate_rule_params("acronym_definitions", {})["ignore"][:2] == ["OK", "PDF"]
    with pytest.raises(RuleValidationError):
        validate_rule_params("acronym_definitions", {"min_length": 5, "max_length": 3})
    with pytest.raises(RuleValidationError):
        validate_rule_params("acronym_definitions", {"min_length": 1})
