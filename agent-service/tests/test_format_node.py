from unittest.mock import AsyncMock, Mock

import pytest

from graph import nodes


def _state() -> dict:
    return {
        "job_id": "test-job",
        "original_text": "The filing deadline is March 3, 2027 and the fee is $91,750.",
        "draft_summary": "The filing deadline is March 3, 2027 and the fee is $91,750.",
        "cache_hit": False,
        "audit_verdict": {"status": "VALID", "reason": "complete"},
        "fact_check_result": {"status": "PASS", "missing_facts": []},
        "iteration_count": 1,
        "output_format": "bullets",
        "output_language": "en",
        "translation_verified": None,
        "format_verified": None,
    }


@pytest.mark.asyncio
async def test_format_node_keeps_reformatted_summary_when_fact_recheck_passes(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "- Deadline: March 3, 2027\n- Fee: $91,750"}})
    recheck = Mock(return_value={"fact_check_result": {"status": "PASS", "missing_facts": []}})
    monkeypatch.setattr(nodes.client, "chat", chat)
    monkeypatch.setattr(nodes, "fact_checker_node", recheck)

    result = await nodes.format_node(_state())

    assert result == {
        "draft_summary": "- Deadline: March 3, 2027\n- Fee: $91,750",
        "format_verified": True,
    }
    recheck.assert_called_once()


@pytest.mark.asyncio
async def test_format_node_discards_reformat_when_fact_recheck_fails(monkeypatch):
    state = _state()
    chat = AsyncMock(return_value={"message": {"content": "- Deadline: March 3, 2027"}})
    recheck = Mock(
        return_value={"fact_check_result": {"status": "FAIL", "missing_facts": ["$91,750"]}}
    )
    monkeypatch.setattr(nodes.client, "chat", chat)
    monkeypatch.setattr(nodes, "fact_checker_node", recheck)

    result = await nodes.format_node(state)

    assert result == {
        "draft_summary": state["draft_summary"],
        "format_verified": False,
    }
    recheck.assert_called_once()
