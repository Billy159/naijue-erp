# B07 同一父进程接线增量

状态：SOURCE_PREPARED_NOT_ACTUAL_WINDOW_READY。原 fixture3叶保持 QB382 版本不变；本次只新增父载体、父测试、两份明确含空值的模板及本说明。无 PG/SSH/restore/seed/login 操作，无原11SQL或原角色脚本源码修改。

## 原接口和固定入口

采用 T45 `B/server-execution/B07-FIXTURE-PARENT-INTERFACE-HANDOFF-20261026.json` 的准确7个原pin及新私有根。父入口：

```text
原 Node24 qa-identity-parent.mjs --registration <本次完整0600注册文件>
```

`QA-IDENTITY-PARENT-REGISTRATION.template.json` 含原7文件完整路径/bytes/SHA、原status、原wx文件名、两个原B目录唯一字面量、新子目录和时限，非实际注册。T45在原OS生命周期内，先停机保全当前整套copy并受控恢复已有pre-v16-data，启动同一PG17.11/private socket55676/noTCP，读取实际新的postmaster/原sourceActor后填入独立私有注册文件；不能改模板称已执行。保全/restore/启动/onlyOwnPID停止始终由 T45 原Python方式负责，父程序不进行任意目录恢复、启动数据库、建库或修改HBA。

空字段必须由本次事实填入：fixtureInput.target.postmaster_started_at、sourceActorAccountId、createdAt、preservedSnapshotReference。其余固定B07目标/原注册meta也须由T45对本次实际核对。模板未补全在连接和创建私有输出目录前即拒绝；旧postmaster字符串不能冒当前注册。

实际0600注册文件放在已存在的F/rapid-launch-20261022父目录下，例如其 sibling `B07-QA-PARENT-REGISTRATION-20261026-01.json`；不要为了写注册文件先创建尚未使用的新outputDirectory。新输出根由父程序以0700独占创建，目录已存在即拒绝，避免重入覆盖原seed/未知结果。

## 固定执行顺序和原子边界

父程序先核固定源目录/Node24、输出根、原两个子脚本硬编码pin、原注册/SQL文件pin、原11升级plan和presenceSQL pin，拒绝已有输出目录。它用原diagnostic session登录，SET ROLE仅用于预升级fixture setup（naijue_erp_test），明确该连接default_transaction_read_only=off，调用 QB382 原 `withB07QaIdentityFixture`。来源账号不改。

seed COMMIT明确成功后关闭setup连接，父进程保留仅QA密码闭包，按顺序await原upgrade-v16-only.mjs、ordinary-role-only.mjs子Node程序。子程序stdin只有原被审源码，唯一差异为B输出目录字面量精确替换到新私有upgrade/role；原7输入按字节复制，原refs/plan/SQL、target assertions、11叶自身hash及业务守恒检查保留。新父程序不解释或改写原SQL，不覆盖旧16或380证据；两个子进程均拿不到QA密码/cookie，argv/env也不传secret。子进程timeout/错误/输出超限立即停止并保留结果，不重发；收到TERM/INT时停止本次子进程再退出接线。原child默认只读诊断及显式SQL写入分界保持。

父输出固定 F/rapid-launch-20261022/b07-normal-identity-draft-20261026-01，upgrade与role分别为其子目录。role成功后写 `CURRENT-METADATA-READY.json`，引用本次 `role/ACTUAL-ORDINARY-V16-METADATA.json` 和 FULL-CATALOG。程序最多等待300秒、仅该根下 `CURRENT-PURPOSE-GATE.json` 的原独立审核材料；两子程序各180秒，最大总预算本模板660秒，登记总上限800秒，T45外层必须给足预算并预留ownPID清理时间，不沿旧260秒父进程限额误杀。

该等待是明确的当前用途审查接线，不发放自签grant。C/QB采用原380静态schema/ACL范围，只核必要的当前postmaster/nonowner identity、metadata/catalog是否仍相符与原6用途：HISTORY_REVISION、PRODUCT_SEASONS_READ、CURRENT_CUSTOMER_READ_WRITE、CURRENT_FORM_READ、HISTORY_READ、INVENTORY_ADMISSION。不能复用旧停止窗口的process identity。

