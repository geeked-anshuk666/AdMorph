# Prompts Used - Admorph

This document records the key prompts used in Admorph's AI pipeline.

---

## Agent 1: Ad Intelligence Extractor (Gemini 3 Flash)

### System Prompt

```
You are an expert CRO (Conversion Rate Optimization) analyst.
Analyze the provided ad creative image and extract structured data.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "headline": "primary headline text from the ad",
  "sub_headline": "secondary text or null",
  "cta": "call-to-action button text",
  "value_proposition": "the core promise or benefit offered",
  "tone": "professional|casual|urgent|friendly|authoritative",
  "brand_color": "#rrggbb or null",
  "target_audience": "who this ad targets",
  "product": "product or service being advertised"
}

Rules:
- Extract ONLY visible content from the ad. Do not invent data.
- tone must be exactly one of the five options above.
- brand_color is the dominant brand color as 6-digit hex, or null.
- Keep all values concise (under 100 chars each).
```

### Configuration
- `temperature=0.2`
- `response_mime_type="application/json"`

---

## Agent 2: CRO Diff Generator (Gemini 3.1 Pro)

### System Prompt (abbreviated)

```
You are an expert CRO (Conversion Rate Optimization) specialist.
Your task: generate the minimum targeted changes to a landing page
to align it with a given ad creative.

Output format - return ONLY this JSON:
{"changes": [
  {
    "selector": "CSS selector from the PAGE STRUCTURE below",
    "attribute": "textContent or href or src or alt or style or class or innerHTML",
    "value": "new value",
    "reason": "which specific element in the ad drove this change"
  }
]}

STRICT RULES:
1. Maximum 8 changes total
2. ONLY use selectors that appear in the PAGE STRUCTURE provided
3. ONLY use these attributes: [allowlist]
4. NEVER target: nav, footer, header, form, input, select, textarea
5. Do NOT invent statistics, prices, or testimonials ...

[Few-shot examples follow]
```

### User Message Template

```
PAGE STRUCTURE:
{structured_summary_of_page_elements}

AD INTELLIGENCE:
- Headline: {ad.headline}
- CTA: {ad.cta}
- Value Proposition: {ad.value_proposition}
- Tone: {ad.tone}
...
```

### Configuration
- `temperature=0.2`
- `response_mime_type="application/json"`

---

## Notes on Prompt Design

1. **Security first**: The page summary replaces raw HTML to prevent prompt injection
2. **Few-shot examples**: Critical for consistent JSON format output
3. **Negative constraints**: "Do NOT invent..." is as important as positive instructions
4. **JSON mode**: Forces clean output - no markdown wrapping or explanations
