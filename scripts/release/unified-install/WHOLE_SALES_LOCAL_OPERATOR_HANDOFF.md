# 本地主控 / 本地 Codex 交接：历史 sales 整包导入

## 当前完成边界

源码已实现版本化 sales 发行器、受信安装记录加载与现库验证、非流式 `whole-import`、流式 `stream-import`、独立 `stream-verify`。PG 工作流已有独立 SQL 级验证，具体结果以对应冻结快照和原始日志为准。这不等于本机已经安装，也不等于正式发行器或真实公开 CLI 已完成端到端验证。

旧 `initialize` / `apply` 是另一套逐步调用语义，仍不能冒充当前整包后继。普通完整包应使用 `whole-import`，保持一次事务；大包用 `stream-import`，仍由同一整包协调器提交。不要删除 source-only 拒绝、改 profile、伪造 admission 或把原始 catalog JSON 变成 trusted record。

## 本地主控先做什么

1. 只读确认选中的仓库及 WIP、最终源码清单和目标环境。保留全部工作区，不 reset/clean，不跑 typecheck/build，不把云端已验证环境当本地环境。
2. 核对实际主机 OS、运行用户、Node、PG17 psql、可信部署路径及两种固定记录是否存在。不得为通过检查自行创建记录、改权限或把 scratch 目录作为 root 启动源。
3. 当前源码已新增原生 Mac 固定部署映射，见下节。尚无 Mac 实机/特权验收，不能把云端mock测试说成本地已通过。Mac也可调度已有经授权的隔离Linux环境，但不能用UID映射、挂载伪装或修改门禁假装真实root部署。
4. 区分授权阶段：可信软件/源码部署、安装数据库后继及其两项已审核 ACL 收紧、真实业务包导入，是不同操作范围。只执行用户实际授权的阶段；密码用现有安全交接，不写入聊天、命令参数或输出。

本次云工作区只读检查为：Linux，uid=1000，Node v24.22.1；`/opt/naijue-erp/whole-sales-v1`、`/usr/bin/node`、`/usr/lib/postgresql/17/bin/psql`、两种固定安装记录及私有 installer config 均不存在。因此此环境不能直接运行正式 root 发行链。不要让用户做无意义的重复业务确认；先由主控检查其实际已授权部署环境是否具备这些条件。

## 安装阶段

按同目录 `WHOLE_SALES_INSTALL_V1.md` 操作。必要输入为真实原177固定记录、匹配的现库、已审源码和依赖闭包、固定 Node/psql、private root config，以及实际独占 DDL/ACL 管理窗口。

全新隔离库须先走原177阶段。Mac命令：

```sh
/usr/bin/python3 -I -S "/Library/Application Support/NaijueERP/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py" --install-reviewed-original-local-v1
```

它只调用原官方installer和固定 `/private/etc/naijue-erp/whole-original-install-config-v1.json`，要求绑定确切物理ID、PG17、普通owner和全新无应用schema目标。配置字段及账号隔离见安装说明。数据库/账号/必要数据库权限需已在授权范围内准备；不是由此命令任意开库或给权。写入前普通owner必须能够只读取得真实物理ID；若返回 `INSTALL_OWNER_PHYSICAL_ID_UNAVAILABLE` 则停止，不自行GRANT、不省略cluster核对。00/02现在各自事务内先核验cluster/db/actor；01保留原多事务，但同一连接首写前核验，禁止连接切换。原177的00→01→02仍并非全局事务，任一步失败均停住核查，不自动重试。成功并产生真实原记录后，才进入sales后继。

已有真实原177环境直接进入后继。Linux后继命令：

```sh
/usr/bin/python3 -I -S /opt/naijue-erp/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py --install-reviewed-sales-v1
```

上方是Linux后继命令。Mac后继命令为：

```sh
/usr/bin/python3 -I -S "/Library/Application Support/NaijueERP/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py" --install-reviewed-sales-v1
```

Mac固定Node为 `/usr/local/bin/node`，PG17为 `/Library/PostgreSQL/17/bin/psql`，记录/config为 `/private/etc/naijue-erp`。所有祖先和源码/依赖须root-owned、无symlink、无group/world写权限且无任何扩展ACL。先只读核对系统Python/developer tools及Node24的现有可用性；缺少时报告，不自动安装或接受系统安装弹窗。Homebrew symlink不能替代固定可信二进制，也不能删除ACL来让检查通过。发行器不替代权限授权；实际运行需要已授权的真实管理员安装会话。启动器先核验源码树；Node preload 限制 ESM/CommonJS 依赖只能来自已审树。先验证真实原177记录和现库，随后按 renderer 的实际顺序执行一个事务，最后 controller 复核178函数与 ACL，再无覆盖发布新记录。它不创建系统账号或擅自部署依赖。

