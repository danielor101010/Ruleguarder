"""API tests in-process: FastAPI TestClient on an in-memory SQLite DB, fake LLM provider, no network."""

import io
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base, get_db
from app.llm import LlmError
from app.main import app
from app.routers import documents


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)

    def db() -> Iterator[Session]:
        with make_session() as session:
            yield session

    monkeypatch.setitem(app.dependency_overrides, get_db, db)
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path / "uploads")
    # Not used as a context manager: the lifespan (Postgres create_all) doesn't run
    yield TestClient(app, raise_server_exceptions=False)
    engine.dispose()


def no_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable():
        raise LlmError("All Gemini models are unavailable right now")

    monkeypatch.setattr(documents, "get_llm_provider", unavailable)


def add_rule(client: TestClient, type_: str, params: dict, name: str | None = None) -> dict:
    res = client.post("/api/rules", json={"name": name or type_, "type": type_, "params": params})
    assert res.status_code == 201, res.text
    return res.json()


def upload(client: TestClient, data: bytes, name: str = "doc.docx"):
    return client.post("/api/documents", files={"file": (name, data, "application/octet-stream")})


def uploads(client: TestClient) -> list[Path]:
    folder = get_settings().upload_dir
    return list(folder.iterdir()) if folder.exists() else []


# ---------- checks: AI failure no longer discards the deterministic results ----------


def test_ai_outage_still_returns_the_other_rules(client, monkeypatch, sample_docx):
    no_llm(monkeypatch)
    ai = add_rule(client, "llm", {"instruction": "No performance figures"})
    add_rule(client, "forbidden_text", {"pattern": "top secret"})
    doc = upload(client, sample_docx.read_bytes()).json()

    res = client.post(f"/api/documents/{doc['id']}/check", json={})
    assert res.status_code == 200, res.text
    report = res.json()
    assert [v["rule_name"] for v in report["violations"]] == ["forbidden_text"]
    assert report["summary"]["rules_checked"] == 1
    assert report["summary"]["failed_rules"] == [
        {"rule_id": ai["id"], "rule_name": "llm", "error": "All Gemini models are unavailable right now"}
    ]
    # The partial report is stored like any other
    stored = client.get(f"/api/documents/{doc['id']}/report").json()
    assert stored["summary"]["failed_rules"] == report["summary"]["failed_rules"]


def test_check_fails_only_when_no_rule_could_run(client, monkeypatch, sample_docx):
    no_llm(monkeypatch)
    add_rule(client, "llm", {"instruction": "No performance figures"})
    doc = upload(client, sample_docx.read_bytes()).json()

    res = client.post(f"/api/documents/{doc['id']}/check", json={})
    assert res.status_code == 502
    assert res.json()["detail"] == "No rule could be checked. All Gemini models are unavailable right now"
    # A failed run never replaces the latest completed report
    assert client.get(f"/api/documents/{doc['id']}/report").status_code == 404


# ---------- uploads ----------


def test_malformed_docx_is_rejected_and_nothing_is_kept(client, sample_docx):
    out = io.BytesIO()
    with zipfile.ZipFile(sample_docx) as src, zipfile.ZipFile(out, "w") as dst:
        for name in src.namelist():
            data = src.read(name)
            dst.writestr(name, data[: len(data) // 2] if name == "word/document.xml" else data)

    res = upload(client, out.getvalue())
    assert res.status_code == 400
    assert res.json()["detail"].startswith("Could not read DOCX file")
    assert uploads(client) == []
    assert client.get("/api/documents").json() == []


def test_delete_removes_row_and_file(client, sample_docx):
    doc = upload(client, sample_docx.read_bytes()).json()
    assert len(uploads(client)) == 1
    assert client.delete(f"/api/documents/{doc['id']}").status_code == 204
    assert uploads(client) == []
    assert client.get(f"/api/documents/{doc['id']}").status_code == 404


# ---------- rules ----------


@pytest.mark.parametrize("field", ["name", "description", "severity", "enabled", "params"])
def test_patch_with_null_is_rejected(client, field):
    rule = add_rule(client, "forbidden_text", {"pattern": "x"}, name="Keep me")
    res = client.patch(f"/api/rules/{rule['id']}", json={field: None})
    assert res.status_code == 422, res.text
    assert client.get("/api/rules").json()[0]["name"] == "Keep me"


def test_patch_leaving_fields_out_keeps_them(client):
    rule = add_rule(client, "forbidden_text", {"pattern": "x"}, name="Keep me")
    res = client.patch(f"/api/rules/{rule['id']}", json={"enabled": False})
    assert res.status_code == 200
    assert (res.json()["name"], res.json()["enabled"]) == ("Keep me", False)


def test_sample_rules_are_idempotent(client):
    first = client.post("/api/rules/samples").json()
    again = client.post("/api/rules/samples").json()
    assert first["created"] and not again["created"]
    assert sorted(again["skipped"]) == sorted(r["name"] for r in first["created"])


# ---------- unexpected errors ----------


def test_unexpected_error_keeps_the_json_error_shape(client, monkeypatch, sample_docx):
    def crash(*_):
        raise RuntimeError("bug")

    monkeypatch.setattr(documents, "run_rules", crash)
    add_rule(client, "forbidden_text", {"pattern": "x"})
    doc = upload(client, sample_docx.read_bytes()).json()
    res = client.post(f"/api/documents/{doc['id']}/check", json={})
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error"}
