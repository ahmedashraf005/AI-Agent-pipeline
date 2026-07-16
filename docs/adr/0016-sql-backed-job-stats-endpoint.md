# ADR-0016: SQL-backed job stats endpoint

**Status:** Accepted

## Context

The Gateway already persists each job's terminal status, loop iteration count,
and (since ADR-0015) optional category in SQL Server. Dashboard statistics
should be derived from that durable record rather than a client-side or
in-memory approximation.

`Pending` and `Processing` rows are not finished outcomes. Including them in
only one chart, or treating them as completed work in another, would make the
dashboard's outcome, iteration, and category views describe different
populations of jobs.

## Decision

`GET /api/jobs/stats` uses EF Core LINQ `GroupBy` queries over one shared base
scope:

`Status IN (Completed, AwaitingReview, Failed)`.

All outcome, iteration, and category counts use that same scope. The response
always includes every fixed frontend bucket, with zero values where no matching
terminal rows exist.

The regular iteration buckets are 1, 2, and 3. The graph currently defines
`MAX_ITERATIONS = 3` in `agent-service/graph/graph.py`, so no higher retry
count can occur in the established pipeline. An appended `other` bucket
captures every terminal `LoopIterations` value outside that range, including
0 for jobs that fail before the Auditor completes once; this prevents the
breakdown from silently dropping terminal rows.

Null `Category` values are returned as an explicit `uncategorized` bucket.
This retains historical jobs created before ADR-0015, and terminal jobs that
never reached the Auditor, instead of silently dropping them from category
statistics.

## Consequences

The endpoint reflects completed work only and uses consistent denominators
across all three charts. Its fixed response shape makes frontend rendering
stable even when a category or outcome has no data.

This is a read-only aggregation over the existing `JobProcessingLogs` table.
It requires no schema change, migration, raw SQL, or additional dependency.
