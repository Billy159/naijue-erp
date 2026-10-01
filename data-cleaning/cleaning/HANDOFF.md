> 历史隔离诊断资料。2026-10-01已由根 README、data-cleaning/README.md 与现行 IMPORT_CONTINUATION 文档替代正式操作入口；本页的旧路径和零期初假定仅说明当时执行，不适用于当前上线。

# T+ 数据清洗与独立迁移交接 · 2026-09-24

## 状态

**PASS（隔离环境）**。本轮是与前端并行的数据工作，不涉及 8878 切换或上线 Cutover。独立 worktree `/Users/billy/Desktop/Workspace/project-007-tplus-data-cleaning-v1`；分支 `codex/tplus-data-cleaning-v1`。旧开发数据 `business_management.tplus_demo_20260922_a2` 和 `business_management.v2_runtime_stage03c` 回读未变。

## 输入、批次与资产

- 第一次 T+ 原始目录：`/Users/billy/Desktop/Workspace/project-007-业务管理系统/T+数据/`。正式工作簿 74、Sheet 99、字段位置 1,657、非空行 807,728。Raw 仅只读，逐文件 SHA-256 记录于 `runs/TPLUS-CLEAN-20260924-A1/RUN_META.json`。
- Raw Batch `TPLUS-20260922-A2` → Cleaning Batch `TPLUS-CLEAN-20260924-A1` → Import Batch `TPLUS-IMPORT-20260924-A1`。
- 规则集 `TPLUS-CLEANING-RULESET-v1`：`TPLUS_CLEANING_RULES.md`、`TPLUS_CLEANING_MANIFEST.json`、`TPLUS_CLEANING_CHANGELOG.md`；输入指纹 `TPLUS_INPUT_STRUCTURE.json`。
- 输出 `runs/TPLUS-CLEAN-20260924-A1/cleaned/T+数据/`，保留原目录、文件、Sheet、字段及列顺序。实际修改 1 个描述单元格，逐项在 `cleaning_changes.jsonl`；其余文件逐字节相同。人工队列 `TPLUS_MANUAL_REVIEW_QUEUE.csv/.md` 共 23 项：12 项校验列表尾空格、11 条员工记录分属 5 组同名不同编码；均保留原值。
- 清洗前/后全量扫描及差异、独立导入报告、验证报告、冻结批次差异报告均在该 run 目录。

## 导入与业务核验

- 新 Source：`business_management.tplus_clean_20260924_a1`，批次已 COMMITTED。新 Runtime：`business_management.v2_runtime_clean_20260924_a1`，初始化 44,021 张历史单为 APPROVED；baseline 已包含，初始化 posting / movement 为 0。
- 商品 2,941、SKU 14,864、历史尺码 240、历史销售 27,903 / 79,508 行、历史现结 25,416、可靠调拨 13,946 / 254,519 行、库存控制合计 80,794、负库存键 1,231。生成条码 14,170，694 例外保留。131 张历史盘盈盘亏与 25,155 张独立收款继续隔离。
- Cleaned Preflight PASS；unresolved FK 0、重复身份 0。原冻结 A2 vs Cleaned 差异 PASS，业务字段仅 1 处商品描述末尾空白；相关来源 SHA 为追溯变化，商品/SKU/仓库/销售/调拨身份漂移 0。导入、Runtime 初始化、回读和重复运行均 PASS。
- 旧 Source/Runtime 回读控制量全部不变；当前 8878 未切换。新库可供后续人工验证，不应当作正式开发库。

## 下次操作

收到同结构新 T+ 文件夹后，直接按 [`TPLUS_FUTURE_REIMPORT_RUNBOOK.md`](TPLUS_FUTURE_REIMPORT_RUNBOOK.md) 运行 `pnpm tplus:rerun`。默认加载 v1 规则、校验结构指纹、清洗、动态 Preflight、差异审查，再显式 `--execute` 做隔离导入与回读。新增/修改主档若没有已确认分类映射则停止并进人工队列；输入结构变化输出 `INPUT_STRUCTURE_DRIFT.json`。新业务差异需要人工解释，不能自动切换 8878。
