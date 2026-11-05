# 新 35 组合的隔离执行与停止候选

## 状态和归因

本轮新增 `launch-fresh35-isolated-v1.py` 和 `fresh35-isolated-entry-v1.mjs`。它们是**尚未独立复核、未执行的源码候选**，不是启动授权或已建立的验证环境。没有启动/连接 PG、生成口令、创建角色/数据库、读取现存口令、写保护授权或发布 record。

root 保护部署、保护授权和 journal 是本项目新增“受信安装/发布 record”路线的工程条件，借鉴既有受保护 record 合同。它不是已证实的平台对所有隔离 PG 测试的通用要求。普通用户的结构试验可以采用不同的证据等级，但不能因此获得受信 record、host 准入或重试被平台拒绝的操作。

当前环境 uid=1000，源码、工作区和 Node 24.21.0 均由 agent 拥有。它不满足这条 root 路线。候选不会通过 chmod/chown 既有源码、改变系统权限、创建 OS 用户或自造审批文件来使其满足。

## 从 178 事实继承什么

已读原 178 r7 的 run.py/common.py/watchdog.py，以及真实 r2 的 server-command.json、owned-process.json、identity.json、cleanup.json 和 HBA。原真实目标是 `127.0.0.1:57628`、`synthetic_schema178v2_20261105_r2`，system ID 为 `7704494445995372557`；其 cleanup 分别记录口令文件删除、登录撤销、干净停机、PID 和端口消失。本候选禁止该端口、旧 system ID 和旧目录复用。

复用的是 TCP 127.0.0.1、无 Unix socket、短时登录、明确环境、PG 工具字节、PID/starttime/exe/listener 绑定及独立监督停止的技术方法，不是复用批准、凭据、数据目录或实例。Node 改用本轮已指定的 24.21.0，字节 SHA 为 `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`。

## 已实现的受信候选路径

- 固定 Linux 部署 `/opt/naijue-erp/fresh35-combined-v1`，可信 OS Python 以 `-I -S` 启动。加载 Node 前核对 root 所有者、所有祖先、无链接、无组/其他写入、无 POSIX 扩展 ACL、完整部署文件集合和每文件 SHA。Node、PG 二进制和 libpq 另有精确 pin。完整 PG 安装树及 share 文件需由外部受信部署流程提供。
- 外部先提供保护的部署清单和本次环境创建授权，程序只读取。授权明确新的 DB、四登录、端口、工作区、既有专用非 root PG UID/GID、原始不超过 20 分钟时窗、源码集合和审阅引用。代码在生成口令前写入不可覆盖的一次消费标记；该标记不是授权文件。
- 只在新 `/var/lib/naijue-erp/fresh35-isolated/cloud-pg-fresh35-<date>-<run>` 下创建数据/证据/口令路径。新工作区为 root 所有且仅遍历可达，PG 数据目录和 initdb 私有输入归指定服务账号；PG 从不以 root 运行。不会改已有文件的权限或所有者。
- 独立 guardian 必须由仍活着且 PID/starttime/exe 匹配的本次主控以固定模式创建，核对原授权的一次消费标记，并以不可覆盖的 guardian-started 记录拒绝再次启动；它在口令生成/initdb 前就绪；父 EOF、信号、deadline 或进程退出均进入清理。新实例仅监听 `127.0.0.1`，禁 socket。HBA 仅允许 admin 连接 postgres/新 DB、owner 连接新 DB；controller/runtime 和其他地址、角色、socket 均拒绝。
- bootstrap admin 新建三个普通受限 LOGIN 和三个固定 NOLOGIN，精确三条 SET=true/ADMIN=false/INHERIT=false 成员边。新 DB 撤销 PUBLIC 权限，controller/runtime 仅 CONNECT。仅 owner 在新 DB 获 `pg_catalog.pg_control_system()` 的 EXECUTE；不授 pg_monitor、pg_read_all_data、CREATEROLE 等宽泛能力。
- 读取真实 pg_controldata system ID、PID 文件/目录/端口、admin SQL identity 和实际 HBA 解析结果。新 DB OID、版本和启动时间从新实例取得。身份数据只是绑定输入，后续 owner 同会话 guard 仍逐项复核。
- `--describe` 只编译当前 source→hall→amount 的真正 program。产生真实物理目标和 program 描述后，等待外部提供既有固定 `fresh35-combined-execution-v1.json`，直到原期限的清理保留区。不会创建该授权，也不会把描述输出当批准。
- `--execute` 使用同一 genuine authorization / native pg / application transaction 实现，保留所有 guards 和旧固定 RAISE。完成仅保留 `COMMITTED_UNPUBLISHED` 描述，不发布 record、不启 host。不能把新隔离实例停止后的描述当在线安装记录。
- 所有退出路径交 guardian：再次核 PID/starttime/exe/listener 和 system ID 后，按四个精确名字撤销 LOGIN、PASSWORD NULL、过期；只对自身直接创建且未回收的 PG 子进程作有界 SIGINT/SIGQUIT/SIGKILL。不会扫描或广杀其他 PG，也不重启。逐文件清口令不被撤销/信号失败跳过。离线 pg_controldata 精确 system ID + shut down、PID 消失、端口消失、口令目录空分别保存；任一不确认就是失败，不能称 clean shutdown。

