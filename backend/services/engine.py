"""
Admorph - Pipeline orchestrator and job manager.

Manages background personalization jobs.
Flow: cache check → fetch page → analyze ad → generate diff → apply diff → store result
"""

from __future__ import annotations

import asyncio
import base64
import time
import uuid
from typing import Any

import structlog

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings
from models import ChangeDetail, JobStatus, PersonalizeRequest
from services.ad_analyzer import analyze_ad
from services.cache import get_cache
from services.diff_generator import generate_diff
from services.dom_transformer import apply_diff
from services.page_fetcher import PageFetchError, fetch_page

log = structlog.get_logger()

# In-memory job store {job_id: job_dict}
_jobs: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Job management
# ---------------------------------------------------------------------------


def create_job() -> str:
    """Create a pending job entry and return its ID."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": JobStatus.queued,
        "original_html": None,
        "landing_page_url": None,
        "variants": [],
        "warnings": [],
        "error": None,
        "created_at": time.time(),
    }
    return job_id


async def get_job(job_id: str) -> dict[str, Any] | None:
    return _jobs.get(job_id)


def _update_status(job_id: str, status: JobStatus) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"] = status
    log.info("job_status", job_id=job_id, status=status.value)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


async def run_pipeline(job_id: str, request: PersonalizeRequest) -> None:
    """
    Background pipeline: cache → fetch → analyze → diff → apply.
    Always completes - failures are recorded in job["error"], never raised.
    """
    settings = get_settings()
    cache = get_cache(settings.cache_ttl)

    log.info("pipeline_start", job_id=job_id, url=request.landing_page_url)

    try:
        # Resolve ad input bytes for cache key
        if request.ad_image:
            ad_bytes = base64.b64decode(request.ad_image)
            image_url: str | None = None
        else:
            ad_bytes = (request.ad_url or "").encode()
            image_url = request.ad_url

        # Cache lookup
        cached = cache.get(ad_bytes, request.landing_page_url)
        if cached:
            log.info("cache_hit", job_id=job_id)
            _jobs[job_id].update(cached)
            _jobs[job_id]["status"] = JobStatus.done
            return

        # Stage 1: Fetch landing page
        _update_status(job_id, JobStatus.fetching_page)
        try:
            original_html = await fetch_page(
                request.landing_page_url,
                timeout=settings.fetch_timeout,
            )
        except PageFetchError as exc:
            _jobs[job_id]["status"] = JobStatus.failed
            _jobs[job_id]["error"] = str(exc)
            log.warning("page_fetch_failed", job_id=job_id, error=str(exc))
            return

        _jobs[job_id]["original_html"] = original_html
        _jobs[job_id]["landing_page_url"] = request.landing_page_url

        # Stage 2: Analyze ad
        _update_status(job_id, JobStatus.analyzing_ad)
        try:
            if request.ad_image:
                ad_insight = await analyze_ad(image_data=ad_bytes)
            else:
                ad_insight = await analyze_ad(image_url=image_url)
        except Exception as exc:
            log.error("ad_analysis_failed", job_id=job_id, error=str(exc))
            _jobs[job_id]["status"] = JobStatus.failed
            _jobs[job_id]["error"] = f"AI service failed: {str(exc)}"
            return

        # Stage 3: Generate diff
        _update_status(job_id, JobStatus.generating_changes)
        try:
            schema, diff_warnings = await generate_diff(original_html, ad_insight)
        except Exception as exc:
            log.error("diff_failed", job_id=job_id, error=str(exc))
            schema = None
            diff_warnings = [f"AI diff generation failed: {str(exc)}"]

        # Stage 4: Apply diff
        _update_status(job_id, JobStatus.applying_changes)
        
        variants_result = []
        all_warnings = list(diff_warnings)
        
        if schema and schema.variants:
            for variant in schema.variants:
                res_html, apply_warnings = apply_diff(original_html, variant.changes)
                all_warnings.extend(apply_warnings)
                
                change_details = [
                    ChangeDetail(
                        selector=c.selector,
                        attribute=c.attribute,
                        new_value=c.value,
                        reason=c.reason,
                    ).model_dump()
                    for c in variant.changes
                ]
                
                variants_result.append({
                    "variant_id": variant.variant_id,
                    "variant_name": variant.variant_name,
                    "changes": change_details,
                    "result_html": res_html,
                })
        else:
            # Fallback if AI fails: one variant with original HTML
            variants_result.append({
                "variant_id": "original",
                "variant_name": "Original",
                "changes": [],
                "result_html": original_html,
            })

        result = {
            "status": JobStatus.done,
            "original_html": original_html,
            "variants": variants_result,
            "warnings": all_warnings,
            "error": None,
        }

        cache.set(ad_bytes, request.landing_page_url, result)
        _jobs[job_id].update(result)
        log.info(
            "pipeline_done",
            job_id=job_id,
            variants=len(variants_result),
            warnings=len(all_warnings),
        )

    except Exception as exc:
        log.error("pipeline_unexpected", job_id=job_id, error=str(exc))
        _jobs[job_id]["status"] = JobStatus.failed
        _jobs[job_id]["error"] = "Internal error - check server logs"
