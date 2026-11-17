本次交付是 D1 对实际维护42之后数据接续的源码梳理，不是运行授权或可执行后继包。只读了本机已有源码与安全回执；没有 server、PG、clock、issuer、CAS、Node、APP 部署或新数据库测试。业务 writer key、下一次 service key、策略、C、epoch、窗口和授权均未选择或生成。

已核事实是：Root127 的实际 dispatcher 为3a3c1b0e…；Upgrade42 已 COMPLETED/0，真实 COMMIT ACK 和 postCommit 独立只读读回确认三函数 SQLdaf37843…，模型ada8f334…、目录sourceSet a5f72174…、spec aefbfd2e…。Stop42 已 COMPLETED/0，C90bf… stopped/PID0，PGDATA保留、端口缺席；restore42原键本机读回已 COMPLETED/0，原verifier/expiry私密核对成功，角色属性、成员关系和runtime认证未改，ownC4dc3… stopped/PID0。T45已报告五阶段全部完成，最终owner汇总以其实际交付为准。准确回执路径和SHA均在 ACTUAL-BASIS.ANALYSIS.json；D1未另做现场复验。

Root08 的392文件/rows3b8b77e9…/compact sourceSet ac85caa5…物理源码已经存在。它的marker5bbfe6fa…仍如实记录“物化动作未安装SQL”；不能回写该历史marker为升级成功。新Upgrade42回执单独证明后来安装的新目录。APP289本地包0abef69a…和native e041e3fe…已构建完成，不需要重建或重跑Node旧检查，也不把它当部署或业务完成。

最小路线优先复用已成功的 prepare05。RESULT-PREPARE05（4709f62e…）记录计划44910步、batchedPlan3fbb2d3a…、steps45a764df…、initializer b0d291c8…，manifest7ebdac46…、namespace naijue:tplus:20261102、cutoff 2026-11-16 11:40+08、原业务operation和batch身份保持。原SQLite与original-initializer留在原05目录，旧preparedBinding原样保留。现有 buildFinalR3ExecutionBinding 明确支持只刷新当前C、epoch和catalog evidence，并加入原preparedBindingSha256；verifyFinalR3PersistedProgram逐项验证原plan/steps/initializer/manifest，runFinalR3Writer03不打开源index、不重编steps。因此模型升级本身不要求重新执行完整prepare。若未来真实读回发现原计划或输入不符，停止交主控裁定，不能自动重建、换身份或重新导入。

必要差分如下；这些改动尚未实施到候选或T45文件。

| 位置 | 实测旧约束 | 必要变化及保持项 |
| --- | --- | --- |
| NORMAL39-SOURCE-SUCCESSOR-02 的 prepare/writer `final33_host.py`：OPERATOR、SOURCE_ROWS/SOURCE_SET、scope、run | Root07/387/f9a7…，旧marker状态 | 新隔离消费者使用真实Root08路径、392/rows3b8/ac85/marker5bb；同一目标PGDATA/数据库/原输入/custody不变。读取Root08历史marker与新Upgrade42证明分别核对，不改原marker。 |
| 同bundle `source_lineage.py` / `source-catalog-lineage.json` | 历史cf27/9f/626与当前db127/344/626模型相同，onlySourceObservationTagChanged=true | 新独立lineage明确Root07→Root08三叶替换+五新增及三函数模型变更，绑定真实升级42的terminal d6e9、rootresult edde、completion5e6f、SQLdaf和a5f/aef/ada。旧35安装回执和historical_applied_catalog_successor仍保留原意义；不能全局把旧model626改成ada或继续宣称modelAndGuardSQLUnchanged。 |
| 同host `applied_catalog_successor()` | 仅旧catalog35+Root07源码lineage | 在原历史验证之后消费新的升级42成功与capture/COMMIT/completion/前后catalog、root-public对读及三函数属性证据，当前目录是ada；不执行升级SQL，不把42时C当新一轮live C。 |
| 同host `original_prepared()` | native旧preparedBinding==originalPreparedBinding；还要求native旧executionBinding==本轮expectedBinding（约705行） | 第一项不变；第二项改为旧executionBinding核对其准确历史witness，新expectedBinding须由现有API对原preparedBinding+真实新C/epoch+Root08目录派生。旧native结果/旧executionBinding不改写，不拿新binding冒充旧件。 |
| 同bundle `final33-run.mjs` | OPERATOR_ROOT Root07与387/f9a marker；mount/WRITER为旧FAILED key | 仅新隔离caller指Root08和正确marker；未来transport writer key由Main选择后精确绑定。继续调用原runFinalR3Writer03/Readback03、persistedScope与原计划路径；原业务operation/request/批次身份不变，旧FAILED外层作业绝不重放。 |
| 同host `registered_authority()`，Root/Main/CLI/observer配对 | 强制direct39及apply/start/prepare/writer/stop/restore六phase，prepare05仍在执行集合 | 由Main明确下一scope后，完成prepare05作为历史只读前驱，不能再次派发。最小实际动作可采用apply→新start→writer→stop→restore，保留现有预算和安全收尾算法；不在本报告预选策略或新键。Root从实际127基线只增获准新键，保留全部旧键/三guard/失败记录。 |
| 新start前驱、两份retained-stop、publicproof、clock/loader | 旧39/41/42静态service/helper/policy pins | 只在准确新source冻结后派生同一新start字节、helper pins、HOST_BOOT/proof路径和正确policy literal；前驱是真实成功start42+Stop42+restore42。work=proof共享lease/ACK/result，outer=startAuthority lease，差35000不变；publicproof0444/root:root/nlink1/canonical，私密认证保护不放宽。 |

