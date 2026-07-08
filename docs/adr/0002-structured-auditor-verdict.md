# ADR-0002: Auditor verdict must be schema-validated JSON, never freeform text

**Status:** Accepted

## Context
The Auditor node evaluates a draft summary derived from *untrusted* input:
an uploaded document could contain adversarial text such as an instruction
telling the model to mark any summary as compliant. If the routing logic
reads the Auditor's raw text output looking for a keyword, an injected
sentence in the source document could talk the Auditor into a false VALID
verdict.

## Options considered
1. Auditor returns freeform text; routing does a keyword/regex check for
   "VALID"/"INVALID" — simple, but exactly the surface a prompt injection
   can exploit.
2. Auditor is forced to return a Pydantic-validated JSON object
   ({status: VALID|INVALID, reason: string}); routing reads only
   verdict.status, never raw model text.

## Decision
Option 2. The document's own text is also explicitly wrapped and labeled
as untrusted data in the Auditor's prompt (not concatenated as if it were
part of the instruction), separate from the evaluation instructions.

## Consequences
Slightly more setup (schema + retry-on-malformed-output handling), but the
routing decision can never be steered by text embedded in the document
itself, only by a validated enum. This is the single highest-value defense
in the whole pipeline given the system ingests arbitrary uploaded text.
