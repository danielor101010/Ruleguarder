from pathlib import Path

import pytest

from app.docx_parser import parse_docx
from app.schemas import Block

from .sample_doc import build_sample_docx


@pytest.fixture(scope="session")
def sample_docx(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return build_sample_docx(tmp_path_factory.mktemp("docs") / "sample.docx")


@pytest.fixture(scope="session")
def sample_blocks(sample_docx: Path) -> list[Block]:
    return parse_docx(str(sample_docx))


def block_containing(blocks: list[Block], text: str) -> Block:
    return next(b for b in blocks if text in b.text)
