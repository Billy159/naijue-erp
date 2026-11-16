# 独立物理恢复：最小 PG checker 接口交接

状态：INTERFACE_ONLY_IMPLEMENTATION_AND_ACTUAL_BINDING_PENDING。

按主控最新收窄要求，本交付替换此前同文件中 clone ordinary cap / HTTP generation 的提案。克隆侧仅证明独立 PGDATA 能从最终新冷备启动、物理身份一致、完整 161 目录一致以及本批完整核账读回。正式 HTTP、登录和业务角色验收仍在原 PGDATA 单独执行。无新服务器动作、PG 连接、备份、复制、启动、演练、fixture、build/pack；T45 是唯一现场 owner。本轮只修改本 D1 交接目录，不修改正式 loader、78 产品 pin、T45 文件、前端或共享合同。

## 1. 已找到的准确接缝

以下路径均相对正式工程根目录。

| 现成代码 | 可复用部分 | 限界 |
| --- | --- | --- |
| `outputs/D1/20261116-r3-final33-ordinary161-01/work/tools/unified-import/fresh35-host-session.mjs:753` | 原 formal loader 的保护边界 | :824–828 固定原 PGDATA device=66304、inode=13502421、UID/GID61035、0700；保持原样。不能通过编辑旧安装 record、换 C 的 inode 或禁用判断接 clone。 |
| 同文件 `buildFresh35Ordinary161Catalog` :1340 | 用真实 source / historical target / compact catalog 构造完整 161 目录 | 模型必须是 `626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811`；metadata 不产生 live admission 或恢复 PASS。 |
| `.../work/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs:375` | `fresh35Admin154ControllerCatalogSql(catalog,source,target,postmasterStart,expiresAt)` 及 :397 的完整 runtime observation validator | SQL 检查 SID/OID/version/database、clone 的实际新 epoch、127.0.0.1:56791、controller 身份/有限 TTL/两项精确 membership、只读 repeatable-read 和完整对象/ACL/函数目录。这里不检查 host PGDATA inode；新 checker 必须先用独立受保护 carrier 绑定提供 clone epoch，不能由任意 caller 自填。不是直接复用原 formal admission。 |
| `outputs/D1/20261116-r3-final-source-prepare-01/work/tools/unified-import/whole-package-reconcile.mjs:79` | `reconcileWholePackage(client,initialize,encodedScrypt,sourceCounts,sourceTotals)` | 直接接受有 query/discard 的受限 client，无普通 cap / HTTP 依赖。原生 verifier 取 row/advisory locks，准确使用 READ COMMITTED + initializer + verifier + ROLLBACK；不能改成 READ ONLY。无 import/publish/COMMIT，必须确认回滚；回滚未知则丢弃 client。 |
| `outputs/T45/revisions/20261114-r3-ordinary19-recovery02-successor-static-01/readback/bundle/reconcile.bundle.mjs:488,650,704` | 固定 `runtimeReadbackSql`、`validateProjection` 和纯比较 `compareWholePackageRuntimeProjection` | 完整 PUBLISH/receipt/audit/scope 关联、逐仓精确键与有符号数量、当前缺失/变化/多余键、收款/退款和遗漏键副作用。旧 bundle 只导出普通 wrapper，并硬编码旧 installed 路径与旧 ordinary admission；不可直接用于 clone，需仅取固定 SQL/validator/comparator 的最小源码接缝。 |

**结论：无需新增 clone ordinary runtime cap、HTTP 参数、provider 分支、generation 平台或登录 session。** 已存在的 native verifier 可直接复用；逐仓 SQL 和纯比较需一个独立 clone checker 调用接缝，保留真实连接/角色/快照与物理绑定，不能伪造 `ordinaryRead.assertReady` 或 issuer 对象去骗过旧 wrapper。

