# ADR-0008: Test deterministic code and mock the LLM boundary

**Status:** Accepted

## Context
The pipeline mixes deterministic control-flow code with non-deterministic LLM
calls. Routing decisions, regex-based fact checking, cache failure handling, and
SSE/persistence state transitions should be tested directly because they are
ordinary program logic. Generated summaries and model judgments should not be
asserted in unit tests because they depend on model weights, local runtime
state, and prompt sensitivity.

This project has already found several bugs through manual testing that were
really deterministic code bugs, not model-quality issues.

## Options considered
1. Run automated tests against a live local Ollama model — realistic, but slow,
   environment-dependent, and prone to false failures based on model output.
2. Avoid automated tests around graph behavior — simple, but leaves routing,
   validation, and persistence bugs to be rediscovered manually.
3. Test deterministic code directly and mock the Ollama client boundary for
   node-level prompt and response-handling behavior.

## Decision
Option 3. Pure functions such as routing and deterministic fact checking are
tested with no mocks and no I/O. Nodes that call Ollama are tested by mocking
the module-level client, asserting prompt construction, JSON parsing, fallback
behavior, and call parameters such as `format="json"` and
`options={"temperature": 0}`.

Automated tests never assert on generated model content. They assert on the
code around the model boundary.

## Consequences
The suite runs quickly and does not require live Ollama, Redis, SQL Server, or
the .NET Gateway. It covers the parts of the system that should be stable
across machines and model versions.

This strategy would have caught several real issues earlier: the
`cache_store_node` empty-return violation that broke LangGraph state updates,
the Auditor determinism regression where a second chat call omitted
`temperature=0`, and the Gateway bug that marked an interrupted stream as
terminal `Failed` instead of leaving it resumable.

Full end-to-end graph execution against live Ollama remains a manual or
integration-testing concern. Those tests are still valuable for validating the
local deployment, model availability, Redis, SQLite checkpointing, and SQL
persistence together, but they are intentionally outside this automated unit
suite.
