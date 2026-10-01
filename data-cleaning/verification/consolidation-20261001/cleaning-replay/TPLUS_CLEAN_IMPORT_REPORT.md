# Clean Source 独立导入报告

结论：**PASS**。批次 `TPLUS-IMPORT-20261001-A1` 已在 `business_management.tplus_clean_20261001_verify` COMMITTED；`business_management.v2_runtime_clean_20261001_verify` 为独立新 Runtime。旧 Source `tplus_demo_20260922_a2` 与旧 Runtime `v2_runtime_stage03c` 的 9 项回读控制量全部未变；当前 8878 未切换。

Preflight 商品 2941、SKU 14864、分类 49、历史商品条码 2943、销售 27903/79508 行、现结 25416、采购 2172、可靠调拨 13946/254519 行；库存 80794.0000，负库存键 1231；unresolved FK 0，重复身份 0。

Runtime 历史单 44021，全部 APPROVED / baseline 已包含 / 当前效果有效；revision 44021，posting 0，movement 0。生成条码 14170，例外 694；重复初始化新增历史单 0、条码 0。导入与运行库回读明细见 `import/POST_IMPORT_CONTROL_TOTALS.md`、`runtime/RUNTIME_INIT.json` 和 `TPLUS_CLEAN_VERIFY_REPORT.json`。

与上一批次差异：REVIEW；身份漂移 0，未解释字段变化 0，库存控制量 80794 → 80794。这是隔离验证环境，不触发正式环境切换。
