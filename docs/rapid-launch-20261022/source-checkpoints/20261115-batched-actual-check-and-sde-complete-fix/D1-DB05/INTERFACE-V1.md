# 分批导入接口 V1

本页对应主控 BATCH-PROTOCOL-REGISTRATION-v2。源码已包含三个入口和内部命令六参数 overload。完整安装模型、D2叶集成和PG验证仍待完成。

## D3 接线

```sql
SELECT naijue_erp.standard_batched_import_inspect_v1($1::jsonb,$2::jsonb);
SELECT naijue_erp.standard_batched_import_step_v1($1::jsonb,$2::jsonb,$3::integer,$4::text,$5::jsonb,$6::text);
SELECT naijue_erp.standard_batched_import_complete_v1($1::jsonb,$2::jsonb);
```

三个入口前两个参数相同。identity 是原 program.identity 的六个字段加 plan.metadata.rootOperationId，七个字段全部必需且非空，类型均为string。

| identity 字段 | 内容 |
| --- | --- |
| rootOperationId | 原 initialize.operation_id，UUID |
| batchId | 原 baseline batch，UUID |
| documentBatchId | 原 document batch，UUID，与batchId不同 |
| packageSha256 | 原 manifest 的64位小写十六进制摘要 |
| planSha256 | 原执行计划的64位小写十六进制摘要 |
| namespace | 原 source namespace |
| cutoffAt | 原 cutoff 字符串，保持原请求值 |

work_batch 是 D3 原工作组descriptor，包含以下13个必需字段，不接受额外键。

| 字段 | 类型及含义 |
| --- | --- |
| phase | CORE、MASTER、KEYS、BASELINE_CLOSE、DOCUMENT_OPEN、HISTORY、FINALIZE |
| first、last | 非负整数，原步骤序号闭区间，last不超过2147483647 |
| rows、bytes | 非负整数，原组规划量 |
| ordinal | 非负整数，工作组序号，CORE为0 |
| subBatchId | 稳定工作组UUID |
| predecessor | 前组UUID，CORE为JSON null |
| descriptorSha256 | D3原typed canonical摘要，64位小写十六进制 |
| firstOperationId、lastOperationId | 首末原操作UUID |
| previousLastOperationId | 前组末原操作UUID，CORE为JSON null |
| previousDescriptorSha256 | 前组摘要，CORE为JSON null |

descriptorSha256 按现有D3实现计算 `requestHash({identity,descriptor})`，descriptor为省去descriptorSha256自身的descriptor。PG将它按不透明原值绑定，按完整work_batch JSONB相等核对。PG原操作指纹使用自己的phase/jsonb文本算法，在数据库内部核对。两个摘要算法互不混比。

以下仅为合成结构样例，摘要位置需由原D3计算。

```js
const identity = {
  rootOperationId: '00000000-0000-0000-0000-000000000001',
  batchId: '00000000-0000-0000-0000-000000000002',
  documentBatchId: '00000000-0000-0000-0000-000000000003',
  packageSha256: 'a'.repeat(64), planSha256: 'b'.repeat(64),
  namespace: 'synthetic.batch', cutoffAt: '2026-11-15T00:00:00Z',
};
const descriptor = {
  phase: 'CORE', first: 0, last: 0, rows: 0, bytes: 1000, ordinal: 0,
  subBatchId: '00000000-0000-0000-0000-000000000004', predecessor: null,
  firstOperationId: identity.rootOperationId, lastOperationId: identity.rootOperationId,
  previousLastOperationId: null, previousDescriptorSha256: null,
};
const workBatch = {...descriptor, descriptorSha256: requestHash({identity, descriptor})};
```

step的第3至6参数依次为原ordinal、原command phase、完整原request、私参。CORE用INITIALIZE和原私参，其余私参为null。MASTER/KEYS沿原phase，BASELINE_CLOSE和FINALIZE用PUBLISH，DOCUMENT_OPEN和HISTORY用DOCUMENTS。原request、operation_id、request_key及ordinal保持原值。

inspect/complete响应固定四键 `state/subBatchId/descriptorSha256/summary`。inspect状态为ABSENT或COMMITTED，complete状态为PENDING_TRANSACTION。step返回PENDING_TRANSACTION、subBatchId、descriptorSha256、operationId、ordinal。非FINALIZE summary为null，FINALIZE summary是rootOperationId、batchId、documentBatchId、packageSha256、planSha256、status=IMPORTED六键对象。响应无完整来源数组或大INIT，满足原64KiB读取边界。

inspect在同一个D3业务事务内先取cutoff锁、再取稳定subBatchId事务锁，锁后按原PK复核。旧COMMIT仍活动时等待或超时，D3按UNKNOWN处理。成功组skip由新连接锁后COMMITTED证明。complete核本事务全组完成，并在既有SECURITY DEFINER边界内执行SET CONSTRAINTS ALL IMMEDIATE，原deferred验证失败直接抛出；成功仍只返回PENDING_TRANSACTION。执行端保留原SET CONSTRAINTS ALL IMMEDIATE和唯一COMMIT，收到真实COMMIT ACK才记成功。

入口源码均REVOKE PUBLIC，安装阶段仍需按原initializer/importer角色分配最小EXECUTE并核准确metadata。reader与complete需要ROLE_IMPORTER，CORE step需要INITIALIZER，其他step需要ROLE_IMPORTER，原controller需具备两类SET ROLE能力。0PG/server范围继续有效。
