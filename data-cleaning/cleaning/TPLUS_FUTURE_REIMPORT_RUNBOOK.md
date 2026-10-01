> 历史隔离诊断资料。2026-10-01已由根 README、data-cleaning/README.md 与现行 IMPORT_CONTINUATION 文档替代正式操作入口；本页的旧路径和零期初假定仅说明当时执行，不适用于当前上线。

# T+ 同结构新文件夹重复迁移

## 冻结资产与边界

- 原始输入结构：`TPLUS_INPUT_STRUCTURE.json`（74 个正式 XLSX、99 个 Sheet，另有必须保留的非 XLSX 文件）；规则集：`TPLUS_CLEANING_MANIFEST.json` / `TPLUS_CLEANING_RULES.md`，版本 `TPLUS-CLEANING-RULESET-v1`。
- 当前已验证清洗批次：`TPLUS-CLEAN-20260924-A1`；对应导入批次 `TPLUS-IMPORT-20260924-A1`。原始资料永远只读。每个新输入使用新的 run 目录、清洗批次、导入批次、Source schema、Runtime schema。
- 旧开发 Source `tplus_demo_20260922_a2`、Runtime `v2_runtime_stage03c` 与 8878 指向绝不由本命令改动。
- 原③A conversion、③B importer、③C runtime initializer 继续被复用。`run_all.py` 只负责校验顺序、隔离参数和停点。

## 新一批执行

在本 worktree 根目录执行；将尖括号参数换成实际路径或新批次名。`--previous` 指向**上一已接受批次包含 JSONL 数据的完整 preflight 目录**，不能只指向 Git 中的 manifest。A1 的上一批目录在主项目 `migration/preflight/TPLUS-20260922-A2`。

先预备，命令只写新 run 目录，完成结构指纹校验、全量清洗、Preflight 和差异报告：

```sh
pnpm tplus:rerun \
  --input '<新T+数据文件夹>' \
  --run migration/cleaning/runs/TPLUS-CLEAN-YYYYMMDD-A1 \
  --clean-batch TPLUS-CLEAN-YYYYMMDD-A1 \
  --import-batch TPLUS-IMPORT-YYYYMMDD-A1 \
  --source tplus_clean_yyyymmdd_a1 \
  --runtime v2_runtime_clean_yyyymmdd_a1 \
  --previous '<上一已接受批次的完整preflight目录>'
```

检查 `RUN_ALL_RESULT.json` 为 `PREPARED`、`TPLUS_MANUAL_REVIEW_QUEUE.csv`、`CLEANING_DIFF_REPORT.md`、`TPLUS_BATCH_DIFF_REPORT.md` 和 `PREFLIGHT_SUMMARY.json`。新商品若无冻结分类裁决，TPC-013 仍会完成无关安全清洗并生成队列与 `CATEGORY_ASSERTION_STOP.json`，随后在 Preflight 前停止；不得套用旧分类或自动猜测。人工队列中的 12 项校验列表尾空格、5 组同名员工等，未决定时保持原值；若要改变规则，更新为 v1.1/v2，记入 Changelog，再用新清洗批次从 raw 重跑。

对已核对的批次在同一命令后增加 `--resume --execute`，独立导入 Source、初始化 Runtime，并做 DB 回读核验。若未来真实数据发生变化，Diff 为 `REVIEW`；先说明新增、删减和业务值变化，再显式加 `--accept-review`，它只允许隔离导入，**不代表正式环境切换获批**。共享来源的 product/SKU/warehouse/sale/transfer ID 漂移为 `STOP`，不能绕过。

```sh
pnpm tplus:rerun \
  --input '<新T+数据文件夹>' \
  --run migration/cleaning/runs/TPLUS-CLEAN-YYYYMMDD-A1 \
  --clean-batch TPLUS-CLEAN-YYYYMMDD-A1 \
  --import-batch TPLUS-IMPORT-YYYYMMDD-A1 \
  --source tplus_clean_yyyymmdd_a1 \
  --runtime v2_runtime_clean_yyyymmdd_a1 \
  --previous '<上一已接受批次的完整preflight目录>' \
  --resume --execute --accept-review
```

默认动态 Preflight 允许同一已确认主档范围内的交易量变化，控制量从该批自身计算。新字段、类型、文件、Sheet 或列顺序不匹配时输出 `INPUT_STRUCTURE_DRIFT.json` 并停止。不要修改 v1 指纹或偷偷兼容；先核实来源并升级规则和结构版本。新主档、分类、尺码、关系等仍须沿项目正式业务裁决处理。

## 核验与停点

- 结果目录内 `RUN_META.json` 记录 raw/cleaned 全文件 SHA-256，`cleaning_changes.jsonl` 逐单元格记录 before/after/ruleId。重复清洗输出 `ALREADY_CLEAN`，文件不重新写入；规则或 raw 变化触发 STOP。
- Preflight 输出 `PREFLIGHT_SUMMARY.json`、`preflight/<批次>/IMPORT_MANIFEST.json`。库存始终零期初重建；库存快照只诊断；盘盈盘亏、独立收款、条码例外不得伪造或自动并入。
- Import 输出 `import/POST_IMPORT_CONTROL_TOTALS.md`；Runtime 输出 `runtime/RUNTIME_INIT.json`；最终 `TPLUS_CLEAN_VERIFY_REPORT.json/.md`、`TPLUS_CLEAN_IMPORT_REPORT.md`、`TPLUS_CLEANING_RUN_REPORT.md` 和 `RUN_ALL_RESULT.json`。PASS / PASS_REVIEWED 才是隔离验证通过。
- 任一 `STOP` 保留已有输出，查看对应 `01-clean.log` 至 `07-report.log`；只在修复原因后用同一批次 `--resume` 重试。已 COMMITTED 批次要求 manifest SHA 一致，重复导入应为 `ALREADY_COMMITTED`，Runtime 重复初始化新增 0。
- 只有另一次明确授权的 cutover 流程才可改 8878 指向。此 runbook 不执行切换、前端配置修改或旧 schema 写入。

## 规则维护

新规则在 `TPLUS_CLEANING_CHANGELOG.md` 中记录日期、ID、旧/新动作、证据、发现批次与回溯影响，更新 manifest 与人类可读规则书，并用新 batch 重跑结构、清洗、Preflight、Import、Verify、Diff。每个已产生的 run 都保存执行时的 manifest SHA；不能改写其历史依据。
