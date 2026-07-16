# ADR-0015: Category classification and category-aware fact checking

**Status:** Accepted

## Context

The pipeline's deterministic fact checker previously treated every document the
same way: it required literal dates and dollar amounts from the source text to
appear in the summary. That baseline remains useful, but it does not cover
facts that are especially material in some document domains, such as a return
percentage in a financial document or an Article, Section, or Clause reference
in a legal document.

The Auditor already makes one structured LLM call per draft to decide whether
the draft is `VALID` or `INVALID`. Adding a second classification call would
increase latency and model cost solely to label information the Auditor can
provide in the same structured response.

## Decision

The Auditor response now contains one category: `financial`, `legal`,
`medical`, or `general`. It is parsed through the same Pydantic schema as the
audit verdict, so malformed or unrecognised output follows the existing
fail-safe policy: the audit verdict becomes `INVALID` and category defaults to
`general`.

The deterministic fact checker keeps `_extract_required_facts` unchanged as
the base literal-date and literal-dollar check. A category-aware layer adds:

1. `financial`: percentages matching `\d+(\.\d+)?%`.
2. `legal`: case-insensitive Article, Section, or Clause references matching
   `\b(?:Article|Section|Clause)\s+\d+(?:\.\d+)*\b`.
3. `medical` and `general`: no additional patterns yet; they retain only the
   base date/dollar checks.

No account-number-style financial pattern is added. It was considered, but
ordinary document numbers create too high a false-positive risk. Likewise,
the absence of extra medical and general patterns is intentional scope control,
not an assumption that those domains have no important facts.

The agent-service includes the category in the existing Auditor SSE status
event, and the Gateway persists that optional value on `JobProcessingLog`.

## Consequences

Category classification adds no LLM round-trip: it piggybacks on the existing
Auditor call. Financial and legal summaries receive a stricter deterministic
gate before they can reach the successful post-fact-check path.

The classifier is deliberately fail-safe. A malformed category cannot weaken
fact checking by selecting a looser domain; it produces an invalid audit and
uses the conservative `general` category. More domain-specific patterns can be
added later only after evaluating their false-positive and false-negative
behavior.
