ordinary40 根端五步维护 SOURCE；待同 QB 的新根增量配对复核，尚未登记、签发或执行。

唯一五步顺序为 apply → start → upgrade → stop → restore。没有 prepare/import/writer，也没有新 writer key。保留实际 root7cab 的110旧键和3处原保护，候选仅追加5键至115。旧 FAILED writer、诊断01、39快照和历史回执不重放、不覆盖。源码/暂存通过不代表 SQL 安装、STAGED 可见、发布解锁或真实整批导入完成。

绑定 T45 Source02 7db507149e2c6c6187e033839dcc7faffa54f331cb7c0fdd828d6ede6872df16、interface fe47f538d3dad023ed45702c3fa0314f5ad63694d23085a16e18e35b8d606fd0、phase c6491825b7e81ce52bfbcdd33952599e0b0584a059936b68fe935a2f77266b71。消费者 C01 FIX 回执65c7667606f40aa7931194142227e73881b660b2c6a136dfbb736fda489ff618；原 acfb/332c 保留。本目录不拥有或改写消费者。

Main 注册入口：issue_registration.issue(review_file, review_pin, basis_file, basis_pin, output_directory, consumer_review_file, consumer_review_pin)，保持七参数。根联合复核必须绑定最终本目录 SOURCE-PINS、消费者 Source02、同一 consumer FIX 回执并 rootPairReviewComplete=true。该函数只在 Main 实际调用时读一次时钟；源码阶段未调用。政策原五字段 format/grantId/startsAt/expiresAt/jobs 不变。父预算5100s；原两角色名不变，apply/restore 共用同一实际动态 roles-authorization SHA。有限注册权600s；角色 apply900s、controller3600s、backup3720s、restore4500s，相对于 Main 实际起钟，源码没有时钟值或授权样例。

Main 阶段入口：issue_phase.issue(phase, rules_file, rules_pin, registration_directory, evidence_path=None, evidence_pin=None, predecessor_path=None, predecessor_pin=None)，保持八参数。rules 为本目录 FIVE-PHASES.UNISSUED.json 的最终哈希。每阶段输出到注册目录/phase-<phase>/，私有文件0600、目录0700；存在即拒绝重签。apply 不需证据；start 的 evidence 是实际 apply 读回；upgrade 的 evidence 是含 apply/start/operatorReadySha256 的上下文，predecessor 是原 install32 读回；stop/restore 的 predecessor 是实际 start 读回或 restore 已证失败路径的 None，evidence 是实际对应停止/清理事实。保留原失败 start 的 pre-container/post-ACK、早恢复、精确原认证恢复验证。

upgrade 只消费实际 start 保存的四叶 genuine descriptor/live facts/payload/process，不另跑描述器；无 PG 的描述器不能证明 SQL 已安装。历史 installed catalog cf27/9f/626、当前编译 before6ef/未来 target spec/626、after ada8 分开。精确三函数、原 SQL daf3784、审定输入 faaa57、before/after/model/owner/ACL 等仍交原 T45 host/native 校验；旧内层 decision 标签保持原合同而非扩大运行范围。Root08 marker5bb 是物料完成，不是 SQL 安装证明；Diag02 的三 prosrc 观测不冒充 definitions。

原通道定义：prepare_channel.prepare_local()（仅本地准备一次）→ stage_and_read(review_file,review_pin)（T45 实际 staging 与只读 fresh）→ Main 七参数 issue → prepare_channel.register_once(registration_directory)（T45 唯一 CAS）。本次未调用任何这些函数。fresh 持原锁，读实际 root/history/ACK39 和5个旧私域快照 stat9；ACK39 d035 仍只是预期，须实际原字节读回才可通过。snapshot 内容与摘要均不读取。检查本轮40独立 capture 未存在、原 PGDATA 停止、所有新键缺席。CAS 沿原锁/审计/原子发布机制，不提交维护任务；不确定结果只读原审计，不盲重试。

随后由 T45 在自己的执行副本组装 Main 真正签发的动态叶，复用原 phase_cli.execute(phase,policy_file,policy_pin,authority_pin,output_directory,supplied_phase_args=None)，唯一 argv=[实际授权SHA]。不得直接对冻结 SOURCE bundle 写动态叶；执行目录及逐阶段实际读回由 T45 协调。Stop/Restore 安全收尾必须实际完成，不能仅凭升级源码检查通过宣称已恢复。

本轮仅本地受影响源码检查；0 server/clock/issuer/role/PG/SQL/native/application 调用，无未来 C/epoch/角色临时值/窗口/authority 正向样例。已验 SQL91、Root08/诊断事实、H01/20+21/36/68、旧角色算法与消费者检查直接复用，不重跑。新增数据库测试仍由主控协调。前端、共享合同和业务数据未修改。
