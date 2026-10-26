# 有限 CORE / 仓库投影导出准备

仅供原 T45 在既有受审只读载体内使用。默认禁用，D1 未连库、未执行 SQL、未改 R / 103–110 / 服务 / ACL。此目录不是新 authority、导入器、Gate 或发布入口。

## 原入口接线

原只读载体负责既有 SourcePreflightGate、真实 runtime review、连接生命周期、`REPEATABLE READ READ ONLY`、最终 COMMIT/ROLLBACK、输出文件和 finally 关闭。不要向本附件传 raw pool 或另建连接。本附件不执行 BEGIN/COMMIT/ROLLBACK/GRANT，不开启 Gate，不签发 runtime，不写回执。

在原载体当前已借出的 client / 原 runtime26 上：

```js
const {exportProjection26} = await import(exportModuleUrl);
const projection = await exportProjection26({input, client, runtime26});
// 原载体仅在整个函数成功返回后保存 projection。异常时不保存局部成员/原查询行。
```

`exportModuleUrl` 是本目录已采用固定附件的真实服务器路径。`sourceRoot` 是该窗口原独立审查绑定的服务器源码根，不是本机 R；原 Node24 的 TypeScript 运行方式需保持。模块从这里加载原 `checkedNativeRuntime26Capability` 和 `historyClosureProjectionRow26`，不复制其实现。直接运行本模块不会连库或执行导出。

## 当次待填

沿原载体填 `sourceRoot/sourceRef/runtimeReviewFile/runtimeReviewSha256`，真实 `cutoffAt`、完整 `expectedCheckpoint` 及全部 `target` 字段，最后才按原执行授权设置 `executionEnabled=true`。默认输入的 null 都不代表已确认；socket 地址/端口若实际为 null，则保留实际 null，不转成 TCP 事实。target 的 postmaster 时间采用 identity 查询的原文本逐字绑定。runtimeReview 引用必须是同一原 capability 所用回执；附件只保留调用者提供的引用，不自行签认这些文件。实际身份和原 capability 分别在导出前后核对。

不新增写 requestKey；这是一次只读取证，不占原初始化/MAIN 的 key。CORE receipt/digest/namespace/selection/actor 六项已填原批身份，仍与实际 birth 回执/审计和 batch 校对。当前 checkpoint 须仍为 pre-MAIN、cursor22、WAREHOUSE22/其他0，sequence 取当次真实值。若六方案初始化改变 sequence，填更新值，不能强套旧 seq1。

## 查询及输出

`SELECTS.json` 提供可审阅的原 SQL 和参数顺序；`projection-sql.mjs` 是载体实际调用的同一份生成来源。全程 SELECT，无锁、无历史单头/明细扫描、无源文件读取/重新哈希。只读窗口不调用会锁行的 `readNativeCoreWarehouseCarryForward`、`assert_core_initialization_v14` 或新生事务专用 `assert_native_bootstrap_accounts`。

1. 真实 DB/OID/current/session role/socket或TCP/postmaster/只读/隔离级别。
2. 按固定 batch + 原 CORE receipt PK 读取唯一 birth，最多2行，取原115 `{sourceRowId,entity,sourceKey,nativeId}`。实体准确为22厅、22仓、49员工、22客户。
3. 按这115个原 sourceRowId/nativeId 的 PK 逐个读取 evidence/source/current typed projection。source 整行只在数据库内与 immutable source_snapshot 比较，输出布尔值；不输出 source_snapshot/raw/normalized body。只使用原四种 native 投影固定列。
4. STAFF 原49份 `field_provenance.fields.bootstrap_accounts` 完整对象。数据库先检查每层准确键/标量类型，安全才返回完整 proof；JS 再检查，不执行 redaction。proof linkage 为原 CORE 的 digest/commandHash/actor/namespace/selection/authority、原 source id/key/hash、原出生账号快照及仍存在的账号ID/员工配对。账号只读 exists(id,staff_id)，从不输出 login_name/password_hash/salt/token/当前账号整行。authority 中 capture/decisions/review SHA 是原文件身份摘要，不是密码派生值。DIRECT45 / CURRENT_PERSON4 分别保原关联事实。
5. 原 audit 索引按这115对象 kind+id+old_version 递归读取维护链，每成员最多256个增量。仅返回原 `{operationId,fromVersion,toVersion}` 和当前投影匹配布尔值；原 before/after root 在库内按既有规则减去 accounts/account_credentials，用原 `maintenance_evidence_matches/maintenance_complete_row_matches` 核版本、before-state、receipt/audit、时间、目标和结果链接。任何未知 root 字段、缺链、超256均列 missing，不截断当成功。原证明仍需 full-binding 最终事务再验证。
6. 同 batch 的 warehouse evidence 最多54行（53+溢出哨兵），按原 source key，不按名称或算法猜身份。每项严格输出原 MAIN 七键及 `nativeRecord:{id,reviewedAt,decisionReason}`，保留原 source row hash/file。若只有已出生22项就返回22项并标缺31，不能凭目标总数造余项。原22 accounting claims 最多23行，核原 operation/sequence1/import_record/source/evidence；这些原 ID/时间/理由不得重算。

数据最多4MiB，超限整个导出失败，不截断。原客户历史 created_at/updated_at 仍为 null；前端必填未变。维护中其他业务主档字段（含员工 contact）为原投影所需，并非账号凭据；输出交原受控证据目录，不发布至静态站点。

## 原消费者所需的后续接线

返回数据含 `coreMembers/staffProofs/coreMaintenanceBinding/warehouses`、实际 target/checkpoint/cutoff/mapping、CORE commandHash/completion 和逐项 missing。`dataComplete` 仅表示这几组数据在本次快照齐全，不代表 source authority/完整导入/MAIN/PUBLISH 通过；恒有 `publicationAuthorized=false` 和 `authorityPending`。

`native-party-source26.bindCoreContinuation` 仍只接受原5键 `{authorizedPayloadHash,coreMembers,staffProofs,coreMaintenanceBinding,verify}`。原 full-source authority 必须另接**实际完整来源** authorizedPayloadHash 和它原有的独立 verify 回调；本附件故意不导出函数，也不拿 CORE digest 替完整 hash。原49份 proof 内出生 `authorized_payload_sha256` 保持 CORE digest，不能为适配 full source 而重写。

`warehouses` 后续交原 `readCoreImportContinuation26`，由其原 RW RR / FOR SHARE 再核22 carry-forward并得31余项。本只读快照不替代该锁后校验。若缺余31的实际 immutable evidence，准确保留缺项，回原 producer/来源证据 owner，不生成ID/审核时间/理由。

原 `assert_core_initialization_v14(...,false)` 需要实际 FULL_SOURCE_BINDING 回执，不能在尚未 full-binding 的只读窗伪调用；后续原 full-binding 事务负责最终证明。没有读取完整 accountcapture、没有发明 verify()=>undefined，也没有以 STAGED 可见替代发布授权。2,958 异常商品级条码不在此查询范围。

## 已做的本地有限检查

`node --experimental-strip-types --test projection.test.mjs`：4 PASS / 0 skip，仅合成115/49/53与毒化/缺项数据，调用原 native projection helper；不连 PostgreSQL。原 sealed18 run2、106单头续导、QB358、旧源审和旧测试全部复用。SQL 实际规划/权限/执行、真实 proof/成员/53项齐全尚未验证，交原 T45 下一必要只读合窗。不得把本地检查记录成真实数据库 PASS。
