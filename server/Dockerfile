FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Test image: unit tests + E2E tests against the running stack
FROM base AS test
COPY requirements-dev.txt pytest.ini pyproject.toml ./
RUN pip install -r requirements-dev.txt
COPY tests ./tests
COPY eval ./eval
# All quality gates: lint, formatting, types, tests
CMD ["sh", "-c", "ruff check . && ruff format --check . && mypy && pytest -v"]

FROM base AS prod

RUN useradd --create-home app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data
USER app

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
