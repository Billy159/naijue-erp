# Fresh35 本轮组合安装实现

## 范围与状态

本轮只新增 `scripts/release/unified-install/fresh35-combined-{source,target,catalog,lifecycle,record}-v1.mjs`，并组合独立的 35 厅、历史金额 SQL 后继。不重写整套 V2，不调用旧 177/178 安装器，不先创建历史表再删除，不修改任何旧固定拒绝入口、旧 capture pin、旧 record 或旧 host。

已实现的是可审阅的实际安装代码路径、严格输入/目标约束、完整应用事务、结构后置条件、真实原生客户端调度、失败状态和独立 record 发布。**没有执行 PostgreSQL 语句、建立目标、创建凭据或发布安装记录。** 离线测试、SQL 字符串生成和同源比较都不是 PostgreSQL 解析或引擎验收。

## 不可混用的来源

1. 固定前驱：`fresh35-install-review-plan-20261105-r2/01-schema-REVIEW-ONLY.sql`，SHA256 `5fc8508ea96062898a42dc4c03c3a6ebe166158037cc6c7c3130a13d3ee14931`，含 35 表/152 例程的源码投影，不是已经建成的 35 表数据库。
2. 原 r2 的 180 source pins 完整保留。当前 0236 应用/stream 修改及新增模块另列 `currentSourcePins`、`currentSourceDelta`，不把当前文件 hash 写回原 capture。
3. 35 厅后继只修改 `sales_header.hall_id` 可空及两个保留例程，不调用已经省略的 `history_sales_header`/`guard_history_insert`，也不套用旧 `guard_header_native_reference_publication` 前驱。
4. 金额后继严格接在厅后继后面。`whole_command` 两步 pin 必须连续，净变化是五个既有例程。金额/厅均不增加表、列、例程或 ACL 类别。
5. 完整模型来自另外固定的 `expected-catalog-model.json`，字节 SHA256 `2469ff8fb09dfe06c4992e31f8fa5aa85f462fae20d0c5490cee3082a921e28f`。原 178 `functions.json` SHA256 `9959bca2dd4d91d3fb1ba7558c5abdd0b70676b096eaf73c4dd117261534551f` 只作为定义模板。每个 35 基底函数都先独立核对其完整 definition hash，再应用精确后继。

当前源依赖闭包自动收集相对静态/字面量导入，另含 package/lock 文件。实际使用的 native pg 必须是 8.23.1，Node 必须是 24.21.0。应用模块、记录发布器及目标模块加载时的字节也绑定到 source pins，避免旧缓存代码冒充新磁盘文件。

## 一次安装的顺序

外部主控在本轮具体许可和独立审查成立后，先提供全新本机隔离目标及已经连接的 owner 原生客户端。库、角色、HBA、凭据和进程建立不在本模块内，也不属于应用事务原子性声明。

1. `loadFresh35CombinedSource(root, {baselineDirectory})` 固定前驱和当前源差异。
2. `bindFresh35CombinedTarget(...)` 绑定提案、实测 system ID/DB OID/启动时间、原始开始与截止时间。该 API 的输出本身不是物理观察证明，实际客户端随后仍逐项复核。
3. `buildFresh35CombinedCatalog(source, target, {modelPath, functionsPath})` 构造独立新版本目录模型。
4. `compileFresh35CombinedProgram({source,target,catalog})` 只产生私有程序对象。不是安装记录或批准。
5. 受信主控提供固定 OS 保护授权文件，由 `loadFresh35CombinedAuthorization(program)` 读取。普通解析函数或 caller JSON 无法产生私有执行能力。文件必须由已经确认授权及真实独立审查的外部流程提供；本实现不会生成该文件，hash 本身不证明审查来源，更不能覆盖任何平台拒绝。
6. `runFresh35CombinedInstall({program,authorization,client,journalDirectory})` 独占一个原生 `pg.Client`，持久化单次消费标记，然后在一个 READ COMMITTED 事务中执行：空目标约束 → 直接 35 schema → 27 条真实 lineage → 厅 → 金额 → 完整后继目录约束 → 同一物理目标复核 → 同会话随机 nonce/事务 ID/实际目录采集 → COMMIT ACK。
7. 只有真实 COMMIT ACK、实际目录校验及客户端关闭均确认后才产生私有 completion。`publishFresh35CombinedRecord` 接受该 completion，不接受外部填写的 JSON；发布到独立固定 record，不覆盖旧记录。运行时 host 仍未接线。

执行组件必须预先部署在真正受保护的源/运行时目录，并由外部可信启动流程在加载 Node 代码前确认。**本工作副本不是已部署受信启动环境，不能通过 chmod、临时 ACL 或自行造审批文件让它冒充。** 本轮没有实现新的 provisioning/受信 pre-Node launcher，也没有重用旧 sales launcher 来绕开其边界。

## 目标、ACL 与目录约束

