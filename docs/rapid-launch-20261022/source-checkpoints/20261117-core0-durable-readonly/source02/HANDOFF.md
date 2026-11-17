本交付仅为源码准备，尚未登记、签发、启动容器或执行 PostgreSQL。原 writer `t45-r3-batched-real-execute-20261115-01` 保持 FAILED，禁止重放。既有停止和原认证恢复证据不改写为本次诊断结果。

本次只准备一个固定入口 `t45-r3-core0-durable-readonly-20261117-01`，复用已经实际执行过的 `ordinary05_roles.py:180` 单用户机制和原始控制通道，不启正常服务、不建库或角色、不读取密码/pg_authid。控制 Python 可在原隔离镜像内以 UID0 进行生命周期管理，PostgreSQL 子进程固定 UID/GID61035；日常业务程序不改变运行用户。

`bundle/durable-readonly.sql` 固定为 BEGIN REPEATABLE READ READ ONLY、一个 SELECT、ROLLBACK。没有 COMMIT、DDL、DML、COPY 或业务函数执行；无动态 SQL、SQL/DSN/角色/回调参数。单用户每个物理输入行是一条语句，worker 将固定 SELECT 的排版折叠成一行，原始固定文件摘要仍由 scope 和 registry 双重绑定。

查询对象与输出：

- 原 root operation `7e820f8b-0770-9773-6249-9999b0e0d758` 的存在/COMMITTED计数及 batched marker 存在布尔；不取 actor、请求体或结果体。
- 原失败 subBatch `a8d40958-8f80-afdb-e60a-5f2ff5ddc115` 的持久回执/COMMITTED计数，只选择 descriptor 的这一个固定 ID 作为过滤条件。
- 原 namespace `naijue:tplus:20261102`、manifest `7ebdac46…78679` 的批次数、IMPORTED/完成计数、固定 baseline/document 批次存在布尔、namespace绑定记录计数。没有原始单据、资金、金额或 source_refs。
- 原模型列明的35张 naijue_erp 表 COUNT，含业务、导入和运维表；user_account/staff 仅计数，不取首管理员或任何身份值。
- 当前表/列/索引/函数计数与三项实际 `pg_proc.prosrc` SHA256。只对比当前 old before：command cc11ea59…；migration 50818878…；verify 8e490d4a…。old model626仅为历史期望引用，未重算整个 canonical catalog，也不把新 ada8/a5f/aef 当现库。

查询事实足以继续判读首 CORE 批次，但程序不会把零 completed、某个零计数或已有管理员行自动解释成“整库0写”；原有 provision 或其他既有状态须由 Main 对照。

生命周期和物理边界：

- 固定 R3 PGDATA dev66304/inode13502421/uidgid61035/mode0700；SID7706545564479176741、OID16393、PG170011。先核原39 FAILED/STOP/RESTORE终态、两role已原值恢复、原39与维护容器都停止、无其他操作/备份、端口和postmaster.pid不存在、28GiB底线。
- 原 worker 的全局 execution.lock 由 dispatcher 父进程持有；worker逐项核其身份和内核FLOCK。再持有既有 service-operation.lock，直到本次自己的容器和进程清理完成。
- 复用镜像6de44f43…，network none/无端口，根文件系统只读；原部署二进制只读、自己的bundle只读、仅原PGDATA读写。原输入、plan、writer记录、备份和sdc不挂入，也不删除。三个必要控制cap沿原维护机制，PG子进程固定降至61035。
- **PGDATA必须可写。单用户启动/关闭、控制文件、WAL或hint等可能产生物理写；0业务DML不等于0磁盘改动。** 本方案不许诺磁盘零修改，不运行恢复/克隆或变更角色。
- 上限300秒含清理：host工作210秒、保留90秒清理；inside180秒内，单用户查询160秒超时，PG statement_timeout120秒。固定子进程组结束、核无遗留后再次读取pg_controldata确认干净关闭；失败/超时不推断成功。host只停自己的实际CID并读回running=false/pid0和原PGDATA/端口停止，保留失败现场。未来CID/StartedAt只在真实create后记录，无未来C/epoch假数据；单用户无postmaster epoch。

