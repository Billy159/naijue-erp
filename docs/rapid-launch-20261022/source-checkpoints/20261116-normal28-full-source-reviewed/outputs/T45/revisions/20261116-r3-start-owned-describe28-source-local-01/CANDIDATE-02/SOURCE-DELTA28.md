28 源码增量及消费者说明

本候选仅本机源码实现，未连接服务器、PG 或运行 genuine 工厂；未签发未来授权、未登记或执行 28。准确委托为 Main NORMAL28-START-DESCRIBE-SOURCE-01/TASK.json（778e6550），接口依据 D1 REPORT.md（5865c316）。旧 27/CANDIDATE02 及全部失败、收尾证据保持原样。

入口改动
- start/bundle/normal_service05_after08.py：入口先记录真实 monotonic，Linux 主入口再按自己 /proc/self/stat 的实际进程出生 tick/CLOCK_BOOTTIME 向前收紧起点；载入 carrier/authority/proof/main、前驱核查、容器启动和 ACK 时间都占原 190 秒。host 不重新起算。原 300 秒作业和 110 秒清理预留不变。
- 在实际 C/ACK 后、normal-service-result 成功落盘及 handed_off=True 前调用固定 pin 的 start_owned_describe.py。调用前实际 work_left 必须严格大于 170 秒（158 秒桥接上限 + 12 秒发布/末次校验余量）。子进程是 150 秒 + TERM2 + KILL2；既有 expiry 若更紧也同时限制。余量不足经原 finally 收尾，不借 service outer 池。完成后重核同一 carrier/C 原字节/ACK、真实剩余时间，最后才允许 handoff。190 秒和清理最坏路径的现场耗时尚未验证，不把预算静态计算写为实测保证。
- start_owned_describe.py 作为第十个固定 stage 静态文件 root0400，不新增作业或平台。容器内固定 root Python 是真实 Linux subreaper，Node 在该容器 PID namespace 内拥有独立 process group，原生退出与所有自身存活后代实际回收后才记已回收；超时 TERM2/KILL2，未确认保持失败。主机 Docker 客户端退出只记该客户端，不冒充 Node 进程族证明。原 C 不重写、不刷新 checkedAt。

真实描述和安装窗口
- start/install 两份 batched161-run.mjs 逐字同版。仅 describe 分支在原 genuine source load 返回后、target/compile 前取一次 Date.now，expiry=min(t0+20分钟、已验证 apply 的 admin 截止、实际 C lease)，将完整 used payload 和原 descriptor/liveFacts 返回。150 秒仍包含 source 加载，未实测是否够用。
- install 分支不重新取 now，不刷新三个原时间字段；仍用签名 outer 的窗口、同 genuine target/compile 和完整 descriptor 深相等。D1 C03、OP703、SQL/模型、品牌、九字段授权均未修改。编译在这里指现有 genuine 程序描述计算，本轮没有运行它或进行发布构建。
- 原生 liveFacts 的减35秒字段原样保存；reader 另生成既有 Main 消费用 normalized liveFacts，明确原保守值和 C 的真实 lease，原文件不改。描述结束后主控还必须满足原 900 秒内层签发余量；不延时、不自动再描述。

输出和原接收器
- 精确四项成功输出：genuine-describe-payload.json（<=65536）、genuine-descriptor.json（<=131072）、genuine-live-facts.json（<=131072）、genuine-describe-process.json（<=65536）。前两项及原 liveFacts 独立 O_EXCL 存到保护 boot 和 worker/results；process 由容器真实执行创建，再由 host 原样复制。每项 root bytes/hash/固定 leaf 进入 normal-service-result.describe.outputs，主体仍在原 65536 上限内。
- stdout 131072、stderr 65536 在读取时限界。原始日志只留 boot 私有文件，公开只含实际退出、回收、输出类型、观测字节数、有限错误类别/SQLSTATE（无证据为 null）。空/坏 JSON/非零/超限/超时/存证失败均不交接。部分输出保留为失败证据，不覆盖重试。
- 已读 Main 原 exporter：export() 会解析 JSON、按 redacted() 再 save(indent=2) 输出，因此公开字节不能假定等于 root 字节。producer 同时限制受保护输出及公开排版大小；reader 对 root boot/worker 逐字与 refs 哈希核对，对 public 分别记录真实 sha/bytes 并核对象相等。没有改 exporter/权限。当前四种输出字段均不含秘密认证材料。
- read-current-phase28.py 只读取已存输出，不执行 Node/describe。固定四个 leaf 和逐项边界，合计保护输出 <=262144；原件按实际 root 字节导出，另导 DESCRIPTOR/PAYLOAD 和 normalized LIVE-FACTS，返回原始与 normalized deadline。失败时已有公开 process 收据也只读导出。未创建后台 describe 或第八个 job。

