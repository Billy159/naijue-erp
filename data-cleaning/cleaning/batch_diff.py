"""Compare frozen A2 and cleaned preflight packages by source identity and value."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import filecmp
import json
from pathlib import Path
import re

from clean import json_write


IDENTITY = {
    "data/master/products.jsonl": "product",
    "data/master/skus.jsonl": "sku",
    "data/master/warehouses.jsonl": "warehouse",
    "data/history/sales_documents.jsonl": "sale",
    "data/history/transfer_documents.jsonl": "transfer",
}
ALLOWED_VALUE_PATHS = {"source.存货描述", "description", "sourceDescription"}
PRODUCT_SAMPLES = {"121MS5373276", "307YR0802836", "次品", "739JK5396111", "503KZ3369858", "963KZ5579172", "001CS5131140-绿色"}
SALE_SAMPLES = {"SA-2026-09-0146", "SA-2026-09-0207", "SA-2026-09-0203", "SA-2026-09-0021", "SA-2026-09-0175"}
TRANSFER_SAMPLES = {"ALAL-2026-09-0125", "ALAL-2024-10-0448"}


def differences(old: object, new: object, prefix: str = "") -> list[tuple[str, object, object]]:
    if type(old) is not type(new):
        return [(prefix or "<root>", old, new)]
    if isinstance(old, dict):
        keys = set(old) | set(new)
        return [item for key in sorted(keys) for item in differences(old.get(key), new.get(key), f"{prefix}.{key}" if prefix else key)]
    if isinstance(old, list):
        if len(old) != len(new):
            return [(prefix + ".length", len(old), len(new))]
        return [item for index, (a, b) in enumerate(zip(old, new)) for item in differences(a, b, f"{prefix}[{index}]",)]
    return [] if old == new else [(prefix or "<root>", old, new)]


def compare(old_root: Path, new_root: Path) -> dict:
    run_meta = json.loads((new_root.parents[1] / "RUN_META.json").read_text())
    old_product_sha = run_meta["rawHashes"]["基础档案/存货.xlsx"]
    new_product_sha = run_meta["cleanedHashes"]["基础档案/存货.xlsx"]
    old_files = {p.relative_to(old_root).as_posix() for folder in ("data", "quarantine") for p in (old_root / folder).rglob("*.jsonl")}
    new_files = {p.relative_to(new_root).as_posix() for folder in ("data", "quarantine") for p in (new_root / folder).rglob("*.jsonl")}
    if old_files != new_files:
        return {"status": "STOP", "fileAdded": sorted(new_files - old_files), "fileMissing": sorted(old_files - new_files)}
    summaries = {}
    unknown_paths = Counter()
    sample_seen = defaultdict(set)
    for rel in sorted(old_files):
        old_path = old_root / rel
        new_path = new_root / rel
        same_bytes = filecmp.cmp(old_path, new_path, shallow=False)
        paths = Counter()
        old_ids = set()
        new_ids = set()
        old_count = new_count = changed_records = 0
        with old_path.open() as a, new_path.open() as b:
            while True:
                old_line, new_line = a.readline(), b.readline()
                if not old_line and not new_line:
                    break
                if not old_line or not new_line:
                    raise AssertionError(f"record-count or order drift: {rel}")
                old_count += 1
                new_count += 1
                old_row = json.loads(old_line)
                new_row = json.loads(new_line)
                old_id = old_row.get("id")
                new_id = new_row.get("id")
                if old_id is not None:
                    old_ids.add(old_id)
                if new_id is not None:
                    new_ids.add(new_id)
                if old_id != new_id:
                    raise AssertionError(f"identity drift in {rel} row {old_count}: {old_id} -> {new_id}")
                source_code = old_row.get("sourceCode") or old_row.get("sourceNumber") or old_row.get("sourceDocumentNumber")
                if source_code in PRODUCT_SAMPLES | SALE_SAMPLES | TRANSFER_SAMPLES:
                    sample_seen[rel].add(source_code)
                if old_line == new_line:
                    continue
                changed_records += 1
                for path, before, after in differences(old_row, new_row):
                    summary_path = re.sub(r"\[\d+\]", "[]", path)
                    paths[summary_path] += 1
                    known_sha_change = path.endswith(".sourceSha256") and before == old_product_sha and after == new_product_sha
                    if not (known_sha_change or path in ALLOWED_VALUE_PATHS):
                        unknown_paths[(rel, summary_path)] += 1
        summaries[rel] = {
            "oldCount": old_count, "newCount": new_count, "sameBytes": same_bytes,
            "changedRecords": changed_records, "identityAdded": len(new_ids - old_ids),
            "identityRemoved": len(old_ids - new_ids), "changedPaths": dict(paths),
        }
    controls_old = json.loads((old_root / "controls/validation.json").read_text())
    controls_new = json.loads((new_root / "controls/validation.json").read_text())
    identity_drift = {rel: value for rel, value in summaries.items() if rel in IDENTITY and (value["identityAdded"] or value["identityRemoved"])}
    missing_samples = {
        "product": sorted(PRODUCT_SAMPLES - sample_seen["data/master/products.jsonl"]),
        "sale": sorted(SALE_SAMPLES - sample_seen["data/history/sales_documents.jsonl"]),
        "transfer": sorted(TRANSFER_SAMPLES - sample_seen["data/history/transfer_documents.jsonl"]),
    }
    return {
        "status": "PASS" if not identity_drift and not unknown_paths and controls_old["inventory_total"] == controls_new["inventory_total"] and not any(missing_samples.values()) else "STOP",
        "oldBatch": "TPLUS-20260922-A2", "newBatch": json.loads((new_root / "IMPORT_MANIFEST.json").read_text())["batchId"],
        "identityDrift": identity_drift, "unexpectedValueChanges": [{"file": rel, "path": path, "count": count} for (rel, path), count in unknown_paths.items()],
        "inventoryOld": controls_old["inventory_total"], "inventoryNew": controls_new["inventory_total"],
        "missingSamples": missing_samples, "files": summaries,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="old", type=Path, required=True)
    parser.add_argument("--to", dest="new", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = compare(args.old, args.new)
    json_write(args.output, report)
    changed = [(rel, item) for rel, item in report.get("files", {}).items() if item["changedRecords"]]
    rows = "\n".join(f"| {rel} | {item['changedRecords']:,} | {', '.join(f'{k}: {v}' for k, v in item['changedPaths'].items())} |" for rel, item in changed)
    args.output.with_suffix(".md").write_text(f"# T+ 冻结批次与 Clean 批次差异\n\n结论：**{report['status']}**。原批次 `{report.get('oldBatch')}`，新批次 `{report.get('newBatch')}`。商品、SKU、仓库、销货、调拨身份漂移：{len(report.get('identityDrift', {}))}；未解释字段变化：{len(report.get('unexpectedValueChanges', []))}。库存控制合计 {report.get('inventoryOld')} → {report.get('inventoryNew')}。\n\n| 数据集 | 变更记录 | 字段路径 |\n|---|---:|---|\n{rows or '| 无 | 0 | — |'}\n\n明细见同名 JSON。\n")
    print(json.dumps({"status": report["status"], "changedFiles": len(changed), "identityDrift": len(report.get("identityDrift", {})), "unexpectedValueChanges": len(report.get("unexpectedValueChanges", []))}, ensure_ascii=False))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
