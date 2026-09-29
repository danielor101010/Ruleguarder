"""GeminiProvider tests with the SDK call mocked (no network)."""

import json

import pytest
from google.genai import errors, types

from app.llm import LlmBlock, LlmError, LlmRule
from app.llm import gemini_provider
from app.llm.gemini_provider import GeminiProvider

RULES = [LlmRule(3, "No figures", "No performance numbers")]
BLOCKS = [LlmBlock(0, "Paragraph 1", "Range is 50 km.")]


def response(payload: dict | str, finish=types.FinishReason.STOP) -> types.GenerateContentResponse:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part(text=text)]),
                finish_reason=finish,
            )
        ]
    )


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr(gemini_provider.time, "sleep", lambda _: None)
    return GeminiProvider(api_key="test", model="gemini-test", max_output_tokens=1000, temperature=None, max_retries=2)


def mock_generate(monkeypatch, provider, *results):
    calls = []
    queue = list(results)

    def fake(**kwargs):
        calls.append(kwargs)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(provider._client.models, "generate_content", fake)
    return calls


def test_parses_structured_output(monkeypatch, provider):
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
    assert "[0] (Paragraph 1) Range is 50 km." in calls[0]["contents"]
    assert '<rule id="3"' in calls[0]["contents"]


def test_retries_on_rate_limit(monkeypatch, provider):
    rate_limited = errors.APIError(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})
    calls = mock_generate(monkeypatch, provider, rate_limited, response({"violations": []}))
    assert provider.find_violations(RULES, BLOCKS) == []
    assert len(calls) == 2


def test_gives_up_after_max_retries(monkeypatch, provider):
    err = errors.APIError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})
    mock_generate(monkeypatch, provider, err, err, err)
    with pytest.raises(LlmError, match="503"):
        provider.find_violations(RULES, BLOCKS)


def test_client_error_not_retried(monkeypatch, provider):
    err = errors.APIError(400, {"error": {"message": "bad key", "status": "INVALID_ARGUMENT"}})
    calls = mock_generate(monkeypatch, provider, err)
    with pytest.raises(LlmError, match="400"):
        provider.find_violations(RULES, BLOCKS)
    assert len(calls) == 1


def test_truncated_answer(monkeypatch, provider):
    mock_generate(monkeypatch, provider, response('{"violations": [', finish=types.FinishReason.MAX_TOKENS))
    with pytest.raises(LlmError, match="cut off"):
        provider.find_violations(RULES, BLOCKS)


def test_invalid_json(monkeypatch, provider):
    mock_generate(monkeypatch, provider, response("not json"))
    with pytest.raises(LlmError, match="invalid response"):
        provider.find_violations(RULES, BLOCKS)


def test_missing_api_key():
    with pytest.raises(LlmError, match="GEMINI_API_KEY"):
        GeminiProvider(api_key=None, model="m", max_output_tokens=10, temperature=None, max_retries=0)
