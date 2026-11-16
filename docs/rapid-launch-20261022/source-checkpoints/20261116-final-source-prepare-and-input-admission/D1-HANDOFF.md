# 11/16 新批准备与持久计划消费

仅覆盖当前 T45 `ed5176dd3f56b39c044aa9058e320acec2ac676221ae641cdd0625892a4e9a18` 物料的 6 件 MJS。`source/` 是交付文件；`work/` 是本机核对工作副本。旧 11/11 writer、原 INIT/business guard、旧来源与安装回执保留。没有前端、共享业务合同、SQL、数据库角色或 GRANT 变更；批式 wire 仅增加 `BEGIN ... READ ONLY`，准备 guard 拒绝 COMMIT 和所有 mutation SQL。

## 接入现有受控调用者

统一从最终运行 root 的 `tools/unified-import/r3-service20-entry.mjs` 加载。这个 root 必须是 T45 对 6 件增量重新物化、登记并配对 C 的唯一 source closure；不要在 ed5176dd 原目录原地覆盖，不要继续使用旧 entry 叶 SHA 或本机目录。函数不会创建连接参数、凭据、目标、管理员、provision 或审批。以下参数均由 T45 现有真实入口提供，不发回 D1。

`options` 保持原 `{target, initialization_identity:admin, allowSynthetic:false, registration, historicalSettlementRetentionApproval, historicalLineAmountEvidence, historicalSalesHallApproval, currentEffectiveAlignmentEvidence, explicitZeroApproval, historicalStaffHallApproval}`，六项仍由原 CLI readers 从包外已批准字节加载。registration 使用 D3 最终索引中的精确四字段；本批不使用 null registration。`batchBinding` 仍为精确五键 `{manifestSha256,target,admin,registration,sourceOptions}`，sourceOptions 保持原 target-profile 和六个审批/证据 SHA flags。六个固定值已调用新 consumer 与当前 D3 `954bbd6508725fa0e9f38140d4ef8830d266d10d5ec8f9556db6196c8412d88f` 索引实际配对，未重新预检。

`hostOptions` 复用 `{referenceDirectory,sourceProfileSha256,currentService:{sha256,capacityExpiresAt},parentPins,successorSha256}`。profile 固定 `b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b`。parentPins/successorSha256 仍是已有安装祖先链，不是旧业务 manifest 的授权。`config`、`target`、`admin`、`provision:{operation_id,request_sha256}`、encodedScrypt 都从现有受控真实入口取值，特别是保留原首位管理员的 provision，不重建管理员。

## 实际字段生成 → 外部有限签发

先在最终运行 root，用原受控只读元数据入口调用：

```js
const inputBinding = api.describeFinalR3InputBinding(target, admin, provision, batchBinding);
const preparationScope = {requestKey:api.FINAL_R3_PREPARATION_KEY,batchPlanPath};
const binding = await api.describeFresh35FinalPreparationBinding(
  sourceRoot, hostOptions.referenceDirectory, hostOptions.currentService,
  hostOptions.parentPins, hostOptions.successorSha256, inputBinding, preparationScope);
```

第二个函数读取原受保护 C/安装目标/实际源码，调用与真正 loader 相同的 `readFresh35BatchedContextInputs`。它不连接数据库、不生成 admission、不生成计划、不签发权威。binding 精确形态：

```text
{format:'FRESH35_BATCHED_PREPARATION_BINDING_V1',
 target:真实公开STANDARD_IMPORT_SQL_V1指纹,
 inputBinding:{manifestSha256,sourceProfileSha256,indexSha256,summarySha256,
               batchBindingSha256,targetSha256,adminSha256,provisionSha256},
 currentServiceSha256,postmasterStart,transactionMode:'BATCHED_V1',
 batchedDbCandidatePinsSha256,batchedSourceSetSha256,
 batchedCatalogSpecSha256,batchedModelSha256,
 preparationScope:{requestKey:'t45-r3-final33-plan-prepare-20261116-01',batchPlanPath:固定绝对路径}}
```

主控沿原外部签发通道提供受保护的 Linux `/etc/naijue-erp/fresh35-batched-preparation-v1.json`：

