# B07 pre-upgrade QA identity：T45 执行接缝

状态：OFFLINE_PREPARED_NOT_EXECUTED。C 已明确授权原登记 copy 的必要 fixture 准备；本包待原 QB 只审新增范围。D1 无实际 PG/restore/账号/登录动作。原11 SQL、ordinary ACL 源验收不重做，恢复后实际新 target/catalog/review 不能复用旧运行事实。

## 固定载体与真实准入

`qa-identity-schema19.mjs` 是可导入的原 D1 私有载体，沿原 `draft-normal-history-v16.mjs` 的显式 client/API 注入方式；不自建连接、监听器、库、角色或新表。SQL 全部固定导出在 `SQL`，只有 `staff`、`account` 两条 INSERT；无 UPDATE/DELETE/ALTER/触发器禁用/replication_role。schema19 原迁移0001提供这两张表全部列；0001..0019源码无挂在 staff/user_account 的用户触发器，后续0021才增加 cutoff 后维护 guard。执行仍读实际 pg_trigger：若原19实际也有保护，整体拒绝，不以静态结论绕过。

固定身份为 `QA_IDENTITY`：staff `b0700000-0000-4000-8000-000000000001`，account `b0700000-0000-4000-8000-000000000002`，login `B07_QA_HISTORY_ONLY_20261026`，WAREHOUSE/在职/null hall；非来源人员，版本/authVersion=1。密码随机32字节 base64url，直接调用所固定源码中的原 `createNodeScryptPasswords`，不保存或返回密码/hash。它不是来源 bootstrap、正式员工或正常 CREATE 成功，不能伪造 maintenance audit。

只允许 `naijue_erp_test_19e00102`、登记 OID/role/session_role/本机 socket/port/postmaster 完整相等，socket 以 `/private/tmp/nj-b07-` 开头；schema精确1..19；实际 staff/user_account 用户trigger数0；现有account数1、该原sourceActor disabled、auth_session数0、固定QA staff/account/login无冲突。表锁仅准备事务内阻止这三张表其他写入；guard读在锁内。任何条件不符拒绝并安全脱敏，无自动改账号/重试/切库。

## 输入与调用程序

T45 从既有保全/恢复载体获得恢复后的精确 target；不填示例值或旧 postmaster。输入为：

```js
const input = {
 contract: 'B07_PREUPGRADE_QA_IDENTITY_1',
 target: { database, oid, role, session_role, server_address: null,
  server_port: null, port, unix_socket_directories, postmaster_started_at },
 sourceActorAccountId, // 原 disabled 来源账号，保持原值
 createdAt, // 首次准备前固定当前ISO时间，UNKNOWN后仍引用同一值
 sourceRoot, // C固定的准确源码目录，含原passwords.ts
 copyRegistrationReference, preservedSnapshotReference
};
```

Node24 使用原 TS stripping 能力。原执行父进程应在原 CoW/快照保全、同copy恢复19之后调用：

```js
const {withB07QaIdentityFixture, QA_IDENTITY} = await import(fixedFixtureModuleUrl);
await withB07QaIdentityFixture({client: registeredSetupClient, input,
 recordPreparation: originalPrivatePreparationRecorder,
 afterSeed: async ({withNormalSession}) => {
  // 此处调用原已审11SQL执行、最小ordinaryrole、freshmetadata/review、normal API组合。
  // 沿原载体执行；不能把fixture setup client传给ordinary HTTP。
  const normal = await originalApprovedUpgradeAndNormalApiPreparation();
  try {
   await withNormalSession(normal.api, async ({actor, privateCookie}) => {
    // C预登记的successor input.actor必须已明确绑定本次QA身份；原sourceactor不改。
    // 若已有历史命令或UNKNOWN，先原key读回，不调用这次新案。
    await runDraftNormalHistory({api: normal.api, pool: normal.pool,
     runtime26: normal.runtime26, input: registeredSuccessorDraftInput,
     privateCookie, recordRequest: originalPrivateRequestRecorder,
     readBackgroundFailureCount: normal.readBackgroundFailureCount});
   });
  } finally { await originalNormalApiAndPoolClose(normal); }
 }
});
```

上述原升级/role/API准备与关闭名称是调用接缝，复用 T45 既有 carrier，非本包新实现或已执行声明；本包实现完整的两个seed INSERT、原codec、事务、UNKNOWN出口、真实 auth login/session/logout 范围。不得将示例函数名当成存在的导出。若 T45 现有父载体只能分进程执行、无法保持该密码闭包，不得落盘密码或改为固定密码；回 D1 其准确父载体入口，由 D1 补该有限接线，T45不承担源码开发。

`afterSeed` 只在 COMMIT 返回成功后调用；在同一进程保留密码直至原升级与普通API准备完成。`withNormalSession` 最多一次，只向正常插件 POST `/auth/login`，再 GET `/auth/session`，核实际 account/staff/WAREHOUSE/null hall/authVersion=1；`work` 仅接收真实 cookie和QAactor，无密码。退出finally正常 POST `/auth/logout`；失败不伪称注销成功，外层返回固定失败码并保留copy。函数最终结果不含 cookie/password/hash。父carrier不得序列化请求/响应、driver参数/报错或回调入参。

## 未知提交、结果及恢复

`recordPreparation` 写原私有准备记录，发生在首次 INSERT 前，只有目标、注册/快照ref、固定UUID与语义、时间，不含凭据。本程序不种session、不自签审计；正常登录才写auth_session，真实历史业务才写原revision/audit/receipt，actor为独立QA。

COMMIT调用后失败抛固定 `B07_FIXTURE_COMMIT_UNKNOWN_READBACK_ONLY`，不在此连接ROLLBACK、不重放seed、不进入升级或HTTP。T45丢弃失败client，用原绑定新client调用 `readB07QaIdentityOutcome({client,input})`：仅两条SELECT，返回 rows-present/absent/unknown，始终 loginReady=false、无自动重试。密码已清除，不能凭两条记录存在假称会话可恢复；后续由C在原快照/未知结果记录下安排恢复，不能换UUID绕过去。COMMIT前失败尝试ROLLBACK，异常细节全部脱敏；T45关闭/丢弃client并保留结果。

成功种子写入只新增staff/account各1，原 disabled source actor不变；后续正常session和HISTORY审计变化按原三案合同。QA身份被审计引用后不DELETE；关闭private API/pool/PG，保留原键结果。需回到准备前状态只能T45对同copy恢复原成套快照，结果文件保留。无正式库、R1、MAIN/PUBLISH或真实账号变更。

## 本次检查与实际未测

`qa-identity-schema19.test.mjs` 5项有限纯fake检查全部PASS、0skip；使用原真实scrypt codec，其余为fake client/API。覆盖两条INSERT与正常路由顺序；wrongtarget/schema26/guard/已有账号无写拒绝；第二INSERT失败rollback；UNKNOWN COMMIT无rollback/无续办、只读结果；不完整身份不能判absent；principal错或后续失败仍尝试logout且错误不泄漏。没有复跑旧11SQL或其他已通过套件。

真实原19恢复、实际catalog/trigger准入、普通role/freshreview、实际登录/三案/注销、进程关闭和成套恢复均未执行。module/测试仅离线准备，待原QB新增范围结论后交T45按准确现有父carrier接线执行。
