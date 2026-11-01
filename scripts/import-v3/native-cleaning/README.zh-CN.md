# 一次性原生清洗准备组件（离线，未接数据库写入）

## 私域来源文件接缝（源码及合成验证，尚未实际导出）

`private-snapshot-files.mjs` 将现有48资料表＋document/revision读取器的回调直接写成私域NDJSON，不解析/改写raw_json中的数字。调用者必须提供已有受控连接池、新的绝对目录、明确字节上限和已授权目标；目录0700、文件0600，不覆盖现有路径，不公开正文。所有表包括空表都生成文件，按实际字节记录SHA256/行数；同快照EOF、独立COUNT和current_revision关联全部成立、ROLLBACK确认且数据文件落盘后，才建立完整标志。上限包括来源文件及一份manifest的逻辑字节，不代表文件系统实际占用。

失败、取消、预算不足或回滚未确认均不生成 `COMPLETE.json`；保留私域未完成文件，不自动重试、删除或交给目标写入。它不创建数据库/连接池，不读取认证，不补库存/过账，不将数据库副本冒充原BASE_V2来源授权，不是完整清洗产物。实际导出需由T45按已核目标、容量和有限窗口执行，目前尚未执行。

7项真实临时文件＋模拟数据库测试覆盖精度、文件哈希/行数、空表、权限、原目录保护、内容和manifest预算、FETCH失败、回滚未确认和取消。它们不替代PG权限/真实导出、独立业务对账或恢复验证。

后继 `captureLegacyCleaningSnapshot` 将新93scope入口接入同一文件输出：42库存/效果表、唯一映射设置、48资料表及单据/版本，生成93个私有数据文件。所有行仍是原SQL文本；同一RR完成、数据文件逐项fsync/关闭后才创建manifest和完整标志。原50scope入口保持。新增合成文件测试后，与读取器共37项通过；尚未实际导出。真实执行必须使用服务器新私域挂载，不放results自动导出区，不把返回的私有manifest全文写stdout；公开回执只保留计数/字节/EOF、准确版本、总manifest摘要及清理证明。完整标志只说明该限定来源文件完成，不授予转换、导入或发布能力；主控仍须采用精确目标绑定和宿主清理结果。

本目录不是已执行的转换任务，也不是长期旧结构兼容层。当前组件按明确来源合同分层复用：

| 组件 | 可验证的窄范围 | 不授予的能力 |
| --- | --- | --- |
| `exact-scalars.mjs` | 显式规则下精确数量/金额编码 | 不猜单位、币种、精度或字段含义 |
| `effective-source-rules.mjs` | 已知旧规则的成员与有效值选择 | 不判定最终可售商品或完整业务 schema |
| `current-revision.mjs` | 给定 header 精确 current_revision 指针 | 不把历史展示升级为可编辑/审核来源 |
| `identity-crosswalk.mjs` | 独立需求与明确 UUID 映射、引用闭包 | 不分配身份、不合并别名、不证明目标已存在 |
| `record-reconciliation.mjs` | 独立 cohort 中逐记录逐字段精确一致 | 不以总量抵消，不证明源提取或 oracle 独立性 |
| `typed-stock-cell-candidate.mjs` | 上述合同编排成 opening/net 两分量私域候选 | 不选择 active run、不称当前库存、不调用 BASE_V2 writer |

真实恢复来源的只读 01/02/04/05/06 已有主控回执；03 在本轮 PAGE16 后继已完整聚合通过（见下），各卡不是共同快照导出，也没有实际清洗/转换/写入。04 支持 typed 两分量的整数/范围设计，但不能从 8 个 source_unit 文本推断单位比例或库存效应。完整私域映射、同快照来源、明确业务规则、目标最终 schema、原生写入接缝及准入仍需另证。见各组件中文合同及 provenance 文件；不会把 DB 导出伪装为原 BASE_V2 CSV 授权。

## 精确标量接口

