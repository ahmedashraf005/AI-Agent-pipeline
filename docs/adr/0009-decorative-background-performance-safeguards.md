# ADR-0009: Decorative background performance safeguards

**Status:** Accepted

## Context
Phase 8 adds dashboard polish with a decorative animated WebGL background.
That kind of effect can make the interface feel more finished, but it can also
compete with real workflow content, consume GPU budget, interfere with pointer
events, or create accessibility problems for users who prefer reduced motion.

The dashboard remains an operational tool. The background must stay ambient and
optional, never part of the core interaction model.

## Options considered
1. Keep the dashboard fully static — safest and cheapest, but misses the visual
   polish goal for this phase.
2. Add an animated WebGL background without constraints — visually richer, but
   risks excess GPU work, motion discomfort, and interaction bugs.
3. Add the background with explicit performance, accessibility, and user-control
   safeguards.

## Decision
Option 3. The dashboard renders one low-opacity FloatingLines WebGL background
as a top-level sibling behind the content, using a bounded line count and
non-interactive settings.

The component is not rendered at all when
`prefers-reduced-motion: reduce` is active. It is also controlled by a
dashboard toggle persisted in `localStorage`, giving users a visible kill
switch that survives reloads.

## Consequences
The background provides ambient texture without becoming part of the workflow.
`pointer-events: none` on the fixed background layer guarantees it cannot block
textarea, button, or checkbox interaction.

`interactive={false}` is load-bearing because it disables FloatingLines'
pointermove and pointerleave listeners entirely. `parallax={false}` removes
another source of pointer-coupled motion.

The line count is deliberately low at `[3, 4, 3]`. The shader loops per pixel
over every configured line, so total line count is the main GPU-cost control.
The slate gradient and `opacity: 0.35` keep the effect quiet against the
neutral dashboard palette.

The background is mounted once at the App level with stable module-level array
props. It is not nested inside components that update on every SSE tick, which
avoids repeatedly tearing down and recreating a WebGL context during live job
streaming.

This remains decorative. If performance testing shows frame drops on target
hardware, the user-facing toggle can disable it immediately, and future tuning
should happen by adjusting call-site props rather than expanding the shader's
runtime work.
