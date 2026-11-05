# 0448Z 两项准确合同与源码差异（未实施、非环境执行授权）

依据：现行主控上线接续目标；D2-32实际TS/SQL核查；T45 fresh35准备回执。旧业务裁决不重问。原source、权限和固定证据不修改。本单只申请下列源码及依赖合同变化，后续真实环境目标、窗口和执行仍须准确绑定原T45，不据本单生产部署。

## A. 仓厅来源观察与新库目标分开

已确认的业务不变：28894张历史销货的原所属厅仍未知，沿准确仓库身份和已有单厅裁决补迁移归属，不冒充原始所属厅。16仓11014张单的实际effective版本是0；其中一仓38张单原观察有两厅，但已有独立单厅处理批准；其余35仓17880张单也不能把旧runtime身份/版本当新库身份/版本。两条已批业务码桥涉及53张，严格限定已批和捕获范围，不宣称全库唯一或逐行创建批次已证。

不新增表、列、索引或数据库权限。在原证据JSON及原source_hash/item/audit承载中新增版本 HISTORICAL_SALES_HALL_EVIDENCE_V2，V1旧数据及校验保留。V2闭合根键：format_version、basis、original_hall_id、selected_hall_id、warehouse_id、target_snapshot、source_capture、identity_bridge、resolution、has_difference、review_required。

- target_snapshot：warehouse_id、hall_id、version、captured_at；目标版本仍必须为正整数；由实际目标行/本次受控初始化事务核实，不用旧库0改成1。头warehouse_id、selected_hall_id必须与此快照及目标行精确相等。
- source_capture：capture_evidence_sha256、source_namespace、warehouse_source_key、runtime_warehouse_id、source_native_version、effective_version、runtime_hall_ids、captured_at、transaction_snapshot、relation_basis。保留真实0、原native空值、完整双厅数组、实际采集时刻和快照。来源namespace与业务码的桥依原固定证据明确范围，不把实例current_batch当行创建批次。
- identity_bridge：evidence_sha256、record_key，引用外部已核、准确实体/命名空间/原业务码/旧runtime ID→标准目标ID和source refs的逐项记录；不接收自称trusted布尔值。
- resolution：null，或evidence_sha256、record_key。双厅选择仅引用已有准确单厅裁决及映射，原双厅仍保留。has_difference保留差异事实；有已验证resolution时review_required可为false，不将差异抹掉或重问同一业务裁决。

消费者同步：packages/application/src/historical-sales-hall-evidence.ts（类型/解析/构造）；unified-historical-sales-hall-evidence.ts（外部批准读取及成员/源hash/桥校验）；unified-import-contract.ts（实际依赖的证据类型/源profile闭包）；tools/unified-import中的现有hall proof读取、plan/program/requests与readback消费者；adapters/postgres/patches/0035_historical_sales_hall_successor.sql及其fresh35-sales-hall-candidate组合生成器。实际SQL函数 standard_whole_package_command_v2(jsonb,text,text,uuid,integer) 的初始化、逐头正则/目标核验、parsed/source_hash/item和读回同步；guard_unified_document()继续核受保护操作、头warehouse和selected_hall一致，不扩普通写入口。源和目标不得再直接按ID/version相等认同。

必要验证：真0版本、不同源目标ID、双厅已有resolution、错误桥/捕获/目标版本/成员拒绝；原V1读回；普通角色隔离PG持久化及新连接读回。当前尚未实现和实库验证。

## B. 同一新合成目标的安装→记录→导入host源码接线

仅扩展现有fresh35隔离launcher/entry与原固定授权合同，不增控制层，不触及正式库或旧QA库：

1. bootstrap原精确pg_control_system() EXECUTE授权由仅owner，增加本批controller；不授pg_monitor、表级全权限或owner身份。
2. 独立QB核到controller为NOINHERIT且无迁移记录读取权。仅增加本批controller对naijue_erp.schema_migration的version、description两列SELECT，并同步组合目录model.columnAcls的这两项准确授权；不授整表、不使controller加入runtime角色，不省略实时lineage校验。新35安装中由原owner应用该精确授权，固定source/catalog/program记录同时绑定。
3. 原HBA仅admin/owner，增加本批数据库、本批controller、127.0.0.1/32的SCRAM一条；HBA预期行数和逐行核验同步；不放开通配网络/其他数据库。runtime连接仅在另有具体受托业务验证时列清。
4. 原entry实际COMMIT、完整catalog检查并关闭安装连接后，调用既有publishFresh35CombinedRecord(completion)发布原真实完成token；禁止从JSON回执伪造完成。随后在同一原窗口执行固定受控合成导入及普通controller host核验，再由原guardian撤本批登录、清本批秘密、停本批进程；安装成功、发布成功、host通过、业务通过与清理各自记录。发布失败不声称SQL回滚、不重放安装；提交未知按原键处理。
5. 对原provision授权闭合动作声明增加上述记录发布和固定合成导入阶段；由真实外部授权消费，不在客户端生成批准。正式生产入口/权限、时间窗口延期及真实数据不属于本项。

文件仅 scripts/release/unified-install/launch-fresh35-isolated-v1.py、fresh35-isolated-entry-v1.mjs 和必要原lifecycle接缝/定向测试；record/host既有实现复用，C唯一writer。目标名字/UID/物理ID和固定fixture清单尚待T45按实际资源与最终源码准确绑定，本单不虚填，也不授权开始建库。

