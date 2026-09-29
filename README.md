# Ruleguarder

Ruleguarder is an automated document compliance and security auditing system. It checks Microsoft Word (.docx) files against natural language rules using LLMs, as well as deterministic built-in rules, pinpointing exact violation locations in the text.

---

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Google Gemini API Key (required for AI-based rules)

### Running with Docker

1. Configure environment variables:
   ```bash
   cp .env.example .env
   # Set POSTGRES_PASSWORD and GEMINI_API_KEY in .env
   ```

2. Build and start services:
   ```bash
   docker compose up -d --build
   ```

3. Access the services:
   * Web Interface: http://localhost:8080
   * REST API Documentation: http://localhost:8000/docs

---

## How It Works

```text
.docx Upload ---> Parser ---> Text Blocks with Positional Metadata
                                     |
Rules Engine ------------------------+
  |-- AI Rules (Gemini LLM) ---------+---> Verbatim Quotes & Exact Locations
  `-- Built-in Rules (Regex/Text) ---`---> Highlighted Violations ---> UI Report
```

1. **Define Rules:** Create AI rules in plain language (e.g., *"Do not reveal operational metrics"*) or configure built-in checks (regex, sentence length, forbidden terms).
2. **Upload Document:** Drop a `.docx` file into the interface.
3. **Execute Audit:** Run the analysis to generate a filterable report. Click any violation to scroll directly to its location in the document preview.

---

## Architecture & Tech Stack

| Component | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Nginx |
| Backend | Python 3.12, FastAPI, Pydantic, python-docx |
| Database | PostgreSQL 16, SQLAlchemy 2 |
| AI Integration | Google Gemini (`google-genai` SDK) |
| Runtime | Docker Compose |

---

## Configuration

Environment options are managed in `.env`. Key parameters include:

| Variable | Default | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | - | Required for AI-based rule evaluations |
| `LLM_MODEL` | `gemini-3.5-flash` | Primary model for rule checks |
| `LLM_MAX_RETRIES` | `1` | Retries on API rate limits |
| `MAX_UPLOAD_MB` | `20` | Maximum allowed file upload size |

---

## Development & Testing

Run local dev environment with hot-reloading (App on http://localhost:5173):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Execute backend test suites (unit, integration, API):

```bash
docker compose --profile test run --rm tests
```

Execute LLM accuracy evaluation against benchmark documents (calls the Gemini API and spends quota; omit `--run --yes` to only see the plan):

```bash
docker compose --profile test run --rm tests python -m eval --run --yes
```

---

## Repository Structure

```text
server/app/
  docx_parser.py     # DOCX parsing and text block positioning
  rules/             # Rule engine logic and AI prompt construction
  llm/               # LLM provider abstractions
  routers/           # API endpoints
client/src/
  components/        # UI components
  lib/               # Document layout and highlighting logic
```