原物理Root08、APP289、392/289闭包和SQL已验内容全部复用；不用新增物化、安装或APP构建作为导入前置。原受保护installer、admin及runtime信息仍走原私密通道，不读/输出verifier、密码或snapshot body/digest。此前13名人员所属厅裁决及2958条异常商品级条码排除，沿批准输入的exact hash消费，本轮不猜配或重洗。历史缺失人员/时间继续允许为空，前端必填不变；不改共享合同或前端。

执行依赖按以下顺序交Main/T45衔接。

1. 接T45最终42闭合回执，固定Root127、Root08、新升级42、Stop42、restore42以及prepare05原件；旧41失败和rollback01失败记录保留。现在本机已取得restore原键成功读回，但不新增现场检查。
2. Main明确本次最小动作集合及有依据的writer transport successor。首次业务写入模式仍是 FIRST_WRITE：旧diag02已证明固定原业务scope无durable，后续42维护回执businessImported=false；这不是“全库为空”。真实执行时仍由既有same-client inspectRoot确认ABSENT，若出现COMMITTED/未知则停止交Main，不自动转RESUME、不重放旧key。
3. 按上表准备隔离消费者、Root/Main/helper和准确source/capture/plan映射，复用原已完成SQL和目录算法，仅核新增lineage、旧/新binding分离、当前helper/policy闭包和必要安全收尾分支。新增数据库测试只能由主控协调；本报告不运行或安排它。
4. 同QB只核这些新增差分。其后T45按Main具体scope取得唯一真实fresh，原PGDATA停止/原认证恢复/旧快照stat/原计划custody/新键缺席等全部来自现场，Main最后才取真clock。必须启新C，不能把已停止C42/proofe789当作当前live服务。
5. 新服务取得真实full current catalog/目标/角色/C/epoch读回后，用Root08原API生成本轮executionBinding，核a5f/aef/ada及原preparedBindingSha256，Main才具体化有限writer授权。若source/spec/plan/target不符，停止而不补造或覆盖。
6. writer只消费原持久计划，沿现有事务、COMMIT ACK、audit/replay与readback合同；完成后原流程停库并恢复认证。原diag02保留31条非零管理记录（schema_migration27、staff1、user_account1、operation_receipt1、audit_change1），不得清库/重建/覆盖；该历史scope不替代本轮结果读回。各仓总量守恒、逐身份/金额/库存读回及完整发布门槛仍必需。STAGED不暴露，不凭准备完成或局部成功解除PUBLISH限制。

本报告尚未修改上述消费者、Root或Main，不产生未来执行scope；业务完整导入、APP正式接入、前端可见与发布解除仍未完成。
