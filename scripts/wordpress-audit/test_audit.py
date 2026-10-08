"""Synthetic audit tests for the migration completeness tooling.

All fixtures are synthetic (usa.example); no private or real pilot data is
used. The suite proves disposition coverage, determinism, refusal behavior
and the dry-run-only proposal policy on the committed fixtures.
"""
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


audit_tool = module("audit_migration", HERE / "audit-migration.py")
media = module("audit_media_test", HERE / "media.py")
links = module("audit_links_test", HERE / "links.py")


def fixture(name):
    return json.loads((HERE / "fixtures" / name).read_text(encoding="utf-8"))


SOURCE = fixture("source-snapshot.json")
CANONICAL = fixture("canonical-export.json")
EDITORIAL = fixture("editorial-export.json")
MANIFEST = fixture("storage-manifest.json")
EXCLUSIONS = fixture("exclusions.json")
FIELD_MAP = fixture("field-map.json")


def run(source=None, canonical=None, editorial=EDITORIAL, manifest=MANIFEST,
        exclusions=EXCLUSIONS, field_map=FIELD_MAP, country_id=5):
    return audit_tool.audit(source or copy.deepcopy(SOURCE), canonical or copy.deepcopy(CANONICAL),
                            editorial, manifest, exclusions, field_map, country_id,
                            "wp-content/uploads")


class CoreAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results = run()

    def by_source_id(self, result):
        return {e["source_id"]: e for e in result["reconciliation-ledger.json"]["record_ledger"]}

    def test_deterministic_and_source_unmodified(self):
        source = copy.deepcopy(SOURCE)
        first = run(source=source)
        second = run(source=source)
        self.assertEqual(audit_tool.serialize(first), audit_tool.serialize(second))
        self.assertEqual(source, SOURCE)

    def test_every_record_and_path_has_disposition(self):
        ledger = self.results["reconciliation-ledger.json"]["record_ledger"]
        self.assertEqual(len(ledger), len(SOURCE["records"]))
        for entry in ledger:
            self.assertIn(entry["disposition"], audit_tool.DISPOSITIONS)
        paths = self.results["reconciliation-ledger.json"]["path_ledger"]
        self.assertEqual({r["source_id"] for r in paths}, {e["source_id"] for e in ledger})

    def test_exact_ambiguous_and_missing_listing_identities(self):
        ledger = self.by_source_id(self.results)
        self.assertEqual(ledger[7]["disposition"], "exactly_matched")
        self.assertEqual(ledger[7]["target_id"], 700)
        self.assertEqual(ledger[9]["disposition"], "exactly_matched")
        self.assertEqual(ledger[9]["target_table"], "wp_program_ids")
        self.assertEqual(ledger[60]["disposition"], "ambiguous")
        self.assertEqual(ledger[60]["reason"], "duplicate_canonical_wp_url")
        self.assertEqual(ledger[60]["evidence"]["canonical_ids"], [702, 703])
        self.assertEqual(ledger[61]["disposition"], "missing")
        self.assertEqual(ledger[61]["reason"], "no_canonical_destination")

    def test_status_unsupported_path_and_attachment_distinctions(self):
        ledger = self.by_source_id(self.results)
        self.assertEqual(ledger[11]["reason"], "nonstandard_source_status")
        self.assertEqual(ledger[11]["disposition"], "awaiting_review")
        self.assertEqual(ledger[40]["reason"], "unsupported_page_type")
        self.assertEqual(ledger[21]["reason"], "source_path_unresolved")
        self.assertEqual(ledger[30]["disposition"], "awaiting_review")
        self.assertEqual(ledger[30]["reason"], "connected_storage_destination_requires_review")
        self.assertEqual(ledger[50]["disposition"], "intentionally_excluded")
        self.assertEqual(ledger[50]["evidence"]["authority"], "synthetic-fixture-owner-decision")
        path_rows = {r["source_id"]: r for r in self.results["reconciliation-ledger.json"]["path_ledger"]}
        self.assertEqual(path_rows[50]["disposition"], "intentionally_excluded")
        self.assertEqual(path_rows[40]["publication_support"], "unsupported")
        self.assertIsNone(path_rows[31]["path"])

    def test_attachment_exclusion_requires_explicit_owner_decision(self):
        exclusions = copy.deepcopy(EXCLUSIONS)
        exclusions["decisions"].append({
            "scope": "record", "source_id": 30, "source_type": "attachment",
            "reason": "Reviewed duplicate attachment; binary retained in connected storage.",
            "authority": "synthetic-fixture-owner-decision",
        })
        result = run(exclusions=exclusions)
        entry = self.by_source_id(result)[30]
        self.assertEqual(entry["disposition"], "intentionally_excluded")
        self.assertEqual(entry["evidence"]["authority"], "synthetic-fixture-owner-decision")
        self.assertTrue(any(r["owner"].get("source_id") == 30
                            for r in result["media-ledger.json"]["references"]))

    def test_editorial_reconciliation_uses_configured_collection(self):
        ledger = self.by_source_id(self.results)
        self.assertEqual(ledger[20]["disposition"], "exactly_matched")
        self.assertEqual(ledger[20]["target_table"], "public.editorial_documents")
        self.assertEqual(ledger[20]["evidence"]["editorial_status"], "draft")
        self.assertEqual(ledger[22]["disposition"], "missing")
        self.assertEqual(ledger[22]["reason"], "not_yet_imported")
        self.assertEqual(ledger[10]["reason"], "not_yet_imported")

    def test_editorial_absent_leaves_records_awaiting_review(self):
        result = run(editorial=None)
        ledger = self.by_source_id(result)
        self.assertEqual(ledger[20]["reason"], "editorial_collection_not_available")
        self.assertEqual(ledger[22]["reason"], "editorial_collection_not_available")
        self.assertFalse(result["reconciliation-ledger.json"]["editorial"]["configured"])

    def test_editorial_configuration_evidence_required_for_match(self):
        result = run(editorial={"documents": EDITORIAL["documents"]})
        ledger = self.by_source_id(result)
        self.assertEqual(ledger[20]["disposition"], "awaiting_review")
        self.assertEqual(ledger[20]["reason"], "editorial_collection_configuration_unverified")

    def test_editorial_route_conflict_and_divergence_are_ambiguous(self):
        docs = EDITORIAL["documents"] + [dict(EDITORIAL["documents"][0], id=9002, source_post_id=22)]
        result = run(editorial={"collection": EDITORIAL["collection"], "documents": docs})
        ledger = self.by_source_id(result)
        self.assertEqual(ledger[20]["disposition"], "ambiguous")
        self.assertEqual(ledger[20]["reason"], "editorial_route_conflict")
        self.assertEqual(ledger[22]["disposition"], "ambiguous")
        self.assertEqual(ledger[22]["reason"], "editorial_path_divergence")

    def test_expansion_and_cross_origin_are_not_source_gaps(self):
        expansion = self.results["reconciliation-ledger.json"]["canonical_expansion"]
        self.assertEqual([r["id"] for r in expansion["expansion_rows"] if r["table"] == "institutions"], [701])
        self.assertEqual([r["id"] for r in expansion["expansion_rows"] if r["table"] == "wp_program_ids"], [802])
        self.assertEqual([r["id"] for r in expansion["other_origin_references"] if r["table"] == "institutions"], [704])
        self.assertEqual([r["id"] for r in expansion["other_origin_references"] if r["table"] == "wp_program_ids"], [803])
        summary = self.results["summary.json"]
        self.assertEqual(summary["records"]["by_disposition"].get("missing"),
                         summary["records"]["by_type_and_disposition"]["institution"].get("missing", 0)
                         + summary["records"]["by_type_and_disposition"]["article"].get("missing", 0)
                         + summary["records"]["by_type_and_disposition"]["page"].get("missing", 0))

    def test_guid_is_never_permalink_evidence(self):
        source = copy.deepcopy(SOURCE)
        for record in source["records"]:
            if record["id"] == 21:
                record["guid"] = "https://usa.example/guessed-path/"
        ledger = self.by_source_id(run(source=source))
        self.assertIsNone(ledger[21]["path"])
        self.assertEqual(ledger[21]["reason"], "source_path_unresolved")

    def test_relationships_preserved_and_mismatch_never_rewritten(self):
        self.assertEqual(self.results["summary.json"]["relationships"]["findings_by_code"], {})
        canonical = copy.deepcopy(CANONICAL)
        for row in canonical["wp_program_ids"]:
            if row["id"] == 800:
                row["institution_id"] = 701
        findings = run(canonical=canonical)["reconciliation-ledger.json"]["relationship_findings"]
        self.assertIn("parent_mismatch_never_rewritten", [f["finding"] for f in findings])

    def test_city_evidence_requires_term_or_exact_name(self):
        canonical = copy.deepcopy(CANONICAL)
        canonical["cities"][0]["country_id"] = 99
        findings = run(canonical=canonical)["reconciliation-ledger.json"]["relationship_findings"]
        self.assertIn("city_country_mismatch", [f["finding"] for f in findings])
        canonical["cities"][0]["country_id"] = 5
        canonical["cities"][0]["city"] = "Shadowspring"
        findings = run(canonical=canonical)["reconciliation-ledger.json"]["relationship_findings"]
        self.assertIn("city_term_evidence_mismatch", [f["finding"] for f in findings])

    def test_configured_country_checked(self):
        findings = run(country_id=6)["reconciliation-ledger.json"]["relationship_findings"]
        self.assertIn("configured_country_absent", [f["finding"] for f in findings])


class MediaAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = run()

    def refs_by(self):
        return {(r["side"], r["owner"].get("source_id", r["owner"].get("id")), r["role"]): r
                for r in self.result["media-ledger.json"]["references"]}

    def test_manifest_hit_miss_and_offline_unknown(self):
        refs = self.refs_by()
        hit = refs[("canonical", 700, "cover")]
        self.assertEqual(hit["availability"], "manifest_hit")
        self.assertEqual(hit["location"], {"bucket": "usa-media",
                                           "key": "wordpress/usa/institutions/700/abc.png"})
        miss = refs[("canonical", 801, "cover")]
        self.assertEqual(miss["availability"], "manifest_miss")
        self.assertIn("missing_asset_review", miss["rights_questions"])
        legacy = refs[("source", 7, "cover")]
        self.assertEqual(legacy["availability"], "unknown_offline")
        self.assertEqual(legacy["host_class"], "source_origin")
        self.assertIn("legacy_domain_dependency", legacy["rights_questions"])

    def test_host_classes_and_whitespace_trim(self):
        refs = self.refs_by()
        self.assertEqual(refs[("canonical", 701, "logo")]["issues"],
                         ["surrounding_whitespace_trimmed"])
        self.assertEqual(refs[("canonical", 701, "logo")]["host_class"], "source_origin")
        external = refs[("source", 8, "cover")]
        self.assertEqual(external["host_class"], "external")
        self.assertIn("external_source_rights_unknown", external["rights_questions"])

    def test_duplicates_by_url_and_checksum(self):
        result = self.result["media-ledger.json"]
        url_groups = [g["url"] for g in result["duplicate_url_groups"]]
        self.assertIn("https://usa.example/wp-content/uploads/2026/01/college-cover.png", url_groups)
        self.assertEqual(len(result["manifest_checksum_duplicate_groups"]), 1)
        self.assertEqual(len(result["manifest_checksum_duplicate_groups"][0]["keys"]), 2)

    def test_inline_alt_and_thumbnail_evidence(self):
        refs = self.refs_by()
        inline = [r for r in self.result["media-ledger.json"]["references"]
                  if r["role"] == "inline" and r["owner"]["source_id"] == 20]
        self.assertEqual(len(inline), 1)
        self.assertIn("alt_text_absent", inline[0]["rights_questions"])
        self.assertIn("external_source_rights_unknown", inline[0]["rights_questions"])
        thumb = refs[("source", 7, "thumbnail")]
        self.assertEqual(thumb["content_type"], "image/png")
        orphan = [r for r in self.result["media-ledger.json"]["references"]
                  if r["role"] == "attachment_file" and r["owner"]["source_id"] == 31]
        self.assertEqual(orphan[0]["url"], None)
        self.assertIn("empty_reference", orphan[0]["issues"])

    def test_unsafe_media_values_inventoried_not_dropped(self):
        source = copy.deepcopy(SOURCE)
        for record in source["records"]:
            if record["id"] == 9:
                record["content"] = "<img src=\"javascript:bad()\">"
        result = run(source=source)
        unsafe = [r for r in result["media-ledger.json"]["references"] if not r["safe"]]
        self.assertTrue(any("unsafe_scheme" in r["issues"] for r in unsafe))

    def test_blank_canonical_fields_are_absent_references(self):
        refs = self.refs_by()
        self.assertEqual(refs[("canonical", 701, "cover")]["host_class"], "absent_reference")
        self.assertIn("empty_reference", refs[("canonical", 701, "cover")]["issues"])

    def test_attachment_paths_use_attached_file_not_guid(self):
        refs = self.refs_by()
        self.assertEqual(refs[("source", 30, "attachment_file")]["url"],
                         "https://usa.example/wp-content/uploads/2026/01/college-cover.png")


class LinkAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = run()["links-ledger.json"]

    def test_unresolved_internal_paths_listed_with_referencing_records(self):
        unresolved = {r["path"]: r["referencing_source_ids"] for r in self.result["unresolved_paths"]}
        self.assertEqual(unresolved.get("/gone-page/"), [20])

    def test_resolved_internal_and_action_counts(self):
        summary = self.result["summary"]
        self.assertGreaterEqual(summary["internal_resolved_occurrences"], 3)
        self.assertEqual(summary["non_http_action_occurrences"], 1)
        self.assertEqual(summary["internal_unresolved_distinct_paths"], 1)

    def test_protocol_relative_never_internal(self):
        item = links.classify("//evil.example/x", "usa.example")
        self.assertEqual(item["class"], "external")
        self.assertTrue(all("/x" != r["path"] for r in self.result["unresolved_paths"]))


class ProposalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = run()
        cls.proposals = cls.result["import-proposals.json"]["proposals"]

    def test_dry_run_only_and_sorted(self):
        policy = self.result["import-proposals.json"]["policy"]
        self.assertFalse(policy["execution_permitted"])
        for proposal in self.proposals:
            self.assertFalse(proposal["executable"])
        keys = [(p["kind"], str(p.get("table") or ""), str(p.get("target_id") or ""),
                 str(p.get("field") or ""), str(p.get("source_id") or "")) for p in self.proposals]
        self.assertEqual(keys, sorted(keys))

    def test_field_fill_only_for_blank_canonical_values(self):
        fill = [p for p in self.proposals if p["kind"] == "field_fill"]
        self.assertEqual(len(fill), 1)
        self.assertEqual(fill[0]["table"], "wp_program_ids")
        self.assertEqual(fill[0]["target_id"], 800)
        self.assertEqual(fill[0]["before"], "")
        self.assertEqual(fill[0]["after"], "Submit transcripts and proof of English.")
        self.assertNotIn("steal", json.dumps(fill))
        self.assertIn("unchanged_updated_at", fill[0]["guards"])
        canonical = copy.deepcopy(CANONICAL)
        for row in canonical["wp_program_ids"]:
            if row["id"] == 800:
                row["admissions_requirements"] = "Already populated"
        fills = [p for p in run(canonical=canonical)["import-proposals.json"]["proposals"]
                 if p["kind"] == "field_fill"]
        self.assertEqual(fills, [])

    def test_protected_fields_never_mapped(self):
        for field in ("status", "institution_name", "provider_id", "city_id", "wp_url"):
            with self.assertRaises(ValueError):
                audit_tool.audit(SOURCE, CANONICAL, EDITORIAL, MANIFEST, EXCLUSIONS,
                                 {"mappings": [{"table": "institutions", "canonical_field": field,
                                                "source_metadata_key": "_x", "transform": "plain_text"}]},
                                 5, "wp-content/uploads")

    def test_insert_proposal_requires_owner_decisions_and_never_invents_provider(self):
        inserts = [p for p in self.proposals if p["kind"] == "insert_directory_record"]
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0]["source_id"], 61)
        self.assertTrue(any("provider" in r for r in inserts[0]["requires"]))
        blob = json.dumps(inserts)
        self.assertNotIn("provider_id", blob.replace("administrative_provider_assignment", ""))

    def test_editorial_and_media_proposals(self):
        self.assertEqual(len([p for p in self.proposals if p["kind"] == "editorial_import"]), 2)
        media_updates = [p for p in self.proposals if p["kind"] == "media_reference_update"]
        self.assertEqual(len(media_updates), 1)
        self.assertEqual(media_updates[0]["target_id"], 800)
        self.assertIsNone(media_updates[0]["after"])
        self.assertIn("authenticated_upload_to_connected_storage", media_updates[0]["stages"])


