import json
import re
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.db_models import User, Review
from app.models.schemas import ReviewRequest
from app.agents.streaming import stream_review_pipeline
from app.auth.utils import get_current_user, require_auth

router = APIRouter()


class DiffRequest(BaseModel):
    original_code: str
    modified_code: str
    filename: Optional[str] = None


# ── Streaming review ──────────────────────────────────────────────────────────

@router.post("/review/stream")
async def stream_review(
    request: ReviewRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")
    if len(request.code) > 50_000:
        raise HTTPException(status_code=400, detail="Code exceeds 50,000 character limit")

    async def generator():
        report_data = None
        async for event in stream_review_pipeline(request.code, request.filename):
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] == "complete":
                report_data = event["report"]

        if current_user and report_data:
            saved, trend = _save_review(db, current_user, request.filename or "untitled", report_data)
            yield f"data: {json.dumps({'type': 'saved', 'review_id': saved.id, 'trend': trend})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/review/diff")
async def stream_diff_review(
    request: DiffRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    async def generator():
        report_data = None
        async for event in stream_review_pipeline(
            request.modified_code, request.filename, original_code=request.original_code
        ):
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] == "complete":
                report_data = event["report"]

        if current_user and report_data:
            saved, trend = _save_review(db, current_user, request.filename or "untitled", report_data)
            yield f"data: {json.dumps({'type': 'saved', 'review_id': saved.id, 'trend': trend})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/history")
async def get_history(current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    reviews = (db.query(Review)
               .filter(Review.user_id == current_user.id)
               .order_by(Review.created_at.desc())
               .limit(50).all())
    return [_review_summary(r) for r in reviews]


@router.get("/history/{review_id}")
async def get_review(review_id: int, current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id, Review.user_id == current_user.id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"summary": _review_summary(review), "report": json.loads(review.report_json)}


@router.get("/history/trends/{filename:path}")
async def get_trends(filename: str, current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    reviews = (db.query(Review)
               .filter(Review.user_id == current_user.id, Review.filename == filename)
               .order_by(Review.created_at.asc()).all())
    return [_review_summary(r) for r in reviews]


# ── GitHub PR ─────────────────────────────────────────────────────────────────

@router.get("/fetch-pr")
async def fetch_pr(url: str = Query(...)):
    owner, repo, number = _parse_pr_url(url)
    try:
        headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "ai-code-review"}
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            files_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{number}/files"
            )
            meta_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{number}"
            )

        if files_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="PR not found or private repo")
        if files_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"GitHub API error {files_resp.status_code}")

        files = []
        for f in files_resp.json():
            if not f.get("patch"):
                continue
            added_code, line_map = _parse_patch_additions(f["patch"])
            if added_code.strip():
                files.append({
                    "filename": f["filename"],
                    "status": f["status"],
                    "additions": f["additions"],
                    "deletions": f["deletions"],
                    "added_code": added_code,
                    "line_map": line_map,
                })

        meta = meta_resp.json() if meta_resp.status_code == 200 else {}
        return {
            "title": meta.get("title", f"PR #{number}"),
            "author": meta.get("user", {}).get("login", "unknown"),
            "base": meta.get("base", {}).get("ref", ""),
            "head": meta.get("head", {}).get("ref", ""),
            "files": files,
        }
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── GitHub repo browser ──────────────────────────────────────────────────────

@router.get("/fetch-repo")
async def fetch_repo(url: str = Query(...), path: str = Query(default="")):
    """List contents of a GitHub repo directory."""
    owner, repo = _parse_repo_url(url)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "ai-code-review", "Accept": "application/vnd.github.v3+json"}) as client:
            resp = await client.get(api_url)
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Repo or path not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"GitHub API error {resp.status_code}")
        items = resp.json()
        if not isinstance(items, list):
            items = [items]
        return sorted(
            [{"name": i["name"], "type": i["type"], "path": i["path"], "size": i.get("size", 0), "download_url": i.get("download_url")} for i in items],
            key=lambda x: (x["type"] != "dir", x["name"].lower())
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── GitHub file fetch ─────────────────────────────────────────────────────────

@router.get("/fetch-github")
async def fetch_github(url: str = Query(...)):
    try:
        raw_url, filename = _to_raw_github_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(raw_url)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"GitHub returned {resp.status_code}")
        return {"code": resp.text, "filename": filename}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _save_review(db: Session, user: User, filename: str, report: dict):
    review = Review(
        user_id=user.id,
        filename=filename,
        language=report.get("language", ""),
        score=report.get("score", 0),
        critical_count=report.get("critical_count", 0),
        warning_count=report.get("warning_count", 0),
        info_count=report.get("info_count", 0),
        total_issues=len(report.get("issues", [])),
        report_json=json.dumps(report),
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    prev = (db.query(Review)
            .filter(Review.user_id == user.id, Review.filename == filename, Review.id != review.id)
            .order_by(Review.created_at.desc()).first())

    trend = None
    if prev:
        trend = {
            "score_delta": review.score - prev.score,
            "critical_delta": review.critical_count - prev.critical_count,
            "warning_delta": review.warning_count - prev.warning_count,
            "previous_score": prev.score,
            "previous_date": prev.created_at.isoformat(),
            "previous_id": prev.id,
        }
    return review, trend


def _review_summary(r: Review) -> dict:
    return {
        "id": r.id,
        "filename": r.filename,
        "language": r.language,
        "score": r.score,
        "critical_count": r.critical_count,
        "warning_count": r.warning_count,
        "info_count": r.info_count,
        "total_issues": r.total_issues,
        "created_at": r.created_at.isoformat(),
    }


def _parse_repo_url(url: str):
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Expected: https://github.com/owner/repo")
    return m.group(1), m.group(2)


def _to_raw_github_url(url: str):
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)", url.strip())
    if m:
        user, repo, branch, path = m.groups()
        return f"https://raw.githubusercontent.com/{user}/{repo}/{branch}/{path}", path.split("/")[-1]
    if "raw.githubusercontent.com" in url:
        return url, url.split("/")[-1]
    raise ValueError("Not a recognisable GitHub file URL")


def _parse_pr_url(url: str):
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)", url.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Expected: https://github.com/owner/repo/pull/123")
    return m.group(1), m.group(2), m.group(3)


def _parse_patch_additions(patch: str):
    lines, line_map, current = [], [], 0
    for line in patch.split("\n"):
        if line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            if m:
                current = int(m.group(1)) - 1
        elif line.startswith("+") and not line.startswith("+++"):
            current += 1
            lines.append(line[1:])
            line_map.append(current)
        elif not line.startswith("-"):
            current += 1
    return "\n".join(lines), line_map
