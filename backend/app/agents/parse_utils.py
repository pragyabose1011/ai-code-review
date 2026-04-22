"""Shared LLM output parser with Pydantic validation and graceful fallback."""
import json
import re
import uuid
from typing import List, Optional
from pydantic import BaseModel, field_validator, ValidationError
from app.models.schemas import Issue, Severity


class RawIssue(BaseModel):
    """Validates a single issue dict from LLM output before converting to Issue."""
    title: str
    description: str
    severity: str = "warning"
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    code_snippet: Optional[str] = None
    fix: Optional[str] = None
    suggestion: Optional[str] = None
    reference: Optional[str] = None

    @field_validator("severity")
    @classmethod
    def normalise_severity(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ("critical", "warning", "info"):
            return "warning"
        return v

    @field_validator("title", "description")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()

    @field_validator("line_start", "line_end", mode="before")
    @classmethod
    def coerce_line(cls, v):
        if v is None:
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None


SEV_MAP = {
    "critical": Severity.CRITICAL,
    "warning": Severity.WARNING,
    "info": Severity.INFO,
}


def _extract_json(content: str) -> str:
    """Strip markdown fences and find the JSON array in LLM output."""
    content = content.strip()
    # Remove ```json ... ``` or ``` ... ```
    content = re.sub(r"^```[a-z]*\n?", "", content)
    content = re.sub(r"\n?```$", "", content)
    content = content.strip()
    # If the model wrapped the array in extra text, find the first [ ... ]
    match = re.search(r"\[.*\]", content, re.DOTALL)
    if match:
        return match.group(0)
    return content


def parse_issues(content: str, category: str, default_title: str = "Issue") -> List[Issue]:
    """
    Parse LLM JSON output into validated Issue objects.
    - Validates each item with RawIssue Pydantic model
    - Skips (logs) malformed items instead of dropping the whole batch
    - Falls back to empty list if JSON is unparseable
    """
    try:
        data = json.loads(_extract_json(content))
    except (json.JSONDecodeError, ValueError):
        return []

    if not isinstance(data, list):
        return []

    issues: List[Issue] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            raw = RawIssue(**item)
        except ValidationError:
            # Item is malformed — skip it rather than crashing the whole batch
            continue
        issues.append(Issue(
            id=str(uuid.uuid4()),
            title=raw.title,
            description=raw.description,
            severity=SEV_MAP[raw.severity],
            line_start=raw.line_start,
            line_end=raw.line_end,
            code_snippet=raw.code_snippet,
            fix=raw.fix,
            suggestion=raw.suggestion,
            reference=raw.reference,
            category=category,
        ))
    return issues
