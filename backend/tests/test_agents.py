"""
DeepEval test suite for the AI Code Review Agent pipeline.

Tests:
1. parse_utils — Pydantic validation and malformed JSON fallback (no LLM needed)
2. Security agent — must flag SQL injection, hardcoded secrets, command injection
3. Quality agent — must flag bare except, magic numbers, unused variables
4. Synthesizer — output must conform to ReviewReport schema
5. Hallucination guard — synthesizer must not invent CVE IDs not in retrieved context
"""
import asyncio
import json
import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import GEval, HallucinationMetric
from deepeval.metrics.g_eval import LLMTestCaseParams

from app.agents.parse_utils import parse_issues


# ---------------------------------------------------------------------------
# 1. Unit tests for parse_utils — no LLM, no network
# ---------------------------------------------------------------------------

def test_parse_valid_json():
    raw = json.dumps([{
        "title": "SQL Injection",
        "description": "User input concatenated directly into query.",
        "severity": "critical",
        "line_start": 5,
        "code_snippet": 'query = "SELECT * FROM users WHERE id = " + user_id',
        "fix": 'query = "SELECT * FROM users WHERE id = %s"',
        "suggestion": "Use parameterised queries.",
        "reference": "CWE-89"
    }])
    issues = parse_issues(raw, "security")
    assert len(issues) == 1
    assert issues[0].severity.value == "critical"
    assert issues[0].fix is not None


def test_parse_skips_malformed_items():
    raw = json.dumps([
        {"title": "Good Issue", "description": "Valid.", "severity": "warning"},
        {"title": "", "description": ""},      # fails must_not_be_empty
        {"severity": "critical"},              # missing title and description
        "not a dict",
    ])
    issues = parse_issues(raw, "security")
    assert len(issues) == 1
    assert issues[0].title == "Good Issue"


def test_parse_strips_markdown_fences():
    raw = '```json\n[{"title": "XSS", "description": "Reflected XSS.", "severity": "critical"}]\n```'
    issues = parse_issues(raw, "security")
    assert len(issues) == 1


def test_parse_invalid_severity_defaults():
    raw = json.dumps([{"title": "Something", "description": "Desc.", "severity": "blocker"}])
    issues = parse_issues(raw, "quality")
    assert issues[0].severity.value == "warning"


def test_parse_unparseable_json_returns_empty():
    issues = parse_issues("This is not JSON at all.", "security")
    assert issues == []


def test_parse_coerces_string_line_numbers():
    raw = json.dumps([{"title": "T", "description": "D.", "severity": "info", "line_start": "42"}])
    issues = parse_issues(raw, "quality")
    assert issues[0].line_start == 42


# ---------------------------------------------------------------------------
# Fixtures — known-vulnerable code samples
# ---------------------------------------------------------------------------

SQL_INJECTION_CODE = """
import sqlite3

def get_user(user_id):
    conn = sqlite3.connect("users.db")
    query = "SELECT * FROM users WHERE id = " + user_id
    return conn.execute(query).fetchone()
"""

HARDCODED_SECRET_CODE = """
class Config:
    SECRET_KEY = "super_secret_password_123"
    DB_PASSWORD = "admin1234"
"""

COMMAND_INJECTION_CODE = """
import os

def list_files(directory):
    os.system("ls " + directory)
"""

QUALITY_SMELLS_CODE = """
def process(data=[]):
    try:
        result = eval(data)
        return result
    except:
        pass

x = 86400
y = 3600
"""


# ---------------------------------------------------------------------------
# 2. DeepEval — security agent detection tests
# ---------------------------------------------------------------------------

DETECTION_METRIC = GEval(
    name="VulnerabilityDetection",
    criteria=(
        "The actual output is a JSON list of security issues. "
        "It MUST contain at least one issue that correctly identifies the vulnerability "
        "described in the expected output. The issue must name the vulnerability type, "
        "point to the relevant code, and suggest a fix."
    ),
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
    threshold=0.7,
)


@pytest.mark.asyncio
async def test_security_agent_detects_sql_injection():
    from app.agents.security_agent import run_security_agent
    state = {"code": SQL_INJECTION_CODE, "language": "python", "rag_context": []}
    result = await run_security_agent(state)
    issues_json = json.dumps(result["security_issues"])

    test_case = LLMTestCase(
        input=SQL_INJECTION_CODE,
        actual_output=issues_json,
        expected_output="At least one issue identifying SQL injection (CWE-89): user input concatenated into SQL query without parameterisation.",
    )
    assert_test(test_case, [DETECTION_METRIC])


