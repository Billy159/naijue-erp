# D1 安装接口接线矩阵

结论：26 实际冻结安装调用与 D1 CANDIDATE-03 接口在源码层对应，未发现本段新增的调用名、参数、授权字段或成功结果消费冲突。不是原生执行通过；26 在启动容器前失败，安装和真实业务导入未执行。27 尚未收到最终冻结源，不能沿用本结论冒称 27 已闭合。

核对范围仅为安装接口段；未改 T45、主控或 D1 运行源码，未执行 root factory、issuer、harness、数据库、服务器、时钟/UID 模拟或旧 SQL/模型套件。已通过的 SQL、模型与 703 源码闭包复用。

## 绑定版本与路径简写

- T = `outputs/T45/revisions/20261116-r3-service26-pin-closure-local-01`；PHASES26 = `2963a542d6d5532d3ab46a82be0c73b8039c047d402d981b7282c649ea4d13b3`。
- D = `outputs/D1/20261115-r3-real154-install-host-01/CANDIDATE-03/source/scripts/release/unified-install`；候选 PINS = `b394bdd961c95f26df6c2f73e69b930c5e9b735a033f45d15c23ca4902d4c094`。
- M = `outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE26-REUSE703-01`。
- HOST = `/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3`。
- STATE = `/var/lib/naijue-erp/fresh35-production`；OP = `STATE/installed-real-operation-batched-root03-20261116-01/operation`。
- JOB = `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261115-01`。
- BOOT26 = `HOST/state/native-services/t45-first-r3-native-service-start-20261116-26`。
- capture = 原保护安装记录的 `target.proposal.workspaceDirectory` + `/batched161-upgrade`，不由新外部参数指定。
- compact source `70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e` / 已有物化回执 `cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec` 只复用，未重新遍历或计算整树。

## 实际接口、读写与消费