如果目标已由 SQL 测试工具装了后继但没有正式记录，不得对该实例运行本发行器并期望“补发”。本发行器要求前驱完整 catalog 精确匹配，不能用它认领事后安装，也不能手写记录补齐。请选择完整授权的前驱安装环境，或将需要受信恢复流程的问题报告给主控。

`INSTALL_OUTCOME_UNKNOWN`、`COMMITTED_UNPUBLISHED`、`PUBLISHED_DURABILITY_UNKNOWN` 均须停住并检查真实目标/文件状态。后继 SQL 与文件发布不可能被当成同一原子事务；不得声称失败就回滚，也不得自动重跑。

## 运行输入准备

以下命令中的 `NODE` 必须设为已核实的固定二进制：Mac `/usr/local/bin/node`，Linux `/usr/bin/node`，不能指向任意PATH版本。当前工作目录必须是对应可信部署仓库。

以下在已安装环境中以非 root 的专用操作用户完成，不继承 `DATABASE_URL` 或任何 `PG*` 环境变量。

- `PACKAGE`：已批准的标准包目录，manifest 的 SHA-256 从独立可信交付清单取得。不能修改包来通过校验。
- `RUN`：包目录之外的独立私有工作目录。每次 `--report` 必须是**尚不存在**的新子目录，防止覆盖上次证据。report 不能是包目录的父目录或子目录。
- `target.json`：从当前真实 sales 固定记录经官方 loader 验证后提取，仅包含 `protocol`、`system_identifier`、`database_oid`、`database_name`、`catalog_sha256`。不从测试 manifest 或旧 raw packet 猜值。运行 host 仍会再次核验当前现库。
- `admin.json`：已有批准的初始化身份，字段 `staff_id`、`account_id`、`login_name`、`staff_name`。不要生成替代人员或改业务 ID。
- 私有 `connection.json`：精确字段 `host`、`port`、`database`、`user`、`password`，可另有 `statement_timeout_ms`；使用经过验证的普通 controller 登录，不能用 owner 或 superuser 代替。host 为 127.0.0.1 或已核实的本地 Unix socket 目录。文件权限0600或更严格。
- 私有 `admin.scrypt`：现有批准的编码 scrypt 值，不是明文密码，权限0600或更严格。不要重新生成后改变批次身份。
- `registration.json`（若需要）：真实独立来源登记。`source-registration` 只生成声明，不证明原始来源真伪。
- 离职历史无厅人员如需批准清单，使用包目录外的已批准文件和独立 SHA-256。CLI 两项必须一起给出：`--staff-hall-approval FILE --staff-hall-approval-sha256 SHA`。清单绑定本包 source namespace 和原始 source hashes，不能由包自报批准。

例如，已经验证存在的固定记录可由官方 loader 提取目标（不会发起数据库连接或生成记录）。在可信仓库目录内执行，输出到新的私有文件：

```sh
"$NODE" --input-type=module -e '
import {loadWholeSalesSpecV1} from "./scripts/release/unified-install/whole-sales-catalog-v1.mjs";
import {loadWholeSalesRecordV1} from "./scripts/release/unified-install/whole-sales-record-v1.mjs";
const r=await loadWholeSalesRecordV1(await loadWholeSalesSpecV1(process.cwd()));
console.log(JSON.stringify({protocol:"STANDARD_IMPORT_SQL_V1",system_identifier:r.system_identifier,database_oid:r.database_oid,database_name:r.database_name,catalog_sha256:r.catalog_sha256}));
' > "$RUN/target.json"
```

若 loader 拒绝，停止，不把读取失败改成手动复制。主控应在写文件前确认目标不存在，并使用私有 umask；命令中的变量须来自已核实路径。

## 实际入口顺序

用所选入口的实际 help 确认参数。独立 `stream-preflight` 和 `stream-prepare` 均接收成对的 explicit-zero 与 staff-hall approval 参数，允许两类批准同时使用；其文件、SHA 和来源绑定仍由同一验证器检查。`stream-prepare` 只做离线请求准备，普通标准 profile 可使用这些批准；历史 sales profile 因没有真实 host admission 仍返回 `STREAM_SOURCE_PROFILE_OFFLINE_ONLY`，不能用离线预检或准备结果作正式发行成功证明。本轮没有开启历史 host，也不改变正式执行的安装记录、现库核验和授权门槛。

