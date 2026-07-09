# ADR-0004: Bound concurrent Ollama jobs at two

**Status:** Accepted

## Context
Phase 3 needs concurrency control around local Ollama inference. Before
choosing a semaphore or queue limit, we benchmarked concurrent chat requests
against the local `llama3.1:8b` model.

The measured steady-state results were:

| Concurrency | Wall time | Avg latency | Worst latency | Throughput |
|---|---:|---:|---:|---:|
| 2 | 5.62s | 4.28s | 5.61s | ~0.36 jobs/sec |
| 4 | 12.99s | 8.17s | 12.99s | ~0.31 jobs/sec |
| 8 | 22.45s | 12.80s | 22.44s | ~0.36 jobs/sec |

The concurrency 1 result was excluded because it included one-time model
cold-start/load time and was not representative of steady-state behavior.

Throughput stayed flat at roughly 0.3-0.36 jobs/sec as concurrency increased,
while worst-case per-job latency nearly quadrupled from concurrency 2 to
concurrency 8.

## Options considered
1. Leave concurrency unbounded — simplest, but allows latency to degrade badly
   under load without increasing total throughput.
2. Cap concurrency higher, such as 4 or 8 — keeps more jobs active, but the
   benchmark showed no throughput benefit and materially worse tail latency.
3. Cap concurrent graph jobs at 2 with an async semaphore in the agent service.

## Decision
Option 3. The agent service now reads `MAX_CONCURRENT_JOBS` from the
environment, defaults it to `2`, and uses a module-level `asyncio.Semaphore`
to bound how many jobs can run through the LangGraph/Ollama loop at once.

The limit belongs in `agent-service`, not the Gateway, because Ollama is the
scarce resource and only the agent service calls it.

## Consequences
Requests above the limit are queued inside the streaming generator and emit a
status event before waiting, so clients can see that the job is pending
capacity rather than stalled.

The default limit is tied to the benchmark data, not an arbitrary placeholder.
It can still be overridden with `MAX_CONCURRENT_JOBS` when running on different
hardware or a different local model.
