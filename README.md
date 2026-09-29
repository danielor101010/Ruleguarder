# Ruleguarder

Check Word documents against your own rules and see exactly where each rule is broken.

Rules can be written in plain language and checked by an AI model (for example: *"The document
must not reveal numeric performance figures of the system"*), or run as exact built-in checks such as
personal data, classification markings, fonts and broken cross-references. Every violation is
highlighted in the document and listed with its location: paragraph or table cell, and the nearest heading.

## Features

- **AI rules** in any language, checked by Google Gemini with structured output
- **Built-in checks:** forbidden or required text (plain or regex), sentence and paragraph length, allowed fonts, font size range, personal data (email, phone, SSN, credit card), undefined acronyms, broken section/figure/table references
- **Exact locations:** the AI quotes the offending text and the server locates it character by character, so a highlight never points at the wrong text
- **Rule templates** and a one-click sample rule set
- **Resilient checks:** if one rule fails (for example, the AI service is unavailable), the other rules still report and the report is marked incomplete
- **Report view:** the document with severity highlights (high, medium, low) side by side with a filterable violations list; clicking a violation scrolls to it
- Hebrew and other right-to-left documents are supported

## Architecture

| Layer | Technology |
|---|---|
| Client | React 18, TypeScript, Vite, Tailwind CSS, served by nginx |
| Server | Python 3.12, FastAPI, Pydantic, python-docx |
| AI | Google Gemini via `google-genai`, behind a provider interface |
| Database | PostgreSQL 16, SQLAlchemy 2 |
| Runtime | Docker Compose (`db`, `server`, `client`) |

```
.docx ─► parser ─► ordered text blocks with positions and formatting ─► stored
                                   │
enabled rules ─────────────────────┤
  AI rules ─► Gemini ─► verbatim quotes ─► located in the text ─┐
  built-in rules ─► exact matches ──────────────────────────────┴─► violations ─► stored report ─► UI
```

## Getting started

**Requirements:** Docker with Docker Compose, and a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey) (needed only for AI rules).

```bash
cp .env.example .env    # set POSTGRES_PASSWORD and GEMINI_API_KEY
docker compose up -d --build
```

- App: http://localhost:8080
- API documentation: http://localhost:8000/docs

For development with hot reload (app on http://localhost:5173):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Configuration

All settings are in `.env` (see `.env.example`). The main ones:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | Gemini key; required for AI rules |
| `LLM_MODEL` | `gemini-3.5-flash` | Model used for AI rules |
| `LLM_FALLBACK_MODELS` | empty | Models to try when the main one is overloaded |
| `LLM_MAX_RETRIES` | `1` | Retries on rate limits |
| `MAX_UPLOAD_MB` | `20` | Largest accepted upload |
| `CLIENT_PORT` / `SERVER_PORT` | `8080` / `8000` | Published ports |

> **Data privacy:** documents checked with AI rules are sent to Google. On the free Gemini tier,
> Google may use submitted content to improve its products. Use a paid key, or only
> built-in rules, for confidential documents.

## Usage

1. Add rules: **New rule**, **Add from template**, or **Load Sample Rules**. Click a rule to see or edit it.
2. Upload a `.docx` file.
3. Click **Check document**. Click any violation to jump to it in the document.

Rules marked *Uses AI quota* call the Gemini API on every check.

## Testing

```bash
# Server: lint, formatting, strict type checks, unit and API tests
docker compose --profile test run --rm tests

# Client: lint, type checks, unit tests
cd client && npm run check

# Browser end-to-end tests (run against a separate stack; they create data)
docker compose -p rg-e2e -f docker-compose.yml -f docker-compose.e2e.yml --profile e2e run --rm e2e
```

Tests never call the real AI API. The one real-AI test is opt-in:
`docker compose --profile test run --rm tests pytest -m llm`.

### Measuring AI rule accuracy

`server/eval` holds labelled documents with known violations and traps. It reports recall and precision per rule.

```bash
docker compose --profile test run --rm tests python -m eval              # plan and API call count only
docker compose --profile test run --rm tests python -m eval --run --yes  # calls the AI (spends quota)
```

## Project structure

```
server/app/
  docx_parser.py     .docx → text blocks with positions and formatting
  rules/             rule types, AI checking, rule engine, templates
  llm/               AI provider interface and Gemini implementation
  routers/           REST API
client/src/
  components/        UI
  hooks/             data loading and state
  lib/               highlighting and layout logic
project_wiki/        architecture decisions, API contracts, development log
```
