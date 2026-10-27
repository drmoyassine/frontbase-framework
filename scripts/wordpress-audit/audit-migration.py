"""Offline USA WordPress migration completeness audit.

Read-only and network-free. Reconciles protected source snapshot exports
against canonical Supabase exports, the configured editorial collection,
optional storage-manifest evidence and explicit owner exclusion decisions.
Produces per-record/per-path dispositions, media and link audits and
idempotent dry-run proposals. It never mutates canonical data, never invents
paths, merges identities or assigns providers, and refuses to write inside the
repository so raw ledgers stay outside Git.

Rerunning with byte-identical inputs reproduces byte-identical ledgers.
"""
import argparse
import collections
import hashlib
import html
import importlib.util
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TOOLS = Path(__file__).resolve().parent
recovery = load_module("reconcile_wordpress", TOOLS.parent / "migration" / "reconcile-wordpress.py")
media = load_module("audit_media", TOOLS / "media.py")
links = load_module("audit_links", TOOLS / "links.py")

VERSION = 1
DISPOSITIONS = ("exactly_matched", "ambiguous", "missing", "intentionally_excluded", "awaiting_review")
AUTHORIZED_STATUS = {"publish"}
LISTING_KINDS = ("institution", "program", "pathway")
DIRECTORY = {"institution": ("institutions", "institution_name"),
             "program": ("wp_program_ids", "program_name"),
             "pathway": ("wp_program_ids", "program_name")}
CANONICAL_MEDIA = {"institutions": (("institution_image", "cover"), ("logo", "logo")),
                   "wp_program_ids": (("program_image", "cover"), ("logo", "logo"))}
PROTECTED_FIELDS = {"institution_name", "program_name", "status", "provider_id", "city_id",
                    "institution_id", "wp_url", "wp_id"}
SUPPORT = {"institution": "directory_runtime_pending", "program": "directory_runtime_pending",
           "pathway": "directory_runtime_pending", "article": "editorial_draft_only",
           "page": "editorial_draft_only", "attachment": "storage_only", "unsupported": "unsupported"}

LIMITATIONS = [
    "Offline audit: no live WordPress, Supabase or storage access; availability beyond the supplied storage manifest is unknown, never implied.",
    "Identity matches establish provenance only; publication approval, content equivalence and SEO behavior are separate acceptances.",
    "Additional canonical rows are intended expansion and are never counted as source gaps.",
    "Provider assignments and city identity are administrative prerequisites; they are never inferred or auto-created.",
    "Ambiguous matches require an explicit owner decision; no fuzzy or automatic merge is performed.",
    "GUIDs and slugs are never used as permalink evidence; unresolved source paths stay unresolved.",
    "Attachment records are inventoried as media evidence; no canonical media collection exists to match them against.",
    "Proposals are dry-run only; this tool cannot execute imports or updates.",
    "Rerunning with identical inputs reproduces identical ledgers; input digests are recorded in every artifact.",
]


def normalize_site(value):
    parsed = urlsplit((value or "").strip())
    host = (parsed.hostname or "").lower()
    if not parsed.scheme or not host:
        raise ValueError("site_url must be an absolute URL")
    return f"{parsed.scheme.lower()}://{host}{parsed.path.rstrip('/')}"


def blank(value):
    return value is None or (isinstance(value, str) and not value.strip())