| 段 | 实际接口与输入 | 读取/写入与唯一责任 | 下游消费及拒绝条件 | 本次证据 |
|---|---|---|---|---|
| 描述入口 | T/describe-install26-readonly.py → BOOT26/batched161-run.mjs `describe`；FIFO 输入 service、backupAdminValidUntil、installStartsAt、installExpiresAt | 读取已有 roles/start 回执、保护 C26 与物化证明；这里只产生本机 DESCRIPTOR/LIVE-FACTS 回执，不建安装目录、不建 PG client | 26 boot/start/install 使用同一 caller 字节；Linux root UID/EUID/GID/EGID、Node 24.21.0、固定参数及无环境连接配置；branch 在载入授权、driver、mkdir 前返回 | caller L19–55；describe 脚本 L35–88；小文件指纹见 EVIDENCE.json |
| 源与 root target | `resolveFresh35ReferenceInputPaths(fixed references)` → `loadFresh35CompactZeroSource(OP,paths)` → `loadFresh35Installed154UpgradeTargetV1({source,currentServiceSha256,startsAt,expiresAt,backupAdminValidUntil})` → `describeFresh35Installed154UpgradeTarget(target)` | 已有 OP/reference 为输入；root record reader 只读 `/etc/naijue-erp/fresh35-combined-installation-v1.json` 与 `/run/naijue-rewrite/current-production-service.json`，均不生成 | 原记录 SHA 4ed444 固定；C 对应同记录/源/目标；模块在 genuine source 内；新 target 私有 brand，不能用普通对象或普通 target 替代。普通 record reader 的非 root 约束保留 | D/record L86–124；target L307–343；caller L26–44；本次只读源码 |
| 当前 epoch/窗口 | target 重建历史 metadata，实际 physical 用 C；`assertFresh35Installed154UpgradeTargetCurrent(target)` | 保留原 proposal/ordinary 和历史输入；当前 C 的 SID/OID/PG17.11 与旧库同一，postmasterStart 用真实 C | birth ≤ C.checkedAt ≤ now；startsAt ≤ now < expiresAt；新窗 ≤20分钟且不超过 C lease 或 backupAdminValidUntil；compile/run 反复重读源、原记录、C 身份 | target L310–343；installer L39–48、110；不是现场 epoch 实测 |
| 编译与三元组 | `compileFresh35Batched161Upgrade({source,target,paths,currentServiceSha256,backupAdminValidUntil})` → `describeFresh35Batched161Upgrade(program)` | 读取原 12 层顺序/SQL 与 DB05 原 SQL，原事务字节不变；只计算 genuine program，不执行 SQL | 同一个 source/target；descriptor 包含 successorSourceSetSha256 / successorCatalogSpecSha256 / successorModelSha256，三项纳入 program SHA；caller 直接从该 descriptor 投影 batchedCatalog，不另造模型 | installer L39–67；caller L45–55；复用原 SQL/模型结论 |
| 主控九字段 + outer | M/issue_upgrade_authority.py `issue(description_file,pin,live_file,pin,review_file,pin,outdir)`；T/install/bundle/batched_install_host.py `validate(a,at)`；`loadFresh35Batched161UpgradeAuthorization(program)` | 主控独占签发九字段；T45 从 outer 的 innerAuthorityBase64 校验 hash，再 O_EXCL 写 BOOT26/authority-61035/fresh35-batched161-upgrade-v1.json → 原 authority mount 的 `/etc/naijue-erp/...`；Node 读取本投影旁 install-authorization.json | 九字段闭集 format/decision/programSha256/sourceSetSha256/targetSha256/startsAt/expiresAt/independentSafetyReviewSha256/authorizationReference；program/source/target/窗逐项相等；outer hash + JSON 深相等、完整 descriptor 深相等；root inner 私有/不跟随链接；一次性 brand + attempt 防重放 | M issuer L25–94；host L31–63、103–131；caller L56–59；installer L69–77 |
| 已有输入与新输出 | host `main()` → `private_admin()` / `h.current()` / `h.child_run()` | 已有输入：policy26、start terminal/result、lock capacity、物化回执、finite admin 私密配置。新输出：host 建 `HOST/state/batched-install26-private`（父可已存在但须 root0700）、KEY/scratch（必须新建）、JOB/native-private、inner leaf；O_EXCL 写 caller/outer。Node **唯一**创建 capture 目录（非 recursive），D1 只校验既有 capture 为 root 私有规范目录后写 attempt/catalog/commit/completion | describe 不创建 capture；capture 已存在会 mkdir 失败，不自动复用/覆盖。旧安装输入绝不作为新输出重建。host current 校验 C26/container/epoch/retained ACK/start 回执/实测容量，再执行 child | host L76–138；transport L76–101；caller L72–75；installer L105–109、136；现场目录存在性未实测 |
| 原生连接与身份 | 固定 driver → `new Client(...)` → `connect()` → `runFresh35Batched161Upgrade({program,authorization,client,recordDirectory})` | caller 独占连接及关闭；固定 admin 配置经 FIFO 私密输入；D1 不创建账号、不要求 owner 可登录 | 初始 session_user=current_user=admin、role=none、native idle；SET ROLE owner 有 SET/idle ACK；同连接 current_user=owner、session_user=admin；ownerGuard 校验同 SID/OID/db/version/epoch/address/port、库 owner、admin OID10/有限 validUntil、owner 属性、唯一连接、无 prepared xact | caller L60–76、99–126；installer L80–102、111–145；本次无原生连接 |
| 13事务与目录读回 | D1 run：observe154 → 12层 → observe155 → DB05 → observe161 → RESET ROLE → completion | capture 内新写 attempt.json、catalog-154/155/161.json、connection-identity.json、commit-01..13.json、completion.json；原发布函数不覆盖。每层保留原 BEGIN/COMMIT | 每层实际原生 BEGIN/COMMIT + idle ACK；catalog observation 原始值校验完整模型，ROLLBACK ACK 后存证；RESET ROLE SET/idle ACK 后才发布 completion；未知 COMMIT 不自动重放；不因 compile/staging 通过认定安装完成 | installer L118–155；caller L76–85；仅源码路径，未新增 SQL 实测 |
| 故障、复位、关闭 | D1 catch → caller catch/finally → transport reap → host public result/return | D1 有活动事务时只尝试 ROLLBACK，idle 时只一次 RESET；failure.json 写失败也不能变成功。caller finally end，超时 destroy 并保持未确认；host 仅在子孙回收确认后删除自己 inner leaf | COMMIT_OUTCOME_UNKNOWN / INSTALLED_CAPTURE_INCOMPLETE / STOPPED_NOT_COMPLETE 分开；public UNKNOWN 和非0出口不放行。成功必须 lifecycleConfirmed、reaped、状态完成、CLOSED、roleRestoreAcknowledged；有限账号恢复/停库仍由 T45 外层负责 | installer L156–162；caller L86–96、129–134；transport L99–139；host L133–162；没有模拟故障或伪造 ACK |
| 交接 writer | caller result 带 batchedCatalog → host 保护 result → writer `installed(a)` | JOB/results/batched-install-result.json 与 original root/public terminal 是 writer 的已有前置输入；主控 outer expectedBinding 绑定相同三元组 | writer 核 terminal COMPLETED/0、result hash、同 service/source、完成状态、CLOSED、role restore、batchedCatalog 与授权一致；三元组源自同一 compiled successor。writer 后续授权/执行文件名由 T45 单独修复 | caller L83–85；host L142–154；T/writer/bundle/batched_real_host.py L120–129；未执行 writer |

## 具体问题和未闭合项

1. **已证实的 26 启动问题，T45 所有**：T/start/bundle/r3_05_runtime.py L13 的 PROOF_PROJECTION 仍指 `HOST/authority/r3-service-24-worker-proof`，L129 无条件 mkdir。26 在容器前失败，不能因本安装接口对应就重用旧轮或宣称已安装。T45 正在集中修复运行路径；本报告未修改。
2. **已由 T45 报告的 writer 文件名冲突，T45 所有**：生产 writer-authorization.json，Node 消费 retained24-authorization.json。这里仅记录跨段已知依赖；未重复验其 writer 全链。需由 T45 最终冻结修复并由整体同版复核消费。
3. **27 最终源尚缺**：T45 明确下一轮会更新 current-service 固定键并给最终小差分。须把 describe/boot/start/install 同字节、外层 policy/issuer/service/physical/deadline 与新投影路径绑定到同一实际 27；当前矩阵明确只绑定 26，不签发授权、不创建假 C27。
4. **现场事实保留未知**：capture 规范路径、目录 absent、实际 native driver 状态 API、admin/owner/epoch、13次 ACK/三次 catalog/RESET/close、真实 inner 删除及外层恢复，均须实际执行回执提供；本次无现场证据，不记通过。源码中的拒绝路径和证据要求已列，不另增演练或验收门槛。

D1 本段无新增运行代码修复建议。待 T45 提供最终 27 差分，仅核受影响引用；整体同版矩阵交 QB 沿既定分工收口。
