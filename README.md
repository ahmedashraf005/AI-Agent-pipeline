# High-Throughput Private AI Agent Pipeline

Architecture prototype demonstrating production patterns for high-concurrency, self-correcting AI agent pipelines with fully local inference — no data leaves the host. Built incrementally across 14 phases, each with a real, tested engineering story behind it (several catching genuine bugs through adversarial and automated testing, not just happy-path demos).

## What this is

A document-summarization pipeline that reads unstructured text or uploaded files, runs it through an autonomous self-correcting LangGraph agent loop (draft → audit → verify → escalate-if-needed), and streams live progress back to a React dashboard — all backed by a local open-source LLM (Ollama), with real SQL persistence, semantic caching, shared crash recovery across multiple instances, in-flight request coalescing, and an automated test suite.

## Architecture

```
React (Vite) dashboard
      │  HTTP POST + SSE
      ▼
.NET 8 Gateway API  ─────────────────►  SQL Server (job status log)
      │  JSON / SSE relay, coalesced for in-flight duplicates
      ▼
Python FastAPI + LangGraph  ──────────►  Redis (semantic cache + checkpoint state on DB 0, cross-instance job locks on DB 1)
      ▼
Ollama (local inference: llama3.1:8b + nomic-embed-text)
```

The agent loop itself:

```
Cache check → [cache hit] → Auditor ──┐
      │                                │
   [cache miss]                       │
      ▼                                ▼
 Summarizer ──────────────────────► Auditor ──[VALID]──► Fact checker ──[PASS]──► Cache store → Format (bullets?) → Translate (Arabic?) → Completed
      ▲                                │                        │
      └──────[INVALID, retries left]───┘                  [FAIL / INVALID at max retries]
                                                                  ▼
                                                            AwaitingReview (human review)
```

## Tech stack

- **Frontend:** React + Vite
- **Gateway:** .NET 8 Web API, Entity Framework Core, SQL Server (Azure SQL Edge for Apple Silicon), PdfPig + DocumentFormat.OpenXml for file extraction
- **Agent orchestration:** Python, FastAPI, LangGraph, LangChain
- **Semantic cache + checkpointing:** Redis Stack (RediSearch vector similarity + Redis-backed LangGraph checkpointer)
- **Local inference:** Ollama — `llama3.1:8b` (generation), `nomic-embed-text` (embeddings)
- **Crash recovery:** LangGraph Redis checkpointing, shared across multiple agent-service instances, with a distributed job lock
- **Testing:** pytest, mocked-LLM-boundary unit tests

## What's actually implemented, by phase

Each phase has a corresponding Architecture Decision Record in `docs/adr/` — read those for the real reasoning, tradeoffs, and (where relevant) the bug that motivated the decision.

| Phase | What it does | ADR |
|---|---|---|
| 0 | Walking skeleton — proves the full stack connects end to end | — |
| 1 | Self-correcting Summarizer/Auditor loop, schema-validated LLM verdicts (not freeform text), 3-strike escalation | 0002 |
| 2 | Real SQL persistence of every job's status lifecycle | — |
| 3 | Deterministic (regex-based, zero-LLM) fact-verification gate, added after adversarial testing found a prompt-injection bypass in the LLM-only Auditor | 0003 |
| 4 | Bounded concurrency via `asyncio.Semaphore`, sized from an empirical Ollama throughput benchmark, not a guess | 0004 |
| 5 | Client-generated idempotency keys + correlation-ID logging across both services | 0005 |
| 6 | Redis semantic cache — cache hits skip the expensive Summarizer call but are still fully re-validated (never bypass the Auditor/fact-checker) | 0001, 0006 |
| 7 | LangGraph checkpointing for crash recovery — a killed process resumes mid-graph instead of restarting from scratch | 0007 |
| 8 | Automated test suite — pure routing tests, mocked-LLM node tests. Caught a real duplicate-Ollama-call bug that had silently defeated a determinism fix since Phase 1 | 0008 |
| 9 | Dashboard UI (metrics, pipeline stepper, job history) + ambient WebGL background with explicit performance/accessibility safeguards | 0009 |
| 10 | Always-on background, `prefers-reduced-motion` still respected without a manual toggle | 0010 |
| 11 | File upload support (.txt/.pdf/.docx) via PdfPig and DocumentFormat.OpenXml, sharing idempotency/persistence logic with the existing text route | 0011 |
| 12 | Summary format (paragraph/bullets) and language (English/Arabic) options, layered on top of the verified English draft rather than changing the core pipeline | 0012 |
| 13 | Real in-flight SSE coalescing for duplicate requests — surfaced and fixed a pre-existing race condition on concurrent new-job inserts, dating back to Phase 2 | 0013 |
| 14 | Shared Redis-backed checkpointing + a distributed job lock — crash recovery now works across multiple agent-service instances, not just one process | 0014 |

