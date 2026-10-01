# T+ 前后批次差异

结论：**REVIEW**；TPLUS-20260922-A2 → TPLUS-IMPORT-20261001-A150447。来源身份漂移 0，变化数据集 9。库存控制量 80794 → 80794。`REVIEW` 需要人工解释新旧业务数据差异，不能自动切换。

| 数据集 | 原记录 | 新记录 | 增减 |
|---|---:|---:|---:|
| data/master/categories.jsonl | 49 | 49 | 0 |
| data/master/fund_accounts.jsonl | 80 | 80 | 0 |
| data/master/halls.jsonl | 47 | 47 | 0 |
| data/master/payment_methods_derived.jsonl | 1 | 1 | 0 |
| data/master/products.jsonl | 2941 | 2941 | 0 |
| data/master/size_groups.jsonl | 15 | 15 | 0 |
| data/master/warehouses.jsonl | 51 | 51 | 0 |
| diagnostics/inventory_difference_trace.jsonl | 2291 | None | — |
| diagnostics/movement_output_validation.jsonl | 1 | None | — |

逐数据集身份及内容变化见 JSON。
