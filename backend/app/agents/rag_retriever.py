"""Agent 2: RAG Retriever — queries ChromaDB for relevant best practices."""
from app.vector_db.client import get_collection


def run_rag_retriever(state: dict) -> dict:
    collection = get_collection()
    language = state.get("language", "unknown")
    code = state["code"]

    # Build a targeted query from code content
    query_parts = [
        f"best practices for {language} code",
        "security vulnerabilities code review",
        "code quality issues"
    ]

    # Extract key terms from code to enrich query
    import re
    suspicious_terms = re.findall(
        r'(password|secret|token|key|eval|exec|pickle|yaml\.load|shell=True|innerHTML|'
        r'raw_input|os\.system|subprocess\.Popen|cursor\.execute|SELECT.*WHERE)',
        code, re.IGNORECASE
    )
    if suspicious_terms:
        query_parts.append(f"security issues: {', '.join(set(suspicious_terms[:5]))}")

    all_context = []
    seen_ids = set()

    for query in query_parts:
        results = collection.query(
            query_texts=[query],
            n_results=3,
            include=["documents", "metadatas"]
        )
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            doc_key = doc[:50]
            if doc_key not in seen_ids:
                seen_ids.add(doc_key)
                all_context.append(f"[{meta.get('source', 'Best Practice')}] {doc}")

    return {**state, "rag_context": all_context[:8]}