```text
{format:'FRESH35_BATCHED_PREPARATION_AUTHORIZATION_V1',
 decision:'AUTHORIZE_EXACT_BATCH_PREPARATION_AND_READONLY_ROOT_INSPECTION',
 binding:上一步原样结果,
 startsAt:真实签发毫秒,expiresAt:真实有限截止毫秒,
 maximumOperationSeconds:650,maximumCleanupSeconds:130,maximumJobSeconds:780,
 independentSafetyReviewSha256:本次独立复核,
 authorizationReference:本次既有裁决和原任务引用}
```

复用 record 模块的 `validateFresh35BatchedPreparationAuthorization(authority,binding,actualParentDeadline)` 在外部签发前实际调用；该函数仅校验数据，不发 token。authority 的 startsAt/expiresAt 是真实父授权与 C/runtime/guardian 有效期，不是单次作业时长；允许沿用覆盖 update+prepare+writer 的现有90分钟controller有效期，不为PREP先缩角色再扩回。expiresAt 不得超过原父policy/C/service lease/runtime/guardian的实际最早截止，controller 的真实 rolvaliduntil 必须不晚于这个 host expiresAt。原 controller catalog SQL 继续读取并核验数据库真实角色的 rolvaliduntil>now 且<=host expiresAt，不把650秒工作片传成catalog身份guard的授权截止，也不移除原predicate。不能用本机样例时间或上一阶段 C 填充。

作业预算是三个独立精确字段：maximumOperationSeconds=650、maximumCleanupSeconds=130、maximumJobSeconds=780。source从runFinalR3Prepare03第一行记录实际operationStartedAt，650秒截止贯穿summary读取后校验、source/catalog生成、物理catalog验证、计划生成和只读CORE检查；不在admission后重启计时。物理wire的timeout/timer从这一原始650截止取最小值，但身份catalog guard仍用上段真实长期host expiry，两种含义分开。源planner阶段、每个持久步骤和阶段返回检查原始工作截止；T45原受控外层job780秒、child650秒的硬进程限制与130秒保全/stop收尾仍必需，不能将wire关闭冒充整个child停止或收尾已完成。validator签发前要求默认完整工作预算可覆盖；消费时用同一次原始operationDeadline验证实际剩余，已耗用时间不补回。

准备权威绑定唯一 requestKey 与固定 canonical batchPlanPath，两个字段不可换。原dispatcher单key只执行一次；已存在plan在开host前拒覆盖，未知状态读原结果，不重放、不换路径。更晚的认证到期不允许延长650工作片或780作业。受保护公开权威无凭据，按已有 root-owned、不可由普通用户写、普通消费者可读的 authority mount 方式挂载。私域输入、持久计划和 private INIT 仍用原 canonical 私域目录、0600、原非 root owner/access 通道；不要把 root 0600 且 ordinary 无法读的文件冒充“已挂载可读”。atime 不参与现有文件身份校验。

源入口 `runFinalR3Prepare03` 只消费受保护文件及其准确 SHA，不写或生成这个授权文件。不得借用旧 compact-zero execution 权威或旧 originalR3PreparedBusiness。

## PREPARE

```js
const preparedResult = await api.runFinalR3Prepare03(config, sourceRoot, target, {
  indexPath, summaryBytes, manifestBytes, batchPlanPath,
  options, provision, encodedScrypt, batchBinding,
  preparationAuthorizationSha256,preparationRequestKey:api.FINAL_R3_PREPARATION_KEY
}, hostOptions, retainInitializerInExistingPrivateChannel);
```

indexPath 与 batchPlanPath 必须为绝对 canonical 路径。summaryBytes 是原 summary 文件字节（不是再次 stringify 的 JSON）；固定 `6751463c…`。原 PASS index `b5a6e144…`、manifest `7ebdac46…` 和六批准全部复用。`prepareStreamPlan` 内部的原来源/index 绑定读取保留，不是重新运行 streamPreflight。已存在 plan 在开连接和准备前拒绝，转读原 key 结果；不覆盖、删除或自动重建。

真实 host 先校验当前新目录，再用原 `withVerifiedFresh35AdmissionV1` 在同一 verified client 回调内提供 token。原 `prepareFresh35Admin154Import(...,{coalesce:false,batched:true})` 产生 PROVISIONED_ADMIN_EMPTY_BUSINESS 的真实 factory 对象；原 `prepareCliBatchedState` 持久完整 INIT/requests。仅在这个对象上替换持久 cursor 并附 batchedPlan，不复制注册对象。

