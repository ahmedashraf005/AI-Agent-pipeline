"""Run the live Ollama benchmark against the deployed agent-service endpoint.

This is intentionally an on-demand evaluation harness, not a pytest test.
Run it from agent-service with: python eval/run_benchmark.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import json
import statistics
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from graph.nodes import _extract_required_facts


EVAL_DIR = Path(__file__).resolve().parent
BENCHMARK_PATH = EVAL_DIR / "benchmark_documents.json"
REPORTS_DIR = EVAL_DIR / "reports"
DEFAULT_ENDPOINT = "http://localhost:8000/process"


def load_documents() -> list[dict[str, Any]]:
    with BENCHMARK_PATH.open(encoding="utf-8") as benchmark_file:
        benchmark = json.load(benchmark_file)

    documents = benchmark.get("documents")
    if not isinstance(documents, list):
        raise ValueError("benchmark_documents.json must contain a documents list")

    return documents


def order_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Preserve source order while guaranteeing each cache pair runs first → second."""
    pair_firsts = {
        document["pair_id"]: document
        for document in documents
        if document.get("pair_role") == "first" and document.get("pair_id")
    }
    ordered: list[dict[str, Any]] = []
    emitted_ids: set[str] = set()

    for document in documents:
        document_id = document["id"]
        pair_id = document.get("pair_id")

        if document.get("pair_role") == "second" and pair_id:
            first = pair_firsts.get(pair_id)
            if first is None:
                raise ValueError(f"Pair {pair_id!r} has a second document but no first document")
            if first["id"] not in emitted_ids:
                ordered.append(first)
                emitted_ids.add(first["id"])

        if document_id not in emitted_ids:
            ordered.append(document)
            emitted_ids.add(document_id)

    return ordered


def parse_event(payload: dict[str, Any], result: dict[str, Any]) -> None:
    """Capture the current SSE contract without depending on graph internals."""
    event_type = payload.get("type")
    content = payload.get("content", "")

    if payload.get("iterationCount") is not None:
        result["iteration_count"] = payload["iterationCount"]
    if payload.get("category") is not None:
        result["category"] = payload["category"]

    if event_type == "error":
        result["errors"].append(content)
        return

    if event_type == "token":
        result["final_token_content"] = content
        return

    if event_type != "status":
        return

    result["status_lines"].append(content)
    if content in {"Completed", "AwaitingReview"}:
        result["final_status"] = content
    if "Cache hit" in content:
        result["cache_hit"] = True
    elif "Cache miss" in content:
        result["cache_miss"] = True

    if content == "Fact check passed":
        result["fact_check_outcome"] = "passed"
    elif content.startswith("Fact check failed: missing "):
        result["fact_check_outcome"] = "failed"

    if content == "Translation verified":
        result["translation_verified"] = True
    elif content == "Translation verified: could not confirm all figures":
        result["translation_verified"] = False

    if content == "Reformat verified":
        result["format_verified"] = True
    elif content == "Reformat check failed, kept original":
        result["format_verified"] = False


def independently_verify_facts(original_text: str, final_text: str | None) -> dict[str, Any]:
    """Re-run production's base fact extraction without trusting SSE status text."""
    required_facts = _extract_required_facts(original_text)
    if final_text is None:
        return {
            "outcome": "not_evaluated",
            "required_facts": required_facts,
            "missing_facts": None,
        }

    missing_facts = [fact for fact in required_facts if fact not in final_text]
    return {
        "outcome": "passed" if not missing_facts else "failed",
        "required_facts": required_facts,
        "missing_facts": missing_facts,
    }


