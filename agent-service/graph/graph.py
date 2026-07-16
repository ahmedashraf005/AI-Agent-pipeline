"""
Wires the two nodes together into an actual state machine.

This file answers exactly one question for each edge: "given the current
state, what runs next?" Read top to bottom, it should read almost like
the plain-English description from the original blueprint:
  Cache check -> Summarizer? -> Auditor -> Fact check -> Cache store?
"""
from typing import Any

from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.graph import StateGraph, END

from .cache import CHECKPOINT_REDIS_URL
from .nodes import (
    auditor_node,
    cache_check_node,
    cache_store_node,
    fact_checker_node,
    format_node,
    summarizer_node,
    translate_node,
)
from .state import AgentGraphState

MAX_ITERATIONS = 3

_checkpoint_context = None
_checkpointer: AsyncRedisSaver | None = None
compiled_graph: Any = None


def route_after_cache_check(state: AgentGraphState) -> str:
    if state["cache_hit"]:
        return "cache_hit"

    return "cache_miss"


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

_builder.add_node("cache_check", cache_check_node)
_builder.add_node("summarizer", summarizer_node)
_builder.add_node("auditor", auditor_node)
_builder.add_node("fact_checker", fact_checker_node)
_builder.add_node("cache_store", cache_store_node)
_builder.add_node("format_node", format_node)
_builder.add_node("translate_node", translate_node)

_builder.set_entry_point("cache_check")
_builder.add_conditional_edges(
    "cache_check",
    route_after_cache_check,
    {
        "cache_hit": "auditor",
        "cache_miss": "summarizer",
    },
)
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
        "accept": "cache_store",  # Auditor VALID + deterministic pass -> cache then done
        "escalate": END,     # Auditor VALID but missing facts -> HITL
    },
)

_builder.add_edge("cache_store", "format_node")
_builder.add_edge("format_node", "translate_node")
_builder.add_edge("translate_node", END)


async def initialize_checkpointer() -> None:
    global _checkpoint_context, _checkpointer, compiled_graph

    if compiled_graph is not None:
        return

    _checkpoint_context = AsyncRedisSaver.from_conn_string(CHECKPOINT_REDIS_URL)
    _checkpointer = await _checkpoint_context.__aenter__()
    compiled_graph = _builder.compile(checkpointer=_checkpointer)


async def close_checkpointer() -> None:
    global _checkpoint_context, _checkpointer, compiled_graph

    if _checkpoint_context is not None:
        await _checkpoint_context.__aexit__(None, None, None)

    _checkpoint_context = None
    _checkpointer = None
    compiled_graph = None


def thread_config(job_id: str) -> dict:
    return {"configurable": {"thread_id": job_id}}


def get_compiled_graph():
    if compiled_graph is None:
        raise RuntimeError("LangGraph checkpointer has not been initialized.")

    return compiled_graph


async def get_checkpoint_tuple(config: dict):
    if _checkpointer is None:
        await initialize_checkpointer()

    if _checkpointer is None:
        raise RuntimeError("LangGraph checkpointer has not been initialized.")

    return await _checkpointer.aget_tuple(config)
