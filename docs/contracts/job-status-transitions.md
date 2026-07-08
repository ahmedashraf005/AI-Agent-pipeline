# Job Status State Machine

Legal values for `JobProcessingLog.Status`:

| Status | Meaning | Can transition to |
|---|---|---|
| `Pending` | Row created, not yet picked up by a worker | `Processing`, `Failed` |
| `Processing` | Actively running through the graph | `AwaitingReview`, `Completed`, `Failed` |
| `AwaitingReview` | Hit 3 consecutive INVALID verdicts, escalated to HITL | `Processing` (if a human edits and resubmits), `Completed` (human approves as-is) |
| `Completed` | Terminal success state | *(none — terminal)* |
| `Failed` | Terminal failure state (timeout, crash, unhandled exception) | *(none — terminal)* |

Rules:
- No status may transition to `Pending` once left.
- `Completed` and `Failed` are terminal — no code path may write a new status after either.
- Every transition must be written with `UpdatedAt = GETDATE()` in the same transaction as any accompanying data write (e.g. `FinalSummary`).
