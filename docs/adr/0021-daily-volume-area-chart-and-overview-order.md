# ADR-0021: Daily-volume area chart and overview-first chart order

**Status:** Accepted

## Context

ADR-0020 provides a zero-filled daily terminal-job series. The dashboard needs
to show its shape without a charting dependency and present the most
glanceable categorical overview visuals before the more detailed ordinal
iteration breakdown.

## Decision

The dashboard renders daily volume as a hand-rolled SVG area/line chart, the
same dependency-free approach used for the existing donut and bar charts. Its
line and low-opacity area fill reuse `--accent`; no new chart color is added.
Every supplied daily point is plotted, including zero-count dates, so quiet
days are visible as real dips rather than compressed gaps or smoothed trends.

The chart order is daily volume, Outcomes donut, Categories donut, then
Iterations bars. Categorical share is more glanceable and visually prominent
than ordinal bar detail, matching the overview-first structure of the reference
dashboard.

Iterations remain bars, not donuts, because 1/2/3/other are ordinal buckets.
Their ordered comparison is clearer as bars, continuing the distinction made
in ADR-0017 and ADR-0019.

## Consequences

The current daily line is expected to look bursty, with zero-day dips between
concentrated development and testing sessions. It is not representative of
production traffic patterns and should not be interpreted as one.

If fewer than two dates are available, the chart shows `Not enough data yet`
instead of implying a trend from a single point.
