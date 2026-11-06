# QB r26 实际执行证据限定验收

结论：**PASS_SCOPED_ACTUAL_R26_PG_SYNTHETIC_ORDINARY_AND_CLEANUP**。本批真实隔离PostgreSQL17.11、合成导入、原普通账号API runner与清理证据通过；无新增发现。不是REAL数据、浏览器或正式发布验收。

固定root `10fc5efdea99976590c47edd65a8e496a3b2b1dc`，sourcee422d073，sourceSetaf75afcf，program `3da708a5ecab75fa5bffb5a6b2d7e1ce1bef195fe6afeabcb376becd4e866ce3`，target `82a730195e53ac8a27df9cd8317864fff0c3a024b02215ed76eb2dd6190fa365`。SID7705135436364169263、CID2cf947a0、databaseOid16393与三次独立快照的物理身份相同。

唯一任务t45-f35-10fc5e-install-20261107-01为COMPLETED/exit0，170.035秒；北京时间03:05:04开始、03:07:54结束。job.json 514B/SHA256 `0fbc7541801c96020668e55cd5b4e6e320f6f6a99875b80ed77b4b6d8faa1cb4`；原执行结果59376B/SHA256 `f92dee2a59725a5a850facb6e1f83c4f6881d907e5795783e438e80d7bc9b094`。均按原文件读核，未复制原payload、nonce、凭据或身份秘密。

原job bundle的wrapper/probe与已核冻结输入相同，C9/operations-plan与本机准确授权文件相同。C11 `1c0a55b3...`、C9 `9a51e13c...` 的source/program/target匹配实际结果，C9复制摘要吻合且approvalCreated=false；同一20分钟时窗覆盖本次任务开始/结束。它们是C实际签发的新文件，未将旧null模板冒充授权。

## 本次实际通过的范围

- 安装RECORD_DURABLY_PUBLISHED、recordPublished=true；installState保留原COMMITTED_UNPUBLISHED字段，不改写记录。
- 原synthetic host为COMMITTED / ALREADY_COMMITTED / VERIFIED，保留25headers、27settlements，连接CLOSED。原回滚host确认originalBatchAbsent和rollbackVerified，连接CLOSED。
- 三次独立快照连接全部CLOSED，安装后snapshot与回滚后相等、提交后不同。快照由独立管理员只读连接取得；普通角色授权证明来自下述原API runner，二者不混用。
- ordinary为FRESH35_ORDINARY_RUNNER_COMPLETED、syntheticOnly=true、connectionCleanup=CLOSED，普通child已reaped。准确固定入口中的三组salesPositive/salesMixed/transfer循环没有skip路径；失败assert会沿原catch抛出，成功标记仅在完整函数返回后写出。因此本次覆盖容量preflight、真实账户setup的实际CREATE或RESET分支、登录/session、营业员越厅403不写入，以及prepare/save、审核、弃审、重开再审核、真实回滚、丢COMMIT确认后的本次原键receipt恢复与幂等、detail/库存ledger读回。没有单独导出的逐请求日志，不将CREATE与RESET两个分支都称本次实测。
- proof为PASS_ACTUAL_ORDINARY_PROOF_EVIDENCE：实际普通uid读取/建立watch、一次metadata touch/mtime+1、epoch/catalog current拒绝、watcherClosed、childReaped；sqlExecuted=false，**nativeSamePoolRevocation仍NOT_TESTED**。
- cleanShutdown、credentialsRemoved、loginsRevoked、ownedPidAbsent、noActiveTcpRows、cleanupComplete均true，errors空，初始化与后代回收true，最终容器已停止。

清理北京时间03:07:44采样完整，5条记录全为06 TIME_WAIT，其他状态计数为0。新FRESH35_NO_ACTIVE_TCP_ROWS_V1条件通过，**strict portAbsent=false原样保留**；不能推导可立即重绑端口。任务总耗时不是性能或并发验收。

T45脱敏汇总 `f8e7dd37e642052b0b22ad2f8b0811f9ee757540fbe20b43bab24d30b65a86c7` 已取得，与原回执的关键版本、ordinary和cleanup一致。采用6fec/23b有效范围及e4bb运维证据；旧r25失败和清理结果不追改，其唯一旧500根因不因本次通过而倒推确定。本次原harness内的ALREADY_COMMITTED/receipt恢复是当前候选合同内行为，不是重发旧任务或重放旧版本未知键。

本QB仅本地回执/固定入口对照，0服务器、PG连接、构建、用例重跑、源码写入、旧任务重放。剩余REAL/正式数据导入、正式发布、浏览器与外网业务、native同池撤销、容量并发/性能、立即端口重绑均未验证，不新增延期全套试验。C可采用本准确限定实际结果作下一步有界决定。本报告不授权上线。actual model/effort/Fast UNVERIFIED。
