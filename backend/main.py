"""
Admorph - FastAPI application entry point.

Endpoints:
  POST /auth/token             → JWT (no auth, 20/min/IP)
  GET  /api/status             → Health check (no auth)
  POST /api/personalize        → Start job  (auth, 3/min/client)
  GET  /api/jobs/{job_id}      → Poll status (auth)
  GET  /api/preview/{job_id}   → Serve HTML iframe (no auth, shareable)
  GET  /api/download/{job_id}  → Download file (auth)
"""

import asyncio
import datetime
import time
import uuid

import structlog
from google import genai
from google.genai import types
from fastapi import BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from auth import create_token, verify_token
from config import get_settings
from models import (
    JobStatus,
    PersonalizeRequest,
    PersonalizeResponse,
    StatusResponse,
    TokenRequest,
    TokenResponse,
)
from rate_limiter import limiter, personalize_limiter_key
from services.engine import create_job, get_job, run_pipeline

log = structlog.get_logger()
settings = get_settings()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Admorph API",
    version="1.0.0",
    description="AI-driven landing page personalization via non-destructive JSON diffs.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# CORS  (whitelist only - no wildcard)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

# ---------------------------------------------------------------------------
# Security Headers
# ---------------------------------------------------------------------------


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "no-store",
    }
    
    if not request.url.path.startswith("/api/preview"):
        headers["X-Frame-Options"] = "DENY"
    else:
        # Explicitly allow the configured frontend origins to iframe this API route
        # frame-ancestors requires space-separated origins
        origins_str = " ".join(settings.get_allowed_origins_list())
        headers["Content-Security-Policy"] = f"frame-ancestors 'self' {origins_str}"
        
    response.headers.update(headers)
    return response


# ---------------------------------------------------------------------------
# Request ID
# ---------------------------------------------------------------------------


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    structlog.contextvars.clear_contextvars()
    return response


# ---------------------------------------------------------------------------
# Global Exception Handler  (no stack traces to client)
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    log.error("unhandled_error", path=str(request.url), error=str(exc))
    return PlainTextResponse("internal server error", status_code=500)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/status", response_model=StatusResponse, tags=["Health"])
async def health_check():
    """Health check - no auth required."""
    return StatusResponse(ts=datetime.datetime.utcnow().isoformat() + "Z")

from typing import Dict, Any, Optional

# --- LLM Health Cache ---
_llm_health_cache: Dict[str, Any] = {}
_llm_health_cache_lock = asyncio.Lock()
LLM_CACHE_TTL = 600  # 10 minutes

@app.get("/api/health/llm", tags=["Health"])
async def llm_health_check():
    """Ping the Gemini API and measure exact latency (cached for 10 min)."""
    async with _llm_health_cache_lock:
        now = time.time()
        if "data" in _llm_health_cache:
            if now - _llm_health_cache["ts"] < LLM_CACHE_TTL:
                return {**_llm_health_cache["data"], "cached": True}

    start_time = time.time()
    try:
        cfg = get_settings()
        client = genai.Client(api_key=cfg.google_api_key)
        # Use a very small prompt to save quota
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=cfg.gemini_flash_model,
                contents="ping",
                config=types.GenerateContentConfig(max_output_tokens=2, temperature=0.0)
            ),
            timeout=10.0
        )
        latency = int((time.time() - start_time) * 1000)
        
        result = {"status": "ok", "latency_ms": latency, "cached": False}
        
        async with _llm_health_cache_lock:
            _llm_health_cache["data"] = result
            _llm_health_cache["ts"] = time.time()
            
        return result

    except asyncio.TimeoutError:
        return {"status": "error", "error": "Gemini API timed out (10s)", "latency_ms": 10000}
    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        error_str = str(e)
        
        # Friendly 429 handling
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            return {
                "status": "quota_exceeded", 
                "error": "Daily Gemini API quota reached. Please wait or upgrade your API key.",
                "latency_ms": latency
            }
            
        return {"status": "error", "error": error_str, "latency_ms": latency}


