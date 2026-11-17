# 原认证回滚专用 consumer：SOURCE-only

唯一新键 t45-r3-ordinary41-original-auth-rollback-20261117-01。旧22:49:37.752恢复硬界未完成，明确记录未达；所有旧confirm/停库/恢复窗口保持历史，不再借旧期执行。新票据由Main完成SOURCE/QB/真实fresh后，取新的真实时钟仅15min；worker原300s，无新临时登录/角色/业务服务/数据导入。

本目录8静态叶，仅ordinary05_roles.py和ordinary05_roles_job.py形成后继，6份原helper/history逐字复用。host仅PHASES.restore可用，固定新key与独立rollback-only格式；角色模块无prepare/verifier/desired入口或随机密码生成。新host/inner两层都只是回滚授权，roles-authorization.json是新ORIGINAL41_AUTH_ROLLBACK_ONLY票据，完全没有controllerValidUntil/backupAdminValidUntil等临时登录字段。原0980仅对私有CUSTODY/authority.json作准确历史绑定，不重签、不按过期旧窗造now。

还原继续调用原stopped/pg_controldata、snapshot_sql、capture、validate_snapshot、change_sql、offline与完整before/after比较算法。只准当前完整状态等于原snapshot或自有finite snapshot，再用change_sql(after,before)恢复两个原role verifier+expiry，其他4角色boundary/member/settings/runtimeAuth不动；完整原值读回相等后才成功。private stdout/stderr/COPY均沿原私有路径，不导出原/finite body或其摘要，不写任意SQL/DSN/role。旧apply/policy/fund等业务不进入该作业。

原41 snapshot/capture不改内容；独立新attempt/restored叶 original-auth-rollback-attempt.json / original-auth-rollback-restored.json，新capture槽rollback-before.csv / rollback-readback.csv。旧Restore41请求和旧restore-attempt/restored叶须未使用，不伪其成功。原原件存在、O_EXCL、防重放和未知只能按原key读回规则保持。

入口分层：host.validate及roles.validate都是纯票据形状/时间校验，便于Main和宿主实际调用；host.verify_current_stop用固定/srv宿主路径核真实snapshot stat9，容器内roles.assert_entry才对/var/lib私有路径核同一stat9，没有取消任何等式或改全局CUSTODY。inner/outer必须同一真实起止和3文件stat9；source中没有补造任何inode/mtime/未来票据。真实fresh按 original-auth.json/finite-auth.json/applied.json 三个固定路径只stat采9项，Main/CAS共同绑定，原body/digest不读。

安全前提直接读真实Ccbf6/epoch13:42:13/proofc31、ACK与自然结束cleanup9b53全flags、原DATAdev66304/inode13502421/PID缺席、DockerStoppedPID0/image与operation、Apply73ca/cdc、原锁/无其它op。d771仅guardian闭合实证，不伪造Stop或confirm成功，也不把自然到期当认证恢复。

维护容器仍原network none/read-only rootfs/cap限制/固定mount/512m与own cleanup；HOST220+reserve80、inside200/offline step30与原300请求预算保持。角色新权限票据最多15min，不改任何原temporary validUntil。结果仅原安全receipt与own-container cleanup；内层会真实标注旧hard是否已错过，原私有旧材料全保留。

46项本机必要SOURCE检查通过：原SQL/捕获/还原核心、容器与清理算法AST不变；只移除apply分支、增加准确新票据/闭合来源/新私有叶，旧有限登录票据和apply入口被拒；角色validate不访问容器路径，内部assert_entry的stat守卫仍在。没有PG/服务器/时钟签发/票据或运行正例。本SOURCE未运行，独立QB和Main真实fresh/15min审批/注册后方可执行。Root120→121/Main-only issuer由D1独占，T45唯一server owner。
