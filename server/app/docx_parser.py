"""Turn a .docx file into a flat, ordered list of text blocks with run-level formatting.

Every block carries enough position info (paragraph number, table/row/column, document part,
nearest heading, character offsets per run) for the rule engine to point at the exact place a
rule was broken.

Covered: body paragraphs and headings; tables, including tables nested in cells; text boxes
(listed right after the paragraph that holds them); headers and footers of every section;
footnotes and endnotes. Paragraph text includes hyperlinks and field results (e.g. SEQ caption
numbers), which `python-docx`'s `Paragraph.runs` leaves out.
"""

import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import IO, Any

from docx import Document as open_docx
from docx.document import Document as DocxDocument
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run as DocxRun

from .schemas import Block, BlockPart, Run

log = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(heading|title)\s*(\d*)$", re.IGNORECASE)


class DocxParseError(ValueError):
    pass


def parse_docx(source: str | IO[bytes]) -> list[Block]:
    try:
        return _parse(open_docx(source))
    except Exception as exc:  # python-docx raises zip/xml/value errors on malformed files, while opening or reading
        log.info("Unreadable DOCX", exc_info=True)
        raise DocxParseError(f"Could not read DOCX file: {exc}") from exc


_MC_FALLBACK = "{http://schemas.openxmlformats.org/markup-compatibility/2006}Fallback"
# Elements that wrap runs inside a paragraph; their runs belong to the paragraph text
_RUN_CONTAINERS = {
    qn(tag)
    for tag in (
        "w:hyperlink",
        "w:fldSimple",
        "w:smartTag",
        "w:ins",
        "w:sdt",
        "w:sdtContent",
        "w:customXml",
        "w:dir",
        "w:bdo",
    )
}
_NOTE_SKIP_TYPES = {"separator", "continuationSeparator", "continuationNotice"}


@dataclass
class _Ctx:
    doc: DocxDocument
    defaults: dict[str, Any]
    blocks: list[Block] = field(default_factory=list)
    heading: str | None = None
    paragraph_no: int = 0
    table_no: int = 0


def _parse(doc: DocxDocument) -> list[Block]:
    ctx = _Ctx(doc, _doc_defaults(doc))
    _walk_body(ctx)
    _add_headers_footers(ctx)
    _add_notes(ctx, RT.FOOTNOTES, "w:footnote", "footnote", "Footnote")
    _add_notes(ctx, RT.ENDNOTES, "w:endnote", "endnote", "Endnote")
    return ctx.blocks


def _add(
    ctx: _Ctx,
    p: Paragraph,
    label: str,
    *,
    part: BlockPart = "body",
    heading_context: str | None = None,
    cell: tuple[int, int, int] | None = None,
    skip_empty: bool = False,
) -> Block | None:
    """Append one paragraph (and then any text boxes inside it) as blocks."""
    block = _paragraph_to_block(
        p, block_id=len(ctx.blocks), defaults=ctx.defaults, heading_context=heading_context, label=label
    )
    if skip_empty and not block.text.strip():
        return None
    block.part = part
    if cell is not None:
        block.kind = "table_cell"
        block.table_index, block.row, block.col = cell
    ctx.blocks.append(block)
    _add_text_boxes(ctx, p, label, heading_context)
    return block


def _add_text_boxes(ctx: _Ctx, p: Paragraph, label: str, heading_context: str | None) -> None:
    n = 0
    for box in p._p.iter(qn("w:txbxContent")):
        # Word stores a text box twice (DrawingML + a VML fallback); read it once
        if any(a.tag == _MC_FALLBACK for a in box.iterancestors()):
            continue
        n += 1
        for bp in box.iterchildren(qn("w:p")):
            _add(
                ctx,
                Paragraph(bp, p._parent),
                f"Text box {n} in {label.lower() if label.startswith('Table') else label}",
                part="textbox",
                heading_context=heading_context,
                skip_empty=True,
            )