async def run_document(client: httpx.AsyncClient, endpoint: str, document: dict[str, Any]) -> dict[str, Any]:
    run_options = {"output_format": "paragraph", "output_language": "en"}
    run_options.update(document.get("run_options", {}))
    job_id = str(uuid.uuid4())
    request_payload = {
        "jobId": job_id,
        "text": document["text"],
        "fileName": f"benchmark-{document['id']}.txt",
        **run_options,
    }
    result: dict[str, Any] = {
        "id": document["id"],
        "job_id": job_id,
        "category_hint": document.get("category_hint"),
        "test_focus": document.get("test_focus"),
        "run_options": run_options,
        "final_status": None,
        "iteration_count": None,
        "category": None,
        "cache_hit": False,
        "cache_miss": False,
        "fact_check_outcome": None,
        "translation_verified": None,
        "format_verified": None,
        "final_token_content": None,
        "independent_fact_check": None,
        "errors": [],
        "status_lines": [],
        "raw_events": [],
    }

    try:
        async with client.stream("POST", endpoint, json=request_payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue

                raw_payload = line.removeprefix("data: ")
                try:
                    event = json.loads(raw_payload)
                except json.JSONDecodeError as exc:
                    result["errors"].append(f"Invalid SSE JSON: {exc}")
                    result["raw_events"].append({"raw": line, "payload": None})
                    continue

                result["raw_events"].append({"raw": line, "payload": event})
                parse_event(event, result)
    except (httpx.HTTPError, httpx.TransportError, httpx.TimeoutException) as exc:
        result["errors"].append(f"HTTP/SSE error: {exc}")

    if run_options["output_language"] != "en":
        result["independent_fact_check"] = {
            "outcome": "passed" if result["translation_verified"] else "failed",
            "required_facts": None,
            "missing_facts": None,
        }
    else:
        result["independent_fact_check"] = independently_verify_facts(document["text"], result["final_token_content"])
    return result


def critical_flags_for(result: dict[str, Any]) -> list[str]:
    independent_check = result["independent_fact_check"]
    if (
        result["run_options"]["output_language"] != "en"
        and result["final_status"] == "Completed"
        and independent_check["outcome"] == "failed"
    ):
        return [f"{result['id']}: pipeline reported Completed but translation verification failed"]

    if result["final_status"] == "Completed" and independent_check["outcome"] == "failed":
        missing = ", ".join(independent_check["missing_facts"])
        return [
            f"{result['id']}: pipeline reported Completed but independent fact verification missed {missing}"
        ]

    return []


def build_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    critical_flags = [flag for result in results for flag in critical_flags_for(result)]
    iterations = [result["iteration_count"] for result in results if result["iteration_count"] is not None]
    iso_results = [result for result in results if result["id"].startswith("iso_date_reformatting_known_limitation_")]
    injection_results = [result for result in results if result["id"].startswith("prompt_injection_")]
    by_id = {result["id"]: result for result in results}
    completed_checks = [
        result["independent_fact_check"]
        for result in results
        if result["final_status"] == "Completed" and result["independent_fact_check"]["outcome"] != "not_evaluated"
    ]
    independently_verified_completed = sum(check["outcome"] == "passed" for check in completed_checks)

    return {
        "completed_count": sum(result["final_status"] == "Completed" for result in results),
        "awaiting_review_count": sum(result["final_status"] == "AwaitingReview" for result in results),
        "error_count": sum(bool(result["errors"]) for result in results),
        "avg_iterations": statistics.mean(iterations) if iterations else None,
        "critical_flags": critical_flags,
        "independent_fact_verification": {
            "completed_with_final_text": len(completed_checks),
            "verified_completed": independently_verified_completed,
            "disagreement_count": len(completed_checks) - independently_verified_completed,
            "agreement_rate": (
                independently_verified_completed / len(completed_checks) if completed_checks else None
            ),
        },
        "non_assertion_tracking": {
            "iso_date_reformatting": {
                "total": len(iso_results),
                "awaiting_review_count": sum(result["final_status"] == "AwaitingReview" for result in iso_results),
                "awaiting_review_rate": (
                    sum(result["final_status"] == "AwaitingReview" for result in iso_results) / len(iso_results)
                    if iso_results
                    else None
                ),
            },
            "arabic_translation_target_translation_verified": by_id.get("arabic_translation_target", {}).get(
                "translation_verified"
            ),
            "bullet_format_target_format_verified": by_id.get("bullet_format_target", {}).get("format_verified"),
            "retry_inducing_vague_document_iteration_count": by_id.get("retry_inducing_vague_document", {}).get(
                "iteration_count"
            ),
            "prompt_injection_safe_state_iterations": {
                result["id"]: {
                    "iteration_count": result["iteration_count"],
                    "safe_state": (
                        "completed_with_facts_verified"
                        if result["final_status"] == "Completed"
                        and result["independent_fact_check"]["outcome"] == "passed"
                        else "awaiting_review"
                        if result["final_status"] == "AwaitingReview"
                        else None
                    ),
                }
                for result in injection_results
            },
        },
    }


async def run_benchmark(endpoint: str) -> Path:
    documents = order_documents(load_documents())
    timeout = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=30.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        results = []
        for document in documents:
            results.append(await run_document(client, endpoint, document))

    completed_at = datetime.now(UTC)
    summary = build_summary(results)
    report = {
        "started_endpoint": endpoint,
        "completed_at": completed_at.isoformat(),
        "document_count": len(results),
        "results": results,
        "summary": summary,
    }
    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / f"benchmark-{completed_at.strftime('%Y%m%dT%H%M%SZ')}.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    independent_verification = summary["independent_fact_verification"]
    if independent_verification["agreement_rate"] is None:
        print("Independent fact-verification agreement: not evaluated")
    else:
        print(
            "Independent fact-verification agreement: "
            f"{independent_verification['verified_completed']}/"
            f"{independent_verification['completed_with_final_text']} "
            f"({independent_verification['agreement_rate']:.0%})"
        )
    if summary["critical_flags"]:
        print("CRITICAL flags:")
        for flag in summary["critical_flags"]:
            print(f"- {flag}")
    else:
        print("CRITICAL flags: none")

    return report_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the live agent-service benchmark sequentially.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="Agent-service /process endpoint")
    args = parser.parse_args()
    asyncio.run(run_benchmark(args.endpoint))


if __name__ == "__main__":
    main()