先 inspect，同样执行真实 host 验证，但不导入业务：

```sh
"$NODE" tools/unified-import/cli.mjs whole-import \
  --package "$PACKAGE" --report "$RUN/inspect-report" \
  --manifest-sha256 "$MANIFEST_SHA" --target "$RUN/target.json" \
  --admin "$RUN/admin.json" --connection "$RUN/connection.json" \
  --scrypt-file "$RUN/admin.scrypt" --inspect-only --ack-exclusive-ddl-window
```

如该包需要来源登记或人员批准，在 inspect、执行、复核三个命令中都使用相同的真实输入选项。上方变量仅为占位，不是可执行目标。`--ack-exclusive-ddl-window` 表示实际已建立独占窗口，不是让程序创建窗口。

获得业务导入授权且 inspect 状态允许后，使用相同输入，删除 `--inspect-only`，并换成尚不存在的 `$RUN/import-report`。大包可将命令名改为 `stream-import`；只有流式入口支持可选 `--coalesce`。正式数据不加 `--allow-synthetic`。

成功提交后另用新报告目录独立核对：

```sh
"$NODE" tools/unified-import/cli.mjs stream-verify \
  --package "$PACKAGE" --report "$RUN/verify-report" \
  --manifest-sha256 "$MANIFEST_SHA" --target "$RUN/target.json" \
  --admin "$RUN/admin.json" --connection "$RUN/connection.json" \
  --scrypt-file "$RUN/admin.scrypt" --ack-exclusive-ddl-window
```

## 判定与交接

- `COMMITTED` / `ALREADY_COMMITTED` 是提交事实；只有 `verification.state=VERIFIED` 且连接关闭、local cleanup无失败时，才可报告该入口完整成功。需保留JSON和退出码，不能仅看终端一句话。
- `UNKNOWN`：先 inspect/核对回执，不重新生成 batch/plan ID、不盲重试。
- `ROLLED_BACK`：仅表示程序确实取得 rollback 确认。不要把 `NOT_STARTED` 或未知结果说成已回滚。
- 已提交但对账/关闭失败：保留提交状态，继续独立 verify，不撤销事实也不重复插入。
- `ALREADY_COMMITTED` 是幂等命中，不能计为新增业务数据。
- 数量、金额、库存、结算读回都必须来自实际源包和已提交数据库；未知/null不能补零，不用测试结果替代正式数据对账。

本地 Codex 最终回传：实际源码/spec/combined hash、环境与目标身份（不含密码）、执行的入口及原始JSON/退出码、对账结果和失败边界、哪些是SQL级实证/模拟测试/正式入口实证。若停在部署或授权条件，准确报告缺项和已完成部分，不擅自修改安全策略或让用户伪造证明。

本轮原installer的物理目标guard改变了源码发行指纹，未改变原177 SQL函数集或sales combined SQL。旧源码记录不能直接沿用到新发行器，更不能手改其source-spec。新隔离库必须用当前受信launcher完成原177记录发行后再做sales。已有旧记录目标若因source mismatch拒绝，主控报告版本差异，不以raw catalog补发。Mac平台映射、ACL、fd和双阶段调用目前是源码及Linux离线/模拟契约验证，仍需要在已授权Mac环境取得真实安装验收。

## “普通 / 整包 / 流式”对应关系与旧命令边界

用户提到的三个 source-only 拒绝点分别位于普通计划编译器、整包编译器和流式计划器。当前普通完整包入口 `whole-import` 真实读取普通包，并经过整包专用的 `buildWholePackageSourcePlanV2 → buildWholePackageSourcePlan`，再按 whole profile 物化整包程序。该入口使用统一来源声明解析；旧 `buildUnifiedImportPlanV2` / `buildUnifiedImportPlan` 的默认登记合同不变，不伪装历史登记。历史 profile 的三个计划器仍要求同一真实已安装 host 在有效会话中提供的能力，不能由文件或调用者自报。

- 普通完整源包：显式 `whole-import`，非流式编译，一次整包事务。
- 整包事务 profile：同一个 `whole-import`，保持整包初始化、步骤、提交和对账边界。
- 大包流式：`stream-import`，流式生成步骤，仍由整包协调器处理事务。

