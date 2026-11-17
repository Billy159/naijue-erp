# 实际元数据与最小进度接缝补充

实际元数据载体SHA85aebff422fa3b7fb32aac253b7c860c47cd495c8d220dbdf38a572863abd07d已本机核对；原件fullstat9前后一致、sidecars不变，未读step/initializer，未执行PG。下列只更新已知事实和源码范围建议，不产生RESUME授权/新源码/票据/QA。

- 实测meta.batchCount=1061、meta.stepCount=44911含CORE；原prepared非CORE44910不变。尾1060 FINALIZE first=last44910。
- 150 DOCUMENT_OPEN first=last466。151 HISTORY first467/last581，115原请求、496rows、888469B（约868KiB）；descriptor15cb5fefd0167b3ceb78f2cdf1a38d44281224b659e947d0a83b2397e251a988，subBatch357e318a-ff8c-7a5c-e890-0c310126137f，与150前驱准确相等。现在467是原metadata证实的组首，不再只是算术候选；仍不向客户端手填offset，它应原序列逐组inspect/skip。
- oversizedGroups1/maxGroupBytes58716477；CORE0自身bytes58716477已解释该oversized。首HISTORY实际未达500行/7MiB，不能再按“首组超大”解释-15。115个逐一SQL请求、阶段complete和constraints可能累计成本，或停在其它阶段；尚无实际timing/等待点，不以分组规模决定预算或直接放大窗口。
- 新实证同时指出旧观察SQL last_step>=44910会误判合法尾44910。当前已见prefix≤466，PERSISTED_PARTIAL及其零冲突结论不受此项影响；冻结SQL不改、不重跑已完成观察。后续若有必要查询，边界必须用meta44911或闭区间0..44910，并与非CORE44910分别命名。

## 可复用进度seam核查

在与actualRoot08逐SHA一致的retained/operation/client/kernel/whole-host源以及实际host5e4f中，没有现成的onProgress/onStage/onQuery observer参数或导出。batched-stream-client.mjs:35..92已有stage局部变量和step ordinal，但它们仅在失败return或最终result中返回，未向外发阶段事件。当前final33-run.mjs:186 await runFinalR3Writer03期间没有可用内部阶段；stdout也只在main结束才写最终JSON。

controlled client在whole-host-session.mjs:175由Object.freeze创建，guard绑定在同一真实wire上；不应代理/替换client.query或monkeypatch。batched-stream-operation.mjs确有createKernel参数，但retained API:98-99没有向外转发这个入口，不能把改用自造kernel/work callback、重新拼factory对象当合法进度seam。

**仅改per-key final33-run/host、保持operator392/ac85/实际host5e4f和原API完全不动时**，能做的只有外层粗阶段：调用前/调用返回、最终状态与cleanup；Python CHILD能补异常类型闭枚举、是否到cutoff、TERM/KILL意图/退出确认、resultReceived/parsed/lifecycle及budget。这可以解释“为何被收回/有没有结果”，但不能提供group151内部step/query ACK/COMMIT停点。不能把粗阶段包装成有细粒度进度。

**若Main需要group/step/ACK/COMMIT细粒度实际证据，最小源变化在既有批处理链，不在factory/guard或SQL：**

1. batched-stream-client.mjs:20的既有options接收一个封闭进度sink，并在现有stage赋值及已有ack后记录固定事件（group ordinal/hash、step ordinal、阶段枚举、elapsed、ACK/COMMIT observed）。不新增查询，不改事务顺序、skip/commit逻辑或返回成功含义，不暴露client/SQL参数/业务行/任意错误消息。
2. batched-stream-operation.mjs:10-17仅转发该sink。
3. r3-service20-retained-import.mjs:85-101的原RESUME入口只转发sink到原operation，保持原openClient、preparedPlan和borrowedClient路径；per-key runner提供受保护私密记录通道。sink异常与原实际结果的关系须在源码合同明确，不能吞掉/覆盖已提交事实，也不能让日志回调发业务SQL。

这样实际host5e4f、factory校验、同client guards及SQL42可以保持原字节，但三个operator叶变化就不能继续宣称sourceSet ac85完全未改。必须使用小范围准确源码后继/消费绑定，原392/ac85及原materialization marker永久保留为历史；不能在旧目录静默热改或拿APP289覆盖。若Main要求连operator叶都不变，则只能接受上述粗阶段，细粒度seam不存在。

本补充未实施任何代码、未freeze/派QA/改SQL/发窗口/开PG/变更角色。原partial/STAGED/oldhardfalse保持；下一步由Main按实际115请求和所需可观测粒度明确范围，不能仅以延窗盲跑。