前驱与命名空间
- 28 的真实前驱是已成功并停稳的 27：C2640ef4d、CID6c8f、epoch18:38:29.737044；start ba1c/4446、stop2dc4/62ca/fda7、restore957f/9e2a（root90e8）。维护 prepare 对照原 27 original-auth；没有沿用 24/26 为直接前驱。
- 原 install 和 writer 业务 key 均不变。只同步 current28、ordinary28、proof projection、private projection 及依赖 pin。复制父包的 install/writer stop helper 仍写 current22（inspect_birth 实际消费这些常量），writer runtime 也留22；本次只把这些被当前28消费的服务/路径常量配为28，历史22/23/19原收据、原READER和旧接口标识保持，不重做旧检查。
- OP703/cdcaf物化和 materialize 原键保留在 PHASES metadata，materializeNeverResubmit=true，冻结运行器的可执行阶段仍不含 materialize。原26类/511234行、f4b86、INIT/index/access plan 未重扫/改写；未新建 DB/角色，未跑任何 writer。

Main 所有权及仍需其配对
Main 独占新 registry/module/templates/issuers。T45 仅交付 PHASES28.UNISSUED/静态包及 reader/runner。Main 后续从新 scope/前驱和 pins 生成自己准确的 finite 输入，使用 reader 已存真实 DESCRIPTOR/LIVE-FACTS/PAYLOAD，不再派原同步 SSH describe27；保留原授权、角色、CAS/清理守卫。原 exporter 可直接导出新增四个非敏感 JSON，无需放宽16MiB或 reader 边界。新增 scope、pin 与全部实际文件一致后仅交原 QB 增量复核，不重复 D1/SQL/整数据或旧已过范围。

已检查：Python/嵌入 reader 语法，真实 Node24.21.0 --check；本机真实 POSIX 子进程的退出0、非零、stdout/err 超限、超时和回收，见 LOCAL-CHECKS28.json。没有 UID/时钟 mock。一次早期本机 signal0 探针返回 EPERM，已去掉不必要全局探针，并按真实拥有的进程关系核回收；最终本机小检查已通过。Linux subreaper、Docker namespace、实际150秒描述、900秒签发余量、完整清理和后续安装/REAL/业务验收都尚未执行，不标 PASS。

CANDIDATE02 追加：本次主控要求的同一次执行阶段证据

仅 describe 的原 caller 在实际 IMPORT、TRUST、SOURCE_LOAD、TARGET、COMPILE 前后，向现有私有有界 stderr 输出10条固定阶段名及真实 hrtime 耗时。无输入值、路径、私体或凭据；安装分支不输出、不取 trace 时钟；stdout仍是原一个JSON对象，descriptor/liveFacts本体与其哈希不加 trace 字段。helper从65536内私有stderr仅提取固定顺序、有限非负递增时间，放在现有独立 genuine-describe-process.json 的 describeTrace/lastReachedStage。超时/非零仍保留最后到达点；成功的非空stderr不算失败，不新增leaf、job、探针或数据演练。当前没有真实阶段运行证据，只有源码/语法和文本解析检查。CANDIDATE01原件和已过5项本机捕获检查保留；本次 capture 函数 AST 未改，直接复用，未重跑这些已过项。
