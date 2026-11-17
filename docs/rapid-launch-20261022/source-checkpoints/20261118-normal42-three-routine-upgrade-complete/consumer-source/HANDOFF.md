# Ordinary42 三函数维护：SOURCE-only

本轮仅源码。新五键、各phase scope/全部成员指纹与字节数、900s之外的原维护phase预算以及Main接口见 INTERFACE.UNISSUED.json / PHASES42.UNISSUED.json。Apply→Start→Upgrade→PreserveStop→Restore，各300/300/780/120/300秒，原parent5100/Main注册7参数/phase8参数不变；本轮没有签发、现场fresh、CAS、PG、Node或APP动作。原业务writer不进入本后继。

准确新键：
- apply: t45-r3-ordinary42-auth-apply-20261117-01
- start: t45-first-r3-native-service-start-20261117-42
- upgrade: t45-r3-settlement24-three-routine-upgrade42-20261117-01
- stop: t45-r3-ordinary42-preserve-stop-20261117-01
- restore: t45-r3-ordinary42-auth-restore-20261117-01

根底座为实际122/ec3b5573…，D1独占122→127，仅上述五键；保全全部122旧键/三guard/旧41失败和rollback02成功。Root/Main最终source尚待，consumer不得自行登记或运行。政策固定 direct42-batched-real.json / T45_R3_NORMAL42_BATCHED_REAL_V1；adapter在原任何loader/state/network前精确核同一format及五phase，无兼容旧format旁路。

三个实证修复与必要身份接线：
1. Upgrade原retained-stop停在SERVICE35/NAME35/PROOF35/HOST_BOOT35，现两份stop/upgrade support统一未来42服务/证明/boot。未知C42/epoch42/证明SHA/临时角色值/票据/窗口均保持未产生；必须由未来真实Start42证明及genuine describe绑定，不能搬41的C或证明。
2. Stop41曾误用e99/8f等旧helper指纹，真实41为18a77/c736。42没有机械沿用41值，而是从最终42的r3_05_readonly.py、normal_service05_after08.py及proof源码字节派生所有边：两support READONLY_SHA/NORMAL05_SHA/PROOF_SHA，stop STOP_REFERENCE，auth CURRENT_SOURCE/CURRENT_PROOF_SOURCE和各bundle依赖全部闭包一致。最终三指纹见stopLiveHelperBindings。
3. Work严格为proof.sharedPostgresNamespace.serviceLeaseExpiresAt，outer严格为startAuthority.serviceLeaseExpiresAt，outer-work=35000；ACK和normal result使用work，窗口上限使用对应outer，不能令两者相等。原proof.work_deadline算法保留，transport/current与preserve context新核精确差值，根fresh/Main须按interface.leaseSemantics同义消费。

公开proof按实际root:root0444/nlink1/regular/canonical分类，随后按公开读法和精确实际SHA/内容/同C合同核对；不关闭private flag全局，不chmod现场，不放宽原/finite快照及私密文件。范围限新support/transport/preserve/restore与41历史证明固定读取点，所有原私密读取保持。

最新真实成功启动是41/Ccbf，前序关闭是guardian cleanup9b53，原认证恢复是rollback02成功terminal2be/root915/cleanup59d/safe8458。新prior_closed41.py明确返回service41与SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED；scope不再用previousStopRequestKey，替换为previousGuardianClosureReason；动态9个字段见previousStartBindings，previousStopTerminal/Result已移除，用restoreCleanup/SafeReceipt替代。Stop41/Upgrade41/rollback01均准确保留FAILED2，绝不造成功Stop。旧39/40验证实现以closed40_history.py和successful39_history.py逐字复用；41 original/finite/applied只核已实际观察并最终保全的stat9，不读取或摘要其body。新42使用独立custody/capture/projection目录，不动41。

Root08实际物化SOURCE marker5bb与terminal e884直接复用；SQL daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184、三routine替换/驱动/CHILD/事务前后与COMMIT ACK/独立READ ONLY/UNKNOWN收尾原样；native仅REQUEST/START/INNER三静态身份改变。before实体626是既有证据，本轮没有新PG核验；H01 installed历史cf27/9f/626与current compile-before6ef/实际target spec保持分开，after仍ada8，不把旧41已过期descriptor或本次源码编译当真实PG升级。

67项仅本次受影响SOURCE检查通过：五键及预算/实物成员依赖、typed41闭合、44读取、work/outer差值、角色和容器生命周期AST、SQL和native静态身份差异、原CLI authority/phase_argument/execute AST、受影响Python语法。没有重跑旧Node/SQL91/H01/规模/46/25/23或已有真实PG。SOURCE通过不等于注册、SQL执行、业务验收或上线。

原41/rollback02全部证据保持，认证恢复总RESULT79836b98…位于原ORIGINAL-AUTH41-ROLLBACK02-EXECUTION-PREPARATION-01/runtime/rollback/RESULT.json，旧hard false仍如实保留。后续仅在QB准确source delta+Main具体新作用域、必要真实fresh及外部签发后由T45唯一server owner执行；D1负责根端。当前READY仅冻结交付，未授权未来实际动作。