成功必须同时看 `result.state==='BATCHED_IMPORT_PREPARED'`、root_state 为 ABSENT、business_database_writes 为 false、connection cleanup CLOSED、没有 local_cleanup FAILED。`result.binding` 是需要原样保管的 preparedBinding；`host_verification` 是同一次真实会话结果。准备 guard 仅允许原 importer 的原生 CORE inspect 后 ROLLBACK，使用 READ ONLY，不能取得写 SQL 或 mutation guard。准备成功不是导入、发布或正式业务开放。

preparedBinding 在原完整业务绑定上增加 `finalSourceInputSha256` 与 `batchedPlanSha256`；后者包含 INIT/root identity、全部描述符链、每组完整 requests 指纹、全步骤数及 context 的 summary counts/totals/batchBinding 指纹。精确私域 INIT 仍走原 callback；不出现在公开结果里，encodedScrypt 不进 SQLite 或公开 binding。新计划必须普通执行 owner 持有、0600、单硬链接；保全后再次挂给 writer 时按原 access 通道保持该条件。helper 不改变挂载或权限。

## 首次 writer、正常 resume 与最终读回

```js
const common = {batchPlanPath,batchBinding,options,provision,encodedScrypt,
                preparedBinding:preparedResult.result.binding};
const written = await api.runFinalR3Writer03(config, sourceRoot, target, common, hostOptions);
// 仅在原提交/保全记录确认应继续时，显式 resume；不是自动重试：
const resumed = await api.runFinalR3Writer03(config, sourceRoot, target,
  {...common,resume:true},hostOptions);
const readback = await api.runFinalR3Readback03(config, sourceRoot, target, common, hostOptions);
```

在同一真实运行 root、当前 C 下生成执行 envelope：

```js
const executionBinding = await api.describeFresh35FinalExecutionBinding(
  sourceRoot,hostOptions.referenceDirectory,hostOptions.currentService,
  hostOptions.parentPins,hostOptions.successorSha256,inputBinding,
  preparedResult.result.binding);
```

真正 writer/readback 需要原 protected compact-zero execution 文件中本批精确 executionBinding 的有限授权；PREPARE 文件不能替代它。既有文件形态仍是 `{format:'FRESH35_COMPACT_ZERO_EXECUTION_AUTHORIZATION_V2',decision:'AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK',binding:executionBinding,startsAt,expiresAt,independentSafetyReviewSha256,authorizationReference}`，仍由原主控外部签发并通过原 loadFresh35CompactZeroAuthorization 消费。executionBinding 是原 preparedBinding 原样业务字段、当前 C/epoch/目录 evidence 和额外 preparedBindingSha256（原准备结果的 requestHash）。它不改或替换原准备结果。即使是同 C 的首次 writer 也要调用此生成函数；`common.preparedBinding` 始终放原准备结果，不能塞 executionBinding。仅首次 writer 沿原 never-submitted dispatcher 键，由 T45 原 wrapper 保留原根、原调用证据与 root/public 回执。该 key 不由 helper 另造。

首次模式要求同批原生 CORE=ABSENT；显式 resume 与读回要求 CORE=COMMITTED。恢复 factory 先核原真实 admission 的 b460 profile，再从持久 requests 恢复已登记对象，验证 INIT、identity、provision/admin、所有 descriptor 和完整 steps/context hash；host 随后重新派生并比对完整 preparedBinding，原 query guard 再验证完整步骤。首次 writer 不打开 index、summary 或 manifest，不调用 prepareStreamPlan/buildStreamProgram，不重预检、不重编译。原 11/11 路径保持原有严格条件，新批不走旧 reconcileOriginalR3Readback20 的旧 INIT guard。

C/epoch 续办仍保管原 preparedBinding/INIT/持久 requests，不静默改写历史。调用同一个 describeFresh35FinalExecutionBinding 从新真实 C/epoch/当前目录生成新的有限执行 envelope，再按原主控/T45续办签发；原 preparedBindingSha256 继续锁原准备结果，factory 仍核原完整持久内容。FIRST_WRITE 只允许原根 ABSENT，显式 RESUME/读回只允许原根 COMMITTED；未获新有限执行 envelope 时旧权威准确拒绝，不能重编译或造新根。跨 C 的 envelope/持久内容关系已作本机函数测试，现场续办与原根仍未实测。

