# Source44 最小来源方案（仅本机分析，未执行）

当前实际基线为 Root132。Source04、consumer02、Start43 失败及 Restore43
真实回执保留；本文件不签发任务、不选择后继 key、不构造新服务事实。

## 一、两条真实调用链不能混为一谈

准确 Root08 以 `ROOT08-EXECUTION-PREPARATION-01/job-bundle/source-rows.json`
为准。host 必须看 `delta-02.asset.json`（5e4f），catalog 必须看
`delta-00.asset.json`（3647）；APP 候选中这两个文件已不同，不能拿它们替代。
其余下列 state/plan/record/target/source 文件已与准确行逐项匹配。

### Start describe：文件读取、内存目录重建，不读原业务计划

1. `start/bundle/final-execution-describe.mjs:23-54` 校验进程入口、干净环境、
   stdin；读取 `/run/naijue-rewrite/current-production-service.json` 和固定
   `historical-prepare05.json`，调用 `final33-run.mjs:67 finalHostOptions`。
2. `r3-service20-entry.mjs:4` re-export
   `describeFresh35FinalExecutionBinding`。
3. Root08 host `delta-02:1030-1032` →
   `readFresh35BatchedContextInputs:995-1018`：
   校验 sourceRoot/原父链/当前容量时限；读固定 installation record；
   `reconstructFresh35InstalledProductionTargetV2` 只重建历史目标；读固定
   current proof；校验 Node/source/reference 根路径及文件保护；读取 reference
   INDEX/九个既存 reference 输入、源码闭包及 SQL/model/body/definition 静态资料。
4. Root08 catalog `delta-00` 的 `buildFresh35CompactZeroCatalog:258` →
   base/admin 目录、`buildFresh35BatchedCatalogV1:460` →
   `buildFresh35BatchedCommandSuccessorCatalogV1:513` →
   `buildFresh35Settlement24CurrentWireCatalogV1:570`，在内存创建模型、SQL
   检查文本、hash 和 WeakMap。SQL 文本不执行。这里的 production target
   `purpose=PRODUCTION_NEW_EMPTY_EXACT35` 使 target 文件的
   `loadFresh35SyntheticBootstrapNetwork:68` / `assert...Current:75`
   直接返回 null；不会发起网络观察。
5. `batched-stream-cli-state.mjs:59 buildFinalR3ExecutionBinding` 仅校验传入
   target/inputBinding/preparedBinding/current proof 摘要/epoch/after 目录证据，
   structuredClone 原 binding，再替换允许的执行证据。
6. generator 校验 after42 和原 binding 非动态字段，生成 descriptor/liveFacts
   对象、检查当前时间与 admin/service 剩余窗口，返回 stdout。

这条选中路径不调用 PG Client/connect/query、Docker、子进程、持久写、
原计划编译器、`prepareBatchedStreamPlan` 或 `verifyFinalR3PersistedProgram`。
它不是数学纯函数：依赖真实文件权限/路径、平台/UID、当前时钟及受保护文件。
它也不独立证明当前 Docker C 或 postmaster 存活；真正 live C/guardian/ACK 的
前后检查由外层 Start 保留。

原 `start_owned_describe.py` 父层则确实有受控 Docker exec、子进程管理和
root-only request/stdout/stderr/process/最终四 leaf 的 O_EXCL 写入。
不能把整个 Start 或父采集器称为无写 pure。

### 原计划 verify：单独函数可读校验；完整 writer host 会连接 PG

`batched-stream-cli-state.mjs:155 verifyFinalR3PersistedProgram` →
`retainedCliBatchedProgram:122` → state.metadata / state.initialize() / batches()
/ steps() → `assertFinalR3Initializer:137` / `describeCliBatchedContents:71`。
它检查 initializer、完整44910步、批次描述和原 binding；只返回普通 prepared
对象，不注册授权，不生成新计划。

