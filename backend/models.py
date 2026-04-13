"""
Admorph - Pydantic v2 data models.

All schemas are strict: no extras allowed, all inputs validated at the boundary.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, HttpUrl, field_validator, model_validator


# ---------------------------------------------------------------------------
# Allowlists enforced in application code (not just prompts)
# ---------------------------------------------------------------------------

ALLOWED_ATTRIBUTES: frozenset[str] = frozenset(
    {"textContent", "innerHTML", "style", "class", "href", "src", "alt"}
)

# Selectors that must NEVER be modified - enforced in dom_transformer.py
FORBIDDEN_SELECTOR_PATTERNS: tuple[str, ...] = (
    "nav",
    "footer",
    "header",
    ".nav",
    ".footer",
    ".header",
    "#nav",
    "#footer",
    "#header",
    ".legal",
    "#legal",
    "[data-legal]",
    "form",
    "input",
    "select",
    "textarea",
    "button[type=submit]",
)

MAX_CHANGES_PER_RUN: int = 8


# ---------------------------------------------------------------------------
# Ad Intelligence
# ---------------------------------------------------------------------------


class AdTone(str, Enum):
    professional = "professional"
    casual = "casual"
    urgent = "urgent"
    friendly = "friendly"
    authoritative = "authoritative"


class AdInsight(BaseModel):
    """Structured intelligence extracted from an ad creative."""

    headline: str | None = None
    sub_headline: str | None = None
    cta: str | None = None
    value_proposition: str | None = None
    tone: AdTone
    brand_color: str | None = None  # hex if visible, else None
    primary_hex: str | None = None
    secondary_hex: str | None = None
    visual_mood: str | None = None # e.g. "Sleek Dark", "Bright Playful"
    target_audience: str | None = None
    product: str | None = None

    model_config = {"extra": "ignore"}


# ---------------------------------------------------------------------------
# Diff Schema
# ---------------------------------------------------------------------------


class DiffChange(BaseModel):
    """A single targeted modification to a DOM element."""

    selector: str
    attribute: str
    value: str
    reason: str  # which part of the ad drove this change

    model_config = {"extra": "forbid"}

    @field_validator("attribute")
    @classmethod
    def validate_attribute(cls, v: str) -> str:
        if v not in ALLOWED_ATTRIBUTES:
            raise ValueError(
                f"Attribute '{v}' is not in the allowlist. "
                f"Allowed: {sorted(ALLOWED_ATTRIBUTES)}"
            )
        return v

    @field_validator("selector")
    @classmethod
    def validate_selector_not_forbidden(cls, v: str) -> str:
        lower = v.lower().strip()
        for pattern in FORBIDDEN_SELECTOR_PATTERNS:
            if lower == pattern or lower.startswith(pattern + " ") or lower.startswith(pattern + ">"):
                raise ValueError(
                    f"Selector '{v}' targets a protected element "
                    f"(nav/footer/header/legal/form) and cannot be modified."
                )
        return v


class VariantChangeList(BaseModel):
    """A collection of changes representing a specific variant."""
    variant_id: str
    variant_name: str
    changes: list[DiffChange]

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def enforce_max_changes(self) -> VariantChangeList:
        if len(self.changes) > MAX_CHANGES_PER_RUN:
            self.changes = self.changes[:MAX_CHANGES_PER_RUN]
        return self

class DiffSchema(BaseModel):
    """The full JSON diff returned by the LLM containing multiple variants."""
    variants: list[VariantChangeList]

    model_config = {"extra": "ignore"}


# ---------------------------------------------------------------------------
# API Request / Response Schemas
# ---------------------------------------------------------------------------


class PersonalizeRequest(BaseModel):
    """Input payload for the personalization pipeline."""

    landing_page_url: str
    ad_url: str | None = None
    ad_image: str | None = None  # base64-encoded image bytes

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_ad_input(self) -> PersonalizeRequest:
        if not self.ad_url and not self.ad_image:
            raise ValueError("provide either ad_image or ad_url")
        if self.ad_url and self.ad_image:
            raise ValueError("provide ad_image or ad_url, not both")
        return self


class PersonalizeResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str = "Processing started. Poll /api/jobs/{job_id} for status."


class ChangeDetail(BaseModel):
    selector: str
    attribute: str
    new_value: str
    reason: str


class JobStatus(str, Enum):
    queued = "queued"
    analyzing_ad = "analyzing_ad"
    fetching_page = "fetching_page"
    generating_changes = "generating_changes"
    applying_changes = "applying_changes"
    done = "done"
    failed = "failed"


class VariantResult(BaseModel):
    """The final processed result for a single variant."""
    variant_id: str
    variant_name: str
    changes: list[ChangeDetail] = []
    result_html: str


class JobResult(BaseModel):
    job_id: str
    status: JobStatus
    variants: list[VariantResult] = []
    warnings: list[str] = []
    error: str | None = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TokenRequest(BaseModel):
    client_id: str

    model_config = {"extra": "forbid"}

    @field_validator("client_id")
    @classmethod
    def validate_client_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("client_id cannot be empty")
        if len(v) > 128:
            raise ValueError("client_id too long (max 128 chars)")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


# ---------------------------------------------------------------------------
# Status Endpoint
# ---------------------------------------------------------------------------


class StatusResponse(BaseModel):
    status: str = "ok"
    ts: str
    version: str = "1.0.0"
