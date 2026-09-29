from functools import lru_cache

from ..config import get_settings
from .base import LlmBlock, LlmError, LlmProvider, LlmRule, LlmViolation

__all__ = ["LlmBlock", "LlmError", "LlmProvider", "LlmRule", "LlmViolation", "get_llm_provider"]


@lru_cache
def get_llm_provider() -> LlmProvider:
    settings = get_settings()
    if settings.llm_provider == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            model=settings.llm_model,
            effort=settings.llm_effort,
            max_tokens=settings.llm_max_tokens,
        )
    raise LlmError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'")