原 `normal_service09_after_cold.py` :132/:149/:409 仍围绕 `WORK/data == proof.DATA` 原卷启动。它检查过 cold complete 也不代表从 cold/pgdata 启动，不能作为独立恢复结论。

## 2. 待实现的唯一专用接口

下面仅是函数契约，当前无对应 executable/export，不是运行授权：

```text
checkIndependentPhysicalRestoreV1({
  bindingRef: { path, sha256 },
  sourceRefs: { sourceRoot, referenceDirectory, sourcePinsRef },
  importRefs: { initializeRef, sourceFactsRef, warehouseExpectationsRef,
                aggregateExpectationsRef, finalReadbackRef },
  connectionRefs: { controllerRef, runtimeRef, privateVerifierCredentialRef },
  outputDirectory
}) -> bounded public result + protected detailed evidence
```

`*Ref` 必须经既有 protected reader 检查 canonical 路径、SHA、普通文件身份、root ownership/写权限和真实父 authority/terminal；caller JSON 本身不授权。引用原私域凭据，不输出密码/hash/token 或整段 SQL 参数。`outputDirectory` 限定本次 clone 作业目录。不得接任意 SQL、任意 host/port 或数据目录覆盖选项。

执行次序：

1. T45 完成最终真实 COMMITTED + 完整核账、新 clean stop、cold copy/manifest/独立完成读回、另建工作 clone 普通复制，生成受保护实际绑定。当前输入接收/离线 PASS 均不能代替这些证据。
2. checker 先核原 PGDATA / 保全 cold archive / clone 工作副本三者实际身份与 mount/process/netns 隔离；保全备份只读，只有 clone 工作 PGDATA 可写。由 T45 在隔离载体启动同版本 PG，checker 不负责 copy/start/stop。
3. 对 clone controller 的同一受限连接，在任何业务 `SET LOCAL ROLE` 前读取物理身份，与 carrier 和 cold/source 三方匹配；完整 161 guard + observation 在 `REPEATABLE READ READ ONLY` 中验证并确认 ROLLBACK。历史安装 target 保留，当前 epoch 只从 clone 真实 PG 与受保护 carrier 共同取得。
4. 独立受限 controller client 调用原 `reconcileWholePackage`。使用本批真实持久化 INIT、source facts 和原 verifier 私域凭据；保持原锁/回滚序列。它校验 source counts/totals/import audit chain，但只格式检查 `current_totals`，因此单独 VERIFIED 不代表逐仓守恒或当前余额一致。
5. 独立 runtime 连接执行固定只读 projection 接缝：`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`，物理身份与 endpoint/epoch 再核，按原精确 runtime membership 切到 `erp_unified27_runtime_2393dbc6db9581c2`，核 row_security/search_path/replication_origin、非 super/bypass、真实 runtime ACL/策略后运行固定 SQL/validateProjection/纯 comparator；同一快照结束前再核身份，必须确认 ROLLBACK。不能将 controller 的 initializer/importer membership 当成 runtime membership；不得新增 GRANT 或改目录以让查询通过。
6. checker 只在所有项都成立时出 `VERIFIED_CLONE_READBACK_ONLY`。T45 随后按实际 owner tuple 关闭 clone，回收有限角色/进程/endpoint 并交 stop/clean-up evidence。没有真实关闭回执时，整项恢复仍未收口；原库 HTTP/角色验收另列。

复用现有 pool 的有限 query/statement/connection 限制和 discard 逻辑；准确 job/child/cleanup 数值由现场父 policy 冻结，不能凭旧管理员小备份耗时替最终批估算。controller/runtime TTL 以实际 clone 中状态和父授权最早截止为准：过期就拒绝；本交接不授权重置角色/口令、延长 TTL、新增账号、放宽 ACL 或修改原库。

## 3. T45 需提供的有限受保护绑定

