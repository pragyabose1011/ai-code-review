"""Streaming pipeline — runs all agents sequentially/in parallel, yielding SSE events."""
import asyncio
import difflib
from typing import AsyncGenerator, Optional
from app.agents.chunker import run_chunker
from app.agents.rag_retriever import run_rag_retriever
from app.agents.security_agent import run_security_agent
from app.agents.quality_agent import run_quality_agent
from app.agents.synthesizer import run_synthesizer


async def stream_review_pipeline(
    code: str,
    filename: Optional[str] = None,
    original_code: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """Yields SSE event dicts as each agent completes."""

    # If diff mode: focus review on changed sections only
    review_code = code
    diff_context = None
    if original_code:
        review_code, diff_context = _extract_diff_focus(original_code, code)

    state = {
        "code": review_code,
        "filename": filename,
        "language": "",
        "chunks": [],
        "rag_context": [],
        "security_issues": [],
        "quality_issues": [],
        "final_report": None,
    }

    # Agent 1: Chunker
    yield {"type": "agent_start", "agent": "chunker"}
    state = run_chunker(state)
    yield {"type": "agent_done", "agent": "chunker", "language": state["language"], "chunks": len(state["chunks"])}

    # Agent 2: RAG Retriever
    yield {"type": "agent_start", "agent": "rag"}
    state = run_rag_retriever(state)
    yield {"type": "agent_done", "agent": "rag", "rules": len(state["rag_context"])}

    # Agents 3 & 4: Security + Quality in parallel
    yield {"type": "agent_start", "agent": "security"}
    yield {"type": "agent_start", "agent": "quality"}

    queue: asyncio.Queue = asyncio.Queue()

    async def _run_security():
        result = await run_security_agent(state)
        await queue.put(("security", result))

    async def _run_quality():
        result = await run_quality_agent(state)
        await queue.put(("quality", result))

    asyncio.create_task(_run_security())
    asyncio.create_task(_run_quality())

    for _ in range(2):
        agent_name, result = await queue.get()
        if agent_name == "security":
            state["security_issues"] = result["security_issues"]
            yield {"type": "agent_done", "agent": "security", "issues_found": len(result["security_issues"])}
        else:
            state["quality_issues"] = result["quality_issues"]
            yield {"type": "agent_done", "agent": "quality", "issues_found": len(result["quality_issues"])}

    # Agent 5: Synthesizer
    yield {"type": "agent_start", "agent": "synthesizer"}
    final_state = await run_synthesizer(state)
    report = final_state["final_report"]

    if diff_context:
        report["diff_context"] = diff_context

    yield {"type": "complete", "report": report}


def _extract_diff_focus(original: str, modified: str) -> tuple[str, dict]:
    """Extract changed sections with context for focused review."""
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    matcher = difflib.SequenceMatcher(None, orig_lines, mod_lines)

    changed_sections = []
    changed_line_ranges = []

    for tag, _, _, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        start = max(0, j1 - 3)
        end = min(len(mod_lines), j2 + 3)
        section = "".join(mod_lines[start:end])
        changed_sections.append(f"# --- Changed section (lines {start+1}–{end}) ---\n{section}")
        changed_line_ranges.append({"start": start + 1, "end": end})

    focused = "\n\n".join(changed_sections) if changed_sections else modified
    return focused, {"changed_ranges": changed_line_ranges, "total_changed_lines": sum(r["end"] - r["start"] for r in changed_line_ranges)}
