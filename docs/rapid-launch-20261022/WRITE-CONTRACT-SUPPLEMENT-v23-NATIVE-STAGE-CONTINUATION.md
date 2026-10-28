# v23 已提交来源三组续跑核验补充

状态：用户已确认源码及依赖合同修订（call_97f1c99e6f4640eea8e58dd8c8c82933/0）；原 D1/D3 按文件边界开始实施，未验收。本次只申请来源续跑依赖合同，不新增表、数据库字段、SQL函数或持久化证明。

## 准确范围

原 v22 证明只覆盖原五组，不能据此省略后来已提交的 PARTIES 515、CATALOGUE 344、BARCODES 15018。本补充在原读取连接及 RR 事务内，按原 148/201 准备产物逐成员核对当前来源、真实身份、绑定、依赖和冲突；不能使用日志15036步或总数代替。

PARTIES 和 CATALOGUE 保留原规则允许的资料维护变化，不强制当前全部字段等于创建快照。BARCODES 继续完整核对原条码、方案、真实SKU、原来源及替代键冲突。不猜身份，不改主码，不自动降级。

## 新端口与返回字段

- 原 `readCoreImportContinuation26` 的 options 新增可选私有 `nativeStageContinuation26`，版本仅 `NATIVE_STAGE_CONTINUATION_26_V1`。
- 该来源授权对象提供 `capture(context)` 和 `assertVerifiedContinuation(progress)`。context 含原完整 binding、准确当前 checkpoint、原 BIND 的 operationId/requestKey/requestHash。
- capture 返回原准备产物引用、三个有序来源组的完整已验证准备成员，以及操作私有回调 `onVerified(progress)`；回调只能由原受信来源代码生成，不能来自任务 JSON。
- 进度新增可空 `nativeStagePrefixProof26`。证明版本1，含原 binding、BIND、checkpoint、原148/201产物引用及输入摘要、PARTIES/CATALOGUE/BARCODES 有序成员证据承诺。沿原规范化编码计算，不另造 JSON 字符串摘要规则。
- 原读取全部核验且原事务 COMMIT 成功后，仅一次调用 onVerified(finalProgress)。原来源闭包登记该证明原对象引用及完整结果、捕获上下文和独立来源根；返回时仅该新证明保留原引用，其他原字段继续按原规则复制。
- 提供方必须在复制前核对同一证明对象、本次调用、完整结果、绑定和独立来源根。普通 JSON、复制证明、旧调用、重入、缺失、重复、错误及内容变动均不能授权省略；取消、关闭或失败即失效。不宣称锁在 COMMIT 后仍持续。

只有以上核验通过，才省略打开这三组原已提交来源迭代器。无端口或空证明不增加省略权限；本批201不能因此回退为重放已提交步骤。原五组、其余来源、最终全11组闭包、107条ACCOUNT、原PUBLISH、当前权限、版本、原键幂等及提交未知恢复全部保留。

## 文件与职责

- D1：原 `scripts/import-v3/run.mjs`、`adapters/postgres/src/native-import-record-accounting.ts`，登记后所需有限私有三组读取模块、类型及定向测试。原 `native-core-staged-prefix-bind.ts` 的五组含义和 v22 SQL 不改。
- D3：原 `production-source-provider26.mjs`、`production-source-host.mjs`、必要声明及定向测试。相交文件由主控逐文件串行交接，不并发修改。
- 原stage写入口、数据库结构、正式页面不因本补充改动。

## 验证和执行边界

每批最多100个原成员。161次附加批查询、最多15877条成员摘要是设计预算，尚未SQL实现或实测；原元数据、权限、回执、原五组及来源读取另计。必须保留完整冲突检查与必要锁顺序；若需要额外查询，实施前说明准确预算，不删检查凑数字。

先完成源码与必要定向检查，交原QB复核；真实读回、取消和性能沿唯一服务器owner在准确登记的合成隔离环境验证。原账号列权限及锁权限必须实际核对，缺权限单列准确差异另确认，不自动授权。

本次确认只放行本补充的源码和依赖合同，不授权R1实际续传、生产迁移、发布、停服、权限扩展、删数据或重放201。实际续传另绑定具体版本、原键、当前读回、备份和有界范围确认。

## 依据与回退

依据原D1 `PF02-SEAM-REVIEW.json` 的确切端口及原D3 `PF02-CONTINUATION-RESULT.json`，此前QB SOURCE850仅验索引和V2消费者，不覆盖本次新合同。

保留原提交、原件及证据。撤回本补充源码恢复原行为；证明未齐时本批保持等待，不覆盖原账、不重放已提交数据。
