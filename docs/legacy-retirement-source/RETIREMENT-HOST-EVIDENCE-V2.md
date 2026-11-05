# Fresh35 新178前驱证据 V2：源码合同，未注册可信证据

## 用途和边界

此合同准备**当前最终源码对应的新178前驱结构采证**，用于后续178→35编译。它不是35目标目录格式，不能把35的dump当作178前驱输入。V1固定证据、loader和postconditions均未修改；V2不是重标V1。新目标建议名为 `synthetic_schema178v2_20261104_r1`，原停止实例和旧临时身份不得复用。

当前只有纯源码渲染、本地源绑定和调用方文件的一致性校验。即使合成模型通过，也只返回 `CONSISTENT_UNREVIEWED_CANDIDATE`。完整metadata语义、真实执行来源、并发DDL排除、正式源冻结、独立ACL/安全审查、安装、可信record及host admission均未通过。`loadReviewedFresh35EvidenceV2` 无条件拒绝，不接受调用方approval、registry或环境变量替代未来受审静态pins。

本轮没有运行SQL、连接PG、创建身份或执行显式零库存独立安全复核。导出SQL仍需要独立采证计划授权和审阅。

## API

`fresh35-catalog-evidence-v2.mjs`：

- `createFresh35EvidenceV2SourceBinding(root)`：读取genuine retirement plan、现有安装来源闭包和显式追加的全部Fresh35目录模块、host及CLI诊断入口；输出深冻结、私有brand的本地source binding。当前声明范围为177 pins，包含公开CLI全部72个本地模块的显式闭包，不声称整个仓库快照或外部运行时完整。绑定前驱source spec、退役sourceSet、installation sourceSet、完整声明的sourcePins和两份固定查询SHA。最终冻结认证始终false。
- `validateFresh35EvidenceV2Candidate(binding, {manifest, files})`：只读内存文件；验证前后均重读声明的本地源码，防止沿用已变更源的旧brand。校验字节、严格JSON、来源一致性、上下文和派生文件一致性，不执行或解析dump语义，不返回可传给旧renderer的证据对象。
- `loadReviewedFresh35EvidenceV2()`：固定抛出 `FRESH35_V2_REVIEWED_PROFILE_NOT_REGISTERED`，甚至不会读取调用方参数。

`fresh35-catalog-evidence-v2-query.mjs`：

- `FRESH35_EVIDENCE_V2_CONTEXT_SQL`：仅观察会话、物理身份、实际设置和可见snapshot。
- `FRESH35_EVIDENCE_V2_INVENTORY_SQL`：仅读取目录及完整原始定义/ACL/依赖；不执行应用例程或旧权限gate。
- `FRESH35_EVIDENCE_V2_DEPARSER`：精确调用形式。约束和trigger为双参数`false`的新V2合同，不能称原V1显式使用这些形式。
- `renderFresh35EvidenceV2CaptureSql(exportedSnapshot)`：安全验证exported snapshot字面值后，生成固定RR READ ONLY事务，导入snapshot、固定设置、先context再inventory再context、最后ROLLBACK。返回SQL文本，不执行。

## 候选文件合同

`files`是精确12个文件的原始UTF-8字符串或Uint8Array映射，不是任意目录的扫描结果：

- `inventory.sql`, `context.sql`, `capture.sql`
- `schema178-naijue-erp.sql`
- `inventory.json`, `functions.json`, `objects.json`, `acl-and-roles.json`
- `dependencies.json`, `shared-dependencies.json`
- `capture-context.json`, `source-target.json`

manifest为JSON文本，精确键为`format, sourceBindingSha256, files`；format=`FRESH35_PREDECESSOR_EVIDENCE_CANDIDATE_V2`，files按文件名升序，每条精确`path, sha256, bytes`。所有文件必须匹配原始字节；捕获SQL必须匹配固定源码渲染。单文件上限32MiB、总计96MiB、manifest128KiB、JSON深度64；拒绝重复键、无效UTF-8、不安全数值、重复/额外/缺失路径和字节差异。

functions/dependencies/shared-dependencies必须分别等于inventory中的同名来源集合；objects必须精确投影relations/columns/constraints/indexes/triggers/policies/extensions；ACL文件必须精确投影roles/memberships/default_acl/database_acl/schemas。这些是内部一致性检查，空合成集合仍可能一致，不代表完整真实目录或178例程验证通过。

## capture-context 精确结构

