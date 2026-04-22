from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class Severity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class CodeChunk(BaseModel):
    id: str
    content: str
    start_line: int
    end_line: int
    chunk_type: str  # function, class, block, etc.


class Issue(BaseModel):
    id: str
    title: str
    description: str
    severity: Severity
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    code_snippet: Optional[str] = None
    fix: Optional[str] = None
    suggestion: Optional[str] = None
    reference: Optional[str] = None
    category: str  # security, quality, etc.
    confidence: int = 1  # 1 = one agent flagged, 2 = both agents agree


class ReviewReport(BaseModel):
    language: str
    total_lines: int
    chunks_analyzed: int
    issues: List[Issue]
    summary: str
    score: int  # 0-100
    critical_count: int
    warning_count: int
    info_count: int


class ReviewRequest(BaseModel):
    code: str
    filename: Optional[str] = None


class ReviewResponse(BaseModel):
    report: ReviewReport
    status: str = "success"


class AgentState(BaseModel):
    code: str
    filename: Optional[str] = None
    language: str = ""
    chunks: List[CodeChunk] = []
    rag_context: List[str] = []
    security_issues: List[Issue] = []
    quality_issues: List[Issue] = []
    final_report: Optional[ReviewReport] = None
