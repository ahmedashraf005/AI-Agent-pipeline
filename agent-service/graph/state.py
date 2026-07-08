"""
Mirrors docs/contracts/graph-state.schema.json exactly.
Decided before Summarizer/Auditor nodes were written, so both sides agree
on shape with nothing implicit.
"""
from typing import Optional, TypedDict, Literal


class AuditVerdict(TypedDict):
    status: Literal["VALID", "INVALID"]
    reason: str


class AgentGraphState(TypedDict):
    job_id: str
    original_text: str          # immutable — never overwritten by any node
    draft_summary: Optional[str]
    audit_verdict: Optional[AuditVerdict]
    iteration_count: int
