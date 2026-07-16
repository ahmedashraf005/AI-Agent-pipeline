# ADR-0023: Daily-volume chart legibility and hover interaction

**Status:** Accepted

## Decision

The daily-volume line uses Catmull-Rom-to-cubic-Bezier conversion. Each cubic
segment uses adjacent real points as its endpoint and clamped neighbors for the
first and last segments, so the curve passes exactly through every supplied
value. This is specifically required to preserve visible zero-count days while
improving the chart's continuity.

The chart adds a vertical accent gradient fill and evenly spaced horizontal
gridlines with numeric labels. These are standard legibility conventions: the
fill makes volume easier to scan and the grid provides scale without adding a
new charting dependency or color.

Hovering selects the nearest actual data point by X position and reveals a
guide line, emphasized point, and exact date/count tooltip. This is the one
functionally new capability in the upgrade: reading precise values rather than
only interpreting the shape visually.

## Consequences

The upgraded line remains faithful to the zero-filled daily data; smoothing
does not conceal gaps or substitute interpolated values. The donut and
iteration-bar renderers remain unchanged.
