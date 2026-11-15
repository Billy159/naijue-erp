# R3分批导入首批源码检查点

本目录只保全已交付源码WIP，不是新的开发底座、可安装闭包或生产发布包。D1数据库模型160为预期值，未PG安装；D3的CLI/SQLite/事务替身定向检查不等于真实COMMIT。宿主物理准入和resume仍在单独实施。

当前状态只读 docs/rapid-launch-20261022/TASKS.json 和原角色新目录；不得直接执行这里的SQL或从旧整包单事务路线续办。原源文件未修改，未包含真实数据包、密码材料、数据库或媒体。

当前已知源码阻断：独立静态复核BATCH-CORE-ROLE-01（CORE INITIALIZER内部调用IMPORTER-only inspect）。DB-CANDIDATE-01=NEED_FIX，D1另版本修复，禁止执行本快照。见同目录DB-CANDIDATE-01-REVIEW.json。
