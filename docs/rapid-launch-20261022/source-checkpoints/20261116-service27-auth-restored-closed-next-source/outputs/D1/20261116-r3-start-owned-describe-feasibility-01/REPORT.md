# 在原 start 作业内完成 genuine describe：只读接口可行性

结论：**接口可接，但 150 秒完整描述预算只能有条件成立，当前源码不能直接承诺可容纳。** 可在真实 C/ACK 后、成功 handoff 前运行原 genuine caller；不需要改 D1 C03、OP703、九字段授权或业务 key。必须把描述所用的真实窗口随结果保存并原样用于安装，同时保留原 start 失败清理。20 秒无输出超时不能证明 150 秒足够，也没有定位慢阶段。

本次只读本机源码并写此报告：未改 T45/DB/安装源码，未连接服务器/PG，未调用 native factory/issuer，未跑样本、旧测试、完整 hash、UID/时钟模拟。实际 27 启动、描述超时、stop 及恢复/网络状态来自主控本次委托，不在本报告冒称独立重测。没有创建未来时钟。

## 准确源码入口

T = `outputs/T45/revisions/20261116-r3-full-normal-chain27-local-01/CANDIDATE-02`。

M = `outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE27-FULLCHAIN-01`。

T/start/bundle/normal_service05_after08.py 当前 60,345 字节，SHA `34ca7fa5ae0f58cf7f8a5fe1e11f6af0ae076b33760c9281703def7f847f4a17`，距当前 65,536 字节消费者上限仅 **5,191 字节**。本次只核此必要小文件指纹，未核整树。若内联进程管理/存证后越界，不能只提高一处读取上限；宜复用现有明确钉住的 helper，沿既有 staging/mount 增加必要 source pin，保持主文件小于既有上限。最终实现大小尚未知，本报告不要求先扩上限。

| 项目 | 当前位置 | 最小接线建议 / 未证明处 |
|---|---|---|
| 插入点 | main L626 publish_worker_proof，L627–628 校验真实 retained ACK；L629–635 写成功 result/handed_off=True | 在 ACK 成功后、成功 result 及 handed_off=True **之前**描述并完整存证。不要挂到 inside guardian 长循环，也不要提前标成功 |
| 原失败清理 | main L636–640 finally → L715–733 record_start_cleanup → L386–418 close_start | 描述超时、解析失败、保护输出发布失败均应抛回这个 try/finally；handoff 保持 False。此时 ACK 已使 guardian retained=True，inside L243 的“五分钟未 retained”保护不再替代 host 清理，必须明确走 close_start |
| 工作时间 | main L33 HOST_WORK_SECONDS=190；L363–364 `min(deadline−monotonic, (a.expiresAt−now)/1000−110)`；L467 才创建 host deadline | 描述前核真实 work_left；150 秒 + 4 秒进程收尾 + 成功存证/末次身份检查 F，必须严格小于 work_left。现有 ACK 只要求 >5 秒，完全不足以保证这个新分支 |
| 300 秒外层 | 原登记 start job 300 秒；proof scope maximumStartOperationSeconds=300 | 190+110=300 是名义拆分，不是现成的额外150秒。main 在进入 host 前已读取/载入 carrier、authority/proof/main，外层预算已开始；若仍从 host 起190秒，不能静态证明完整110秒始终保留。可由 owner 将工作截止从主入口较早的 monotonic 起点统一向下约束，不能延后重置预算 |
| 清理余量 | close_start 内 root close 请求70秒、必要 docker stop10秒，另有多次 carrier/owned/mount/文件校验；close_failed_start 内等待 guardian 最多60秒，inside 原停止预算25秒 | 这些是源码超时上限/嵌套关系，不能全部简单相加或当已测耗时。110秒仍须覆盖实际外层剩余、进程收尾和原清理；本次不能证明最坏路径必在110秒内完成。未知清理仍保持 UNKNOWN，不能把 FAILED/到期当恢复成功 |

固定150+4秒的必要算式：若 ACK 前累计工作耗时为 A，忽略其他更紧的 expiry 上限，必须 **A + 154 + F < 190**，即 **A < 36 − F 秒**。没有本次可用的 A/F 实测证明；因此只能做剩余预算准入，或在余量不足时不提交描述并沿原清理退出。若改为“最多150秒”的动态短预算，也必须记录实际给予的预算，不能把短预算超时解释为已跑满150秒。不能提高190或挤掉110后仍声称原时间合同不变。

## 原生描述输入及后续重编译一致性

