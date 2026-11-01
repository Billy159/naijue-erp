# 一次性原生清洗准备组件（离线，未接数据库写入）

本目录不是已执行的转换任务，也不是长期旧结构兼容层。当前组件按明确来源合同分层复用：

| 组件 | 可验证的窄范围 | 不授予的能力 |
| --- | --- | --- |
| `exact-scalars.mjs` | 显式规则下精确数量/金额编码 | 不猜单位、币种、精度或字段含义 |
| `effective-source-rules.mjs` | 已知旧规则的成员与有效值选择 | 不判定最终可售商品或完整业务 schema |
| `current-revision.mjs` | 给定 header 精确 current_revision 指针 | 不把历史展示升级为可编辑/审核来源 |
| `identity-crosswalk.mjs` | 独立需求与明确 UUID 映射、引用闭包 | 不分配身份、不合并别名、不证明目标已存在 |
| `record-reconciliation.mjs` | 独立 cohort 中逐记录逐字段精确一致 | 不以总量抵消，不证明源提取或 oracle 独立性 |
| `typed-stock-cell-candidate.mjs` | 上述合同编排成 opening/net 两分量私域候选 | 不选择 active run、不称当前库存、不调用 BASE_V2 writer |

真实恢复来源的只读 01/02/04/05/06 已有主控回执，03 仍 UNKNOWN；不是共同快照导出，也没有实际清洗/转换/写入。04 支持 typed 两分量的整数/范围设计，但不能从 8 个 source_unit 文本推断单位比例或库存效应。完整私域映射、同快照来源、明确业务规则、目标最终 schema、原生写入接缝及准入仍需另证。见各组件中文合同及 provenance 文件；不会把 DB 导出伪装为原 BASE_V2 CSV 授权。

## 精确标量接口

基线 e6a03c9fda216a45fb4f904568a28f797c9e94dd。以下两个标量纯函数不连接DB、不取真实记录、不写入、不授权迁移。外部规则SHA仅来源数据格式，不验证审批真实性。调用者仍须证明实际来源字段、单位、币种、映射、完整性与目标列符号/NULL规则；没有默认单位/比例/币种/NULL/符号策略。

- `normalizeQuantity(input)`：见同名d.mts；必须传 sourceUnit/targetUnit 和完全匹配 rule 单位、正整数 numerator/denominator 字符串、64位小写证据SHA；BigInt有理数计算，非整数拒绝，结果必须在PG signed bigint两端内。
- `normalizeMoney(input)`：仅完全相同币种和金额单位；precision='18'/scale='2' 必填；额外尾零可去除，非零额外精度拒绝，绝对minor不超过999999999999999999。不换汇、不金额单位转换、不重算折扣/赠退。
- 两者仅收普通对象的完整、精确、可枚举自有data字段；拒绝accessor、Proxy、数组/稀疏数组、额外/缺失/symbol字段。值仅string或明确NULL。十进制最长256字符，比例最长128字符，单位/币种最长128字符；拒绝指数/number/NaN/Infinity/前后空白/非规范前导零。输入保持不变，冻结结果 `{sourceText,targetText}` 保留原负零文本，目标零规范化。
- NULL仅 `PRESERVE_NULL` 保留（仍先验证全合同）；`REJECT_NULL`拒绝。SIGNED / NONNEGATIVE / POSITIVE均须显式。源小数字符串可覆盖bigint边界，**不声称已验证其来自旧numeric(18,4)**；旧字段type/precision由提取前的独立schema/来源合同负责。

源码依据：packages/domain/src/values.ts 中quantity范围/规范整数、decimalToMinor拒绝非零额外精度理念；sales-money.ts的折扣/分摊是不同业务操作，本模块不调用。adapters/postgres/migrations/0001_runtime_sales.sql:65,90–105,114,157 定义decimal(18,2)/bigint与逐列非负约束。该helper接受显式策略，不能替目标列选择SIGNED。后续patch及真实目标仍需独立核验。

测试：exact Node24.21原生TS，`node --test tests/native-cleaning-exact-scalars.test.ts`；不需要npm安装。聚合根tests/*.test.ts可收集。仅数学与恶意输入纯测，不是全转换/PG/全根gate PASS。
