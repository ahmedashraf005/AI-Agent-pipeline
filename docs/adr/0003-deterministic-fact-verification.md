# ADR-0003: Deterministic fact verification after Auditor VALID verdicts

**Status:** Accepted

## Context
An adversarial test document included real deadlines and dollar amounts, then
embedded an instruction telling the model to ignore all deadlines and money.
The Summarizer followed the injected instruction and produced a summary that
omitted the required facts. The Auditor then also followed the injected
instruction and returned a structured `VALID` verdict, even though the summary
explicitly failed the stated compliance rule.

ADR-0002 correctly prevents routing from reading freeform model text, but a
schema-validated verdict is still model judgment. If the model's judgment is
compromised by prompt injection, the verdict can be well-formed JSON and still
be wrong.

## Options considered
1. Strengthen the Summarizer and Auditor prompts again — low effort, but the
   failing test already showed prompt-only framing is insufficient for the
   local `llama3.1:8b` model.
2. Replace the Auditor with deterministic checks — safer for literal facts, but
   too narrow. The Auditor still adds value for semantic and vagueness checks
   that regex cannot cover.
3. Keep the Auditor, but add a deterministic fact-verification gate after
   `VALID` verdicts. Extract date-like strings and dollar amounts from the
   original document, then require each literal fact to appear in the draft
   summary before the graph can complete.

## Decision
Option 3. The Auditor remains the first filter, but `VALID` now routes to a
deterministic fact checker instead of directly completing. The fact checker
uses only regex and string matching, with no LLM call. If any extracted date or
dollar amount is missing from the summary, the job escalates to
`AwaitingReview` immediately instead of retrying the LLM loop.

## Consequences
The system no longer relies on model judgment alone for facts that can be
verified mechanically. Prompt injection can still influence the draft, but it
cannot convince the deterministic gate that a missing literal deadline or
dollar amount is present.

The check is intentionally conservative. It can escalate summaries that
paraphrase or normalize facts instead of copying the literal date or dollar
amount from the source. For this pipeline phase, that is an acceptable
fail-safe tradeoff: false positives go to human review, while false completion
would silently persist an unsafe summary.
