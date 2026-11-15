28 已完成安全收尾，原两个维护角色的认证字段及原期限已真实还原，未把自然到期记为恢复。

原 CAS 登记和 apply28 均完成。start28 实际创建了服务、发布 C/ACK，随后 genuine describe 在 COMPILE_BEGIN 之后返回 exit2；没有触发150秒超时。源码加载耗时约30.43秒，具体内部错误仍未知。原进程已回收，typed AFTER 清理确认容器停止、原PGdata保留；最后原键读回无PG进程标志或在途操作，数据库仍停止。

一次获准的已存190B/673B文件安全投影，只得到 state=UNKNOWN、safeCode=BATCHED_INSTALL_PREFLIGHT_REFUSED、SQLSTATE=null。原catch没有保留下层异常类型或系统code，不能凭此断定具体前置。没有重跑Node/工厂或重复读同件。

本轮所有原键均未重放；未重新物化703，未提交安装、真实导入或应用切换，业务验收未完成。所有旧候选、失败和恢复回执保留。主控已交原D1静态追踪；下一步仅准备调用器外层catch的安全分类草案，不开启新服务或时钟。

实际证据和精确SHA见 RESULT28-CLOSED.json；重要原件：start/READBACK-01.json、restore/READBACK-01.json 以及各自 receipts。
