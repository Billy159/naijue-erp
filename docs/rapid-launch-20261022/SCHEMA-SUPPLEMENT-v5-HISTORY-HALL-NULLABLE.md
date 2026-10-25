# 历史销货所属厅可空确认单 v5

状态：仅 HISTORY 销货来源所属厅空白→typed/DB NULL 及其独立27消费差异待用户明确确认，尚未实施本差异的源码或数据库变更；不重问已批准v16等既有范围。

本次仅修订现状事实，保留原字段申请与来源证据，不构成新批准或实施。

当前exact26后继运行目录按C/T45已核实际130 routines及本轮原metadata host的130断言核对；原121为旧基线，不能用旧数重新冻结。NULL27拟新增函数仍为0，最终完整routine身份/SQL pins/ACL以迁移前后各自真实目录为准，不能只核数量或复用旧review。

已批v16负责人合同是独立既有范围：nullable responsibleStaffId、原LIVE/HISTORY对应保存/修订及读回保留创建者审计，需原角色/事务/独立HISTORY_REVISION policy和实际元数据。它不代表销货所属厅hallId nullable已获批，也不因本确认单重新索要v16批准；SOURCE409/QB294有限源码证据不冒充实际NULL持久化或历史修订开放。

## 请确认的业务处理

28,282 张原始销货单中，2,471 张原本没有所属营业厅，也没有创建厅。现有模型将所属厅设为必填，导致导入中止。拟完整保留这些单据及明细、结算、仓库、数量、金额和来源；历史所属厅保存真正的空值，展示为空或未知。

1. 仅 HISTORY 历史销货允许来源所属厅空白映射为真正 NULL/UNKNOWN，完整保留2471单及其明细/结算/仓库/数量/金额/来源。
2. 有来源厅编号仍必须绑定同批、同来源键的真实 hall UUID；无效或未绑定已知编号继续拒绝，不能以 NULL 消错。
3. 不从仓库当前厅、人员当前厅、创建厅、唯一候选或默认厅猜补；不建未知营业厅行，不删除空厅记录。
4. 管理员/仓库现有 ALL 可读已发布空厅历史；营业员 HALL_IDS 不可读空厅，不能借其他字段扩大可见范围。
5. 通过 additive27 和独立 exact27 入口承载，原 exact19/exact26 版本与默认协议继续严格，现有前端新单/实时单必填不变。

**唯一物理字段差异：** `history_sales_header.hall_id`，类型仍为 `uuid`，由不允许空值改为允许空值；不加字段、表、索引、默认值或占位厅。原非空厅引用仍须有效。实时新单与维护表单必填不变。

## 字段全表核对

