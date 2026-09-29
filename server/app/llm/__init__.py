from functools import lru_cache

from ..config import get_settings
from .base import LlmBlock, LlmError, LlmProvider, LlmRule, LlmViolation

__all__ = ["LlmBlock", "LlmError", "LlmProvider", "LlmRule", "LlmViolation", "get_llm_provider"]


@lru_cache
def get_llm_provider() -> LlmProvider:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        from .gemini_provider import GeminiProvider

        return GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.llm_model,
            max_output_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            max_retries=settings.llm_max_retries,
        )
    raise LlmError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'")
