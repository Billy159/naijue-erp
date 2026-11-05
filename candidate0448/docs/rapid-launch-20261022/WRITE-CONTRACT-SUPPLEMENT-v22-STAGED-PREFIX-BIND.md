# v22：保留已提交原来源前缀，完成首次完整来源绑定

状态：待用户确认。本补充由原 D1 单独编写；未改 guard、迁移、消费者或测试。T45 172 历史三表关联已只读回：全部属于原batch且sourceRow/entity关联无缺失或外来；不证明逐字段内容一致，另外五表来源与八表完整快照仍未核准。本文版本 v22 与既有数据库 profile v21 不同。

## 用户确认的最小变化

允许原 R1 批次在**没有首 BIND 成功回执、已有获准来源暂存**的状态下，保留全部既有行，通过新增的逐成员及完整原生快照核验，完成原首次 `IMPORT_BIND_FULL_SOURCE`。原先“25表全部为空”在这个准确后继分支改成“八表只可包含逐项核准的原来源前缀，其他17表仍为空”。不能只接受非空、数量相等、文件哈希、人工 PASS 或 STAGED 状态。

不加数据库表、列、索引或 HTTP 接口；不改前端和共享业务命令合同。明确变更两项写入语义：①原 BIND 首次空表前提增加经过完整证明的已暂存前缀分支；②现有 `audit_change.after_values` JSON 在该分支新增严格形状的 `stagedPrefixProof` 证据，原七个字段及 fullBinding 保持。它是现有审计 JSON 的写合同变化，须此次确认；不是新增表字段。

## 固定目标及现有事实

仅 `erp_rewrite_20261022_r1` / OID `1027659`、原 Unix socket / postmaster、原 runtime `erp_rewrite_runtime_20261022`、actor `151693ec-3f0f-4d39-89a4-4f44601a06b7`、batch `aeeba5c6-fb54-4b94-bf80-93d98212a70d`，namespace `naijue:tplus:primary-ledger`，selection/sourceHash `964038610b470b38996133fa6a7311aea72ef8fe2749ae6fa3d751d09f079cba`。172 当前批次 cutoff 为 `2026-10-04 04:00:00+00`；仍须与原 CORE 和准确148输入三方一致，不把当前值单独当批准证明。

169 首 MAIN 已实际尝试后报23514；170 当前 snapshot 原首键无receipt、STAGED/sequence2/cursor22、未绑定。这不是全局零写证明。171 只读证明八表非空、其余17表为空。106/09/10现存提交及按键读回证明销售头/调拨头行早在169之前已暂存于同来源未绑定批次。历史已验范围复用；它不能代替现在八表全成员、内容及原生快照的再次绑定前必要证明。

原首次 BIND 仍没有成功回执，不能伪造历史回执、修改 xmin 或改走“历史重放”逃过 creation。原首键 `97d9c78b-d846-47af-a3d9-38d9f1ee83c8`、actor、原109命令正文/顺序/请求哈希/业务结果不变；148 BIND.json73746/3a350163b35c771c8fd85401cf7c9d88a6736157300c444c10022c8b2e740609 为原命令身份参考，正文待原持有人核验，不据引用假称重验。DATA原文件SHA与 requestHash(DATA manifest)不是同一量。

## 八表逐项核验：在原 BIND 事务内、更新之前完成

共用要求：来源只取主控已固定、原独立审核通过的148输入/manifest及相应原 reader、mapper、阶段授权与实际提交证据；不从当前数据库反造 expected。逐个实际成员与对应批准 expected 成员双向比对：数量、稳定来源ID/源键/类型、原batch、file/sheet/row、原文件SHA/rowSHA、字段来源和原native标识。缺失、额外、重复、同键不同内容、跨批/跨来源/跨cutoff均拒绝。来源和原生行按其真实类型比较，不把 NULL、0、空文本、未知人员/时间相互替代。允许的是准确固定的这一次完整前缀集合，不是允许任意子集或任意新批次。

