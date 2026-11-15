# BATCH-PG-CLEANUP-01 的02后继

01原件及42103eb9…PINS保持冻结，原NEED_FIX结论保留。02只将已知失败、fault、权限/信号、未停机/未reap、工作/总时间及allocated空间条件合并到rmtree之前，只有最终成功且实际停机回收确认才删除。目录、库名和未消费实例目标沿用，真实SQL场景、资源上限、安装链和权限均未改。下面原harness说明继续适用，启动命令只改本目录02路径。

纯内存定向检查check-cleanup-memory.py仅提取原/新finally AST执行，用内存进程、时钟、文件系统替身复现01的171秒删根P2；02的9个已知失败/资源条件全部保根，正常收尾仍可删。检查无PG、无进程启动、无文件修改。旧SQL/CLI/652输入未重审或执行。02待QB只核该finally差分及结果。

# 162行分批SQL-core单次隔离PG评价源码

当前状态为源码准备完成、待QB检查及主控一次精确执行许可。当前PG执行0、服务器动作0、ATTEMPT消费0。此目录没有运行结果。06收尾异常已获局部复核，旧scope继续复用。

本次采用主控明确选定的smoke-base 162行纯合成包。manifest为d0ec7f649304d9f0e069f1e9d0f527e72c1d4bd4cff85f9cfc26c156377e254e，fixture.json中的admin、scope原件和全部源文件保持原字节。现247行V2包需要尚未完成的161 genuine admission，所以162场景沿合法非V2路径完成。V2厅推定、六条金额差异及保留结算的新PG证明继续等待真实宿主增量。本次直接受限PG client及真实D3 kernel只能证明SQL-core范围。

## 固定实例与安装

TARGET.json固定单库demo_8877_d3_batched_20261115_01、新临时根/tmp/d3-batched-core-20261115-01、Unix socket端口55491。listen_addresses为空，socket权限0700，临时根独占新建0700。停止回执记录本次实际spawn PID、postmaster.pid等值核对和真实exit。controller仅有原INITIALIZER、IMPORTER的SET能力，owner为NOLOGIN，当前runtime权限沿D1原recipe。bootstrap仅用于建这个隔离实例、安装及观察，正向业务写入全部通过受限controller与真实SQLkernel。

安装链在INSTALL-ORDER.json中逐件固定。先用D1 LOCAL-SQL-CORE-RECIPE给出的准确build-sql39原生成器，仅改两处source定位到指定T45底座，已在本目录生成base-install.sql。生成器旁产物留在builder目录，实际安装清单只取base-install.sql。随后按D2精确INSTALL-ORDER逐件安装12层，实际读取155前驱，再由原owner安装DB-CANDIDATE-02/sql/source-slices.sql。该文件已经包含最小组ACL。02 PINS是4589d0816e3ab24317a47263ac4c45a23fc13ee9b3bfd6795080affa6bcc6531，01及其他评价SQL不进入此执行链。

catalog-fixture.mjs先在真实PG核全部155前驱，再在scenario入口核161实际函数。每个签名按原normal规范匹配，逐项比较prosrc摘要、pg_get_functiondef摘要、owner和ACL，并精确比较35表名称、owner、列数、RLS属性，检查351列、114索引、326约束、570触发器的安装数量。该比较直接读取真实pg_catalog，不用prefix155或expected文件充当实际读回。本harness不提供完整生产catalog准入或全部非routine定义重审。当前161仍是待执行预期。

actualTarget由本次真实PG读取SID、OID、database_name及实际函数定义观察摘要构造。原162输入经当前T45 streamPreflight、prepareStreamPlan，再经D3 buildStreamProgram({coalesce:false,batched:true})、磁盘planner、coordinator和SQLkernel。sourceCounts取summary.counts，sourceTotals取plan.totals，scope与admin来自原fixture。没有临时DTO、假admission或proof stub。旧162或247提交结果不转签。

## 单链六项观察

