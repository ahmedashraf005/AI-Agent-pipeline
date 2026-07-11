# ADR-0006: Redis semantic cache implementation

**Status:** Accepted

## Context
ADR-0001 decided the semantic-cache safety rule: cache hits may skip the
Summarizer, but they must still pass through the Auditor against the current
document and then through deterministic fact verification. That ADR did not
choose the embedding model, vector index, threshold, or failure behavior needed
to implement the cache.

The cache is an optimization around expensive local Ollama summarization, not a
source of truth. It must improve repeated-work latency without making the
pipeline less reliable when Redis, RediSearch, or embedding lookup has a
problem.

## Options considered
1. Reuse the chat model for embeddings — fewer model names to configure, but
   chat models are not purpose-built embedding models and can be larger than
   necessary for similarity search.
2. Use `nomic-embed-text` for embeddings with Redis Stack RediSearch HNSW/COSINE
   vector search and a 0.95 similarity threshold.
3. Treat Redis cache failures as job failures — exposes infrastructure problems
   loudly, but lets an optional acceleration layer break the core processing
   pipeline.

## Decision
Option 2. The agent service embeds original document text with
`nomic-embed-text`, stores accepted summaries in Redis hashes under `doc:*`,
indexes vectors with RediSearch HNSW using COSINE distance, and treats matches
at or above 0.95 similarity as cache hits.

Cache lookups and writes are best effort. A lookup failure behaves like a cache
miss, and a write failure is ignored after the job has already produced a valid
result.

## Consequences
The cache uses a small, purpose-built embedding model that is independent from
the chat model used by the Summarizer and Auditor. That keeps similarity search
configuration separate from generation quality decisions.

HNSW/COSINE is a practical fit for nearest-neighbor document lookup in Redis
Stack: it supports approximate vector search with cosine distance, which maps
directly to the semantic-similarity threshold from the original blueprint.

The 0.95 threshold is intentionally conservative. It should only reuse drafts
for very similar documents, and ADR-0001's validation path still protects
against high-similarity documents that differ in critical facts.

A broken cache cannot break the pipeline. Redis outages, missing indexes, query
errors, or write failures degrade to normal summarization behavior because the
cache is a performance optimization, not a correctness dependency.
