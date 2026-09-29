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
    res = api.post("/api/rules", json={"severity": "error", **body})
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


def test_invalid_rule_rejected(api):
    res = api.post("/api/rules", json={"name": "bad", "type": "forbidden_text", "params": {"pattern": "(", "is_regex": True}})
    assert res.status_code == 422


def test_upload_rejects_non_docx(api):
    res = api.post("/api/documents", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 400


def test_full_flow_with_deterministic_rules(api, created, sample_docx):
    forbidden = create_rule(api, created, name="No classification markings", type="forbidden_text", params={"pattern": "top secret"})
    fonts = create_rule(api, created, name="Calibri only", type="allowed_fonts", params={"fonts": ["Calibri"]}, severity="warning")

    doc = upload(api, created, sample_docx)
    assert any(b["text"] == INTRO for b in doc["blocks"])

    # No report before the first check
    assert api.get(f"/api/documents/{doc['id']}/report").status_code == 404

    report = check(api, doc["id"], [forbidden["id"], fonts["id"]])
    by_rule = {}
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
        params={"instruction": "The document must not contain numeric figures that reveal the system's "
                "performance, such as detection range, accuracy, speed or update rate."},
    )
    doc = upload(api, created, sample_docx)
    report = check(api, doc["id"], [rule["id"]])

    located = [highlighted(report, v) for v in report["violations"] if v["start"] is not None]
    perf_hits = [t for t in located if t in PERFORMANCE]
    assert any("50 km" in t for t in perf_hits), report["violations"]
    assert any("3 m" in t for t in perf_hits), report["violations"]
    # The update rate lives in a table cell
    assert any("2 seconds" in t for t in located), report["violations"]