实际 state 来自 `openCliBatchedState:113` →
`batched-stream-plan.mjs:162 openBatchedStreamPlan`：lstat；
`new DatabaseSync(path,{readOnly:true})`；query_only/cache_size/BEGIN 和 SELECT；
close。它使用 SQLite 文件读取事务，不连接 PostgreSQL，不调用上方的
`prepareBatchedStreamPlan:12`。代码无原 SQLite 持久改写；若将来单独运行
仍需明确只读挂载以及 SQLite 对已有 journal/锁文件的环境行为，不能只凭
源码把现场文件系统副作用实测标成通过。

但真实 writer `runFinalR3Persisted03:85-103` 在 openCliBatchedState 后进入
`openReviewedFresh35CompactZeroHost` → whole-host 的真实 physical host / PG
client.connect，取得真实 admission 才调用
`restoreFresh35FinalPreparedImport` → verify。完整 writer 不是闭库 pure
诊断入口。`restoreFresh35FinalPreparedImport` 自身要求 genuine admission，
不能伪造对象来调用它。

verify 从 SQLite 第0步取得 initialize，使用另行传入的 encodedScrypt 做
typed hash；它不自行打开 `original-initializer.json`。原 raw initializer 的
读取/保留在 root `final33_host.py:725 preserve_final_initializer`；planCustody
函数 `:714` 只校验目录和两个文件的 stat9。这三件事必须分开陈述。

## 二、本次失败输入必须从既存实际资料取得

| 输入 | 既存来源及限制 |
| --- | --- |
| failed stdin | HOST `state/native-services/<Start43>/genuine-describe-request.json`，父层 run 在启动前 O_EXCL 保存，内容只有 service 与 backupAdminValidUntil。尚不能把未取回的正文称为已本地核对。 |
| current C43/proof | 同 BOOT 的原 request、HOST `authority/fresh35-current-production-service-v2-service-43.json`、retained-ack、原 service-start-authorization、service-retained。已有 readback 只确认 proof pin67c060、C2762f、ACK20457、cleanup2f5a；不是完整 raw proof 捕获。 |
| role deadline | request.backupAdminValidUntil 与真实 apply result 的 admin deadline；已存 apply readback 有两角色 deadline。不要重读 auth snapshot/password/verifier。 |
| historical binding | 原 pinned `historical-prepare05.json`（78fcd3）含 inputBinding、preparedBinding、旧 executionBinding 和552b native-result pin，不含完整初始化原件。 |
| after42 | Root08 既存 source/catalog/model 资料重建 a5f/aef/ada；actual42 COMMIT/readback 来源另留791d/5e6f。目录重建不能被描述成再读当前 PG。 |
| planCustody | ROOTPREP03/fresh/ACTUAL-BASIS-BASIS.json 的 historicalPlanCustody 三条 stat9，以及 Main7/Main8 既存授权元数据；不是 plan 正文验证。 |

本次 `genuine-describe-payload.json` 是成功后才发布的 leaf；失败前保留的是
`genuine-describe-request.json`，不能假称已有成功 payload/descriptor/liveFacts。
现有113字节 stdout/空 stderr 的原因是 generator catch 丢弃 error，只写固定
UNKNOWN object；Python 采集器无法从这些字节恢复首个断言或原 stack。

## 三、Source44 最小权限修正（T45 consumer owner）

不修改 Root08 record 的 `ORDINARY_RUNTIME_REQUIRED`，不兼容接受 root 与普通
身份两种调用，也不改变 shared contract、数据库、原 SQL/计划/业务 IDs。

复用 writer 已有 `final33_host.py:100 group_directory`、`:554-558` 的投影模式，
及 `CHILD:409-413` 的 `Popen(user=61035,group=61035,extra_groups=[])` 模式。
仅将描述 Node 子进程改为固定61035；root Python inside/subreaper/父采集器保持
root，继续限时、收割子孙、保存真实 process 和四 leaf。

BOOT/native-services 父目录为 root0700，原脚本/历史 witness 为 root0400，
所以只改 Popen UID 必然不足。不要 chmod/chown 原 BOOT 或原文件。应复用
既有 `STATE/final33-private` group-traverse 父投影下一个获批 start-key 独占
子目录（最终路径由 Main scope 指定；不使用 writer-key 子目录），root:61035
0710；仅投影三个文件 root:61035 0440：`final-execution-describe.mjs`、其纯 helper
import `final33-run.mjs`、`historical-prepare05.json`。所有祖先须按现成模式可
遍历且不可由61035写。若现有 state 挂载不能覆盖该投影，只为该三文件目录
增加一项只读挂载，不开放整棵 BOOT。

