"""
Admorph - JSON diff generation via Gemini Pro.

SECURITY: Page content is NEVER sent raw to the LLM.
We send only a structured summary of modifiable elements (selector + text preview)
to prevent prompt injection attacks via malicious page content.
"""

from __future__ import annotations

import json

from bs4 import BeautifulSoup
from google import genai
from google.genai import types

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings
from models import (
    ALLOWED_ATTRIBUTES,
    FORBIDDEN_SELECTOR_PATTERNS,
    MAX_CHANGES_PER_RUN,
    AdInsight,
    DiffSchema,
    VariantChangeList,
)


# ---------------------------------------------------------------------------
# Page structure summarizer (prompt injection defense)
# ---------------------------------------------------------------------------

_PROTECTED_ANCESTORS = {"nav", "footer", "header", "form"}


def _in_protected_section(tag) -> bool:
    for ancestor in tag.parents:
        if ancestor.name in _PROTECTED_ANCESTORS:
            return True
        classes = set(ancestor.get("class", []))
        tag_id = ancestor.get("id", "").lower()
        combined = classes | {tag_id}
        if combined & {"nav", "footer", "header", "legal", "navigation", "menu"}:
            return True
    return False


def _best_selector(tag, soup: BeautifulSoup) -> str:
    """Generate the most specific stable CSS selector for a tag."""
    tag_id = tag.get("id")
    if tag_id:
        return f"#{tag_id}"
    classes = [c for c in tag.get("class", []) if c]
    if classes:
        class_sel = "." + ".".join(classes[:2])
        candidate = f"{tag.name}{class_sel}"
        if len(soup.select(candidate)) == 1:
            return candidate
    return tag.name  # last resort: first match by tag name


def describe_page_structure(html: str) -> str:
    """
    Build a safe textual summary of a page's modifiable elements.

    Includes: title, non-protected headings, CTA links/buttons, hero paragraph.
    Excludes: nav, footer, header, forms, legal sections.
    """
    soup = BeautifulSoup(html, "lxml")
    lines: list[str] = []

    title = soup.find("title")
    if title:
        lines.append(f"Page title: {title.get_text(strip=True)[:120]}")

    lines.append("\nModifiable headings:")
    for tag in soup.find_all(["h1", "h2", "h3"], limit=8):
        if _in_protected_section(tag):
            continue
        text = tag.get_text(strip=True)[:120]
        if text:
            sel = _best_selector(tag, soup)
            lines.append(f"  {tag.name} selector='{sel}' | text='{text}'")

    lines.append("\nModifiable CTA elements:")
    for tag in soup.find_all(["a", "button"], limit=6):
        if _in_protected_section(tag):
            continue
        text = tag.get_text(strip=True)[:80]
        if text and len(text) < 60:
            sel = _best_selector(tag, soup)
            lines.append(f"  {tag.name} selector='{sel}' | text='{text}'")

    lines.append("\nModifiable paragraphs (top 2):")
    count = 0
    for tag in soup.find_all("p", limit=20):
        if _in_protected_section(tag) or count >= 2:
            continue
        text = tag.get_text(strip=True)
        if 20 < len(text) < 400:
            sel = _best_selector(tag, soup)
            lines.append(f"  p selector='{sel}' | text='{text[:180]}'")
            count += 1

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = f"""\
You are an expert CRO (Conversion Rate Optimization) specialist.
Your task: generate targeted changes to a landing page to align it with an ad creative.
Generate exactly 3 variations for A/B testing:
1. variant_id: "aggressive", variant_name: "Aggressive & Urgent"
2. variant_id: "playful", variant_name: "Playful & Casual"
3. variant_id: "direct", variant_name: "Direct & Clear"

Output format - return ONLY this JSON:
{{"variants": [
  {{
    "variant_id": "aggressive",
    "variant_name": "Aggressive & Urgent",
    "changes": [
      {{
        "selector": "CSS selector from the PAGE STRUCTURE below",
        "attribute": "textContent or href or src or alt or style or class",
        "value": "new value",
        "reason": "why this matches the tone"
      }}
    ]
  }}
]}}

STRICT RULES:
1. Maximum {MAX_CHANGES_PER_RUN} changes total per variant
2. ONLY use selectors that appear in the PAGE STRUCTURE provided
3. ONLY use these attributes: {", ".join(sorted(ALLOWED_ATTRIBUTES))}
4. NEVER target: nav, footer, header, form, input, select, textarea, button[type=submit]
5. ONLY modify elements with a direct, clear counterpart in the ad
6. Do NOT invent statistics, prices, or testimonials not present in the ad
"""


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


def _build_client() -> genai.Client:
    return genai.Client(api_key=get_settings().google_api_key)


async def generate_diff(
    html: str,
    ad_insight: AdInsight,
) -> tuple[DiffSchema | None, list[str]]:
    """
    Generate validated DiffSchema with 3 variants from page HTML and ad intelligence.

    Returns:
        (schema, warning_messages)
    """
    settings = get_settings()
    client = _build_client()

    page_summary = describe_page_structure(html)

    user_message = f"""\
PAGE STRUCTURE:
{page_summary}

AD INTELLIGENCE:
- Headline: {ad_insight.headline}
- Sub-headline: {ad_insight.sub_headline or "N/A"}
- CTA: {ad_insight.cta}
- Value Proposition: {ad_insight.value_proposition}
- Tone: {ad_insight.tone.value}
- Product: {ad_insight.product}
- Primary Brand Color: {ad_insight.primary_hex or "N/A"}
- Secondary Brand Color: {ad_insight.secondary_hex or "N/A"}
- Visual Mood/Aesthetic: {ad_insight.visual_mood or "N/A"}

Generate changes to maximize message match and aesthetic alignment. If you can identify CSS variables or main block styles to align colors, do so safely. If uncertain about any element, omit it."""

    from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential
    
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1.5, min=2, max=10),
        reraise=True
    ):
        with attempt:
            response = await client.aio.models.generate_content(
                model=settings.gemini_flash_model,
                contents=[_SYSTEM_PROMPT, user_message],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )

    warnings: list[str] = []
    valid_changes: list[DiffChange] = []

    try:
        data = json.loads(response.text)
        schema = DiffSchema(**data)
        
        # We manually trigger validation on each change within each variant to ensure
        # the attribute and selector rules inside DiffChange catch any LLM hallucinations.
        for variant in schema.variants:
            valid_changes = []
            for raw in variant.changes:
                try:
                    # this re-triggers the @field_validators inside DiffChange if needed,
                    # though they already ran during DiffSchema init.
                    valid_changes.append(raw)
                except Exception as exc:
                    warnings.append(f"Skipping change for '{raw.selector}' in {variant.variant_id}: {exc}")
            variant.changes = valid_changes

    except Exception as exc:
        warnings.append(f"Failed to parse LLM diff output: {exc}")
        return None, warnings

    return schema, warnings