这不等于旧 `initialize` / `apply` 已兼容历史包。旧V1 CLI还固定57403端口及旧 `opt03_synthetic_profile_20261102_v1` 合成目标，使用逐步事务、旧session和旧operation/journal身份，以及当前整包安装撤销了执行权限的旧SQL函数。现在旧命令遇到历史profile会明确返回 `SOURCE_PROFILE_OFFLINE_ONLY`、`NOT_STARTED`、`required_command=whole-import`，不会连接后偷偷改跑整包。`capability-report` 也明确区分两套语义。

不能把只授权初始化的命令静默扩展为整包业务写入；不能把旧apply/session/journal转换成新whole计划继续重放。如果真实需求明确是“旧逐步initialize/apply也必须支持”，这仍是独立未完成的旧协议/SQL授权与恢复设计，不应宣称已由whole-import等价满足。已经发生过旧逐步提交的目标先核对实际状态，不盲目用新whole计划补跑。

## 2026-11-04 后续断点：正式组合入口与回执

本轮沿用 v3 后续工作区，不回退或覆盖其他 WIP。安装器正式闭包是固定 Python launcher → sales issuer →当前 historical reception renderer →现库完整 catalog/ACL 观察→固定 sales record 持久发布。旧 batch finalizer 不是必须补跑的步骤，仍禁用；不得运行任意检出的 Node/Python 脚本作为 root，更不能先手工安装 SQL 再用 finalizer“认领”。原177与sales两阶段及固定Mac路径仍按本说明前文执行。

部署依赖必须是经审核的完整源码与 package-lock.json 对应的本地依赖闭包、支持 registerHooks 的 Node24、PG17固定psql，以及已有系统Python的 -I -S。准备/部署源码和依赖、数据库安装、业务导入仍是不同授权阶段。本轮未实际安装这些依赖，不能让用户通过改权限、创建假记录或拼接候选SQL绕过缺项。

sales安装成功现在输出单行 WHOLE_SALES_INSTALLATION_RECEIPT_V1 JSON，包含实际 record 路径/字节SHA、source spec/combined SQL/catalog SHA及物理目标，state=INSTALLED_AND_RECORD_PUBLISHED，businessImportVerified=false。保留stdout、stderr和退出码。该回执不是运行时能力，host仍须从固定受保护记录加载并核对当前源指纹/现库。无回执不等于没有提交；遇 INSTALL_OUTCOME_UNKNOWN、COMMITTED_UNPUBLISHED、PUBLISHED_DURABILITY_UNKNOWN，或输出中断，检查真实目标和记录，不盲重试或伪造JSON。

回执、调用顺序及launcher拒绝旧finalizer/任意entry的离线契约已验证；Mac实机、root正式发行、真实受保护记录和实际公开host/CLI整链仍未验证。新issuer字节会改变source-spec，旧SQL测试快照不证明新发行器通过。后续worker修改SQL时需重新核对renderer pin、spec和host同一闭包，并重新冻结，不能复制旧通过结论。

## 大包与 105,433 项批准零库存证据：显式选择 stream-import

`whole-import` 保留小包物化限制：每个标准artifact最多64MiB，manifest加registry/files/reports/assets合计最多256MiB。原始 source_files 不参与物化。独立零库存批准的Merkle proof可能使105,433行inventory文件超过单文件限制，因此这类规模选择 `stream-import`，不要提高小包限制、拆分同一整包事务或手工拆SQL。超限 `whole-import` 返回 NOT_STARTED / WHOLE_PACKAGE_MATERIALIZATION_LIMIT / required_command=stream-import，且automatic_switch=false；它不会自动变更你授权的命令，也不会启动preflight或host。

流式入口仍是一个整包事务，不是逐行提交。预检/计划使用磁盘索引，执行逐请求迭代。独立approval本身仍有64MiB和250,000事实上限，需要相应内存；不能宣称整套流程只需128MiB或可以无限大。行数不是唯一规模准入条件，实际文件/请求/证明边界仍必须通过。

批准清单是用户独立提供的事实，不可由程序自行推断“缺行=0”。在包目录外保存已批准文件，使用独立批准的SHA，将这两项同时传入；批准绑定该包namespace、原始库存文件SHA和cutoff。下列变量必须由本地主控核验真实路径/记录，不能从测试值猜测：

