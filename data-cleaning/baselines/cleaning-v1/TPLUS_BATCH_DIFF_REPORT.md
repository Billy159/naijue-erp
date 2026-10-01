# T+ 冻结批次与 Clean 批次差异

结论：**PASS**。原批次 `TPLUS-20260922-A2`，新批次 `TPLUS-IMPORT-20260924-A1`。商品、SKU、仓库、销货、调拨身份漂移：0；未解释字段变化：0。库存控制合计 80794 → 80794。

| 数据集 | 变更记录 | 字段路径 |
|---|---:|---|
| data/master/products.jsonl | 2,941 | lineage.sourceSha256: 2941, description: 1, source.存货描述: 1 |
| data/master/size_groups.jsonl | 15 | lineage.sourceSha256: 15, supportingLineage[].sourceSha256: 2941 |

明细见同名 JSON。
