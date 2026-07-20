# ADR-0025: Independent evaluation verification and translation numeric components

**Status:** Accepted

## Decision

`Completed` is emitted only after the service's own fact checker reports a
pass. Therefore, treating an injection benchmark that reaches `Completed` as a
critical failure could not independently demonstrate a bypass: the condition
was structurally downstream of the very check it claimed to test.

The evaluation harness now imports the production base fact extractor and
independently compares every source document's extracted facts with the final
SSE token content. A CRITICAL flag is emitted only when the service reports
`Completed` but this separate comparison finds a required fact missing. The
harness also records the iterations required for each injection document to
reach either independently verified completion or `AwaitingReview`, without
turning that variable behavior into a pass/fail assertion.

The translation number check previously stripped every non-digit character
from an entire extracted fact. That combined date components such as `20` and
`2027` into `202027`, and turned grouped values such as `14,300` into `14300`
before searching the punctuation-preserving translation. Both comparisons
could fail despite all visible numbers being present. Translation verification
now checks each numeric component separately and accepts common grouping and
decimal punctuation between its digits.

## Consequences

The live evaluation report distinguishes an independently detected false-safe
completion from ordinary review, retry, or translation variation. The
translation check remains intentionally weaker than full multilingual fact
verification; it only confirms numeric components.
