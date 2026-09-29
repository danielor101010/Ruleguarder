"""End-to-end tests against the running stack.

    docker compose --profile test run --rm tests

The real-LLM test spends API quota, so it never runs by default. Opt in with:
    docker compose --profile test run --rm tests pytest -m llm
"""

import os

import httpx
import pytest

from ..sample_doc import INTRO, PERFORMANCE

API_URL = os.environ.get("API_URL", "http://localhost:8000")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
HAS_REAL_KEY = bool(GEMINI_KEY) and GEMINI_KEY != "your-gemini-api-key"

pytestmark = pytest.mark.e2e


@pytest.fixture(scope="module")
def api():
    client = httpx.Client(base_url=API_URL, timeout=httpx.Timeout(30, read=600))
    try:
        client.get("/api/health").raise_for_status()
    except httpx.HTTPError:
        pytest.skip(f"API not reachable at {API_URL}")
    yield client
    client.close()


@pytest.fixture
def created(api):
    """Tracks created rules/documents and deletes them after the test."""
    items: dict[str, list[int]] = {"rules": [], "documents": []}
    yield items
    for rid in items["rules"]:
        api.delete(f"/api/rules/{rid}")
    for did in items["documents"]:
        api.delete(f"/api/documents/{did}")


def create_rule(api, created, **body) -> dict:
    res = api.post("/api/rules", json={"severity": "high", **body})
    assert res.status_code == 201, res.text
    created["rules"].append(res.json()["id"])
    return res.json()


def upload(api, created, path) -> dict:
    with open(path, "rb") as f:
        res = api.post("/api/documents", files={"file": ("sample.docx", f, "application/octet-stream")})
    assert res.status_code == 201, res.text
    created["documents"].append(res.json()["id"])
    return res.json()


def check(api, doc_id: int, rule_ids: list[int]) -> dict:
    res = api.post(f"/api/documents/{doc_id}/check", json={"rule_ids": rule_ids})
    assert res.status_code == 200, res.text
    return res.json()


def highlighted(report: dict, violation: dict) -> str:
    block = next(b for b in report["document"]["blocks"] if b["id"] == violation["block_id"])
    return block["text"][violation["start"] : violation["end"]]


def test_rule_types_exposed(api):
    types = {t["key"]: t for t in api.get("/api/rules/types").json()}
    assert {"llm", "forbidden_text", "allowed_fonts"} <= set(types)
    assert "instruction" in types["llm"]["params_schema"]["properties"]


def test_new_rule_types_exposed(api):
    types = {t["key"]: t for t in api.get("/api/rules/types").json()}
    assert types["pii"]["params_schema"]["properties"]["categories"]["items"]["enum"] == [
        "ssn",
        "phone",
        "email",
        "credit_card",
    ]
    assert {"min_length", "max_length", "ignore"} <= set(types["acronym_definitions"]["params_schema"]["properties"])
    assert "kinds" in types["cross_references"]["params_schema"]["properties"]


def test_rule_templates(api):
    res = api.get("/api/rules/templates")
    assert res.status_code == 200, res.text  # not shadowed by the /{rule_id} routes
    templates = {t["id"]: t for t in res.json()}
    assert {"pii-all", "acronym-definitions", "cross-references", "ai-no-performance-figures"} <= set(templates)
    for t in templates.values():
        assert t["category"] in {"security", "privacy", "style", "structure", "ai"}
        assert {"name", "description", "type", "params", "severity", "enabled"} <= set(t["rule"])
    assert templates["ai-no-performance-figures"]["rule"]["enabled"] is False


def test_template_rule_can_be_posted(api, created):
    template = next(t for t in api.get("/api/rules/templates").json() if t["id"] == "cross-references")
    rule = create_rule(api, created, **{**template["rule"], "name": "cross-references from template (e2e)"})
    assert rule["type"] == "cross_references"