| 表；171当前计数，仅现状 | 必须通过的内容与关联 |
|---|---|
| history_sales_header；28282 | 全部 source_row_id 与 SALES_HEADER 源行同batch一对一；完整 typed header，包括状态、日期/人员/时间、金额、厅/客户/仓库/营业员及来源字段，逐项等于原授权 reader/mapper 产物；已有真实缺失仍NULL，不补单据。核原native-reference绑定及原源成员覆盖，不能只核28282。 |
| history_transfer_header；14279 | 与 TRANSFER_HEADER 源成员一对一、完整头快照及两端仓/创建厅来源相同；无多余头或来源替换。 |
| history_transfer_line；261641 | TRANSFER_LINE 原成员、header_id/line_no、原SKU/单位语义、数量及所有商品规格快照逐字段一致；每行只挂其原同batch调拨头，核头行完整集合及双端身份，不能合并SKU。 |
| product；2956 | 全表真实商品与原 PRODUCT source/native catalogue binding 一一对应；完整批准原生快照（所有实际列含价格、尺码组、供货商、season_ids/default scheme 等）与准确原阶段产物一致。若已有明确批准的维护，必须提供原immutable审计链到准确当前version，否则拒绝；不接受“数据库当前值优先”。 |
| sku；14999 | 全表真实SKU、原canonical source与全部别名集合一致；product/color/fit/size/编号/启用/version/创建operation等完整原生快照相同；每一SKU来源、外键、原身份及人工旧码规则不变，不按展示聚合或猜条码绑定。 |
| barcode_scheme；6 | 全表恰为原批准六方案的全部七字段快照；同batch原 COMMITTED INITIALIZE 回执/hash、配对audit、CORE出生/目标/actor/三批准pins一致，原sequence只+1/无claim-ledger副作用。核全表而非存在6行。不在 core 中调用会回调core的原v19完整helper，避免循环；复用其非循环证据条件。 |
| import_sku_alias；15121 | 完整(batch,旧source SKU,canonical SKU,source_row_id,canonical_source_key,mapping_basis)集合逐项等于原授权映射；每行同batch源和native SKU真实存在，无多对一身份误并/重复/外来别名。 |
| import_stock_contributor；38314 | 全部源成员、batch、仓/原SKU映射、canonical key、原单位、有符号数量及baseline_ledger_id逐项与原授权贡献一致；保留负数与零；BIND之前不得已产生账本、余额或伪造baseline链接。逐仓/原SKU/单位汇总与原目标/后续原ACCOUNT贡献关系一致，不改量去凑平。 |

上述 expected 全字段必须能从原固定产物/原reader/mapper及已批准维护链确定；没有相应产物或当前逐项读回证明的组立即停止，不能仅用原阶段“通过”摘要填空。172 RESULT5246/fd6e3dda930155db5f46546a310ab939f2f9f701b27d27194e105d4e16872f1f 已核：三表total=exactbatch=original_source_link分别28282/14279/261641，foreign_or_missing_source均0；同batch CORE与方案初始化COMMITTED各有1份匹配audit，无BIND回执，仍STAGED2/cursor22。只证明结构归属及小回执匹配，不能代替八表完整内容核验。

其余17表继续全空：history_sales_line、history_sales_settlement、sales_header、sales_line、sales_settlement、transfer_header、transfer_line、sku_barcode、product_image、inventory_ledger、inventory_balance、import_history_closure_manifest、import_history_document_manifest、payment_method、payment_account、payment_account_hall、history_revision。原25表清单不删除任何对象；对非本准确分支/其他profile仍保留原空表要求。

## 具体实现接缝及提交时证明

1. 原私有 source authority 为 BIND 提供只读前缀核验端口。输入绑定原命令的完整 requestHash、原148输入/代码身份、准确本批次/namespace/cutoff/selection及批准产物；独立授权先完成。该端口不改原命令正文，不产生新的 MAIN 动作或新请求键。
2. 原 store 在原 genuine runtime pool/lease、原全局cutoff及batch锁内，BIND更新前通过该端口逐成员/逐native字段双向核验。只读借用接口只允许准确查询并全部await；不向 issuer 传包装lease，不引入另一连接写入或运行管理员权限。
3. 核验后，store 在现有BIND audit.after_values增加唯一严格typed `stagedPrefixProof`：版本 `CORE_STAGED_PREFIX_BIND_V22`；准确batch/namespace/cutoff/selection；原命令hash；148批准证据引用；八组成员数及从**批准expected**推导的完整 source/native 成员根、关系证明根。不得接收调用方PASS/verified布尔或从DB行反算expected。这些根用于将逐成员结果与提交时实际集合绑定，不代替步骤2。
4. 仅新exact数据库profile中的 `assert_core_initialization_v14` 修改：完整核新审计JSON形状及证据与原BIND/CORE/actor/本批次一致；对八组遍历实际成员及native/source关联，重核完整集合覆盖/唯一性/父子与别名/贡献关系、原生整行根及证据根一致，检查另外17表仍空；原全局锁使合规stage writer不能在验证与提交间改变集合。不把数量相等或单个文件hash当通过。后续最终校验必须保留原不可变前缀证据及当前批准维护链，允许原109新增阶段按原合同推进，不能错误地永久要求未来数据库仍停在BIND当刻全表状态。
5. 不加helper函数/新routine ACL：上述新逻辑在原函数的有证据分支内实施，保持131个routine、原函数签名/SECURITY INVOKER/owner/ACL。原creation空表分支及历史final规则保留；其他两个v14/v19提交约束仍调用同函数，原scheme helper回调关系不新增循环。若实现发现必须更改另一函数/签名或增加routine，先把具体差异交C，不在本确认下扩大。
6. 新profile建议固定名 `26_v22_staged_prefix_bind_from_v20`，只从原R1 v20/current64c4精确迁入：核原26migration版本、131routine完整body/catalog及已有两列ACL；只替换上述一个body，migration表不新增“27”，不更改其他约束、触发器或权限。新canonical必须按actual导出由原QB签新review；原v20与B07现有v21分支源码保留，不对其他环境部署。

