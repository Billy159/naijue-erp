# Typed 库存两分量离线审阅候选（不是当前库存）

`prepareTypedStockCellReviewCandidate(input)` 编排现有四个真实合同：`normalizeQuantity`、`validateIdentityCrosswalk`、`validateScalarReconciliation`、domain `quantity/addQuantity`。没有 reader、DB、CLI、writer、UUID 分配或 BASE_V2 准入能力。

## 精确输入

普通、自有、可枚举 data 对象，所有字段必填：

```
{ sourceNamespace, targetNamespace, cohort, rules,
  sourceRows, expectedComponents, mappings }
```

- `cohort` 每项 `{runId,warehouseSourceId,skuSourceId}`：上游**独立完整枚举**本次来源 cell。完整 JSON tuple 是 cell 键，绝不拼接分隔符、trim、改大小写或 Unicode 归一。不同 run 独立保留；本函数不会挑 active run。
- `sourceRows` 同一三键加 `{sourceUnit,opening,net}`。所有值精确文本，不允许 NULL、number 或缺值。opening/net 必须符合已证来源 `NOT NULL numeric(18,4)` 的整数子域：十进制整数或至多四位零小数，绝对值≤99999999999999；禁止用更宽 bigint 范围代替源类型约束。源 `-0.0000` 保持原文。
- `rules` 每项 `{sourceUnit,targetUnit,numerator,denominator,evidenceSha256}`，按 sourceUnit 唯一；比例正整数字符串、证据64位小写hash、无默认比例/单位。未用、重复或缺规则拒绝。sourceUnit 是原文本记录，不假设真实8种文本是业务单位；没有经审的对应关系不能填规则。字段值不修正，不改 sourceKind 以选择规则。标量使用 REJECT_NULL/SIGNED：源允许负库存，后续具体业务约束仍独立。
- `expectedComponents` 每项三键加 `{metric,value,unit}`，metric 仅 `OPENING` 或 `NET`，每 cell 两项各恰一次。value 必须是**调用方独立给定**的目标 canonical 整数字符串，不允许NULL或`10.0`。本函数从不生成 oracle；也无法认证调用者的 oracle 真正独立、真实或来自正确快照。
- `mappings` 直接使用 crosswalk 字段 `{sourceKind,sourceId,targetKind,targetId}`；仅 `sourceKind==targetKind=='WAREHOUSE'|'SKU'`，需求由独立 cohort 引用的完整身份集合派生。目标UUID须已明确给定，不分配、不猜姓名、不允许别名多对一、重复、缺失或未使用映射。它不证明目标实体已经存在。

每数组≤100000；cohort/sourceRows/rules进一步≤50000，保证内部两metric及最多两身份不超原组件上限。每cell完整JSON tuple≤4096 UTF-8字节；各ID≤4096、namespace≤1024，单位/规则文本≤128、数值≤256字节。全部输入文本（重复也计）合计≤32 MiB。**这只是输入预算，不是进程内存上限**；调用方输入、内部索引/分组、原合同防御复制和私域输出另占内存。超限拒绝，不私自分页、抽样、截断。原委托模块的更严格预算同样保留，可能提前拒绝。

## 编排与候选

先核全局独立 cohort、源 cell 和独立两metric oracle 完整闭包；复用原 identity crosswalk；逐分量核源类型，再按显式比例精确转为目标 signed bigint。按原 sourceUnit 分组调用 U10：sourceKind 恒定为 `TYPED_STOCK_CELL`，sourceId 是完整三键JSON，metric为两分量。组间不混单位，且全局核总 components==2×cells；分组不是篡改 sourceKind 或假定每组都独立完整提取。

每cell仅用原 domain `addQuantity` 对这两个已规范化分量相加，仍检查目标 bigint。**跨cell、跨run不相加**，同run映射键冲突拒绝。负值及明确零cell都保留，不模仿原非零baseline过滤。

返回深度必要层冻结的私域对象：

```
{ status, sourceNamespace, targetNamespace,
  cells: [{runId,warehouseSourceId,skuSourceId,warehouseId,skuId,
           sourceUnit,targetUnit,
           opening:{sourceText,targetText},net:{sourceText,targetText},
           componentSum}],
  counts:{cells,components,unitRules,identities} }
```

status 为 `TYPED_COMPONENT_REVIEW_CANDIDATE_NOT_CURRENT_STOCK_NOT_AUTHORIZED`；全空集合为 `EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS`，不证明真实空库。全部 cells 内容属于私域，不可发布至公共日志/GitHub；错误仅固定码，不包含行值/ID。此函数不记录任何日志。

## 明确不能声称什么

真实04报告只证明被查恢复来源的143311 cells两typed分量有限整数/范围与source_unit非NULL，不是共同快照导出，也不证明8个文本的业务单位语义。其余各卡并非同一RR事务。当前03仍UNKNOWN；本模块不消费JSON body或假设其通过。

componentSum 只是 opening/net 的同cell算术，不叫 current/available：实际安装view、启用run/activation、current-stock优先规则、其他已承认movement/legs、一次计入及切换口径都尚需外证。不能把全部历史APPROVED再加一次。无真实映射则不能制造143311条目标候选。

原 `native-stock-contributor-import.ts` 要求 BASE_V2/原CSV选择/逐来源lineage/完整有效非零key 等合同，此模块**不调用、不改、不伪造**。DB导出候选不是原CSV授权，不能交给原writer冒充已准入。源全集、同快照、私域oracle/映射真实性、目标存在性、最终schema、库存语义及写入授权必须在后续独立证明。

## 本节点测试

独立精确95cba4e snapshot，主树未写。初始缺模块RED后实现；一处新模块相对import路径错误已修正并保留失败日志。新增18项纯合成测试，与既有49项合计67 PASS；focused严格TS另验。未运行PG、真实reader、SQL、writer或生产。没有实际数据库或性能收益结论。
