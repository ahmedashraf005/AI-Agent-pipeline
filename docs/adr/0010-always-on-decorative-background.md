# ADR-0010: Always-on decorative background

**Status:** Accepted

## Context
ADR-0009 introduced the decorative FloatingLines background with several
performance and accessibility safeguards, including a manual dashboard toggle
persisted in `localStorage`. After using the dashboard, that extra control adds
interface weight for a purely decorative setting.

The background is already constrained to be ambient: low opacity, low line
count, non-interactive, no parallax, and mounted behind the dashboard content
with `pointer-events: none`.

## Options considered
1. Keep the manual toggle — gives explicit user control, but adds a control that
   competes with the actual dashboard workflow.
2. Remove the background entirely — simplest, but loses the visual polish added
   in Phase 8.
3. Remove the manual toggle and render the background by default while still
   honoring the system reduced-motion signal.

## Decision
Option 3. The decorative background is always on unless the operating system or
browser reports `prefers-reduced-motion: reduce`.

The reduced-motion check is not user-configurable in the app. It is an
accessibility signal from the user's environment and must always be respected.

## Consequences
The dashboard has one fewer control, which makes the header quieter and keeps
attention on job submission, progress, metrics, and recent jobs.

The visual treatment remains consistent across normal sessions without storing
another app preference in `localStorage`.

Users who need reduced motion are still protected: when reduced motion is
enabled, FloatingLines is not mounted at all, avoiding WebGL animation work
rather than merely hiding it with CSS.
