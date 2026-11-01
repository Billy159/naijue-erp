# 一次性清洗：给定批次的显式身份映射闭包（未接数据库）

`validateIdentityCrosswalk` 只核验**外部明确给定**的需求、映射、引用是否一致。它不分配 UUID、不从姓名/代码相似度/显示映射猜身份、不生成需求、不读取或写入数据库、不判断员工角色、登录凭据、库存效应或迁移授权；也不是长期旧结构兼容层。

## 合同

输入必须是完整字段的普通自有 data 对象：

- `sourceNamespace` / `targetNamespace`：调用者明确标识这次来源与目标范围，不是数据库连接配置或授权。
- `demands`：独立从本次已核来源枚举的 `{ sourceKind, sourceId, targetKind }` 需求集合。**禁止从 mappings 自己反推 demands 然后宣称源全集完整**。本函数不能证明提取全集、真实来源或快照一致。
- `mappings`：上述同一 slot 加已明确给定的 `targetId`，必须一对一覆盖需求；缺失、额外、重复、同目标实体内多源映射同 UUID 均拒绝。
- `references`：`{ referenceId, sourceKind, sourceId, targetKind }`；`referenceId` 是调用方明确提供的唯一引用槽标识。多条独立引用可指同一映射，不因 SKU 相同合并业务行；重复引用槽或悬空引用拒绝。

正向键为 `(sourceNamespace, sourceKind, sourceId, targetKind)`；反向唯一键为 `(targetNamespace, targetKind, targetId)`。原 party 如确有两种角色，必须独立明确 CUSTOMER/SUPPLIER 两个需求与映射；本函数既不推断角色，也不把同名双方合并。不同 targetKind 的 UUID 空间独立。

来源 ID 是精确文本：不 trim、大小写转换、Unicode 正规化、UUID cast 或拆分分隔符。目标 UUID 必须已经是 canonical 小写文本，不自动修正。本层允许外部明确给出的 sourceId == targetId，仅代表一致性；如果后续选择现有 native preparer，其 `nativeId != sourceKey` 等专用约束仍必须执行，不能拿本层结果绕过。

仅允许 16 种单列 UUID 目标：CATEGORY（表 product_category）、COLOR、FIT、SIZE、SIZE_GROUP、SEASON、PRODUCT、SKU、CUSTOMER、SUPPLIER、HALL、WAREHOUSE、STAFF、USER_ACCOUNT、PAYMENT_METHOD、PAYMENT_ACCOUNT。依据 `0001_runtime_sales.sql:13–79` 的 `id uuid PRIMARY KEY`，后继完整 schema/实库仍需另核。SIZE_GROUP_MEMBER、PAYMENT_ACCOUNT_HALL、库存复合键、历史/业务单据及未知目标不在本模块范围；不能给复合记录发明一个 UUID。这里接受 USER_ACCOUNT 的身份标签不代表已验证凭据、员工关联、角色、启用状态或私域登录转换。

## 输出与拒绝

输出冻结的需求/映射指针、引用解析指针及精确 ID，保持需求和引用输入顺序；不共享可变输入。状态固定为 `CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED`。空的明确集合可一致，但不证明真实数据库为空。所谓引用闭包仅对给定候选映射成立，不证明目标记录已存在、真实外键合法、唯一代码无冲突或跨字段业务关系正确。

每数组最多 100000 条；本次调用所有 namespace、需求、映射、引用文本合计最多 32 MiB UTF-8 元数据（重复出现也计入）；sourceId/referenceId 最多 4096 UTF-8 字节，sourceKind/targetKind 128 字节，namespace 1024 字节；均非空且不能包含 NUL。超限只拒绝，不截断或静默分页。拒绝 Proxy、accessor、稀疏数组、额外/缺失/symbol 字段；错误码不嵌入来源 ID 或业务明细。总字节预算不是进程内存实测承诺；原始输入由调用方持有，输出及索引另有开销。namespace 在每次调用内固定，内部索引不重复复制这一常量。调用方仍需控制批次总内存并保留真实来源分批/全局唯一性证明，不能将每块一致误报全局一致。

## 与已有组件的关系

- `prepare-native-bindings.mjs:createNativeIdentityRegistry` 会分配 UUID，不含本次完整 namespace/targetKind 需求集合，故不直接复用为“不分配”的本层。
- `native-catalogue-import.ts`、`native-payment-import.ts` 等后续专用校验仍保留精确 source/native snapshot、字段/角色/关系合同。
- `native-sku-import.ts` 对经审 SKU alias 的多对一有专用代表来源与完整映射证明；本层保守拒绝多对一，不改它，也不能替代它。
- 旧 deferred conversion 的全列提取、旧迁移链、timestamp cutoff、reader/CLI/writer 未恢复。现有 `exact-scalars`、有效源值选择、current_revision 精确指针继续各司其职。

真实六卡结果、完整 crosswalk、目标最终 schema、来源身份、审核/库存/登录及迁移写入均尚未由本模块验证。本层不对真实数据作 PASS 或可上线判断。
