# R3-BATCHED-CARRIER-PREP-01 本机材料与最小接续

本目录仅为本机源码及合成材料准备。没有服务器读取、作业提交、登记、PG、安装、签发、完整输入编译或真实宿主调用。不存在新部署 profile、可执行服务器请求或预填实际 catalog。本轮输出唯一归本目录；D1/D3、原父树、旧包、原输入和历史回执均未修改。

## 固定材料

原父树为 `outputs/T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source`。其370件原文件按既有 source-rows 逐项核对后复制，先覆盖 D3 INTEGRATION-OVERLAY-06 的9件，再覆盖 D1 HOST-CANDIDATE-01 的8件，双方路径不相交，无源码替换或 import 重写。新树共380件，363件沿用父树，7件替换、10件新增。各件及差异见 SOURCE-ROWS.json、DIFFERENCES.json，实际本机读回事实见 LOCAL-CLOSURE.json。

| 输入 | 准确 SHA256 |
| --- | --- |
| HOST01/PINS.json | 12aa444b4482c26062af155cc409b046c26c7a7500ed0f6715e7170f47fc6937 |
| HOST01/SOURCE-CLOSURE.json | 61330486764d86ec9acd7f3a3963f57cab5e84a27ebc11f3c3c4714b82d7938e |
| D3 INTEGRATION-OVERLAY-06/PINS.json | 1e213e8195133ee27eaefef0650ddb8563b58c7cc3a765adeb739998690f3c81 |
| DB-CANDIDATE-02/PINS.json | 4589d0816e3ab24317a47263ac4c45a23fc13ee9b3bfd6795080affa6bcc6531 |
| 新树 SOURCE-ROWS.json | 80ed00c35a05b8adf3ef8ec030d994dfd703b06036e2880ff111b2394c4db218 |

此 SOURCE-ROWS 摘要只表示本机文件集合。它不是运行时 sourceSetSha256、映射后的161 modelSha256、catalogSpecSha256、真实 live_catalog_sha256 或发布指纹。这些值没有借用父树、预期模型或旧回执补填。主控转达的 QB HOST01 scoped source PASS及 D1 VALIDATION 最终同树导入结果仅按同版范围复用，没有重复运行旧检查。本轮只核固定文件、复制结果及字面相对模块路径，不执行源码模块。

## 155前驱及161安装

完整基础安装方法由 D1 `outputs/D1/20261115-r3-batched-import-01/LOCAL-SQL-CORE-RECIPE.md` 协调，T45不另建安装器。原9件参考输入已在本机找到并按 INDEX/各件摘要核齐，精确副本位于 materials/reference-inputs。INDEX SHA为62d1e71eb8bdb203d12817f42f612a3fe4fed7cf55cb4549e8bb9582e8cdd89e。此前仅查r910 source子集而未确认其本机落点的缺口现已补齐。这只证明本机材料存在。

基础35表 schema、lineage、历史 patchBodies、admin provision、SQL38之后，必须按 D2 `outputs/D2/20261115-r3-prefix-twelve-source-combination-local-01/INSTALL-ORDER.json` 安装准确12层155前驱。该顺序 SHA为db217adcc8e87a0b5b70471d18b85b852d158e3f73b165f65dd6a93229a3a3c2；本树对应12件SQL字节均匹配。旧一次性runner、旧授权和旧已终态作业不重跑。

DB02仅在准确155前驱后安装 `sql/source-slices.sql`，在本树同字节路径为 `source/adapters/postgres/patches/0027_standard_batched_import_v1.sql`，SHA fd3d3edf05dbde10a26015858757d7985791202b0022500688504f68f64f86a4。其已含最小ACL，不额外执行单独group-access或早期切片。本轮只复制了该SQL，没有生成或执行安装SQL。

实际安装后必须由原安装/capture路径取得 canonical definitions、bodies、完整metadata及ACL，并对真实角色映射后的 EXPECTED161 核对；当前三份模型仅 expected。宿主 `buildFresh35BatchedCatalogV1` 要求真实compact前驱及 PRODUCTION_NEW_EMPTY_EXACT35 target；其161函数、35表、351列、114索引与原完整metadata/ACL检查不因本机材料齐全而视作通过。D3的162行SQL-core结果另有范围，不能替代Linux或genuine host。

## 原输入锚点与新的实际证明

原 StandardImportTarget.catalog_sha256 保持原值，继续参与原manifest/plan/initializer/步骤及操作键身份。不得用新的161 live目录摘要改写原输入，也不得把这个旧锚点当成当前安装证明。

HOST01返回的 `original_input_catalog_sha256` 是旧输入锚点。`current_native_model_sha256`、`current_catalog_spec_sha256`、`current_source_set_sha256`来自当前同版描述；`live_catalog_sha256`必须来自同一个真实物理连接的实际观察。SID/OID/地址端口/postmaster epoch/controller/C文件及服务时窗均沿原准确校验。本轮实际161、live catalog、C、epoch及时窗为未知，JSON中保持 null。