def _walk_body(ctx: _Ctx) -> None:
    for child in ctx.doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            ctx.paragraph_no += 1
            block = _add(ctx, Paragraph(child, ctx.doc), f"Paragraph {ctx.paragraph_no}", heading_context=ctx.heading)
            if block is not None:
                block.paragraph_index = ctx.paragraph_no
                if block.kind == "heading" and block.text.strip():
                    ctx.heading = block.text.strip()
                    block.heading_context = None
        elif child.tag == qn("w:tbl"):
            ctx.table_no += 1
            _walk_table(ctx, Table(child, ctx.doc), f"Table {ctx.table_no}", None)


def _walk_table(ctx: _Ctx, table: Table, prefix: str, outer: tuple[int, int, int] | None) -> None:
    """Cells in reading order. A nested table's cells keep the outer cell's position (that's where
    they are shown) and get a label that names both levels."""
    # Holds the <w:tc> elements themselves: that keeps lxml's proxies alive, so the
    # same cell always maps to the same object (id() of a freed proxy gets reused).
    seen_cells: set[Any] = set()
    nested_no = 0
    for r, row in enumerate(table.rows, start=1):
        for c, cell in enumerate(row.cells, start=1):
            # Merged cells are returned once per grid position; only emit them once.
            if cell._tc in seen_cells:
                continue
            seen_cells.add(cell._tc)
            position = outer or (ctx.table_no, r, c)
            label = f"{prefix}, row {r}, column {c}"
            for child in cell._tc.iterchildren():
                if child.tag == qn("w:p"):
                    _add(ctx, Paragraph(child, cell), label, heading_context=ctx.heading, cell=position)
                elif child.tag == qn("w:tbl"):
                    nested_no += 1
                    _walk_table(ctx, Table(child, cell), f"{label}, nested table {nested_no}", position)


def _add_headers_footers(ctx: _Ctx) -> None:
    seen_parts: set[int] = set()
    for i, section in enumerate(ctx.doc.sections, start=1):
        variants = [
            ("header", "Header", section.header),
            ("header", "First-page header", section.first_page_header),
            ("header", "Even-page header", section.even_page_header),
            ("footer", "Footer", section.footer),
            ("footer", "First-page footer", section.first_page_footer),
            ("footer", "Even-page footer", section.even_page_footer),
        ]
        for part, name, hf in variants:
            # A linked header/footer has no content of its own (it shows the previous section's)
            if hf.is_linked_to_previous or id(hf.part) in seen_parts:
                continue
            seen_parts.add(id(hf.part))
            paragraphs = [p for p in _paragraphs_in(hf._element, hf) if p.text.strip() or _has_text_box(p)]
            for n, p in enumerate(paragraphs, start=1):
                suffix = f", line {n}" if len(paragraphs) > 1 else ""
                _add(ctx, p, f"{name} (section {i}){suffix}", part=part)  # type: ignore[arg-type]


def _add_notes(ctx: _Ctx, reltype: str, tag: str, part: BlockPart, name: str) -> None:
    """Footnotes / endnotes, read from their XML part (python-docx has no API for them)."""
    note_part = next((rel.target_part for rel in ctx.doc.part.rels.values() if rel.reltype == reltype), None)
    if note_part is None:
        return
    root = note_part.element if hasattr(note_part, "element") else parse_xml(note_part.blob)
    number = 0
    for note in root.iterchildren(qn(tag)):
        if note.get(qn("w:type")) in _NOTE_SKIP_TYPES:
            continue
        number += 1
        paragraphs = [p for p in _paragraphs_in(note, ctx.doc) if p.text.strip()]
        for n, p in enumerate(paragraphs, start=1):
            suffix = f", paragraph {n}" if len(paragraphs) > 1 else ""
            _add(ctx, p, f"{name} {number}{suffix}", part=part)