应用 COMMIT 不包含 cluster/角色/CREATE DATABASE。未知 COMMIT 不重放、不借清理重新发应用 SQL。硬杀只是一条失败收敛尝试，不保证干净停机；若子进程或监听仍在，结果明确 `FAILED_OR_CLEANUP_UNCONFIRMED`。

## 对原被拒操作的可确认对照

原始平台调用、目标和拒绝参数没有取得，不能判断所有同类动作已放行或都被禁止。仅能引用已有工程转述：

- `/workspace/shared/schema178-v2-plan-20261105-r7/PLAN-DRAFT.md:41` 将受阻项描述为“显式零库存信任边界独立安全复审”，排除负面攻击、权限探测，并说明 178 inventory 是纯目录投影，不调用应用例程，不把权限/零库存 boolean gate 混入采集成功。
- `/workspace/shared/fresh35-install-review-plan-20261105-r2/ENVIRONMENT-PLAN.md:98` 禁止把该安全复审改名为目录、后置条件、权限探测或改变执行者重试。
- 同一环境计划第 4 节 D 允许拟议“正常安装 guard”进入**未来受审计划**，同时明确不可混入旧完整 gate 或受阻显式零库存安全探测。这段文档不是当前执行许可。

本候选拟执行的 SQL 分别为：

1. admin bootstrap：创建本次角色、DB、三条成员边、数据库 ACL 和 owner 的单函数 EXECUTE。
2. admin 身份/HBA：只读 system ID、DB OID、数据目录、端点、启动时间及 pg_hba_file_rules。
3. owner 应用事务：物理/空目标/角色 ACL 安装前置 DO；直接 35 schema、27 lineage；厅/金额函数后继；完整目录结构/ACL 对比 DO；同物理目标 DO；只读目录 JSON 与事务 nonce；COMMIT。
4. admin 收尾：限定本次角色的 NOLOGIN/PASSWORD NULL/过期；随后唯一自建进程停止。

没有业务包导入、显式零库存业务校验、攻击/越权反例、应用业务例程调用或旧完整 gate。但第 3 项含 ACL/权限作为安装条件的判断；仅凭“结构验证”的名字不能认定它与被拒权限探测不相交。执行前须由有权审阅者对具体 SQL 和上述转述判定范围；若仍不能区分，保持不运行，不换名字、工具、执行者或环境尝试同一安全复核。

## 不发 record 的最低权限路线：仅评估，未实现新执行入口

178 的普通用户 TCP 路线在技术上可以承载一个全新、无真实数据、限时的结构试验，不必取得本项目的 root record 权限。它应明确标注“普通 UID 隔离结构观察”，不能抵御同 UID 恶意进程，不能发受信 record、保护 registry 或启 host。

但新 35 的 SQL、权限变化和完整后置条件不同于旧 178，旧批准不覆盖。更换为普通 UID 执行不解决上述安全复核范围不明。当前没有为绕过 root 授权新增直接运行 SQL、删 guard 或仿造 completion 的入口。下一步应先冻结后继/源和本轮具体 SQL，再确认其是否属于新的独立结构安装操作。

## 当次确认需要的精确范围

实际启动前，需要提供**一个具体目标**，而不是“任意新库”：新目录、127.0.0.1 的具体未占用端口、DB/四 LOGIN 全名、原始开始/截止时间；现有专用 OS UID/GID（如采用 root 路线）、PG/Node 工具和全部源 hash。单次批准应明确：

