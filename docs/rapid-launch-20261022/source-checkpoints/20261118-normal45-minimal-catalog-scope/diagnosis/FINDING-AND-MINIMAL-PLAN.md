# Writer44 原始安装目录与历史升级目录误接

仅本机准确冻结源码及既存回执分析。未运行Node、PostgreSQL、工厂、原writer、
新容器或新AUTH；未修改35e/400b及任何历史证据。writer44永久不重放。
当前实际Root已经137/0af；44的Stop与原认证Restore已另由T45完成。

## 确定的触发位置

准确 consumer400ba4 的 `writer/bundle/final33_host.py` 文件摘要为
`45dbc76da420272ffd55a36a50fc0883080ddc05f0145fd2647dba005d01d3f3`。
`main:621` → `run:535` → `installed(a):168`。`run:539` 在启动普通child前
先调用installed；`:183-190`的15项复合条件最后一项是
`v['batchedCatalog']==a['batchedCatalog']`，失败码为
`BATCHED24_INSTALLED_CATALOG_REQUIRED`。

installed读取的是固定 `t45-r3-batched-install-20261116-02` 的原安装结果，
root pin e14e、public pin c3f1、原program f2bc、completion c10f、catalog6da5。
但Main8实际writer44 AUTH的outer batchedCatalog来自
`w.writerHistoricalPins.batchedCatalog`，即历史command35；两个世代必定不同。

| 世代 | sourceSetSha256 | catalogSpecSha256 | modelSha256 | 用途 |
| --- | --- | --- | --- | --- |
| install32 | b7aa9fa8… | 4be30c87… | 6e0a0e03… | 原13层安装及e14e结果 |
| command35 | cf27add8… | 9f4595df… | 626c5604… | 历史command升级；44 AUTH outer batchedCatalog |
| prepare05 | db127efd… | 344ccd89… | 626c5604… | 原44910步不可变prepared/native execution witness |
| actual42 / current execution | a5f72174… | aefbfd2e… | ada8f334… | 已真实SQL42升级及44成功describe后的expectedBinding |

前三个字段的完整值存于 `RECORDED-GUARD-COMPARISON.json`。原32安全读回
`outputs/T45/revisions/20261116-r3-service32-registration-actual-01/install/READBACK-02.json`
摘要6808；实际44 AUTH摘要f56b与其原ISSUED记录一致。原AUTH不修改。

## 整个复合条件的逐项核对

本机直接提取上述准确源中need的实际15项表达式，消费原32安全读回和实际
44 AUTH。raw/public SHA及public对象相等性只投影原回执已记录事实，不重新
读取服务器原件；service使用原32回执捕获的实际service值，未重跑受保护proof
的重建。逐项结果及这一限制均记入 `RECORDED-GUARD-COMPARISON.json`。

记录值对照的14项为真：原result pin与AUTH/常量一致、public pin、public对象
相等、requestKey、service、state、connectionCleanup、原operator source、
roleRestore、program、capture目录名、13层数、completion、catalog摘要。
唯一记录值为假的表达式就是 `v.batchedCatalog == a.batchedCatalog`。
这是对准确实际条件的数据复现，不是仅比较pin源码，也不是原服务器installed
函数或其文件/physical guards的一次新执行。

该条件前面的原32 terminal、proof摘要/原DATA identity/physical guard仍保留；
它们在真实44控制流中位于本次错误之前。这里没有把本机数据对照写成新的
服务器文件、原proof、physical或运行验收PASS。真实44回执88c28表明exit2，
childStarted=false、connectionCleanup=NOT_OPENED、child/descendants reaped、
originalInputMetadataChanges=0；只有safeCode，无另存的错误type/stage/stack，
不能伪造额外现场frame。源码定位行来自该唯一guard。

## AUTH及后续调用关系

- Main8 `writer_authority` 将 `**w.writerHistoricalPins` 加入outer authority，
  所以该outer batchedCatalog确为command35；它不应被整体改为after42。
- `historical_applied_catalog_successor:230-267` 读取固定command35 terminal/
  result/commit/completion；其expected三元组已是cf27/9f45/626。目前它独立
  比较result与expected，却没有用outer a.batchedCatalog把该字段绑定到正确
  世代。outer字段在精确writer host中的唯一取值比较目前正是错误的installed。