原 dispatcher/wrapper 继续负责真实 root/public 结果配对、原 key 状态、失败收据、stop 和 restore。外层沿既有安全错误码记录补配本次 FINAL_R3_*、FRESH35_HOST_FINAL_*、FRESH35_ADMIN154_BATCHED_PREPARATION_* 新错误码；尚未配对的错误保持原失败/UNKNOWN事实，不能吞成成功，不能打印异常载荷或私域输入。helper 只在已确认的业务结果上保留 cleanup UNKNOWN，不能把未知当回滚，也不能据私域 SQLite 存在判成功。任一失败保留原 SQLite/INIT/错误原件，关闭 SQLite/active plan/物理连接；原 host 的回滚/discard/close 保持。六批准尤其 explicitZeroApproval 由原加载者 finally 关闭。源码 helper 不停服务、不移除 root 权威、不恢复前一服务，不抢 T45 运维职责。

## 当前目录与普通 HTTP 消费点

PREPARE、writer、resume、读回均从同一 `readFresh35BatchedContextInputs` 开始。它保留 buildFresh35BatchedCatalogV1 的旧 `6e0a…` 父模型，再使用 buildFresh35BatchedCommandSuccessorCatalogV1 得到新 `626c5604…`；新目录写入 context.catalog 并由真实 `verifyFresh35InstalledV1` 消费。旧模型/SQL36/SQL38/原安装回执不重写。COMPILED-SOURCE.json 是本机编译结果，模型 161/626c5604…；其中 fixture 物理字段、时间、catalog spec 不是现场 C 或授权，签发必须调用前述真实元数据生成函数。

已查 ordinary HTTP 的现有 consumer：`fresh35-host-session.mjs` 的 admitFresh35CompactZeroOrdinaryPoolV2 → admitOrdinaryPool 仍选 buildFresh35CompactZeroCatalog；其 ordinary current service 路径没有 retained authority 时还核旧 C20 名称。`fresh35-combined-catalog-v1.mjs` 的 fresh35CombinedOrdinaryCatalogSql / validateCatalogObservation 同时核 35 表与完整 routines 数量、每个 definition/body，绝非与单函数变更无关的独立35子集。runtime27-command-issuer.ts 消费该 ordinary cap；当前物料不含实际 HTTP app 启动点，不能断言现场使用哪条启动路径。此 6 件增量不改 HTTP，T45 若实际 HTTP 启动调用它，须顺带配对当前新161和C后再作该入口定向验证，不能复用旧整目录结果。

## 本轮验证与未验边界

- 新增小型 SQLite 持久计划与真实纯消费函数测试 5/5，0 跳过：新来源/profile/六批准/注册、持久请求和描述符/上下文/凭据绑定篡改拒绝、C/epoch续办仅更新执行envelope而保留原准备内容、缺 genuine admission 拒绝、PREPARE认证90分钟在父C120分钟内且作业仍650/130/780、超父C与过期/工作截止拒绝、唯一key/plan路径绑定、只读 SQL 次序与 mutation/COMMIT 拒绝。未伪造可用 admission。
- 实读当前 D3 954bbd65 索引，用新 describeFinalR3InputBinding 配对真实来源/六批准公开 pins，通过。该检查的 target/admin/provision 为合成值，不是现场权限验证；不读取凭据或业务明细，不重跑预检。
- 复用旧 compatibility 测试共 9 项：6 通过、3 失败。未改基底运行相同 9 项也是相同 3 项失败：旧 help test 直接使用 URL.pathname 未解码中文目录；两个旧 compact CLI 模型仍期待旧非 BATCHED 分支，当前基底为 NOT_STARTED/IMPORT_FAILED。未更改旧 fixture 使其伪通过，日志 baseline-tests.log 留存。这不是全部旧兼容测试 PASS。
- 新 6 件源码的实际 import/source closure 与新161目录本机编译通过，模型仍为626c5604…；原 writer/旧 INIT/business guard/RetainedImport 原件段逐字比较无变化。依赖的 TypeScript 通过 strict/noEmit 定向检查（allowJs，checkJs:false，MJS 无类型声明沿项目既有方式），新 MJS 已真实 import/语法解析。
- 未连接服务器或 PostgreSQL，未启动数据库、完整新源准备、真实 writer、真实普通角色授权、HTTP、最终读回或发布。真实780/650预算与现场C仍由T45在已批准有限阶段消费，不能从本机样例推断已通过。
