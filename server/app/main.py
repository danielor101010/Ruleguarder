import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .config import get_settings
from .db import Base, engine
from .migrations import upgrade_legacy_severities
from .routers import documents, rules

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper())


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # TODO: replace with Alembic migrations once the schema settles
    Base.metadata.create_all(engine)
    upgrade_legacy_severities(engine)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield


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


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
