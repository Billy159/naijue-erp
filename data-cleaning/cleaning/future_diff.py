"""Compare a future same-structure batch with its prior accepted preflight.

Changed business data is a review gate. Shared source identities must keep IDs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from clean import json_write


IDENTITY_FILES = {
    "data/master/products.jsonl": lambda row: (row.get("sourceCode"),),
    "data/master/skus.jsonl": lambda row: (row.get("sourceProductCode"), row.get("sourceColorCode"), row.get("sourceSizeCode")),
    "data/master/warehouses.jsonl": lambda row: (row.get("sourceCode"),),
    "data/history/sales_documents.jsonl": lambda row: (row.get("sourceDocumentNumber"),),
    "data/history/transfer_documents.jsonl": lambda row: (row.get("sourceNumber"),),
}


def rows_by_source(path: Path, identity) -> tuple[dict, list]:
    result = {}
    duplicate = []
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            key = identity(row)
            if key in result:
                duplicate.append(key)
            else:
                result[key] = row
    return result, duplicate


def compare(old_root: Path, new_root: Path) -> dict:
    old_manifest = json.loads((old_root / "IMPORT_MANIFEST.json").read_text())
    new_manifest = json.loads((new_root / "IMPORT_MANIFEST.json").read_text())
    old = {x["path"]: x for x in old_manifest["datasets"]}
    new = {x["path"]: x for x in new_manifest["datasets"]}
    files = {}
    identity_drift = []
    duplicate_keys = []
    for rel in sorted(old.keys() | new.keys()):
        a, b = old.get(rel), new.get(rel)
        if a is None or b is None:
            files[rel] = {"oldCount": a["recordCount"] if a else None, "newCount": b["recordCount"] if b else None, "status": "DIAGNOSTIC_ONLY" if rel.startswith("diagnostics/") else "STRUCTURE_CHANGED"}
            continue
        changed = a["sha256"] != b["sha256"]
        entry = {"oldCount": a["recordCount"], "newCount": b["recordCount"], "delta": b["recordCount"] - a["recordCount"], "changed": changed}
        if changed and rel in IDENTITY_FILES:
            before, old_duplicates = rows_by_source(old_root / rel, IDENTITY_FILES[rel])
            after, new_duplicates = rows_by_source(new_root / rel, IDENTITY_FILES[rel])
            overlap = before.keys() & after.keys()
            drift = [{"source": key, "oldId": before[key].get("id"), "newId": after[key].get("id")} for key in overlap if before[key].get("id") != after[key].get("id")]
            entry.update({"sourceAdded": len(after.keys() - before.keys()), "sourceRemoved": len(before.keys() - after.keys()), "sharedChanged": sum(before[key] != after[key] for key in overlap), "duplicateSourceKeysOld": len(old_duplicates), "duplicateSourceKeysNew": len(new_duplicates), "identityDrift": len(drift), "identityDriftSamples": drift[:20]})
            identity_drift.extend({"file": rel, **item} for item in drift)
            if old_duplicates or new_duplicates:
                duplicate_keys.append(rel)
        files[rel] = entry
    changed_files = [rel for rel, item in files.items() if item.get("changed") or item.get("status")]
    structure_changed = [rel for rel, item in files.items() if item.get("status") == "STRUCTURE_CHANGED"]
    result = {"status": "STOP" if identity_drift or structure_changed or duplicate_keys else "REVIEW" if changed_files else "PASS", "oldBatch": old_manifest["batchId"], "newBatch": new_manifest["batchId"], "changedFiles": changed_files, "structureChanged": structure_changed, "duplicateSourceKeys": duplicate_keys, "identityDrift": identity_drift, "files": files, "inventoryOld": old_manifest["inventoryPolicy"]["mixedUnitQuantityControlTotal"], "inventoryNew": new_manifest["inventoryPolicy"]["mixedUnitQuantityControlTotal"]}
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="old", type=Path, required=True)
    parser.add_argument("--to", dest="new", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.old, args.new)
    json_write(args.output, result)
    changed = "\n".join(f"| {rel} | {result['files'][rel].get('oldCount')} | {result['files'][rel].get('newCount')} | {result['files'][rel].get('delta', '—')} |" for rel in result["changedFiles"])
    args.output.with_suffix(".md").write_text(f"# T+ 前后批次差异\n\n结论：**{result['status']}**；{result['oldBatch']} → {result['newBatch']}。来源身份漂移 {len(result['identityDrift'])}，变化数据集 {len(result['changedFiles'])}。库存控制量 {result['inventoryOld']} → {result['inventoryNew']}。`REVIEW` 需要人工解释新旧业务数据差异，不能自动切换。\n\n| 数据集 | 原记录 | 新记录 | 增减 |\n|---|---:|---:|---:|\n{changed or '| 无 | — | — | 0 |'}\n\n逐数据集身份及内容变化见 JSON。\n")
    print(json.dumps({"status": result["status"], "changedFiles": len(result["changedFiles"]), "identityDrift": len(result["identityDrift"])}, ensure_ascii=False))
    if result["status"] == "STOP":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