@app.post("/auth/token", response_model=TokenResponse, tags=["Auth"])
@limiter.limit("20/minute")
async def issue_token(request: Request, body: TokenRequest = Body(...)):
    """
    Issue a JWT for any client_id.
    Rate limited: 20 requests/minute per IP.
    """
    token = create_token(body.client_id)
    cfg = get_settings()
    return TokenResponse(
        access_token=token,
        expires_in=cfg.jwt_expiry_minutes * 60,
    )


@app.post("/api/personalize", response_model=PersonalizeResponse, tags=["Core"])
@limiter.limit("3/minute", key_func=personalize_limiter_key)
async def start_personalization(
    request: Request,
    background_tasks: BackgroundTasks,
    body: PersonalizeRequest = Body(...),
    payload: dict = Depends(verify_token),
):
    """
    Start a background personalization job.
    Returns job_id immediately - poll /api/jobs/{job_id} for result.

    Auth: Bearer JWT required.
    Rate limited: 3 requests/minute per client_id.
    """
    request.state.client_id = payload.get("sub", "unknown")
    job_id = create_job()
    background_tasks.add_task(run_pipeline, job_id, body)
    log.info("personalize_queued", job_id=job_id, url=body.landing_page_url)
    return PersonalizeResponse(job_id=job_id)


@app.get("/api/jobs/{job_id}", tags=["Core"])
async def poll_job(job_id: str, _: dict = Depends(verify_token)):
    """Poll personalization job status. Auth: Bearer JWT required."""
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    status_val = job["status"]
    return {
        "job_id": job_id,
        "status": status_val.value if hasattr(status_val, "value") else str(status_val),
        "variants": job.get("variants", []),
        "warnings": job.get("warnings", []),
        "error": job.get("error"),
    }


@app.get("/api/preview/{job_id}", response_class=HTMLResponse, tags=["Preview"])
async def serve_preview(job_id: str, variant: str | None = None):
    """
    Serve personalized HTML for iframe preview.
    Accepts optional ?variant= string to select which variant to preview.
    No auth required - previews are shareable links.
    """
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.get("status") != JobStatus.done:
        return HTMLResponse(
            content=(
                "<html><body style='font-family:sans-serif;padding:2rem;color:#555'>"
                "<p>Processing - please wait…</p></body></html>"
            ),
            status_code=202,
        )
        
    variants = job.get("variants", [])
    if not variants:
        return HTMLResponse("No variants found", status_code=500)
        
    selected = variants[0]
    if variant:
        selected = next((v for v in variants if v["variant_id"] == variant), variants[0])
        
    res_html = selected["result_html"]
    
    # Inject <base> tag to fix relative assets (CSS, images, etc.)
    base_url = job.get("landing_page_url")
    if base_url:
        # Use a simple string replace for <head> injection to keep it fast
        base_tag = f'<base href="{base_url}">'
        if "<head>" in res_html:
            res_html = res_html.replace("<head>", f"<head>{base_tag}")
        else:
            # Fallback if no head tag exists
            res_html = f"{base_tag}{res_html}"

    return HTMLResponse(content=res_html)


@app.get("/api/download/{job_id}", tags=["Download"])
async def download_html(job_id: str, variant: str | None = None, _: dict = Depends(verify_token)):
    """Download self-contained personalized HTML file. Auth required."""
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.get("status") != JobStatus.done:
        raise HTTPException(status_code=409, detail="job not complete yet")
        
    variants = job.get("variants", [])
    if not variants:
        raise HTTPException(status_code=500, detail="No variants found")
        
    selected = variants[0]
    if variant:
        selected = next((v for v in variants if v["variant_id"] == variant), variants[0])
        
    filename = f"personalized-page-{job_id}-{selected['variant_id']}.html"
    return Response(
        content=selected["result_html"],
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
