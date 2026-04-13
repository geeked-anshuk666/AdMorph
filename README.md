# Admorph

> AI-driven landing page personalization - match your page to your ad, in seconds.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Gemini-3.1_Pro-4285F4?logo=google)](https://ai.google.dev)

---

## What Is Admorph?

Admorph closes the **message-match gap** in digital advertising. When a user clicks an ad, they expect the landing page to echo the ad's promise. Generic pages fail this test, driving up bounce rates and wasting ad spend.

Admorph takes your **ad creative** and your **landing page URL**, and returns a personalized version of the page with targeted changes - headline, CTA, value proposition - aligned to the ad's message. Non-destructively. With AI-generated reasons for every change.

---

## Live Demo

> **URL:** _(add your deployed URL here)_

---

## Quick Start

### Prerequisites
- Docker Desktop 24+
- Google AI Studio API key

### 1. Clone
```bash
git clone <this-repo>
cd admorph
```

### 2. Configure
```bash
cp .env.example .env
# Fill in GOOGLE_API_KEY and JWT_SECRET
```

Generate JWT secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Run
```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## How It Works

```
Ad Image/URL  →  [Gemini 3 Flash]  →  AdInsight
Landing Page  →  [httpx + SSRF guard]  →  HTML
(AdInsight + HTML structure)  →  [Gemini 3.1 Pro]  →  JSON Diff
JSON Diff  →  [BeautifulSoup]  →  Personalized HTML
```

1. **Upload** your ad creative (image or URL)
2. **Paste** your landing page URL
3. **Click** Personalize - background job starts immediately
4. **Preview** side-by-side and **download** the HTML

---

## Features

- 🎯 **Message-match optimization** via CRO principles
- 🔒 **Non-destructive**: nav, footer, legal never modified
- ⚡ **Async pipeline** with real-time progress tracking
- 🛡️ **SSRF prevention**: blocks private IPs before any request
- 🧠 **Explained changes**: every diff includes AI rationale
- 💾 **SHA256 cache**: identical requests → zero LLM calls
- 📥 **Download ready**: self-contained HTML file

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Custom CSS |
| Backend | FastAPI (Python 3.12), Pydantic v2 |
| AI (personalization) | Gemini 3.1 Pro |
| AI (ad analysis) | Gemini 3 Flash |
| HTML parsing | BeautifulSoup4 + lxml |
| Auth | PyJWT (HS256) |
| Rate limiting | slowapi |
| Infrastructure | Docker + Docker Compose |

---

## Project Structure

```
admorph/
├── backend/           # FastAPI application
│   ├── main.py        # All endpoints
│   ├── models.py      # Pydantic schemas
│   ├── auth.py        # JWT auth
│   ├── config.py      # Settings
│   └── services/      # Core pipeline
│       ├── engine.py
│       ├── ad_analyzer.py
│       ├── diff_generator.py
│       ├── dom_transformer.py
│       ├── page_fetcher.py
│       └── cache.py
├── frontend/          # Next.js application
│   └── src/
│       ├── app/       # Routes + global styles
│       └── components/ # UI components
├── docs/              # Technical documentation
├── .env.example       # Environment template
└── docker-compose.yml
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/token` | ❌ | Issue JWT |
| GET | `/api/status` | ❌ | Health check |
| POST | `/api/personalize` | ✅ | Start job |
| GET | `/api/jobs/{id}` | ✅ | Poll status |
| GET | `/api/preview/{id}` | ❌ | Serve HTML |
| GET | `/api/download/{id}` | ✅ | Download file |

Full reference: [docs/api-reference.md](docs/api-reference.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Overview](docs/overview.md) | What Admorph is and why |
| [System Flow](docs/system-flow.md) | Request lifecycle + Mermaid diagram |
| [API Reference](docs/api-reference.md) | All endpoints with examples |
| [Agent Design](docs/agent-design.md) | LLM agent architecture |
| [Reliability](docs/reliability.md) | Failure modes + recovery |
| [CRO Principles](docs/cro-principles.md) | The conversion science |
| [Security](docs/security.md) | SSRF, prompt injection, auth |
| [Scalability](docs/scalability.md) | Current limits + scaling path |
| [Deployment](docs/deployment.md) | Docker + local dev guide |
| [Future Work](docs/future-improvements.md) | Roadmap ideas |

---

## Security

- SSRF guard: private IPs blocked before any HTTP request
- Prompt injection defense: raw HTML never sent to LLM
- Script stripping: all `<script>` and `on*` handlers removed from output
- JWT HS256 auth with 60-min expiry
- Rate limits: 3/min personalize, 20/min auth
- See [docs/security.md](docs/security.md) for full threat model

---

## License

MIT