| 观察 | 必须取得的实际事实 |
| --- | --- |
| 安装161 | 真实155前驱及161定义、body、owner/ACL和35表结构库存匹配 |
| CORE及成功前缀、半组提交拒绝 | INITIALIZER CORE后IMPORTER complete，多个前组真实提交；在含多个完整文档请求的HISTORY组首个原请求执行后注入真实COMMIT，23514拒绝并回滚当组；新连接原锁inspect确认CORE COMMITTED、失败组ABSENT，前缀和库存快照保持，历史原生表仍空 |
| 真实提交、客户端应答抑制 | 同一subBatchId/op/key重做原组并完成，真实pg.Client已经收到COMMIT ACK后，在它与协调器之间抑制回复；协调器UNKNOWN且discard，新连接原锁inspect读到COMMITTED；明确不是网络断包实测 |
| 错误描述、actor、输入和历史/兄弟来源拒绝 | 错digest、错manifest、外部privileged session、错兄弟前驱，以及已提交原请求的source_key冲突均以实际SQLSTATE拒绝，实际快照不漂移；actor样本是privileged foreign session，并非另一同权限controller |
| 原键恢复与文档组原子 | 第三次从同一只读SQLite对象续跑，跳过全部成功组，只提交FINALIZE；原receipt ID/request_key集合完全一致；多原请求HISTORY receipts真实xmin只有一个，半组失败前已有完整单据的原生写入也已整体回滚 |
| 最终数量、金额、库存和关系 | 新连接原reconcileWholePackage/verify_v2及其确认ROLLBACK返回VERIFIED，核原sourceCounts/sourceTotals/库存覆盖和文档关系；FINALIZE前无最终publish receipt，FINALIZE后才出现；businessReady=false，未测试生产服务开放 |

半组COMMIT与应答抑制是本地受控客户端故障注入，函数调用、约束、事务、原生表、receipt、xmin及新连接状态全部来自真实PG。脚本不在内存模拟PG状态。某一观察失败立即结束该次场景链，保存已取得的安全观察。没有性能循环或16个环境。

## 单次资源与收尾

run-local.py复用既有D2守护和子进程方式。170秒工作、180秒总时限，PG每语句40000ms，pg客户端响应42000ms。allocated scratch按st_blocks*512每50ms采样，3GiB上限沿原512MiB提前停机余量；它不代表RSS。日志和安全回执合计控制在2MiB，保留16KiB用于失败/清理最终回执。stdout只输出一份有界汇总，原PG日志和SQL参数均不导出。子进程清除ambient PG/NODE注入变量，临时目录放到本次受监测根，PGPASSFILE指向该根内0600空文件，客户端使用Unix trust和空连接口令，避开个人凭据文件。

成功使用SIGINT关闭postmaster，失败或资源守护使用SIGQUIT，postmaster始终不使用SIGKILL。只对本runner创建的其他直接子进程组使用SIGKILL。按剩余180秒预算逐项wait/reap，信号PermissionError保留errno和PID。成功且PG exit0、postmaster.pid消失、全部直接child已reap、无signalErrors/权限错误时，才删除本次新临时根。所有失败保留根供原owner处置，权限错误或停机未确认必保根。数据、备份、旧作业和其他目录不进入删除范围。

RUN.json记录core完成、等待最终cleanup；实际成功以RESULT.json、CLEANUP.json及进程exit0共同确认。CLEANUP记录实际postmaster/direct-child exit码、reap、signalErrors、权限错误、分配峰值、工作/总耗时和保根状态。未确认项保留STOPPED，不能由预期模型、PENDING_TRANSACTION或客户端不可见推成成功。

## 静态准备与唯一后续命令

已完成base安装SQL生成、Python语法解析、两个Node文件--check及catalog-fixture静态模块解析，最后一项仅import，无client.connect。旧CLI05、6+2+3等测试未重跑，PG和全511234编译均0。INPUT-PINS复用上游370文件既有摘要并固定本次脚本、12层、DB02、162输入、参考原件、Node/PG二进制及pg8.23.1传输依赖。此处只复用node_modules传输库，业务源码采用当前T45/D3固定件。

主控在QB核准确harness之后形成一次许可，届时唯一命令如下。当前不执行。

```sh
python3 '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D3/20261115-r3-batched-pg-local-02/run-local.py' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/e5c5a762-cleaning-intake-20261102/complete-source-20261103-typecheck-20261104-01/actual-pg-browser-20261104-01/vendor-input/pgsql/bin' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/node_modules'
```
