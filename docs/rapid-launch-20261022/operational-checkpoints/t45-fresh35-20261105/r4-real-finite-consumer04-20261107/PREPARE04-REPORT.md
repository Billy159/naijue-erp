准备仍未通过；目标库已停稳，文件权限已恢复。

2026-11-07 12:58:40（北京时间）只读回查确认：PREPARE04 FAILED/2，耗时552.278秒；Node退出1并已回收。PG和原守护进程均已退出，cleanShutdown、cleanupComplete、dataPreserved均为true，errors为空。45项元信息逐项恢复，账本为restored，两份秘密投影不存在；原认证配置保持原样。

实际失败处为离线预检：现有issues.jsonl记录PREFLIGHT_IO_OR_FORMAT_FAILURE，技术文件tables/season.jsonl，row=null、field=$；summary.json未生成。CLI返回IMPORT_FAILED/NOT_STARTED，未生成17字段绑定。原安全映射未保留底层异常类别或SQLSTATE，根因仍未知，不据此判断为数据、权限或数据库故障。122880字节索引及全部现场报告保留。

2715次空间采样的最大间隔为0.2304秒，最低可用空间约5.84GB，未触及原0.25秒或4GiB界限；本次不能记为监控阈值或性能失败。

原应用未切换，未提交EXECUTE或重放旧键。下一步由原源码负责人针对准确报告定位并交固定后继，再由主控登记新有限窗口。旧维护凭据引用仍root0600保留、内容未读，退役尚待收尾；角色原期限为13:03，不自行延长。准确版本、原键、哈希与证据路径见PREPARE04-RESULT.json。
