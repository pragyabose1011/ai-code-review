"""Agent 1: Code Chunker — splits code into logical chunks and identifies language."""
import re
import uuid
from typing import TypedDict, List
from app.models.schemas import CodeChunk


LANGUAGE_PATTERNS = {
    "python": [r'def\s+\w+', r'class\s+\w+', r'import\s+\w+', r'from\s+\w+\s+import', r'#!.*python'],
    "javascript": [r'function\s+\w+', r'const\s+\w+\s*=', r'let\s+\w+', r'require\(', r'module\.exports'],
    "typescript": [r'interface\s+\w+', r'type\s+\w+\s*=', r':\s*string\b', r':\s*number\b', r'enum\s+\w+'],
    "java": [r'public\s+class', r'private\s+\w+', r'import\s+java\.', r'@Override', r'System\.out\.print'],
    "go": [r'func\s+\w+', r'package\s+\w+', r'import\s+"', r':=', r'fmt\.Print'],
    "rust": [r'fn\s+\w+', r'let\s+mut', r'impl\s+\w+', r'use\s+std::', r'#\[derive'],
    "sql": [r'\bSELECT\b', r'\bINSERT\b', r'\bUPDATE\b', r'\bDELETE\b', r'\bCREATE TABLE\b'],
    "bash": [r'#!/bin/bash', r'\$\{?\w+\}?', r'echo\s+', r'if\s+\['],
}


def detect_language(code: str, filename: str = None) -> str:
    if filename:
        ext_map = {
            ".py": "python", ".js": "javascript", ".ts": "typescript",
            ".tsx": "typescript", ".jsx": "javascript", ".java": "java",
            ".go": "go", ".rs": "rust", ".sql": "sql", ".sh": "bash",
        }
        for ext, lang in ext_map.items():
            if filename.endswith(ext):
                return lang

    scores = {}
    for lang, patterns in LANGUAGE_PATTERNS.items():
        score = sum(len(re.findall(p, code, re.MULTILINE)) for p in patterns)
        if score > 0:
            scores[lang] = score

    # TypeScript scores on top of JavaScript
    if "typescript" in scores and "javascript" in scores:
        scores["typescript"] += scores.pop("javascript")

    return max(scores, key=scores.get) if scores else "unknown"


def chunk_code(code: str, language: str) -> List[CodeChunk]:
    """Split code into logical chunks based on language structure."""
    chunks = []
    lines = code.split('\n')

    if language == "python":
        chunks = _chunk_python(code, lines)
    elif language in ("javascript", "typescript"):
        chunks = _chunk_js_ts(code, lines)
    else:
        chunks = _chunk_generic(code, lines)

    if not chunks:
        chunks = [CodeChunk(
            id=str(uuid.uuid4()),
            content=code,
            start_line=1,
            end_line=len(lines),
            chunk_type="file"
        )]

    return chunks


def _chunk_python(code: str, lines: List[str]) -> List[CodeChunk]:
    chunks = []
    import ast
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                end_line = node.end_lineno if hasattr(node, 'end_lineno') else node.lineno + 10
                chunk_lines = lines[node.lineno - 1:end_line]
                chunk_type = "function" if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) else "class"
                chunks.append(CodeChunk(
                    id=str(uuid.uuid4()),
                    content='\n'.join(chunk_lines),
                    start_line=node.lineno,
                    end_line=end_line,
                    chunk_type=chunk_type
                ))
    except SyntaxError:
        return _chunk_generic(code, lines)
    return chunks


def _chunk_js_ts(code: str, lines: List[str]) -> List[CodeChunk]:
    chunks = []
    func_pattern = re.compile(
        r'^(?:export\s+)?(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+)',
        re.MULTILINE
    )
    matches = list(func_pattern.finditer(code))

    for i, match in enumerate(matches):
        start_line = code[:match.start()].count('\n') + 1
        if i + 1 < len(matches):
            end_line = code[:matches[i + 1].start()].count('\n')
        else:
            end_line = len(lines)

        chunk_lines = lines[start_line - 1:end_line]
        chunk_type = "class" if "class" in match.group() else "function"
        chunks.append(CodeChunk(
            id=str(uuid.uuid4()),
            content='\n'.join(chunk_lines),
            start_line=start_line,
            end_line=end_line,
            chunk_type=chunk_type
        ))

    return chunks


def _chunk_generic(code: str, lines: List[str]) -> List[CodeChunk]:
    """Chunk by splitting into ~30-line blocks."""
    chunks = []
    chunk_size = 30
    for i in range(0, len(lines), chunk_size):
        block = lines[i:i + chunk_size]
        chunks.append(CodeChunk(
            id=str(uuid.uuid4()),
            content='\n'.join(block),
            start_line=i + 1,
            end_line=min(i + chunk_size, len(lines)),
            chunk_type="block"
        ))
    return chunks


def run_chunker(state: dict) -> dict:
    code = state["code"]
    filename = state.get("filename")
    language = detect_language(code, filename)
    chunks = chunk_code(code, language)
    return {**state, "language": language, "chunks": [c.model_dump() for c in chunks]}
