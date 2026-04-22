"""Agent 5: Synthesizer — combines all agent outputs into a structured review report."""
import os
import uuid
from typing import List
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from app.models.schemas import Issue, ReviewReport, Severity


SYNTHESIZER_PROMPT = """You are a lead code reviewer. Given security and quality issues found in a code review,
write a concise executive summary (2-4 sentences) covering:
1. Overall code health assessment
2. The most critical concerns
3. General recommendation

Be direct and actionable. Do not use markdown formatting."""


def _title_keywords(title: str) -> set:
    stop = {"the", "a", "an", "is", "in", "of", "for", "to", "and", "or"}
    return {w.lower() for w in title.split() if w.lower() not in stop}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _deduplicate_issues(issues: List[Issue]) -> List[Issue]:
    """Merge issues from different agents that refer to the same problem."""
    used = set()
    result = []

    for i, issue in enumerate(issues):
        if i in used:
            continue
        group = [issue]
        kw_i = _title_keywords(issue.title)

        for j, other in enumerate(issues):
            if j <= i or j in used:
                continue
            # Same line range (within 2 lines) + similar title → duplicate
            lines_match = (
                issue.line_start is not None
                and other.line_start is not None
                and abs(issue.line_start - other.line_start) <= 2
            )
            title_sim = _jaccard(kw_i, _title_keywords(other.title))
            if lines_match and title_sim >= 0.45:
                group.append(other)
                used.add(j)

        used.add(i)

        if len(group) == 1:
            issue.confidence = 1
            result.append(issue)
        else:
            # Merge: pick most severe, longest description, combine categories
            merged = max(group, key=lambda x: ["info", "warning", "critical"].index(x.severity))
            longest_desc = max(group, key=lambda x: len(x.description))
            merged = merged.model_copy(update={
                "id": str(uuid.uuid4()),
                "description": longest_desc.description,
                "suggestion": next((g.suggestion for g in group if g.suggestion), merged.suggestion),
                "confidence": len(group),
                "category": "security" if any(g.category == "security" for g in group) else "quality",
            })
            result.append(merged)

    return result


def _calculate_score(issues: List[Issue]) -> int:
    deductions = {Severity.CRITICAL: 15, Severity.WARNING: 5, Severity.INFO: 1}
    # High-confidence issues count more
    total = sum(deductions.get(i.severity, 0) * (1.3 if i.confidence >= 2 else 1.0) for i in issues)
    return max(0, round(100 - total))


async def run_synthesizer(state: dict) -> dict:
    llm = ChatOllama(model="llama3", temperature=0, base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"))

    security_issues = [Issue(**i) for i in state.get("security_issues", [])]
    quality_issues = [Issue(**i) for i in state.get("quality_issues", [])]
    all_issues = _deduplicate_issues(security_issues + quality_issues)

    critical = [i for i in all_issues if i.severity == Severity.CRITICAL]
    warnings = [i for i in all_issues if i.severity == Severity.WARNING]
    infos = [i for i in all_issues if i.severity == Severity.INFO]

    score = _calculate_score(all_issues)
    language = state.get("language", "unknown")
    code = state["code"]
    total_lines = len(code.split("\n"))
    chunks = state.get("chunks", [])

    issues_summary = "\n".join([
        f"- [{i.severity.upper()}] {i.title}: {i.description[:100]}"
        for i in all_issues[:15]
    ]) or "No issues found."

    messages = [
        SystemMessage(content=SYNTHESIZER_PROMPT),
        HumanMessage(content=f"""Code language: {language}
Total lines: {total_lines}
Score: {score}/100
Critical issues: {len(critical)}
Warnings: {len(warnings)}
Info: {len(infos)}

Issues found:
{issues_summary}

Write the executive summary.""")
    ]

    response = await llm.ainvoke(messages)
    summary = response.content.strip()

    report = ReviewReport(
        language=language,
        total_lines=total_lines,
        chunks_analyzed=len(chunks),
        issues=all_issues,
        summary=summary,
        score=score,
        critical_count=len(critical),
        warning_count=len(warnings),
        info_count=len(infos)
    )

    return {**state, "final_report": report.model_dump()}
