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
import os


from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph.graph import compiled_graph
from graph.state import AgentGraphState

load_dotenv()

MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "2"))
job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


class JobSubmission(BaseModel):
    jobId: str
    text: str
    fileName: str


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
    initial_state: AgentGraphState = {
        "job_id": job.jobId,
        "original_text": job.text,
        "draft_summary": None,
        "audit_verdict": None,
        "fact_check_result": None,
        "iteration_count": 0,
    }

    state = dict(initial_state)  # our running copy, updated as nodes complete

    yield sse_event(job.jobId, "status", "Queued — waiting for available capacity")

    async with job_semaphore:
        yield sse_event(job.jobId, "status", "Processing")

        try:
            async for update in compiled_graph.astream(initial_state):
                for node_name, partial_update in update.items():
                    state.update(partial_update)

                    if node_name == "summarizer":
                        attempt = state["iteration_count"] + 1
                        yield sse_event(job.jobId, "status", f"Drafting summary (attempt {attempt})")

                    elif node_name == "auditor":
                        verdict = state["audit_verdict"]
                        yield sse_event(
                            job.jobId, "status",
                            f"Audit result: {verdict['status']} — {verdict['reason']}",
                            state["iteration_count"],
                        )

                    elif node_name == "fact_checker":
                        result = state["fact_check_result"]
                        if result["status"] == "PASS":
                            yield sse_event(job.jobId, "status", "Fact check passed")
                        else:
                            missing = ", ".join(result["missing_facts"])
                            yield sse_event(
                                job.jobId, "status",
                                f"Fact check failed: missing {missing}",
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


@app.post("/process")
async def process(job: JobSubmission):
    return StreamingResponse(stream_summary(job), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