原 root-owned compact authorization 必须按现有受控外部issuer流程扩展准确绑定：transactionMode=BATCHED_V1、batchedDbCandidatePinsSha256=DB02准确pins，以及当前 batchedSourceSetSha256、batchedCatalogSpecSha256、batchedModelSha256，同时绑定原输入、当前C、epoch和时窗。未制作授权正文、未创建C、未签发或登记。旧155-only授权、旧247 receipt、预期模型、transactionMode字段或 batchedPlan 本身均不能授权。

## 现有合法宿主接缝

1. 保持正常 `stream-import` 和 `FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2` 入口，productionOptions.transactionMode=BATCHED_V1、purpose=FIRST_REAL_BUSINESS_IMPORT，复用原输入和私有引用，不能转向旧whole单事务。
2. `openReviewedFresh35CompactZeroHost`调用原 private physical factory，`loadFresh35BatchedImportContext`核原保护记录、当前C和新的exact扩展授权，建立当前161 catalog描述。只有真实连接完成当前完整catalog/物理核验后，原issuer才在same-client回调内给admission；不能从JSON构造。
3. 首次prepared须为原 `prepareFresh35Admin154Import` 注册的同一对象，并共享CLI的同一个只读SQLite快照。`bindFresh35BatchedPrepared`在用户work回调前执行受控BEGIN/IMPORTER/锁后CORE inspect并确认ROLLBACK。首次允许受核准的ABSENT；重建resume必须实际读回同根COMMITTED才登记原WeakMap。未知真实discard并结束run。
4. D3借入宿主传入的同一个controlled client，以borrowedClient=true执行独立批事务；成功组按原键inspect/skip。CORE写为INITIALIZER，其他step、complete及最终约束/提交沿IMPORTER。每组COMMIT/ROLLBACK准确应答后不把discard当释放；未知结果只按原键读回，不能重放。宿主finally唯一最终物理关闭，CLI finally独立清理SQLite/approval/plan。
5. 最终核账重新通过完整genuine context/authority取得新物理连接，执行原准确 `standard_whole_package_verify_v2` 与确认ROLLBACK；原reconcile为取锁不使用PG READ ONLY。必须单独报告COMPLETED、VERIFIED、连接和本机清理结果。整个run一次完整磁盘plan绑定检查仍存在，不能声称resume完全不读成功前缀。

这是接口顺序说明，没有填可提交参数，也没有新建执行器、client、profile或请求键。D1宿主若出现具体拒绝，交原D1 owner处理；本目录不改冻结host源码。

## 合成输入的适用范围

materials/smoke-base为现存纯合成162行输入的精确副本；manifest SHA d0ec7f649304d9f0e069f1e9d0f527e72c1d4bd4cff85f9cfc26c156377e254e。26个数据文件及身份索引摘要/字节已核，逐件副本清单见 SYNTHETIC-INPUT.json。没有重新编译计划、构造writer或产生新SQL-core结果；D3正在审查的runner02保持原owner和原许可流程，本目录不复制或重跑runner。

旧247 A包仅保留定位：`outputs/D1/20261114-r3-mixed-scale-design-01/smoke-v2-a/package`，manifest SHA158ef60086162a28e4e4d5f7fab6e73a0fb93ba289ca61a0f8ca88644b8c3f58；旧SQL39 receipt不能转签155或161。

当前 FIRST_REAL CLI明确拒绝 --allow-synthetic 和非REAL package，绑定器还核原真实initializer，catalog构造也限定production target。因此162/247只能按获准隔离SQL-core合同使用，不能改包类型、借旧whole/synthetic profile或自造admission走当前FIRST_REAL genuine host。若后续要求“纯合成BATCHED genuine host”实测，尚缺由原D1 owner提供、主控明确批准的准确合成目标接缝；这不是本目录自行新增的执行路线。

## 运行依赖和接续前置

复用 Node24.21.0及node:sqlite；复用现有Linux pg8.23.1，`loadRetainedR3LinuxPgDriver`的固定原目录、dev/inode/UID/GID/mode/SHA检查全部保持，不调用本机pg或替换node_modules。原部署清单4871件runtime/reference条目仅作物料引用，见 REUSED-RUNTIME-ROWS.json；其manifest已核，依赖实际文件没有重新全量hash，当前Linux liveness及inode没有连接核验。没有deps install、build、新镜像或挂载改变。

后续最小步骤由主控分别授权：采用D3当前162 SQL-core准确终态；确认是否已有同输入提交；沿原受控材料/发布接口物化新同版源码并取得实际161安装及canonical/ACL证明；由原issuer签当前精确扩展授权和真实C/epoch/时窗；再按上述private factory进入获准目标并读回原键结果。当前没有新的服务器执行许可，本轮到本机材料交付即止。原停库/清理和0旧在途仅沿已有终态证据，没有新增现场检查，也没有更改任务状态或正式业务状态。

主控本轮后续通报：162本地首次PG已停，准确155前驱全metadata通过；DB02安装psql exit3，首错尚缺，161、scenario及genuine host均未执行，child已回收且失败根保留。这是主控通报的依赖状态，T45本轮未自行查PG或现场。D1负责定向静态修复，D3负责独立install-only有界诊断；下一步先解决155→161安装首错，再由主控按真实结果选择后续范围。HOST01源码PASS不证明Linux可安装或可运行，本目录不为该失败重跑安装或扩展profile。
