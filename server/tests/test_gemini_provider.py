"""GeminiProvider tests with the SDK call mocked (no network, no quota used)."""

import json
from typing import Any

import httpx
import pytest
from google.genai import errors, types

from app.config import Settings
from app.llm import LlmBlock, LlmError, LlmRule, gemini_provider
from app.llm.gemini_provider import GeminiProvider

RULES = [LlmRule(3, "No figures", "No performance numbers")]
BLOCKS = [LlmBlock(0, "Paragraph 1", "Range is 50 km.")]


def response(payload: dict[str, Any] | str, finish: types.FinishReason = types.FinishReason.STOP) -> types.GenerateContentResponse:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part(text=text)]),
                finish_reason=finish,
            )
        ]
    )


def api_error(code: int) -> errors.APIError:
    return errors.APIError(code, {"error": {"message": f"error {code}", "status": "X"}})


EMPTY = response({"violations": []})


def make_provider(monkeypatch: pytest.MonkeyPatch, models: list[str], max_retries: int = 1) -> GeminiProvider:
    monkeypatch.setattr(gemini_provider.time, "sleep", lambda _: None)
    return GeminiProvider(
        api_key="test", models=models, max_output_tokens=1000, temperature=None, max_retries=max_retries, timeout_seconds=30
    )


def mock_generate(monkeypatch: pytest.MonkeyPatch, provider: GeminiProvider, *results: object) -> list[dict[str, Any]]:
    """Each call pops the next result (raise it if it's an exception). Returns the recorded calls."""
    calls: list[dict[str, Any]] = []
    queue = list(results)

    def fake(**kwargs: Any) -> object:
        calls.append(kwargs)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(provider._client.models, "generate_content", fake)
    return calls


def test_parses_structured_output(monkeypatch):
    provider = make_provider(monkeypatch, ["m1"])
    calls = mock_generate(
        monkeypatch,
        provider,
        response({"violations": [
            {"rule_id": 3, "block_id": 0, "quote": "50 km", "explanation": "range"},
            {"rule_id": 3, "block_id": -1, "quote": "", "explanation": "doc level"},
        ]}),
    )
    result = provider.find_violations(RULES, BLOCKS)
    assert [(v.rule_id, v.block_id, v.quote) for v in result] == [(3, 0, "50 km"), (3, None, "")]

    config = calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is gemini_provider._Output
    assert config.automatic_function_calling.disable is True
    assert "[0] (Paragraph 1) Range is 50 km." in calls[0]["contents"]
    assert '<rule id="3"' in calls[0]["contents"]


def test_overloaded_model_falls_back_without_retrying(monkeypatch):
    provider = make_provider(monkeypatch, ["primary", "fallback"], max_retries=3)
    calls = mock_generate(monkeypatch, provider, api_error(503), EMPTY)
    assert provider.find_violations(RULES, BLOCKS) == []
    assert [c["model"] for c in calls] == ["primary", "fallback"]


def test_timeout_falls_back(monkeypatch):
    provider = make_provider(monkeypatch, ["primary", "fallback"])
    calls = mock_generate(monkeypatch, provider, httpx.ReadTimeout("slow"), EMPTY)
    assert provider.find_violations(RULES, BLOCKS) == []
    assert [c["model"] for c in calls] == ["primary", "fallback"]


def test_rate_limit_retries_then_falls_back(monkeypatch):
    provider = make_provider(monkeypatch, ["primary", "fallback"], max_retries=1)
    calls = mock_generate(monkeypatch, provider, api_error(429), api_error(429), EMPTY)
    assert provider.find_violations(RULES, BLOCKS) == []
    assert [c["model"] for c in calls] == ["primary", "primary", "fallback"]


@pytest.mark.parametrize("max_retries,models,expected_calls", [(0, ["m1"], 1), (1, ["m1"], 2), (1, ["m1", "m2"], 4)])
def test_request_count_is_bounded(monkeypatch, max_retries, models, expected_calls):
    """Quota safety: a persistent 429 costs at most (max_retries + 1) requests per model."""
    provider = make_provider(monkeypatch, models, max_retries=max_retries)
    calls = mock_generate(monkeypatch, provider, *[api_error(429)] * 10)
    with pytest.raises(LlmError, match="unavailable"):
        provider.find_violations(RULES, BLOCKS)
    assert len(calls) == expected_calls


def test_all_models_down_lists_each_failure(monkeypatch):
    provider = make_provider(monkeypatch, ["m1", "m2"])
    mock_generate(monkeypatch, provider, api_error(503), api_error(504))
    with pytest.raises(LlmError, match=r"m1: 503.*m2: 504"):
        provider.find_violations(RULES, BLOCKS)


def test_client_error_not_retried(monkeypatch):
    provider = make_provider(monkeypatch, ["m1", "m2"])
    calls = mock_generate(monkeypatch, provider, api_error(400))
    with pytest.raises(LlmError, match="400"):
        provider.find_violations(RULES, BLOCKS)
    assert len(calls) == 1


def test_network_error(monkeypatch):
    provider = make_provider(monkeypatch, ["m1"])
    mock_generate(monkeypatch, provider, httpx.ConnectError("no route"))
    with pytest.raises(LlmError, match="Could not reach"):
        provider.find_violations(RULES, BLOCKS)


def test_truncated_answer(monkeypatch):
    provider = make_provider(monkeypatch, ["m1"])
    mock_generate(monkeypatch, provider, response('{"violations": [', finish=types.FinishReason.MAX_TOKENS))
    with pytest.raises(LlmError, match="cut off"):
        provider.find_violations(RULES, BLOCKS)


def test_invalid_json(monkeypatch):
    provider = make_provider(monkeypatch, ["m1"])
    mock_generate(monkeypatch, provider, response("not json"))
    with pytest.raises(LlmError, match="invalid response"):
        provider.find_violations(RULES, BLOCKS)


def test_missing_api_key():
    with pytest.raises(LlmError, match="GEMINI_API_KEY"):
        GeminiProvider(api_key=None, models=["m"], max_output_tokens=10, temperature=None, max_retries=0, timeout_seconds=1)


def test_model_list_from_settings():
    settings = Settings(llm_model="a", llm_fallback_models=" b, a ,c,")
    assert settings.llm_models == ["a", "b", "c"]
    assert Settings(llm_model="a", llm_fallback_models="").llm_models == ["a"]
