# Writer45 结果绑定失败：短实证诊断

仅本机冻结167/77源码与已存回执，现场Stop→Restore优先。writer45永久不重放；本诊断不读取原错误消息、凭据、initializer/SQLite或业务行正文，不运行任何factory/Node/PG/SSH。

## 已证事实

准确host `/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL45-EXECUTION-CONSUMER-01/writer/bundle/final33_host.py` SHA `db2c2f278ffd3d3be0365e8081c17ff83532c9eeb6686ad4b6e13adb7eab18f6`。实际safe readback03 SHA `0b7626f2710da365878ee2d121bfb7eb8c457b91cb0cd4752b47ad928f38eaf9`：外层terminal `a574859a24eb391e9bf9e1ec7aa1ba9918d6b0e427bbd614072e07b7406df6cd`，FAILED/2，elapsed2772.684307568s，2026-11-18 05:20:10.896894 CST结束；result/incomplete root `cd7208c2e93ead58eae19f8abc8732f00c48abf23f60cef0e831a6c9342ccc87`。该外层终态不是native SQL结论。

精确guard在host584-585：`result.requestKey==KEY && result.inputSha256==sha(host AUTH原字节) && result.service==a.service`，任一不符抛 `FINAL33_NATIVE_RESULT_BINDING_REQUIRED`；616行覆盖public safeCode。

新增证据：host463行未取得可确认JSON时生成固定三字段fallback；用77行真实encode规则，仅对源码中这个常量做字节哈希，得到 `03721ee4b2623b92207b57a71b410e87af6677f31e238a42a1552ea8364b4085`，与实际nativeResultSha256完全一致。并非构造未来成功fixture，也未读取native正文。说明目前记录与“未取得可确认native结果”的fallback匹配，不能解读为已拿到完整业务结果但三个真实身份字段发生错配。fallback缺requestKey/inputSha256/service，因此必然过不了584。

实际 `nativeResultBindingMatched=false/lifecycleConfirmed=false/nativeConnectionCleanup=UNKNOWN/sqlstate=null/state=UNKNOWN`。cleanup root `29ec9281a7f50c0c67dfe81d1ae75c1cc8738a05ade08cd37850bcdaf4fe37ec` 证实child/descendants收回、REAPED_EXCLUSIVE_PROCESS、nativeAuthorityRemoved、scratchEmpty、scratchRetainedPrivately、originalInputMetadataChanges0。它不证明数据库rollback、没有已提交数据或持久业务状态ABSENT；metadataChanges0也不等于业务写入0。

## timeout / child退出 / JSON结果分别能证到哪

host421-443轮询child communicate，内部cutoff按579行为 `min(AUTH.expiresAt-cleanup220s, ENTRY_WALL+2780s)`，并预留8秒；正常的0.5秒轮询TimeoutExpired只是继续等待，不能称为本轮最终timeout。内部remaining耗尽/信号/其他异常统归problem，必要时TERM3/KILL3。428/460-466对无有效输出或JSON非dict走fallback，但未持久化received/parsed/problem及具体异常原因。当前elapsed接近某预算不是实际timeout证据。

host474-501的docker exec wrapper完成并通过499收回断言后，才写 `native-private/writer-process-cleanup.json`，含Node实际exitCode（命名remoteExitCode）与内存receipt摘要。当前safe readback未导出该文件，故仍不能确认Node自然exit、信号exit、deadline或无效JSON哪种原因。外层2不是Node exitCode；lifecycleConfirmed=false不是SQL超时码。

## 原键最小只读取证清单（待Main具体范围，未执行）

| 固定原路径 | 仅需允许字段/用途 |
|---|---|
| `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-real-after44-execute-20261118-01/native-private/writer-process-cleanup.json` | 先取stat/bytes/hash；严格schema只投影requestKey、childReaped、descendantsReaped、remoteExitCode、resultReceiptSha256。是缺少的首要实际exit证据；不存在/不可读须如实记，不补造。 |
| `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-real-after44-execute-20261118-01/native-private/native-result.json` | 已有结果摘要03721绑定；必要时仅metadata/hash及与上述固定fallback字节的相等布尔，或闭集合state/safeCode/connectionCleanup和binding字段存在布尔。不得输出任意message/stack/native payload，也无需重复导出业务内容。 |
| `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-real-after44-execute-20261118-01/phase.private.log` | dispatcher标准私密日志位置，本轮未读取；至多stat/大小/hash。不能假定其含Node stderr/完整stdout，也不在本范围读取日志正文。 |
| `/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/final33-private/t45-r3-batched-real-after44-execute-20261118-01/private-retained/scratch-after-child` 与 `/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/final33-private/t45-r3-batched-real-after44-execute-20261118-01/owned-private` | scratchRetainedPrivately由host508-521移动原scratch并新建空scratch，不能把scratchEmpty当“没有原报告”。仅目录存在/身份、固定安全元数据清单；不读取SQLite、initializer、业务行或任意文件内容，不递归删除。底层报告文件未在当前束中给出可证固定名，不能猜造stream.stdout/stderr路径。 |

Node stdout在host410-428是PIPE内存communicate，原始out未落文件；docker wrapper stdout同样只内存解析。`writer-process-cleanup.json`仅存receipt摘要，不保存原receipt或完整stdout。Node stderr与docker exec stderr均DEVNULL（411、474），本链没有可重新取回的stderr捕获文件。缺失的received/parsed/problem、最后remaining/cutoff触发原因不能靠后补猜；不能为补证重跑作业。

若要判定原businessRoot是否durably COMMITTED、部分推进或ABSENT，仍需Main另给原business IDs/原target的durable readonly具体范围；外层FAILED不能自动FIRST_WRITE/RESUME。原prepare05、业务operation/request IDs以及任何已写/可能已写的数据全部保持。

## 独立记录的打包缺口

staticcec实际存在 `read_stop_basis44.template.py`，无 `read_stop_basis45.template.py`；binder79却读取后者。consumer167中正确45模板实际存在。该文件名/打包缺口已实证，冻结源未改。主控转告T45已在私有执行adapter按审过的正确consumer45字节生成真实settled E08bba；本诊断不自行复验现场、不把该适配冒充冻结包原本无缺口，也不把它归因为writer native结果失败。旧RootCatalog两个guard已通过内容不重开。

准确来源摘要见 [EVIDENCE.json](/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-normal45-native-result-binding-diagnosis-01/EVIDENCE.json)。本轮只新增本诊断及来源索引，0server/PG/Node/factory/job/key/AUTH/source改动。闭环继续由Main/T45负责。
