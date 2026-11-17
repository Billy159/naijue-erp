# Writer45 部分持久提交后的最小接续分析

仅本机实际safe回执+原源码；无新writer/PG/角色/clock/CAS/QA/freeze、无initializer/SQLite业务正文读取。原auth45恢复与原只读机制直接复用，不再技术重验。

## 事实与约束

已实际核读只读回执b8143470...，terminal5caf975c... COMPLETED0/5.402s，rootresult9fb66c77...：原root7e820 CORE COMMITTED且七身份匹配；baselineee671 IMPORTED/completed，document9629 STAGED/notcompleted；467已提交receipt、151组、group ordinal0..150、step0..466；CORE1/MASTER68/KEYS80/BASELINE_CLOSE1/DOCUMENT_OPEN1/HISTORY0/FINALIZE0。已观测identity/hash/重复/成员/前驱/审计冲突均0，audit467闭合；原计划expectedDescriptorBinding仍UNKNOWN。结论是PERSISTED_PARTIAL，既非空库也非整批完成。STAGED保持隐藏，禁止FIRST_WRITE、旧key重放、重prepare/改SQL42/APP/删除业务数据。

## 既有RESUME路径和真实游标

已逐SHA确认下列7个本机代码文件与actual Root08 source-rows完全一致，准确路径/SHA见SOURCE-REFS.json；实际host用资产delta-02/5e4f，不能用APP289自身host48abc替代。

- `r3-service20-retained-import.mjs`:77-108：既有runFinalR3Writer03进入runFinalR3Persisted03；85-87只有`inputs.resume===true`才选RESUME（readback也选RESUME，但97行走核账，不是writer）。91-99打开原batchPlanPath、openCliBatchedState、restore原factory对象，以preparedPlan/state调用原runBatchedStreamOperation。没有源index读取或prepare/compile。
- `batched-stream-plan.mjs`:openBatchedStreamPlan以SQLite readOnly/query_only开启原文件；metadata、batches按ordinal读取，steps只读原范围。`batched-stream-cli-state.mjs`:openCliBatchedState核原bindingHash/manifest；verifyFinalR3PersistedProgram核原initializer身份、原请求和steps/batchedPlan摘要。该**既有实际执行路径内部会私密读取原请求/initializer**，不应假称只看metadata即可执行；本次分析未读取，未来执行范围必须明确原私密消费、不输出正文。
- 实际host delta-02:1150-1158恢复factory对象；1116-1136同一真实client先检查CORE descriptor，RESUME要求COMMITTED，FIRST_WRITE要求ABSENT，随后ROLLBACK，再进入work。`whole-host-session.mjs`:263-281在安装同client guard之后才inspectRoot/work。离线只读观察不能代替该同client准入。
- `batched-stream-client.mjs`:25-77从原descriptor第一组开始，不接受手填offset。逐组BEGIN→lockAndInspect；只有subBatchId/descriptorSha匹配的COMMITTED才跳applyStep（仍做原锁检和事务收口），ABSENT才执行原步骤→complete→constraints→COMMIT。中断/不确定返回UNKNOWN，不用本地success标记推提交。已提交151组原则上由该机制安全跳过，**前提是与原计划descriptor实际相符**，当前离线聚合不足以宣称此前提已全部实证。
- `batched-stream-sql-kernel.mjs`:35-73维持同client/identity/descriptor、ordinal和原request绑定；原SQL按组检查前驱与身份，RESUME不重新分组、不改变业务ID。

当前冻结writer45 `final33-run.mjs`:183构造inputs没有resume，因此走FIRST_WRITE。要用已存在RESUME能力，必须是Main明确的新后继source/作业，不是重放45。后继还须将RESUME标记纳入准确外层/原生授权、Root准入和同client expectedBinding，不能只偷偷加一个布尔绕开原合同。批次/operation/request/manifest/plan/44910原样保留。

## 首个HISTORY边界为什么尚不能定因

持久前缀说明DOCUMENT_OPEN已提交，第一未观测提交的阶段为HISTORY；候选是原group151、接在step466之后。但未读原descriptor，不能手工宣布next=467或group151一定从467开始，也不能证Node已走到该组APPLY。停点可能在取下一descriptor/INSPECT/原step/COMPLETE/constraints/COMMIT及其未落盘阶段。

源码给出的可验证候选因素：

