import io
import re
import zipfile

import pytest

from app.docx_parser import DocxParseError, parse_docx

from .conftest import block_containing
from .sample_doc import INTRO, WRONG_FONT


def test_blocks_are_in_document_order(sample_blocks):
    texts = [b.text for b in sample_blocks]
    assert texts.index("Introduction") < texts.index(INTRO) < texts.index("Performance")
    assert [b.id for b in sample_blocks] == list(range(len(sample_blocks)))


def test_headings_and_heading_context(sample_blocks):
    title = block_containing(sample_blocks, "System Overview")
    assert title.kind == "heading" and title.heading_level == 0

    intro = block_containing(sample_blocks, INTRO)
    assert intro.kind == "paragraph"
    assert intro.heading_context == "Introduction"
    assert intro.label.startswith("Paragraph ")


def test_table_cells_have_positions(sample_blocks):
    cell = block_containing(sample_blocks, "2 seconds")
    assert cell.kind == "table_cell"
    assert (cell.table_index, cell.row, cell.col) == (1, 2, 2)
    assert cell.label == "Table 1, row 2, column 2"
    assert cell.heading_context == "Performance"
    assert sum(b.table_index == 1 for b in sample_blocks) == 4


def test_merged_cells_emitted_once(sample_blocks):
    table2 = [b for b in sample_blocks if b.table_index == 2]
    assert [(b.text, b.col) for b in table2] == [("Merged heading", 1), ("Last", 3)]


def test_runs_cover_text_with_offsets(sample_blocks):
    for block in sample_blocks:
        assert "".join(r.text for r in block.runs) == block.text
        for run in block.runs:
            assert block.text[run.start : run.end] == run.text


def test_fonts_resolved_from_run_and_style(sample_blocks):
    block = block_containing(sample_blocks, WRONG_FONT)
    fonts = {r.text: r.font for r in block.runs}
    assert fonts[WRONG_FONT] == "Comic Sans MS"
    assert fonts["Formatting check: "] == "Calibri"  # inherited from the Normal style
    assert all(r.size_pt == 11 for r in block.runs)


def test_invalid_file_raises():
    with pytest.raises(DocxParseError):
        parse_docx(io.BytesIO(b"not a docx"))


def _rewrite_docx(source, part: str, edit) -> io.BytesIO:
    """A copy of the .docx with one XML part changed."""
    out = io.BytesIO()
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(out, "w") as dst:
        for name in src.namelist():
            data = src.read(name)
            dst.writestr(name, edit(data) if name == part else data)
    out.seek(0)
    return out


def test_malformed_default_font_size_is_ignored(sample_docx):
    def bad_size(xml: bytes) -> bytes:
        edited, count = re.subn(rb"(<w:rPrDefault>\s*<w:rPr>)", rb'\1<w:sz w:val="abc"/>', xml, count=1)
        assert count == 1, "the template has no default run properties to break"
        return edited

    broken = _rewrite_docx(sample_docx, "word/styles.xml", bad_size)
    blocks = parse_docx(broken)
    assert block_containing(blocks, INTRO).runs  # parsed; Normal's own size still applies


def test_malformed_body_raises_parse_error(sample_docx):
    broken = _rewrite_docx(sample_docx, "word/document.xml", lambda xml: xml[: len(xml) // 2])
    with pytest.raises(DocxParseError):
        parse_docx(broken)
