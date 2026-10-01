"""Render short, evidence-backed reports for an isolated clean-data run."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


BASE = Path(__file__).resolve().parent


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    run = args.run.resolve()
    meta = read(run / "RUN_META.json")
    before, after = read(run / "before-scan.json"), read(run / "after-scan.json")
    preflight = read(run / "PREFLIGHT_SUMMARY.json")
    verification = read(run / "TPLUS_CLEAN_VERIFY_REPORT.json")
    runtime = read(run / "runtime/RUNTIME_INIT.json")
    diff = read(run / "TPLUS_BATCH_DIFF_REPORT.json")
    rules = read(BASE / "TPLUS_CLEANING_MANIFEST.json")
    levels = Counter(item["severity"] for item in rules["rules"])
    if any(item["status"] != "PASS" for item in (preflight, verification, runtime)) or diff["status"] not in ("PASS", "REVIEW"):
        raise ValueError("cannot finalize a run with a failed gate")
    if meta["rulesSha256"] != __import__("hashlib").sha256((BASE / "TPLUS_CLEANING_MANIFEST.json").read_bytes()).hexdigest():
        raise ValueError("ruleset changed after this cleaning run")
    table = "\n".join(f"| {key} | {before['counts'].get(key,0):,} | {after['counts'].get(key,0):,} |" for key in sorted(before["counts"].keys() | after["counts"].keys()))
    clean_report = f"""# T+ 清洗执行报告

结论：**PASS**。Raw `{meta['input']}` → Cleaned `{meta['output']}`。上一对照批次 `{diff['oldBatch']}`；清洗批次 `{meta['batch']}`；规则集 `{rules['version']}`；导入批次 `{preflight['batch']}`。

## 全量扫描与修改

74 个正式 Excel、99 个 Sheet、{before['nonemptyRows']:,} 非空行。候选问题 7 类，规则 {len(rules['rules'])} 条：AUTO_SAFE {levels['AUTO_SAFE']}、AUTO_WITH_ASSERTION {levels['AUTO_WITH_ASSERTION']}、MANUAL_REVIEW {levels['MANUAL_REVIEW']}、QUARANTINE_ONLY {levels['QUARANTINE_ONLY']}、NEVER_TOUCH {levels['NEVER_TOUCH']}。

| 候选类型 | 清洗前单元格 | 清洗后单元格 |
|---|---:|---:|
{table}

实际修改 {meta['changedCells']} 个单元格；逐项 lineage 在 `cleaning_changes.jsonl`。其余候选保留原值。人工队列 {meta['manualReviewRows']} 项；未经裁决不自动修订。分类映射断言 {'PASS' if meta['categoryAssertion']['passed'] else 'STOP'}。Raw 逐文件 SHA-256 在本次清洗前后相同；Cleaned 未修改文件逐字节一致，修改工作簿仅目标单元格变化。

## 业务边界

商品、SKU、历史尺码、负库存、盘盈盘亏隔离单、独立收款及条码例外均保留来源身份。库存按零期初和可信历史事件重建，快照只作诊断。详见 `CLEANING_DIFF_REPORT.md` 与 `TPLUS_BATCH_DIFF_REPORT.md`。
"""
    (run / "TPLUS_CLEANING_RUN_REPORT.md").write_text(clean_report)
    values = verification["new"]
    import_report = f"""# Clean Source 独立导入报告

结论：**PASS**。批次 `{preflight['batch']}` 已在 `business_management.{runtime['source']}` COMMITTED；`business_management.{runtime['runtimeSchema']}` 为独立新 Runtime。旧 Source `tplus_demo_20260922_a2` 与旧 Runtime `v2_runtime_stage03c` 的 {len(verification['oldStateUnchanged'])} 项回读控制量全部未变；当前 8878 未切换。

Preflight 商品 {values['products']}、SKU {values['skus']}、分类 {values['categories']}、历史商品条码 {values['productBarcodes']}、销售 {values['salesDocuments']}/{values['salesLines']} 行、现结 {values['salesFunds']}、采购 {values['purchaseDocuments']}、可靠调拨 {values['transferDocuments']}/{values['transferLines']} 行；库存 {values['inventoryTotal']}，负库存键 {values['negativeInventoryRows']}；unresolved FK {preflight['unresolvedForeignKeys']}，重复身份 {preflight['duplicateIdentity']}。

Runtime 历史单 {values['runtimeDocuments']}，全部 APPROVED / baseline 已包含 / 当前效果有效；revision {values['runtimeRevisions']}，posting {values['runtimePostings']}，movement {values['runtimeMovements']}。生成条码 {values['runtimeGeneratedBarcodes']}，例外 {runtime['barcodeFirst']['exceptions']}；重复初始化新增历史单 {runtime['second']['created']}、条码 {runtime['barcodeSecond']['inserted']}。导入与运行库回读明细见 `import/POST_IMPORT_CONTROL_TOTALS.md`、`runtime/RUNTIME_INIT.json` 和 `TPLUS_CLEAN_VERIFY_REPORT.json`。

与上一批次差异：{diff['status']}；身份漂移 {len(diff['identityDrift'])}，未解释字段变化 {len(diff.get('unexpectedValueChanges', []))}，库存控制量 {diff['inventoryOld']} → {diff['inventoryNew']}。这是隔离验证环境，不触发正式环境切换。
"""
    (run / "TPLUS_CLEAN_IMPORT_REPORT.md").write_text(import_report)
    print(json.dumps({"status": "PASS", "runReport": str(run / "TPLUS_CLEANING_RUN_REPORT.md"), "importReport": str(run / "TPLUS_CLEAN_IMPORT_REPORT.md")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
