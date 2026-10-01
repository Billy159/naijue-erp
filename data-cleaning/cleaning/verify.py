"""Read back independent Source/Runtime and compare preflight and frozen controls."""
from __future__ import annotations

import argparse
from decimal import Decimal
import json
from pathlib import Path
import re
import subprocess
import os

from clean import json_write


def query(sql: str) -> dict:
    output = subprocess.check_output([
        os.environ.get('PSQL_BIN','psql'), '-h', os.environ.get('POSTGRES_HOST','127.0.0.1'), '-p', os.environ.get('POSTGRES_PORT','5432'), '-U', os.environ.get('POSTGRES_USER',os.environ.get('USER','')), '-d', os.environ.get('POSTGRES_DB','business_management'),
        "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], text=True)
    return json.loads(output.strip().splitlines()[-1])


def old_state() -> dict:
    return query("""SELECT json_build_object(
      'sourceProducts',(SELECT count(*) FROM tplus_demo_20260922_a2.product),
      'sourceSkus',(SELECT count(*) FROM tplus_demo_20260922_a2.variant),
      'sourceDocuments',(SELECT count(*) FROM tplus_demo_20260922_a2.tplus_history_document),
      'sourceStockTotal',(SELECT sum(quantity)::text FROM tplus_demo_20260922_a2.inventory_balance),
      'sourceBatchStatus',(SELECT status FROM tplus_demo_20260922_a2.tplus_import_run WHERE batch_id='TPLUS-20260922-A2'),
      'runtimeDocuments',(SELECT count(*) FROM v2_runtime_stage03c.document),
      'runtimeRevisions',(SELECT count(*) FROM v2_runtime_stage03c.revision),
      'runtimePostings',(SELECT count(*) FROM v2_runtime_stage03c.posting),
      'runtimeGeneratedBarcodes',(SELECT count(*) FROM v2_runtime_stage03c.generated_barcode),
      'newSourceExists',(SELECT exists (SELECT 1 FROM pg_namespace WHERE nspname='tplus_clean_20260924_a1')),
      'newRuntimeExists',(SELECT exists (SELECT 1 FROM pg_namespace WHERE nspname='v2_runtime_clean_20260924_a1'))
    )::text""")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--batch", required=True)
    args = parser.parse_args()
    run = args.run.resolve()
    if not re.fullmatch(r"tplus_clean_[a-z0-9_]+", args.source) or not re.fullmatch(r"v2_runtime_clean_[a-z0-9_]+", args.runtime) or not re.fullmatch(r"TPLUS-IMPORT-[0-9]{8}-[A-Z][0-9]+", args.batch):
        raise ValueError("CLEAN_VERIFY_ISOLATION_REQUIRED")
    preflight = json.loads((run / "PREFLIGHT_SUMMARY.json").read_text())
    manifest = json.loads((Path(preflight["preflight"]) / "IMPORT_MANIFEST.json").read_text())
    baseline = json.loads((run / "OLD_DB_BASELINE.json").read_text())
    source = args.source
    runtime = args.runtime
    current = query(f"""SELECT json_build_object(
      'batchStatus',(SELECT status FROM {source}.tplus_import_run WHERE batch_id='{args.batch}'),
      'products',(SELECT count(*) FROM {source}.product),
      'skus',(SELECT count(*) FROM {source}.variant),
      'categories',(SELECT count(*) FROM {source}.category),
      'productBarcodes',(SELECT count(*) FROM {source}.tplus_product_barcode),
      'salesDocuments',(SELECT count(*) FROM {source}.business_document WHERE type='SALE' AND inventory_mode='HISTORICAL_ARCHIVE'),
      'salesLines',(SELECT count(*) FROM {source}.document_line WHERE direction='HISTORICAL_SALE'),
      'salesFunds',(SELECT count(*) FROM {source}.tplus_sales_fund),
      'purchaseDocuments',(SELECT count(*) FROM {source}.tplus_history_document WHERE document_kind='purchase'),
      'transferDocuments',(SELECT count(*) FROM {source}.tplus_history_document WHERE document_kind='transfer'),
      'transferLines',(SELECT count(*) FROM {source}.tplus_history_line WHERE line_kind='transfer'),
      'inventoryRows',(SELECT count(*) FROM {source}.inventory_balance),
      'inventoryTotal',(SELECT sum(quantity)::text FROM {source}.inventory_balance),
      'negativeInventoryRows',(SELECT count(*) FROM {source}.inventory_balance WHERE quantity<0),
      'sourcePosting',(SELECT count(*) FROM {source}.inventory_posting),
      'sourceMovement',(SELECT count(*) FROM {source}.inventory_movement),
      'runtimeDocuments',(SELECT count(*) FROM {runtime}.document),
      'runtimeApprovedBaseline',(SELECT count(*) FROM {runtime}.document WHERE status='APPROVED' AND baseline_was_included AND current_effect_active),
      'runtimeRevisions',(SELECT count(*) FROM {runtime}.revision),
      'runtimePostings',(SELECT count(*) FROM {runtime}.posting),
      'runtimeMovements',(SELECT count(*) FROM {runtime}.movement),
      'runtimeGeneratedBarcodes',(SELECT count(*) FROM {runtime}.generated_barcode),
      'runtimeIdempotency',(SELECT count(*) FROM {runtime}.idempotency_request),
      'sampleProducts',(SELECT count(*) FROM {source}.product WHERE code IN ('121MS5373276','307YR0802836','次品','739JK5396111','503KZ3369858','963KZ5579172','001CS5131140-绿色','0002','026MS5133001')),
      'sampleSales',(SELECT count(*) FROM {source}.tplus_history_document WHERE document_kind='sale' AND source_number IN ('SA-2026-09-0146','SA-2026-09-0207','SA-2026-09-0203','SA-2026-09-0021','SA-2026-09-0175')),
      'sampleTransfers',(SELECT count(*) FROM {source}.tplus_history_document WHERE document_kind='transfer' AND source_number IN ('ALAL-2026-09-0125','ALAL-2024-10-0448'))
    )::text""")
    inventory_samples = query(f"""WITH old_rows AS (
      SELECT p.code, count(i.*)::integer AS rows, COALESCE(sum(i.quantity),0)::text AS total,
        md5(string_agg(v.id::text||':'||i.warehouse_id::text||':'||i.quantity::text,',' ORDER BY v.id,i.warehouse_id)) AS fingerprint
      FROM tplus_demo_20260922_a2.product p JOIN tplus_demo_20260922_a2.variant v ON v.product_id=p.id
      LEFT JOIN tplus_demo_20260922_a2.inventory_balance i ON i.variant_id=v.id
      WHERE p.code IN ('0002','026MS5133001') GROUP BY p.code
    ), new_rows AS (
      SELECT p.code, count(i.*)::integer AS rows, COALESCE(sum(i.quantity),0)::text AS total,
        md5(string_agg(v.id::text||':'||i.warehouse_id::text||':'||i.quantity::text,',' ORDER BY v.id,i.warehouse_id)) AS fingerprint
      FROM {source}.product p JOIN {source}.variant v ON v.product_id=p.id
      LEFT JOIN {source}.inventory_balance i ON i.variant_id=v.id
      WHERE p.code IN ('0002','026MS5133001') GROUP BY p.code
    ) SELECT COALESCE(json_agg(json_build_object('code',old_rows.code,'oldRows',old_rows.rows,'newRows',new_rows.rows,'oldTotal',old_rows.total,'newTotal',new_rows.total,'oldFingerprint',old_rows.fingerprint,'newFingerprint',new_rows.fingerprint) ORDER BY old_rows.code),'[]'::json)::text
      FROM old_rows JOIN new_rows USING(code)""")
    diff_status = json.loads((run / "TPLUS_BATCH_DIFF_REPORT.json").read_text())["status"]
    expected = {item["path"]: item["recordCount"] for item in manifest["datasets"] if item["canImport"]}
    checks = {
        "batchCommitted": current["batchStatus"] == "COMMITTED",
        "products": current["products"] == expected["data/master/products.jsonl"],
        "skus": current["skus"] == expected["data/master/skus.jsonl"],
        "categories": current["categories"] == expected["data/master/categories.jsonl"],
        "historicalProductBarcodes": current["productBarcodes"] == expected["data/master/product_barcodes.jsonl"],
        "sales": current["salesDocuments"] == expected["data/history/sales_documents.jsonl"],
        "salesLines": current["salesLines"] == expected["data/history/sales_lines.jsonl"],
        "salesFunds": current["salesFunds"] == expected["data/history/sales_funds.jsonl"],
        "purchases": current["purchaseDocuments"] == expected["data/history/purchase_documents.jsonl"],
        "transfers": current["transferDocuments"] == expected["data/history/transfer_documents.jsonl"],
        "transferLines": current["transferLines"] == expected["data/history/transfer_lines.jsonl"],
        "inventoryRows": current["inventoryRows"] == expected["data/inventory/rebuilt_stock.jsonl"],
        "inventoryTotal": Decimal(current["inventoryTotal"]) == Decimal(manifest["inventoryPolicy"]["mixedUnitQuantityControlTotal"]),
        "negativeInventory": current["negativeInventoryRows"] == manifest["inventoryPolicy"]["negativeInventoryRows"],
        "noHistoryReplay": current["sourcePosting"] == current["sourceMovement"] == current["runtimePostings"] == current["runtimeMovements"] == 0,
        "runtimeBaseline": current["runtimeDocuments"] == current["runtimeApprovedBaseline"] == current["runtimeRevisions"] == sum(expected[path] for path in ("data/history/purchase_documents.jsonl", "data/history/sales_documents.jsonl", "data/history/transfer_documents.jsonl")),
        "runtimeNoTestCommands": current["runtimeIdempotency"] == 0,
        "barcodesConserved": current["runtimeGeneratedBarcodes"] <= current["skus"],
        "fixedSamples": current["sampleProducts"] == 9 and current["sampleSales"] == 5 and current["sampleTransfers"] == 2,
        "fixedInventorySamples": len(inventory_samples) == 2 and all(item["newRows"] > 0 and (diff_status != "PASS" or item["oldFingerprint"] == item["newFingerprint"]) for item in inventory_samples),
    }
    old = old_state()
    old_checks = {key: old[key] == baseline[key] for key in baseline if key not in ("newSourceExists", "newRuntimeExists")}
    result = {"status": "PASS" if all(checks.values()) and all(old_checks.values()) else "STOP", "checks": checks, "oldStateUnchanged": old_checks, "new": current, "old": old, "preflight": preflight["batch"], "inventorySamples": inventory_samples}
    json_write(run / "TPLUS_CLEAN_VERIFY_REPORT.json", result)
    sample_text = "；".join(f"{item['code']} 原/新库存 {item['oldTotal']}/{item['newTotal']}（{item['oldRows']}/{item['newRows']} 键）" for item in inventory_samples)
    (run / "TPLUS_CLEAN_VERIFY_REPORT.md").write_text(f"# Clean Source 与 Runtime 验证\n\n结论：**{result['status']}**。Source `{source}` 的批次状态 `{current['batchStatus']}`，商品 {current['products']}、SKU {current['skus']}、历史销售 {current['salesDocuments']}、可靠调拨 {current['transferDocuments']}；库存控制合计 {current['inventoryTotal']}，负库存键 {current['negativeInventoryRows']}。Runtime `{runtime}` 初始化 {current['runtimeDocuments']} 张历史单，全部 APPROVED 且 baseline 已计入；生成条码 {current['runtimeGeneratedBarcodes']}。历史过账 0，旧 Source/Runtime 对照变化项 {sum(not v for v in old_checks.values())}。库存固定样本：{sample_text}。逐项结果见 JSON。\n")
    print(json.dumps({"status": result["status"], "failedChecks": [key for key, passed in checks.items() if not passed], "oldStateDrift": [key for key, passed in old_checks.items() if not passed]}, ensure_ascii=False))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
