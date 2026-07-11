from unittest.mock import AsyncMock

import pytest

from graph import nodes


def _state(audit_verdict=None) -> dict:
    return {
        "job_id": "test-job",
        "original_text": "The filing deadline is March 3, 2027.",
        "draft_summary": None,
        "cache_hit": False,
        "audit_verdict": audit_verdict,
        "fact_check_result": None,
        "iteration_count": 0,
    }


@pytest.mark.asyncio
async def test_summarizer_first_attempt_prompt_has_no_rejection_feedback(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "summary"}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    await nodes.summarizer_node(_state())

    _, kwargs = chat.await_args
    prompt = kwargs["messages"][0]["content"]
    assert "Your previous attempt was rejected" not in prompt


@pytest.mark.asyncio
async def test_summarizer_retry_prompt_includes_audit_rejection_reason(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "summary"}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    await nodes.summarizer_node(
        _state({"status": "INVALID", "reason": "missing deadline"})
    )

    _, kwargs = chat.await_args
    prompt = kwargs["messages"][0]["content"]
    assert "Your previous attempt was rejected" in prompt
    assert "missing deadline" in prompt