def plain_text(value):
    """Reduce recovered rich text to plain text as data; nothing executes."""
    text = re.sub(r"(?is)<(script|style)\b[^>]*>.*?</\1>", " ", value or "")
    text = re.sub(r"(?s)<[^>]*>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def decode_options(source):
    options = {o["name"]: o.get("value") for o in source.get("options", [])}
    uris = recovery.decode_php_data(options.get("permalink-manager-uris", "a:0:{}"))
    if not isinstance(uris, dict):
        raise ValueError("Expected permalink map")
    return uris, int(options.get("page_on_front", "0") or 0)


def metadata_map(source):
    result = collections.defaultdict(dict)
    for row in source.get("metadata", []):
        result[row["post_id"]].setdefault(row["key"], row.get("value"))
    return result


def attachment_file_path(key, uploads_base):
    text = (key or "").strip()
    if not text:
        return None
    decoded = text.lstrip("/")
    if any(segment in ("", ".", "..") for segment in decoded.split("/")):
        raise ValueError("Unsafe attachment file key")
    return "/" + uploads_base.strip("/") + "/" + decoded


def classify_record(record, listing_meta):
    post_type = record.get("post_type")
    if post_type == "attachment":
        return "attachment"
    if post_type == "page":
        return "page"
    if post_type == "post":
        return "article"
    if listing_meta in LISTING_KINDS:
        return listing_meta
    return "unsupported"


def exclusion_index(exclusions):
    result = {"record": {}, "path": {}}
    for decision in (exclusions or {}).get("decisions", []):
        scope = decision.get("scope")
        reason, authority = decision.get("reason"), decision.get("authority")
        if scope not in ("record", "path") or not isinstance(reason, str) or not reason.strip() \
                or not isinstance(authority, str) or not authority.strip():
            raise ValueError("Exclusion decisions require scope, nonempty reason and authority")
        if scope == "record":
            if decision.get("source_type") is None or decision.get("source_id") is None:
                raise ValueError("Record exclusions require source_type and source_id")
            key = (decision["source_type"], int(decision["source_id"]))
        else:
            key = decision.get("path")
            if not isinstance(key, str) or not key.startswith("/"):
                raise ValueError("Path exclusions require an absolute path")
        if key in result[scope]:
            raise ValueError("Conflicting duplicate exclusion decision")
        result[scope][key] = {"reason": reason.strip(), "authority": authority.strip()}
    return result


def editorial_state_of(editorial):
    collection = (editorial or {}).get("collection")
    table = collection.get("table") if isinstance(collection, dict) else None
    if not isinstance(table, str) or not table.strip():
        table = None
    warnings = [] if table or editorial is None else ["editorial_collection_configuration_evidence_missing"]
    by_identity, by_path = collections.defaultdict(list), collections.defaultdict(list)
    for doc in (editorial or {}).get("documents", []):
        try:
            identity = (normalize_site(doc.get("source_origin", "")), int(doc["source_post_id"]))
        except (KeyError, TypeError, ValueError):
            warnings.append("document_with_unparsable_source_identity")
            continue
        by_identity[identity].append(doc)
        path = doc.get("original_path")
        if isinstance(path, str) and path.startswith("/"):
            by_path[path].append(doc)
    return {"present": editorial is not None, "configured": table is not None, "table": table,
            "by_identity": by_identity, "by_path": by_path,
            "warnings": sorted(set(warnings))}


def directory_index(canonical):
    by_url = collections.defaultdict(list)
    for table in ("institutions", "wp_program_ids"):
        for row in canonical.get(table, []):
            url = row.get("wp_url")
            if isinstance(url, str) and url.strip():
                by_url[url.strip()].append((table, row))
    return by_url


def match_listing(kind, url, index):
    table = DIRECTORY[kind][0]
    return [(t, row) for t, row in index.get(url, []) if t == table]


def resolve_paths(source, meta, uris, homepage, uploads_base):
    """Resolve every record's original public path; unsafe input is flagged, never guessed."""
    paths, errors = {}, {}
    for record in sorted(source.get("records", []), key=lambda r: r["id"]):
        record_id = record["id"]
        if record.get("post_type") == "attachment":
            key = meta[record_id].get("_wp_attached_file")
            try:
                paths[record_id] = attachment_file_path(key, uploads_base)
            except ValueError:
                paths[record_id] = None
                errors[record_id] = "unsafe_attachment_file_key"
            continue
        try:
            paths[record_id] = recovery.source_path(record, uris, homepage)
        except ValueError:
            paths[record_id] = None
            errors[record_id] = "unsafe_source_path"
    return paths, errors


def build_record_ledger(source, canonical, editorial_state, exclusions, meta, paths, path_errors,
                        site):
    index = directory_index(canonical)
    ledger = []
    for record in sorted(source.get("records", []), key=lambda r: r["id"]):
        record_id = record["id"]
        kind = classify_record(record, meta[record_id].get("_case27_listing_type"))
        path = paths.get(record_id)
        url = f"{site}{path}" if path else None
        entry = {"source_id": record_id, "source_type": kind, "status": record.get("status"),
                 "title": record.get("title"), "path": path, "url": url,
                 "target_table": None, "target_id": None,
                 "publication_support": SUPPORT[kind]}
        decision = exclusions["record"].get((kind, record_id)) or exclusions["record"].get((None, record_id))
        path_decision = exclusions["path"].get(path) if path else None
        if decision or path_decision:
            chosen = decision or path_decision
            entry.update(disposition="intentionally_excluded", reason=chosen["reason"],
                         evidence={"authority": chosen["authority"]})
            ledger.append(entry)
            continue
        if kind == "attachment":
            entry.update(disposition="awaiting_review",
                         reason="connected_storage_destination_requires_review",
                         evidence={"note": "Attachment binaries belong in administrator-connected storage; this is not an owner-approved exclusion."})
            ledger.append(entry)
            continue
        if kind == "unsupported":
            entry.update(disposition="awaiting_review", reason="unsupported_page_type",
                         evidence={"post_type": record.get("post_type")})
            ledger.append(entry)
            continue
        if record.get("status") not in AUTHORIZED_STATUS:
            entry.update(disposition="awaiting_review", reason="nonstandard_source_status", evidence={})
            ledger.append(entry)
            continue
        if record_id in path_errors:
            entry.update(disposition="awaiting_review", reason=path_errors[record_id], evidence={})
            ledger.append(entry)
            continue
        if not path:
            entry.update(disposition="awaiting_review", reason="source_path_unresolved", evidence={})
            ledger.append(entry)
            continue
        if kind in LISTING_KINDS:
            table, name_field = DIRECTORY[kind]
            candidates = match_listing(kind, url, index)
            name_candidates = sorted({row["id"] for row in canonical.get(table, [])
                                      if isinstance(row.get(name_field), str)
                                      and recovery.normalize_title(row[name_field])
                                      == recovery.normalize_title(record.get("title", ""))})
            if len(candidates) == 1:
                entry.update(disposition="exactly_matched", target_table=candidates[0][0],
                             target_id=candidates[0][1]["id"], reason=None,
                             evidence={"match": "exact_source_url"})
            elif len(candidates) > 1:
                entry.update(disposition="ambiguous", reason="duplicate_canonical_wp_url",
                             target_table=table, target_id=None,
                             evidence={"canonical_ids": sorted(row["id"] for _, row in candidates)})
            else:
                entry.update(disposition="missing", reason="no_canonical_destination",
                             target_table=table, target_id=None,
                             evidence={"title_candidates_for_review": name_candidates,
                                       "insert_prerequisites":
                                       ["city_identity_confirmation"] if kind == "institution"
                                       else ["campus_institution_confirmation"]})
            ledger.append(entry)
            continue
        if not editorial_state["present"]:
            entry.update(disposition="awaiting_review", reason="editorial_collection_not_available",
                         evidence={})
            ledger.append(entry)
            continue
        id_matches = editorial_state["by_identity"].get((site, record_id), [])
        path_matches = editorial_state["by_path"].get(path, [])
        if len(id_matches) == 1:
            doc = id_matches[0]
            doc_path = doc.get("original_path")
            others = [d for d in path_matches if d.get("id") != doc.get("id")]
            if doc_path is not None and doc_path != path:
                entry.update(disposition="ambiguous", reason="editorial_path_divergence",
                             evidence={"editorial_document_id": doc.get("id"),
                                       "editorial_original_path": doc_path})
            elif others:
                entry.update(disposition="ambiguous", reason="editorial_route_conflict",
                             evidence={"editorial_document_ids": sorted(d.get("id") for d in others)})
            elif not editorial_state["configured"]:
                entry.update(disposition="awaiting_review",
                             reason="editorial_collection_configuration_unverified",
                             evidence={"editorial_document_id": doc.get("id")})
            else:
                entry.update(disposition="exactly_matched", target_table=editorial_state["table"],
                             target_id=doc.get("id"), reason=None,
                             evidence={"match": "editorial_source_identity",
                                       "editorial_status": doc.get("status"),
                                       "editorial_revision": doc.get("revision")})
        elif len(id_matches) > 1:
            entry.update(disposition="ambiguous", reason="duplicate_editorial_identity",
                         evidence={"editorial_document_ids": sorted(d.get("id") for d in id_matches)})
        elif path_matches:
            entry.update(disposition="ambiguous", reason="editorial_path_claimed_by_other_source",
                         evidence={"editorial_document_ids": sorted(d.get("id") for d in path_matches)})
        elif not editorial_state["configured"]:
            entry.update(disposition="awaiting_review",
                         reason="editorial_collection_configuration_unverified",
                         evidence={"note": "Document absent from the supplied editorial export."})
        else:
            entry.update(disposition="missing", reason="not_yet_imported", evidence={})
        ledger.append(entry)
    return ledger


def build_path_ledger(record_ledger, exclusions):
    rows = []
    for entry in record_ledger:
        decision = exclusions["path"].get(entry["path"]) if entry["path"] else None
        disposition, reason = entry["disposition"], entry["reason"]
        if decision and disposition != "intentionally_excluded":
            disposition, reason = "intentionally_excluded", decision["reason"]
        rows.append({"path": entry["path"], "source_type": entry["source_type"],
                     "source_id": entry["source_id"], "disposition": disposition,
                     "reason": reason, "target_table": entry["target_table"],
                     "target_id": entry["target_id"],
                     "publication_support": entry["publication_support"]})
    return sorted(rows, key=lambda r: (r["path"] is None, r["path"] or "", r["source_id"]))


def relationship_audit(source, canonical, record_ledger, country_id):
    by_source = {entry["source_id"]: entry for entry in record_ledger}
    institutions = {row["id"]: row for row in canonical.get("institutions", [])}
    cities = {row["id"]: row for row in canonical.get("cities", [])}
    countries = {row["id"] for row in canonical.get("countries", [])}
    programs = {row["id"]: row for row in canonical.get("wp_program_ids", [])}
    region_terms = collections.defaultdict(list)
    for term in source.get("terms", []):
        if term.get("taxonomy") == "region":
            region_terms[term["post_id"]].append(term)
    findings = []

    def city_check(city_id, term):
        row = cities.get(city_id)
        if row is None:
            findings.append({"finding": "canonical_city_missing", "detail": {"city_id": city_id}})
            return
        if country_id is not None and row.get("country_id") != country_id:
            findings.append({"finding": "city_country_mismatch",
                             "detail": {"city_id": city_id, "country_id": row.get("country_id")}})
        if term is None:
            return
        exact = row.get("city", "").strip().casefold() == term["name"].strip().casefold()
        term_match = row.get("wp_id") == term.get("term_id")
        bounded = recovery.normalize_title(re.sub(r"^st\.\s+", "saint ", row.get("city", ""))) \
            == recovery.normalize_title(term["name"])
        if exact or (term_match and bounded):
            return
        findings.append({"finding": "city_term_evidence_mismatch",
                         "detail": {"city_id": city_id, "source_term_id": term.get("term_id")}})

    for entry in record_ledger:
        source_id = entry["source_id"]
        if entry["source_type"] == "institution" and entry["target_id"] is not None:
            row = institutions.get(entry["target_id"], {})
            terms = region_terms.get(source_id, [])
            term = terms[0] if len(terms) == 1 else None
            if row.get("city_id") is None:
                findings.append({"finding": "canonical_city_missing",
                                 "detail": {"institution_id": entry["target_id"]}})
            else:
                city_check(row.get("city_id"), term)
            if not terms:
                findings.append({"finding": "source_region_absent", "detail": {"source_id": source_id}})
        if entry["source_type"] in ("program", "pathway") and entry["target_id"] is not None:
            row = programs.get(entry["target_id"], {})
            parents = sorted({rel["parent_id"] for rel in source.get("relations", [])
                              if rel.get("child_id") == source_id
                              and rel.get("field_key") == "program-university-link"})
            if len(parents) > 1:
                findings.append({"finding": "multiple_source_institution_parents",
                                 "detail": {"source_id": source_id, "parents": parents}})
            if row.get("institution_id") is None:
                findings.append({"finding": "canonical_parent_missing",
                                 "detail": {"program_id": entry["target_id"]}})
                continue
            parent_matches = {by_source[p]["target_id"] for p in parents
                              if by_source.get(p, {}).get("target_id") is not None}
            if parents and not parent_matches:
                findings.append({"finding": "source_parent_unresolved",
                                 "detail": {"source_id": source_id, "parents": parents}})
            elif parent_matches and row.get("institution_id") not in parent_matches:
                findings.append({"finding": "parent_mismatch_never_rewritten",
                                 "detail": {"source_id": source_id,
                                            "canonical_institution_id": row.get("institution_id"),
                                            "source_parent_matches": sorted(parent_matches)}})
            campus = [p for p in parents if by_source.get(p, {}).get("path")
                      and entry["path"] and entry["path"].startswith(by_source[p]["path"])]
            if parents and len(campus) != 1:
                findings.append({"finding": "campus_parent_not_unique",
                                 "detail": {"source_id": source_id, "campus_candidates": campus}})
    if country_id is not None and canonical.get("countries") and country_id not in countries:
        findings.append({"finding": "configured_country_absent", "detail": {"country_id": country_id}})
    return sorted(findings, key=lambda f: (f["finding"], json.dumps(f["detail"], sort_keys=True)))


def source_id_sets(source, meta):
    result = collections.defaultdict(set)
    for record in source.get("records", []):
        kind = classify_record(record, meta[record["id"]].get("_case27_listing_type"))
        result[kind].add(record["id"])
        result["all"].add(record["id"])
    return result


def canonical_expansion(canonical, source_url_set, ids):
    listing_ids = {"institutions": ids["institution"],
                   "wp_program_ids": ids["program"] | ids["pathway"]}
    expansion, other_origin = [], []
    for table in ("institutions", "wp_program_ids"):
        for row in canonical.get(table, []):
            url = (row.get("wp_url") or "").strip()
            if url:
                if url in source_url_set:
                    continue
                origin = urlsplit(url)
                if origin.scheme and origin.hostname:
                    other_origin.append({"table": table, "id": row["id"]})
                    continue
            if row.get("wp_id") is not None and row.get("wp_id") in listing_ids[table]:
                continue
            expansion.append({"table": table, "id": row["id"]})
    return {"expansion_rows": sorted(expansion, key=lambda r: (r["table"], r["id"])),
            "other_origin_references": sorted(other_origin, key=lambda r: (r["table"], r["id"]))}


def media_audit(source, canonical, meta, site, uploads_base, manifest):
    index = media.manifest_index(manifest)
    storage_hosts = {urlsplit(base).hostname for base in index["bases"] if urlsplit(base).hostname}
    source_host = urlsplit(site).hostname
    attachments = {r["id"]: r for r in source.get("records", []) if r.get("post_type") == "attachment"}
    mime_of = {r["id"]: r["post_mime_type"] for r in attachments.values() if r.get("post_mime_type")}
    refs = []
    counter = collections.Counter()

    def add(side, owner, role, raw, alt=None, content_type=None):
        counter[(side, role)] += 1
        reference_id = f"{side}:{owner.get('source_id', owner.get('id'))}:{role}:{counter[(side, role)]}"
        audited = media.safe_reference(raw)
        location = media.resolve_storage(audited, index) if audited["url"] else None
        availability, location = media.availability(audited, location, index)
        host_class = ("absent_reference" if audited["url"] is None
                      else media.host_class(audited["host"], source_host, storage_hosts))
        questions = []
        if host_class == "source_origin":
            questions.append("legacy_domain_dependency")
        if host_class == "external":
            questions.append("external_source_rights_unknown")
        if role == "inline" and not alt:
            questions.append("alt_text_absent")
        if "svg_rights_and_safety_review" in audited["issues"]:
            questions.append("svg_rights_and_safety_review")
        if availability == "manifest_miss":
            questions.append("missing_asset_review")
        refs.append({"reference_id": reference_id, "side": side, "owner": owner, "role": role,
                     "raw_value": raw, "url": audited["url"], "host": audited["host"],
                     "host_class": host_class, "issues": audited["issues"], "safe": audited["safe"],
                     "availability": availability, "location": location,
                     "alt": alt, "content_type": content_type, "rights_questions": questions})

    for record in sorted(source.get("records", []), key=lambda r: r["id"]):
        record_id = record["id"]
        kind_meta = meta[record_id]
        if record.get("post_type") == "attachment":
            key = kind_meta.get("_wp_attached_file")
            url = site + attachment_file_path(key, uploads_base) if key else None
            add("source", {"source_id": record_id}, "attachment_file", url,
                content_type=mime_of.get(record_id))
            continue
        cover = kind_meta.get("_job_cover")
        if isinstance(cover, str) and cover.strip():
            add("source", {"source_id": record_id}, "cover", cover)
        thumb = kind_meta.get("_thumbnail_id")
        if isinstance(thumb, str) and thumb.strip().lstrip("-").isdigit():
            thumb_id = int(thumb)
            if thumb_id in attachments:
                key = meta[thumb_id].get("_wp_attached_file")
                url = site + attachment_file_path(key, uploads_base) if key else None
                add("source", {"source_id": record_id}, "thumbnail", url,
                    content_type=mime_of.get(thumb_id))
            else:
                add("source", {"source_id": record_id}, "thumbnail", None)
        for image in media.inline_images(record.get("content", "")):
            add("source", {"source_id": record_id}, "inline", image["src"], alt=image["alt"])

    for table in ("institutions", "wp_program_ids"):
        for row in sorted(canonical.get(table, []), key=lambda r: r["id"]):
            for field, role in CANONICAL_MEDIA[table]:
                if field in row:
                    add("canonical", {"table": table, "id": row["id"]}, role, row.get(field))

    duplicates = media.duplicate_groups(refs)
    checksum_duplicates = media.manifest_checksum_duplicates(manifest)
    summary = {"references": len(refs),
               "by_availability": dict(sorted(collections.Counter(r["availability"] for r in refs).items())),
               "by_host_class": dict(sorted(collections.Counter(r["host_class"] for r in refs).items())),
               "duplicate_url_groups": len(duplicates),
               "manifest_checksum_duplicate_groups": len(checksum_duplicates),
               "legacy_domain_references": sum(1 for r in refs if r["host_class"] == "source_origin"),
               "rights_questions": sum(1 for r in refs if r["rights_questions"])}
    return {"summary": summary, "references": refs, "duplicate_url_groups": duplicates,
            "manifest_checksum_duplicate_groups": checksum_duplicates}


def links_audit(source, site, inventory):
    host = urlsplit(site).hostname
    per_record, unresolved = [], {}
    totals = collections.Counter()
    for record in sorted(source.get("records", []), key=lambda r: r["id"]):
        result = links.audit(record.get("content", "") or "", host, inventory)
        if not any(result.values()):
            continue
        per_record.append({"source_id": record["id"],
                           "internal_resolved": sorted(set(result["internal_resolved"])),
                           "internal_unresolved": sorted(set(result["internal_unresolved"]))})
        for path in result["internal_unresolved"]:
            unresolved.setdefault(path, set()).add(record["id"])
        for key in ("internal_resolved", "internal_unresolved", "external",
                    "non_http_action", "unsafe_or_relative"):
            totals[f"{key}_occurrences"] += len(result[key])
    return {"summary": {"internal_resolved_occurrences": totals["internal_resolved_occurrences"],
                        "internal_unresolved_distinct_paths": len(unresolved),
                        "internal_unresolved_occurrences": totals["internal_unresolved_occurrences"],
                        "external_occurrences": totals["external_occurrences"],
                        "non_http_action_occurrences": totals["non_http_action_occurrences"],
                        "unsafe_or_relative_occurrences": totals["unsafe_or_relative_occurrences"]},
            "unresolved_paths": [{"path": path, "referencing_source_ids": sorted(ids)}
                                 for path, ids in sorted(unresolved.items())],
            "per_record": per_record}


def field_gaps(canonical, record_ledger):
    by_target = {(e["target_table"], e["target_id"]): e for e in record_ledger
                 if e["disposition"] == "exactly_matched"}
    gaps = []
    for table in ("institutions", "wp_program_ids"):
        for row in sorted(canonical.get(table, []), key=lambda r: r["id"]):
            entry = by_target.get((table, row["id"]))
            if entry is None:
                continue
            for field, _role in CANONICAL_MEDIA[table]:
                if field in row and blank(row.get(field)):
                    gaps.append({"table": table, "target_id": row["id"], "field": field,
                                 "state": "blank_with_source_evidence_candidate",
                                 "source_id": entry["source_id"]})
    return sorted(gaps, key=lambda g: (g["table"], g["target_id"], g["field"]))


def build_proposals(canonical, record_ledger, editorial_state, meta, field_map, gaps):
    proposals = []

    def sort_key(item):
        return (item["kind"], str(item.get("table") or ""), str(item.get("target_id") or ""),
                str(item.get("field") or ""), str(item.get("source_id") or ""))

    for mapping in sorted((field_map or {}).get("mappings", []),
                          key=lambda m: (m.get("table", ""), m.get("canonical_field", ""))):
        if mapping.get("transform") != "plain_text":
            raise ValueError("Only the plain_text transform is supported")
        table, field, key = mapping["table"], mapping["canonical_field"], mapping["source_metadata_key"]
        if table not in ("institutions", "wp_program_ids") or field in PROTECTED_FIELDS \
                or field == "id":
            raise ValueError("Field mappings may never touch identity, naming, status or relationship fields")
        rows = {row["id"]: row for row in canonical.get(table, [])}
        for entry in record_ledger:
            if entry["source_type"] not in LISTING_KINDS or entry["disposition"] != "exactly_matched" \
                    or entry["target_table"] != table:
                continue
            row = rows.get(entry["target_id"])
            value = meta[entry["source_id"]].get(key)
            if row is None or field not in row or not blank(row.get(field)):
                continue
            after = plain_text(value) if isinstance(value, str) else ""
            if not after:
                continue
            guards = ["exact_target_identity", "prior_value_blank", "owner_review_required"]
            if "updated_at" in row:
                guards.append("unchanged_updated_at")
            proposals.append({"kind": "field_fill", "table": table, "target_id": entry["target_id"],
                              "field": field, "before": row.get(field), "after": after,
                              "evidence": {"source_id": entry["source_id"],
                                           "source_metadata_key": key},
                              "guards": guards, "executable": False,
                              "note": "Dry-run proposal only; apply solely through an owner-approved guarded process."})
    for entry in record_ledger:
        if entry["disposition"] == "missing" and entry["source_type"] in LISTING_KINDS:
            requires = ["city_identity_confirmation_required_never_inferred",
                        "administrative_provider_assignment_required_never_inferred"] \
                if entry["source_type"] == "institution" else \
                ["campus_institution_confirmation_required_never_inferred",
                 "administrative_provider_assignment_required_never_inferred",
                 "managed_level_mapping_reviewed"]
            proposals.append({"kind": "insert_directory_record", "table": entry["target_table"],
                              "source_id": entry["source_id"], "title": entry["title"],
                              "original_path": entry["path"], "original_url": entry["url"],
                              "requires": requires, "executable": False,
                              "note": "Dry-run proposal only; names, statuses and provider assignments remain owner decisions."})
        elif entry["disposition"] == "missing" and entry["source_type"] in ("article", "page"):
            proposals.append({"kind": "editorial_import", "table": editorial_state["table"],
                              "source_id": entry["source_id"], "original_path": entry["path"],
                              "requires": ["resolved_original_path",
                                           "conversion_draft_from_protected_capture",
                                           "route_conflict_free", "owner_review_before_any_import"],
                              "tool": "scripts/migration/import-editorial-draft.py",
                              "executable": False,
                              "note": "Dry-run proposal only; import happens through the existing guarded consumer import."})
    for gap in gaps:
        proposals.append({"kind": "media_reference_update", "table": gap["table"],
                          "target_id": gap["target_id"], "field": gap["field"], "after": None,
                          "evidence": {"source_id": gap["source_id"]},
                          "stages": ["acquire_source_asset", "decode_verify_and_strip_metadata",
                                     "visual_owner_review", "authenticated_upload_to_connected_storage",
                                     "anonymous_public_readback_check",
                                     "guarded_canonical_reference_update_with_rollback_manifest"],
                          "executable": False,
                          "note": "Missing covers are never manufactured; the owner-deferred enrichment boundary is retained."})
    return sorted(proposals, key=sort_key)


def audit(source, canonical, editorial, manifest, exclusions, field_map, country_id, uploads_base):
    site = normalize_site(source.get("site_url"))
    uris, homepage = decode_options(source)
    meta = metadata_map(source)
    paths, path_errors = resolve_paths(source, meta, uris, homepage, uploads_base)
    editorial_state = editorial_state_of(editorial)
    exclusions = exclusion_index(exclusions)
    ledger = build_record_ledger(source, canonical, editorial_state, exclusions, meta, paths,
                                 path_errors, site)
    path_ledger = build_path_ledger(ledger, exclusions)
    findings = relationship_audit(source, canonical, ledger, country_id)
    ids = source_id_sets(source, meta)
    source_url_set = {e["url"] for e in ledger if e["url"]}
    expansion = canonical_expansion(canonical, source_url_set, ids)
    media_result = media_audit(source, canonical, meta, site, uploads_base, manifest)
    inventory = {p for p in paths.values() if p} | {"/"}
    links_result = links_audit(source, site, inventory)
    gaps = field_gaps(canonical, ledger)
    proposals = build_proposals(canonical, ledger, editorial_state, meta, field_map, gaps)

    docs = (editorial or {}).get("documents", [])
    source_identities = {(site, e["source_id"]) for e in ledger}
    orphans = 0
    for doc in docs:
        try:
            if (normalize_site(doc.get("source_origin", "")), int(doc["source_post_id"])) not in source_identities:
                orphans += 1
        except (TypeError, ValueError):
            orphans += 1
    matched_source = {e["target_id"] for e in ledger
                      if e["target_table"] == editorial_state["table"] and e["target_id"] is not None}
    editorial_summary = {"present": editorial_state["present"],
                         "configured": editorial_state["configured"],
                         "collection_table": editorial_state["table"],
                         "documents": len(docs), "matched_source_records": len(matched_source),
                         "documents_without_source_record": orphans,
                         "warnings": editorial_state["warnings"]}

    by_type = collections.Counter(e["source_type"] for e in ledger)
    artifacts = {
        "reconciliation-ledger.json": {
            "tool": "scripts/wordpress-audit/audit-migration.py", "version": VERSION,
            "limitations": LIMITATIONS, "dispositions": list(DISPOSITIONS),
            "record_ledger": ledger, "path_ledger": path_ledger,
            "relationship_findings": findings, "canonical_expansion": expansion,
            "editorial": editorial_summary,
            "configuration": {"country_id": country_id, "uploads_base": uploads_base,
                              "exclusion_decisions": sum(len(v) for v in exclusions.values())}},
        "media-ledger.json": {"tool": "scripts/wordpress-audit/audit-migration.py",
                              "version": VERSION, **media_result},
        "links-ledger.json": {"tool": "scripts/wordpress-audit/audit-migration.py",
                              "version": VERSION, **links_result},
        "import-proposals.json": {
            "tool": "scripts/wordpress-audit/audit-migration.py", "version": VERSION,
            "policy": {"execution_permitted": False,
                       "idempotency": "Proposals derive only from inputs; unchanged inputs reproduce identical proposals, and any guarded apply must compare canonical values AND evidence before writing."},
            "proposals": proposals},
        "summary.json": {
            "tool": "scripts/wordpress-audit/audit-migration.py", "version": VERSION,
            "sanitized": True,
            "records": {"total": len(ledger), "by_type": dict(sorted(by_type.items())),
                        "by_disposition": dict(sorted(collections.Counter(
                            e["disposition"] for e in ledger).items())),
                        "by_type_and_disposition": {kind: dict(sorted(collections.Counter(
                            e["disposition"] for e in ledger if e["source_type"] == kind).items()))
                            for kind in sorted(by_type)}},
            "paths": {"by_disposition": dict(sorted(collections.Counter(
                r["disposition"] for r in path_ledger).items())),
                "without_source_path": sum(1 for r in path_ledger if r["path"] is None)},
            "relationships": {"findings_by_code": dict(sorted(collections.Counter(
                f["finding"] for f in findings).items()))},
            "canonical_expansion": {"expansion_rows": len(expansion["expansion_rows"]),
                                    "other_origin_references": len(expansion["other_origin_references"])},
            "editorial": editorial_summary,
            "media": media_result["summary"],
            "links": links_result["summary"],
            "field_gaps": {"blank_with_source_evidence_candidate": len(gaps)},
            "proposals": {"total": len(proposals),
                          "by_kind": dict(sorted(collections.Counter(
                              p["kind"] for p in proposals).items())),
                          "executable": 0}},
    }
    return artifacts


def serialize(artifacts):
    return {name: json.dumps(body, ensure_ascii=True, indent=2) for name, body in artifacts.items()}


def write_outputs(serialized, out_dir, root):
    output = Path(out_dir).resolve()
    if output == root or root in output.parents:
        raise ValueError("Raw audit outputs must stay outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    for name, text in serialized.items():
        (output / name).write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Offline WordPress migration completeness audit")
    parser.add_argument("--source", required=True, help="Protected WordPress snapshot export (JSON)")
    parser.add_argument("--canonical", required=True, help="Canonical Supabase export (JSON)")
    parser.add_argument("--editorial", help="Configured editorial collection export (JSON)")
    parser.add_argument("--storage-manifest", help="Connected-storage bucket listing export (JSON)")
    parser.add_argument("--exclusions", help="Explicit owner exclusion decisions (JSON)")
    parser.add_argument("--field-map", help="Guarded field mapping configuration (JSON)")
    parser.add_argument("--country-id", type=int, help="Configured destination country id")
    parser.add_argument("--uploads-base", default="wp-content/uploads")
    parser.add_argument("--output", required=True, help="Output directory OUTSIDE the repository")
    parser.add_argument("--self-check", action="store_true",
                        help="Run the audit twice and require byte-identical artifacts")
    args = parser.parse_args()

    def read(name):
        return json.loads(Path(name).read_text(encoding="utf-8-sig")) if name else None

    inputs = {"source": read(args.source), "canonical": read(args.canonical),
              "editorial": read(args.editorial), "manifest": read(args.storage_manifest),
              "exclusions": read(args.exclusions), "field_map": read(args.field_map)}
    digests = {label: digest(path) for label, path in
               (("source", args.source), ("canonical", args.canonical),
                ("editorial", args.editorial), ("manifest", args.storage_manifest),
                ("exclusions", args.exclusions), ("field_map", args.field_map)) if path}
    root = Path(__file__).resolve().parents[2]
    artifacts = audit(inputs["source"], inputs["canonical"], inputs["editorial"], inputs["manifest"],
                      inputs["exclusions"], inputs["field_map"], args.country_id, args.uploads_base)
    if args.self_check:
        repeat = audit(inputs["source"], inputs["canonical"], inputs["editorial"],
                       inputs["manifest"], inputs["exclusions"], inputs["field_map"],
                       args.country_id, args.uploads_base)
        if serialize(artifacts) != serialize(repeat):
            raise AssertionError("Determinism self-check failed")
        print("self-check: identical")
    for body in artifacts.values():
        body["input_digests"] = digests
    write_outputs(serialize(artifacts), args.output, root)
    print(json.dumps(artifacts["summary.json"], ensure_ascii=True))


if __name__ == "__main__":
    main()