## 准确文件边界；确认后才登记实施owner

- 新SQL：`adapters/postgres/patches/0026-v22-staged-prefix-bind.sql`，准确父态验证及仅一个函数body successor；不改已封存v14/v19原文件。
- `adapters/postgres/src/inventory-cutoff-import-store.ts`：BIND同事务前缀核验接缝及audit JSON附证；原commit/rollback/原receipt replay与原command不变。
- 新 `adapters/postgres/src/native-core-staged-prefix-bind.ts`：仅八组typed只读逐成员核验/证据捕获，不建泛导入平台；私有adapter类型不改共享application命令定义。
- `adapters/postgres/src/native-import-accounting-capability.ts`：新增exact v20 successor metadata probe/profile选择；不修改原lease WeakMap、guard逻辑或其他profile准入。
- `scripts/import-v3/production-source-provider26.mjs`、`production-source-host.mjs`、`run.mjs`：仅原独立source端口产生/传递及绑定原148/原BIND身份，原109steps/顺序/key/digest不变；原v21完整EXPECTED复用继续生效，不重新跑148/重复11组closure计算。
- 原provider/host测试及新针对prefix adapter/issuer/profile的有限测试。数据库成功/失败/回滚验证仅由C协调、T45在准确stage/QA目标执行；D1不自行新建数据库或执行本R1试写。若需要新增integration测试叶由C另列owner，不能在文档确认前先写。
- docs仅本v22补充与对应机器状态；C维护三接续记录。前端、公共业务合同、原来源资料、冻结Demo均不改。D3现有provider/host归属保留，实施须C拆owner，不并发抢写。

## 失败、恢复与必要验证

任何成员/快照/来源/版本/命令/目标不匹配都在原事务报错；BIND checkpoint/hash、配对audit/receipt全部回滚，已提交暂存前缀原样保留。不将既有源数据纳入“回滚删除”。原有168两列ACL保留，不因23514回撤。

COMMIT异常仍为UNKNOWN：丢弃连接，由T45在新只读事务按原actor/key/hash/action/target核原回执和checkpoint/audit；不能自动重发、改key、换batch或继续109。只有原证据确认允许的受控后继才使用同原key和同原命令；旧失败job不重跑。已COMMITTED返回原结果，不重复更新。

部署SQL独立短事务失败回滚函数DDL；成功后的程序/目录需整套新profile绑定，不能单独把旧review摘要替换为新值。若BIND尚未COMMITTED，撤回此功能可恢复精确原body并重签目录、保留暂存不动；若新BIND已COMMITTED，不能直接降级到拒绝该证据的旧body，须保留兼容读回实现，业务恢复由C/T45按首笔边界处理，不删回执/audit或重导。

必要差异测试：原空前缀分支复用已有接受证据；仅新增准确八表前缀成功、每组外来/缺失/重复/改字段或关联拒绝、17表任一非空拒绝、错batch/cutoff/selection/原命令或旧profile拒绝、失败后BIND元数据/audit/receipt无新增且原前缀未变、原键只读恢复/重放无重复、提交前成员变化拒绝。原normal两PASS、SYN回滚、sealed18run2不重跑；无新全suite/长压测。

当前三历史表结构关联已核，其余五表来源、全部八表逐字段内容、上述SQL successor、真实BIND成功/后续109/完整入库/最终发布均未完成。STAGED始终隐藏；历史人员和时间缺失允许NULL、前端必填不变；2958异常商品级条码不导入；各仓库存数量守恒仍需最终逐键读回，不凭此前缀通过解除发布限制。

## 可直接确认的文字

“确认 v22：仅允许当前原R1批次在八表已有原来源暂存且逐成员/完整原生快照严格核准后，以原命令和原键完成首次BIND；允许该exact successor的单函数约束及审计JSON证据变化，其他17表仍空、来源/权限/事务/守恒/发布核验不减。按所列文件分工实施，新增数据库测试由主控协调；此确认不等于实际导入或发布通过。”
