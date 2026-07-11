# ADR-0005: Client-generated job IDs as idempotency keys

**Status:** Accepted

## Context
The Gateway originally generated a fresh `jobId` for every `POST /api/jobs`.
That made the identifier useful for persistence after ingestion, but useless
for detecting client retries. If a flaky network caused the browser or another
caller to submit the same logical document twice, the Gateway would assign two
different IDs, insert two rows, and run the Python agent service twice.

The same gap also made tracing awkward across the .NET Gateway and Python
agent service. The logs in each process had no shared correlation ID unless a
developer manually matched timestamps and payloads.

## Options considered
1. Keep server-generated IDs only — simple, but retries remain indistinguishable
   from new work.
2. Add a separate idempotency key header while keeping server-generated job IDs
   — explicit, but introduces a second identifier that must be displayed,
   logged, stored, and reconciled with `JobId`.
3. Let the client generate `jobId`, use it as the idempotency key, and keep a
   Gateway-generated fallback for callers that do not send one.

## Decision
Option 3. The client generates a UUID before submission and sends it as
`jobId`; the Gateway uses that value when present, checks for an existing
`JobProcessingLog` before inserting, and returns persisted terminal results
without calling the Python agent service again.

If a duplicate request arrives while the existing row is still `Pending` or
`Processing`, the Gateway returns `409 Conflict` instead of trying to attach the
new request to the original stream.

## Consequences
Completed, failed, and awaiting-review jobs are idempotent: a retry with the
same `jobId` receives a short synthetic SSE response built from the persisted
row rather than triggering another Ollama/LangGraph run.

The same UUID is now present in the browser, Gateway logs, Python logs, SSE
events, and the database row, so a single job can be traced across the process
boundary with a direct text search.

In-flight duplicate handling is intentionally narrow. Coalescing a second HTTP
request onto the first request's active SSE stream would require stream
multiplexing, cancellation rules, buffering behavior, and failure semantics that
are not needed to prove retry idempotency for completed work. Returning
`409 Conflict` makes the race visible to the caller without adding that
coordination layer in this phase.