1. **有限 admin 截止已有可信来源。** main L550–563 已按 `a.applyRequestKey`、终端/hash、状态、停库清理等核验 apply 回执，并取 `applied.result.credentialValidUntilByRole`。从该已校验映射取 `erp35_admin_20261110_r3` 的整数截止，填 `backupAdminValidUntil`。不读私密密码，不以 start/service expiry 推算角色实际到期。现有 authority 有 apply 的定位与指纹，通常无需给 start authority 新造一个未校验截止字段。
2. **真实窗口仅取一次。** 在真实 C/ACK 后取真实 `t0=now()`，设 `installStartsAt=t0`，`installExpiresAt=min(t0+1_200_000, adminDeadline, C.sharedPostgresNamespace.serviceLeaseExpiresAt)`；优选在 caller 完成 source 加载后、target 工厂前取时，具体见末节。执行描述前仍核 host 余量，取时后再核安装窗。不要把 start `a.expiresAt` 作为安装窗：当前 M/issue_phase.py L63 签发它至多 now+900,000，无法支持描述后 inner 还严格剩900秒。也不要把 startsAt 放在未来来补回描述耗时。
3. **service 来自同一已发布 C/birth。** payload service 精确为 serviceKey、proofSha256、containerId、containerStartedAt、postmasterStart，用刚发布的真实 raw C、其容器 birth/physical 和同 hash retained ACK。调用已钉住的 boot root `batched161-run.mjs describe`，保留原 Linux root、Node/FIFO/环境约束，无 postgres/authority 密码输入。后继服务若换代，只同步准确 operational current key/pin，不能假造旧27 C。
4. **冻结输入和输出一起保存。** 同时存上述 payload 的三个时间数及 service、原生完整 descriptor/liveFacts 和其来源 hash。T/install/bundle/batched161-run.mjs L41–59 将这三个时间/同 C 送入 genuine target/compile，并在安装时深比较 descriptor。M/issue_phase.py L253–272 当前已从描述 d 回填 installStartsAt/installExpiresAt/backupAdminValidUntil。后续必须消费保存的值，不重取 now 改窗口；否则 targetSha/programSha 改变，九字段与 outer 会拒绝。
5. **C 保持原字节。** descriptor 放到独立保护输出，不能回填或刷新 C.checkedAt、C 内容/hash；否则先前 genuine program 所绑定的 C 会改变。源/原保护记录/模型/角色截止也必须仍相同且窗口未过期。当前时间只作重新准入校验，不是可以重新生成的绑定字段。
6. **deadline 命名保留原语义。** caller liveFacts 的 actualSharedServiceWorkDeadline 实际为 C 内 lease 再减35,000（caller L54）；旧 describe wrapper L77–81 另存 runnerConservativeWorkDeadline，并将实际 work deadline 回填为保护 C 内 lease。新输出/reader要沿此明确区分，不能直接把 caller 的减35秒值当 C 原值，也不能无记录地延长限期。可更保守地限安装 expiry，但必须在第一次描述前固定，后续全链消费同值。

**900秒签发约束没有因迁入 start 消失。** M/issue_upgrade_authority.py L65 要求 `d.startsAt <= now < now+900_000 < d.expiresAt <= adminDeadline`。20分钟最大窗下，如果描述实际用150秒，描述结束到签发可用的理论余量小于150秒；再扣进程收尾4秒、存证/reader导出/签发/运输，严格余量进一步下降。若 admin/C 截止提前，则更短。须在每次现行准入检查中真实满足；过期不延长旧窗，不自动重放。安装自身还会 genuine 重编译，成本并未被这次描述缓存消除，原700秒 child/780秒安装作业也须包住重编译和SQL/读回，当前20秒超时不能证明这部分耗时。

## 最小进程、输出与 reader 责任

