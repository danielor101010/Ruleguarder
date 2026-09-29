from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pytest

from app.docx_parser import parse_docx
from app.rules.finding import Finding
from app.schemas import Block, BlockKind

from .sample_doc import build_sample_docx


@pytest.fixture(scope="session")
def sample_docx(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return build_sample_docx(tmp_path_factory.mktemp("docs") / "sample.docx")


@pytest.fixture(scope="session")
def sample_blocks(sample_docx: Path) -> list[Block]:
    return parse_docx(str(sample_docx))


def block_containing(blocks: list[Block], text: str) -> Block:
    return next(b for b in blocks if text in b.text)


def make_block(block_id: int, text: str, kind: BlockKind = "paragraph", **fields: Any) -> Block:
    """A hand-made block, for checker tests that don't need a real .docx."""
    return Block(id=block_id, kind=kind, text=text, label=f"Block {block_id}", **fields)


def paragraphs(*texts: str) -> list[Block]:
    return [make_block(i, text) for i, text in enumerate(texts)]


def spans(blocks: list[Block], findings: Iterable[Finding]) -> list[str]:
    """The highlighted text of each finding."""
    by_id = {b.id: b for b in blocks}
    return [by_id[f.block_id].text[f.start : f.end] if f.block_id is not None else "<document>" for f in findings]
