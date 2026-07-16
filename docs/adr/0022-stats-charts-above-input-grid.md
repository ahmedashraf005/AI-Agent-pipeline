# ADR-0022: Stats charts above the input grid

**Status:** Accepted

## Decision

The dashboard renders `StatsCharts` immediately after `MetricsRow` and before
the Pipeline, Submit document, and Recent jobs grid.

## Consequences

The overview charts are immediately visible instead of appearing below the
input form, where they can fall below the fold. This is a presentation-only
reorder; chart behavior, data fetching, and the submission workflow are
unchanged.
