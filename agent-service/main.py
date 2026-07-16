"""
Phase 1: drives the real LangGraph loop instead of one raw Ollama call.

Streaming design: we no longer stream raw tokens live from the Summarizer,
because a draft that the Auditor rejects and rewrites is a draft the user
never should have seen. Instead we stream a status update after each node
finishes, and only stream the actual summary text once the graph lands on
VALID (or gives up after MAX_ITERATIONS and escalates).
"""


import asyncio
import json
import logging
import os
from typing import Literal


from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph.graph import (
    close_checkpointer,
    get_checkpoint_tuple,
    get_compiled_graph,
    initialize_checkpointer,
    thread_config,
)
from graph.state import AgentGraphState

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "2"))
job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


class JobSubmission(BaseModel):
    jobId: str
    text: str
    fileName: str
    output_format: Literal["paragraph", "bullets"] = "paragraph"
    output_language: str = "en"


def sse_event(
    job_id: str,
    event_type: str,
    content: str,
    iteration_count: int | None = None,
) -> str:
    """Matches docs/contracts/stream-chunk.schema.json exactly."""
    payload = {"jobId": job_id, "type": event_type, "content": content}
    if iteration_count is not None:
        payload["iterationCount"] = iteration_count

    return f"data: {json.dumps(payload)}\n\n"


async def stream_summary(job: JobSubmission):
    config = thread_config(job.jobId)
    checkpoint = await get_checkpoint_tuple(config)

    base_state: AgentGraphState = {
        "job_id": job.jobId,
        "original_text": job.text,
        "draft_summary": None,
        "cache_hit": None,
        "audit_verdict": None,
        "fact_check_result": None,
        "iteration_count": 0,
        "output_format": job.output_format,
        "output_language": job.output_language.lower(),
        "translation_verified": None,
        "format_verified": None,
    }

    graph_input: AgentGraphState | None
    graph = get_compiled_graph()

    if checkpoint is not None:
        yield sse_event(job.jobId, "status", "Resuming from checkpoint (crash recovery)")
        snapshot = await graph.aget_state(config)
        state = {**base_state, **snapshot.values}
        graph_input = None
    else:
        state = dict(base_state)  # our running copy, updated as nodes complete
        graph_input = base_state

    yield sse_event(job.jobId, "status", "Queued — waiting for available capacity")

    async with job_semaphore:
        logger.info("Job %s started processing", job.jobId)
        yield sse_event(job.jobId, "status", "Processing")

        try:
            async for update in graph.astream(graph_input, config=config):
                for node_name, partial_update in update.items():
                    state.update(partial_update)

                    if node_name == "cache_check":
                        logger.info("Job %s completed cache_check node", job.jobId)
                        if state["cache_hit"]:
                            yield sse_event(job.jobId, "status", "Cache hit — reusing prior summary")
                        else:
                            yield sse_event(job.jobId, "status", "Cache miss — drafting new summary")

                    elif node_name == "summarizer":
                        logger.info("Job %s completed summarizer node", job.jobId)
                        attempt = state["iteration_count"] + 1
                        yield sse_event(job.jobId, "status", f"Drafting summary (attempt {attempt})")

                    elif node_name == "auditor":
                        logger.info("Job %s completed auditor node", job.jobId)
                        verdict = state["audit_verdict"]
                        yield sse_event(
                            job.jobId, "status",
                            f"Audit result: {verdict['status']} — {verdict['reason']}",
                            state["iteration_count"],
                        )

                    elif node_name == "fact_checker":
                        logger.info("Job %s completed fact_checker node", job.jobId)
                        result = state["fact_check_result"]
                        if result["status"] == "PASS":
                            yield sse_event(job.jobId, "status", "Fact check passed")
                        else:
                            missing = ", ".join(result["missing_facts"])
                            yield sse_event(
                                job.jobId, "status",
                                f"Fact check failed: missing {missing}",
                            )

                    elif node_name == "cache_store":
                        logger.info("Job %s completed cache_store node", job.jobId)
                        yield sse_event(job.jobId, "status", "Cached result for future reuse")

                    elif node_name == "format_node" and state["output_format"] == "bullets":
                        logger.info("Job %s completed format_node", job.jobId)
                        yield sse_event(job.jobId, "status", "Reformatting summary")
                        if state["format_verified"]:
                            yield sse_event(job.jobId, "status", "Reformat verified")
                        else:
                            yield sse_event(job.jobId, "status", "Reformat check failed, kept original")

                    elif node_name == "translate_node" and state["output_language"] != "en":
                        logger.info("Job %s completed translate_node", job.jobId)
                        yield sse_event(job.jobId, "status", "Translating summary")
                        if state["translation_verified"]:
                            yield sse_event(job.jobId, "status", "Translation verified")
                        else:
                            yield sse_event(
                                job.jobId,
                                "status",
                                "Translation verified: could not confirm all figures",
                            )

            verdict = state["audit_verdict"]
            fact_check = state["fact_check_result"]
            if (
                verdict
                and verdict["status"] == "VALID"
                and fact_check
                and fact_check["status"] == "PASS"
            ):
                yield sse_event(job.jobId, "status", "Completed")
            else:
                # Either retries were exhausted or deterministic verification failed.
                yield sse_event(job.jobId, "status", "AwaitingReview")

            yield sse_event(job.jobId, "token", state["draft_summary"] or "")

        except Exception as exc:  # noqa: BLE001 — still a broad catch at this stage
            yield sse_event(job.jobId, "error", str(exc))


app = FastAPI()


@app.on_event("startup")
async def startup() -> None:
    await initialize_checkpointer()


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_checkpointer()


@app.post("/process")
async def process(job: JobSubmission):
    return StreamingResponse(stream_summary(job), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