- 创建全新 isolated cluster 和短时 bootstrap 超级用户，以及三个普通 LOGIN/三个 NOLOGIN。
- 本次 HBA、成员边、数据库 ACL 和新 DB 内 `pg_control_system()` 精确 EXECUTE；不改变已有 cluster/系统网络策略。
- 受审的 35 结构安装与只读 catalog capture；不含被拒零库存安全复核、业务/攻击测试、真实数据、旧表删除、host/record 或 push。
- 无论成败撤销四个本次 LOGIN、清理临时口令、停止唯一自建进程，保留无秘密证据；提交未知不重放。

授权不等于实际平台允许，也不能覆盖明确拒绝。项目保护文件仅承载已成立授权的绑定，不能自己证明授权来源或平台放行。若目标、SQL、权限或风险发生变化，应重新处理变化部分。当前没有请求任何实际启动，也没有生成当次授权文件。

## 未完成项

新增执行器尚待独立逐行复核。当前只有离线模型、源码解析和 Node 专测；没有 PG 解析/安装/回滚/清理实测，未取得 root 部署或真实物理目标。独立复核尝试因协作并发上限未启动，不能记为通过。普通 UID 方案仅作范围分析。现 SQL 链仍为厅→金额；若未知仓 SOURCE_REVIEW 后继获准实施，必须重新构造真实 schema/例程/约束/RLS/ACL 模型，不能仍宣称 35/152 原模型直接适用。双 pg_dump/导出 snapshot 及后续业务验收不在新增执行器中，不拿事务内 catalog JSON 冒充这些证据。

## 父进程硬杀时的 initdb 回收修复

原候选把 initdb 放在主控 subprocess.run，留下主控被 SIGKILL 时的孤儿辅助进程缺口。现改为主控仅发送 INITIALIZE，guardian 在任何 initdb 创建前启用并验证 Linux 本进程 child-subreaper；失败就不创建 initdb。guardian 直接 Popen initdb 并在执行期间监视父 EOF、信号及原期限，EOF 优先于同刻退出0，不发送初始化成功确认。

先停止并回收精确的直接 Popen 子进程，再从 guardian 自身的 `/proc/<pid>/task/<pid>/children` 取得真实已收养子进程。每个待处理 PID 必须仍以 guardian 为 PPid，SID/PGID 均为本次 initdb 的会话，四个 UID 一致且为指定服务账号；活体 exe 仅可为部署的 initdb/postgres 或 OS /bin/sh 的实际目标。僵尸不要求已消失的 exe 链接，而是对仍未回收的自有直接 child 执行 waitpid。没有按全 UID/进程名杀进程，也没有 killpg。

这些直接子 PID 在 guardian 回收前不会复用；没有其他线程/等待器并发回收。每次停/reap 后重新枚举，覆盖 shell 消失后进一步收养的 postgres --boot。正常 initdb 返回也必须确认没有遗留后代。身份读取/等待/信号失败或期限耗尽均保留未确认，不把失联当退出；异常后本轮保守停止进一步进程操作，未保证仍能处理其余后代。

回收尝试先于逐文件口令清理；即使回收失败仍尝试清文件，但 `initializerReaped`/`descendantsReaped` 独立为 false，`cleanupComplete` 不得转 true。父端只在 guardian 确实退出后才重试文件清理，避免与活动 guardian 竞争。`initialization-result.json` 和 `cleanup.json` 保存独立状态。纯 mock 已覆盖上述成功/失败分支，未启动任何子进程或调用 prctl。

该修复限定“主控死亡而 guardian 仍可运行”的故障模型，不声称 guardian 自身也被 SIGKILL、OS宕机或内核拒绝信号时仍能完成回收。root 部署仍未具备，真实 PG/进程/HBA 清理验证仍未运行。

2026-11-05 本缺口独立复核已完成：32项纯mock、外层禁止真实进程/信号/waitpid/subreaper/凭据操作的tripwire重跑32项，以及两文件AST和前后hash均通过，未发现本修复阻断项。此结论仅覆盖initdb所有权与回收修复，不替代整条root启动器的部署验收、PG真实测试、平台执行许可或任何SOURCE_REVIEW最终安全审查。
