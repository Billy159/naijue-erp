# After45 原业务根只读观察源码

本机源码冻结，未签时钟/AUTH、未注册、未连接服务器或执行PG。

复用成功durable02的单用户-I/-S/UID61035/无补充组、RR READ ONLY单SELECT与ROLLBACK、锁/28GiB/210+90秒和clean收尾机制。只变更准确45回执/停库前提及固定查询投影。PG单用户启动/关闭可能有物理文件写；不称PGDATA零物理写。

查询先按原root ID、两个batch ID定位，冲突不筛成ABSENT；同root分组以distinct descriptor统计，成员、前驱与审计闭合只返回布尔/计数/闭合phase枚举。3fbb为batchedPlan；marker.identity.planSha256按原afa9。未知descriptor期望不猜、不读取initializer/SQLite、不重prepare44910。

删除旧35表空库计数/升级前函数体及catalog门槛，复用实际SQL42升级证据；不调用SECURITY DEFINER导入inspect。

Python编译及必要源码差分已核；未安装SQL解析依赖，未执行PG，真实PG结论仍未知。所有观察状态均不授权FIRST_WRITE/RESUME/导入/发布。接口见INTERFACE.UNISSUED.json。
