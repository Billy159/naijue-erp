本单为当前 I07/I08 库存流水的新增字段确认，状态 PENDING_USER_CONFIRMATION。

仅申请逐笔 quantity_before / quantity_after 两个可空 bigint 列，以及下文明确的算术约束和真实持锁前值守卫；尚未实施。旧流水保持 NULL／未知，不倒推或回填，不改单据、SKU、条码、历史人员与来源。当前筛选、分页和界面接线继续。

当前实际 QA101 与 R1C103 均为 v11／122 routines；v12 只有已固定源码，尚未安装。本单不把未来 v12 当现状，也不授权跳过 v11／B07 的原验收。C 在实际安装前固定唯一真实底座与同版完整资源；新字段写入与新读取必须成套。

文件归属以现有 WRITE-OWNERSHIP 为准：apps/api/src/postgres-read-api.ts 属原 D1，C 管运行配置和部署；前端 ledger-contracts／reader／drawer 属原 F2，公共合同与读取属原 D3。下方 D1 原只读差异中的“C/前端”等泛称按此收窄，不转移唯一 owner。

候选新 SQL 路径仅预留并关闭写入，收到明确确认后再开放；v11 C102 原验证和现有后继不依赖这两列。新 pair 已提交后保留事实，不能靠 DROP 列回退。

以下为原 D1 已完成的具体字段、函数、文件、约束、兼容、隔离验证和回退差异：

---

I07/I08 逐笔库存前后数量：待用户确认的字段与写入差异

状态：仅只读源码核查与确认差异，尚未获字段批准。没有执行 DDL、写入器修改、回填、数据库验证或共享合同/前端修改。本文供 C 纳入原字段确认体系，一次向用户确认；本报告不是批准记录。

现有事实不能完整满足逐笔前后数量显示。`InventoryLedgerRow` 只有 `quantityDelta`，`inventory_balance` 只有最新数量/版本/last_operation_id；销货及调拨审计记录单据变化，原回执返回流水 IDs，未记录每条流水的余额转换。`posted_at` 是业务事务提供的时间，同刻 UUID 排序是分页顺序；xmin/单据版本/最新 last_operation_id 也不是全历史逐键提交顺序。因此旧流水不能倒推 before/after，不能用当前余额、累计排序或基线反推数冒充当时事实。已存在的个别末端线索不构成整套逐笔权威事实。

可以直接复用原同键 advisory transaction lock、余额 FOR UPDATE、事务内余额缓存/CAS、真实首次零库存证明，以及原流水/余额/单据/审计/回执闭包。无需再建余额事件表、顺序号、写接口或第二套 posting，也无需把字段带入客户端命令/幂等哈希。若继续只显示 UNKNOWN，不需要加列；若要显示今后实际业务每笔前后库存，则当前实现需持久化两列。

| 候选字段 | 类型与默认 | 准确含义 | 旧行与客户端 |
| --- | --- | --- | --- |
| inventory_ledger.quantity_before | bigint NULL，无 DEFAULT | 本条真实库存变化在原持锁事务中使用的前值 | 原有行保持 NULL，不回填；客户端不能指定 |
| inventory_ledger.quantity_after | bigint NULL，无 DEFAULT | 同条变化后的真实值 | 原有行保持 NULL，不回填；客户端不能指定 |

候选 CHECK 名 `ledger_quantity_transition_pair`：两列同时 NULL，或同时非 NULL 且 `quantity_before::numeric + quantity_delta::numeric = quantity_after::numeric`，整体用 `IS TRUE` 封闭 SQL NULL。numeric 只用于比较防止 bigint 加法溢出；字段与程序数量仍是现有有符号 bigint 范围，接口一律十进制文本，不经 JS Number。负数是事实，不截断为 0。不新增索引、表、序列、外键、事件种类或业务权限。

CHECK 本身只证明算术，不能证明前值来自真实余额，也不能强制未来写入非空。因此候选实现同时约束所有新流水：原 PostgreSQL writer 在同一 client/同一持锁事务中从当前已锁余额取 before，以现有精确加法得到 after；新 `guard_inventory_ledger_quantity_transition()` / `inventory_ledger_quantity_transition_guard` BEFORE INSERT 核两值非空、真实余额前值及等式，拒绝缺失、单边 NULL、伪前值或越界。该触发器复用原 `inventory_key_lock`，不另设锁域，保留全部现有源、反审核、PUBLISH 与延迟闭包触发器。它不产生或替换授权，不接受“暂存已通过”证明。

余额不存在时仅以下原证据允许 before=0：同键确实无先前流水；APPROVE 经原完整已发布范围/native admission 首用证明，或 HISTORY-v12 经同一原准入及修订证据，或 CUTOFF_BASELINE 经原空库首次导入、原 batch/仓/SKU 来源和未用键守卫。不能把普通未查到余额、UNKNOWN、缺坏余额、反审核或 STAGED 当 0。现有零贡献不生成流水的规则保留，不造 version-0 余额占位。

