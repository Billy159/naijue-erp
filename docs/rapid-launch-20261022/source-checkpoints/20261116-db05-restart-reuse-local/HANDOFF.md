# DB05 / 161 重启复用本机交接

范围为运行侧源码增量。仅使用本机留存的 32 号回执和源码。服务器连接、数据库操作、登记、签发、写入和导入均为 0。

## 运行侧增量

- `batched_real_host.py` 的 `installed()` 固定核安装原键及 32 号启动证明，核根端与公开终态和结果、保护区 completion、13 份逐层 ACK 和实际 161 观测。 `current()` 独立读取下一次启动的保护证明、启动终态、retained ACK、容量和当前认证回执，要求相同系统标识、OID、PGDATA 路径和设备/inode，具有更新的 PostgreSQL 启动时间和不同容器。仍走已登记规则与本代固定支持文件。
- `retained24-run.mjs` 从同一权限包校验本代挂载的启动证明和容器出生时间，并保留原业务输入边界。封装时用下一代的 `normal05_retained_stop.py` 重算其 bundle pin。本机先为操作闭包选定 `installed-real-operation-batched-root06-20261116-01`，该路径只在本机源码出现。
- `fresh35-combined-catalog-v1.mjs` 修正现有 controller 目录观测中的 sourceSet 投影。旧代码生成操作源码闭包指纹，现有 161 目录校验要求 161 描述符指纹。修复复用原同连接的 RR/只读物理和目录检查，仍在进入业务准备和写入前执行。本机对照生成的 SQL 已复现旧值冲突，修后值一致。161 模型指纹和完整 controller 守卫 SQL 同本机对照一致。

| 本机文件 | SHA256 |
| --- | --- |
| `writer/bundle/batched_real_host.py` | `00ba76a88b494ebe5fe1f75845ad3cbcf099bf4039ebe21ace92ecf4d0f7513f` |
| `writer/bundle/retained24-run.mjs` | `c730424370a8c631b561ccbb12ee73fc11a307ca165f4139df99e41b742707f2` |
| `operator/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs` | `5dff36f53e4e7cae7f5a8c10ea95bf9fbc7b4a8035981126faed239bfb2ee27a` |

本机验证包括语法、历史原件回执指纹、模拟新启动以及对旧启动、错误 SID/OID/PGDATA、错误认证关联、模型不同、ACK 缺失、161 快照改动的拒绝。 `CATALOG-PROJECTION-LOCAL.json` 记录单叶变更的本机闭包和模型计算。正式运行的目录规格 SHA 仍待用实际受保护原安装 target 与最终新闭包生成，真实新启动及实时目录观察也仍待验证。

## 主控签发所需输入

1. 历史安装以 `t45-r3-batched-install-20261116-02` 和它的原 32 启动为准。历史 `installTerminalSha256`、`installResultSha256`、`batchedCatalog` 直接使用安装读回。13 ACK 和 161 捕获保留在原程序目录。原完成、停机、认证恢复的总回执 SHA 为 `ce214e0e00e585843c7c3d943ff2b82585f38c89cdc87708593c11c218bb2c63`。
2. `service`、`startTerminalSha256`、`startResultSha256`、`lockCapacitySettingsSha256` 取下一次实际启动。 `applyTerminalSha256`、`applyResultSha256` 取新启动授权所引用的同代有限认证。主控用实际新证明核同一物理目标，并保留原期限和关闭条件。
3. `operatorReadySha256` 绑定最终闭包的实际服务端物化回执。使用既有 `expectedBinding` 中的 `batchedSourceSetSha256`、`batchedCatalogSpecSha256`、`batchedModelSha256` 携带最终运行闭包原生计算的目录三值。模型须等于已安装 161 的 `6e0a0e039eead7714d4e2ec6c995678860dee16d35e7282245bc5748eb565e85`。单叶本机目录 sourceSet 为 `2621bb5f3d788ae946c620a935eb1dc6fb6cc28f714b9404d99ea34ea65a373d`，完整输入到齐后重核最终版本。保护区历史观测与 controller 的实时观测携带各自的会话身份和源码信息，原始快照 SHA 各自绑定对应证据。

## 11 月 16 日原件到达后的改动边界

- `retained24-run.mjs` 的 `REAL`、`REPORT`、`BATCH_PLAN`、`APPROVALS`、manifest SHA、summary SHA、`REPORT/index.sqlite` 和 initializer 文件长度必须绑定同一个经过核准的新批。索引的精确身份随同该批收据和原读取路径核验。权限文件组及临时读取范围随同批刷新。
- 同一批业务绑定还进入 `batched_real_host.py::scope`、写入分支的计划目录和 initializer 持久化，以及 `fresh35-host-session.mjs` 中当前仅接收 11 月 11 日绑定的 `originalR3PreparedBusiness`、`assertFresh35RetainedOriginalInitializer`、`loadFresh35BatchedImportContext`。按新批准备记录取得 manifest、plan、steps/条数、namespace/cutoff、批次 ID、initializer 请求和相关批准。保留 11 月 11 日固定的历史只读检查及 `original_source_facts`、原证据和原收据。
- 原 writer 意图仍为 `t45-r3-batched-real-execute-20261115-01`。最近实际停机回执显示未提交。恢复工作后的第一项现场检查是沿同键查两份保留授权下的 request、临时 request、root/public job 和终态，以及该键已有计划/读取权限记录是否存在。结果未知时继续按原键读回。完成该检查并收到 11 月 16 日精确已批准批次前，写入保持待执行。
