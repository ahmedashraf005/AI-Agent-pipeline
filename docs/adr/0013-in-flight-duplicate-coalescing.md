# ADR-0013: In-flight duplicate request coalescing

**Status:** Accepted

## Context
ADR-0005 made `jobId` the idempotency key and returned persisted terminal
results for completed duplicates. It deliberately returned `409 Conflict` for
duplicates while a job was still `Pending` or `Processing`, because attaching a
second HTTP request to the first request's live SSE stream required an explicit
coordination layer.

That behavior is correct but rough for callers that retry while the first
request is still healthy. In a single Gateway process, the original request's
SSE lines can be buffered and broadcast to later duplicate requests without
calling the Python agent service a second time.

## Options considered
1. Keep returning `409 Conflict` for all non-stale in-flight duplicates —
   simple, but forces clients to poll or retry instead of rejoining the live
   stream.
2. Store live SSE state in SQL Server — durable across Gateway restarts, but
   mixes transient transport state into the business job log and would require
   schema changes.
3. Add a process-local broadcaster keyed by `jobId` — supports live coalescing
   for one Gateway instance without changing the database or the Python agent
   contract.

## Decision
Option 3. The Gateway owns a singleton `InFlightJobBroadcaster` backed by a
`ConcurrentDictionary<Guid, JobChannel>`. A `JobChannel` keeps a buffered list
of SSE lines already relayed from Python and a set of subscriber channels for
duplicate HTTP requests.

When a newly inserted job starts processing, the Gateway registers a broadcaster
channel. Every SSE line relayed from the Python agent service is appended to
the buffer and written to each active duplicate subscriber. When the producer
request finishes, the Gateway completes the subscriber channels and removes the
entry from the dictionary.

When a duplicate request arrives for a non-terminal, non-stale row, the Gateway
first checks the broadcaster. If the channel exists, the duplicate does not call
Python. It receives the buffered SSE lines first, then streams new lines from a
subscriber channel until the original run finishes. If SQL says the job is
`Pending` or `Processing` but the broadcaster has no matching entry, the
Gateway falls back to `409 Conflict`; this covers process restarts or any other
case where in-memory state was lost.

The ADR-0007 stale-job resume path is unchanged. Terminal duplicate synthetic
replay from ADR-0005 is also unchanged.

## Consequences
Healthy in-flight retries on the same Gateway instance coalesce onto one Python
agent-service call, so duplicate callers see the same SSE stream without
duplicating model work.

The design is explicitly single-instance only. It does not coordinate multiple
Gateway instances, shared load balancers, distributed leases, or a durable
stream buffer. Multi-instance coalescing is future work and belongs in a later
ADR.

Because the broadcaster is process-local, a Gateway restart can leave SQL with
a `Pending` or `Processing` row but no live channel. Returning `409 Conflict`
in that case is intentional until the existing stale-job threshold allows the
ADR-0007 resume behavior to take over.

## Addendum: TOCTOU race found during testing

Manual concurrency testing surfaced a pre-existing race, not introduced
by this phase: two simultaneous requests for the same new jobId could
both pass the `FindAsync` check before either INSERT completed, causing
the losing request's SaveChangesAsync to throw an uncaught
DbUpdateException (SQL error 2627, primary key violation) — the request
crashed with an empty response instead of coalescing. This bug had
existed since Phase 2 and was only exposed once Phase 13's testing
specifically exercised true concurrent submissions of the same jobId.

Fix: catch DbUpdateException around the new-job insert, detach the
failed entity, re-fetch the row the winning request actually inserted,
and route it through the same existing-job handling logic (terminal
replay / broadcaster subscribe / stale resume) already used for a
genuine duplicate. Verified via three concurrency scenarios — a 250ms
gap, a true zero-delay race, and the original TOCTOU reproduction —
all producing byte-identical SSE responses across both requests, with
exactly one Python invocation and one persisted SQL row per jobId.
