"""Turn a .docx file into a flat, ordered list of text blocks with run-level formatting.

Every block carries enough position info (paragraph number, table/row/column,
nearest heading, character offsets per run) for the rule engine to point at the
exact place a rule was broken.
"""

import re
from collections.abc import Iterator
from typing import IO, Any

from docx import Document as open_docx
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from .schemas import Block, Run

_HEADING_RE = re.compile(r"^(heading|title)\s*(\d*)$", re.IGNORECASE)


class DocxParseError(ValueError):
    pass


def parse_docx(source: str | IO[bytes]) -> list[Block]:
    try:
        doc = open_docx(source)
    except Exception as exc:  # python-docx raises a variety of zip/xml errors
        raise DocxParseError(f"Could not read DOCX file: {exc}") from exc

    defaults = _doc_defaults(doc)
    blocks: list[Block] = []
    current_heading: str | None = None
    paragraph_no = 0
    table_no = 0

    for item in _iter_block_items(doc):
        if isinstance(item, Paragraph):
            paragraph_no += 1
            block = _paragraph_to_block(
                item,
                block_id=len(blocks),
                defaults=defaults,
                heading_context=current_heading,
                label=f"Paragraph {paragraph_no}",
            )
            block.paragraph_index = paragraph_no
            if block.kind == "heading" and block.text.strip():
                current_heading = block.text.strip()
                block.heading_context = None
            blocks.append(block)
            continue

        table_no += 1
        seen_cells: set[int] = set()
        for r, row in enumerate(item.rows, start=1):
            for c, cell in enumerate(row.cells, start=1):
                # Merged cells are returned once per grid position; only emit them once.
                if id(cell._tc) in seen_cells:
                    continue
                seen_cells.add(id(cell._tc))
                for p in cell.paragraphs:
                    block = _paragraph_to_block(
                        p,
                        block_id=len(blocks),
                        defaults=defaults,
                        heading_context=current_heading,
                        label=f"Table {table_no}, row {r}, column {c}",
                    )
                    block.kind = "table_cell"
                    block.table_index, block.row, block.col = table_no, r, c
                    blocks.append(block)

    return blocks


def _iter_block_items(doc: DocxDocument) -> Iterator[Paragraph | Table]:
    """Yield body paragraphs and tables in document order."""
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


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
    for r in p.runs:
        text = r.text
        if not text:
            continue
        runs.append(
            Run(
                start=offset,
                end=offset + len(text),
                text=text,
                font=r.font.name or _style_attr(r.style, "name") or _style_attr(p.style, "name") or defaults["font"],
                size_pt=_to_pt(r.font.size) or _to_pt(_style_attr(r.style, "size")) or _to_pt(_style_attr(p.style, "size")) or defaults["size_pt"],
                bold=_resolve_bool(r.font.bold, r.style, p.style, "bold"),
                italic=_resolve_bool(r.font.italic, r.style, p.style, "italic"),
            )
        )
        offset += len(text)

    # p.text also includes hyperlink text that p.runs skips; keep offsets consistent with runs
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
    return value if value is not None else _style_attr(para_style, attr)


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
        if sz is not None and sz.get(qn("w:val")):
            size_pt = int(sz.get(qn("w:val"))) / 2  # stored in half-points
    return {"font": font, "size_pt": size_pt}
