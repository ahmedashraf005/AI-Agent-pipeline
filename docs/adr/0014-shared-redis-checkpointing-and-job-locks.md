# ADR-0014: Shared Redis checkpointing and cross-instance job locks

**Status:** Accepted

## Context
ADR-0007 introduced LangGraph checkpointing with a local SQLite file at
`agent-service/checkpoints.db`. That solved single-process crash recovery, but
it did not support more than one `agent-service` instance. Each process would
own a private SQLite file, so a checkpoint written by instance A would be
invisible to instance B.

The same gap also allowed two instances to process the same `jobId`
concurrently. The Gateway uses `jobId` as the idempotency key, but the agent
service still needs its own cross-instance guard before starting or resuming a
LangGraph run.

The project already uses Redis for the semantic cache. Redis is therefore the
smallest shared store that can make checkpoints visible across local
`agent-service` instances without introducing a second infrastructure
dependency.

## Options considered
1. Keep local SQLite checkpointing — preserves the Phase 7 implementation, but
   silently breaks with multiple agent-service instances.
2. Move checkpoints into the same Redis logical database as the semantic cache,
   with locks isolated in DB 1 — shares checkpoint state across instances and
   satisfies RediSearch's DB 0 constraint, but means cache and checkpoints share
   the same flush blast radius.
3. Use Redis logical DB separation, with cache data in DB 0 and
   checkpoint/lock data in DB 1 — appealing as a namespace boundary, but
   incompatible with `langgraph-checkpoint-redis` because its checkpoint saver
   creates RediSearch indices, and RediSearch can only create indices on
   logical DB 0.
4. Use two Redis instances: one for cache and one for checkpoints/locks —
   strongest operational separation, but disproportionate infrastructure for
   this project's current single-Redis deployment.

## Decision
Option 2. The agent service now uses `langgraph-checkpoint-redis` with
`AsyncRedisSaver`, backed by the existing `REDIS_URL` host and logical DB 0.
The semantic cache also remains on logical DB 0 because both the cache and the
checkpoint saver use RediSearch indices.

The cache and checkpoint indices do not collide. The semantic cache uses the
RediSearch index `doc_cache_idx` with key prefix `doc:`. The checkpoint saver
creates `checkpoints`, `checkpoints_blobs`, and `checkpoint_writes`, with key
prefixes `checkpoint:`, `checkpoint_blob:`, and `checkpoint_write:`.

This means `FLUSHDB` on DB 0, or `FLUSHALL`, would wipe both cache entries and
checkpoints. That is the same operational hazard already accepted for Redis
data during ADR-0006/Phase 6 cache testing, now extended to checkpoints. The
mitigation is operational discipline: do not flush production Redis DB 0 while
jobs may need recovery. A second Redis instance was considered and rejected as
too much infrastructure for this project's scale.

Before touching the graph, an agent-service instance acquires
`lock:job:{job_id}` in Redis DB 1 using `SET NX EX 120`. The lock value is a
random `instance_id` generated once at process startup. The lock is released in
a `finally` path with a compare-and-delete Lua script, so an instance never
deletes a lock owned by another process. If the lock cannot be acquired, the
service emits an SSE error, `Job is already being processed by another
instance`, and returns without reading or writing graph state.

The 120-second TTL is a safety net for crashes where the holder cannot release
the lock. A crashed instance may block the same `jobId` until the TTL expires,
but it will not leave the job locked forever.

## Consequences
Phase 7's crash-recovery behavior still exists, but checkpoints are now shared
through Redis DB 0 instead of a process-local SQLite file. A retry routed to a
different agent-service instance can see the same checkpoint and resume using
the same `jobId` thread configuration.

Concurrent cross-instance processing of the same `jobId` is rejected before
the graph is touched. This preserves the single-writer assumption for each
LangGraph thread and makes the rejected request explicit to the caller.

Locks remain in Redis logical DB 1 because they use plain `SET`, `GET`,
`DEL`, and Lua `EVAL`, not RediSearch. The RediSearch DB 0 constraint only
applies to indexed checkpoint data.

This is explicitly a single-Redis-instance lock. It does not implement leader
election, Redlock, multi-node consensus, distributed fencing tokens, or
multi-region coordination. Those are out of scope because this project's
deployment uses one Redis instance as the shared coordination point.
