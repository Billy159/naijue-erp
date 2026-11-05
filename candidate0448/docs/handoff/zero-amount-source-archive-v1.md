# 零金额原始记录接收合同 V1

范围：原始资料明确金额为零的历史销货附属原记录。不是收款／退款，不计入资金动作数，不证明已结清。合成开发；真实22条在本地组包。

## 输入

在所属 sales_header 的标准记录顶层增加可选 zero_amount_archive，不放进 fields，不放进 sales_settlement。普通、整包和流式使用同一字段。未提供该字段时旧记录哈希保持不变。

```json
{
  "profile": "ZERO_AMOUNT_SOURCE_ARCHIVE_V1",
  "records": [{
    "source_key": "original-settlement:permanent-source-id",
    "amount": "0.00",
    "source_refs": [{"file_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "sheet": "原始记录", "row": 7}],
    "original_values": {"原金额": "0", "原单号": "SYNTHETIC-001", "缺失原备注": null}
  }]
}
```

示例 source hash 必须换为 manifest.source_files 中对应原文件的真实校验值；示例数据不是实际历史数据。

- source_key 是该原单下原始记录的永久身份；原系统编号可直接保留。没有编号时本地主控建立持久映射注册，不用姓名、显示名称、每次变化的文件hash或临时行号。相同原始内容的不同记录使用不同永久键，不去重丢行。
- original_values 保存原始单元格文本或明确 null，不将缺失金额写0。必须非空；禁止凭据、密码、令牌。amount 是经清洗确认的规范零值，原始拼写保留在 original_values。
- source_refs 只是来源定位，由预检核对manifest源文件pin；不是独立真实性证明。row不是永久身份。
- 每个原单1至1000条，每条1至100来源定位，1至100原始字段。输入严格封闭，无direction/id/结清状态字段。
- 仅接受原业务类型SALE、stock_basis=CUTOFF_HISTORY且具备历史来源的原单。不得以伪造历史分类绕过校验。
- 派生archive_id=stableImportId('zero-amount-source-archive-v1', source_namespace, sales_header.source_key, record.source_key)。只作技术读回标识，不冒充原始ID。排序不影响此ID。

## 持久化与读取

新SQL 0027_zero_amount_archive_successor.sql 接在原三份历史修正之后、STAFF空厅后继之前。整体由 renderWholeHistoricalReceptionCandidate 生成，一事务安装，并保留旧三份渲染器不变。安装记录及实际权限、函数指纹仍须经正式安装准入确认，候选文件本身不是安装证明。

受限整包命令将完整archive写入既有 audit_change.after_values.records 的所属原单item，同时纳入 import_record.source_record_hash。与原单及事务共同提交/回滚。没有新增业务表或业务字段。已有请求键防重不另起资金动作。

安装后，在已授权本地隔离库、核实正式安装记录和函数指纹后使用现有importer角色（下面是本地只读核对步骤，不是绕过安装准入的自动执行入口）：

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2;
SELECT * FROM naijue_erp.standard_zero_amount_archive_trace('原单目标UUID'::uuid);
ROLLBACK;
```

该函数按原单目标ID查既有标准导入指针及已发布批次，调用原有受限proof校验回执/审计/源哈希关联。普通runtime和initializer无执行权限，PUBLIC无权限。原proof函数不公开。应用调用 packages/application/src/unified-zero-amount-archive-reader.ts 的 readZeroAmountArchive(admittedSalesClient, salesId, optionalSourceKey)，，client须来自正式sales安装记录与catalog准入的有限SQL host，不能注入未经准入的raw client。得到原单、来源、原始值、稳定archive_id和单独统计：source_record_count、funds_action_count=0、funds_amount_cents='0'、settlement_state='NOT_INFERRED'。

22条在各原单的source_record_count合计必须为22；sales_settlement计数只计算实际非零收退款记录，不能把22计入资金动作或从输入过滤后称完整。现有非零记录及金额保持原样。读回失败不能当作0条成功。

## 验证范围与命令

```
node --test tests/unified-zero-amount-archive.test.ts tests/zero-amount-archive-intake.test.mjs tests/zero-amount-archive-proof.test.mjs tests/historical-signed-sale-preservation-preflight.test.mjs
node --test tests/whole-historical-reception-candidate.test.mjs tests/whole-package-sales-integration-candidate.test.mjs
```

已运行模块、普通/流式预检、原始字段保留、两路执行请求及计划哈希一致、源码精确SQL变换和只读调用适配测试。普通/流式真实入口及计划hash在改动前失败、改动后通过；SQL与reader测试是实施后补写的源码/调用适配测试，不冒充SQL先红后绿或PG实测。

待本地Codex验证：真实PG安装、以正确/错误角色读回、22条原始数据逐条对账、失败事务回滚、重复实际提交、原库存不重放，以及浏览器展示。不要使用候选的源码通过代替这些结果。旧分块SQL入口不支持该扩展，必须使用正式准入后的整包普通/流式通路，不可手工旁路旧拒绝。

边界补充：来源键、原列名及非空sheet上限4096个UTF-16代码单元；原始值上限16384个UTF-16代码单元。SQL按Unicode码点长度加补充平面字符数计算相同单位。row为1至2147483647。源码断言及JS补充平面字符边界用例已验证，SQL实际Unicode边界仍待PG验证。