基线 e6a03c9fda216a45fb4f904568a28f797c9e94dd。以下两个标量纯函数不连接DB、不取真实记录、不写入、不授权迁移。外部规则SHA仅来源数据格式，不验证审批真实性。调用者仍须证明实际来源字段、单位、币种、映射、完整性与目标列符号/NULL规则；没有默认单位/比例/币种/NULL/符号策略。

- `normalizeQuantity(input)`：见同名d.mts；必须传 sourceUnit/targetUnit 和完全匹配 rule 单位、正整数 numerator/denominator 字符串、64位小写证据SHA；BigInt有理数计算，非整数拒绝，结果必须在PG signed bigint两端内。
- `normalizeMoney(input)`：仅完全相同币种和金额单位；precision='18'/scale='2' 必填；额外尾零可去除，非零额外精度拒绝，绝对minor不超过999999999999999999。不换汇、不金额单位转换、不重算折扣/赠退。
- 两者仅收普通对象的完整、精确、可枚举自有data字段；拒绝accessor、Proxy、数组/稀疏数组、额外/缺失/symbol字段。值仅string或明确NULL。十进制最长256字符，比例最长128字符，单位/币种最长128字符；拒绝指数/number/NaN/Infinity/前后空白/非规范前导零。输入保持不变，冻结结果 `{sourceText,targetText}` 保留原负零文本，目标零规范化。
- NULL仅 `PRESERVE_NULL` 保留（仍先验证全合同）；`REJECT_NULL`拒绝。SIGNED / NONNEGATIVE / POSITIVE均须显式。源小数字符串可覆盖bigint边界，**不声称已验证其来自旧numeric(18,4)**；旧字段type/precision由提取前的独立schema/来源合同负责。

源码依据：packages/domain/src/values.ts 中quantity范围/规范整数、decimalToMinor拒绝非零额外精度理念；sales-money.ts的折扣/分摊是不同业务操作，本模块不调用。adapters/postgres/migrations/0001_runtime_sales.sql:65,90–105,114,157 定义decimal(18,2)/bigint与逐列非负约束。该helper接受显式策略，不能替目标列选择SIGNED。后续patch及真实目标仍需独立核验。

