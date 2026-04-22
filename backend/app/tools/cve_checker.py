"""CVE database checker tool using NVD API."""
import re
import httpx
from typing import Dict, Any, List
from langchain_core.tools import tool


DEPENDENCY_PATTERNS = {
    "python": [
        r'(?:import|from)\s+([\w.]+)',
        r'(?:pip install|requires)\s+([\w-]+)',
        r'([\w-]+)==([\d.]+)',
    ],
    "javascript": [
        r'"([\w@/-]+)":\s*"([^"]+)"',
        r'require\([\'"]([^\'"]+)[\'"]\)',
        r'from\s+[\'"]([^\'"]+)[\'"]',
    ],
    "java": [
        r'import\s+([\w.]+);',
        r'<artifactId>([\w-]+)</artifactId>',
    ],
}

KNOWN_VULNERABLE_PATTERNS = {
    "log4j": {"cve": "CVE-2021-44228", "severity": "CRITICAL", "desc": "Log4Shell RCE vulnerability"},
    "log4j-core": {"cve": "CVE-2021-44228", "severity": "CRITICAL", "desc": "Log4Shell RCE vulnerability"},
    "struts2": {"cve": "CVE-2017-5638", "severity": "CRITICAL", "desc": "Apache Struts2 RCE"},
    "spring-webmvc": {"cve": "CVE-2022-22965", "severity": "CRITICAL", "desc": "Spring4Shell RCE"},
    "lodash": {"cve": "CVE-2021-23337", "severity": "HIGH", "desc": "Prototype pollution"},
    "moment": {"cve": "CVE-2022-24785", "severity": "MEDIUM", "desc": "Path traversal in locale loading"},
    "serialize-javascript": {"cve": "CVE-2020-7660", "severity": "HIGH", "desc": "XSS via regex"},
    "pyyaml": {"cve": "CVE-2020-14343", "severity": "CRITICAL", "desc": "Arbitrary code execution"},
    "pillow": {"cve": "CVE-2021-34552", "severity": "CRITICAL", "desc": "Buffer overflow"},
    "urllib3": {"cve": "CVE-2021-33503", "severity": "HIGH", "desc": "ReDoS vulnerability"},
    "requests": {"cve": "CVE-2023-32681", "severity": "MEDIUM", "desc": "Proxy auth leak"},
    "jinja2": {"cve": "CVE-2024-34064", "severity": "MEDIUM", "desc": "XSS via filenames"},
}


def _extract_dependencies(code: str, language: str) -> List[str]:
    patterns = DEPENDENCY_PATTERNS.get(language, [])
    deps = []
    for pattern in patterns:
        matches = re.findall(pattern, code, re.IGNORECASE)
        for match in matches:
            dep = match[0] if isinstance(match, tuple) else match
            dep = dep.split('.')[0].lower().replace('_', '-')
            if dep and len(dep) > 2:
                deps.append(dep)
    return list(set(deps))


async def _query_nvd(package: str) -> List[Dict]:
    """Query NVD API for CVEs related to a package."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://services.nvd.nist.gov/rest/json/cves/2.0",
                params={"keywordSearch": package, "resultsPerPage": 3}
            )
            if resp.status_code == 200:
                data = resp.json()
                cves = []
                for item in data.get("vulnerabilities", []):
                    cve = item.get("cve", {})
                    metrics = cve.get("metrics", {})
                    cvss = (metrics.get("cvssMetricV31", [{}])[0] if metrics.get("cvssMetricV31")
                            else metrics.get("cvssMetricV2", [{}])[0] if metrics.get("cvssMetricV2") else {})
                    score = cvss.get("cvssData", {}).get("baseScore", 0)
                    cves.append({
                        "cve_id": cve.get("id"),
                        "description": cve.get("descriptions", [{}])[0].get("value", "")[:200],
                        "score": score
                    })
                return cves
    except Exception:
        pass
    return []


@tool
async def check_cve(code: str, language: str) -> Dict[str, Any]:
    """
    Check code dependencies against known CVEs.
    Extracts imported packages and checks them against vulnerability databases.
    Returns list of vulnerable dependencies with CVE details.
    """
    deps = _extract_dependencies(code, language.lower())
    vulnerabilities = []

    for dep in deps:
        # Check local known-vulnerable list first (fast)
        for vuln_name, vuln_info in KNOWN_VULNERABLE_PATTERNS.items():
            if vuln_name in dep or dep in vuln_name:
                vulnerabilities.append({
                    "package": dep,
                    "cve_id": vuln_info["cve"],
                    "severity": vuln_info["severity"],
                    "description": vuln_info["desc"],
                    "source": "local_db"
                })
                break

    # Query NVD for top 3 unmatched deps to avoid rate limiting
    unmatched = [d for d in deps if not any(v["package"] == d for v in vulnerabilities)]
    for dep in unmatched[:3]:
        nvd_results = await _query_nvd(dep)
        for cve in nvd_results:
            if cve["score"] >= 7.0:
                vulnerabilities.append({
                    "package": dep,
                    "cve_id": cve["cve_id"],
                    "severity": "CRITICAL" if cve["score"] >= 9.0 else "HIGH",
                    "description": cve["description"],
                    "score": cve["score"],
                    "source": "nvd_api"
                })

    return {
        "dependencies_found": deps,
        "vulnerabilities": vulnerabilities,
        "total_vulnerable": len(vulnerabilities)
    }
