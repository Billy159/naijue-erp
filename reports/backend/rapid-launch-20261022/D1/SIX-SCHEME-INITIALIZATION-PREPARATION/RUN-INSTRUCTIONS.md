# 六方案初始化：本地禁用执行材料

本目录仅供下一次受控执行使用。`PLAN.json` 与 `INPUT.disabled.json` 均保持 `executionEnabled=false`；直接运行 `run-six-schemes.mjs` 只输出禁用回执。没有连接数据库、启动服务或读凭据的本地入口。

执行沿已批准的唯一原路径：`runImportSteps` 的一个 MAIN 步骤，调用原 `createCutoffImportService` 与 `PostgresCutoffImportStore`，通过原 D3 精确两方法借出同一连接初始化六行。事务、锁、真实账号、CORE 出生证据、审计、回执、CAS 和重放仍由原实现处理。本载体不增加事务、连接池、数据库函数、HTTP 接口或新写合同。

完整来源执行器的 `FULL_SOURCE_CONTINUATION` 要求真实 `authorizedPayloadHash`；此独立初始化不依赖完整 11 源，本材料不拿 CORE 摘要或审批摘要假冒该值。主控已确认使用上述原独立 MAIN 服务路径。

## 交给 T45 的顺序

1. 当前 105/106 应用恢复和剩余 23,793 条销货头先行。不要为了本材料编辑已冻结的 103/105/106/107/108。
2. 下一初始化窗口再停旧 APP，并等待原 `app.close/pool.dispose`；窗口内保持唯一运维写者，不授权任意 owner/原始 SQL 并发修改方案表。
3. 用原只读工具读当前目标进程、角色、OID、批次、CORE 回执、截止时间、检查点、方案全表和原键回执。填一份独立的实际输入；不要修改禁用模板。请求键若已有尝试，只能沿原完整请求和原键恢复；尚未分配则由 C/T45 固定一次，不在这里猜。
4. 捕获真实原 ACL（含列和函数）以及有效权限。调用 `compileMinimumAclDelta` 只生成缺少项及其逆向；两个 `.DRAFT.sql` 仅展示全部缺少时的最大允许范围。保留原 SELECT 和既有权限，不授 MAINTAIN、整表 UPDATE、DELETE、TRUNCATE 或 PUBLIC。`UPDATE(id)` 只为保留的行 `FOR SHARE`，不用于表共享锁。
5. 任何 ACL 改动都会影响精确目录核验。T45 取实际 131 例程目录、socket 与真实 TCP 角色证据，由原 QB 出具当前 review，再绑定兼容应用与来源快照。103 的 `b5d8f2…` 只证明旧 ACL，不能填作新增 ACL 后的 review。新 APP 必须重新完整核验成功后才开放。
6. T45 在原执行器环境使用原 `createSourcePreflightRuntimeGate26` 和已有 `createPool`/凭据来源，传实际 `runtime26Review`，先 `await gate.activate()`；凭据不放入本目录。`executeOriginalSingleMain` 接收已激活的原 gate，不自行分配池或 issuer。

在原 T45 执行窗口中的调用结构：

```js
const gate = createSourcePreflightRuntimeGate26(
  existingCreatePool, createNativeRuntime26Issuer, actualInput.runtime26Review
);
try {
  await gate.activate();
  await executeOriginalSingleMain(actualInput, {
    runtimeGate: gate, signal, now: originalNow,
    append: originalDurableJournalAppend,
    retainRequest: originalPrivateDurableRequestRetention
  });
} finally {
  await gate.close();
}
```

`retainRequest` 必须在首次写入前持久保留完整原命令、原键、`requestHash`、操作 ID 与实际 review 绑定；`append` 使用原日志落盘机制。单次只执行一个原 MAIN 步骤，没有自动重试或自动换键。

7. 用原只读读回核整个六行七字段、配对审计与原键/哈希回执、序列只加一及游标/计数/expected/库存不变。按单独记录的显式同体同键重放验证不重复写入；提交结果未知时先读原键，不自动再发。
8. 若回退新增权限，只应用本窗口实际新增项的逆向；核原有效权限和当前目录，不假定旧目录哈希或旧 review 自动恢复。已提交六行和回执不因权限回退而删除。

## 文件与边界

- `approved/` 是三份已批准原件的逐字节复制；六 UUID、42 字段和三审批凭据保持原值。
- `SOURCE-PINS.FROM-ACCEPTED-REPORTS.json` 仅采纳现有小报告中的源码 pins，没有重新哈希源码树。实际兼容快照和动态元数据仍待 T45 填入。
- 两个只读 SQL 文件是原只读工具的查询片段，不包含新的事务或写操作；不要从 READ ONLY 读回调用会取锁的初始化校验函数。
- 已通过本材料 3 项必要自检；没有重跑旧 11/8、来源或 native 全套。真实 ACL、首次写入、读回、重放、数据库并发和应用切换均未执行。
- 方案初始化不代表条码导入、MAIN、PUBLISH 或真实数据完整导入完成。后续 typed closure 的表锁权限仍是独立未测范围。
