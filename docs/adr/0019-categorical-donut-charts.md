# ADR-0019: Categorical donut charts

**Status:** Accepted

## Context

ADR-0017 introduced compact, hand-rolled horizontal bars for all three job
statistics breakdowns. Outcome and category values describe categorical shares
of a whole, while iteration values are ordered buckets that communicate a
progression from one attempt through three attempts and an exceptional bucket.

## Decision

Outcome and Category now render as hand-rolled SVG donuts using circle
stroke-dasharray arcs. They retain the project's dependency-free charting
approach and show each breakdown's animated total in the centre.

Outcome segments reuse the exact existing badge colors: Completed `#166534`,
AwaitingReview `#92400e`, and Failed `#b91c1c`. Category has no established
semantic palette, so its five segments use `var(--accent)` at distinct opacity
steps rather than introducing unrelated colors.

Iteration remains a horizontal bar chart. Its 1/2/3/other values are ordinal,
so bars preserve their ordered comparison better than pie slices. This repeats
the categorical-versus-ordinal distinction behind ADR-0017 rather than treating
the remaining bar chart as an unfinished conversion.

When a donut's total is zero, it renders only a neutral gray ring with `No data
yet` at the centre. It does not divide by zero or fabricate empty segments.

## Consequences

The dashboard presents category and outcome share at a glance while preserving
the more useful ordered bar comparison for iterations. No charting dependency,
backend response change, or polling behavior is introduced.
