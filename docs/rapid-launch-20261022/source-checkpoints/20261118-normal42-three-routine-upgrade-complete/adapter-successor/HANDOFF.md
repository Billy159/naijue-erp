# Stop42 装配唯一缺口：隔离后继，SOURCE-only

仅替换本地 bind_actual42_context.py 与 read_stop_basis42.template.py 的 stop 装配环节。旧 PREPARED9c5d、Root-binding5d2a、consumer a6a8、Root c583、SQL/票据及其他8个adapter原封保留，不重复其已验范围。

目录是与原准备目录并列的隔离后继。新binder的 ADAPTER_SOURCE 指向本目录；HERE仍准确指向原 NORMAL42-MAINTENANCE-EXECUTION-PREPARATION-01，所有既有runtime/各阶段证据路径和输出不变；模板从本后继读取，避免从旧目录误取旧限制。原本地binder文件不覆盖，后续调用须使用本目录这个明确后继。

只从已有实际 upgrade42 原键 observer 文件读取状态。terminal=None必须同时满足跨grant现存记录列表为空、结果为空、活动operation列表为空；并已有 runtime/upgrade/ACTUAL-NO-SUBMISSION-EVIDENCE.json 明确记录 exact requestKey、state=CONFIRMED_BEFORE_REMOTE_SUBMISSION、对应observer的准确SHA、remoteSubmissionCalls=0、submissionInFlight=false、localSubmitOutcomeKnown=true。该记录只能基于真实本地Main/prepare在remote前拒绝和已收敛调用状态形成；本次没有创建它，缺失就阻塞，任何partial目录、已上传请求、无终态或仍在途均不能填None。不是从“缺文件”或耗时推断未提交。

有真实终态时，仅接受Stop42既有三个TERMINALS及两个BEFORE_PHASE_REFUSALS；后两种须phaseStarted=false且exitCode为整数2。其余终态不臆定退出码，准确四元组(status,exitCode,phaseStarted,finishedAtUTC)原样绑定；job/task/grant、真实finish及phase字段都保留。template再次核原root/public终态同字节与SHA、原样四元组及upgrade unit inactive；None则复用原模板两grant requests/tmp/jobs/results全缺席校验。没有补造terminal或将UNKNOWN认定为absent，没有变更停止算法。

21项仅本次静态/AST/语法检查通过：原其他binder函数、take和两grant absence分支逐字结构不变；允许集合与Stop42源码一致；明确未提交证据和inflight条件、真实终态原值绑定、准确路径及旧冻结材料指纹保全。没有创建正AUTH/运行fixture，没有调用任何实际binder函数、Main、server、clock、PG、CAS或issuer。本结果仅SOURCE，不是现场停库或业务结果。

未来仍需QB这一finding的增量结论；Root最终joint/其他adapter既有结果复用。Main未给后续actualfresh/执行指令前不开展实际动作。
