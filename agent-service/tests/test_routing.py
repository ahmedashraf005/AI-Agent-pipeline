"""
Pure unit tests for the LangGraph conditional-edge routing functions.
These ARE the self-correcting loop's control-flow decisions -- no LLM
call, no mocking, no I/O. Every case here should run in milliseconds,
and every one of these is something that would have been caught
instantly during manual testing bugs found earlier in this project.
"""
from graph.graph import (
    MAX_ITERATIONS,
    route_after_audit,
    route_after_cache_check,
    route_after_fact_check,
)


def test_cache_hit_routes_to_cache_hit_branch():
    state = {"cache_hit": True}
    assert route_after_cache_check(state) == "cache_hit"


def test_cache_miss_routes_to_cache_miss_branch():
    state = {"cache_hit": False}
    assert route_after_cache_check(state) == "cache_miss"


def test_valid_audit_routes_to_verify_facts():
    state = {"audit_verdict": {"status": "VALID", "reason": ""}, "iteration_count": 1}
    assert route_after_audit(state) == "verify_facts"


def test_invalid_audit_with_retries_remaining_routes_to_retry():
    state = {"audit_verdict": {"status": "INVALID", "reason": "missing deadline"}, "iteration_count": 1}
    assert route_after_audit(state) == "retry"


def test_invalid_audit_at_max_iterations_escalates():
    state = {"audit_verdict": {"status": "INVALID", "reason": "still wrong"}, "iteration_count": MAX_ITERATIONS}
    assert route_after_audit(state) == "escalate"


def test_invalid_audit_one_below_max_iterations_still_retries():
    state = {"audit_verdict": {"status": "INVALID", "reason": "still wrong"}, "iteration_count": MAX_ITERATIONS - 1}
    assert route_after_audit(state) == "retry"


def test_fact_check_pass_routes_to_accept():
    state = {"fact_check_result": {"status": "PASS", "missing_facts": []}}
    assert route_after_fact_check(state) == "accept"


def test_fact_check_fail_escalates():
    state = {"fact_check_result": {"status": "FAIL", "missing_facts": ["$91,750"]}}
    assert route_after_fact_check(state) == "escalate"


def test_fact_check_none_result_escalates():
    # Defensive case: if fact_check_result somehow never got set, don't
    # crash -- treat it as requiring escalation, not a silent pass.
    state = {"fact_check_result": None}
    assert route_after_fact_check(state) == "escalate"