@pytest.mark.asyncio
async def test_security_agent_detects_hardcoded_secret():
    from app.agents.security_agent import run_security_agent
    state = {"code": HARDCODED_SECRET_CODE, "language": "python", "rag_context": []}
    result = await run_security_agent(state)
    issues_json = json.dumps(result["security_issues"])

    test_case = LLMTestCase(
        input=HARDCODED_SECRET_CODE,
        actual_output=issues_json,
        expected_output="At least one issue identifying hardcoded credentials or secrets in source code.",
    )
    assert_test(test_case, [DETECTION_METRIC])


@pytest.mark.asyncio
async def test_security_agent_detects_command_injection():
    from app.agents.security_agent import run_security_agent
    state = {"code": COMMAND_INJECTION_CODE, "language": "python", "rag_context": []}
    result = await run_security_agent(state)
    issues_json = json.dumps(result["security_issues"])

    test_case = LLMTestCase(
        input=COMMAND_INJECTION_CODE,
        actual_output=issues_json,
        expected_output="At least one issue identifying OS command injection via os.system with unsanitised user input.",
    )
    assert_test(test_case, [DETECTION_METRIC])


# ---------------------------------------------------------------------------
# 3. DeepEval — quality agent detection tests
# ---------------------------------------------------------------------------

QUALITY_METRIC = GEval(
    name="QualitySmellDetection",
    criteria=(
        "The actual output is a JSON list of code quality issues. "
        "It MUST identify at least one of: bare except clause, use of eval(), "
        "magic numbers, or mutable default argument. "
        "Each issue must include a concrete fix suggestion."
    ),
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
    threshold=0.7,
)


@pytest.mark.asyncio
async def test_quality_agent_detects_smells():
    from app.agents.quality_agent import run_quality_agent
    state = {"code": QUALITY_SMELLS_CODE, "language": "python", "rag_context": []}
    result = await run_quality_agent(state)
    issues_json = json.dumps(result["quality_issues"])

    test_case = LLMTestCase(
        input=QUALITY_SMELLS_CODE,
        actual_output=issues_json,
        expected_output="Issues flagging: bare except, eval() usage, magic numbers (86400, 3600), mutable default argument.",
    )
    assert_test(test_case, [QUALITY_METRIC])


# ---------------------------------------------------------------------------
# 4. DeepEval — synthesizer schema conformance
# ---------------------------------------------------------------------------

SCHEMA_METRIC = GEval(
    name="ReportSchemaConformance",
    criteria=(
        "The actual output is a JSON object representing a code review report. "
        "It MUST contain: 'summary' (non-empty string), 'score' (integer 0-100), "
        "'issues' (list), 'language' (string), 'critical_count', 'warning_count', 'info_count'. "
        "Counts must match the number of issues with that severity in the issues list."
    ),
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
    threshold=0.8,
)


@pytest.mark.asyncio
async def test_synthesizer_output_conforms_to_schema():
    from app.agents.synthesizer import run_synthesizer
    state = {
        "code": SQL_INJECTION_CODE,
        "language": "python",
        "chunks": [],
        "security_issues": [{"id": "1", "title": "SQL Injection", "description": "Raw input in query.",
                              "severity": "critical", "category": "security", "confidence": 1,
                              "line_start": 5, "line_end": 5, "code_snippet": None, "fix": None,
                              "suggestion": None, "reference": "CWE-89"}],
        "quality_issues": [],
    }
    result = await run_synthesizer(state)
    report = result["final_report"]
    report_json = json.dumps(report if isinstance(report, dict) else report.model_dump())

    test_case = LLMTestCase(
        input="Synthesize a review report from the given security and quality issues.",
        actual_output=report_json,
        expected_output="A valid ReviewReport with summary, score 0-100, issues list, language, and correct severity counts.",
    )
    assert_test(test_case, [SCHEMA_METRIC])


# ---------------------------------------------------------------------------
# 5. DeepEval — hallucination guard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_synthesizer_does_not_hallucinate_cve_ids():
    from app.agents.synthesizer import run_synthesizer

    state = {
        "code": SQL_INJECTION_CODE,
        "language": "python",
        "chunks": [],
        "security_issues": [{"id": "1", "title": "SQL Injection", "description": "Raw input concatenated.",
                              "severity": "critical", "category": "security", "confidence": 1,
                              "line_start": 5, "line_end": 5, "code_snippet": None, "fix": None,
                              "suggestion": None, "reference": "CWE-89"}],
        "quality_issues": [],
    }
    result = await run_synthesizer(state)
    report = result["final_report"]
    summary = report["summary"] if isinstance(report, dict) else report.summary

    context = ["CWE-89 relates to SQL injection via improper neutralisation of special elements."]

    test_case = LLMTestCase(
        input="Write an executive summary of the code review findings.",
        actual_output=summary,
        context=context,
    )
    metric = HallucinationMetric(threshold=0.5)
    assert_test(test_case, [metric])