## C/QB交付的单个用途gate

`QA-IDENTITY-PURPOSE-GATE.template.json` 给固定format和3个精确文件ref（absolute path/bytes/SHA）：runtimeConfiguration、draftInput、review。实际gate须0600、非symlink，最后一次写出于固定private路径。三个ref不是授权替代物，原runtime issuer仍校验原review格式、independent PASS pin、当前catalog/target/process/purpose和真实leased连接；父进程不改review、不造capability。

- runtimeConfiguration：沿原生产R1 normal配置schema，非CORE、DISABLED live commands，仅原HREV入口。目标为本次普通非ownerrole/原private socket/port/db、ssl=false；`postgres.target.password` **必须是null占位**，不能在模板或gate落任何密码。reviewFile/trustedReviewSha256须精确对应gate.review。正常assets/build/HTTP/authentication设置由C按原准确正常host模板提供；不能用测试自定义employment/policy。
- draftInput：C已登记successor的原B07 DRAFT input，actor固定QA account/null hall，sourceRoot为原R，target为同db/OID/本次普通role；原source/import actor不换，原两个DRAFT/manifest/publishReceipt和6个从未提交keys保持。parent不会自动替换actor或keys，原runner自行核版本、旧key、来源、库存、审计/receipt/重放/CAS。
- review：本次普通role/current process原review文件准确pin；目标postmaster须匹配本次fixture实际启动，其余由原issuer真核。parent不把旧metadata目录当成新review。

## 普通连接的两个必要差异

原bounded config强制nonempty password，但本副本原普通role LOGIN未设密码、沿原Unix-only trust认证。parent仅在内存把null占位转换为每次随机值，以满足原配置形状；该随机值不是PG密码证明，不改role密码、不作为session、不改变trust。实际账号密码仍只有fixture闭包中的真实scrypt校验材料，且仅正常 `/auth/login` 使用。无固定口令、密码文件或环境传递。

postmaster沿原诊断默认READ ONLY时，正常auth/HREV的BEGIN不能继承只读。parent使用原driver注入参数构造真实pg Pool，只对两个普通role池的会话加入 `options=-c default_transaction_read_only=off`，不改postmaster或共享HBA。调用的正是 `createProductionRuntime26HistoryRevisionApplicationApi(config,{profile:'SOURCE_CONFIRMED_HISTORY_REVISION_V16'},driver)`；另一个原BoundedPostgresPool+真实createNativeRuntime26Issuer为原DRAFT runner读回使用。没有把setup/owner client注入业务池。原metadata检查是SELECT，role子程序仍显式RR READ ONLY；原DRAFT当前事实helper所需行锁按原事务执行。

## 结束、失败与检查

正常login→GET session核QA principal→原runDraftNormalHistory三案→finally正常logout；原三案结果写DRAFT-ACTUAL-RESULT，包含失败/UNKNOWN的原b07Result也保留，原请求在首次HTTP前按phase私有wx保存。API.close和readPool.dispose、setup.end均在父finally，失败不假称已清理。父顶层只输出固定status，原driver/HTTP响应与参数不输出。最后T45停止本次准确ownPID、保留整套源与运行结果；需恢复仅同copy快照，不DELETE引用中的QA身份。

子进程失败、purpose未到/错pin、正常API/issuer拒绝、任何UNKNOWN均停止，不能重跑seed或换key。seed UNKNOWN仍沿 QB382 只读专用函数处理；密码丢失不能伪恢复。

新增5项检查通过：原两个子源码只改唯一B字面量并仅语法检查；真Node空fake子进程success/fail/timeout（不运行原脚本）；缺gate无授权/错pin拒绝；null模板到RAM随机值且原模板不变/普通role局部RO override；未填live模板在任何连接前拒绝。原fixture5项与QB382新增2项直接复用，原11SQL/ACL源检查不重跑。

这些是离线源码检查，未运行父程序的真实数据库路径；恢复、fresh target/purpose、真正正常登录/HREV三案、注销/池与ownPID关闭仍须原T45本次实际窗证明。原固定子脚本输出重定位差异和父新连接会话设置交原QB仅新增范围审核后，C再登记实际窗口。
