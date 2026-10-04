"""Build a read-only URL/identity ledger from protected source exports."""
import argparse
import collections
import html
import json
import re
from urllib.parse import unquote, urlsplit


def decode_php_data(value):
    """Decode scalar/array PHP data without PHP object instantiation or execution."""
    raw = value.encode("utf-8")
    position = 0

    def expect(token):
        nonlocal position
        if raw[position:position + len(token)] != token:
            raise ValueError("Malformed serialized data")
        position += len(token)

    def number(delimiter):
        nonlocal position
        end = raw.find(delimiter, position)
        if end == -1:
            raise ValueError("Missing serialized delimiter")
        token = raw[position:end]
        if not re.fullmatch(rb"-?[0-9]+", token):
            raise ValueError("Invalid serialized number")
        position = end + len(delimiter)
        return int(token)

    def read(depth=0):
        nonlocal position
        if depth > 32 or position >= len(raw):
            raise ValueError("Serialized data exceeds bounds")
        tag = raw[position:position + 1]
        position += 1
        if tag == b"N":
            expect(b";")
            return None
        expect(b":")
        if tag == b"i":
            return number(b";")
        if tag == b"b":
            result = number(b";")
            if result not in (0, 1):
                raise ValueError("Invalid serialized boolean")
            return bool(result)
        if tag == b"s":
            length = number(b":")
            expect(b'"')
            if length < 0 or position + length > len(raw):
                raise ValueError("Invalid serialized string length")
            result = raw[position:position + length].decode("utf-8")
            position += length
            expect(b'";')
            return result
        if tag == b"a":
            size = number(b":")
            if not 0 <= size <= 100000:
                raise ValueError("Invalid serialized array length")
            expect(b"{")
            result = {}
            for _ in range(size):
                key = read(depth + 1)
                if type(key) not in (int, str) or key in result:
                    raise ValueError("Invalid or duplicate serialized key")
                result[key] = read(depth + 1)
            expect(b"}")
            return result
        raise ValueError("Unsupported serialized type; objects are never decoded")

    result = read()
    if position != len(raw):
        raise ValueError("Trailing serialized data")
    return result


def normalize_title(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip().casefold()


def source_path(record, uris, homepage):
    if record["id"] == homepage:
        return "/"
    path = uris.get(record["id"], uris.get(str(record["id"])))
    if not isinstance(path, str) or not path:
        return None
    # Preserve stored path spelling; reject full URLs and traversal, not rewrite.
    decoded = unquote(path)
    if path.startswith("//") or re.search(r"[?#\\\x00-\x20]", path) or re.search(r"[\\\x00-\x1f]", decoded) or any(p in (".", "..") for p in decoded.split("/")):
        raise ValueError("Unsafe stored source path")
    if urlsplit(path).scheme:
        raise ValueError("Expected a path, not a URL")
    return "/" + path.strip("/") + "/"


def reconcile(source, existing):
    options = {o["name"]: o["value"] for o in source["options"]}
    uris = decode_php_data(options.get("permalink-manager-uris", "a:0:{}"))
    if not isinstance(uris, dict):
        raise ValueError("Expected permalink map")
    homepage = int(options.get("page_on_front", "0"))
    meta = collections.defaultdict(dict)
    for row in source["metadata"]:
        # Preserve all duplicate values in the source export; kind is singular.
        meta[row["post_id"]].setdefault(row["key"], row["value"])
    by_url = collections.defaultdict(list)
    by_title = collections.defaultdict(list)
    for table, rows in (("institutions", existing["institutions"]), ("programs", existing["wp_program_ids"])):
        for row in rows:
            url = row.get("wp_url")
            if url:
                by_url[(table, url)].append(row["id"])
            name = row.get("institution_name", row.get("program_name", ""))
            by_title[(table, normalize_title(name))].append(row["id"])
    ledger = []
    for record in source["records"]:
        if record["post_type"] == "attachment":
            continue
        kind = meta[record["id"]].get("_case27_listing_type", record["post_type"])
        table = "institutions" if kind == "institution" else "programs" if kind == "program" else None
        path = source_path(record, uris, homepage)
        url = source["site_url"] + path if path else None
        candidates = by_url.get((table, url), []) if table and url else []
        disposition = "matched_url" if len(candidates) == 1 else "ambiguous_url" if len(candidates) > 1 else "unmapped"
        title_candidates = by_title.get((table, normalize_title(record["title"])), []) if table else []
        if not path:
            disposition = "missing_source_path"
        if record["status"] != "publish":
            disposition = "nonstandard_source_status"
        ledger.append({"source_id": record["id"], "kind": kind, "status": record["status"],
                       "title": record["title"], "path": path, "url": url,
                       "target_table": table, "target_id": candidates[0] if len(candidates) == 1 else None,
                       "title_candidates_for_review": title_candidates, "disposition": disposition})
    path_counts = collections.Counter(row["path"] for row in ledger if row["path"])
    duplicates = sorted(path for path, count in path_counts.items() if count > 1)
    return {"site_url": source["site_url"], "captured_at": source["captured_at"],
            "summary": {"source_records": len(ledger), "kinds": dict(collections.Counter(r["kind"] for r in ledger)),
                        "dispositions": dict(collections.Counter(r["disposition"] for r in ledger)),
                        "duplicate_paths": duplicates,
                        "listing_matches": {kind: dict(collections.Counter(r["disposition"] for r in ledger if r["kind"] == kind))
                                            for kind in ("institution", "program", "pathway")}},
            "ledger": ledger,
            "limitations": ["Exact URL matches establish identity, not field/content completeness.",
                            "Title matches are review candidates only; never merged automatically.",
                            "Does not change WordPress or Supabase; unknown routes remain unresolved."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--supabase", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    with open(args.source, encoding="utf-8-sig") as handle:
        source = json.load(handle)
    with open(args.supabase, encoding="utf-8-sig") as handle:
        existing = json.load(handle)
    result = reconcile(source, existing)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=True, indent=2)
    print(json.dumps(result["summary"]))
