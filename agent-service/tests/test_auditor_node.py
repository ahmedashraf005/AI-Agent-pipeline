from unittest.mock import AsyncMock

import pytest

from graph import nodes


def _state() -> dict:
    return {
        "job_id": "test-job",
        "original_text": "The filing deadline is March 3, 2027.",
        "draft_summary": "The filing deadline is March 3, 2027.",
        "cache_hit": False,
        "audit_verdict": None,
        "fact_check_result": None,
        "iteration_count": 0,
    }


@pytest.mark.asyncio
async def test_auditor_node_parses_well_formed_valid_json(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": '{"status": "VALID", "reason": "complete", "category": "legal"}'}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    result = await nodes.auditor_node(_state())

    assert result["audit_verdict"]["status"] == "VALID"
    assert result["iteration_count"] == 1
    assert result["category"] == "legal"


@pytest.mark.asyncio
async def test_auditor_node_falls_back_to_invalid_on_malformed_json(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "not json"}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    result = await nodes.auditor_node(_state())

    assert result["audit_verdict"]["status"] == "INVALID"
    assert result["audit_verdict"]["reason"] == "Auditor returned malformed output."
    assert result["category"] == "general"


@pytest.mark.asyncio
async def test_auditor_node_uses_json_format_and_deterministic_temperature(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": '{"status": "VALID", "reason": "complete", "category": "general"}'}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    await nodes.auditor_node(_state())

    chat.assert_awaited_once()
    _, kwargs = chat.await_args
    assert kwargs["format"] == "json"
    assert kwargs["options"] == {"temperature": 0}
