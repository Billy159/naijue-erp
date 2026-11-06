# r26 隔离 PG 与普通账号验证结果

本次准确候选的限定验证通过。原键 `t45-f35-10fc5e-install-20261107-01` 已终态 COMPLETED / exit 0，耗时 170.035 秒；北京时间 2026-11-07T03:07:54.227345+08:00 完成。没有重放旧作业或未知提交。

安装记录已耐久发布，状态 COMMITTED_UNPUBLISHED。原合成提交 COMMITTED、原键恢复 ALREADY_COMMITTED、新连接 VERIFIED；25 头、27 结算保留。失败回滚与原批次不存在验证通过；独立快照安装等于回滚、提交不同，三个连接均 CLOSED。快照回执的 SQLSTATE 为 null，不记成00000。

普通账号运行器 FRESH35_ORDINARY_RUNNER_COMPLETED，syntheticOnly=true、connectionCleanup=CLOSED，ordinaryBusinessVerified=true，绑定 root10fc5efd/sourceSetaf75/program3da7/target82a7。原断言与角色边界保留，未改用 owner 兜底。没有导出账号、PID、nonce、原始业务正文或私有日志。

实际普通 UID 下的证明读取、watch、epoch与catalog变更拒绝证据通过；仅一次metadata touch，子进程回收，未执行SQL。nativeSamePoolRevocation 仍 NOT_TESTED。

本批容器已停止，launcher exit0；普通子进程、初始化进程及后代已回收，cleanShutdown、credentialsRemoved、loginsRevoked、ownedPidAbsent 均 true，errors=[]。本次完整端口观察为北京时间 2026-11-07T03:07:44.353379+08:00 至 2026-11-07T03:07:44.355706+08:00，共5条纯tcp06，tcp监听及其他状态/UNKNOWN=0，tcp6全部0，读取完整且无异常。按已审新规则 noActiveTcpRows=true、cleanupComplete=true；严格portAbsent=false保留，不证明端口全空或可立即重绑。未补作停止后的新探测，旧r25 false/UNKNOWN未改。

真实目标SID7705135436364169263 / OID16393 / PG170011，birth北京时间03:00:47.538028；原C11/C9同截止03:19:16.029，没有延长。精确物理身份、全部版本和原收据摘要见 RESULT.json。7项冻结输入未变，没有新构建、真实数据或正式环境修改。

这里只通过本次隔离合成及普通账号链。businessVerified=false、productionVerified=false、browserVerified=false、networkVerified=false 保留；不表示正式上线、浏览器页面、网络、并发容量或性能验收通过。
