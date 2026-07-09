"""
Phase 3, step 0: measure reality before designing concurrency control.

Fires increasing numbers of concurrent chat requests at your local Ollama
instance and reports how latency degrades. The output tells you what
number to actually use for a semaphore/queue limit in Phase 3 -- a real
measurement, not a guess.

Run from agent-service/ with the venv active:
    python scripts/ollama_concurrency_benchmark.py
"""
import asyncio
import os
import time

from ollama import AsyncClient

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
CONCURRENCY_LEVELS = [1, 2, 4, 8]
PROMPT = (
    "Summarize in two sentences: The quarterly report is due Friday. "
    "All vendors must submit invoices by EOD totalling 60,000 AED."
)

client = AsyncClient()


async def timed_request() -> float:
    start = time.perf_counter()
    await client.chat(
        model=OLLAMA_MODEL,
        messages=[{"role": "user", "content": PROMPT}],
    )
    return time.perf_counter() - start


async def run_level(n: int) -> None:
    start = time.perf_counter()
    latencies = await asyncio.gather(*[timed_request() for _ in range(n)])
    wall_time = time.perf_counter() - start

    avg = sum(latencies) / len(latencies)
    worst = max(latencies)

    print(f"\nConcurrency {n}:")
    print(f"  wall time for all {n} to finish : {wall_time:.2f}s")
    print(f"  avg per-request latency          : {avg:.2f}s")
    print(f"  worst per-request latency         : {worst:.2f}s")


async def main():
    print(f"Benchmarking {OLLAMA_MODEL} at concurrency levels {CONCURRENCY_LEVELS}")
    print("(Make sure nothing else is hitting Ollama during this run.)")

    for n in CONCURRENCY_LEVELS:
        await run_level(n)

    print(
        "\nHow to read this: watch where avg/worst latency starts climbing "
        "sharply relative to concurrency 1. The level just BEFORE that "
        "jump is roughly your safe concurrency limit for Phase 3's "
        "semaphore/queue."
    )


if __name__ == "__main__":
    asyncio.run(main())