根字段为`format, exportedSnapshot, before, after, deparser, dump, exporter, inventoryWindow`，format=`FRESH35_DEPARSE_CONTEXT_V2`。

before和after必须与inventory.context完全相等，字段为：

- identity：`system_identifier, database_oid, database_name, owner, actor, current_user, server_version_num`。actor为session_user，current_user必须同owner；本合同仅支持PG17及`synthetic_schema178v2_`命名的新合成前驱库。
- `backend_pid`：实测十进制字符串。
- `transaction_started_at`：`extract(epoch from transaction_timestamp())::text`原字符串。
- `server_address`与`server_port`：实测IPv4 loopback地址和端口字符串。地址由`pg_catalog.host(pg_catalog.inet_server_addr())`输出，保持精确裸IP表示；不是对调用方JSON做宽松归一化。本计划固定127.0.0.1，不支持远程或Unix socket fallback。
- `visible_snapshot`：`pg_current_snapshot()::text`实测值。它不是exported snapshot ID，不能混用。
- settings：精确实测 `server_version_num, server_encoding, client_encoding, search_path, quote_all_identifiers, standard_conforming_strings, transaction_isolation, transaction_read_only, session_replication_role, DateStyle, IntervalStyle, extra_float_digits, TimeZone`。

固定设置为UTF8、pg_catalog、quote_all_identifiers=off、standard_conforming_strings=on、repeatable read/read-only、origin、ISO, MDY、postgres、3、UTC。查询返回实测值，不以计划值代填。

exporter字段为`backendPid, visibleSnapshot, exportedAt, closedAt`；keeper必须不同于inventory backend，可见snapshot相同。inventoryWindow为`startedAt, finishedAt`。dump字段为`serverVersionNum, toolVersionNum, toolSha256, exportedSnapshot, options, startedAt, finishedAt`。两个窗口都必须在keeper导出到关闭之间；时间为UTC ISO字符串。core仅验证这些**声明**互相一致，不能认证进程或时间真实。

dump精确options子集为`--schema-only, --format=plain, --quote-all-identifiers, --schema=naijue_erp`。dump与inventory是不同进程/连接：dump的quote-all选项不表示inventory会话也启用。dump工具与服务端版本须相同。

## 还必须由独立采证计划保留的外侧证据

下面内容不在core候选校验范围，不能因返回一致就宣称已验证：

- 最终完整源码快照manifest、编译运行时和所有采证脚本/工具字节；实际执行前后source核验。
- 精确实际argv、经审核的净化环境、工具版本/哈希、退出码、stdout/stderr、整个实际capture SQL字节及其hash。
- keeper实际exported snapshot返回值、传给SET TRANSACTION SNAPSHOT及pg_dump的输入；受控进程生命周期及导出有效窗口。
- dump前后独立连接的物理target核验，并明确它们不是pg_dump自身会话的直接观察。
- 独占新合成目标、无并发DDL的证据。RR snapshot相同本身不保证deparser在并发DDL下稳定。
- 原子安装/commit acknowledgement、精确178 routine body/spec匹配、业务空集、完整schema与目录/ACL审查、凭据撤销、停库和无残留进程证明。

只有真实采证完成、全部证据独立审阅、最终源码明确冻结后，才可新增独立可信V2 profile及固定pins。不得把本地source brand、JSON声明或候选manifest自升格为可信证据；也不得用此过程绕过受限安全复核。

## 本轮测试

新测试为独立合成模型，不是实库结果。覆盖source scope/冻结brand、旧renderer拒绝、新reviewed loader固定拒绝、源或artifact修改、错误/缺失实际设置、backend/事务/snapshot变化、keeper提前结束、dump版本/options变化、跨文件矛盾、SQL字节更改、重复JSON键/无效UTF-8/溢出数字/过深JSON及精确capture SQL顺序。旧V1代码和host固定拒绝保持不变。

2026-11-04源码验证：V2定向14/14通过，合并既有host/schema-diff模型测试36/36通过，无skip。独立review提出的BOM字节归一化、微秒/非法日期比较、inventory输出类型/标识数值范围问题均先复现为失败回归再修复。源码与测试hash：

- V2查询模块：`079fc287d44fef3692e4c11608dc3847dd8b7f0edf60394982f291b680c71198`
- V2候选校验模块：`513380206f31529704beaf7c10cff6cea2c60d4066feeca4c9773a6e5966408b`
- V2测试：`52907ff025fd9a7684f27f53678fa20d210676a51cf84ad7d8bd08757cbbda05`

