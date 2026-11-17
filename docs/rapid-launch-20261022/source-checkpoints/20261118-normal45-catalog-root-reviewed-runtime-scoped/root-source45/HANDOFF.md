# Source45 Root/Main 后继配套（仅源码）

Main SOURCE-SCOPE e71bb637bf12b2e8b1c024a76c737f67782837c6e06dd5ed24b149859df55105。
本目录只拥有Root/Main/CAS/fresh/channel配套。冻结35e/400b、原43/44失败记录
与所有原业务资料保持。没有prepare_local、server stage/fresh、metadata子进程、
时钟、AUTH、CAS、Node/PG、工厂或job运行；142仍是候选，实际Root为137/0af。

## 精确输入与后继

T45的V根目录为
`outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01`。

- Consumer `NORMAL45-FULL-DATA-CONTINUATION-SOURCE-01`：SOURCE
  `1676656b24964fa6cb14857b161896b2322cc0edca1b51281875717f3587ed3e`；
  interface `314b10698f43a8a10e51aa86dd9af2929c413ad61c1eb1b7c0251655207b8da4`；
  phases `b2d6807c0f82888b3153bd20ad70b274e72923704bffd2e6f5349f69dd71ad4e`。
- EXEC `NORMAL45-EXECUTION-CONSUMER-01`：interface
  `d2a86e568442f236ce3d688439fc6be26e46debd09ce36d8ba76a87ed4e1e5f1`。
- Static `NORMAL45-STATIC-ADAPTER-SOURCE-01`：SOURCE
  `cec6d8ec2e60ba5e2789d85c2294773afebf86846962bd85cfbf1cd229091328`。
- QB consumer最终回执96a068d401f140e77af02ff5c4a61d1a41ed9bee5094bd37fac6fb5431e3daf4，
  位于 `outputs/QB/20261118-r3-normal45-consumer-catalog-review-01/CONSUMER-RESULT.json`。
  consumer/static已通过；本Root配套仍需独立新增差分复核。

实际137 dispatcher从冻结44 unregistered模板与实际policy重建，精确核对
0afafdc9757f06bfc6b1556a287d39b46f5ba6b77b3f157ce7aa25592978dd21。
全部137旧keys、旧functions和三处key guards保留，只追加Main指定五个45keys。
RootPrep为 `NORMAL45-ROOT-EXECUTION-PREPARATION-01`；stage为
`r3-normal45-registration-source-20261118-01`，CAS ENTRY与同目录模块配对。
定义存在不代表调用过prepare/stage/CAS。

## 目录语义保持分代

T45只把installed原32目录比较固定到真实32 b7aa/4be3/6e0，并将历史command35
生产条件绑定为result目录==outer AUTH目录==35 expected。前14项installed
表达式及原proof/physical/13层completion守卫保持。

D1的writerHistoricalPins.batchedCatalog仍为command35 cf27/9f45/626，没有
整体改成ada。原prepare05 db127/344/626、44910步及prepared/native witness
保持；actual42 expectedBinding a5f/aef/ada与Root08 source392/ac85/marker5bb
保持分层。Root08 marker不作SQL安装证明。原业务ID、批次、11:40 cutoff不变。

真实记录生产predicate结果c153复用：旧15项仅最后一项false，新整条件true；
command35实际条件通过，错误世代与key/state/service/program/completion负例
拒绝。QB已独立核这些表达式及metadata投影边界。D1不重复执行T45已验检查，
不重跑SQL42、原计划、APP289、sealed18 run2或旧业务验收。

## 三段历史独立保留

consumer语义前序仍是成功42的Start/Stop/Restore与ACK42，Main7/8不换成
失败43或失败writer44。Root原typed43失败清理/恢复函数保持原样。

新增Root44独立历史验证只消费既存真实回执：Start44 COMPLETED0及四个已存
genuine leaf的原hash；writer44 FAILED2/incomplete8ef4/child-cleanupdd8e，
childStarted=false、connectionNOT_OPENED、reaped、originalInputMetadataChanges0；
Stop44 COMPLETED0/dffe及guardian5b065的原DATA干净停库；Restore44 COMPLETED0/
fb69及原verifier+expiry真实恢复、非自然过期、runtimeAuth/attrs/membership不变。

Stop结果的writerTerminalSha256指原永久失败writer hold ef30；本轮44失败必须
从currentBatchTerminals[writer44]绑定88c28，不能混用这两种字段。新Root检查
直接用真实44记录求值验证了这些生产predicate，未运行完整历史validator。

历史service44 C41a0的Running=false/PID0、name/image/operation和实际birth被
固定；不猜其ExitCode。restore ownC31ffe的Exit0则来自实际回执。绝不造成功
writer44、commit或业务导入通过，writer44永久不得重放。新增五条44 auth快照
只保stat9，连同旧23条共28条；没有读取原认证快照正文或其摘要。

## 454访问机制与其他既验机制复用

沿用已通过的固定Python61035/emptygroups、真实bind根FD、kernel access+
只读open/fstat、不读内容/不改权限的fresh源码机制。454项文件与祖先列表不变；
仅把已有record/proof的历史投影从43换为真实44已存在目录。STATE根、DEPLOY
实际源、旧517 DEPS映射保持。private baseline-scope-input-pins叶仍排除；
它仅由Python launcher分支读取，不属describe选中JS读取链。

已验99模块选中import静态图直接复用，不新增alias/mount。新45三文件投影
仍只是已审的显式权限规则，尚未实际创建。未声称新fresh访问、live namespace/
image祖先、Node执行或45当前proof已经通过。Main7仍须真实fresh access通过
并核固定actor、完整路径集、稳定bind根/无失败，才进入唯一取时钟语句。

Main7七参数、Main8八参数和writer E/P保持；worker300/300/3000/120/300、
parent5100、CAS600、service4200、角色offset4000/4120/hard4900、28GiB不变。
未来FIRST_WRITE仍需原same-client inspectRoot ABSENT；COMMITTED/unknown
停回Main，不凭本次before-child失败把未来DB状态直接认定为空。

DELTA-CHECKS只覆盖本轮Root137→142及新增44历史metadata/生产表达式接线，
复用consumer两处guard和旧identity/projection/access/import机制。本轮Source
完成和独立源码复核都不能代替Main具体runtime范围或T45唯一现场执行。
真实全量导入仍未完成，STAGED不暴露，发布限制不解除。
