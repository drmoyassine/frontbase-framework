"""Offline internal-link audit for recovered source content.

Extracts anchor hrefs as data, classifies them against the captured route
inventory and reports unresolved internal destinations. This HTML-attribute
scan deliberately does not cover builder-embedded JSON or dynamic links.
"""
import re
from urllib.parse import urlsplit

ANCHOR = re.compile(r"<a\b[^>]*>", re.IGNORECASE)
HREF = re.compile(r"""\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)


def extract_anchors(html):
    anchors = []
    for tag in ANCHOR.findall(html or ""):
        match = HREF.search(tag)
        if match:
            href = match.group(1) if match.group(1) is not None else match.group(2)
            if href and href.strip():
                anchors.append(href.strip())
    return anchors


def classify(href, source_host):
    """Return internal/external/unsafe plus the path of internal links."""
    if re.search(r"[\x00-\x20]", href):
        return {"class": "unsafe", "path": None}
    parsed = urlsplit(href)
    scheme = parsed.scheme.lower()
    if scheme in ("javascript", "data", "vbscript", "blob", "file"):
        return {"class": "unsafe", "path": None}
    if scheme in ("mailto", "tel"):
        return {"class": "non_http_action", "path": None}
    host = (parsed.hostname or "").lower()
    if parsed.netloc:
        if scheme in ("http", "https") and source_host and host == source_host:
            path = parsed.path or "/"
        else:
            return {"class": "external", "path": None}
    else:
        path = parsed.path or "/"
        if not path.startswith("/"):
            return {"class": "relative_unresolved", "path": path}
    segments = [segment for segment in path.split("/") if segment]
    if any(segment in (".", "..") for segment in segments):
        return {"class": "unsafe", "path": None}
    return {"class": "internal", "path": path}


def audit(html, source_host, inventory):
    """Classify one document's anchors against the captured path inventory."""
    result = {"internal_resolved": [], "internal_unresolved": [], "external": [],
              "non_http_action": [], "unsafe_or_relative": []}
    normalized = {path.rstrip("/") or "/" for path in inventory}
    for href in extract_anchors(html):
        item = classify(href, source_host)
        if item["class"] == "internal":
            target = item["path"]
            if (target.rstrip("/") or "/") in normalized:
                result["internal_resolved"].append(target)
            else:
                result["internal_unresolved"].append(target)
        elif item["class"] == "external":
            result["external"].append((urlsplit(href).hostname or "").lower())
        elif item["class"] == "non_http_action":
            result["non_http_action"].append(href.split(":", 1)[0])
        else:
            result["unsafe_or_relative"].append(href)
    return result
