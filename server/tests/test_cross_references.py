import pytest

from app.docx_parser import parse_docx
from app.rules import RuleValidationError, validate_rule_params
from app.rules.cross_references import CrossReferenceParams, check_cross_references
from app.schemas import Block

from .conftest import make_block, spans
from .sample_doc import build_references_docx


def heading(block_id: int, text: str, level: int) -> Block:
    return make_block(block_id, text, "heading", heading_level=level)


def table_cell(block_id: int, text: str, table: int) -> Block:
    return make_block(block_id, text, "table_cell", table_index=table, row=1, col=1)


# Title, then headings with Word auto-numbering (not in the text): 1, 2, 2.1, 2.1.1, 3
DOC = [
    heading(0, "System Overview", 0),
    heading(1, "Introduction", 1),
    heading(2, "Design", 1),
    heading(3, "Architecture", 2),
    heading(4, "Details", 3),
    heading(5, "Results", 1),
    make_block(6, "Radar block diagram", style="Caption"),
    make_block(7, "Figure 2: Antenna"),
    table_cell(8, "Range", 1),
    make_block(9, "Table 1 - Parameters"),
    table_cell(10, "Speed", 2),
]


def broken(*texts: str, doc: list[Block] = DOC, **params) -> list[str]:
    blocks = doc + [make_block(len(doc) + i, t) for i, t in enumerate(texts)]
    return spans(blocks, check_cross_references(CrossReferenceParams(**params), blocks))


@pytest.mark.parametrize(
    "text",
    [
        "See Section 1, Section 2.1, section 2.1.1 and SECTION 3.",
        "As shown in Figure 1 (a numberless caption) and Fig. 2.",
        "Values are in Table 1 and table 2 (the second table).",
        "See Sec. 2 and Secs. 1-3 and Figs. 1 and 2.",
        "Sections 1, 2 and 3 cover it; Tables 1 to 2 list it.",
        "Section 5 of the ISO 9001 standard is external.",
    ],
)
def test_existing_targets(text):
    assert broken(text) == []


def test_missing_targets_are_reported_with_exact_spans():
    assert broken("See Section 4, Figure 3, Table 3, fig. 9, Fig 8 and sec. 2.2.") == [
        "Section 4",
        "Figure 3",
        "Table 3",
        "fig. 9",
        "Fig 8",
        "sec. 2.2",
    ]


def test_messages_name_kind_and_number():
    blocks = [*DOC, make_block(99, "See Figure 7.")]
    [finding] = check_cross_references(CrossReferenceParams(), blocks)
    assert finding.message == "Reference to Figure 7: no such figure in the document"
    assert finding.block_id == 99


def test_lists_and_ranges_flag_each_missing_number():
    assert broken("Figures 1, 4 and 5 and Tables 2-3.") == ["4", "5", "3"]


def test_figure_by_caption_label():
    doc = [make_block(0, "Figure 7: Orphan caption"), make_block(1, "Figure 3-1. Chapter numbering")]
    assert broken("See Figure 7 and Figure 3-1.", doc=doc) == []
    # The caption's own label is not a reference, later references in it are
    assert broken(doc=[make_block(0, "Figure 7: Same as Figure 8")]) == ["Figure 8"]


def test_a_sentence_starting_with_figure_is_not_a_caption():
    assert broken(doc=[make_block(0, "Figure 4 shows the architecture.")]) == ["Figure 4"]


def test_explicit_heading_numbers():
    doc = [heading(0, "3.2 Results", 1), heading(1, "Section 7: Annex", 1)]
    # "3" is implied by "3.2"; computed outline numbers are 1 and 2
    assert broken("See Section 3.2, Section 3, Section 7, Section 2 and Section 4.", doc=doc) == ["Section 4"]


def test_heading_label_is_not_a_reference():
    assert broken(doc=[heading(0, "Section 9 Scope", 1)]) == []


def test_skipped_heading_level_counts_as_zero():
    doc = [heading(0, "Scope", 1), heading(1, "Deep", 3)]
    assert broken("See Section 1.0.1 and Section 1.1.", doc=doc) == ["Section 1.1"]


def test_reference_to_this_document_is_checked():
    assert broken("Section 5 of this document and Section 6 of the report.") == ["Section 5", "Section 6"]


def test_kinds_filter():
    text = "See Section 9, Figure 9 and Table 9."
    assert broken(text, kinds=["figure"]) == ["Figure 9"]
    assert broken(text, kinds=["section", "table"]) == ["Section 9", "Table 9"]


def test_parsed_docx(tmp_path):
    blocks = parse_docx(str(build_references_docx(tmp_path / "refs.docx")))
    findings = list(check_cross_references(CrossReferenceParams(), blocks))
    assert spans(blocks, findings) == ["Section 3", "Figure 2", "Table 2"]


def test_sample_document(sample_blocks):
    assert list(check_cross_references(CrossReferenceParams(), sample_blocks)) == []


def test_params_validation():
    assert validate_rule_params("cross_references", {})["kinds"] == ["section", "figure", "table"]
    with pytest.raises(RuleValidationError):
        validate_rule_params("cross_references", {"kinds": []})