- `applied_catalog_successor:272` 随后调用source_lineage.validate，先通过
  originalExecutionBinding验证Root07/prepare05历史，再独立验证Root08源392
  及actual42 COMMIT/readback/capture，并将a.expectedBinding绑定到after42。
  这一步位于本次失败之后，本次writer未到达；Root08 marker5bb/ac85本身仍
  只是源码物化证明，不冒充SQL已安装。
- `validate(a):137-144` 已要求当前expectedBinding为a5f/aef/ada；真实Start44
  四leaf/Main8 E/P也已通过。`SAFE-AUTHORITY-LINEAGE-CHECKS.json` 对实际AUTH
  与既存来源做10项安全字段对照，全为真：install32 pins、command35 pins和
  outer目录、actual42 current binding、新C/epoch绑定、原prepare05及native
  witness不变、Root08 marker/新lineage refs和input02引用。未读取原初始化/
  SQLite/credential内容，也未重跑任何后续guard或已通过业务验证。
- 剩余`current`包含真实C/birth/ACK/当前时间与文件校验，`final_inputs`包含
  实际只读挂载校验，`controller`读取私密凭据。这些不能作为本机pure检查
  来运行；本次分析不声称它们在writer44中已通过，也不为诊断读取凭据。

## 唯一最小修正方案（待Main具体scope）

T45 consumer owner只修两个相邻历史层的目录字段绑定，不建立统一catalog
框架，不新增AUTH schema，不放宽任何比较：

1. 在新consumer的writer host中，把原32三元组作为固定原安装证据
   `INSTALL_BATCHED_CATALOG`（来自上述真实e14e原结果），installed最后一项
   改为 `v['batchedCatalog']==INSTALL_BATCHED_CATALOG`。保留整个条件其余14项、
   原terminal、原protected proof/physical与13层completion检查。
2. 在`historical_applied_catalog_successor`原result复合条件中，将
   `result['batchedCatalog']==expected`明确绑定为
   `result['batchedCatalog']==a['batchedCatalog']==expected`。outer字段继续精确
   表达command35，而不是变成不消费的遗留字段。
3. source_lineage actual42/current expectedBinding、Root08 marker、原
   prepared/execution bindings全部保持。新writer只能用Main另行指定后继
   transport key；不重放writer44，不重跑SQL42/prepare05/APP。

D1 Main配套只绑定T45新consumer/phase/interface精确闭包，并从实际Root137
及44真实闭环做获批的后继引用。`writerHistoricalPins.batchedCatalog`仍保留
command35含义；Main7七参数/Main8八参数/E/P/原业务IDs不变。新Root/key/时限
只有Main具体scope后才实施。QB只复核上述受影响差分及其必要数据验证。

## 必须补的最小验证

本次漏检点是未让真实历史数据触发实际installed复合条件。T45在新scope内
应复用现有Python静态/纯数据检查入口，直接从新生产installed源码提取这个
need的真实15项predicate，并投影原32回执的实际JSON值、raw/public摘要及
public相等事实，使用实际44 AUTH的非秘密历史目录字段。对同一组真实输入：
旧源必须复现false，新源必须为true；不能只检查字符串/pin存在，也不能另写
一套与生产predicate无关的“通过”逻辑。

仅对受影响字段加少量负例：将原32目录换成command35或after42必须拒绝；
改原result key/state/service/program/completion等现有受保护字段仍应拒绝。
对command35生产predicate用其既存实际结果及实际AUTH字段验证；替换成32/
42世代必须拒绝。负例来自过去真实数据的定向篡改，不制造未来正向C、时间、
AUTH、业务或PG状态。不运行完整installed/host工厂来掩盖缺少服务器文件，
不需要Node/PG/新SQL或计划编译。file/proof/physical等未执行边界继续明示。

当前仅交此方案和两份安全数据比较结果；没有修复冻结源码，也没有宣称
修复后通过。实际first-write仍须原same-client inspectRoot ABSENT；不能凭本次
before-child失败或历史无写将未来DB状态直接补为空。
