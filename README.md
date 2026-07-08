# High-Throughput Private Agent Pipeline

Architecture prototype demonstrating production patterns for high-concurrency,
self-correcting AI agent pipelines with fully local inference (no data leaves
the host). This is a portfolio/demo system — synthetic input documents only,
not built to hold real user data.

Read `docs/adr/` before touching the code — every non-obvious decision
(why the cache still validates, why the auditor never sees freeform text)
is written down there with the alternatives that were rejected and why.

## Status: Phase 0 — Walking Skeleton

The current code proves the wiring end-to-end:
React → .NET Gateway → Python FastAPI → Ollama → tokens streamed back live.
No LangGraph loop, no Auditor, no Redis cache, no SQL logging yet — those
are Phase 1+, built one vertical slice at a time on top of this proven base.

## Repo layout

```
gateway-api/      .NET Core Web API — ingestion + SSE relay
agent-service/    Python FastAPI + (soon) LangGraph — orchestration
frontend/         React + Vite — UI
docs/adr/         Architecture Decision Records
docs/contracts/   JSON schemas every service boundary agrees on
docker-compose.yml  Redis + SQL (local infra only — Ollama runs natively)
```

## Prerequisites (macOS)

See the setup guide in chat for full install commands. Summary:
- Homebrew
- .NET 8 SDK
- Python 3.11+
- Node.js 20+
- Docker Desktop
- Ollama (native app, not containerized — needs Metal GPU access)

## Running Phase 0

```bash
# 1. Start local infra
docker compose up -d

# 2. Pull the model (first time only)
ollama pull llama3.1:8b

# 3. Agent service
cd agent-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000

# 4. Gateway API (new terminal)
cd gateway-api
dotnet restore
dotnet run --urls=http://localhost:5000

# 5. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open the Vite dev server URL, type some text, hit Submit — tokens should
stream in live from the local model.
