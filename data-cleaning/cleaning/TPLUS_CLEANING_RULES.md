# T+ 数据清洗规则书

规则集：`TPLUS-CLEANING-RULESET-v1`；输入结构：`TPLUS-STRUCTURE-v1`。

本规则集只自动修复能证明不改变业务含义的来源单元格。原始 T+ 文件保持只读；清洗输出保留目录、文件、Sheet、字段和列顺序。所有自动值变化记录到 `cleaning_changes.jsonl`。当前业务分类、尺码展示、生成条码和库存重建由既有冻结转换与运行逻辑承担，不通过本规则集改写来源身份。

## 分级与执行门槛

- `AUTO_SAFE`：执行后逐单元格核对，并记录 Rule ID 与旧新值。
- `AUTO_WITH_ASSERTION`：执行已确认的投影；断言不满足时进入人工队列并停止该转换。
- `MANUAL_REVIEW`：记录候选，保持原值。
- `QUARANTINE_ONLY`：保持原隔离状态，不制造业务关系。
- `NEVER_TOUCH`：保留原始事实与身份。

## TPC-001 · 商品描述末尾空白清理

- Rule ID：`TPC-001`；版本：`1.0`；级别：`AUTO_SAFE`；风险：`low`。
- 适用文件：`基础档案/存货.xlsx`；Sheet：`存货`；字段：`存货描述`。
- 触发条件：trailing ASCII space, tab or NBSP。
- 清洗动作：`{"operation": "rstrip_chars", "characters": " \t "}`；改变业务值：否。
- before：`原描述\u00a0`；after：`原描述`。
- 断言：before is a nonempty string；after is nonempty；only trailing listed whitespace is removed；source product code is unchanged。
- 来源依据：2026-09-24 raw workbook whole-folder scan: 基础档案/存货.xlsx 存货 AI1639; descriptive suffix only。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-002 · 物流校验列表尾空格待确认

- Rule ID：`TPC-002`；版本：`1.0`；级别：`MANUAL_REVIEW`；风险：`medium`。
- 适用文件：`基础档案/物流公司.xlsx`；Sheet：`枚举档案`；字段：`validation_F`。
- 触发条件：outer whitespace。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`八达通  `；after：`unchanged pending decision`。
- 断言：validation source is not silently rewritten。
- 来源依据：2026-09-24 whole-folder scan: 12 validation-list cells。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-003 · 数字文本编码保留

- Rule ID：`TPC-003`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`high`。
- 适用文件：`**/*.xlsx`；Sheet：`*`；字段：`*`。
- 触发条件：numeric-looking text。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`0002`；after：`0002`。
- 断言：text identifiers, leading zeroes and source codes remain text。
- 来源依据：PROJECT_BRAIN.md source identity and barcode rules; 2026-09-24 whole-folder scan。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-004 · 全角历史文本保留

- Rule ID：`TPC-004`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`medium`。
- 适用文件：`**/*.xlsx`；Sheet：`*`；字段：`*`。
- 触发条件：fullwidth Unicode character。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`（原名）`；after：`（原名）`。
- 断言：no broad NFKC normalization is applied。
- 来源依据：2026-09-24 whole-folder scan; equivalence is not established for all names and codes。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-005 · 空字符串原义保留

- Rule ID：`TPC-005`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`medium`。
- 适用文件：`**/*.xlsx`；Sheet：`*`；字段：`*`。
- 触发条件：Excel empty string。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`empty string`；after：`empty string`。
- 断言：no blanket empty-string to null conversion。
- 来源依据：2026-09-24 whole-folder scan; cell context and converter semantics vary。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-006 · 备注日期和换行保留

- Rule ID：`TPC-006`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`medium`。
- 适用文件：`**/*.xlsx`；Sheet：`*`；字段：`备注|存货描述|主计量`。
- 触发条件：date-looking text or embedded linebreak/tab。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`2026-09-01 in note`；after：`unchanged`。
- 断言：narrative text is not coerced to a date or flattened。
- 来源依据：2026-09-24 scan: 791 date-looking strings are mostly notes; 178 embedded linebreak/tab cells are descriptions or notes。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-007 · 同名员工保留身份并复核

- Rule ID：`TPC-007`；版本：`1.0`；级别：`MANUAL_REVIEW`；风险：`high`。
- 适用文件：`基础档案/员工.xlsx`；Sheet：`员工`；字段：`员工名称`。
- 触发条件：same display name with distinct source codes。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`两名同名员工`；after：`two source identities retained`。
- 断言：distinct employee source codes remain distinct。
- 来源依据：work/TPLUS-AUDIT-20260922/FOUNDATIONS.md: five duplicate-name groups。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-008 · 历史盘盈盘亏隔离

