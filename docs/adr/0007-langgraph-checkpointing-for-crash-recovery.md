# ADR-0007: LangGraph checkpointing for crash recovery

**Status:** Accepted

## Context
The pipeline persists final business results in SQL Server only after a job
reaches a terminal state. If the Python agent-service process crashes or is
restarted while a LangGraph run is in progress, the completed node outputs are
lost. A later retry with the same `jobId` can prove idempotency at the Gateway,
but without graph checkpoints the agent has to restart from the beginning.

The system already has three different persistence concerns: SQL Server stores
business-visible job status and final summaries, Redis stores the semantic
embedding cache, and LangGraph needs internal execution state for recovery.

## Options considered
1. Store graph checkpoints in SQL Server alongside `JobProcessingLog` — keeps
   all persistence in one database, but mixes internal orchestration state with
   business state and couples LangGraph's checkpoint schema to the Gateway.
2. Store checkpoints in Redis — avoids a new local file, but Redis is already
   being used as a best-effort embedding cache where failures intentionally
   degrade to cache misses.
3. Use LangGraph's SQLite checkpointer in `agent-service/checkpoints.db`, keyed
   by `jobId` as the LangGraph `thread_id`.

## Decision
Option 3. The agent service compiles the graph with a SQLite-backed LangGraph
checkpointer and uses the existing `jobId` as the checkpoint `thread_id`.

The Gateway keeps returning `409 Conflict` for genuine in-flight duplicates,
but treats `Pending` or `Processing` rows whose `UpdatedAt` is more than 30
seconds old as abandoned. Those stale requests are forwarded to the Python
agent service with the same `jobId`, allowing LangGraph to resume from the last
checkpoint instead of starting from scratch.

## Consequences
Checkpoint data is separated by purpose. SQL Server remains the business source
of truth for externally visible job state and final summaries. Redis remains a
best-effort semantic cache. SQLite holds LangGraph's private execution
snapshots and can evolve with the checkpointer implementation without changing
Gateway persistence.

Using `jobId` as `thread_id` keeps crash recovery aligned with ADR-0005: the
same UUID is the idempotency key, correlation ID, database primary key, SSE
identifier, and LangGraph checkpoint key.

The 30-second stale-job rule is a pragmatic recovery heuristic, not perfect
distributed crash detection. It can misclassify a very slow still-running
request if no SQL update has happened recently, but it avoids leaving abandoned
`Pending` or `Processing` rows stuck forever after a local process crash. For
this single-process phase, that tradeoff is simpler and more observable than a
heartbeat service or distributed lease.

This does not coordinate multiple concurrent `agent-service` instances. It is
scoped to one local process restarting on the same machine with access to the
same `checkpoints.db` file. Multi-instance locking, leases, and shared
checkpoint storage are intentionally out of scope for this phase.