约定新格式 `T45_R3_INDEPENDENT_PHYSICAL_RESTORE_CHECK_BINDING_V1`；此处字段是提案，未签发。所有嵌套结构须 closed shape、值由实际 carrier/copy/job 产生。具体 SHA、目录、container、inode 和时限缺失时保持待绑定，不填猜值。

| 分组 | 必要字段 | 校验依据 |
| --- | --- | --- |
| operation | requestKey, parentAuthorityRef, startsAt, expiresAt, jobMaximumSeconds, childMaximumSeconds, cleanupReserveSeconds | 唯一 clone 作业、有限父期限与清理余量；不借旧09键或原服务 C。 |
| source | database, systemIdentifier, databaseOid, serverVersionNum, sourceServiceRef, installationRecordRef, record154Ref, record38Ref, sourcePgdata{path,device,inode,uid,gid,mode}, sourceContainer{id,startedAt}, sourcePostmasterStart, sourceCleanStopRef, closedWriteGateRef | 本批真实 source 和 clean-stop；SID=7706545564479176741/OID=16393、同实际 PG17.11。原66304/13502421为原卷保护基线，不是 clone 值。 |
| committed import | writerKey, writerTerminalRef, commitReceiptRef, preparedBindingRef, packageManifestSha256, planSha256, rootOperationId, baselineBatchId, documentBatchId, publishOperationId, scopeSha256, finalReadbackRef | 对应最终 `7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679` 批及真实 COMMITTED/PUBLISH/audit 回执；514485 行离线通过不代表导入。 |
| catalog/source | sourcePinsRef, finalSourceSetSha256, catalogSpecSha256, modelSha256, routineCount=161, checkerSourcePinsRef | 冻结源码重建全目录，逐项验证对象/定义/ACL/role，不只 COUNT 或人工声明161。原SQL36/38历史另保留。 |
| cold backup | copyKey, copyTerminalRef, coldCompleteRef, coldManifestRef, independentColdReadbackRef, backupRoot{path,device,inode,uid,gid,mode}, backupPgdataIdentity, allocatedBytes, manifestFileCount, walFiles, walBytes, minimumAvailableAfterBytes | copy COMPLETE 与 manifest、逐文件 hash/UID/GID/mode、独立读回、源持续停库和已批准空间底线；保全备份不作运行卷。 |
| clone copy | cloneRoot{path,device,inode,uid,gid,mode}, clonePgdata{path,device,inode,uid,gid,mode}, sourceToCloneManifestRef, cloneCopyReadbackRef, beforeStartControlDataRef, sourceStillStoppedRef | 原卷/保全备份/clone 工作副本三套路径与 inode 互异。允许同 device 的普通复制，拒绝硬链接、symlink、外部 tablespace/WAL 或实际同源可写挂载。 |
| actual carrier | container{id,imageId,startedAt,hostPid,startTicks}, owner{linuxBootId,pid,startTicks}, postmaster{pid,startTicks,exe}, guardian{pid,startTicks}, mountEvidenceRef, networkNamespace{device,inode}, endpoint{connectHost,connectPort,serverAddress,serverPort}, noPublishedPortsRef, noProductionNetworkRef, clonePhysical{systemIdentifier,databaseOid,serverVersionNum,postmasterStart}, actualCarrierProofRef | 同 SID/OID 与新 epoch 只是必要项；实际 mount source 必须是新 clone，netns/container/owner/进程 tuple 证明独立性。隔离容器可保持原内部路径及127:56791，无 host network/public/反代/正式网络/worker。 |
| expected/account refs | initializeRef, sourceFactsRef, warehouseExpectationsRef, aggregateExpectationsRef, runtimeAccountRef, controllerAccountRef, verifierCredentialRef | 原真实来源/pins和既有角色私域引用；账号属性/TTL 在 clone 实际读取，不把 credential ref 当 live 权限证明。 |
| closure | clonePgStopRef, cloneGuardianStopRef, endpointCleanupRef, afterOriginalSourceProofRef, afterColdManifestProofRef | 同 owner 关闭、原卷/保全未被本次可写打开、cold manifest 未变。缺失时整项保持 NOT_CLOSED；不删除数据。 |

