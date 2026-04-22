"""Cyclomatic complexity scorer tool for code quality analysis."""
import ast
import re
from typing import Dict, Any
from langchain_core.tools import tool


def _count_python_complexity(code: str) -> Dict[str, Any]:
    """Calculate cyclomatic complexity for Python code."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {"error": "Could not parse Python code", "complexity": -1}

    results = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            complexity = 1  # base
            for child in ast.walk(node):
                if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler,
                                       ast.With, ast.Assert, ast.comprehension)):
                    complexity += 1
                elif isinstance(child, ast.BoolOp):
                    complexity += len(child.values) - 1
            results.append({
                "name": node.name,
                "complexity": complexity,
                "line": node.lineno,
                "risk": _complexity_risk(complexity)
            })

    overall = sum(r["complexity"] for r in results) / max(len(results), 1)
    return {"functions": results, "average_complexity": round(overall, 2)}


def _count_generic_complexity(code: str) -> Dict[str, Any]:
    """Estimate complexity for non-Python code using regex heuristics."""
    decision_points = [
        r'\bif\b', r'\belse\b', r'\belif\b', r'\bfor\b', r'\bwhile\b',
        r'\bswitch\b', r'\bcase\b', r'\bcatch\b', r'\b\?\s', r'&&', r'\|\|'
    ]
    total = 1
    line_complexities = []
    lines = code.split('\n')

    for i, line in enumerate(lines, 1):
        line_score = sum(len(re.findall(p, line)) for p in decision_points)
        if line_score > 0:
            line_complexities.append({"line": i, "score": line_score, "content": line.strip()})
        total += line_score

    return {
        "total_complexity": total,
        "hotspots": sorted(line_complexities, key=lambda x: x["score"], reverse=True)[:5],
        "risk": _complexity_risk(total)
    }


def _complexity_risk(score: int) -> str:
    if score <= 5:
        return "low"
    elif score <= 10:
        return "moderate"
    elif score <= 20:
        return "high"
    return "very_high"


@tool
def calculate_complexity(code: str, language: str) -> Dict[str, Any]:
    """
    Calculate cyclomatic complexity of code.
    Returns complexity scores and hotspot lines that indicate high risk.
    """
    language = language.lower()
    if language == "python":
        result = _count_python_complexity(code)
    else:
        result = _count_generic_complexity(code)

    result["language"] = language
    return result
