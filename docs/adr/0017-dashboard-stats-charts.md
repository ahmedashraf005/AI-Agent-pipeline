# ADR-0017: Dashboard stats charts

**Status:** Accepted

## Context

ADR-0016 exposes durable terminal-job statistics through
`GET /api/jobs/stats`. The dashboard needs a lightweight way to present those
fixed outcome, iteration, and category buckets without adding a separate
visualization dependency for three small horizontal bar charts.

## Decision

The frontend fetches stats once when the dashboard mounts and renders three
hand-rolled div-based horizontal bar charts. This follows the project's
existing preference for small, dependency-free UI primitives rather than a
charting library for narrowly scoped display needs.

The outcome chart reuses the existing job-history badge foreground colors:
Completed uses `#166534`, AwaitingReview uses `#92400e`, and Failed uses
`#b91c1c`. Reusing those exact colors keeps the dashboard's status semantics
consistent instead of introducing a separate chart palette.

Counts animate with the existing `useCountUp` hook. Each chart calculates bar
width from its own total, and renders `No data yet` when a request fails or its
own breakdown totals zero. The component does not poll or auto-refresh.

## Consequences

The charts are simple to ship and maintain, and require no new npm package.
They show a point-in-time server snapshot; users must reload the dashboard to
retrieve newly completed jobs in this phase.

Until fresh Phase-15-era jobs have reached the Auditor and been persisted by
the Gateway, `categoryBreakdown` is expected to be 100% `uncategorized` for
historical rows. That reflects the stored data rather than a charting error.
