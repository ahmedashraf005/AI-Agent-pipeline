# ADR-0012: Post-verification summary format and language options

**Status:** Accepted

## Context
The cache, summarizer, auditor, and deterministic fact checker are built around
canonical English paragraph summaries. Applying a requested bullet format or a
translation before caching and verification would either fragment cache entries
by presentation preference or weaken the established English-only factual
guarantee.

Reformatting can accidentally omit a deadline or monetary amount even when the
source paragraph passed verification. Translation creates a harder problem:
the existing fact checker compares English literal facts, so it cannot
realistically provide the same full guarantee for arbitrary target languages.

## Options considered
1. Run formatting and translation before the existing verification pipeline —
   lets preferences affect cache and auditing, but weakens the canonical
   English guarantee.
2. Teach the existing cache, auditor, and fact checker every output language
   and format — expands the trusted core substantially and does not provide a
   credible multilingual literal-fact comparison in this phase.
3. Keep the core pipeline canonical English paragraphs and append optional
   presentation nodes only after a genuine post-fact-check PASS.

## Decision
Option 3. `format_node` runs after `cache_store` only when bullet output was
requested. It asks the model to restructure the verified English paragraph,
then reruns the existing free regex fact checker. If that recheck fails, the
bullet output is discarded and the verified paragraph is returned.

`translate_node` follows `format_node` only when a non-English language code
was requested. It preserves the translated result even when its deliberately
weaker check fails: it takes the facts already extracted by the English fact
checker, strips each to digits, and verifies those digit sequences occur in the
translation. A failure is surfaced as `translation_verified: false`, rather
than represented as an English-level verification guarantee.

The initial interface offers English and Arabic. Arabic is not in Llama 3.1's
officially supported-language list; Meta explicitly lists English, German,
French, Italian, Portuguese, Hindi, Spanish, and Thai, and advises against
non-supported-language use without additional controls. Translation quality and
reliability for Arabic are therefore best-effort and unverified until tested,
not assumed. [Meta Llama 3.1 model card](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/MODEL_CARD.md)

## Consequences
Existing cache keys, cached English summaries, audit behavior, routing, and
fact-check semantics remain unchanged. The standard paragraph-English path
does not make an extra model call and remains silent about the optional nodes.

Bullet summaries retain the original deterministic fact gate after their
presentation transformation. Translations clearly carry a weaker,
numeric-only signal and still complete even if the signal is false; consumers
must not treat it as a full multilingual fact-check result.

## Addendum: empirical evidence of the documented limitation

Manual testing surfaced a concrete instance of the risk described above:
a paragraph/Arabic job returned generally correct, numerically-accurate
output (both the date and the dollar figure survived intact), but with a
single stray CJK character injected mid-word, breaking otherwise fluent
Arabic text. The numeric-only verification check correctly passed this
job, since all figures were present — confirming this is exactly the
class of defect the check was never designed to catch: it validates
numbers, not token-level language fidelity. Given Arabic's unsupported
status in Llama 3.1's model card, this is accepted as expected behavior
for this phase, not treated as a bug to fix.