class CliAndSafetyTests(unittest.TestCase):
    def test_cli_deterministic_and_self_check(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            for out in (first, second):
                completed = subprocess.run(
                    [sys.executable, str(HERE / "audit-migration.py"),
                     "--source", str(HERE / "fixtures" / "source-snapshot.json"),
                     "--canonical", str(HERE / "fixtures" / "canonical-export.json"),
                     "--editorial", str(HERE / "fixtures" / "editorial-export.json"),
                     "--storage-manifest", str(HERE / "fixtures" / "storage-manifest.json"),
                     "--exclusions", str(HERE / "fixtures" / "exclusions.json"),
                     "--field-map", str(HERE / "fixtures" / "field-map.json"),
                     "--country-id", "5", "--output", out, "--self-check"],
                    capture_output=True, text=True, timeout=120)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertIn("self-check: identical", completed.stdout)
            names = ["reconciliation-ledger.json", "media-ledger.json", "links-ledger.json",
                     "import-proposals.json", "summary.json"]
            for name in names:
                self.assertEqual((Path(first) / name).read_bytes(), (Path(second) / name).read_bytes())
            summary = json.loads((Path(first) / "summary.json").read_text())
            self.assertTrue(summary["sanitized"])
            self.assertIn("input_digests", summary)
            self.assertEqual(summary["records"]["total"], len(SOURCE["records"]))

    def test_outputs_refused_inside_repository(self):
        with self.assertRaises(ValueError):
            audit_tool.write_outputs({"summary.json": "{}"}, HERE.parents[1], HERE.parents[1])

    def test_exclusion_validation(self):
        with self.assertRaises(ValueError):
            audit_tool.exclusion_index({"decisions": [{"scope": "path", "path": "/x/",
                                                       "reason": "no authority"}]})
        with self.assertRaises(ValueError):
            audit_tool.exclusion_index({"decisions": [
                {"scope": "path", "path": "/x/", "reason": "a", "authority": "b"},
                {"scope": "path", "path": "/x/", "reason": "c", "authority": "d"}]})
        with self.assertRaises(ValueError):
            audit_tool.exclusion_index({"decisions": [{"scope": "record", "source_id": "7",
                                                       "reason": "a", "authority": "b"}]})


class UnitTests(unittest.TestCase):
    def test_safe_reference_rejects_and_flags(self):
        for value, issue in [("javascript:alert(1)", "unsafe_scheme"),
                             ("data:text/html,bad", "unsafe_scheme"),
                             ("https://user:pass@example.com/x.png", "embedded_credentials"),
                             ("https://example.com/x.png?q=1", "query_string_not_permanent"),
                             ("https://example.com/x.png#frag", "fragment_not_permanent"),
                             ("http://example.com/x.png", "insecure_transport"),
                             ("https://example.com/x.svg", "svg_rights_and_safety_review")]:
            self.assertIn(issue, media.safe_reference(value)["issues"], value)

    def test_whitespace_trimmed_and_relative_flagged(self):
        self.assertEqual(media.safe_reference(" https://example.com/a.png ")["issues"],
                         ["surrounding_whitespace_trimmed"])
        self.assertEqual(media.safe_reference("/relative.png")["issues"], ["relative_reference"])

    def test_inline_images_extracted_as_data(self):
        refs = media.inline_images("<img SRC='/a.png' alt='Gate'><img src=\"b.png\"><img>")
        self.assertEqual(refs, [{"src": "/a.png", "alt": "Gate"}, {"src": "b.png", "alt": None}])

    def test_plain_text_strips_active_content(self):
        self.assertEqual(audit_tool.plain_text("<script>steal()</script><p>Café &amp; courses</p>"),
                         "Café & courses")

    def test_unsafe_attachment_keys_rejected(self):
        with self.assertRaises(ValueError):
            audit_tool.attachment_file_path("../evil.png", "wp-content/uploads")

    def test_relative_internal_links_flagged(self):
        self.assertEqual(links.classify("neighbor/", "usa.example")["class"], "relative_unresolved")
        self.assertEqual(links.classify("/a/../b", "usa.example")["class"], "unsafe")


if __name__ == "__main__":
    unittest.main()
