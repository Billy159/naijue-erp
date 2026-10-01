"""Run the existing ③A conversion against a verified cleaned T+ folder."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import date

from clean import digest, json_write


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[1]
SCRIPTS = PROJECT / "data-cleaning/conversion"
STEPS = [
    "convert_masters.py", "convert_sales.py", "convert_movements.py",
    "build_inventory.py", "validate_package.py", "build_control_reports.py",
    "build_inventory_report.py", "build_delivery.py",
]


def dynamic_delivery(out: Path, batch: str) -> None:
    sys.path.insert(0, str(SCRIPTS))
    from build_delivery import describe_dataset, fingerprint  # reuse frozen dataset classification
    validation = json.loads((out / "controls/validation.json").read_text())
    inventory = json.loads((out / "controls/inventory.json").read_text())
    if not validation["all_pass"]:
        raise AssertionError("dynamic preflight validation failed")
    datasets = []
    for folder in ("data", "quarantine", "diagnostics"):
        for path in sorted((out / folder).rglob("*.jsonl")):
            datasets.append({**describe_dataset(path), **fingerprint(path)})
    gate_checks = {
        "all_final_decisions_applied": validation["checks"]["all_user_product_assignments_applied"],
        "source_and_identity_conserved": validation["checks"]["persisted_primary_identity_unique"] and validation["checks"]["masters_domain_checks"] and validation["checks"]["sales_domain_checks"] and validation["checks"]["movements_domain_checks"] and validation["checks"]["inventory_domain_checks"],
        "no_unexplained_foreign_key_loss": validation["unresolved_fk_count"] == 0,
        "quarantine_intact": validation["checks"]["all_domain_file_counts_match_controls"] and validation["checks"]["every_event_matches_trusted_source_exactly_once"] if "every_event_matches_trusted_source_exactly_once" in validation["checks"] else validation["checks"]["all_domain_file_counts_match_controls"] and validation["checks"]["event_count_matches_converted_lines"],
        "zero_opening_independent_inventory_rebuilt": validation["checks"]["independent_stock_key_quantities_equal"] and validation["checks"]["stock_identities_units_components_match"],
        "protected_inputs_unchanged": validation["checks"]["all_source_authority_runtime_files_unchanged"],
    }
    if not all(gate_checks.values()):
        raise AssertionError(f"dynamic preflight gate failure: {gate_checks}")
    baseline = json.loads((out / "BASELINE.json").read_text())
    manifest = {
        "schemaVersion": "tplus-v2-preflight/1", "batchId": batch, "stage": "③A-2",
        "createdDate": date.today().isoformat(), "outputRoot": str(out),
        "scope": "independent cleaned-data conversion preflight", "executed": False,
        "formalImportExecuted": False, "demoBusinessStoreWritten": False,
        "runtimeAuditReplayAllowed": False, "preflightPassed": True,
        "canRecommendStage3B": True, "stage3BStarted": False,
        "gateChecks": gate_checks, "protectedInputFiles": baseline["protected_files"],
        "protectedInputsUnchanged": True,
        "inventoryPolicy": {
            "openingQuantity": "0",
            "formula": "0 + signed purchases - signed sales + reliable inbound - reliable outbound",
            "snapshotParticipates": False, "quarantinedRowsParticipate": False,
            "adjustmentDocumentsGenerated": False, "balanceLoadedOnce": True,
            "replayHistoricalEffectsOnImport": False,
            "mixedUnitQuantityControlTotal": inventory["totals"]["rebuilt_quantity_control_total"],
            "negativeInventoryRows": inventory["totals"]["stock_negative_rows"],
            "unitTotals": inventory["totals"]["unit_totals"],
        },
        "historyPolicy": {"readOnly": True, "unknownAuditFieldsStayNull": True, "preserveMultiCashRecords": True, "standaloneReceiptAssociationGuessed": False},
        "identityPolicy": {"master": "original source code plus entity type", "sku": "observed original product/color/size codes", "line": "original export SHA plus sheet plus row", "cartesianProductAllowed": False},
        "datasets": datasets,
        "counts": {"datasets": len(datasets), "importEligibleFiles": sum(x["canImport"] for x in datasets), "quarantineFiles": sum("隔离" in x["classification"] for x in datasets), "nonComputationalFiles": sum("不参与业务计算" in x["classification"] for x in datasets)},
    }
    json_write(out / "IMPORT_MANIFEST.json", manifest)
    counts = validation["file_counts"]
    (out / "CONTROL_TOTALS.md").write_text(f"# 动态批次控制量\n\n批次 `{batch}`；商品 {counts['data/master/products.jsonl']}、SKU {counts['data/master/skus.jsonl']}、历史销售 {counts['data/history/sales_documents.jsonl']}、销售行 {counts['data/history/sales_lines.jsonl']}、现结 {counts['data/history/sales_funds.jsonl']}、可靠调拨 {counts['data/history/transfer_documents.jsonl']}、调拨行 {counts['data/history/transfer_lines.jsonl']}；重建库存 {inventory['totals']['rebuilt_quantity_control_total']}，负库存键 {inventory['totals']['stock_negative_rows']}。所有控制项来自本次预检，不套旧批次常量。\n")
    (out / "QUARANTINE.md").write_text(f"# 隔离控制量\n\n未配其它入/出库 {counts['quarantine/unmatched_transfer_documents.jsonl']} 单、{counts['quarantine/unmatched_transfer_lines.jsonl']} 行；独立收款 {counts['quarantine/independent_receipt_documents.jsonl']} 单、{counts['quarantine/independent_receipt_lines.jsonl']} 行。均不参与库存或资金生效。\n")
    (out / "INVENTORY_REBUILD_RECONCILIATION.md").write_text(f"# 库存重建\n\n零期初，可信交易净量 {inventory['totals']['rebuilt_quantity_control_total']}；库存快照 {inventory['totals']['snapshot_quantity_control_total']} 仅供诊断。负库存键 {inventory['totals']['stock_negative_rows']} 保留，未生成调整单。\n")
    print(f"DYNAMIC DELIVERY PASS {batch} datasets={len(datasets)}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--authority-project", "--raw-project", dest="authority_project", type=Path, required=True)
    parser.add_argument("--batch", required=True)
    parser.add_argument("--dynamic", action="store_true", help="allow changed transaction volumes under the same confirmed master cohort")
    args = parser.parse_args()
    run = args.run.resolve()
    original_project = args.authority_project.resolve()
    meta = json.loads((run / "RUN_META.json").read_text())
    if meta["status"] != "CLEANED" or not meta["categoryAssertion"]["passed"]:
        raise ValueError("CATEGORY_ASSERTION_REVIEW_REQUIRED: resolve TPC-013 manual queue before preflight")
    raw_source = Path(meta["input"])
    cleaned = Path(meta["output"])
    if any(digest(raw_source / rel) != sha for rel, sha in meta["rawHashes"].items()):
        raise ValueError("RAW_SOURCE_CHANGED after cleaning")
    if any(digest(cleaned / rel) != sha for rel, sha in meta["cleanedHashes"].items()):
        raise ValueError("CLEANED_SOURCE_CHANGED after cleaning")
    out = run / "preflight" / args.batch
    out.mkdir(parents=True, exist_ok=True)
    protected = [{"path": "T+数据/" + rel, "sha256": sha, "bytes": (cleaned / rel).stat().st_size}
                 for rel, sha in meta["cleanedHashes"].items()]
    authorities = [
        "data-cleaning/authority/frozen-v1/business-decisions/CONFIRMED_DECISIONS.md",
        "data-cleaning/authority/frozen-v1/decisions/categories/full_mapping_2941.json",
        "data-cleaning/authority/frozen-v1/decisions/relations-confirmed.json",
        "data-cleaning/authority/frozen-v1/decisions/accounts/account-decision-results.json",
        "data-cleaning/authority/frozen-v1/frontend/product-master.js",
        "data-cleaning/authority/frozen-v1/frontend/master-data.js",
    ]
    for rel in authorities:
        file = original_project / rel
        protected.append({"path": rel, "sha256": digest(file), "bytes": file.stat().st_size})
    baseline = {
        "stage": "③A-2 cleaned rerun", "output_root": str(out),
        "rawBatch": "TPLUS-20260922-A2", "cleaningBatch": meta["batch"],
        "input": str(cleaned), "protected_files": protected,
    }
    json_write(out / "BASELINE.json", baseline)
    env = dict(os.environ)
    env.update({
        "TPLUS_OUT_DIR": str(out), "TPLUS_PROJECT_ROOT": str(original_project),
        "TPLUS_SRC_DIR": str(cleaned), "TPLUS_IDENTITY_SRC_DIR": str(raw_source),
        "TPLUS_PREFLIGHT_BATCH": args.batch,
    })
    if args.dynamic:
        env["TPLUS_DYNAMIC_COUNTS"] = "1"
    log_path = out / "PREFLIGHT_RUN.log"
    with log_path.open("w") as log:
        for step in (STEPS[:5] if args.dynamic else STEPS):
            log.write(f"START {step}\n")
            log.flush()
            print(f"PREFLIGHT {step}", flush=True)
            result = subprocess.run([sys.executable, str(SCRIPTS / step)], cwd=PROJECT, env=env, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                log.write(f"STOP {step} exit={result.returncode}\n")
                raise RuntimeError(f"preflight stopped in {step}; see {log_path}")
            log.write(f"PASS {step}\n")
    if args.dynamic:
        os.environ.update({key: env[key] for key in ("TPLUS_OUT_DIR", "TPLUS_PROJECT_ROOT", "TPLUS_SRC_DIR", "TPLUS_IDENTITY_SRC_DIR", "TPLUS_PREFLIGHT_BATCH", "TPLUS_DYNAMIC_COUNTS")})
        dynamic_delivery(out, args.batch)
    validation = json.loads((out / "controls/validation.json").read_text())
    manifest = json.loads((out / "IMPORT_MANIFEST.json").read_text())
    if not validation["all_pass"] or not manifest["preflightPassed"] or manifest["batchId"] != args.batch:
        raise AssertionError("cleaned preflight gates failed")
    summary = {
        "status": "PASS", "batch": args.batch, "input": str(cleaned),
        "preflight": str(out), "files": validation["file_counts"],
        "unresolvedForeignKeys": validation["unresolved_fk_count"],
        "duplicateIdentity": validation["duplicate_identity_count"],
        "inventoryTotal": validation["inventory_total"],
        "manifestSha256": digest(out / "IMPORT_MANIFEST.json"),
    }
    json_write(out / "PREFLIGHT_SUMMARY.json", summary)
    latest = run / "PREFLIGHT_SUMMARY.json"
    if not latest.exists() or json.loads(latest.read_text())["batch"] == args.batch:
        json_write(latest, summary)
    print(json.dumps({"status": "PASS", "batch": args.batch, "inventory": validation["inventory_total"], "manifest": str(out / "IMPORT_MANIFEST.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