这不是最终source冻结声明。18:41 UTC的只读来源检查还检测到并行任务对`whole-package-sql-kernel.ts`的正常修改，因此当前前驱source spec已经由18:11时的`1252b538…`变为`1eac7cde…`。新合同会绑定实际来源并拒绝旧brand继续使用，未来采证必须等待所有相关任务完成并独立冻结，不通过修改旧V1 pins来消除差异。

18:46 UTC独立复核完成：14/14模型测试及额外13个攻击性输入反例全部按预期通过/拒绝，未发现新增源码阻断。结论仍仅限离线候选一致性，不背书实际PG来源或执行。


## 22:50 UTC 公开准备入口依赖补齐

旧160项声明只绑定了入口和结构闭包，没有覆盖`stream-prepare-cli.mjs`及全部公开CLI的实际本地依赖。当前新增16项，合计176项；不是通过沿用旧binding或改写旧证据消除差异。`FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES`显式列出71个公开CLI本地模块，`sourceScope`改为`STRUCTURAL_AND_PUBLIC_CLI_LOCAL_SOURCE_CLOSURE_NOT_WHOLE_REPOSITORY`，descriptor增加`publicCliSourceScope`，说明根入口、模块集合及未由本合同认证的外部运行依赖。

两个独立TypeScript AST核查分别确认：从`cli.mjs`/`cli.ts`递归有71个本地文件，从全部绑定的JS/TS文件递归有96个本地代码文件，缺口恰为下述16项。静态import/export、type import、literal dynamic import都纳入；未发现不定值import。91个显式SQL/源码数据路径以及相应package manifests已经在原绑定内。

新增路径：

- `packages/application/src/unified-import-execution-v2-client.ts`
- `packages/application/src/unified-import-master-chunks-v2.ts`
- `packages/authentication/src/passwords.ts`
- `packages/authentication/src/ports.ts`
- `tools/unified-import/execution-client.ts`
- `tools/unified-import/execution-v2-admission.ts`
- `tools/unified-import/package-reader.ts`
- `tools/unified-import/source-registration.mjs`
- `tools/unified-import/stream-document-requests.mjs`
- `tools/unified-import/stream-master-graph.mjs`
- `tools/unified-import/stream-package-metadata.mjs`
- `tools/unified-import/stream-prepare-cli.mjs`
- `tools/unified-import/stream-typed-hash.mjs`
- `tools/unified-import/whole-package-client.ts`
- `tools/unified-import/whole-package-inspect.ts`
- `tools/unified-import/whole-package-reconcile.mjs`

`tests/fresh35-catalog-source-closure.test.mjs`使用独立TypeScript AST，不执行被检查的模块。它检查真实递归依赖与声明集合、整个绑定代码集合、固定数据资产；逐个移除16个新增文件时构造binding必须失败；逐个变更已绑定字节时旧brand必须拒绝；prepare入口及深层依赖变化必须改变binding digest。它还验证新增未列依赖和不定值import会被闭包回归发现。以后增加依赖必须重新跑闭包核查与独立审阅，不能仅手改计数。

TypeScript5.9.2仅用于离线测试，不是V2生产模块或PG执行依赖。若在冻结快照重跑该测试，应单独固定其package.json和lib/typescript.js的字节，并禁止回读live测试工具。Node内建模块、pg及其依赖、操作系统工具/二进制与输入包、approval/target/admin/SQLite/report等运行时文件，不被这176个仓库来源pins认证；执行器仍须用独立环境与输入证据约束。源覆盖完善不等于公开导入路径或Fresh35 host已获准运行。

22:52 UTC本轮复核完成：新闭包5项、与V2/host/schema-diff合并41/41通过，无skip；独立另跑37/37（含接收端诊断），并独立AST核对71项无遗漏。对r3完整快照比对，176项中175项字节相同，仅V2主模块来源集合/范围变更；candidate/refusal逻辑、query/host/V1基线保持不变。新主模块SHA256=`353bd5c8097c50b361723b6a4d383557dd408074785a792245bc3c941a40501b`；闭包测试SHA256=`60121c471f7b7ef91fa3da7699d3ee9c53ea2a1144bcd746766ac9d2a8e7dcdb`；当前binding digest=`29e6f96255ba46e9b7888001a1c0b148e52d216070611172170603951dd51f6f`。完整pins、16项delta和测试工具manifest见 `/workspace/shared/fresh35-v2-public-closure-review-20261104-2250/`。它仍不是最终执行源冻结或PG准入证明。