逐笔仍按原 `appendLedger → putBalance` 顺序完成；同一事务多真实行使用同一 SKU 时，每条取上一条已落余额，不能给所有行复制第一次 before。UNAPPROVE 取反审核当时实际余额重新记录，不能复制被冲销旧流水的 pair；它仍引用原 reverses_entry_id。调拨逐行两端数量变化守恒，before/after 分别来自各仓真实余额，不能要求两仓绝对值相等。

以下是批准后候选最小生产文件集合；现在均未修改。路径相对 R=`work/erp-local-source-20261022`：

| 文件与归属 | 具体候选变化 |
| --- | --- |
| adapters/postgres/patches/0026-v13-inventory-ledger-transition-quantities.sql，D1/C | 新文件候选名，C 尚未登记；两 NULL 列、上述 CHECK、一个新 BEFORE 函数及 type=7/O/非延迟/非 internal 触发器。无 UPDATE 回填。现有 migration 版本机制保持，由 C 固定实际前置版本，不猜当前库已是 v12。 |
| adapters/postgres/src/inventory-posting-balances.ts，D1 | PostgresPostingBalances 增加事务内取真实 pair 的小方法，调用现有 assertCanAppend/get/provenZero/addQuantity；createPostgresHistoryRevisionPosting 的原 ledger INSERT 增加两列参数。保留原 put/CAS/原 complete-key 锁序，无新 pool/事务。 |
| adapters/postgres/src/sales-unit-of-work.ts，D1 | PostgresSalesTransaction.appendLedger 的一处 INSERT 从原 balances 实例取 pair；不从业务传入的 InventoryLedgerRow 或原 reversal row 获取 pair。 |
| adapters/postgres/src/transfer-unit-of-work.ts，D1 | PostgresTransferTransaction.appendLedger 同上，一处 INSERT，两个仓独立取值。 |
| adapters/postgres/src/inventory-cutoff-import-store.ts，D1 | PostgresCutoffImportStore.insertNativeBaseline 与 insertItem 两处 CUTOFF_BASELINE INSERT 写 0→原 signed baseline quantity；0 由原首次空键守卫证明，不是旧业务历史的原始期初。原零贡献不造 ledger，不重建/覆盖已用 stock。 |
| adapters/postgres/src/native-import-accounting-capability.ts，D1/C | NATIVE_RUNTIME26_METADATA_PROBE、createNativeRuntime26Issuer：仅在获批后固定新 patchLevel、两个列定义、新 CHECK/函数 body SHA 与触发器形态及全量实际 catalog pin。不得在 v11/C102 进行中并改该文件。 |
| adapters/postgres/src/inventory-ledger-query-reader.ts，D3 | 显式已核新 catalog 才在原 query/select/decodeEntry/displayEntry 读取两列 ::text；两 NULL 保持 UNKNOWN，两数齐且等式正确才输出 KNOWN。坏半对/算术坏值返回原完整性错误，不能改 UNKNOWN 掩盖。筛选/count/分页不加 JOIN/逐行请求。 |
| packages/application/src/inventory-ledger-query-contracts.ts 与 inventory-ledger-query-validation.ts，D3/原 owner | 当前 display.balanceTransition 只允许 UNKNOWN；候选在原 numbered mode 扩展同一四键联合：UNKNOWN/null/null/NO_RECORDED_BALANCE_TRANSITION，或 KNOWN/精确 before 文本/精确 after 文本/reason=null，并校验加法。旧 cursor 模式原响应保持。这是待 C 纳入确认的共享响应差异，D1 不写。 |
| apps/web/src/inventory/ledger-http-reader.ts，原前端 owner | 存在独立严格 decoder，目前明确拒绝 KNOWN；批准后须与共享联合同时消费，不能只改后端导致实际响应被拒。D1 不改前端。 |
| apps/web/src/inventory/ledger-contracts.ts、ledger-drawer.tsx 及原 I07/I08 workspace 页面 owner，C/前端 | 前者重导出共享类型；显示消费者须使用原视图的两个单元格展示 KNOWN 文本/UNKNOWN 原占位。这只是影响清单，未授权 D1 改动任何前端，不新增设计或导航功能。实际 UI 固定版到达后由 C/F owner 定 exact diff。 |
| apps/api/src/postgres-read-api.ts，C | 原唯一 pool/host 的版本选取及新 issuer 绑定。原 /inventory/ledger/query 认证、按仓/厅/SKU 权限和 Origin/session 保持；无新增 URL。不是新业务写权限。 |

现有业务领域 `packages/domain/src/inventory.ts`、application posting ports、sales/transfer service 和命令 parser 不必增加 pair 字段；原请求 hash、操作 ID、SKU/仓身份、receipt result shape 及 reversal 引用保持。两值仅由持锁数据库适配器生成。`apps/api/src/inventory-ledger-query-http.ts`、inventory-ledger-query-service.ts、前端 ledger-contracts 的现有类型重导出主要为依赖闭包检查，若原转发已足够，无需机械改文件。

