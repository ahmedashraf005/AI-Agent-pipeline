"""
Semantic cache backed by Redis + RediSearch vector similarity, per
ADR-0001 (cache hits still pass through the Auditor, never bypass it
outright) and ADR-0006 (this implementation's specific choices).
"""
import os
from urllib.parse import urlsplit, urlunsplit

import numpy as np
import redis
from redis.commands.search.field import TextField, VectorField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType
from redis.commands.search.query import Query

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
EMBEDDING_DIM = 768  # nomic-embed-text's output dimension
SIMILARITY_THRESHOLD = 0.95  # matches the original blueprint's >95% bar

INDEX_NAME = "doc_cache_idx"
KEY_PREFIX = "doc:"


def redis_url_for_db(db_index: int) -> str:
    parts = urlsplit(REDIS_URL)
    return urlunsplit((parts.scheme, parts.netloc, f"/{db_index}", parts.query, parts.fragment))


CACHE_REDIS_URL = redis_url_for_db(0)
CHECKPOINT_REDIS_URL = redis_url_for_db(0)
LOCK_REDIS_URL = redis_url_for_db(1)

_redis_client = redis.from_url(CACHE_REDIS_URL)


def ensure_index() -> None:
    """Idempotent: creates the vector index once, does nothing if it
    already exists. Safe to call on every service startup."""
    try:
        _redis_client.ft(INDEX_NAME).info()
    except Exception:
        try:
            schema = (
                TextField("draft_summary"),
                VectorField(
                    "embedding",
                    "HNSW",
                    {
                        "TYPE": "FLOAT32",
                        "DIM": EMBEDDING_DIM,
                        "DISTANCE_METRIC": "COSINE",
                    },
                ),
            )
            _redis_client.ft(INDEX_NAME).create_index(
                schema,
                definition=IndexDefinition(prefix=[KEY_PREFIX], index_type=IndexType.HASH),
            )
        except Exception:
            pass


def _to_vector_bytes(embedding: list) -> bytes:
    return np.array(embedding, dtype=np.float32).tobytes()


def find_similar(embedding: list):
    """Returns a cached draft_summary string if a sufficiently similar
    document exists, else None. Never raises on a Redis/query problem --
    a cache lookup failure should degrade to a normal cache miss, not
    crash the job."""
    try:
        query = (
            Query("*=>[KNN 1 @embedding $vec AS score]")
            .sort_by("score")
            .return_fields("draft_summary", "score")
            .dialect(2)
        )
        results = _redis_client.ft(INDEX_NAME).search(
            query, query_params={"vec": _to_vector_bytes(embedding)}
        )
        if not results.docs:
            return None

        doc = results.docs[0]
        similarity = 1 - float(doc.score)
        if similarity >= SIMILARITY_THRESHOLD:
            return doc.draft_summary
        return None
    except Exception:
        return None


def store(job_id: str, embedding: list, draft_summary: str) -> None:
    """Best-effort cache write -- a failure here should never fail the
    job itself, since the cache is an optimization, not a correctness
    requirement."""
    try:
        _redis_client.hset(
            f"{KEY_PREFIX}{job_id}",
            mapping={
                "embedding": _to_vector_bytes(embedding),
                "draft_summary": draft_summary,
            },
        )
    except Exception:
        pass
