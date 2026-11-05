# 标准包导入：本地 Codex 操作说明

## 状态与边界

这是源码接线和操作路线，不是上线验收。整包写入、发布、失败回滚、重跑及独立对账尚未通过真实 PostgreSQL 端到端验收；完整浏览器应用也未完成真实浏览器验收。先在获准的独立合成数据库完成这些验收，再决定是否用于实际环境。不要连接生产或真实数据做试验。

本地 Codex 负责按原始资料清洗生成标准包、核对和备份。历史混合正负且含优惠的单据，只有原始资料足以确认退货及金额时才拆成销售和退货并保留原单追溯；不能自动把所有负数改成退货，也不能重复影响库存基线。工具不自动恢复整库备份或清理旧表。

## 1. 结构准备与环境

结构安装与业务导入分开。先查看安装输入和源码，不要把离线渲染当安装：

```sh
node scripts/release/unified-install/render-whole-package-local.mjs --output /absolute/new-private-bundle
```

该命令只生成源码及顺序清单，不连接数据库。自动安装需可信系统外层准备 root 所有、祖先与完整源码依赖树不可被其他用户写入且无链接的安装树、Node 和 PostgreSQL 17 `psql`。配置为 root 所有且权限 0600 或更严格。两种模式均只接受已由操作者确认可信的本机回环 `127.0.0.1` 或 `::1`、1024 以上端口，不自动建立数据库或账户。认证发生在目标 catalog 和物理身份核验之前，因此须在提供凭据前确认本机服务可信；物理 ID 核对不是认证之前的服务器身份验证。

配置必须明确 `host`、`port`、`database`、`psql`、`roleAdmin`、`owner`、`controller` 和 `runtimeLogin`。其中前三个账户对象各有 `user` 和 `password`；`runtimeLogin` 是独立的既有登录角色名，不是密码对象。四个身份互不相同。数据库所有者、控制器及运行登录角色须满足下述限制；不得把真实凭据放进源码或命令行。

先在经过授权的独立合成新空库验证：数据库名须以 `synthetic_whole_` 开头，并使用合成模式：

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /ABS/TRUSTED_ROOT_NODE \
  /ABS/ROOT_OWNED_INSTALL_TREE/scripts/release/unified-install/record-whole-installation.mjs \
  --install-reviewed-synthetic-config /ABS/root-private-install.json
```

由获授权的本地操作者在合成验收后选择、独立核实的可信本机**新空库**，可使用明确的本地模式；它不是原地升级，不会迁移已有 ERP 或退役旧表：

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /ABS/TRUSTED_ROOT_NODE \
  /ABS/ROOT_OWNED_INSTALL_TREE/scripts/release/unified-install/record-whole-installation.mjs \
  --install-reviewed-local-config /ABS/root-private-local-install.json
```

本地模式配置在共同字段外，必须加入事先从可信本机 PostgreSQL 独立核实的十进制字符串 `expectedSystemIdentifier`（集群 system ID）和 `expectedDatabaseOid`（目标数据库 OID）。数据库名须明确且符合小写字母、数字、下划线规则，不可使用 postgres 或模板库。程序核对目标数据库名、所有者、角色、PostgreSQL 17、两项物理 ID 和 `naijue_erp` schema 不存在；schema 不存在不等于程序证明整个数据库没有其他对象，操作者仍须确认这是符合要求的新空库。

数据库所有者须是既有普通登录角色，不得具有超级用户、CREATEROLE、CREATEDB、复制或 BYPASSRLS 权限。控制器与运行登录角色须按权限脚本的普通角色和最小权限前提审查，不得已有可绕过运行角色的 ERP 表、列或序列直接/继承权限，包含 PUBLIC 权限。角色管理员必须具备固定步骤所需授权；PostgreSQL 17 普通 CREATEROLE 新建角色会自动获得 ADMIN 成员关系，而该安装器拒绝这种关系，因此首次创建须由获授权超级用户执行，或预先提供属性正确且无成员关系的三个角色；不得自行绕开检查。明确角色准备和授权范围见 `tests/integration/WHOLE-PACKAGE-PG.md`。