| 字段 | 类型 | 当前可空 | 拟可空 | 保留方式 |
|---|---|---|---|---|
| id | uuid | 否 | 否 | PK；stableImportId(history-sales-header, 原 fixedSourceNamespace, 原 sourceKey) 不变 |
| source_row_id | uuid | 否 | 否 | UNIQUE；原来源行身份及与 batch_id 组成的 FK 不变 |
| batch_id | uuid | 否 | 否 | FK import_batch(id)；与 id 组成的 UNIQUE 保留 |
| version | integer | 否 | 否 | CHECK >0；初次导入仍由触发器限定 =1 |
| number | text | 否 | 否 | 原单号原值保留 |
| business_date | date | 是 | 是 | DDL 已可空；当前发布读回仍另要求有效业务日期，本案不扩展该规则 |
| source_status | text | 否 | 否 | DRAFT/APPROVED/VOID 原 CHECK |
| note | text | 是 | 是 | 保持原约束与语义 |
| created_by_source_key | text | 是 | 是 | 缺失保持未知；不补当前人员 |
| approved_by_source_key | text | 是 | 是 | 缺失保持未知；不补当前人员 |
| created_hall_id | uuid | 是 | 是 | 已有 hall FK；与所属厅是两个独立事实；UNKNOWN iff NULL 的原约束保留 |
| created_hall_provenance | text | 否 | 否 | ORIGINAL/MIGRATION_DERIVED/UNKNOWN；本次缺失创建厅继续 UNKNOWN；有证据的历史创建厅不随所属厅清空 |
| created_hall_reason | text | 否 | 否 | 非空白原因；MIGRATION_DERIVED 仍须真实 evidence_ref |
| created_local_at | timestamp without time zone | 是 | 是 | 保持原约束与语义 |
| updated_local_at | timestamp without time zone | 是 | 是 | 保持原约束与语义 |
| approved_local_at | timestamp without time zone | 是 | 是 | 保持原约束与语义 |
| created_instant | timestamptz | 是 | 是 | 保持原约束与语义 |
| updated_instant | timestamptz | 是 | 是 | 保持原约束与语义 |
| approved_instant | timestamptz | 是 | 是 | 保持原约束与语义 |
| business_type | text | 否 | 否 | SALE/RETURN/EXCHANGE 原 CHECK |
| hall_id | uuid | 否 | 是 | 唯一拟变更物理列：UUID NOT NULL → UUID NULL；无 DEFAULT，原 hall(id) FK 及删除/更新行为保留；不建占位厅 |
| customer_id | uuid | 否 | 否 | 原 customer(id) FK；不改可空性 |
| warehouse_id | uuid | 否 | 否 | 原 warehouse(id) FK；逐仓守恒维度不变 |
| salesperson_id | uuid | 是 | 是 | 原 staff(id) FK；2406 条已知营业员不丢失，65 条缺失保持 NULL；不反推所属厅 |
| gross_amount | numeric(18,2) | 否 | 否 | 保持原约束与语义 |
| order_discount | numeric(18,2) | 否 | 否 | 保持原约束与语义 |
| net_due | numeric(18,2) | 否 | 否 | 保持原约束与语义 |

## 相关对象、约束与旧数据

- history_sales_effective：header_id uuid PK/FK、version integer NOT NULL CHECK >1、revision_id uuid NOT NULL deferred FK、gross_amount/order_discount/net_due numeric(18,2) NOT NULL；discount>=0；无 hall_id 列可改；不新增列。未来逻辑有效读取从基础头继承 nullable hall；版本与金额投影保持。五张 effective 表原关闭写触发器保留。
- history_sales_line / history_sales_settlement：无 hall_id；所有 batch/header/source FK、金额数量和唯一身份不变；不得因父头厅空过滤子行。
- history_transfer_header / transfer effective：无销货所属厅列；创建厅本已 nullable，调出/调入仓仍必 UUID 且不同；无字段变更。
- import_header_native_reference.native_hall_id：列本已 nullable；实体 HALL 引用的非空判别 CHECK 保留。未知所属厅不产生伪 HALL reference；客户/仓库/人员等已知关系照常保全。
- views/materialized views：当前迁移源码中无历史销货数据库 VIEW/MATERIALIZED VIEW；不存在第二个 hall_id 可空 DDL。C 迁移前仍须核目标实际目录，无新增视图。
- keys/indexes/FKs：基础头 PK、source_row_id UNIQUE、(batch_id,id) UNIQUE、两类 batch/source FK，以及行/结算/审计/回执/effective 指向头的 FK 全保留；无 hall 索引变更。不得凭 SQL 默认名字猜目标 FK 名。UUID NULL 仍受非空值 FK 校验；无级联/默认/占位数据变化。
- stage/immutable/no-truncate/revision guards：history_sales_header_stage / guard_history_insert、历史禁止 UPDATE/DELETE/TRUNCATE、history_revision_closed、history_effective_writes_closed、PUBLIC REVOKE 原样；不开放历史修订。
- native sales_header / warehouse / staff / hall grants：实时销货 hall_id、普通仓库单厅归属、员工/权限类型及前端必填全部保持；不将 HISTORY nullable DTO 接入实时销货 decoder。

## 来源、身份与依赖写入合同

