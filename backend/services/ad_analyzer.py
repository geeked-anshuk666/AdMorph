"""
Admorph - Ad creative analysis via Gemini Flash.

Extracts structured intelligence from ad images (base64 bytes or URL).
Never sends page content to this call - only the ad image.
"""

from __future__ import annotations

import json

import httpx
from google import genai
from google.genai import types

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings
from models import AdInsight


_SYSTEM_PROMPT = """\
You are an expert CRO (Conversion Rate Optimization) analyst.
Analyze the provided ad creative image and extract structured data.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "headline": "primary headline text from the ad",
  "sub_headline": "secondary text or null",
  "cta": "call-to-action button text",
  "value_proposition": "the core promise or benefit offered",
  "tone": "professional|casual|urgent|friendly|authoritative",
  "primary_hex": "Dominant brand hex color (e.g. #FF0000)",
  "secondary_hex": "Accent brand hex color",
  "visual_mood": "2-3 words describing the vibe (e.g. 'Sleek Dark Mode', 'Bright Organic Wellness')",
  "target_audience": "who this ad targets",
  "product": "product or service being advertised"
}

Rules:
- Extract ONLY visible content from the ad. Do not invent data.
- tone must be exactly one of the five options above.
- Keep all values concise (under 100 chars each).
"""


def _build_client() -> genai.Client:
    return genai.Client(api_key=get_settings().google_api_key)


async def analyze_ad(
    image_data: bytes | None = None,
    image_url: str | None = None,
    mime_type: str = "image/jpeg",
) -> AdInsight:
    """
    Analyze an ad creative and return structured AdInsight.

    Provide exactly one of image_data (raw bytes) or image_url (public HTTPS URL).
    """
    settings = get_settings()
    client = _build_client()

    if image_data:
        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
    elif image_url:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as http:
            resp = await http.get(image_url)
            resp.raise_for_status()
            fetched = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0]
        image_part = types.Part.from_bytes(data=fetched, mime_type=content_type)
    else:
        raise ValueError("provide image_data or image_url")

    from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential
    
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1.5, min=2, max=10),
        reraise=True
    ):
        with attempt:
            response = await client.aio.models.generate_content(
                model=settings.gemini_flash_model,
                contents=[image_part, _SYSTEM_PROMPT],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )

    data = json.loads(response.text)
    return AdInsight(**data)