issuer/catalog 顺序：当前实际 C101 是 v11/122 routines/592 columns；v12 的 128 routines 仅是既有源计划，不能写成该库实际状态。若 C 最终选择完整 v12 为批准后的单一底座，新 guard 后计划 129 routines、相同 60 relations、原列数+2、CHECK+1、非 internal 触发器+1；旧函数 body/ACL/既有触发器均不应变化。由 C 从实际库导出整个 catalog 并由原 QB 绑定目标/角色/OID/process、列属性、CHECK 文本、函数 body/ACL、trigger type/状态/表/例程及原签名用途重新审核。沿用必要的 INVENTORY_ADMISSION/HISTORY_REVISION 等用途，数量列不自动授予新用途。旧 review/metadata 不兼容，不能绕过 exact pin；未获新核验的旧 writer 保持关闭，不靠遗漏新列继续写 NULL。没有新权限 GRANT。

默认与旧数据兼容：DDL 新列可空无默认，旧流水字节意义与原 ID/source/delta/date/person/audit/receipt 完整保留；查询旧行继续 UNKNOWN，禁止回填或重放旧单据。经 C 固定同版新 issuer 后，保留原 reader 显式 SQL/原 UNKNOWN 响应形态的兼容入口不需要读新列；旧 issuer 本身不能接新 catalog。新 reader 只按 C 明确固定且已核的新 profile 启用，不用捕获 missing-column 异常降级。KNOWN 联合必须随同版后端、前端 decoder 与 UI 一起切换；在此之前不输出新联合。当前 readonly 页、筛选/准确总数/编号分页和导航点击授权不受该等待阻塞。

导入与 HISTORY-v12 影响：五个 INSERT 站点覆盖 LIVE 两类、原 cutoff 两分支和 HISTORY leaf。导入 source payload/hash、stable IDs、checkpoint counts、typed HISTORY manifest/final PUBLISH/claim 守恒合同不变；新列不进入原源文件签名，也不改变 stock contributor 原 signed sum。CUTOFF_BASELINE 的 0→target 仅指本新系统首次落库，不宣称旧系统 SOURCE_ORIGINAL_OPENING。HISTORY 数量修订使用原已生效数量差额记录 pair；amount-only、DRAFT/VOID 修订仍零库存行，不因新列造库存影响。NULL 历史人员/日期保留；日期未知的非零修订仍按原规则拒绝。2958 异常商品级条码仍不导入。v11/C102 和当前 B07 runner 不加入这些字段，也不依赖此次批准。

最小隔离验证由 C 协调，仅新增差异，不重跑 sealed18 run2 或原已验全目标：

1. 新列/约束/metadata 形态与旧行 NULL、旧源码/数据摘要保持；新错误 catalog/缺 guard 必须关闭写入。旧 reader 仍 UNKNOWN；同版 reader/decoder 的 KNOWN、NULL 和半坏值定向检查。
2. 原正常 LIVE services 做已用键/真实首用键、同 SKU 多行、负余额及反审核的 pair；精确 before+delta=after，逐条接续；原键重放无新 pair/余额写入。缺损已用键不得当 0。
3. 原调拨双端及原 HISTORY-v12 数量差额：逐仓真实 pair、逐 SKU 合计 delta=0；money-only/DRAFT 路线不产生 pair 行。保留旧 NULL/source/原角色权限与原 IDs。若该 v12 actual 尚未通过，保持待测，不由该字段任务代验。
4. 原同键持锁两操作的一次小型实际等待检查：后操作记录前操作已提交的余额，不能用早先读取值；第二端失败实际 ROLLBACK 后 pair 与 ledger 同时消失。复用原诊断设施，不另建服务器/长压测。
5. 一组受控错误 pair（两 NULL 新插入、半 NULL、伪 before、不配平/越界）在原守卫下拒绝；仅回滚隔离无效尝试。新 cutoff 写列分支只测新字段影响的一条实际正常来源/真实首次空键，不重复旧发布整套目标；无合适新目标则准确待 C 协调，不能编造/复用旧回执当新实测。

回退分界：在 shape 安装后、第一条新业务 pair 提交之前，C 可按精确底座恢复对应 schema/catalog 并核旧数据。已有新 pair 提交后，默认保留两列与事实，优先保持 schema 向前、回退展示到 UNKNOWN 或关闭新写入，按原键读回修复；不得以代码回退为由 DROP 列抹掉新增事实。旧 exact issuer 不能冒充兼容新库。若必须恢复整库，仍按 C 原成套备份/原业务提交分界处理，不单独回放库存或删除流水。

交还：候选字段 2；新事实旧行不回填；计划新 SQL guard 1、BEFORE trigger 1、CHECK 1；现有五个 ledger INSERT 站点与同键余额缓存复用。D1 未实施、未启库、未测试；C 负责原字段批准、owner 边界、实际前置 catalog 选择、QB 与数据库验证调度。本文不改变原待验、发布限制或真实导入未完成结论。
