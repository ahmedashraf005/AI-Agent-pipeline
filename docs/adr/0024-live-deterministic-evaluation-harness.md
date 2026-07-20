# ADR-0024: Live deterministic evaluation harness

**Status:** Accepted

## Decision

The benchmark harness sends each document sequentially to the running
agent-service HTTP endpoint rather than importing the LangGraph in process.
This exercises the deployed submission model, SSE protocol, cache behavior,
and live Ollama calls together, while avoiding Gateway SQL and idempotency side
effects. Cache-pair documents are explicitly ordered so the first completes
before its semantic paraphrase begins.

The harness is deliberately excluded from `pytest tests/`. Its real LLM calls
are slow and non-deterministic, which would violate ADR-0008's fast mocked
test-suite boundary. It is a manual/on-demand operational evaluation instead.

Three behaviors are hard assertions and are reported as CRITICAL: a
prompt-injection benchmark reaching `Completed`, a fact-free benchmark reaching
`AwaitingReview`, and the second semantic-cache pair reporting `Cache miss`.
They represent known deterministic safety or regression failures, unlike the
documented ISO-date reformatting, translation, formatting, and vague-text
variance, which the harness tracks without judging pass/fail.

Timestamped report JSON is runtime output and is gitignored. The benchmark
documents themselves remain versioned source so evaluation intent and coverage
are reviewable.

## Consequences

The report provides raw SSE events and normalized outcomes from the actual
service version under test. A reachable agent-service, Redis, and Ollama model
are prerequisites for an end-to-end run; ordinary unit-test runs remain
independent of those services.