## 4. 核账与结果合同

最小公开结果字段：`format,requestKey,bindingSha256,state,sourcePinsSha256,catalogModelSha256,routineCount,physicalMatched,catalogMatched,nativePackageState,warehouseMismatchCount,cashMismatchCount,currentInventory{missingKeys,changedKeys,extraKeys},currentCashDirectionsDiffer,omittedKeyHasEffects,transactionsRolledBack,cleanupState`。状态不得仅靠 SQL 返回一行/HTTP200/同SID 就通过。角色/目录/载体差异给有限安全 code，不泄漏凭据或私域记录。

`FIRST_IMPORT_RECONCILED` 必须来自最终 manifest 与真实 cutoff 对应的逐仓 expectations：逐仓所有显式键、精确 key hash、正/负/零键及有符号数量一致；当前 missing/changed/extra 均0，收退款方向/条数/金额一致，遗漏组合无余额/ledger副作用。不能只比较全局总量，也不能将未知/历史缺失补0。历史人员和时间允许空、前端必填不变、2958异常商品级条码排除规则延续，checker 不改写来源。

物理冷备保留 audit/receipt 的原 xmin/事务 marker；native verifier 与固定 projection 的既有审计/收据链校验必须继续生效。不得用逻辑 COPY/重建 audit/异SID 初始化代替。如果当前 verifier 仍有未覆盖的具体 provenance 原合同条件，应仅补该固定读回项并报告缺口，不从“物理复制”推定已测通过。

## 5. 可复用 host 与不能直接重放的旧批

- `outputs/T45/revisions/20261114-r3-ordinary19-recovery02-successor-static-01/copy/bundle/post_import_cold_copy.py`：复用 evidence/protected_ref/committed_lineage/closed_write_gate/stopped/capacity/tree/inventory/copy 和 core 的 copy_regular/publish_complete。SERVICE19、旧f4 manifest、旧APP909、COPY/MEASURE/DEST 为旧批固定值，T45 必须按最终真实新批精确配对；不直接执行旧作业。
- `outputs/T45/revisions/20261113-r3-faa8-recovery-publication-local-05/normal_service09_after_cold.py`：复用 verify_post_import_cold、query_runtime/wait_runtime_ready 的物理字段与进程归属/守护/停库、completion 检查模式。它的 WORK/data 固定原卷，不复用09作恢复入口或恢复证据。
- `outputs/T45/revisions/20261114-r3-ordinary19-recovery02-successor-static-01/readback/bundle/run-readback.mjs`：复用 readbackParameters 与 safeReadbackResult 的绑定/安全输出原则。旧manifest、writer/parent/C/expectations 路径不可沿用到本批。
- 最终 ordinary161/source builder/native verifier、固定 readonly projection/pure comparator：仅取所列最小校验接缝。现有d728/14f34/284应用闭包和78产品pin继续复用，不重新 build/pack，不加入 clone HTTP 验证。

## 6. 本轮交付与未验边界

已完成源码定位和可实施接口整理。没有新增 checker runtime；现有源码尚无“受保护 clone binding → 独立连接 → 目录/native/逐仓核账”的完整独立可执行入口，旧 wrapper 又依赖原卷 ordinary admission，因此不能标成现成可运行或恢复就绪。

后续最小源码工作只需独立 protected-binding reader / bounded checker 及固定 projection 的导出接缝；不改原 formal loader、不登记普通 cap、不新增 HTTP/generation 平台。实际 carrier/copy/start/stop 与最终实际输入仍由 T45/主控原职责配对。真实 COMMITTED、最终新冷备、独立恢复、原库 HTTP/角色及切换均没有因本接口被判 PASS，STAGED 不暴露，发布限制保持。
