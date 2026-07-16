# ADR-0018: Purple accent and card design tokens

**Status:** Accepted

## Context

The dashboard's earlier blue-accent, small-radius styling was functional but
did not provide a shared visual token system for the reference-inspired
dashboard direction: a purple accent, softer elevated cards, and eventual
donut charts. Donut charts are deferred to Phase 19; this phase only establishes
the color, shadow, and radius foundation they will share.

## Decision

`App.css` defines a small token set for the purple accent palette, soft focus
ring, elevated card treatment, and large/small radii. Controls and active
pipeline states use the accent tokens, while primary section cards use the
card background, border, shadow, and large-radius tokens.

Completed, AwaitingReview, and Failed retain their existing green, amber, and
red semantic colors. They are outcomes, not general-purpose accent states, so
unifying them to purple would weaken the dashboard's status meaning. Only the
neutral in-progress `badge-info` treatment moves to the purple accent palette.

The metric cards intentionally do not show trend deltas such as `+7.4%`.
There is no persisted historical comparison baseline yet, and displaying an
invented trend would make the dashboard less trustworthy.

## Consequences

The visual system now has reusable primitives for future dashboard work while
leaving application logic and semantic outcome colors untouched. The design
can support reference-inspired donut charts later without introducing a
charting dependency or fabricating data-derived signals.