安装按固定步骤执行并写固定安装记录；安装分阶段，失败可能已有阶段提交，须核查现场，不能盲目重跑。真实 PostgreSQL 上的这些安装和导入回滚流程尚未验收，不得描述为已验证的生产升级命令。
写入口要求安装产生的固定 root 所有安装记录和匹配的目标 catalog/角色条件。操作者必须安排从目录核验到导入完成期间无并发 DDL、角色及权限更改的维护窗口；`--ack-exclusive-ddl-window` 只是操作者确认，不自动取得排他锁。连接配置、初始化 scrypt 文件及所有报告和索引应仅授权操作者可读，私密文件模式 0600 或更严格。包、报告和 SQLite 索引放在受控私有目录，不允许并发替换或写入；当前实现不证明同一系统用户无法替换 SQLite 路径。确认目标和连接端可信后再提供凭据：连接发生在数据库 catalog 身份核验之前。

## 2. 本地登记与预检

本地清洗生成 REAL 包时，可先按源文件声明计算稳定批次；完成 READY manifest 后再次核对。登记绑定声明的源文件路径、大小、SHA 和截止时间，不证明历史来源真实性，也不是数据库写入授权。

```sh
umask 077
node tools/unified-import/cli.mjs source-registration --declaration /private/declaration.json > /private/registration.json
node tools/unified-import/cli.mjs source-registration --manifest /private/package/manifest.json --manifest-sha256 MANIFEST_SHA256
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-preflight \
  --package /private/package --manifest-sha256 MANIFEST_SHA256 \
  --report /private/new-preflight-report
```

报告目录必须是包目录之外的新目录；不得复用已有目录。合成包才加 `--allow-synthetic`。检查 summary 的 `complete_package_validation`、`checks_passed` 和问题数；`issues.jsonl` 给文件、JSONL 行号和字段。预检不连接 PostgreSQL、不写业务数据；它通过也不代表真实来源、目标权限或事务已验收。

可选的离线请求准备同样使用新报告目录，并在大包时选合批 profile：

```sh
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-prepare \
  --package /private/package --report /private/new-prepare-report \
  --manifest-sha256 MANIFEST_SHA256 --target /private/target.json \
  --admin /private/admin.json --registration /private/registration.json --coalesce
```

`target.json` 的精确字段为 `protocol`（固定 `STANDARD_IMPORT_SQL_V1`）、`system_identifier`、`database_oid`、`database_name`、`catalog_sha256`，值须对应受控安装记录及实际目标；`admin.json` 包含 `staff_id`、`account_id`、`login_name`、`staff_name`。不要从示例虚构真实身份或目标值。

`--registration` 只在所用包需要对应新来源登记时提供；合成包另加 `--allow-synthetic`。准备结果不是数据库执行许可。保留同一包、原初始化账号、原 scrypt、目标、登记和 `--coalesce` 选择，重跑不能换身份或 profile。

## 3. 同事务导入、发布与对账

在完成隔离 PG 验收、实际安装及上述维护窗口后，入口如下。它会重新预检，因此必须再给一个新报告目录：

```sh
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-import \
  --package /private/package --report /private/new-import-report \
  --manifest-sha256 MANIFEST_SHA256 --target /private/target.json \
  --admin /private/admin.json --registration /private/registration.json \
  --connection /private/connection.json --scrypt-file /private/encoded-scrypt.txt \
  --coalesce --ack-exclusive-ddl-window
```

`--registration` 为可选项；仅合成包加 `--allow-synthetic`。参数结构以源码及 `node tools/unified-import/cli.mjs stream-import --help` 为准。连接 JSON 的键为 `host`、`port`、`database`、`user`、`password`，可选 `statement_timeout_ms`；仅允许本机 `127.0.0.1` 或 Unix socket 路径。不得将密码或 scrypt 内容放在命令行、日志或公开报告中。

入口将本批写入及两阶段发布置于同一事务，成功提交后另开核对事务；对账结果在 JSON 的 `verification`，并输出源数量、汇总及批次相关结果。新增独立 `stream-verify` 入口用于重新预检原包，再调用受保护的数据库核对函数，将源数量及六项数量金额汇总与数据库导入证明比较。不能把 finish 汇总或 receipt 查询当作完整对账。

