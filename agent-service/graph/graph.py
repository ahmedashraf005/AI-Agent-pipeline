"""
Wires the two nodes together into an actual state machine.

This file answers exactly one question for each edge: "given the current
state, what runs next?" Read top to bottom, it should read almost like
the plain-English description from the original blueprint:
  Summarizer -> Auditor -> (VALID? done : INVALID? retry, unless 3 tries used -> escalate)
"""
from langgraph.graph import StateGraph, END

from .nodes import auditor_node, fact_checker_node, summarizer_node
from .state import AgentGraphState

MAX_ITERATIONS = 3


def route_after_audit(state: AgentGraphState) -> str:
    """The conditional edge. Returns a node name (or END) — nothing else."""
    verdict = state["audit_verdict"]

    if verdict["status"] == "VALID":
        return "verify_facts"

    if state["iteration_count"] >= MAX_ITERATIONS:
        return "escalate"

    return "retry"


def route_after_fact_check(state: AgentGraphState) -> str:
    result = state["fact_check_result"]

    if result and result["status"] == "PASS":
        return "accept"

    return "escalate"


_builder = StateGraph(AgentGraphState)

_builder.add_node("summarizer", summarizer_node)
_builder.add_node("auditor", auditor_node)
_builder.add_node("fact_checker", fact_checker_node)

_builder.set_entry_point("summarizer")
_builder.add_edge("summarizer", "auditor")  # always audit right after drafting

_builder.add_conditional_edges(
    "auditor",
    route_after_audit,
    {
        "verify_facts": "fact_checker",  # VALID -> deterministic fact gate
        "retry": "summarizer",  # INVALID, tries remain -> redraft with feedback
        "escalate": END,     # INVALID, 3 tries used -> stop looping (HITL, phase 1.5)
    },
)

_builder.add_conditional_edges(
    "fact_checker",
    route_after_fact_check,
    {
        "accept": END,       # Auditor VALID + deterministic pass -> done
        "escalate": END,     # Auditor VALID but missing facts -> HITL
    },
)

compiled_graph = _builder.compile()
