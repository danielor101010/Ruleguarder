from dataclasses import dataclass
from typing import Protocol


@dataclass
class LlmRule:
    id: int
    name: str
    instruction: str


@dataclass
class LlmBlock:
    id: int
    label: str
    text: str


@dataclass
class LlmViolation:
    rule_id: int
    block_id: int | None  # None => the rule is violated by the document as a whole
    quote: str  # verbatim text copied from the block
    explanation: str


class LlmError(RuntimeError):
    pass


class LlmProvider(Protocol):
    """Anything that can review a chunk of blocks against natural-language rules.

    Implement this to plug in another model (e.g. a self-hosted one for documents
    that must not leave the network) and select it with LLM_PROVIDER.
    """

    def find_violations(self, rules: list[LlmRule], blocks: list[LlmBlock]) -> list[LlmViolation]: ...
