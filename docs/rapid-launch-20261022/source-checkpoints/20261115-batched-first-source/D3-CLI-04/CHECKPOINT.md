# BATCH-D3-01 首次源码检查点

2026-11-15，北京时间16:13更新。工作范围仅本目录，PG/服务器执行0。

## Owner 与源码入口

D3新增 source/tools/unified-import/batched-stream-plan.mjs 的 prepareBatchedStreamPlan / openBatchedStreamPlan，以及 batched-stream-client.mjs 的 executeBatchedStreamImport。前者将已有非跨单合并程序写入有界磁盘计划，后者在 D1 提供的同事务持久收据接口上协调成功跳过和原键续跑。D3接续入口 batched-stream-operation.mjs 组合以上两叶，等待D1具体kernel及host准入后供CLI调用。

D3集成改动提案仅针对现有 stream-program.mjs/buildStreamProgram、stream-import-cli.mjs/runStreamOperation 与 prepareProduction。当前冻结目录只读。D1唯一负责公共SQL、批状态持久化、事务代际/xmin、跨事务guard及host/session允许集。D2唯一负责row_intent叶。QB独立复核，T45唯一服务器执行。

## 依赖和原子边界

CORE为初始化及来源/身份/evidence登记。MASTER沿现有磁盘图拓扑，厅及其默认仓的循环组件不可拆，SKU在product/color/size及size_group_member后，COLOR图片在支持SKU后；不按表名硬切。KEYS在全部主档后，将现有100行请求按500行/7MiB既有限制合并成提交批。BASELINE_CLOSE沿原期初发布转换，必须完成全部KEYS。DOCUMENT_OPEN沿原STAGE。HISTORY每个单据的头、全部行、结算及迁移效果同事务，单据可跨有界请求；多个完整单据可合到500行/7MiB工作批，大单据独占批但继续逐请求流式读取。FINALIZE沿原DOCUMENTS发布并作最终数量/金额/库存关系核账，D1负责根完成状态，全批之前业务保持关闭。既有publish为导入内部转换，不替代服务开放。

每子批 identity绑定现有manifest、原plan、根baseline/document batch与确定性序号/阶段，原operation_id/request_key/request.payload保留。D1须在每个子批同业务事务持久完成收据，并在原子锁内检查准确身份和前驱；未知COMMIT须新连接按原键锁定查询，可确定ABSENT才原键重做。外部本地checkpoint不证明成功。

## 可复用与待替代

固定D3 r2 manifest f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb、26表511234、identity/转换/六条金额/厅证据/旁车/库存核账保留。现有预检索引和已校验summary为规划输入，沿原完整性绑定使用。本轮不重洗、不跑全量预检/全511234测试。

当前sourceSet b4665a72a01ba4c0c973ee86aa18271cb40c6bf09276d667c1331cca3dd7044c及D2十二层模型为读入基线。尚无本目录旧WIP可覆盖。整包WholePackageReceipt只证明其原整包，不证明某新子批；PENDING_TRANSACTION只在旧事务内，旧local/synthetic续跑不能复用为正式持久续跑。旧SQL全包同连接/xmin、生产host完整步流及COMMIT守卫由D1设计继任合同，D3不删除或放宽。

首个可检查源码节点定在北京时间16:30前，含磁盘分批计划和事务协调叶的离线定向验证。具体SQL/host接线待D1准确合同，当前不声称PG、COMMIT、正式续跑或生产可用。

## 16:13 已落源码及验证

三个源码叶和 batched-stream.test.mjs 已实际写入。本机工程指定 Node 24.21.0 实跑4项定向测试全部通过。测试覆盖原请求完全保留、厅仓既有组件请求不拆、100行KEYS请求合至500行、完整单据合批、501行大单跨2请求同批、跨单/父键错配/半单拒绝、文件已存在不覆盖、输入版本冲突拒绝、丢COMMIT应答后原键跳过成功批且不读取其steps、当前批失败回滚及成功前缀保留。

测试使用内存事务替身和临时SQLite计划，无PG连接，不能证明D1数据库约束或真实COMMIT。临时计划保留于系统临时目录d3-batched-unit-*，未删除原件或其他文件。原冻结/正式代码未修改。新模块从准确T45冻结目录引用原stableImportId/requestHash；集成时由主控将这两处import定位到同源树的packages/application/src，不读取旧local-source。

当前协调叶明确要求D1的lockAndInspect/applyStep/complete适配，尚未接旧whole kernel。D1已供inspect PARTIAL初片，但返回全部operations、PG requestHash与JS typed hash不等价，已回主控请求有界当前组精确请求比较方案；在接口明确前不伪造SQL签名或执行许可。D1沿原receipt承载可实现此适配，无需新增子批表。

## 16:19 首片收口更新

Node24.21.0最新定向结果为6项全部通过。新增覆盖读取结果UNKNOWN时，即使本次读取事务ROLLBACK得到应答也继续UNKNOWN，不将上轮COMMIT未知误报为回滚；下一次继续原键串行锁定读取。另实际构造一份大于7MiB的完整单据闭包，保持跨两请求同批。上述两个检查新增后只复验本切片6项，未重04/751/全包。

工作目标500行/7MiB用于合并完整闭包。磁盘计划metadata明确返回oversizedGroups、maxGroupRows、maxGroupBytes；每个batch描述的rows/bytes及原first/last可定位超限闭包。CORE若携带既有大审批串会如实计入字节及超限统计。没有为满足工作目标拆断单据、厅仓组件、删行或截断审批。

上游CLOSURE-RESULT.json实际把b4665a72…记作baseSourceSetSha256，把925ad39403debb1a9a7fe84748232475d72e67393ed376e05c9999b9358b64e0记作compactSourceSetSha256。本切片继续直接引用指定目录中的实际stableImportId/requestHash，PINS记录其实际字节及摘要；这两个上游字段分别记录，不把基础摘要写成当前compact摘要，也未重新全树验算已验上游sourceSet。

SOURCE-PINS.json固定本次首片文件和两个直接上游引用。记录的6项测试使用本切片有界合成请求、SQLite和事务替身，仍非D1 SQL/PG/正式adapter证明。D1准确有界read合同、公共SQL successor、host allowed集和最终CLI选路未接入。CLI operation叶已经过丢COMMIT应答/恢复的正常调用入口验证；旧CLI和冻结整包kernel未修改。


## 17:08 实际CLI接线检查点

原stream-import入口、prepareProduction、buildStreamProgram和launcher新状态已经在本独占目录接入batched planner/operation/kernel。上游三文件hash及owner在CLI-SCOPE-04.json，当前路径/宿主接口/借入连接/resume与三项最小新增检查见CLI-CHECKPOINT-04.md，准确当前清单在CLI-PINS-04.json。D1宿主/160-model及真实PG验证仍待集成，本次不标正式可用。
