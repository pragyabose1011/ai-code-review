"""Agent 4: Quality Agent — checks for code smells, complexity, and conventions."""
import json
import os
import uuid
from typing import List
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from app.tools.complexity_scorer import calculate_complexity
from app.models.schemas import Issue, Severity
from app.agents.parse_utils import parse_issues


QUALITY_SYSTEM_PROMPT = """You are a senior software engineer specializing in code quality and clean code principles.
Analyze code for quality issues, code smells, and convention violations.

For each issue found, respond with a JSON array:
[
  {
    "title": "Short issue name",
    "description": "Detailed explanation",
    "severity": "critical|warning|info",
    "line_start": <line number or null>,
    "line_end": <line number or null>,
    "code_snippet": "The exact problematic code from the source",
    "fix": "The corrected replacement code snippet (same scope as code_snippet, ready to paste in)",
    "suggestion": "One sentence explaining what changed and why",
    "reference": "Relevant principle (SOLID, DRY, etc.)"
  }
]

Focus on: code smells (long methods, duplicate code, dead code, magic numbers),
naming conventions, complexity, error handling, documentation, SOLID principles.

Return ONLY valid JSON array, no markdown."""


async def run_quality_agent(state: dict) -> dict:
    llm = ChatOllama(model="llama3", temperature=0, base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    code = state["code"]
    language = state.get("language", "unknown")
    rag_context = state.get("rag_context", [])

    context_text = "\n".join(rag_context[4:8]) if len(rag_context) > 4 else "\n".join(rag_context)

    # Run complexity scorer tool
    complexity_result = calculate_complexity.invoke({"code": code, "language": language})

    prompt = f"""Review this {language} code for quality issues and code smells.

Relevant quality guidelines:
{context_text}

Code to review:
```{language}
{code}
```

Complexity Analysis Results:
{json.dumps(complexity_result, indent=2)}

Identify quality issues. Pay special attention to functions with high complexity scores.
Return JSON array only."""

    messages = [
        SystemMessage(content=QUALITY_SYSTEM_PROMPT),
        HumanMessage(content=prompt)
    ]

    response = await llm.ainvoke(messages)
    issues = parse_issues(response.content, "quality")

    # Add complexity issues from tool results directly
    if "functions" in complexity_result:
        for func in complexity_result["functions"]:
            if func["complexity"] > 10:
                severity = Severity.CRITICAL if func["complexity"] > 20 else Severity.WARNING
                issues.append(Issue(
                    id=str(uuid.uuid4()),
                    title=f"High Complexity: {func['name']}()",
                    description=f"Function '{func['name']}' has cyclomatic complexity of {func['complexity']} (threshold: 10). This makes it hard to test and maintain.",
                    severity=severity,
                    line_start=func.get("line"),
                    suggestion="Refactor into smaller, focused functions. Extract complex conditionals into well-named helper functions.",
                    reference="McCabe Complexity, Clean Code",
                    category="quality"
                ))
    elif complexity_result.get("total_complexity", 0) > 20:
        issues.append(Issue(
            id=str(uuid.uuid4()),
            title="High Overall Code Complexity",
            description=f"Overall complexity score is {complexity_result['total_complexity']}. Complex code is harder to understand and maintain.",
            severity=Severity.WARNING,
            suggestion="Break down complex logic into smaller, well-named functions.",
            reference="Cyclomatic Complexity",
            category="quality"
        ))

    return {**state, "quality_issues": [i.model_dump() for i in issues]}


