27 窗口收尾已实测完成。2026-11-16 03:52:16（北京时间）只读现场确认服务和两个维护容器均停止、无数据库进程标志、无 56791 监听、无在途运维单元。

原恢复键 t45-r3-ordinary27-auth-restore-20261116-01 已 COMPLETED / exit 0，耗时 7.225205 秒，完成于北京时间 03:47:04。受保护叶子私下核验两个维护角色的原认证字段及原期限已还原；业务运行账号、成员关系和其他角色属性未改。凭据正文未导出。已受理操作没有重放。

当前未完成的是 genuine descriptor/live facts：原描述失败，原 stderr 未保留，根因未知；唯一获准追加诊断只证明 Node 在 20 秒内没有返回输出，不能证明改成 150 秒即可解决。

安装和真实导入原键在两份授权区均不存在。本轮没有提交安装、真实导入或应用切换，正式上线与业务验收尚未完成。

准确证据：restore/READBACK-02.json；restore/FINAL-CLOSED-01.json；restore/receipts/release-receipts/t45-r3-ordinary27-auth-restore-20261116-01/；完整索引见 RESULT27-CLOSED.json。旧失败和待确认记录保持历史原样。