- 仅 `127.0.0.1`，显式新数据库及四个不同临时登录，三个固定 NOLOGIN 接口角色；拒绝已知已停实例 ID。
- owner/controller/runtime 必须普通角色、NOINHERIT、连接上限 2、到期时间不超过原 20 分钟窗口。admin 的 bootstrap 超级用户能力明确保留在提案中，不称普通账号。
- controller 仅有 initializer/importer 的 SET 权限，runtime 登录仅有 runtime 接口 SET 权限；不得有 ADMIN/INHERIT 或额外角色成员关系。
- PUBLIC 不得有数据库 CONNECT/CREATE/TEMP；非 owner 显式数据库 ACL 仅限预定 controller/runtime CONNECT。
- public schema 必须是 PG17 默认的 `pg_database_owner` 所有、PUBLIC 仅 USAGE；不得有额外对象、CREATE 授权或其他用户 schema。其他 public 策略需要独立新 profile，不能用宽松匹配兼容。
- 普通 owner 必须能取得真实 `pg_control_system()` 身份；若权限不足，安装拒绝。任何必要的精确单函数权限应在环境审查中明确，不能临时扩大为 pg_monitor/pg_read_all_data 来通过测试。
- 后置条件核对 35 表、351 列、152 例程的 body/完整定义/owner/ACL、326 约束、111 索引、570 触发器、150 relation 元数据、351 列 ACL、4 序列、32 策略、default ACL、27 条 lineage 和业务表空状态。数量不代替完整集合对比。
- 原 capture 未采集的完整 raw pg_type 属性仍标明缺失。新增检查在运行时把每个 composite/array 类型的所有非身份字段与同一个 PG17.11 的原生表类型模板对比，并独立核对 70 个精确名称/owner/ACL/双向关系；真实 raw 类型及依赖全部采集。不伪造先前缺失的观察。
- 依赖检查拒绝越界用户 schema、旧表和未声明对象。动态 SQL、延迟解析和业务依赖是否可执行仍需要独立引擎测试，不能由目录比较推定。

## 失败与记录边界

- COMMIT 前普通错误：只尝试一次 ROLLBACK，ACK 成功才记 `ROLLED_BACK`。失败单列 `ROLLBACK_UNCONFIRMED`，保留原错误。
- COMMIT 已提交但 ACK 未确认：`COMMIT_OUTCOME_UNKNOWN`，禁止任何后续 SQL（包括 rollback）和自动重放，只关闭该客户端并保留诊断。
- COMMIT ACK 后日志或记录发布失败：保留 `COMMITTED_UNPUBLISHED`；记录已链接但目录 fsync 失败则 `PUBLISHED_DURABILITY_UNKNOWN`。不能称回滚成功。
- 固定授权文件的 `.consumed` 保留跨进程一次性消费事实，故障后不自动删除或重新使用。
- journal 固定在已绑定目标 workspace 的 `installation-journal` 子目录，拒绝任意 caller 路径；祖先必须 OS 受保护，持续核对目录身份及 0700，并以 NOFOLLOW/EXCL 打开文件。当前工作副本和 `/tmp` 测试 fixture 不满足实际 root 部署要求。
- 记录不会声称凭据已撤销、集群已停或业务验收完成。当前 completion/receipt 的 `credentialsRevoked=false`、`clusterStopped=false`、`hostEnabled=false`、`businessImportVerified=false` 是明确未完成项。

## 验证与下一步

专测涵盖闭合目标字段、getter/伪造对象拒绝、精确源和后继链、旧门禁不变、owner 映射、全目录检查生成、事务顺序、正常失败/回滚失败/未知提交/提交后日志失败、授权数据不能冒充受信能力。测试里的物理 ID/时间仅为 fixture，不是观察值。

尚须：独立审查新增程序及完整权限；可信 pre-Node 部署/启动；获得本轮新目标的具体许可；新实例实测身份和普通 owner 权限；实际 PostgreSQL 安装/目录/失败回滚；所有路径的凭据撤销和唯一自建进程干净停止；重新连接读回、重放、权限反例及普通业务验收；独立 runtime capability 和 host 接线。

新厅/金额 SQL 的安装不等于旧 runtime reader 已接受其函数 pin。旧 published-migration reader 的严格 pin 不在本轮安装器中放宽。未知仓 `SOURCE_REVIEW` 也不是现 inventory_mode 合同，不能伪装成已发布 DOCUMENT_CONVERSION。

## 后续隔离执行源码候选

新增 pre-Node/TCP bootstrap/guardian/bridge 见 `fresh35-isolated-execution-20261105.md`。这只是尚未独审/未运行的独立后续候选，前述已通过回归不能替它背书。root 是本项目受信 record 路线条件，不是已证实的平台对所有隔离结构测试的通用要求。最低权限非 root 路线仅作范围分析，没有新增绕过授权/guard 的执行入口。
