from unittest.mock import AsyncMock

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
        "output_format": "paragraph",
        "output_language": "ar",
        "translation_verified": None,
        "format_verified": None,
    }


@pytest.mark.asyncio
async def test_translate_node_marks_translation_verified_when_all_extracted_digits_remain(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "الموعد 32027 والرسوم 91750."}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    result = await nodes.translate_node(_state())

    assert result == {
        "draft_summary": "الموعد 32027 والرسوم 91750.",
        "translation_verified": True,
    }
    _, kwargs = chat.await_args
    assert "Arabic (ar)" in kwargs["messages"][0]["content"]


@pytest.mark.asyncio
async def test_translate_node_flags_translation_when_an_extracted_number_is_missing(monkeypatch):
    chat = AsyncMock(return_value={"message": {"content": "الموعد 32027."}})
    monkeypatch.setattr(nodes.client, "chat", chat)

    result = await nodes.translate_node(_state())

    assert result["draft_summary"] == "الموعد 32027."
    assert result["translation_verified"] is False
