现有 start 作业内完成真实只读 describe：最小接线方案（仅本机提案）

原 27 已实际停稳并还原两个维护角色的原认证字段，完整结论见 RESULT27-CLOSED.json。本方案未修改运行源码、未签发新时钟、未登记、未启动下一窗。旧 27 原键及失败证据保留。

1. 修改位置与顺序
在 start/bundle/normal_service05_after08.py 的 host() 内，await_retained_ack() 已确认实际 C/ACK 后、normal-service-result.json 成功落盘和 handed_off=True 之前，调用一个固定的、受保护的只读 describe helper。继续用原 start 300 秒受控作业，不加后台作业、调度服务或平台。失败留在既有 attempted and not handed_off 收尾路径；不把已有 C/ACK 当成下一阶段已可用。

主文件当前 60,345 字节，既有读取上限 65,536 字节，余量 5,191 字节。主文件只加受 pin 绑定的 helper 装载、预算核对、调用和结果哈希接线；完整子进程控制放到独立 helper。原 start stage 固定列表目前 9 项，增加第 10 项 root:root/0400，继续走已有 bundle/registry 的精确名单和哈希校验。Main 对其自有 issuer/登记输入按实际新 pin 做配对；不从任意 CLI path/hash 加载程序。

2. 预算
保持原作业 300 秒、HOST_WORK_SECONDS=190 和 110 秒清理预留。Node describe 上限提案 150 秒，TERM/KILL 与回收最多 4 秒，额外保留 10 秒给状态再核、输出落盘与结果交接。真正启动 describe 前，以原 start_work_left(deadline, authority.expiresAt) 实测余量必须大于 164 秒；不足即停止该阶段并按原失败路径收尾，不挤占 110 秒，不延长角色或服务期限。内层 docker/解释器桥接上限提案 158 秒，仍受原主作业与清理约束。

原 start27 的 6.138 秒是历史实测，不能证明每次都会在相同时间完成。20 秒诊断的内部耗时阶段未知，150 秒仅是有限预算，尚无实际成功证据。此次 150 秒不是早前分片上传的 600 秒预算，不更改后者。

3. 真实接口与输入
复用原 batched161-run.mjs 的公开 describe 分支及已物化 source7033/381 文件、cdcaf09a 物化收据，不重物化、重打包、构建镜像或安装依赖。该分支会调用真实源加载和 compileFresh35Batched161Upgrade，再 describeFresh35Batched161Upgrade；属于程序描述计算，不是另一次发布构建，不创建 PG client 或运行安装分支。

实际 Linux/UID0/Node24.21.0、--no-global-search-paths、隔离环境、原准确目标及 fresh C/CID/StartedAt/postmasterStart 都保持。新服务代际需要调用器内的 serviceKey 固定值和对应 pin 随准确候选改动；不复用旧 27 C 或冒充新 pair。请求仅含 service、backupAdminValidUntil、installStartsAt、installExpiresAt；不传密码、DSN、任意 SQL 或回调。窗口保持不超过 20 分钟且不超过真实 service/admin 截止；不足现行安装前置预算便拒绝，不生成可用描述。

4. 结果与错误
验证实际 child exit=0、PROGRAM_DESCRIBED_NO_PG_OR_WRITE、databaseConnections=0、mutations=0、descriptor/liveFacts 的准确 service/source/target/program/catalog 绑定，再将 descriptor/liveFacts 和检查摘要按 O_EXCL 落在受保护 boot 目录，生成其 SHA256；交接前重核实际 C/ACK/容器身份与存活。沿用 root/public 结果与读回器接线，公开仅准确摘要/哈希和失败阶段，私有 stderr 不直接输出。

stdout 131,072 字节、stderr 65,536 字节的界限应在读取时执行，不能 communicate() 全量缓存后才断言。超时/超限/非零退出/错误 JSON 均保留准确阶段、退出码、可证明的 SQLSTATE（没有则 null）及有界受保护错误回执，回收确切 child。保留原 genuine liveFacts 中的保守 deadline 字段，另列 C 中真实 lease 的值和来源，不静默篡改原对象。

5. 失败、未知和清理
描述失败或交接前持久化失败，仍由既有 finally 清理本次准确容器、保留 C/ACK/数据/错误；实际清理失败则报 UNKNOWN，不补造关闭事实，不运行安装或 writer。恢复仅凭原键终态、受保护清理读回和真实资源检查，原两角色还原继续沿原受控渠道。响应丢失只读原键，不重提 start、setup 或其他历史键。

6. 只核新增范围
后续先由原 owner 实现 helper/小接线和 Main 的 pin/issuer/读回匹配；原 QB 仅审此次增量，复用已过正常链、D1、13SQL、来源与映射证据。审核闭合后才由 Main 决定新的有限窗口，T45 唯一现场执行。未来实际验证须分别报告 start、genuine describe、cleanup；源码或描述成功均不等于安装、真实导入、业务验收或正式上线通过。本提案到此为止，不启动上述未来步骤。

准确基线文件、SHA 与预算数字见同目录 BASIS.json。原 describe27 dee8 的失败和唯一追加诊断都保留，不把提案或未来结果回填为旧运行成功。
