"""Parser coverage beyond body paragraphs (M4)."""

from pathlib import Path

import pytest

from app.docx_parser import parse_docx
from app.models import Rule
from app.rules import run_rules, validate_rule_params
from app.schemas import Block

from . import parts_doc as P


@pytest.fixture(scope="module")
def blocks(tmp_path_factory: pytest.TempPathFactory) -> list[Block]:
    path = P.build_parts_docx(tmp_path_factory.mktemp("parts") / "parts.docx")
    return parse_docx(str(Path(path)))


def only(blocks: list[Block], text: str) -> Block:
    matches = [b for b in blocks if text in b.text]
    assert len(matches) == 1, f"{text!r} found {len(matches)} times: {[b.label for b in matches]}"
    return matches[0]


def test_headers_and_footers(blocks):
    header = only(blocks, P.HEADER)
    assert (header.part, header.label) == ("header", "Header (section 1)")
    assert only(blocks, P.FIRST_PAGE_HEADER).label == "First-page header (section 1)"
    footer = only(blocks, P.FOOTER)
    assert (footer.part, footer.label) == ("footer", "Footer (section 1)")
    # Section 2's header/footer are linked to section 1: no second copy
    assert not any("section 2" in b.label for b in blocks)


def test_footnotes_and_endnotes(blocks):
    note = only(blocks, P.FOOTNOTE_1)
    assert (note.part, note.label) == ("footnote", "Footnote 1")
    assert only(blocks, P.FOOTNOTE_2).label == "Footnote 2"
    end = only(blocks, P.ENDNOTE)
    assert (end.part, end.label) == ("endnote", "Endnote 1")
    # Separator notes carry no text and are skipped
    assert sum(b.part == "footnote" for b in blocks) == 2


def test_text_box_read_once_right_after_its_paragraph(blocks):
    box = only(blocks, P.TEXT_BOX)
    holder = blocks[box.id - 1]
    assert holder.text == "Paragraph with a box."
    assert box.part == "textbox"
    assert box.label == f"Text box 1 in {holder.label}"
    assert box.heading_context == "Design"


def test_nested_table_cells_keep_the_outer_position(blocks):
    cell = only(blocks, P.NESTED_CELL)
    assert cell.kind == "table_cell"
    assert (cell.table_index, cell.row, cell.col) == (1, 1, 2)
    assert cell.label == "Table 1, row 1, column 2, nested table 1, row 1, column 1"


def test_hyperlink_and_field_text_are_part_of_the_paragraph(blocks):
    link = only(blocks, P.LINK_TEXT)
    assert link.text == f"See {P.LINK_TEXT} for details."
    assert only(blocks, "Block diagram").text == P.CAPTION


def test_body_order_and_offsets(blocks):
    body = [b for b in blocks if b.part in ("body", "textbox")]
    others = [b for b in blocks if b.part not in ("body", "textbox")]
    assert blocks == body + others, "body (with its text boxes) comes first, then headers/footers and notes"
    assert [b.id for b in blocks] == list(range(len(blocks)))
    for block in blocks:
        assert "".join(r.text for r in block.runs) == block.text
        for run in block.runs:
            assert block.text[run.start : run.end] == run.text


def test_rules_find_violations_in_every_part(blocks):
    rule = Rule(
        id=1,
        name="Markings",
        type="forbidden_text",
        severity="high",
        params=validate_rule_params("forbidden_text", {"pattern": "TOP SECRET", "case_sensitive": True}),
    )
    violations, _ = run_rules([rule], blocks, None)
    assert sorted(v.location.split(",")[0] for v in violations) == sorted(
        ["Header (section 1)", "Footnote 1", "Endnote 1", "Text box 1 in Paragraph 3", "Table 1"]
    )


def test_seq_caption_number_counts_as_a_figure(blocks):
    rule = Rule(
        id=2,
        name="Refs",
        type="cross_references",
        severity="medium",
        params=validate_rule_params("cross_references", {}),
    )
    violations, _ = run_rules([rule], blocks, None)
    # Figure 1 exists (its number is a field result); Figure 2 doesn't
    assert [v.message for v in violations] == ["Reference to Figure 2: no such figure in the document"]


def test_documents_parsed_before_parts_existed_still_load():
    old = Block.model_validate({"id": 0, "kind": "paragraph", "text": "x", "label": "Paragraph 1"})
    assert old.part == "body"