- 在原 start host 同步调用既有容器 root wrapper，wrapper 独占 Node process group，最多150秒 communicate，TERM等待2秒、必要KILL等待2秒，确认回收后返回有限 JSON。Docker exec/host 包装必须为这个收尾留出额外运输/回收余量；只杀本机 docker 客户端不能证明容器内 Node 已回收。沿已存在受控进程管理方式，不 detach/后台运行，也不新增第8 job。
- 检查 native exit0、`PROGRAM_DESCRIBED_NO_PG_OR_WRITE`、databaseConnections=mutations=0、输出类型/边界及同 C/service、窗口与完整 descriptor；失败不发布成功。描述前后保留当前 C/ACK/容器 birth 一致性检查，不能以描述开始时还活着替代成功 handoff 时的事实。
- 可在 boot root私有目录以 O_EXCL 创建单独的描述 envelope/payload 文件（root0600或0400，单链接/不跟随符号链接）；一次 producer，partial 文件保留为失败证据，禁止覆盖重跑。无需把原生完整 descriptor 塞入原 normal-service-result，更不能塞入 C。成功 result 仅添加独立 leaf/hash/bytes/状态引用，使正常 result 仍受其现有65536读取上限约束。
- 原 reader 在 start COMPLETED 后按上述 hash/bytes 读取该保护输出并导出 descriptor/livefacts；必须明确各文件读取上限，旧 wrapper 允许 stdout131072不能直接套 reader 默认65536。保存原完整结果形状和 normalized deadline 语义供主控既有 issuer 使用。此 reader、注册 bundle pins、必要 helper staging 以及主控 source pins 的最终改动由各 owner 实施，本报告没有替他们改动。

无法证明处：20秒超时的慢阶段、150秒是否足够、ACK前实际耗时、重编译成本、异常进程回收和完整清理的最坏耗时、最终文件增量大小，以及后继真实网络/时钟/认证状态。以上均不因本次静态可行性分析变成 PASS。方案若按余量准入及原清理闭合，可保持既有授权与业务边界；当前不是无条件“可开下一窗”的结论。

## 补充：source 加载后才取真实安装窗

**源码允许，且可以不重复加载 source。** 这是与“调用前取窗”不同的优选接线，不是源码提速或慢阶段归因。

- 物化 source703 源 `outputs/T45/revisions/20261116-r3-service25-root03-source-local-01/source/scripts/release/unified-install/fresh35-combined-source-v1.mjs` L135–143 的 `loadFresh35CompactZeroSource(root,options)` 只取 root/reference options，组合和校验 genuine source token；没有安装 startsAt/expiresAt、当前 C 或 Date.now 参数。无需先有安装窗才能完成这次 source 加载。
- caller adb0 L39–40 已按顺序 resolve paths/load source。可仅在 `mode==='describe'` 分支、L40 后且 L41 genuine target 工厂前，使用原生 **Date.now()** 取一次 t0，以已校验的 input backupAdminValidUntil 和当前同 hash C 的 lease 计算窗口。随后仍把同一个 source token、currentServiceSha256 和这对真实时间交原 `loadFresh35Installed154UpgradeTargetV1` → compile → describe，不换普通 loader，不重载 source。
- D1 C03 target L310–329 没有限定 startsAt 必须等于调用者最早输入时刻或 postmaster birth；它要求整数时间、真实当前 `startsAt<=now<expiresAt`、最长20分钟、expiry受真实 C lease/admin截止约束，并验证 birth/C.checkedAt/当前根记录/真实品牌。compile L39–48 则要求同一 source、当前 genuine target、同 C/hash/admin截止。因此在 source 加载之后真实取窗满足接口，仍必须通过这些原约束，不需要改 D1 工厂。
- **安装分支绝不重新取窗。** `mode!=='describe'` 仍只从外部已签 outer 所绑定的 `p.installStartsAt/p.installExpiresAt/p.backupAdminValidUntil` 取值；用它们 genuine 重建 target/compile，再执行 caller L58 的完整 descriptor 深相等。不能把新取窗逻辑无条件放在公共路径，也不能只更新九字段而遗漏 outer.upgradeDescriptor。
- 输出按 genuine `d.startsAt/d.expiresAt/d.backupAdminValidUntil` 保存实际使用的窗口；外层最初请求若未含或含旧的窗口，不能直接原样称为“实际 payload”。保存 sourceSetSha256、targetSha256、programSha256、currentServiceSha256、同 service/epoch、successor 三元组和完整 descriptor/liveFacts，继续由原 issuer 与 install_authority 消费；原生返回的 d 才是最终时间依据。C 内容及 hash 不变。

收益边界：设 source 加载耗 S 秒、取窗后的 target/compile/describe 耗 G 秒，延后取窗可使20分钟窗不消耗 S，签发余量变为约 `300−G−收尾/导出/签发耗时`，而不是 `300−S−G−后续耗时`。**整个 start 工作预算仍消耗 S+G，150秒描述进程上限仍包含 source 加载。** 若 compile 自身吃满150秒，签发仅剩不到150秒及更短的截止裁剪余量，host190也仍需满足 A+S+G+4+F<190。此接线不能凭假设保证150秒足够、900秒余量足够或原清理必然完成；真实 G/慢阶段尚未测得。