def _paragraphs_in(element: Any, parent: Any) -> Iterator[Paragraph]:
    """Paragraphs of a header/footer/note, including those inside its tables, in order."""
    for child in element.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            for p_el in child.iter(qn("w:p")):
                yield Paragraph(p_el, parent)


def _has_text_box(p: Paragraph) -> bool:
    return next(p._p.iter(qn("w:txbxContent")), None) is not None


def _iter_runs(element: Any, paragraph: Paragraph) -> Iterator[DocxRun]:
    """Runs in document order, including those inside hyperlinks, simple fields and content controls."""
    for child in element.iterchildren():
        if child.tag == qn("w:r"):
            yield DocxRun(child, paragraph)
        elif child.tag in _RUN_CONTAINERS:
            yield from _iter_runs(child, paragraph)


def _paragraph_to_block(
    p: Paragraph,
    *,
    block_id: int,
    defaults: dict[str, Any],
    heading_context: str | None,
    label: str,
) -> Block:
    style_name = p.style.name if p.style is not None else None
    heading_level = _heading_level(style_name)

    runs: list[Run] = []
    offset = 0
    for r in _iter_runs(p._p, p):
        text = r.text
        if not text:
            continue
        runs.append(
            Run(
                start=offset,
                end=offset + len(text),
                text=text,
                font=r.font.name or _style_attr(r.style, "name") or _style_attr(p.style, "name") or defaults["font"],
                size_pt=_to_pt(r.font.size)
                or _to_pt(_style_attr(r.style, "size"))
                or _to_pt(_style_attr(p.style, "size"))
                or defaults["size_pt"],
                bold=_resolve_bool(r.font.bold, r.style, p.style, "bold"),
                italic=_resolve_bool(r.font.italic, r.style, p.style, "italic"),
            )
        )
        offset += len(text)

    # Built from the runs so the offsets of runs and text always agree
    text = "".join(run.text for run in runs)

    return Block(
        id=block_id,
        kind="heading" if heading_level is not None else "paragraph",
        text=text,
        style=style_name,
        heading_level=heading_level,
        heading_context=heading_context,
        label=label,
        runs=runs,
    )


def _heading_level(style_name: str | None) -> int | None:
    if not style_name:
        return None
    m = _HEADING_RE.match(style_name.strip())
    if not m:
        return None
    return int(m.group(2)) if m.group(2) else 0  # Title => level 0


def _style_attr(style: Any, attr: str) -> Any:
    """Walk the style inheritance chain until a value for font.<attr> is found."""
    while style is not None:
        font = getattr(style, "font", None)
        value = getattr(font, attr, None) if font is not None else None
        if value is not None:
            return value
        style = getattr(style, "base_style", None)
    return None


def _resolve_bool(direct: bool | None, run_style: Any, para_style: Any, attr: str) -> bool | None:
    if direct is not None:
        return direct
    value = _style_attr(run_style, attr)
    if value is None:
        value = _style_attr(para_style, attr)
    return None if value is None else bool(value)


def _to_pt(length: Any) -> float | None:
    return round(length.pt, 2) if length is not None else None


def _doc_defaults(doc: DocxDocument) -> dict[str, Any]:
    """Read <w:docDefaults> so runs without explicit/style formatting still get a font + size."""
    font: str | None = None
    size_pt: float | None = None
    rpr = doc.styles.element.find(f"{qn('w:docDefaults')}/{qn('w:rPrDefault')}/{qn('w:rPr')}")
    if rpr is not None:
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is not None:
            font = fonts.get(qn("w:ascii")) or fonts.get(qn("w:hAnsi"))
        sz = rpr.find(qn("w:sz"))
        val = sz.get(qn("w:val")) if sz is not None else None
        if val and val.isdigit():  # a malformed default size is ignored, not fatal
            size_pt = int(val) / 2  # stored in half-points
    return {"font": font, "size_pt": size_pt}
