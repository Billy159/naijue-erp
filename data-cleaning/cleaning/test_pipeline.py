"""Regression gates against the accepted cleaned batch and isolated databases."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from clean import collect, digest, validate_contract, verify_output
from future_diff import compare as compare_future
from verify import old_state


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[1]
RUN = BASE / "runs/TPLUS-CLEAN-20260924-A1"
PREFLIGHT = RUN / "preflight/TPLUS-IMPORT-20260924-A1"


def read(path: Path) -> dict:
    return json.loads(path.read_text())


class PipelineRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.meta = read(RUN / "RUN_META.json")
        cls.structure = read(BASE / "TPLUS_INPUT_STRUCTURE.json")
        cls.manifest = read(BASE / "TPLUS_CLEANING_MANIFEST.json")
        cls.preflight = read(RUN / "PREFLIGHT_SUMMARY.json")
        cls.verify = read(RUN / "TPLUS_CLEAN_VERIFY_REPORT.json")

    def test_raw_immutable_and_clean_idempotent(self) -> None:
        raw = Path(self.meta["input"])
        cleaned = Path(self.meta["output"])
        self.assertEqual({rel: digest(raw / rel) for rel in self.meta["rawHashes"]}, self.meta["rawHashes"])
        self.assertEqual({rel: digest(cleaned / rel) for rel in self.meta["cleanedHashes"]}, self.meta["cleanedHashes"])
        result = subprocess.run([sys.executable, str(BASE / "clean.py"), "--input", str(raw), "--run", str(RUN), "--batch", self.meta["batch"]], cwd=PROJECT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "ALREADY_CLEAN")

    def test_lineage_and_no_silent_mutation(self) -> None:
        changes = [json.loads(line) for line in (RUN / "cleaning_changes.jsonl").read_text().splitlines()]
        self.assertEqual(len(changes), self.meta["changedCells"])
        self.assertEqual({row["ruleId"] for row in changes}, {"TPC-001"})
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            raw, cleaned = root / "raw", root / "cleaned"
            raw.mkdir(); cleaned.mkdir()
            (raw / "test.txt").write_text("source")
            (cleaned / "test.txt").write_text("changed without a rule")
            with self.assertRaisesRegex(AssertionError, "silent byte mutation"):
                verify_output(raw, cleaned, {}, {"test.txt": digest(raw / "test.txt")})

    def test_assertion_stops_and_manual_fields_stay_raw(self) -> None:
        mapping = read(PROJECT / "data-cleaning/authority/frozen-v1/decisions/categories/full_mapping_2941.json")
        omitted = str(mapping[0]["code"])
        with tempfile.TemporaryDirectory() as folder:
            modified = Path(folder) / "mapping.json"
            modified.write_text(json.dumps(mapping[1:], ensure_ascii=False))
            edits, _, queue, assertion = collect(Path(self.meta["input"]), self.structure, self.manifest, modified, "TPLUS-CLEAN-TEST-A1")
        self.assertFalse(assertion["passed"])
        self.assertGreater(assertion["unmatchedProducts"], 0)
        self.assertTrue(any(item["entity"] == omitted and "TPC-013" in item["problem"] for item in queue))
        self.assertTrue(any("TPC-002" in item["problem"] for item in queue))
        self.assertTrue(any("TPC-007" in item["problem"] for item in queue))
        self.assertEqual(set(edits), {"基础档案/存货.xlsx"})

    def test_structure_drift_requires_stop(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            _, drift = validate_contract(Path(folder), self.structure)
        self.assertTrue(any(item["kind"] == "missing_file" for item in drift))

    def test_preflight_stops_when_category_review_is_open(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            meta = dict(self.meta)
            meta["status"] = "REVIEW_REQUIRED"
            meta["categoryAssertion"] = {**meta["categoryAssertion"], "passed": False, "unmatchedProducts": 1}
            (run / "RUN_META.json").write_text(json.dumps(meta))
            result = subprocess.run([sys.executable, str(BASE / "preflight.py"), "--run", str(run), "--authority-project", str(PROJECT), "--batch", "TPLUS-IMPORT-20260924-A9", "--dynamic"], cwd=PROJECT, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("CATEGORY_ASSERTION_REVIEW_REQUIRED", result.stderr)
            self.assertFalse((run / "preflight").exists())

    def test_future_diff_allows_additions_but_stops_identity_drift(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            old, new = Path(folder) / "old", Path(folder) / "new"
            rel = Path("data/master/products.jsonl")
            for root in (old, new):
                (root / rel).parent.mkdir(parents=True)
            (old / rel).write_text('{"sourceCode":"A","id":"stable-A"}\n')
            (new / rel).write_text('{"sourceCode":"A","id":"stable-A"}\n{"sourceCode":"B","id":"stable-B"}\n')
            def manifest(root: Path, batch: str, count: int) -> None:
                (root / "IMPORT_MANIFEST.json").write_text(json.dumps({"batchId": batch, "datasets": [{"path": rel.as_posix(), "recordCount": count, "sha256": digest(root / rel)}], "inventoryPolicy": {"mixedUnitQuantityControlTotal": "0"}}))
            manifest(old, "OLD", 1); manifest(new, "NEW", 2)
            result = compare_future(old, new)
            self.assertEqual(result["status"], "REVIEW")
            self.assertEqual(result["files"][rel.as_posix()]["sourceAdded"], 1)
            (new / rel).write_text('{"sourceCode":"A","id":"changed-A"}\n')
            manifest(new, "NEW", 1)
            result = compare_future(old, new)
            self.assertEqual(result["status"], "STOP")
            self.assertEqual(len(result["identityDrift"]), 1)

    def test_identity_size_category_and_quarantine(self) -> None:
        counts = self.preflight["files"]
        self.assertEqual(counts["data/master/products.jsonl"], 2941)
        self.assertEqual(counts["data/master/skus.jsonl"], 14864)
        self.assertEqual(counts["data/master/sizes.jsonl"], 240)
        self.assertEqual(counts["quarantine/unmatched_transfer_documents.jsonl"], 131)
        self.assertEqual(counts["quarantine/independent_receipt_documents.jsonl"], 25155)
        with (PREFLIGHT / "data/master/products.jsonl").open() as handle:
            products = [json.loads(line) for line in handle]
        with (PREFLIGHT / "data/master/skus.jsonl").open() as handle:
            skus = [json.loads(line) for line in handle]
        self.assertEqual(len({row["id"] for row in products}), len(products))
        self.assertEqual(len({row["id"] for row in skus}), len(skus))
        self.assertEqual(len({(row["sourceProductCode"], row["sourceColorCode"], row["sourceSizeCode"]) for row in skus}), len(skus))
        self.assertTrue(any(row["categoryDecision"].get("target_level") == "父级直挂" for row in products))
        size_audit = read(PROJECT / "data-cleaning/size-mapping/user-size-audit.json")
        self.assertEqual(size_audit["matched"], 14864)
        self.assertEqual(size_audit["unmatched"], 0)
        display_cells = defaultdict(list)
        for item in size_audit["matches"]:
            if item.get("targetSize"):
                display_cells[(item["product"], item["color"], item["targetGroup"], item["targetSize"])].append(item)
        shared_display = [group for group in display_cells.values() if len({item["sourceCode"] for item in group}) > 1]
        self.assertTrue(shared_display, "same display size must preserve separate A/B source SKU identities")
        self.assertTrue(all(len({item["sku"] for item in group}) == len(group) for group in shared_display))
        self.assertEqual(self.verify["new"]["runtimeGeneratedBarcodes"], 14170)
        runtime = read(RUN / "runtime/RUNTIME_INIT.json")
        self.assertEqual(runtime["barcodeFirst"]["exceptions"], 694)
        self.assertEqual(self.verify["new"]["negativeInventoryRows"], 1231)
        self.assertEqual(self.verify["new"]["inventoryTotal"], "80794.0000")
        self.assertTrue(self.verify["checks"]["fixedInventorySamples"])
        self.assertEqual({item["code"] for item in self.verify["inventorySamples"]}, {"0002", "026MS5133001"})
        manifest = read(PREFLIGHT / "IMPORT_MANIFEST.json")
        self.assertFalse(manifest["inventoryPolicy"]["snapshotParticipates"])
        self.assertFalse(manifest["inventoryPolicy"]["quarantinedRowsParticipate"])

    def test_preflight_import_runtime_diff_and_old_state(self) -> None:
        self.assertEqual(self.preflight["status"], "PASS")
        self.assertEqual(self.preflight["unresolvedForeignKeys"], 0)
        self.assertEqual(self.preflight["duplicateIdentity"], 0)
        self.assertEqual(self.verify["status"], "PASS")
        self.assertEqual(self.verify["new"]["batchStatus"], "COMMITTED")
        self.assertEqual(self.verify["new"]["runtimeDocuments"], 44021)
        self.assertEqual(self.verify["new"]["runtimePostings"], 0)
        self.assertEqual(self.verify["new"]["sourcePosting"], 0)
        self.assertEqual(read(RUN / "runtime/RUNTIME_INIT.json")["second"]["created"], 0)
        diff = read(RUN / "TPLUS_BATCH_DIFF_REPORT.json")
        self.assertEqual(diff["status"], "PASS")
        self.assertFalse(diff["identityDrift"])
        self.assertFalse(diff["unexpectedValueChanges"])
        baseline = read(RUN / "OLD_DB_BASELINE.json")
        current = old_state()
        self.assertEqual({key: current[key] for key in baseline if key not in ("newSourceExists", "newRuntimeExists")}, {key: baseline[key] for key in baseline if key not in ("newSourceExists", "newRuntimeExists")})


if __name__ == "__main__":
    unittest.main()