测试：exact Node24.21原生TS，`node --test tests/native-cleaning-exact-scalars.test.ts`；不需要npm安装。聚合根tests/*.test.ts可收集。仅数学与恶意输入纯测，不是全转换/PG/全根gate PASS。

## 同快照单据读取（37aa单据专用后继已通过；后续资料联合版本未验）

`document-snapshot-reader.mjs` 的 `readLegacyDocumentSnapshot(pool, options)` 消费调用方已有连接池，使用一个普通账号连接和一个 REPEATABLE READ READ ONLY 事务，顺序读取旧 `erp_prod_runtime.document` 与全部 `revision`。服务端游标分批 FETCH，显式空页确认 EOF，按同快照独立 COUNT 核对数量，拒绝重复身份、孤儿版本和缺少 current_revision。不会按最大版本猜当前值。完整 JSON 保持文本，避免 JavaScript 数值与日期解析丢失精度；不读取认证表。

`onDocuments`、`onRevisions` 接收原始行批次；输出在返回 COMPLETE_DOCUMENT_SNAPSHOT 前都只是私有暂存，失败不得送入转换写入。调用方负责真实目标绑定、私域保存和整体清洗授权。本函数不创建连接池、不写数据库，不实现目标转换或写后对账。取消在每个查询/暂存边界生效，查询保留 3s/1s/5s 限制，不自动重试；异常回滚失败会弃用连接。

12 项合成调用链测试覆盖分页边界、精确 JSON 文本、缺页、重复、孤儿、缺当前版本、失败、取消和连接释放，以及 BEGIN 结果未知时弃用连接。这些测试不证明真实 PostgreSQL 游标、权限、性能或 Card03 聚合通过。其余商品、字典、库存、人员仍待同快照接入，之前五卡不能拼为同快照结论。

失败异常的 `snapshotProgress` 仅含各表已知 expected、rowsRead、eofObserved，不含身份或正文；显式 EOF 与总数不符仍拒绝，进度不是完成凭证。真实隔离首测6455版通过目标与COUNT，但一次document FETCH超时57014；307次成功FETCH不能据此猜总行数，revision未进入，仍未通过。12项是当前改动的合成测试，不替换该真实失败记录。

后继固定37aa/c53版本以pageRows16已实际完成：T45 job `t45-legacy-document-snapshot-page16-readonly-20261102-01` 单次559.723秒，44773个头/44773版本，各2800次FETCH含空EOF，独立COUNT一致、全部current_revision指针成立。实际ROLLBACK ACK1、池关闭、最终其他连接0、原副本停止，新Node容器已移除。原JSON仅内存消费，没有保存转换产物。结果SHA256 `8fd5c9f057035a7ba320d146d2251ea253741ef68be8a31b5a8d4595064ce958`，在原T45 `outputs/T45/revisions/20261102-document-snapshot-page16-preparation-01/EXECUTION-RESULT.json`。此事实不覆盖随后增加的48表共同快照及字节统计，也未覆盖旧posting/movement/version_history等独立效果/审计表。

## Card03 原聚合流程的有界分页修订

`card03_engine.py` 沿用控制目录 `MINIMAL-READONLY-CHECKS-20261101/ro03-v3-review/runtime/card03_engine.py`，唯一行为变化是页量由128降为16。调用方仍提供同一已审核的 session、SQL、packet_protocol、lease 和 deadline；本文件不创建连接、授权或输出原始记录。不是新的清洗写入器。原协议每源10000页上限、3/1/5秒限制、单会话RR、显式EOF、独立COUNT及失败UNKNOWN保留。

本轮重新运行原 test_key_phase.py 的 ProtocolTests/EngineTests 共27项，通过；另连续17页核对所有KEY/PAYLOAD绑定均使用16且两源EOF/COUNT一致，通过。未重跑无变化的源码载体测试，T45须重新绑定执行清单。真实隔离后继已完成：原T45 job `t45-minimal-rdb-card03-page16-ro03-20261102-01`，单次555.724秒。revision44773行/2800页含空EOF，employee99行/8页含空EOF，同一RR只读会话，两源独立COUNT一致。真实ROLLBACK ACK、客户端退出、最终其他客户端0和原副本停止均有回执，生产/业务写入/新恢复/授权变更0。原五卡未重跑，不能拼为共同快照。准确EXECUTION-RESULT.json SHA256为`f5815e589d8d5f251431700f50bab07374dd309bb758043788adecf672f64b7b`，在原T45 `outputs/T45/revisions/20261102-card03-page16-ro03-preparation-01/`。仅该聚合范围通过，不代表JSON业务映射、完整单据读取器、清洗、迁移或上线。已有计划/统计证明两源走有效主键索引，JSON存储体积较大；尚未证明内部超时根因。

## 商品、字典及关联资料与单据的共同快照（5ca固定版本已验真实PG）

`readLegacyDocumentAndReferenceSnapshot` 共用原单据读取器的唯一连接和RR只读事务，先读取 `reference-snapshot-reader.mjs` 列明的48张资料、SKU选项、条码、图片和维护记录表，再读全部单据头/版本。`onReferences(table, rows)` 仅接收私域暂存批次；最终完整返回前不得交写入器。逐表游标、原生主键顺序、显式空EOF、独立COUNT及跨页重复检查；JSON原文不经JS数值解析。

两个retired条码表的实际目录没有主键，因此只以当前RR快照内的ctid区分物理行，保留内容相同的重复历史行。它不是库存/SKU身份、目标ID、持久来源键或以后快照的续传键；不得据此合并、重编或写业务记录。其他表按已核目录的真实主键。未访问任何认证表或会话，尚未包括库存生效状态、库存流水、全来源追溯和账号凭据，故不是完整旧库转换器。

Node24定向检查：`node --test tests/native-cleaning-document-snapshot.test.mjs tests/native-cleaning-reference-snapshot.test.mjs`。覆盖共同事务、精确JSON文本、复合键、无主键退役重复行、缺页/重复/无效键/消费失败/取消/回滚。真实PG权限、ctid读取、数据规模及48表与单据的完整同快照仍待验证；旧37aa单据专用固定候选不被该未验增量替代。

完整返回还记录各表/单据的 `rawJsonUtf8Bytes` 和 `largestRawJsonRowUtf8Bytes`，只计算原JSON文本的UTF8字节数，不输出原文；不是TOAST存储量、压缩率、PG协议总传输量或性能达标证明。用于接下来核实际私域产物容量，不能以此前存储字节推断展开字节。失败进度仍不代表完整来源。

后继实际结果：固定5ca5b5e45d3b0c0be73e378f8d55140f406abbfe、T45 job `t45-legacy-reference48-document-snapshot-readonly-20261102-02` 完成401.704秒。48表74302行、44773单据头、44773版本全部EOF/COUNT一致，同一RRRO，当前版本指针成立。资料原JSON为72483873字节，单据头1407386089字节、版本4552504541字节；最大版本行10662511字节。数据仅内存消费后丢弃，没有形成转换文件。ROLLBACK ACK1、池关闭、末次其他客户端0、临时候选移除、保留库停止均有准确回执。报告SHA256 `96a63299039e795bafd2457428bce9668eb05f0d993db6e793d6e7e05d10b21e`，位于原T45 `outputs/T45/revisions/20261102-reference48-document-carrier-staging-fix-01/EXECUTION-RESULT.json`。

第一次同范围尝试因临时目录漏复制reference模块，Node加载失败，原失败收据保留；第二次只补准确复制闭包并用新键新有限窗口执行。此PASS不覆盖下面新增库存读取范围，也不证明所有原生映射、认证、清洗写入、性能目标或正式业务。

## 库存、过账和历史效果来源（新增源码，未验真实PG）

`inventory-effect-snapshot-reader.mjs` 由已留存真实目录的原主键生成42张完整固定表清单，另只读system_setting中精确的inventory.standard-size-mappings一行，覆盖当前库存代次/成员/资格关联、原formal/history/opening依据及增量、标准SKU关系、posting/movement/version_history/work记录和原source库存。临时库存导出缓存不纳入；不读取认证/会话。与资料读取共用分页实现，JSON原文、负数量、所有代次和独立版本身份均保留，不求和、不按时间猜有效代次、不补缺失为零。

`readLegacyCleaningSnapshot` 是新增显式入口：42库存/效果表及一项明确映射设置＋48资料表＋单据头/版本同一连接、同一RRRO、逐表独立COUNT/EOF。调用者提供 `onInventory` 等私域回调及实际目标权限/目录核验；缺回调在连接前拒绝。库存错误仅附 `inventorySnapshotProgress` 的表名/计数/EOF/字节元数据，不输出正文，不进入后续资料和单据。原两入口的范围不扩大，库存模块仅新入口按需加载。

新增6项加原读取/文件测试共36项Node24合成通过，未实际读取这42表和映射设置。该入口仍缺认证身份的私域完整提取、其他原始来源追溯及最终有效库存选择/独立对账，不称全库提取完成。原库存consumer优先维护库存、备用formal投影；不能把捕获的多层数据全部叠加过账。实际原JSON已超过6GB，私域导出必须按真实资源选择明确容量，不能在本机2.5GiB余量下盲目落盘或假称导出完成。

48+单据报告曾仅清除嵌套准备态布尔说明，原raw receipt始终不变（SHA31f3dab73ef13f86a9225810715a9e54cef1c67f64f1c2477db701b556c7280e）；上方使用最终摘要SHA，先前摘要SHA dddea3e4已被该说明修订取代，不能当当前文件哈希。