准入源码与实际命令：

1. `read_registration_basis.py` 是未来原私域 root 通道的有限metadata入口；本轮未调用。另复用原 `read_stop_restore39.py restore …` 取得真实fresh停止/原auth恢复basis。Main issuer要求两份basis都在2分钟内；旧35fa回执不能单独充作fresh。
2. Main完成窄源码审查后，才调用 `main_issuer.issue_once(review_file, review_pin, fresh_restore_basis_file, fresh_basis_pin, fresh_registry_basis_file, registry_basis_pin, authorization_reference)`。函数本轮未调用，输出固定Main目录的实际一次诊断authority、独立5分钟CAS authority和15分钟phase policy，不生成角色或秘密。不能自然到期替代清理。
3. `register_exact.py` 是原packet/shared-lock/CAS发布机制的这个唯一key后继。准确host ENTRY为 `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-core0-durable-registration-source-20261117-01/register_exact.py`，唯一argv为Main实际 registrationAuthority SHA，stdin为其 `registration-packet.json`。**仅原已授权私域 root CAS通道可stage/调用，当前并无执行授权。** 绝不调用旧39 registrar或借211/SRC7。先保全原dispatcher与publish intent，模块/新单key policy后发布dispatcher；未知只读原AUDIT，不重放、不自动撤销已发布事实。
4. `patch_dispatcher.render` 以最后实际记录 eabf 为CAS底座，把107个保护键加这一个键至108，保留三处原guard；旧函数AST只允许 execute 中的这个分支变化。old normal38/39、ROOT07和已消费writer键均保留。模板 `DURABLE_CORE0_POLICY_SHA256=None`，未绑定实际政策就拒绝。未来fresh发现底座变化必须报精确差异，不能静默换底座。
5. Main实际CAS和原键无占位检查后，仅运行 `python3 <本目录>/diagnostic_cli.py prepare`，再在明确执行授权内 `python3 <本目录>/diagnostic_cli.py run`。该入口没有任意key/path/SQL/role参数；固定读Main已签发目录，使用原08954 client/42943 loader的原parser、collect_bundle_files、原request constructor和原main。准确argv为 `run --task T45 --job-id t45-r3-core0-durable-readonly-20261117-01 --source-dir <本目录>/bundle --script durable_readonly_job.py --timeout-seconds 300 --output-dir <本目录>/runtime --phase-arg <Main实际authoritySHA>`。bundle仅三固定源码+实际host authority。一个本机intent和原client/server原键约束阻止重放；结果未知只读此诊断原键，不能重跑writer或新key重导。

本轮验证仅有：Python AST/路径检查、固定SQL的只读语句范围检查、原dispatcher AST差异及三guard保留、冻结bundle pin一致。没有用假authority、未来CID或数据库fixture伪造准入/运行成功。真实PG语法、single-user输出/权限、clean shutdown、最终runtime receipts尚未验证；必须由后续实际有限授权完成，不能将SOURCE准备写成durable或业务通过。

仍未满足：独立窄源码审查；真实fresh停止/认证/Root基础；Main实际签发；原通道真实stage和CAS回读；准确原诊断键未提交确认；Main单独实际运行授权。当前PG保持既有停止状态，本交付没有调用任何服务器、PG、容器、issuer、登记或提交入口。


SOURCE02 narrow correction: preserve SOURCE01 f983 and its NEED_FIX review. F01 adds --no-trunc only to the exact-name creation-uncertain cleanup; strict full-ID/name/image/operation/network ownership checks remain unchanged. F02 validates both actual basis bodies/hashes/identity metadata and preloads all static bytes before Main takes its single clock sample, then checks both ages <=120s. Seven-argument API, original unused diagnostic key, 300s CAS/900s purpose and all fixed SQL/target/locks/permissions are unchanged. This successor is not source-review PASS and performs no server/PG/issuer action.
