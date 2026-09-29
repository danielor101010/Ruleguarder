"""Run natural-language ("llm") rules over a parsed document.

The model gets the document as numbered blocks and returns (rule, block, verbatim quote).
We then locate the quote in the block text ourselves, so highlights always point at
real text - a quote the model made up can't produce a bogus highlight.
"""

import re
from concurrent.futures import ThreadPoolExecutor

from ..config import get_settings
from ..llm import LlmBlock, LlmProvider, LlmRule
from ..schemas import Block
from .finding import Finding

# Characters the model may silently swap (Hebrew gershayim/geresh vs ASCII quotes, dashes, NBSP...)
_EQUIVALENT = str.maketrans(
    {
        "״": '"',
        "“": '"',
        "”": '"',
        "„": '"',  # gershayim, curly quotes
        "׳": "'",
        "‘": "'",
        "’": "'",
        "`": "'",  # geresh, curly apostrophes
        "–": "-",
        "—": "-",
        "־": "-",  # en/em dash, maqaf
        " ": " ",  # no-break space
        "‏": "",
        "‎": "",
        "​": "",  # RLM, LRM, zero-width space
    }
)
_WS = re.compile(r"\s+")


def check_llm_rules(provider: LlmProvider, rules: list[LlmRule], blocks: list[Block]) -> dict[int, list[Finding]]:
    """Returns findings grouped by rule id."""
    settings = get_settings()
    llm_blocks = [LlmBlock(b.id, b.label, b.text) for b in blocks if b.text.strip()]
    chunks = _chunk(llm_blocks, settings.llm_chunk_chars)
    by_id = {b.id: b for b in blocks}
    rule_ids = {r.id for r in rules}

    with ThreadPoolExecutor(max_workers=max(1, settings.llm_max_parallel)) as pool:
        futures = [pool.submit(provider.find_violations, rules, chunk) for chunk in chunks]
        try:
            results = [f.result() for f in futures]
        except BaseException:
            # One chunk failed, so the AI check fails: don't spend quota on chunks not started yet
            for f in futures:
                f.cancel()
            raise

    findings: dict[int, list[Finding]] = {r.id: [] for r in rules}
    seen: set[tuple[int, int | None, int | None, int | None]] = set()
    doc_level_reported: set[int] = set()

    for chunk, violations in zip(chunks, results, strict=True):
        chunk_ids = [b.id for b in chunk]
        for v in violations:
            if v.rule_id not in rule_ids:
                continue

            if v.block_id is None:
                # With several chunks, every chunk may claim "X is missing"; keep one.
                if v.rule_id in doc_level_reported:
                    continue
                doc_level_reported.add(v.rule_id)
                findings[v.rule_id].append(Finding(v.explanation))
                continue

            block_id, span = _locate(v.quote, v.block_id, chunk_ids, by_id)
            if block_id is None:
                block_id, span = v.block_id if v.block_id in by_id else None, None
            start, end = span if span else (None, None)

            key = (v.rule_id, block_id, start, end)
            if key in seen:
                continue
            seen.add(key)

            message = v.explanation
            if span is None and v.quote:
                message += f' (quoted: "{v.quote}")'
            findings[v.rule_id].append(Finding(message, block_id, start, end))

    return findings


def count_llm_calls(blocks: list[Block]) -> int:
    """How many LLM requests one check of this document makes (one per chunk; retries not included)."""
    llm_blocks = [LlmBlock(b.id, b.label, b.text) for b in blocks if b.text.strip()]
    return len(_chunk(llm_blocks, get_settings().llm_chunk_chars))


def _chunk(blocks: list[LlmBlock], max_chars: int) -> list[list[LlmBlock]]:
    chunks: list[list[LlmBlock]] = []
    current: list[LlmBlock] = []
    size = 0
    for b in blocks:
        length = len(b.text) + len(b.label) + 10
        if current and size + length > max_chars:
            chunks.append(current)
            current, size = [], 0
        current.append(b)
        size += length
    if current or not chunks:
        chunks.append(current)
    return chunks


def _locate(
    quote: str, block_id: int, chunk_ids: list[int], by_id: dict[int, Block]
) -> tuple[int | None, tuple[int, int] | None]:
    """Find the quote in the claimed block first, then anywhere else in the same chunk."""
    if not quote.strip():
        return (block_id if block_id in by_id else None), None
    candidates = [block_id] + [i for i in chunk_ids if i != block_id]
    for cid in candidates:
        block = by_id.get(cid)
        if block is None:
            continue
        span = find_span(block.text, quote)
        if span:
            return cid, span
    return None, None


def find_span(text: str, quote: str) -> tuple[int, int] | None:
    idx = text.find(quote)
    if idx >= 0:
        return idx, idx + len(quote)

    # Look-alike characters and whitespace first, then also ignoring case
    for casefold in (False, True):
        norm_text, index_map = _normalize_with_map(text, casefold=casefold)
        norm_quote, _ = _normalize_with_map(quote, casefold=casefold)
        norm_quote = norm_quote.strip()
        if not norm_quote:
            return None
        idx = norm_text.find(norm_quote)
        if idx >= 0:
            return index_map[idx], index_map[idx + len(norm_quote) - 1] + 1
    return None


def _normalize_with_map(s: str, *, casefold: bool = False) -> tuple[str, list[int]]:
    """Normalise look-alike characters and collapse whitespace, remembering original indices.

    Case folding can turn one character into several ("İ" -> "i̇", "ß" -> "ss"); every piece maps
    back to the same original index, so offsets stay valid.
    """
    out: list[str] = []
    index_map: list[int] = []
    for i, ch in enumerate(s):
        folded = ch.translate(_EQUIVALENT)
        if casefold:
            folded = folded.casefold()
        for c in folded:
            if _WS.fullmatch(c):
                if out and out[-1] == " ":
                    continue
                c = " "
            out.append(c)
            index_map.append(i)
    return "".join(out), index_map
