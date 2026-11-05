# 来源发生项与标准目标对账 V1

这是离线预检证据，不是导入、生产操作或 PostgreSQL 验收许可。现有标准包文件格式不变。旧 reconciliation.json 的 source_rows/retained_rows 数字仍按标准文件行数验证，不应当冒充清洗前原始发生项数量。新的外置原始台账把这两个口径明确拆开，并在普通/流式标准表预检全部通过后核对实际行。

## 独立输入

将 `SOURCE_OCCURRENCE_LEDGER_V1` JSON 保存在包目录外。调用 `readSourceOccurrenceEvidence({bytes,trustedSha256})`；该 SHA 必须由独立原始资料核对提供，不能从包自报字段代替信任。返回对象是进程内受信能力，JSON 克隆不生效。普通 `validateUnifiedPackage` 和 `streamPreflight` 的选项名均为 `sourceOccurrenceEvidence`。

台账顶层严格包含：

- format_version: `SOURCE_OCCURRENCE_LEDGER_V1`
- source_namespace: 与标准包一致。
- manifest_value_sha256: `requestHash(manifest)`，即项目规范值哈希，不是 manifest 文件字节哈希。它涵盖所有标准文件 pins；原文件字节 SHA 仍由普通/流式预检核对。
- source_occurrences: 原始资料独立普查出的每个发生项。
- mappings: 每个原始发生项恰好一个来源→目标映射。

source_occurrences 每项严格为 `{entity_type,source_key,source_parent_key,source_refs,original_values}`。永久来源身份是三元组 entity_type / source_parent_key / source_key。普通行 parent 为 null；零额旁车 parent 为所属 sales_header 永久来源键，entity_type 为 SALES_SETTLEMENT。original_values 保存原始字符串或明确 null，不能为凑数补零、重算金额或丢弃相同内容的不同发生项。

mappings 每项严格为 `{entity_type,source_key,source_parent_key,target_record_sha256,target}`。target 严格为 `{table,source_key,archive_source_key}`：

- 普通标准行 archive_source_key 为 null，table 为对应标准表。
- 零额旁车 table 为 sales_header，source_key 为所属原单，archive_source_key 为旁车永久来源键。
- target_record_sha256 必须为 `requestHash(实际完整 StandardRecord)`，包含全部旁车。零额旁车也绑定整个所属 sales_header，而非只绑定零值。该校验可发现调用者换了实际行却沿用原 manifest 的情况。

台账不能从目标包重新枚举后称作原始资料完整性证明。缺失原始资料的独立普查，仍不能证明未漏源行。它保留每个声明发生项的原值及来源定位，强制映射全覆盖且不得重复；但原值转换和标量守恒仍须相应金额/数量检查。

## 多对一与计数

原始发生项可以多对一映射到主数据或库存汇总目标。有 id 的目标必须与现有 registry 的 canonical_source_key/aliases 一致；每项 source_refs 必须被目标行保留，不能把哈希或行号当身份。目标行不重复输出、不因来源个数重复导入。

销售/调拨单头、明细、非零结算及零额旁车不得通过该对账器折叠。结算永久来源键必须保持原样，不能借别名重发身份。

报告明确分别列：original_source_occurrences、standard_target_rows、many_to_one_targets，以及每个原始发生项和实际目标行哈希。每个表的 original_source_occurrences 之和等于全局原始数。sales_settlement 表原始数包含零额旁车，但标准目标行数和 funds_action_count 仅为实际非零资金动作。例如合成测试为 38 个原始结算发生项 = 16 个资金动作 + 22 个零额旁车；这不证明真实资料就是该数量，也不推断结清。

22 和 199 仅为测试覆盖用户报告数量，生产逻辑无固定数量常量。实际报告按传入资料统计。

## 历史厅和显式零库存

历史厅报告保留实际 selected_hall_id、证据 original_hall_id 和完整 historical_hall_evidence，分别计 ORIGINAL、MIGRATION_DERIVED、PENDING_REVIEW、差异、待核及未分类数量。仓库/人员当前厅单列比较，不能覆盖有证据的原厅。解析分类本身不构成来源授权；普通/流式主合同还须核准独立厅证据。

批准的“原库存缺行视为零”不冒充原 Excel 行：

- 逐键验证原库存文件 SHA、cutoff、仓库/SKU、审批文件 SHA 和批准记录。
- 单列 approved_explicit_zeros，locator_role 固定为 APPROVAL_JSONL_LINE_NOT_INVENTORY_SOURCE_ROW。
- approval_jsonl_line 只表示审批 JSONL 行，绝不是原库存表格行。
- 这些目标不得再挂原始发生项映射；显式已列的原库存零行仍按普通来源发生项计数。
- 提供的批准集合必须完整覆盖，缺批准、篡改、克隆能力、重复或遗漏全部失败。

## CLI 和结果

```
node tools/unified-import/cli.mjs stream-preflight \
  --package /path/to/standard-package \
  --report /path/to/new-report-directory \
  --manifest-sha256 ACTUAL_MANIFEST_BYTES_SHA256 \
  --source-occurrence-evidence /outside/package/original-occurrences.json \
  --source-occurrence-evidence-sha256 INDEPENDENT_LEDGER_BYTES_SHA256
```

若包含批准显式零库存、金额差异或厅推定，仍需各自独立证据选项。原始发生项台账不能取代这些能力。此两参数只接离线 preflight，不用于绕过执行准入。

流式完整报告写入新报告目录的 source-occurrence-reconciliation.json，摘要只给计数、state、证据 SHA 和报告 SHA，不把原始字段打印到 stdout。原始值和详细来源定位只保留在私有报告文件。普通入口返回相同结构。

状态 DECLARED_SOURCE_OCCURRENCES_MATCH_PACKAGE 的含义仅为：受信台账声明的每项来源与本次标准包目标匹配。source_truth_verified=false，business_database_writes=false。输入上限 64 MiB、250000 个发生项和映射、250000 个标准目标；超限失败，不作不完整通过。

## 验证范围

```
node --test tests/unified-source-occurrence-reconciliation.test.mjs
node_modules/.bin/tsc --noEmit -p evidence/source-occurrence-reconciliation-20261105/tsconfig.json
```

原始日志及退出码在 evidence/source-occurrence-reconciliation-20261105。初次 19 个测试直接通过，不声称先红后绿；后续记录包含并行厅接线的流式 null 回归和修复后的重跑。全量类型检查与聚合测试结果另列，聚焦通过不冒充全量通过。未使用真实资料、未连接或安装 PostgreSQL、未修改结算身份、未执行或重试受阻安全审查。
