# T+ 清洗执行报告

结论：**PASS**。Raw `/Users/billy/Desktop/Workspace/project-007/奈爵服饰-8877-Demo/inputs/tplus-frozen-v1` → Cleaned `/Users/billy/Desktop/Workspace/project-007/奈爵服饰-8877-Demo/.runtime/replay/current/cleaned/T+数据`。上一对照批次 `TPLUS-20260922-A2`；清洗批次 `TPLUS-CLEAN-20261001-A1`；规则集 `TPLUS-CLEANING-RULESET-v1`；导入批次 `TPLUS-IMPORT-20261001-A1`。

## 全量扫描与修改

74 个正式 Excel、99 个 Sheet、807,728 非空行。候选问题 7 类，规则 13 条：AUTO_SAFE 1、AUTO_WITH_ASSERTION 1、MANUAL_REVIEW 2、QUARANTINE_ONLY 3、NEVER_TOUCH 6。

| 候选类型 | 清洗前单元格 | 清洗后单元格 |
|---|---:|---:|
| date_text_candidate | 791 | 791 |
| embedded_linebreak_or_tab | 178 | 178 |
| empty_string | 1,891,313 | 1,891,313 |
| fullwidth_character | 102,802 | 102,802 |
| nbsp | 52 | 52 |
| numeric_text_candidate | 2,684,479 | 2,684,479 |
| outer_whitespace | 13 | 12 |

实际修改 1 个单元格；逐项 lineage 在 `cleaning_changes.jsonl`。其余候选保留原值。人工队列 23 项；未经裁决不自动修订。分类映射断言 PASS。Raw 逐文件 SHA-256 在本次清洗前后相同；Cleaned 未修改文件逐字节一致，修改工作簿仅目标单元格变化。

## 业务边界

商品、SKU、历史尺码、负库存、盘盈盘亏隔离单、独立收款及条码例外均保留来源身份。库存按零期初和可信历史事件重建，快照只作诊断。详见 `CLEANING_DIFF_REPORT.md` 与 `TPLUS_BATCH_DIFF_REPORT.md`。