- raw：CSV/raw_fields/normalized_fields 保留原字符串空白 ""，不改写为 JSON null、不改来源文件/行哈希；既有 empty reason/provenance保全。仅 typed hallId/hall_id 为显式 null。
- identity：原 stableImportId(history-sales-header,fixedSourceNamespace,sourceKey) 及 source_row_id 不变；不加27 namespace或重生UUID。已知厅行事实不变；NULL会改变派生typed fingerprint与新closure根，不能挪用旧typed seal。
- strictEntries：保留 prepareV3HistoryHeader / createNativeHeader26BindingPreparer / 原 PreparedHistoryHeaderChunk 的旧严格语义；新增显式27 mapper/preparer/validator/types（名称由技术冻结确定），只准新入口固定的nullable政策，不能由caller bool放宽旧入口。
- blank：仅来源字段确实为空 + 无业务厅 binding → hallId:null；空源却给binding拒绝；非空源无binding/错entity/错key/错UUID拒绝；undefined/缺属性/空串/字面null/零UUID不能代替typed null。
- provenance：已有 fields 对原所属厅空值保留 UNKNOWN + SOURCE_EMPTY/ORIGINAL_KEY_ABSENT + raw；created_hall_*独立，不增冗余未知厅表列或把其与业务厅耦合。
- stage：新27 staging必须重新验证typed payload、binding、fingerprint及完整来源，不只TS强转。nativeTargets仅在真实空源且typed NULL时省略HALL锁；其余实际原生引用和cutoff/batch/source锁保留。
- replay：原 jsonb_populate_record + IS NOT DISTINCT FROM 回读保留NULL精确性；同ID同事实幂等，无第二次写；同ID有不同厅/由既有UUID变NULL仍冲突并报告，禁止改写不可变旧头。

## 页面与权限

- dto：仅显式27 HISTORY sales list/detail同形JSON hallId:uuid|null。旧19/26 ImportedHistorySalesHeader及旧validator保持UUID；新增窄27响应类型/validator/service/reader及HTTP组合选择（技术冻结后命名），由可信固定composition选择，不能由请求参数放宽。其余字段/分页/错误/鉴权/Origin/no-store/取消契约保持。
- reader：27原actual client验证HISTORY_READ并在原RR只读事务内再验；published/closure/accounting/receipt/audit gates保留。SELECT h.hall_id原值；count/page/detail使用同一权限/筛选条件，不inner join厅表丢NULL头。
- authorization：ADMIN/WAREHOUSE原ALL才可读NULL；SALESPERSON原当前可信厅 HALL_IDS，h.hall_id=ANY(uuid[])对NULL不成立，DTO validator也必须拒绝NULL混入HALL_IDS。按厅不足/未登录/角色异常原样拒绝；不借仓库厅、创建厅、人员厅扩大权限。ALL传具体hallId过滤仍排除NULL。查询hallId:null仍只是无厅过滤，不新增UNKNOWN筛选语义。
- 历史销货/调拨已有前端HISTORY消费者：runtime/documents/history-reader.ts、history-page.tsx、transfers-history-page.tsx及sales-entry.tsx，原detail/query经真实同源客户端消费；history-revision.ts还消费独立revise入口。当前sales详情validator仍要求hallId为UUID，NULL27批准后须由原前端owner同步窄分支响应校验与空值展示，不能再称无消费者或保证无需前端适配。ALL保留未知厅、HALL_IDS不见未知厅；前端实时新单必填不变。实际接口/页面接通和已发布数据可用性仍按目标证据，不因消费者源码存在记PASS。
- 现有 /sales/history/query 是实时销货操作审计，不是这四个导入历史接口，无hall字段受影响
- 实时销货/新单/维护表单必填、原sales_header decoder及CUTOFF_HISTORY旧列表保持；不自动合并两套列表或扩张页面范围
- 历史调拨四接口中的两路语义不改；新增27组合仍需验证其严格发布/权限未受影响

## 发布、版本与保护

采用新增迁移 27 与明确选择的后继入口；旧 19/26 默认入口和已验事实保留。批准这份字段差异不代表迁移、真实导入或上线已完成。新目录、权限、原池准入和完整闭包仍按具体目标核验，不复用旧 QA 或旧 26 的授权。

- 独立完整SOURCE/MAIN授权逐次含真实actor、原key、batch/selection/target及新payload hash；元数据review不等于来源执行许可
- 相同实际managed client上的MAIN/FINAL/typedPUBLISH准入、cutoff与batch锁及原账务事务；来源/typed/每单据双向覆盖、实际SQL逐字段NULL读回、九项count/global/document roots齐全
- 全部2471单参与预期计数、明细/结算/资金事实和逐仓/原SKU/单位守恒；业务厅空不改变仓库身份或库存净变动
- 回执/审计/账务/closure/批状态在原事务原子提交；失败全回滚；原key已提交回放不得第二次写，授权撤回仍复验；COMMIT结果未知保留原错误并禁止自动重试/假回滚
- STAGED/VALIDATING始终不进入四个HISTORY读接口；暂存、数量相等、手填passed或nullable迁移成功均不能解除非零发布限制

