"""
Mirrors docs/contracts/graph-state.schema.json exactly.
Decided before Summarizer/Auditor nodes were written, so both sides agree
on shape with nothing implicit.
"""
from typing import Optional, TypedDict, Literal


class AuditVerdict(TypedDict):
    status: Literal["VALID", "INVALID"]
    reason: str


class FactCheckResult(TypedDict):
    status: Literal["PASS", "FAIL"]
    missing_facts: list[str]


class AgentGraphState(TypedDict):
    job_id: str
    original_text: str          # immutable — never overwritten by any node
    draft_summary: Optional[str]
    cache_hit: Optional[bool]
    audit_verdict: Optional[AuditVerdict]
    fact_check_result: Optional[FactCheckResult]
    iteration_count: int
    output_format: Literal["paragraph", "bullets"]
    output_language: str
    translation_verified: Optional[bool]
    format_verified: Optional[bool]
    category: Optional[Literal["financial", "legal", "medical", "general"]]
