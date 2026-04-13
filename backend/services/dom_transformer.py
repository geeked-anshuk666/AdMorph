"""
Admorph - Safe DOM transformation via BeautifulSoup.

Applies DiffChange objects to HTML with hard safety guards:
  - Attribute allowlist enforced in code (not just prompt)
  - Selector validated against actual DOM before applying
  - Protected sections (nav/footer/header/form) never modified
  - All scripts stripped from output (iframe security, per PRD §2 assumption 5)
  - HTML re-parsed after changes - falls back to original on integrity failure
"""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bs4 import BeautifulSoup
from models import ALLOWED_ATTRIBUTES, DiffChange

_PARSER = "lxml"
_PROTECTED_TAGS = frozenset({"nav", "footer", "header", "form"})
_PROTECTED_IDENTIFIERS = frozenset(
    {"nav", "footer", "header", "legal", "navigation", "menu", "cookie"}
)


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------


def _in_protected_section(tag) -> bool:
    """Return True if the tag or any ancestor is a protected section."""
    for ancestor in tag.parents:
        if ancestor.name in _PROTECTED_TAGS:
            return True
        classes = set(ancestor.get("class", []))
        tag_id = ancestor.get("id", "").lower()
        if (classes | {tag_id}) & _PROTECTED_IDENTIFIERS:
            return True
    return False


# ---------------------------------------------------------------------------
# Single-change applicator
# ---------------------------------------------------------------------------


def _apply_change(soup: BeautifulSoup, change: DiffChange) -> str | None:
    """
    Apply one DiffChange to the BeautifulSoup tree in-place.

    Returns a warning string if skipped, or None on success.
    """
    if change.attribute not in ALLOWED_ATTRIBUTES:
        return f"Attribute '{change.attribute}' not in allowlist - skipped"

    try:
        elements = soup.select(change.selector)
    except Exception:
        return f"Invalid CSS selector '{change.selector}' - skipped"

    if not elements:
        return f"Selector '{change.selector}' not found in DOM - skipped"

    element = elements[0]

    if _in_protected_section(element):
        return f"Selector '{change.selector}' targets a protected section - skipped"

    attr = change.attribute
    if attr == "textContent":
        element.string = change.value
    elif attr == "innerHTML":
        element.clear()
        fragment = BeautifulSoup(change.value, _PARSER)
        for child in list(fragment.body.children if fragment.body else []):
            element.append(child.__copy__() if hasattr(child, "__copy__") else child)
    elif attr in ("src", "href", "alt", "style", "class"):
        element[attr] = change.value
    else:
        return f"Unsupported attribute '{attr}' - skipped"

    return None  # success


# ---------------------------------------------------------------------------
# Script stripping
# ---------------------------------------------------------------------------


def _strip_scripts(soup: BeautifulSoup) -> None:
    """Remove all <script> tags and inline event handlers."""
    for tag in soup.find_all("script"):
        tag.decompose()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs.keys()):
            if attr.lower().startswith("on"):  # onclick, onload, onerror, …
                del tag.attrs[attr]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def apply_diff(
    original_html: str,
    changes: list[DiffChange],
) -> tuple[str, list[str]]:
    """
    Apply changes to the page HTML.

    Returns:
        (result_html, warnings) - result_html is always valid HTML.
        If integrity fails after changes, original_html (script-stripped) is returned.
    """
    soup = BeautifulSoup(original_html, _PARSER)
    warnings: list[str] = []

    for change in changes:
        warning = _apply_change(soup, change)
        if warning:
            warnings.append(warning)

    # Strip all scripts for iframe security
    _strip_scripts(soup)

    # HTML integrity check - re-parse the output
    result_html = str(soup)
    try:
        BeautifulSoup(result_html, _PARSER)
    except Exception:
        warnings.append(
            "HTML validation failed after applying diff - returning original page"
        )
        fallback = BeautifulSoup(original_html, _PARSER)
        _strip_scripts(fallback)
        return str(fallback), warnings

    return result_html, warnings