## 实施顺序与回退

1. 将本完整字段确认及最终SHA交用户明确同意；只相关NULL27支路等待，H06保持held；其他已授权不冲突工作继续。
2. 批准后先技术冻结/唯一owner登记；核目标exact26、新备份、实际列/FK/index/trigger/routines/role/ACL、原行数/非空厅原值、无在途写入或leased旧池。C38是19升26前备份，不能冒充pre27 exact26备份；C39本地回执 FAILED_FIRST_ERROR_NO_REPLAY，不称成功issuer或review。
3. 源码先实现/冻结独立27全消费闭包，保留19/26；C协调一个新的最小实际数据库窗口，只测NULL27新增差异，不重复sealed18 run2或已有26同范围。实施迁移27后C采集新完整catalog/当前已核130及目标实际完整routines/nullable/FK/ACL和新独立review。源码/DDL安装不等于应用激活或SOURCE授权。
4. 获准后一次必要销货准备，复用调拨组件及旧sourceQA，构造新target/payload授权和完整manifest；完整同事务闭包/守恒/审计/重放全部必要新条件满足再提交非零MAIN/PUBLISH；首次失败停，不自动gzip/PG重放。
5. 27入口启用前保持旧URL和维护边界；R1/R2切换各自需要目标角色/配置/新review/独立受影响验收，不能用QA或源代码结果冒称生产就绪。
6. 回退前先查是否已存在NULL历史头及业务提交。尚无NULL且有新备份/目标证明时才可审慎逆转列非空并退独立入口；存在任何真实NULL后不能SET NOT NULL、删2471或填假厅。关闭27入口并保全数据，使用保留的26独立目标/在另实例恢复验证或前向修复；不以旧快照覆盖新业务。

## 仅验新增及受影响范围

- 纯协议：空源↔null、known源严格binding、空源夹带binding、undefined/漏属性/空串/假UUID拒绝；stable ID与原sourcehash不变，known行不改。
- 纯协议：旧19/26仍拒NULL/27runtime；独立27所有source消费者/闭合selector及默认19不漂移；复制/foreign/raw/released/double-runtime/metadata变更拒绝。
- C实际新27：唯一hall列nullable；NULL可保存、无效非空FK拒绝；实际全部目录/函数pins/ACL、旧非空行和不可变/closed触发器保持。
- C实际新27：非零完整授权、逐字段null与缺键/字符串区分、源typed双向/全局逐单closure、2471不漏计、逐仓原SKU单位守恒、原事务回执审计、失败回滚/原key无第二写/COMMIT结果未知不重试。
- 四路HISTORY：STAGED不可见，ALL可读已发布空厅且分页总数一致，HALL_IDS列表与详情均不能见空厅，已知厅原范围有效；无仓库/人员厅fallback，无前端必填变化。

## 完整技术附件与依据

- [完整字段、消费者路径、协议差异及 90 项来源固定记录](./SCHEMA-SUPPLEMENT-v5-HISTORY-HALL-APPENDIX.json)。附件保留 D1 原字段申请与历史source pins，并仅校正当前消费者、130 routines及已批v16边界；本次附件SHA256 `25b9f8217987c1ebf9a07be8e0a54d892893ff6ed87b5b874f7668a191405806`。
- D1 的 reusableTransferComponent 内旧 manifest `a198db85…` 仅属当时保全记录；当前 C/QB125 已采用分离 v2 manifest `c8a9cb932904134051b3dd3d8573edc223003cdb73426b16ee752207d2299ac5`，同一 32,263,004 字节 Transfer artifact `c6f0d498…`。该技术索引澄清不改原件或业务数量。
- 本单是字段与依赖合同确认申请。只有用户明确同意后才登记对应实施文件并执行；仅相关历史空厅分支等待，其余开发和验收继续。