1. plan构造的500行/7MiB阈值不是硬拆单规则。`batched-stream-plan.mjs`:HISTORY将同一完整单据累计到documents关闭，再调用unit；单张超大单据保持原子，可超过阈值。若原151描述符rows/bytes/first..last显著大，其事务预算可能很长；当前无该metadata实测，不能称已找到超大单据。
2. 单组提交要走每step SQL、阶段complete及SET CONSTRAINTS ALL IMMEDIATE，事务中业务变化/回执尚未COMMIT时不会进入本次持久聚合。当前HISTORY0既不能证明没有执行过step，也不能证明哪个SQL慢。没有SQLSTATE/阶段计时，不能据此指认SQL42三函数、锁或某历史单据有错。
3. 原实际host892-929在写前完整读取并核原44910非CORE步骤/hash；verifyFinalR3PersistedProgram也扫描原内容。RESUME省数据库已提交步骤，仍有原计划全量校验成本，不应把窗口全额当HISTORY可用时间。本次已提交前缀能证明部分执行发生，但不能给各前置阶段耗时分摊。
4. 原wire代码whole-host-session255-257固定statement默认上限900000ms，并受service/window余量裁减，lock_timeout≤5000；这不是整个作业耗时。外层final33_host579取2780秒child预算/cleanup220预留，内部421..443对未完成或异常会TERM/KILL。实际-15只证明Node信号退出；fallback/lifecyclefalse与这些收尾路径相容，却没有保存具体触发异常。外层FAILED2不等于已观测3000秒PHASE_TIMEOUT124，2772秒也不能反推某个deadline。

现有两个stderr都是DEVNULL、原stdout只内存解析；phase log实际0B。receipt摘要f894...不能补出SQL文本、阶段或错误原因，无法在本地恢复已丢诊断。不得为补日志重放45。

## 最小实际补证与后继范围建议

**先做原计划metadata-only范围（建议给T45原通道，尚未授权执行）**：只以只读方式取现成meta/`batch`描述符索引：CORE0、已见尾组150、候选下一组151、FINALIZE尾组；字段仅format、原identity的相等布尔/摘要、batchCount、meta.stepCount、oversizedGroups/maxGroupRows/maxGroupBytes、phase/ordinal/first/last/rows/bytes、subBatchId/descriptorSha/前驱摘要与首末operation ID的必要绑定。读取前后stat/canonical/owner/mode/nlink按原custody一致。禁止遍历/导出step.value、initializer、单据行、人员/金额/条码或变更SQLite。若没有已有metadata导出物，须Main明确允许该几条现成索引的私密读取，不凭本分析直接取。

typed计数也要分开：真实preparedBinding.stepCount=44910保持；源码plan在ordinal0额外放CORE、meta.stepCount含CORE，而describeCliBatchedContents的count不含CORE。源码推导同计划meta可能44911，**尚未读meta，不把推导当实测尾界**；尾界只能从原metadata/descriptor实证。marker plan=afa9，batchedPlan=3fbb不变。

若metadata显示该HISTORY组普通尺寸，仍缺“是INSPECT/APPLY/COMPLETE/constraints/COMMIT哪一段及等待什么”的实际证据。下一次获准执行前，最小source后继可在现有私密宿主结果通道追加封闭阶段记录：group ordinal/descriptorHash、stage、step ordinal、单调elapsed/剩余budget、query类别枚举与ACK/COMMIT是否收到、Node退出/cleanup触发原因闭枚举；不记SQL参数、业务行、凭据/任意message。不要扩建追踪平台、并行监控器或降低原安全/身份校验。

**之后才谈单次RESUME执行范围**：Main依据已持久部分提交、原descriptormetadata及预算选择是否出最小RESUME后继；精确新外层key、同原business IDs/原SQLite/原prepare05与三种typed摘要；允许原执行器私密读取并校验不可变原请求，禁止重新编译/prepare。新真实当前service/context/expectedBinding、有限授权和Stop/原auth恢复闭环仍须由Main按既有流程明确，不能沿已还原的旧finite login续权或复用失败45票据。若首组尺寸/预算/阶段原因仍未知，保持HOLD，不仅延长窗口盲跑。

本次只给原因边界和上述必要范围，未创建可执行RESUME源码、future AUTH、任务key或QA；未改SQL、44910、业务ID、旧Root144或任何冻结源。