## Notable things found during testing (not just built — verified)

- **Prompt injection bypass:** an adversarial test document convinced both the Summarizer and the schema-validated Auditor to omit real deadlines and dollar amounts. Fixed with a second, deterministic, non-LLM verification gate — because a schema-validated LLM verdict is still an LLM verdict (ADR-0003).
- **Silent determinism regression:** a duplicate Ollama call in the Auditor meant the actual verdict used was never running at `temperature=0`, despite the code, comments, and an earlier manual test all suggesting it was fixed. Only caught once an automated test explicitly asserted on the call arguments (ADR-0008).
- **A crash-recovery bug in the recovery mechanism itself:** the Gateway was marking any interrupted stream as terminal `Failed`, which silently prevented the staleness-based resume logic from ever being reached — checkpointing worked internally, but nothing could ever trigger it through the API (ADR-0007).
- **A concurrency-testing session surfaced a genuine, older race condition:** building real in-flight request coalescing required firing truly simultaneous duplicate requests for the first time — which exposed a check-then-insert race on new job rows that had existed, uncaught, since Phase 2 (ADR-0013).
- **A hard infrastructure constraint discovered mid-implementation:** the original plan to isolate the semantic cache and checkpoint store on separate Redis logical databases turned out to be incompatible with RediSearch, which can only build search indices on database 0 — found via a real startup crash, not a design review, and resolved by sharing database 0 with documented tradeoffs rather than silently working around it (ADR-0014).

## Running it locally

Prerequisites: Docker Desktop, .NET 8 SDK, Python 3.11+, Node 20+, [Ollama](https://ollama.com).

```bash
# 1. Local infra (Redis + SQL)
docker compose up -d

# 2. Pull the models (first time only)
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# 3. Agent service
cd agent-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000

# 4. Gateway API (new terminal)
cd gateway-api
dotnet ef database update
dotnet run --urls=http://localhost:5001

# 5. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open the printed Vite URL, submit or upload a document, and watch it move through the pipeline live.

## Running the tests

```bash
cd agent-service
source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

No live Ollama, Redis, or SQL connection required — the suite tests deterministic control flow directly and mocks the LLM boundary for everything else (see ADR-0008 for the philosophy).

## Repo layout

```
gateway-api/      .NET Gateway — ingestion, SQL persistence, idempotency, in-flight coalescing, SSE relay
  Services/       File extraction (DocumentTextExtractor), in-flight request broadcaster
agent-service/    Python FastAPI + LangGraph — the actual agent loop
  graph/          Nodes, routing, cache, checkpointing
  tests/          Automated suite (routing, fact-checker, mocked-LLM nodes)
  scripts/        Utility scripts (Ollama concurrency benchmark)
frontend/         React + Vite dashboard
  src/components/ Dashboard UI (metrics, pipeline stepper, job form, job history, background)
docs/adr/         Architecture Decision Records — the real reasoning behind every phase
docs/contracts/   JSON schemas every service boundary agrees on
docker-compose.yml   Redis + SQL (Ollama runs natively, not containerized)
```

## Scope notes

This is a portfolio/demo system — synthetic test documents only, not built or intended to hold real user data. A few things are explicitly out of scope by design, documented in their respective ADRs: multi-Redis-instance/Redlock-style distributed consensus (Phase 14 covers multiple agent-service instances sharing one Redis, not multiple Redis instances), and virus/malware scanning of uploaded files.