def test_sample_rules_are_idempotent(api, created, sample_docx):
    sample_names = {t["rule"]["name"] for t in api.get("/api/rules/templates").json() if t["in_sample_set"]}

    first = api.post("/api/rules/samples")
    assert first.status_code == 201, first.text
    body = first.json()
    created["rules"].extend(r["id"] for r in body["created"])  # only what this test created is removed
    assert {r["name"] for r in body["created"]} | set(body["skipped"]) == sample_names

    rules = {r["name"]: r for r in api.get("/api/rules").json() if r["name"] in sample_names}
    assert set(rules) == sample_names
    ai = [r for r in rules.values() if r["type"] == "llm"]
    assert len(ai) == 1
    if ai[0]["id"] in created["rules"]:
        assert ai[0]["enabled"] is False  # a pre-existing rule may have been enabled by the user

    again = api.post("/api/rules/samples")
    assert again.status_code == 201, again.text
    assert again.json()["created"] == []
    assert set(again.json()["skipped"]) == sample_names
    assert len([r for r in api.get("/api/rules").json() if r["name"] in sample_names]) == len(sample_names)

    # The deterministic sample rules this test created run on a real upload (never the AI rule: no LLM calls).
    # Only the classification marking fires on the sample document.
    fresh = [r for r in body["created"] if r["type"] != "llm"]
    if not fresh:
        return
    doc = upload(api, created, sample_docx)
    report = check(api, doc["id"], [r["id"] for r in fresh])
    expected = ["TOP SECRET"] if any(r["name"] == "No classification markings" for r in fresh) else []
    assert [highlighted(report, v) for v in report["violations"]] == expected


def test_invalid_rule_rejected(api):
    res = api.post(
        "/api/rules", json={"name": "bad", "type": "forbidden_text", "params": {"pattern": "(", "is_regex": True}}
    )
    assert res.status_code == 422


def test_upload_rejects_non_docx(api):
    res = api.post("/api/documents", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 400


def test_full_flow_with_deterministic_rules(api, created, sample_docx):
    forbidden = create_rule(
        api, created, name="No classification markings", type="forbidden_text", params={"pattern": "top secret"}
    )
    fonts = create_rule(
        api, created, name="Calibri only", type="allowed_fonts", params={"fonts": ["Calibri"]}, severity="medium"
    )

    doc = upload(api, created, sample_docx)
    assert any(b["text"] == INTRO for b in doc["blocks"])

    # No report before the first check
    assert api.get(f"/api/documents/{doc['id']}/report").status_code == 404

    report = check(api, doc["id"], [forbidden["id"], fonts["id"]])
    by_rule: dict[int, list[dict]] = {}
    for v in report["violations"]:
        by_rule.setdefault(v["rule_id"], []).append(v)

    [marking] = by_rule[forbidden["id"]]
    assert highlighted(report, marking) == "TOP SECRET"
    assert 'under "Introduction"' in marking["location"]
    assert any("Comic Sans MS" in v["message"] for v in by_rule[fonts["id"]])

    # The report is stored and returned again without re-running
    latest = api.get(f"/api/documents/{doc['id']}/report").json()
    assert latest["check_id"] == report["check_id"]
    assert latest["violations"] == report["violations"]


def test_check_without_rules_fails(api, created, sample_docx):
    doc = upload(api, created, sample_docx)
    res = api.post(f"/api/documents/{doc['id']}/check", json={"rule_ids": []})
    assert res.status_code == 400


@pytest.mark.llm
@pytest.mark.skipif(not HAS_REAL_KEY, reason="GEMINI_API_KEY not set")
def test_llm_rule_finds_performance_figures(api, created, sample_docx):
    rule = create_rule(
        api,
        created,
        name="No performance figures",
        type="llm",
        params={
            "instruction": "The document must not contain numeric figures that reveal the system's "
            "performance, such as detection range, accuracy, speed or update rate."
        },
    )
    doc = upload(api, created, sample_docx)
    report = check(api, doc["id"], [rule["id"]])

    located = [highlighted(report, v) for v in report["violations"] if v["start"] is not None]
    perf_hits = [t for t in located if t in PERFORMANCE]
    assert any("50 km" in t for t in perf_hits), report["violations"]
    assert any("3 m" in t for t in perf_hits), report["violations"]
    # The update rate lives in a table cell
    assert any("2 seconds" in t for t in located), report["violations"]
