# AI Code Review Agent

A full-stack AI-powered code review tool that runs a 5-agent pipeline to analyze code for security vulnerabilities, quality issues, and best practice violations — with real-time streaming, fix suggestions, and GitHub integration.

## Features

- **5-agent pipeline** — Chunker → RAG Retriever → Security Agent → Quality Agent → Synthesizer, running in parallel with live progress
- **Streaming reviews** — watch each agent complete in real time via Server-Sent Events
- **Fix suggestions** — every issue includes a corrected code snippet you can apply directly in the editor with one click
- **Click-to-line** — click any issue to jump to the flagged line in the Monaco editor
- **Diff mode** — paste original and modified code side-by-side to focus the review on what changed
- **GitHub integration** — paste a repo URL to browse and load files, a file URL to load directly, or a PR URL to review only the changed lines
- **Export** — download the review as Markdown or PDF
- **Auth + history** — sign in to save every review and track score trends across sessions
- **Deduplication** — issues flagged by multiple agents get a "confirmed" badge and higher confidence score

## Tech Stack

**Backend**
- FastAPI + Python 3.12
- LangGraph / LangChain with Ollama (llama3) — runs fully locally, no paid API needed
- ChromaDB with `all-MiniLM-L6-v2` embeddings for RAG context retrieval
- SQLAlchemy with MySQL (production) or SQLite (local dev)
- JWT authentication with passlib

**Frontend**
- React + TypeScript + Vite
- Monaco Editor (same editor as VS Code)
- Tailwind CSS

## Running Locally

**Prerequisites:** [Ollama](https://ollama.com) installed and running with llama3 pulled.

```bash
ollama pull llama3
```

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5174`.

## Running with Docker

```bash
cp .env.example .env
# edit .env — set SECRET_KEY, DB passwords
docker compose up --build
```

App at `http://localhost:5174`. MySQL, backend, and frontend all start together.

## Deploying to AWS

1. Launch an EC2 instance (t3.medium or larger — Ollama needs memory)
2. Install Docker and Ollama, pull llama3
3. Clone this repo, copy `.env.example` to `.env`, fill in real values
4. Set `OLLAMA_HOST=http://172.17.0.1:11434` in `.env` (Linux Docker bridge)
5. Run `docker compose up -d`

## Environment Variables

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT signing secret (use a long random string) |
| `DB_HOST` | MySQL host (leave blank to use SQLite) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL credentials |
| `OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |
| `FRONTEND_URL` | Allowed CORS origin |
