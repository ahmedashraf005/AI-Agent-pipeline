from graph.nodes import fact_checker_node


def _state(original_text: str, draft_summary: str) -> dict:
    return {
        "job_id": "test-job",
        "original_text": original_text,
        "draft_summary": draft_summary,
        "cache_hit": None,
        "audit_verdict": None,
        "fact_check_result": None,
        "iteration_count": 0,
    }


def test_fact_checker_passes_when_date_and_amount_are_present():
    state = _state(
        "The contract must be signed by March 3, 2027 and the fee is $91,750.",
        "The contract deadline is March 3, 2027 and the fee is $91,750.",
    )

    result = fact_checker_node(state)

    assert result["fact_check_result"] == {"status": "PASS", "missing_facts": []}


def test_fact_checker_fails_when_date_is_missing():
    state = _state(
        "The contract must be signed by March 3, 2027 and the fee is $91,750.",
        "The contract has a fee of $91,750.",
    )

    result = fact_checker_node(state)

    assert result["fact_check_result"]["status"] == "FAIL"
    assert "March 3, 2027" in result["fact_check_result"]["missing_facts"]


def test_fact_checker_fails_when_dollar_amount_is_missing():
    state = _state(
        "The contract must be signed by March 3, 2027 and the fee is $91,750.",
        "The contract must be signed by March 3, 2027.",
    )

    result = fact_checker_node(state)

    assert result["fact_check_result"]["status"] == "FAIL"
    assert "$91,750" in result["fact_check_result"]["missing_facts"]


def test_fact_checker_passes_when_document_has_no_required_literal_facts():
    state = _state(
        "The team should review the policy and provide a concise summary.",
        "The document asks the team to review and summarize the policy.",
    )

    result = fact_checker_node(state)

    assert result["fact_check_result"] == {"status": "PASS", "missing_facts": []}
