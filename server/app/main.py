import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .checks import CheckRunner
from .config import get_settings
from .db import Base, SessionLocal, engine
from .llm import get_llm_provider
from .migrations import add_missing_columns, fail_interrupted_checks, upgrade_legacy_severities
from .routers import checks, documents, rules

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # TODO: replace with Alembic migrations once the schema settles
    Base.metadata.create_all(engine)
    add_missing_columns(engine)
    upgrade_legacy_severities(engine)
    fail_interrupted_checks(engine)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    app.state.check_runner = CheckRunner(SessionLocal, get_llm_provider, workers=settings.check_workers)
    yield
    app.state.check_runner.shutdown()


app = FastAPI(title="Ruleguarder API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unexpected_error(_: Request, __: Exception) -> JSONResponse:
    """Keep the `{"detail": ...}` error shape for bugs too. Uvicorn still logs the traceback."""
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


app.include_router(rules.router)
app.include_router(documents.router)
app.include_router(checks.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
