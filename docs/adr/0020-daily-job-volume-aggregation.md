# ADR-0020: Daily job-volume aggregation

**Status:** Accepted

## Context

`JobProcessingLog.CreatedAt` has existed since Phase 2 and already records
when each submitted job was created. The terminal-only statistics endpoint can
therefore provide daily job volume without a schema change or new tracking
mechanism.

Grouping only dates that have rows would make a time-series chart compress
calendar gaps into adjacent points. That would misrepresent days with no
terminal jobs as continuous activity.

## Decision

`GET /api/jobs/stats` adds `dailyVolume`, derived from the same terminal-status
scope as the outcome, iteration, and category breakdowns. EF Core groups
terminal `CreatedAt` values by date. C# then builds every calendar date from
the earliest to latest observed terminal date and backfills missing dates with
zero counts, ordered oldest first.

## Consequences

The frontend receives a truthful, evenly spaced daily series and can render
quiet days explicitly. The current dataset covers a short, bursty development
window rather than smooth long-term usage. That is expected at this project
stage, not a data-quality problem to conceal or solve with invented values.