stdin 仍由 root 父层交付，不投影 password/admin material/encodedScrypt、raw
initializer、SQLite、auth snapshot、原 profile 或配置。原 plan 61035:0600
和其目录0700保持；描述不需要新增任何 plan 访问。

原 `r3_05_readonly.py:233-292,315-323` 的 authority-61035 模式已经提供安装/
admin/SQL38/current-proof 的 root:61035 0440 只读投影；provision/deployment 仍
root0400，普通子进程保持不可读。复用该机制，不新增执行授权投影。Root08
源码、node_modules、reference 继续原只读挂载。`/run/...current-production-service`
由原发布机制提供，启动中须保持可读但不可写；不凭本地源码宣称其现场权限
已新增实测。若 Source44 源码只读审查发现父路径不足，补这个确切投影，
不放宽 record loader。

准确 consumer 差分应限于：

- `start/bundle/start_owned_describe.py`：inside 的固定 ordinary 子进程身份、
  新投影路径校验、既有 capture 的安全诊断字段复制；host Docker bridge 仍 root。
- `start/bundle/final-execution-describe.mjs`：固定61035且 supplementary groups
  不扩张；固定新投影入口和 witness 路径；Root08 调用及业务比较保持；catch
  增加闭集安全诊断。
- `start/bundle/normal_service05_after08.py`：在已有 staging 位置创建上述独占
  投影，更新准确 runner/helper pins；原 BOOT/输出/停库/lease 逻辑保持。
- 仅必要的源码清单、接口引用、phase pins 及（若实际需要）一条只读投影挂载。
  不修改 writer 算法、prepare/SQL、已失败记录。

D1 只拥有后续获批 Root/Main Source successor 配套引用和准确新旧闭包绑定；
Main 唯一决定后继 keys/时限/执行范围；T45 唯一实现 consumer 和现场操作；
QB 只对新差分复核。Root132/e321是后继基线，不能套127→132。

## 四、吞错修正及诊断界限

借用现有 `final33-run.mjs:15 describeFailure` 的 native-error/own-descriptor/
固定枚举做法：generator 仅输出 errorType、闭集 systemCode、闭集 guardCode、
固定 stage，以及最多一个已允许源码模块名+正整数 line/column。
source frame 从 native stack 识别时只映射准确 source 模块/投影脚本，丢弃完整
stack、路径、function name、任意 message、cause 和属性。未知统一 UNKNOWN。
必须同步 Python `safe_native_failure` 的闭集复制，否则增加的字段仍会丢失。
诊断不进入 descriptor/liveFacts 的业务授权内容，不伪造错误发生点。

闭库可以做独立的 recorded-input 子函数诊断：实际 captured inputs 完整后，
直接验证 buildFinalR3ExecutionBinding 的数据比较，或另行只读 SQLite 验证
verifyFinalR3PersistedProgram；两者无 PG，但后者与本次失败无关，不应搭车。
本轮没有运行它们，也没有构造 captured inputs。

不能在 stopped C43 上原样重跑原入口：原 exec namespace 已关闭、固定路径
和进程身份有要求，且真实 now/admin/service 窗口校验仍存在。不能冻结/篡改
Date.now、补未来 proof、改 expiry 或把历史 C43 包装成 current live C。
故建议不为定位这次首错盲跑整段 Node。若 Main 仍需要一个 labelled diagnostic，
应单独限定在真实已捕获输入和明确子函数，只输出诊断字段与 historical-only
标签，不保存四 leaf、不建立 writer context、不交 Main8、不称 live descriptor。
它只能证明该子函数在该记录输入上的结果，不能恢复本次已被丢弃的首个错误。
完整 writer/physical host 必须真实 PG，不得用它们冒充闭库诊断。

当前交付仅此来源分析和差分方案；零新增 Node、PG、容器、Root、key、业务
提交或冻结源改动。Source44 是否实施、是否另做任何诊断，由 Main 具体范围决定。
