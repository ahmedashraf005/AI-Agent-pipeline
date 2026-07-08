# ADR-0001: Semantic cache hits still pass through the Auditor node

**Status:** Accepted

## Context
The original design fully bypasses the LangGraph loop on a >95% semantic
similarity match in Redis, returning the cached summary instantly. But
similarity is not equivalence: two documents can score 96% similar and still
differ in the one field that matters (a deadline, a dollar figure, a name).
A full bypass would return a wrong answer with total confidence and no
way to catch it.

## Options considered
1. Full bypass on cache hit (original blueprint) — fastest, but silently
   wrong on high-similarity-but-not-identical documents.
2. Cache hit skips the Summarizer but still runs the Auditor node against
   the cached draft + the new document's actual text.
3. Never trust cache above a similarity threshold, always regenerate —
   defeats the purpose of caching entirely.

## Decision
Option 2. Cache hit skips the expensive Summarizer call but the cached
draft is still checked by the Auditor against the *new* document, not
the original one that produced the cache entry.

## Consequences
Cache hits are slightly slower than an instant bypass (one Auditor call,
not zero), but a cache hit can never silently return a wrong summary. The
system fails safe: if the Auditor flags a mismatch, it falls through to a
normal Summarizer run, same as a cache miss.