## 2026-11-05 00:25 UTC 来源登记共享模块补入

来源登记修复新增`packages/application/src/unified-source-registration.ts`，供整包编译和公开离线准备入口共用。旧176项证明没有覆盖这个新模块。先运行既有AST闭包回归，明确因新模块未绑定而失败，再只在V2公开模块常量补入该路径；不改查询、上下文、可信loader、host、candidate校验或拒绝逻辑。

实际AST闭包为公开CLI72个本地模块、全部绑定代码97个本地模块；source pins由176增为177。新模块没有引入新的外部运行时依赖。闭包回归把它纳入缺失、旧brand漂移及新digest变化负例，连同前一轮16项一起保护。四个已有来源登记模块的变更另计入实际字节hash，不覆盖或重标旧证据。

当前source绑定值分别为：

- predecessor source spec：`88db01d978e0777d4f8a6fa4ca0d0918d80832cccf9300bb3ff5148b2990a86e`
- retirement source set：`f46aad202a4fb5c2365d2e83632f8036e44bea561139a5b9a5c9938ae4cf9e66`
- installation source set：`e8d85950136e4ed68ef7aea05e46c0bffc251db19ece688093dbcda36e402f54`
- V2 binding digest：`a18584a477537dc3cb9ceecd948cecbb588b5b68f83ebd79910abef5c0568b05`

以上不是同一个hash，不能互换，也不是最终执行许可。V2主模块SHA256=`f91471c11826e131fb9ce66b665283e578457c110a83c9923a4d5e21982b441d`；闭包测试SHA256=`3966bc3517078a6f61dbee9490eced1c8d8fcff21067bd46bb15e286f6aff198`。完整新pins和相对r5差异保存在 `/workspace/shared/fresh35-v2-registration-closure-review-20261105-0024/`。本轮不连接PG或创建身份。

00:26 UTC独立复核完成：我方组合41/41通过、无skip，安装源码闭包定向1/1通过；独立6组测试51项中47通过、0失败、4项既有前驱证据目录依赖测试跳过。独立重新计算r5的176/71/96与当前177/72/97一致；所有新增登记候选hash匹配。结论只涵盖本地源码闭包和离线拒绝行为，不是PG就绪或执行授权。


## 2026-11-05 01:25 UTC 严格地址表示修复

r6的真实初始身份输出保留在旧证据中，`inet_server_addr()::text`返回`127.0.0.1/32`，与既有精确裸IP比较不符。PostgreSQL文档说明text(inet)保留掩码，而host(inet)只返回主机地址文本：[PostgreSQL17网络函数](https://www.postgresql.org/docs/17/functions-net.html)。因此仅在新的V2 context查询中把`pg_catalog.inet_server_addr()::text`改为`pg_catalog.host(pg_catalog.inet_server_addr())`。inventory内嵌context及capture的前后context从同一表达式派生，保持一致。

validator仍要求`server_address === '127.0.0.1'`，没有加入CIDR、前缀、其他loopback地址、IPv6或字符串容错。新增回归同步修改before/after/inventory中的地址，12个不精确值仍被连接身份检查拒绝；旧SQL即使重新计算manifest hash也不能通过新固定查询检查。先运行失败回归再修源码，保留原r6文件与失败证据；本轮没有启动或重连PG，也没有修改旧profile/可信loader/host或发行门禁。

这次177个来源pins中只有query模块字节改变，集合未增删；predecessorSpec仍为`88db01d9…a86e`，installation sourceSet仍为`e8d85950…2f54`，但V2 binding必须更新为`3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6`，不能复用r6旧binding。query模块SHA256=`c64d105ec3c0b8ad346cf14f65bfb13f4885ccb27c53795ad56aedb037c0affc`；V2测试SHA256=`21864cc9945766dea7af138ef26b1ef3967d28e4e47f232b7b8c9bdef2669688`。完整新pins和差异在 `/workspace/shared/fresh35-v2-context-host-review-20261105-0124/`。后续只能经新计划审阅后使用全新目标，不复用旧实例或旧身份。

01:25 UTC我方及独立复核均44/44通过、零失败/skip。独立逐项对照r6的177 pins，只有query模块的一处表达式变化，其余176项相同；validator与所有拒绝门保持原字节。该结果不证明新查询已在PG执行，仍需新的独立采证计划。