退出状态：0 表示提交或精确已提交重跑且对账和关闭成功，或 inspect 找到/未找到且清理成功；1 表示未开始、预检拒绝或已确认回滚等失败；2 表示结果未知；3 表示已确认提交但对账/清理需要处理，或 inspect 清理失败。以 JSON 的 `state` 为准：已确认 COMMITTED 不因后续核对失败变成回滚。没有完整有效 JSON、进程中断或输出管道故障时，也按结果未知处理。

未知提交时，用相同参数、原包与 profile，换一个新报告目录并加 `--inspect-only`。它使用只读事务及 ROLLBACK ACK，不执行导入；`COMMITTED_RECEIPT_FOUND` 是找到原回执，`ABSENT` 是未找到，`INSPECT_FAILED` 或 `UNKNOWN` 不可据此认定未提交。不得自动重试未知提交；先由本地 Codex 核对原批次及数据库状态，明确后再决定。找到回执本身不等于当前数据对账通过。

### 独立源包与数据库对账

使用原包、原目标、原初始化账号、原 scrypt、原登记及相同 coalesce 选择，给一个新报告目录：

```sh
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-verify \
  --package /private/package --report /private/new-verify-report \
  --manifest-sha256 MANIFEST_SHA256 --target /private/target.json \
  --admin /private/admin.json --registration /private/registration.json \
  --connection /private/connection.json --scrypt-file /private/encoded-scrypt.txt \
  --coalesce --ack-exclusive-ddl-window
```

可选登记及合成包参数规则与导入一致。此入口不调用导入、初始化、发布或 COMMIT；成功和失败均要求 ROLLBACK 回执。它复用经过版本绑定的 verifier，检查实际主数据、单据审计链及库存影响；客户端另外核对原包各表数量和六项精确整数/金额汇总。当前数量金额可能因已审计的正常业务操作改变，不强求恢复成原包数值。来源声明及哈希不证明原始真实业务数据正确，未知库存组合也不会补零或宣称全部库存已核完。

核对函数有 FOR SHARE 行锁及事务级 advisory lock，因此这不是 PostgreSQL READ ONLY 事务，也不是任意只读账号可执行的查询。连接仍需现有受控 controller 的 initializer/importer 切换资格，不能为运行核对擅自扩大权限。须遵守同样的独占 DDL/ACL 维护窗口；核对期间可能等待或阻塞相关业务写入，ROLLBACK 后释放事务锁。已检查当前函数及调用助手没有业务 DML，但安装版本及权限必须由本地核验，不能向未知函数版本调用并据此宣称无写入。

失败结果的 `code` 区分数量、金额、覆盖范围、协议回执等类别；数量或金额不符时 `field` 只显示预定义表名或汇总名，不输出源行、实际金额、数据库错误原文或凭据。数据库异常统一为 `VERIFY_DATABASE_OR_PROTOCOL_FAILED`，由本地在私有日志中诊断。

退出 0 只表示 VERIFIED 且连接和本地清理成功；1 表示预检/核对失败；2 表示 VERIFICATION_UNKNOWN；3 表示核对通过但清理失败。BEGIN 或 ROLLBACK 回执不确定时弃用连接，不盲目重试。进程中断或没有完整 JSON 也按未知处理。该新增入口已做合成协议测试，尚未在真实 PostgreSQL 验收，最终类型检查仍由本地 Codex 执行。

## 4. 已测规模和未测事项

一次真实离线合成大包测量含 475,710 行，其中单据 427,458 行、库存键 42,227、主数据 6,025；输入约 504 MB，准备出 1,295 个请求（含 INIT），零预检问题。128 MiB V8 堆限制下总计约 239.1 秒，进程峰值 RSS 约 361.6 MB；preflight 约 113.4 秒，计划及程序约 86.0 秒，主数据游标约 0.1 秒、库存约 7.4 秒、单据约 32.2 秒。这是离线合成测量，不是数据库吞吐或事务验证；后续来源登记的局部修改只做了定向测试。实际大包、磁盘占用、数据库性能及所有成功/回滚/发布失败/幂等用例由本地 Codex 在授权隔离环境验证，结果应另行记录。