```sh
"$NODE" tools/unified-import/cli.mjs stream-import \
  --package "$PACKAGE" --report "$RUN/zero-stream-inspect" \
  --manifest-sha256 "$MANIFEST_SHA" --target "$RUN/target.json" \
  --admin "$RUN/admin.json" --connection "$RUN/connection.json" \
  --scrypt-file "$RUN/admin.scrypt" \
  --explicit-zero-approval "$ZERO_APPROVAL" --explicit-zero-approval-sha256 "$ZERO_APPROVAL_SHA" \
  --staff-hall-approval "$STAFF_HALL_APPROVAL" --staff-hall-approval-sha256 "$STAFF_HALL_APPROVAL_SHA" \
  --coalesce --inspect-only --ack-exclusive-ddl-window
```

只有inspect允许且业务导入已授权，才删除 `--inspect-only`、改用尚不存在的 `$RUN/zero-stream-import` 执行同命令。随后以 `stream-verify`、新 `$RUN/zero-stream-verify` 报告目录复核，保留同一包/目标/初始化身份/批准选项和 `--coalesce`，不重建批次身份。不需要合并请求时可以一开始就不选coalesce，但inspect/import/verify三步必须一致。若还需来源登记或离职无厅人员批准，三步都附相同已批准的registration/staff-hall选项。

本轮小合成整包已实际贯通独立approval读取、完整stream预检及计划，抵达真实受保护host的缺记录拒绝门。它不是成功host/PG导入证据；未伪造安装记录绕过门禁。105,433完整合成包规模验证进度见现有 COMBINED-SALES-INSTALLER-CANDIDATE-20261104.md 的后续断点。

### 不需要数据库的独立预检入口

已接入同一个外部approval读取器与验证器的独立 `stream-preflight`，可以先在没有连接文件、密码或安装记录的环境检查包：

```sh
"$NODE" tools/unified-import/cli.mjs stream-preflight \
  --package "$PACKAGE" --report "$RUN/zero-offline-preflight" \
  --manifest-sha256 "$MANIFEST_SHA" \
  --explicit-zero-approval "$ZERO_APPROVAL" --explicit-zero-approval-sha256 "$ZERO_APPROVAL_SHA" \
  --staff-hall-approval "$STAFF_HALL_APPROVAL" --staff-hall-approval-sha256 "$STAFF_HALL_APPROVAL_SHA"
```

report必须是新目录，approval必须在package外，SHA必须独立可信。该命令仅做离线预检，不授予运行时能力、不连接数据库，也不证明正式安装完成。通过后仍按上文执行真实 `stream-import --inspect-only` 和实际导入/复核。正式数据不使用 `--allow-synthetic`；该选项只用于合成测试。

独立 `stream-preflight` 与 `stream-prepare` 均支持 `--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA` 和 `--staff-hall-approval FILE --staff-hall-approval-sha256 SHA`，可同时传入并使用正式路径的同一读取器与验证器。普通标准 profile 可离线完成请求准备；历史 sales profile 的独立 `stream-prepare` 仍返回 `STREAM_SOURCE_PROFILE_OFFLINE_ONLY`，批准清单不能替代真实 host admission。旧 `validate`、`plan --offline` CLI 仍没有 explicit-zero 批准参数，不要把该入口限制误判为数据损坏。

正式执行/核对命令仍为 `whole-import`（限小包）、`stream-import`、`stream-verify`，须满足前述真实安装、host 和授权条件。上方命令展示两类批准都需要的情况；如某类不适用，整对省略，不传空文件或猜测批准。STAFF_HALL_APPROVAL 及其 SHA 必须来自已批准的包外清单。独立预检 stdout 中的人员批准摘要只含批准 SHA 和人数，不输出原人员事实；报告目录须保持私有。

### 已取得的105,433规模证据与资源范围

完整合成包已实际完成离线全量preflight（0问题，38.2秒），随后对同一hash绑定索引完成plan/program及全部请求遍历（退出0，108.46秒）：105,433批准零行、另2条原库存行、1,270个请求，最大请求296,732字节，零证据不伪造ledger entry。恢复诊断峰RSS986,157,056字节，约940.5MiB；应核对本地可用内存及磁盘，不能承诺128MiB运行。此为离线全包/请求规模实证，正式root/Mac/安装记录/PG/真实host仍未实测，不等于105k已成功导入。首次规模测试退出1且原因未证实的日志也已保留，不将失败隐藏为成功。