- Rule ID：`TPC-008`；版本：`1.0`；级别：`QUARANTINE_ONLY`；风险：`high`。
- 适用文件：`单据数据/其他入库单.xlsx, 单据数据/其他出库单.xlsx`；Sheet：`其他入库单|其他出库单`；字段：`单据编号`。
- 触发条件：source document not in verified transfer pair。
- 清洗动作：`{"operation": "preserve_existing_quarantine"}`；改变业务值：否。
- before：`ID-2024-08-0003`；after：`unchanged quarantine`。
- 断言：131 source documents remain quarantined；no invented transfer partner。
- 来源依据：PROJECT_BRAIN.md 2026-09-23 correction: 79 gain and 52 loss documents。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-009 · 独立收款隔离

- Rule ID：`TPC-009`；版本：`1.0`；级别：`QUARANTINE_ONLY`；风险：`high`。
- 适用文件：`单据数据/收款单.xlsx`；Sheet：`收款单`；字段：`关联单据`。
- 触发条件：receipt has no reliable sale association。
- 清洗动作：`{"operation": "preserve_existing_quarantine"}`；改变业务值：否。
- before：`independent receipt`；after：`unchanged quarantine`。
- 断言：independent receipt is not converted into a fabricated sale payment。
- 来源依据：PROJECT_BRAIN.md and A2 QUARANTINE.md。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-010 · 条码例外不猜码

- Rule ID：`TPC-010`；版本：`1.0`；级别：`QUARANTINE_ONLY`；风险：`high`。
- 适用文件：`基础档案/存货条形码.xlsx, 基础档案/存货条码方案.xlsx`；Sheet：`*`；字段：`*`。
- 触发条件：barcode generation lacks unique supported result。
- 清洗动作：`{"operation": "preserve_existing_quarantine"}`；改变业务值：否。
- before：`unknown generated SKU barcode`；after：`unchanged exception`。
- 断言：531 collisions and 163 field/length exceptions do not receive invented barcodes。
- 来源依据：PROJECT_BRAIN.md 2026-09-23 barcode decision and barcode-generation-v2.json。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-011 · 负库存与快照诊断边界

- Rule ID：`TPC-011`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`high`。
- 适用文件：`库存状况表.xlsx, 单据数据/*.xlsx`；Sheet：`*`；字段：`数量|库存`。
- 触发条件：negative stock or snapshot discrepancy。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`-1`；after：`-1`。
- 断言：snapshot does not become opening stock；negative quantity is not zeroed, deleted or abs-transformed。
- 来源依据：PROJECT_BRAIN.md inventory reconstruction policy; A2 inventory controls。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-012 · SKU与历史尺码身份不合并

- Rule ID：`TPC-012`；版本：`1.0`；级别：`NEVER_TOUCH`；风险：`high`。
- 适用文件：`基础档案/存货.xlsx, 枚举档案/尺码.xlsx`；Sheet：`存货|尺码|Sheet1`；字段：`*`。
- 触发条件：same display value or A/B variant of distinct source IDs。
- 清洗动作：`{"operation": "none"}`；改变业务值：否。
- before：`A/B variants sharing a display cell`；after：`both source identities retained`。
- 断言：source SKU IDs, 240 historical sizes and five current business groups remain distinct。
- 来源依据：PROJECT_BRAIN.md 2026-09-23 size mapping and source identity decisions。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。

## TPC-013 · 冻结商品分类映射断言

- Rule ID：`TPC-013`；版本：`1.0`；级别：`AUTO_WITH_ASSERTION`；风险：`medium`。
- 适用文件：`基础档案/存货.xlsx`；Sheet：`存货`；字段：`存货编码`。
- 触发条件：preflight projects approved category。
- 清洗动作：`{"operation": "assert_existing_category_projection"}`；改变业务值：否。
- before：`source product and approved mapping`；after：`same raw product with approved preflight category projection`。
- 断言：each source product code has exactly one confirmed category assignment；source code and parent-category permission are unchanged。
- 来源依据：outputs/TPLUS-BUSINESS-DECISIONS-20260922/CONFIRMED_DECISIONS.md and full_mapping_2941.json。
- 首次引入批次：`TPLUS-CLEAN-20260924-A1`；最后修改批次：`TPLUS-CLEAN-20260924-A1`。
