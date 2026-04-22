"""Agent 3: Security Agent — checks for vulnerabilities using LLM + CVE tool."""
import json
import os
import uuid
import asyncio
from typing import List
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from app.tools.cve_checker import check_cve
from app.models.schemas import Issue, Severity


SECURITY_SYSTEM_PROMPT = """You are a senior application security engineer specializing in code security review.
Analyze code for security vulnerabilities. Be precise and focus on real issues, not theoretical ones.

For each vulnerability found, respond with a JSON array of issues:
[
  {
    "title": "Short vulnerability name",
    "description": "Detailed explanation of the vulnerability",
    "severity": "critical|warning|info",
    "line_start": <line number or null>,
    "line_end": <line number or null>,
    "code_snippet": "The exact vulnerable code snippet from the source",
    "fix": "The corrected replacement code snippet (same scope as code_snippet, ready to paste in)",
    "suggestion": "One sentence explaining what changed and why",
    "reference": "CWE or OWASP reference"
  }
]

Focus on: SQL injection, XSS, command injection, hardcoded secrets, insecure deserialization,
path traversal, SSRF, broken authentication, cryptography misuse, insecure randomness.

If no security issues found, return an empty array [].
Return ONLY valid JSON, no markdown formatting."""


async def run_security_agent(state: dict) -> dict:
    llm = ChatOllama(model="llama3", temperature=0, base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    code = state["code"]
    language = state.get("language", "unknown")
    rag_context = state.get("rag_context", [])

    context_text = "\n".join(rag_context[:4]) if rag_context else ""

    # Run CVE check tool
    cve_result = await check_cve.ainvoke({"code": code, "language": language})

    prompt = f"""Review this {language} code for security vulnerabilities.

Relevant security guidelines:
{context_text}

Code to review:
```{language}
{code}
```

CVE Check Results:
{json.dumps(cve_result, indent=2)}

Identify all security issues. Return JSON array only."""

    messages = [
        SystemMessage(content=SECURITY_SYSTEM_PROMPT),
        HumanMessage(content=prompt)
    ]

    response = await llm.ainvoke(messages)
    issues = _parse_issues(response.content, "security")

    # Add CVE findings as issues
    for vuln in cve_result.get("vulnerabilities", []):
        issues.append(Issue(
            id=str(uuid.uuid4()),
            title=f"Vulnerable Dependency: {vuln['package']}",
            description=f"{vuln['description']} ({vuln['cve_id']})",
            severity=Severity.CRITICAL if vuln["severity"] in ("CRITICAL", "HIGH") else Severity.WARNING,
            suggestion=f"Update or replace the {vuln['package']} package. Check {vuln['cve_id']} for patched versions.",
            reference=vuln["cve_id"],
            category="security"
        ))

    return {**state, "security_issues": [i.model_dump() for i in issues]}


def _parse_issues(content: str, category: str) -> List[Issue]:
    try:
        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = "\n".join(content.split("\n")[1:])
        if content.endswith("```"):
            content = "\n".join(content.split("\n")[:-1])

        data = json.loads(content.strip())
        issues = []
        for item in data:
            sev_map = {"critical": Severity.CRITICAL, "warning": Severity.WARNING, "info": Severity.INFO}
            issues.append(Issue(
                id=str(uuid.uuid4()),
                title=item.get("title", "Security Issue"),
                description=item.get("description", ""),
                severity=sev_map.get(item.get("severity", "warning").lower(), Severity.WARNING),
                line_start=item.get("line_start"),
                line_end=item.get("line_end"),
                code_snippet=item.get("code_snippet"),
                fix=item.get("fix"),
                suggestion=item.get("suggestion"),
                reference=item.get("reference"),
                category=category
            ))
        return issues
    except (json.JSONDecodeError, KeyError, TypeError):
        return []
