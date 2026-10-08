"""Offline media reference audit for migration completeness.

Classifies URL references, matches them against an offline storage manifest and
reports duplicates, legacy-domain dependencies and rights/alt-text questions.
No network access is performed; availability beyond the supplied manifest is
reported as unknown, never guessed.
"""
import re
from urllib.parse import unquote, urlsplit

CONTROL = re.compile(r"[\x00-\x20\x7f]")
IMG = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
ATTR = re.compile(r"""([a-zA-Z][a-zA-Z0-9:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')""")


def attributes(tag):
    result = {}
    for match in ATTR.finditer(tag):
        result[match.group(1).lower()] = match.group(2) if match.group(2) is not None else match.group(3)
    return result


def inline_images(html):
    """Extract img src/alt as data; never executes or fetches anything."""
    refs = []
    for tag in IMG.findall(html or ""):
        attrs = attributes(tag)
        src = attrs.get("src")
        if src and src.strip():
            refs.append({"src": src.strip(), "alt": attrs.get("alt")})
    return refs


def safe_reference(raw):
    """Normalize one raw reference into auditable data without executing it.

    Returns a dict with the trimmed value, parsed origin and issue list. Unsafe
    values are kept in the ledger with issues, never silently dropped, and are
    never eligible as proposal targets.
    """
    value = (raw or "").strip()
    issues = []
    if value != (raw or ""):
        issues.append("surrounding_whitespace_trimmed")
    if not value:
        return {"url": None, "host": None, "issues": ["empty_reference"], "safe": False}
    if CONTROL.search(value):
        issues.append("control_or_whitespace_characters")
    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    if scheme in ("javascript", "data", "vbscript", "file", "blob"):
        issues.append("unsafe_scheme")
        return {"url": value, "host": None, "issues": issues, "safe": False}
    if not scheme:
        issues.append("relative_reference")
        return {"url": value, "host": None, "issues": issues, "safe": False}
    if scheme not in ("http", "https"):
        issues.append("unsupported_scheme")
        return {"url": value, "host": None, "issues": issues, "safe": False}
    host = (parsed.hostname or "").lower()
    if not host:
        issues.append("missing_host")
        return {"url": value, "host": None, "issues": issues, "safe": False}
    if parsed.username or parsed.password:
        issues.append("embedded_credentials")
    if parsed.query:
        issues.append("query_string_not_permanent")
    if parsed.fragment:
        issues.append("fragment_not_permanent")
    if scheme == "http":
        issues.append("insecure_transport")
    if value.lower().endswith(".svg"):
        issues.append("svg_rights_and_safety_review")
    return {"url": value, "host": host, "issues": issues, "safe": not issues}


def host_class(host, source_host, storage_hosts):
    if host is None:
        return "unparsable"
    if source_host and host == source_host:
        return "source_origin"
    if host in storage_hosts:
        return "connected_storage"
    return "external"


def manifest_index(manifest):
    """Index public base URLs and explicit URL mappings from a storage export."""
    bases = {}
    keys = {}
    for bucket in (manifest or {}).get("buckets", []):
        name = bucket.get("bucket")
        for base in bucket.get("public_base_urls", []):
            normalized = base.strip().rstrip("/").lower()
            if normalized:
                bases[normalized] = name
        for item in bucket.get("keys", []):
            keys.setdefault(name, set()).add((item.get("key") or "").lstrip("/"))
    explicit = {}
    for mapping in (manifest or {}).get("url_map", []):
        url = (mapping.get("url") or "").strip()
        if url:
            explicit[url] = (mapping.get("bucket"), (mapping.get("key") or "").lstrip("/"))
    return {"bases": bases, "keys": keys, "explicit": explicit}


def resolve_storage(reference, index):
    """Map a URL to bucket/key using explicit mappings or public base prefixes.

    Returns None when the URL does not belong to any configured public base.
    """
    if not reference["url"] or not reference["safe"]:
        return None
    url = reference["url"]
    if url in index["explicit"]:
        bucket, key = index["explicit"][url]
        if bucket:
            return {"bucket": bucket, "key": key}
    lowered = url.lower()
    for base, bucket in sorted(index["bases"].items(), key=lambda item: (-len(item[0]), item[0])):
        if lowered == base:
            return {"bucket": bucket, "key": ""}
        if lowered.startswith(base + "/"):
            remainder = url[len(base) + 1:]
            remainder = unquote(remainder.split("#")[0].split("?")[0])
            return {"bucket": bucket, "key": remainder}
    return None


def availability(reference, location, index):
    """Offline availability evidence only; live HTTP results are never implied."""
    if location is None:
        return "unknown_offline", None
    bucket, key = location["bucket"], location["key"]
    known = index["keys"].get(bucket)
    if known is None:
        return "unknown_offline", location
    return ("manifest_hit", location) if key in known else ("manifest_miss", location)


def duplicate_groups(references):
    """Group audited references by normalized URL; groups >1 are duplicates."""
    by_url = {}
    for ref in references:
        if ref["url"]:
            by_url.setdefault(ref["url"], []).append(ref["reference_id"])
    return [{"url": url, "reference_ids": sorted(ids)} for url, ids in sorted(by_url.items()) if len(ids) > 1]


def manifest_checksum_duplicates(manifest):
    """Find several keys sharing one checksum inside the manifest export."""
    by_hash = {}
    for bucket in (manifest or {}).get("buckets", []):
        for item in bucket.get("keys", []):
            checksum = item.get("sha256")
            if checksum:
                by_hash.setdefault(checksum, set()).add(
                    (bucket.get("bucket"), (item.get("key") or "").lstrip("/")))
    return [{"sha256": checksum, "keys": sorted(keys)}
            for checksum, keys in sorted(by_hash.items()) if len(keys) > 1]