原20分钟上限、清理预留和失败停止保留；不足时先报告，不能自延窗口。受影响合成拒绝/清理测试及同版实际PG串行验证保留。其他金额、来源台账、原生入口接线继续，不以本单等待阻断独立开发。

## 已批准及已交付状态（2026-11-05 接续）

A、B 已分别收到本主控用户明确批准。固定整合源码 `7fb173979935ea61beb499c30fc5312f2087795b` 已推送 GitHub；A 后端、原生35表运行入口、B 本次接线增量已有各自限定的 QB 源码结论。统一类型检查与后端构建退出码0。这些结论不代表实际 PostgreSQL 安装、整包导入、普通账号业务、浏览器或部署通过。B 的新合成目标及实际执行仍由 T45 另行准确绑定；没有根据本次源码批准创建账号、授权、建库或启动。

## C. 待确认：新仓库初始化前的输入意图与事务内真实采集

### 当前准确缺口

真实批次的新仓库在整包导入的 MASTER 阶段才创建，但原 V2 预检在导入前就要求目标的非空采集时间。因此，来源观察和身份桥虽已具备，不能凭预期版本1或编造时间让真实包通过。另一个受影响接缝是 `sales-historical-hall-projection.ts` 的查询仍只认旧 V1 profile；必须在原授权查询内支持完整 V2 读回。A 的限定源码验收保留，不能代替这两条完整链路的验证。

### 仅申请以下最小源码与写合同差异

1. 不新增表、列、权限或 profile。V2 根仍11键、`target_snapshot` 仍4键；仅输入阶段允许 `captured_at:null`，明确表示尚未采集。仓库ID、所属厅和正版本只是外部固定的预期，不宣称已观察。原非空 V2 和 V1 保持原校验。
2. 原外部批准的 `records[]` 仅对上述 null 输入新增条件成员 `target_initialization:{warehouse_source_key}`，准确绑定本标准包 WAREHOUSE 的 canonical source key。批准摘要覆盖该成员及原来源、身份桥和裁决；预检核它与本包 MASTER 仓库行、registry、目标ID、厅和预期版本一致。非 null 或 V1 不得混入此成员。
3. 原整包事务在 MASTER 实际创建后，以原 `import_record`、操作记录、整包 root 和当前事务链证明本批身份，再锁定真实仓库行，核 ID／厅／版本并采真实时间。不能以 `warehouse.created_operation_id` 冒充证明：当前原守卫要求该字段为空。缺行、错误批次、身份、厅、版本或证据即整笔拒绝。
4. 仅在原 DOCUMENTS 审计 JSON 的 `after_values` 增加 `historical_hall_target_captures`，以销货头 `source_record_id` 为键。每项闭合7键：`warehouse_source_record_id`、`warehouse_operation_id`、`input_source_record_hash`、`warehouse_id`、`hall_id`、`version`、`captured_at`。后三个目标值及采集时间来自实际锁定行与数据库时钟。原回执 `result_data` 增加该 map 的摘要，防止与原操作脱离。
5. 原输入 UTF-8、parsed/item、行来源摘要、请求键、manifest/plan 摘要均保持覆盖原 null 输入，不用新时间改写原来源后仍声称哈希不变。已有请求键恢复返回已提交的原审计和回执，不重新采时间。源码须区分批 manifest 摘要与 `import_record.source_record_hash` 行摘要，不混用。
6. 新连接读回先核原来源哈希、同操作回执摘要、map成员及 MASTER 归属，再仅在输出 DTO 中组合完成的 V2。原来源0版本、双厅和未知事实不改；最终页面／查询 DTO 仍要求真实非空采集时间。缺捕获不得把 null 意图当完成证据；普通保存权限与原历史保护守卫不放宽。

### 准确实施接缝及必要验证

原 D1 负责 `historical-sales-hall-evidence.ts`、`unified-historical-sales-hall-evidence.ts`、`unified-import-contract.ts`、原 hall CLI／stream plan／document requests 及其类型声明；原 D3 负责既有 `stream-preflight.mjs`、`stream-relations.mjs` 和来源对账消费者，逐文件交接，不并发修改。

原 `0035_historical_sales_hall_successor.sql` 内 `standard_whole_package_command_v2`、`assert_standard_import_operation`、`standard_import_record_proof`、`guard_unified_document`、`standard_whole_package_verify_v2` 同步精确采集、摘要、原键恢复和独立读回。组合生成器沿原唯一 owner；`sales-historical-hall-projection.ts` 在原页／单头授权 CTE 内补 V2，普通列表和详情沿原调用，不另建事实通道。

必要定向验证：null 意图不能单独通过；错成员／批次／厅／版本／哈希拒绝；事务失败不留捕获；提交未知及原键重放不重复采集；新连接读回完整 V2，保留 V1。合成测试与真实 PostgreSQL 分别出结论，不扩大为全站回归。

**本 C 项尚未批准或实施。只申请上述持久 JSON／写合同及配套源码修订，不授权环境创建、实际权限、生产写入或部署。仅真实包目标采集分支等待，已批 A/B、工具载体准备及其他独立工作继续。**
