"""LangGraph orchestration — wires all agents into a pipeline."""
import asyncio
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional, Any


class ReviewState(TypedDict):
    code: str
    filename: Optional[str]
    language: str
    chunks: List[Any]
    rag_context: List[str]
    security_issues: List[Any]
    quality_issues: List[Any]
    final_report: Optional[Any]


def _build_graph():
    from app.agents.chunker import run_chunker
    from app.agents.rag_retriever import run_rag_retriever
    from app.agents.security_agent import run_security_agent
    from app.agents.quality_agent import run_quality_agent
    from app.agents.synthesizer import run_synthesizer

    # Wrap async agents for LangGraph
    async def chunker_node(state): return run_chunker(state)
    async def rag_node(state): return run_rag_retriever(state)
    async def security_node(state): return await run_security_agent(state)
    async def quality_node(state): return await run_quality_agent(state)
    async def synthesizer_node(state): return await run_synthesizer(state)

    async def parallel_analysis(state):
        """Run security and quality agents in parallel."""
        sec_task = run_security_agent(state)
        qual_task = run_quality_agent(state)
        sec_result, qual_result = await asyncio.gather(sec_task, qual_task)
        return {
            **state,
            "security_issues": sec_result["security_issues"],
            "quality_issues": qual_result["quality_issues"]
        }

    graph = StateGraph(ReviewState)

    graph.add_node("chunker", chunker_node)
    graph.add_node("rag_retriever", rag_node)
    graph.add_node("parallel_analysis", parallel_analysis)
    graph.add_node("synthesizer", synthesizer_node)

    graph.set_entry_point("chunker")
    graph.add_edge("chunker", "rag_retriever")
    graph.add_edge("rag_retriever", "parallel_analysis")
    graph.add_edge("parallel_analysis", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()


# Build once at import time
review_graph = _build_graph()


async def run_review_pipeline(code: str, filename: str = None) -> dict:
    """Entry point to run the full multi-agent review pipeline."""
    initial_state: ReviewState = {
        "code": code,
        "filename": filename,
        "language": "",
        "chunks": [],
        "rag_context": [],
        "security_issues": [],
        "quality_issues": [],
        "final_report": None
    }
    result = await review_graph.ainvoke(initial_state)
    return result["final_report"]
