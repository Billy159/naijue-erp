# 逐记录、逐字段精确对账（纯离线，未接写入）

`validateScalarReconciliation(input)` 只对**外部独立声明的 cohort**验证两侧精确一致，不读取或写入数据库、不提取源全集、不分配 UUID、不制造映射或迁移授权。没有汇总抵消、跨单位求和、折扣/赠品重算或库存 active/effect 推断。

## 输入与键

精确普通自有可枚举 data 对象：`{sourceNamespace,targetNamespace,cohort,rules,sourceRows,targetRows}`。

- 两 namespace 是本次明确范围标签，不是身份凭证；调用内固定，调用间不复用索引。
- cohort 每项 `{sourceKind,sourceId,metric}` 必须由上游独立、完整地枚举。不能从现有 rows 反推再声称完整。此函数无法判断调用者是否遵守，返回值仅说明给定集合一致。
- rules 按 `(sourceKind,metric)` 唯一。共同字段为 `sourceKind,metric,kind,sourceUnit,targetUnit,evidenceSha256,nullPolicy,signPolicy`。
  - `kind='QUANTITY'` 另需 `numerator,denominator` 正整数文本；显式单位转换，不设默认比例。
  - `kind='MONEY'` 另需 `sourceCurrency,targetCurrency,precision='18',scale='2'`；源目标单位、币种必须精确相同，禁止 FX 或金额单位换算。
- 双方 rows 同形：`{sourceKind,sourceId,metric,value,unit,currency}`，完整 JSON tuple 键必须各自恰好覆盖 cohort 一次。targetRows 的 sourceId 仍是本次来源对账键，不是本层分配的目标 ID；实际目标行与它的绑定须由上游已验证 crosswalk/提取合同另证。
- QUANTITY 的 currency 必须为 null；MONEY 双方必须分别与规则币种匹配。source/target unit 同样分别精确匹配规则。规则缺失、重复或未使用均拒绝。

同一 `(sourceKind,metric)` 仅接受一条规则。若同字段有不同来源单位，本层会拒绝；上游只能按明确、有证据的规则分组并另证分组前后完整集合守恒，不得篡改 sourceKind 以绕过身份域，也不能把 8 种 source_unit 聚合计数当作已知单位换算含义。

sourceId 不 trim、不转大小写、不 Unicode 归一、不按姓名合并、不 cast UUID。JSON tuple 编码避免分隔符碰撞。

## 数值与输出

仅委托原 `normalizeQuantity` / `normalizeMoney`。源数值文本按显式规则无损规范化；目标再以其目标单位的恒等转换检验**原生 canonical 文本**，之后逐键严格相等。目标数量 `1.0`、金额 `1.2`、负零 `-0` 均拒绝；目标应分别为 `1`、`1.20`、`0`。源 `-0.0000` 可规范化为目标零，输入本身不改。NULL 仅明确 `PRESERVE_NULL` 保留；NULL、零、缺字段不同。负数是否合法由显式 signPolicy 决定，不能替代具体业务列的 CHECK。

非空成功返回冻结 `{status:'CONSISTENT_GIVEN_DECLARED_COHORT_NOT_AUTHORIZED',counts:{cohort,rules,sourceRows,targetRows,matchedFields}}`。四个数组都空时单独返回 `EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS`；不证明真实空库，也不把未知变成零。错误为固定 TypeError/code，不含私域键或值；输出仅计数，不含 namespace/行内容。

每数组最多 100000 项，所有输入字符串值（重复也计）UTF-8 总预算 32 MiB；namespace 1024 字节、sourceId 4096 字节、kind/metric/规则与单位等文本 128 字节、数值 256 字节。预算是拒绝阈值，不是总堆内存承诺；调用者已持有的输入、索引和临时 descriptor 另占空间。拒绝 Proxy、accessor、稀疏数组、symbol、额外或缺失字段，不调用它们的 getter/trap。

## 证据与边界

本模块复用当前精确标量合同及 identity-crosswalk 的独立需求/完整键集合原则，不调用 crosswalk 分配或推断映射，不扩展旧 reader/CLI/writer。`evidenceSha256` 仅检查来源数据格式，不验证批准真实性。实际 source 字段含义、完整提取、同快照、目标记录绑定、身份/角色、库存效应、真实 schema、跨批次唯一性、写入准入和迁移授权仍须分别证明。

测试只用合成数据。18 项新增用例 + 31 项既有 exact-scalars/crosswalk 用例共 49 PASS；新测试 focused strict TypeScript 检查通过。根完整 gate、真实数据库、转换全链及上线验收未运行。本次初始 RED 为模块缺失，不声称修复已有生产故障。
