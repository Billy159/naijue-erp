# ERP 统一主控交接

日期：2026-11-07 UTC。用途：把此前分批提交的业务审查、补充审查与覆盖核对合为一个交接包，供主控统一定级、修复和验收。本文件是本包唯一的当前汇总入口；不需要再拼接旧包。

**去重后的确证数：P0 0 项，P1 1 项，P2 7 项，共 8 项。另有 P1 候选 2 项，以及列表与汇总快照待验证 1 项，均不计入确证数。**

这些是本次已覆盖范围内的发现，不代表全仓不存在其他高风险问题，也不是上线、合并或发布通过结论。本包未包含已实施的修复。

## 主控先做什么

1. 以本 README 的统一编号、状态和范围建立修复任务，不累加各原报告的小计。先处理 SALE-NULL-HALL-01；其真实影响取决于既有空营业厅历史销货单，当前未查询实际数量。
2. 在产品规则上裁决 CAT-02，在获准的隔离环境核对 PARTY-AUTH-01 的正式调用链、事务授权及数据库保护。二者保留为 P1 候选，不能直接宣称已确认线上数据事故或越权。
3. 按下列 7 项确证 P2 分项修复。SET-01 跨营业厅、仓库、收款方式、资金账户、员工及账号合并入口，只建一个缺陷，验收覆盖全部入口。
4. 核对 DOC-TOTALS-01 的真实认证连线和 PostgreSQL 快照行为后再定级；不能把模拟 XID 结果当成实库证据。
5. 每项回交修复提交 SHA、改动清单、验收日志与未完成项。本次仅交接方案和证据，不代替修复授权。

## 固定基线和禁止事项

- 仓库：https://github.com/Billy159/naijue-erp
- 正式审查分支：`codex/erp-0448z-formal-catalog-root-20261107`
- 固定提交：`3b82c46ebc0b49b26005b023c5e97bc779c8628c`
- 固定源链接前缀：https://github.com/Billy159/naijue-erp/blob/3b82c46ebc0b49b26005b023c5e97bc779c8628c/
- 本次合包重新只读核对两份原审查 checkout，HEAD 都是上述 SHA，工作树均干净，见 `verification/baseline-check.txt`。这证明合包时的源码状态，不倒推缺失的历史测试命令或环境证据。
- 当前只做文件阅读、证据复制、交接整理及完整性核验。**没有修改源码、安装依赖、连接或启动数据库、运行真实 HTTP 服务、访问真实账户或生产业务数据。**
- **导入与运维不在本次范围内，禁止因补漏或修复而自行执行导入、迁移、部署、生产数据修改、删除、恢复或生产单据撤审。** 后续需要真实环境验证时，主控须另行取得明确授权并使用隔离目标。
- 包含的脚本为历史合成复现材料，不是允许直接在生产运行的工具，也不是部署脚本。没有生产数据库、账号、会话或密码材料。

## 统一去重清单

| 统一编号 | 当前状态 | 问题 | 原始证据位置 |
| --- | --- | --- | --- |
| SALE-NULL-HALL-01 | 确证 P1，实际影响有数据条件 | 历史销货原 null 营业厅被适配器校验拒绝 | evidence/02-sales-inventory/ |
| B1 | 确证 P2 | null 支付方式结算行仅重排也导致保存回滚 | evidence/01-transfer-settlement/ |
| B2 | 确证 P2 | 合法重复 SKU 调拨草稿无法编辑 | evidence/01-transfer-settlement/ |
| B3 | 确证 P2 | 调拨已提交后二次读取失败仍显示旧状态和成功提示 | evidence/01-transfer-settlement/ |
| CAT-01 | 确证 P2 | 原颜色或版型停用后阻断商品普通编辑 | evidence/03-catalog-settings/ |
| SET-01 | 确证 P2，范围已合并扩展 | 未决写入只有查回执，没有安全的原请求重试出口 | evidence/03-catalog-settings/ 与 evidence/05-coverage/ |
| BAR-01 | 确证 P2 | 当前主条码错显示停用旧码、隐藏启用主码 | evidence/03-catalog-settings/ |
| INV-PRINT-FIT-01 | 确证 P2 | 库存打印保留独立版型行却丢失版型身份 | evidence/05-coverage/ |
| CAT-02 | P1 候选，不计入确证 | 仅改名称也生成未明确选择的交叉规格 | evidence/03-catalog-settings/ |
| PARTY-AUTH-01 | P1 候选，不计入确证 | 客户和供应商维护可能沿用撤权前 actor | evidence/04-remaining/ |
| DOC-TOTALS-01 | 待验证，尚未定级，不计入确证 | 认证步骤可能让列表与汇总的快照比较自失效 | evidence/04-remaining/ |

PARTY-AUTH-01、DOC-TOTALS-01 是本次合包为既有线索补设的统一追踪编号，不是新增已证实 BUG。原文中的 B1/B2/B3、SALE-NULL-HALL-01、CAT-01/CAT-02、SET-01、BAR-01、INV-PRINT-FIT-01 保持不变。原报告提到的 H1–H4 不另加计。

## 八项确证问题的修复与验收

### SALE-NULL-HALL-01 历史销货原 null 营业厅被拒绝

**证据和影响。** 合法 `CUTOFF_HISTORY` 原单可保留 `hallId=null`，业务规则允许只改备注及符合原始证明的重审。`adapters/postgres/src/sales-native-facts.ts:50` 却无条件调用只接受字符串的 hall ID 校验，真实 facts loader 在零条 SQL 时抛 `INVALID_DATABASE_VALUE`；正式 UOW 在 `sales-unit-of-work.ts:276–285` 调用它。失败会进入 500/uncertain。条件性业务阻断已确证；未证明生产存在多少受影响单据，撤审到重审完整生命周期未做实库执行。

**修复。** 仅在 `hallId !== null` 时执行 UUID 校验，仍拒绝 undefined 和错误类型；是否允许历史 null 仍由当前事务授权与 `historicalHallProof` 判断。不得用登录厅、当前仓库厅或默认值补写原厅，不得通过弱化数据库错误分类掩盖根因。

**验收。**
- 原 null 厅且封存证明匹配的既有草稿仅改备注成功，厅仍为 null，版本只加 1，审计及回执各一次，库存和流水不变。
- 隔离环境验证符合条件的撤审、原样重审恢复原批准余额，无重复扣减；不要在生产为复现而撤审。
- 原键重放不重复版本、审计或流水，另键旧版本仍返回 VERSION_CONFLICT。
- 新建或非历史单 null 厅、历史证明不匹配、擅改仓库仍拒绝；业务员仍须有当前厅权限；正常非空厅回归通过。
- 真实适配器及 UOW 协议层补测，正式前端保存后能读回，不再陷入同因 500 重试。

证据：`evidence/02-sales-inventory/HANDOFF-INVENTORY-SALES-3b82c46e.zh-CN.md`、`repro-null-hall.mjs`、`repro-null-hall-result.json`。

### B1 null 支付方式结算行重排保存回滚

**证据和影响。** 原结算行的身份、账户、null 方式、方向和金额不变，仅因删除前置行或换序导致 lineNo 改变。业务层允许保留原支付事实，`adapters/postgres/src/sales-unit-of-work.ts:425–443` 却把行号变化当作需重新验证的支付变更，抛 `INVALID_SETTLEMENT_REFERENCE` 并回滚。真实 UOW 加 scripted client 已复现，不是实库测试。

**修复。** 完全未变行仍跳过；原支付事实未变、仅位置变化时按所有者与原行 ID 只更新 `line_no`，保留 null 方式及账户/方式名称快照。行序变更须进入审计；不能允许新增 null 行或推断历史支付方式。

**验收。** 删除前置行、交换、已知与 null 方式混排均可保存；ID、方向、精确金额和快照不变，版本一次；新 null 行、改变金额/方向的 null 行、外部 ID、旧版本仍拒绝；失败完整回滚，原键不重复回执；获准实库验证行号唯一约束与换序中间态。

证据：`evidence/01-transfer-settlement/REVIEW.zh-CN.md` 的 B1、`reproduce-null-settlement.mjs`、`null-settlement-reproduction.log`。

### B2 合法重复 SKU 调拨草稿无法编辑

**证据和影响。** 两条独立 ID/行号引用同 SKU 是合法实际行，正式详情的 `transfer-existing-document.ts:33–49` 却直接 unavailable，`transfer-proposal.ts:128` 还存在唯一限制，连备注、日期也不能编辑。真实类复现为 2 行、1 SKU、读取次数 0、phase=unavailable。

**修复。** 在正式详情入口接入按原 line ID 编辑的 fallback。SKU 读取可去重，实际行必须分别映射、保留各自快照；不能仅删第一道限制，也不能合并实际行。新增、删除、替换仍执行原授权和 CAS。

**验收。** 相同 SKU 不同数量/快照分别展示并可单独修改；备注、日期可保存且仍有两个 ID；保存、审核、弃审、再编辑的效果逐行保持双仓守恒；重复 ID、外部 ID、相同行号仍拒绝；取消/返回/迟到响应/冲突/非法数量正确处理；补测超过 200 行或规格缺失时的 fallback，此扩展不另增 BUG 数。

证据：`evidence/01-transfer-settlement/REVIEW.zh-CN.md` 的 B2、`reproduce-transfer-ui.mjs`、`transfer-ui-reproduction.log`。

### B3 已提交后二次读取失败仍显示旧状态和成功提示

**证据和影响。** `runtime/documents/transfers-detail-page.tsx:21–40` 在操作及第一次读回成功后，再次 query 失败仍无条件提示“已重新读取服务器单据”，正文继续取 LatestQuery 保留的旧 success，可靠重试按钮还可能消失。真实 LatestQuery 合成复现；成功 notice 按源码赋值复现，未做真实 DOM。操作前版本/状态比较会阻止后续旧单写入，尚无重复过账证据，所以为 P2。

**修复。** 统一采用刚读回的 authoritative DTO，或检查第二次 query outcome，仅成功后提示刷新完成。错误时明确标记旧内容并保留只读重试入口，展示与操作使用同一当前版本，保留 CAS。

**验收。** SAVE/APPROVE/UNAPPROVE 分别覆盖第一次读回失败、第二次失败和返回旧版本；不能显示刷新成功，恢复后显示最新状态；只重读不重发原操作；切单/离开后迟到结果不覆盖新页面；重复点击或版本变化不额外写入。

证据：`evidence/01-transfer-settlement/REVIEW.zh-CN.md` 的 B3、`reproduce-transfer-ui.mjs`、`transfer-ui-reproduction.log`。

### CAT-01 停用原颜色或版型阻断商品普通编辑

**证据和影响。** 正式编辑从 enabled SKU 还原颜色/版型轴，每次保存无条件提交 skuSelection；服务按新增规格要求所有选择仍启用。因此仅改名称、价格或图片也被旧停用引用阻断。真实 service 和 SQL leaf 的 scripted client 已复现；不携带 selection 的同一修改可成功，只更新商品根、不写 SKU。

**修复。** 区分保留旧规格和明确新增规格；普通字段编辑不触发规格扩展，原引用保留，新 SKU 仍严格要求目录启用。与 CAT-02 共享代码时仍分别保留验收，不能因此把候选自动定为确证。

**验收。** 原颜色或版型分别停用后改名称、价格、图片、补旧码均可完成，SKU/条码不变；新增引用停用目录仍拒绝；混合新旧选择、并发停用、CAS 和幂等全部覆盖。

源码：`runtime/products/editor.tsx:58,103–104`、`apps/web/src/products/product-editor-state.ts:106`、`product-maintenance-service.ts:270–283`、`product-maintenance-store.ts:453–460,503–508`。完整路径和复现见 `evidence/03-catalog-settings/report.zh-CN.md`、`reproduce-catalog-settings.mjs`、`reproduction.log`。

### SET-01 未决写入缺少安全原请求重试出口

**统一范围。** 营业厅、仓库、收款方式、资金账户，以及正式员工与账号合并维护入口。所有入口是同类恢复缺口，只计一项 P2。员工扩展实际复现的是不含密码的普通改名，不能外推为改密路径已执行验证。

**证据和影响。** 首次写入网络失败进入 uncertain；仅能查回执，持续 RECEIPT_NOT_FOUND 仍 uncertain。提交、关闭、丢弃及同类新建被锁住。未到服务器的请求永远不会有成功回执。真实 store/payment/staff controller 合成复现为 1 次 execute、3 次 receipt404、仍锁定。锁本身用于防重复写，不能直接删除。

**修复。** 为无密码请求保留不可变原 body/key，增加用户主动“按原请求重试”，通过后端幂等确认一次结果；不能把 404 当已回滚，不得换 key 或自动重复写。员工 controller 当前未保留完整 body，不能简单调用 submit。含凭证操作另做安全恢复设计，例如用户重新输入原内容并校验原请求指纹，不得持久保存明文密码。

**验收。** 在各正式入口分别验证首次根本未执行、事务回滚后丢响应、提交后丢响应；最终版本/审计/回执各一次；双击、取消/切页、刷新、401 清身份、403 未决保护不换 key、不覆盖。账号入口实际映射 StaffRuntime，不能只测独立旧 AccountSettingsController 就称正式页通过。

证据：`evidence/03-catalog-settings/report.zh-CN.md` 与 `reproduction.log`；扩展见 `evidence/05-coverage/COVERAGE-AND-FINDINGS.zh-CN.md` 的 SET-01、`reproduce-remaining.mjs`、`reproduction.log`。

### BAR-01 当前主条码错误显示停用旧码

**证据和影响。** `runtime/products/editor-barcodes.tsx:20` 只 find 第一个 MAIN，不筛 enabled；当停用旧 MAIN 排在唯一启用 MAIN 前，就显示旧码及停用状态。真实组件 JSDOM 复现，非浏览器或线上截图。详情 reader 已正确选择 enabled_main，可作为对照。

**修复。** 区分 activeMain 与 retainedMain；当前列显示启用主码，历史停用码在全部条码保留。无启用码时明确历史状态，补码仍遵守停用主码不可自动覆盖/恢复规则。

**验收。** 启用码排前/排后结果一致；多停用、零启用、仅单启用、全空明确区分；条码原文不变，详情与编辑主码一致。

证据：`evidence/03-catalog-settings/report.zh-CN.md`、`reproduce-barcode-view.mjs`、`barcode-dom-reproduction.log`。`barcode-dom-bundle.mjs` 是原合成组件构建产物，原样保留，不是业务源码补丁。

### INV-PRINT-FIT-01 库存打印丢失版型身份

**证据和影响。** 同款同色同仓同尺码的两版型在屏幕及 Excel 可辨认，`apps/web/src/inventory/output-adapter.ts:229–243` 的打印正文/小计却遗漏版型，仍保留两条数量。正式 `runtime/inventory/output.tsx:12–15` 使用该流式打印路径。真实 reader 校验合成 NDJSON 后，同步与正式流式 HTML 一致，Excel 含两版型，打印均缺失。属于纸面身份误读风险，未证明库存实际写错。

**修复。** fit=true 时打印正文和小计应有明确版型身份，可加版型列或商品元信息。不许关闭版型或静默合并来掩盖问题，也不改变数量精度。

**验收。** 同款两版型数量相同/不同均清楚；fit=true 时屏幕、Excel、同步/流式打印归属数量一致，fit=false 合并仍正确；负/零/未知/部分已知/不可用规格/超长名/HTML 字符正确；完整仓库尺码、跨页身份不丢，取消或未到 EOF 不发半成品；获准浏览器另验打印预览和分页。

证据：`evidence/05-coverage/COVERAGE-AND-FINDINGS.zh-CN.md`、`reproduce-remaining.mjs`、`reproduction.log`、`synthetic-print-output.html`。HTML 仅含合成数据，不是浏览器/打印机视觉验收。

## 两项 P1 候选和汇总待验证

### CAT-02 普通编辑隐式扩展交叉规格

**已知。** 原 C1/F1/S、C2/F2/S 两条 SKU 被投影成颜色及版型轴；只改名称也提交 skuSelection，真实 service/SQL leaf 生成 C1/F2/S、C2/F1/S，2 条变 4 条，审计含新增两条。脚本关闭默认条码方案，未复现条码新增或库存变化。

**缺口与决策。** 尚未明确“普通资料编辑自动补齐所有交叉规格”是否为业务要求。若不符合意图，按 P1 数据变更风险处理；若确为设计，应由主控记录接受口径并明确提示新增清单。不能声称生产已有实际受影响数量。

**拟修复。** 仅 CREATE 或明确规格变更时提交生成意图，保留旧真实 tuple，不以轴集合推断新增授权；保存前显示新增组合，服务仍保持批准的完整尺码组规则。

**验收。** 稀疏组合、缺尺码、含停用 SKU 的商品只改名称/价格时，SKU/条码数量、ID、坐标、enabled 完全不变；明确新增才按批准规则补齐，重放不重复；生成乘积上限不阻断无关字段编辑。

证据：`evidence/03-catalog-settings/report.zh-CN.md` 的 CAT-02、`reproduce-catalog-settings.mjs`、`reproduction.log`。

### PARTY-AUTH-01 客户供应商维护可能沿用撤权前身份

**已知。** 合成脚本先取得 ADMIN actor，再模拟降为 SALESPERSON、禁用登录或离职，仍用旧 actor 做 CUSTOMER/SUPPLIER EDIT。六例均模拟 COMMIT、版本 8，所统计命令区间没有匹配的当前身份读取；重新认证时则拒绝。SQL 文本检查显示通用维护根映射未含 CUSTOMER/SUPPLIER，空映射会提前返回。

**缺口。** 脚本 COMMIT 不是实库提交，查询模式统计也不等于穷尽间接授权。未核对完整正式 API 时序、实际迁移安装、全部专用触发器或真实竞争行为，不能宣称已确认线上越权。是否要求已在途操作立即响应撤权，也须明确契约。

**拟修复。** 若正式链和实库验证确认缺口，将当前账户、员工、会话和角色的最终校验，与写入处于一致的事务锁或版本约束；覆盖客户与供应商，保持 CAS、回执幂等和未知结果语义，不凭单一通用 guard 文本就改数据库。

**验收。** 获准隔离环境覆盖两类对象 × 三类撤权，插入“认证后、提交前”屏障；按确认的撤权规则拒绝，业务行、成功回执、成功变更审计无部分提交；有效身份成功、原键重放、旧版本冲突继续通过；核验实库触发器及完整 API 到提交链。

证据：`evidence/04-remaining/reproduce.mjs:54–69`、`reproduce.log`，以及该目录 `ORIGINAL-HANDOFF.txt` 的保守边界说明。

### DOC-TOTALS-01 列表与汇总可能被认证步骤自身判为变化

**已知。** 合成模型规定 SQL 出现 FOR UPDATE/FOR SHARE 就令 XID 增长。sales/transfers 分别执行认证→列表→再次认证→汇总，两类各两轮均 DOCUMENT_READ_CHANGED，汇总 SQL 未执行；只读 resolver 对照成功。

**关键限制。** “行锁使 XID 增长并改变此处快照”是脚本假设，不是数据库引擎观察。正式 resolver 连线未由此脚本独立证明。不能直接定为 P1/P2，也不能把换用只读认证视作已验证修复。

**核查及拟修复。** 先核对实际列表和汇总路由、readRevision 语义与事务边界，再在隔离 PostgreSQL 观察认证是否实际分配 XID及导致快照失配。若确认，仅调整契约允许的只读认证或一致性方案，保留会话失效、当前权限及真正数据变化检测，不简单关闭 revision 校验。

**验收。** 无业务变化且权限有效时连续列表/汇总稳定成功；真实相关数据变化按契约拒绝旧修订或刷新；会话撤销、账号禁用、离职和降权仍拒绝；提供实库 XID/快照观察及正式 HTTP 连线证据后再定级。

证据：`evidence/04-remaining/reproduce.mjs:21–26,71–85`、`reproduce.log`、`ORIGINAL-HANDOFF.txt`。

## 正式入口覆盖与仍未验证的工作

完整入口矩阵保留在 `evidence/05-coverage/COVERAGE-AND-FINDINGS.zh-CN.md`。覆盖指已读相关实现或执行相应合成/协议测试，不表示每个按钮、异常和生产数据组合已验收。

- 销货、调拨：已审保存/审核/撤审、幂等、CAS、行身份、库存守恒、历史原值与部分恢复；缺真实 PG 生命周期、并发、浏览器和线上 SHA 绑定。
- 历史单据查询与原值维护：覆盖普通业务路径；没有执行导入；历史异常身份和快照组合仍未穷尽。
- 库存、流水和来源导航：覆盖读取、未知/零、权限协议及完整输出；缺真实 RLS、浏览器内存、设备打印/分页。
- 商品、规格、条码、目录：覆盖聚合维护、目录/规格扩展、SQL leaf、正式编辑和部分 DOM；图片链只读扫查，缺真实 codec/私有存储和浏览器上传、替换、删除故障验证。
- 营业厅、仓库、支付设置：覆盖服务、关联约束、CAS/幂等协议和未决恢复；缺实库并发停用、绑定与原请求重放。
- 客户、供应商：只有候选合成线索与覆盖归属，尚缺完整正式审查及实库最终授权证据。
- 员工/账号：正式账号深链进入 StaffRuntime；已审关键规则和合并入口无密码改名恢复；缺最后管理员并发锁、改密/账号撤销实库与真实会话失效。
- 基础设置操作记录：补测精确查询、模块权限过滤和稀疏/未知投影；缺全模块审计端到端对应。
- 登录、登出、本人改密、路由切换：局部状态模型、恢复阅读和认证/路由测试，不是完整认证安全审计；缺真实 cookie/TLS 和浏览器导航故障链。
- 打印导出：库存完整 EOF、取消、精确文本 XLSX、预算及合成打印覆盖；单据输出只读检查，缺全部模板、真实下载、打印机及长文案视觉分页。

## 测试记录与不能混算的限制

本次合包没有重新执行业务测试、脚本复现或新增源码修复。以下均为原始日志；合包新增的核验仅为文件完整性、数据检查和基线只读检查。

| 原批次 | 可引用的最终记录 | 不可据此声称 |
| --- | --- | --- |
| 调拨及历史结算 | 10 文件，154/154 通过；evidence/01-transfer-settlement/targeted-tests.log | 实库通过；首次 51 pass 加 2 文件缺 pg 加载失败不另累计 |
| 销货与库存 | 525 项中 524 通过，1 项缺 esbuild 未完成；evidence/02-sales-inventory/expanded-tests.log | 525 全通过；不得把未执行项抹掉 |
| 商品及设置 | 11 文件，179/179 通过；evidence/03-catalog-settings/targeted-tests-verified.log | 中间批次也算独立覆盖；初次缺 pg 与首次 hook 导出问题不算业务 BUG |
| 剩余线索 | 日志记录 287/287，零 fail；evidence/04-remaining/targeted-tests.log | 已知完整执行命令/退出码/依赖及不可变历史来源；这些资料原本缺失 |
| 覆盖补查 | 11 文件 59/59，输出批次 16/16；evidence/05-coverage/additional-tests-final.log、output-tests-final.log | 全输出 DOM 通过；显式排除 first click opens deferred native output |

批次存在重叠，**禁止相加成全仓独立测试总数**。已通过旧测试不否定新复现。初次加载失败日志保留是环境证据，不是新增业务缺陷。

已明确记录的运行时为 Node 24.22.1，项目锁定 24.21.0；没有锁定运行时发布门禁。部分批次通过外部解析 hook 复用既有 pg/fastify/React/Arco/esbuild/jsdom；部分 SQL 协议测试使用构造即抛 `REAL_PG_FORBIDDEN_IN_REVIEW` 的 inert pg。这些都不能证明真实驱动、真实数据库或浏览器通过。

共同未完成：全仓 check:all/typecheck/build、真实 PG 约束/触发器/锁竞争/死锁/COMMIT 中断、真实权限/RLS、全页面交互与导航、设备打印下载、生产影响核量及线上构建绑定。没有真实环境证据时，只能回报对应合成或协议层通过。

## 复现交接方式

1. 先确认主控的 checkout `git rev-parse HEAD` 等于本包完整 SHA，且工作树状态已记录。新修复应单独分支并明确新 SHA，不覆盖基线证据。
2. 对照各报告原命令和脚本，使用获准的隔离环境及其经核验的现有依赖。原脚本含历史绝对路径/相对依赖路径，本包不是开箱即跑环境；不能原样误指向其他 checkout。
3. 缺依赖、Node 不符、脚本写证据文件或需要更换解析路径时，先按当前授权处理。不要为了跑通自行安装、联网访问服务或启动数据库。需要改脚本路径时另存工作副本，保持 evidence 原件不动。
4. 原 `evidence/04-remaining/` 的历史执行命令和环境记录不完整；当前 checkout 核验不补足当时来源证明。继续验证须重新记录准确命令、完整 SHA、环境、退出码及隔离范围。
5. 实库、浏览器及真实权限验收另行授权并单独记证据，不能在本包原日志上追加“通过”来混淆证据层级。

## 文件组织与原始材料保留

- `README.zh-CN.md`：唯一当前主控总览、去重清单、修复与验收方案。
- `evidence/01-transfer-settlement/`：调拨与历史结算原报告、脚本和日志，10 个原文件。
- `evidence/02-sales-inventory/`：销货与库存原报告、脚本和日志，7 个原文件。
- `evidence/03-catalog-settings/`：商品、条码与设置原报告、脚本、构建产物和日志，10 个原文件。
- `evidence/04-remaining/`：剩余候选原脚本及日志，3 个原文件；另附原补充包说明 `ORIGINAL-HANDOFF.txt`，保留证据缺口而不冒充缺失的正式报告。
- `evidence/05-coverage/`：正式入口覆盖矩阵、补查报告、合成输出、脚本和日志，10 个原文件。
- `verification/`：合包校验、原件逐字节哈希清单、基线检查和数据检查说明。
- `SHA256SUMS`：本包文件的 SHA-256 校验表，不含自身；ZIP 内全部文件有路径/CRC 检查并完成解压比对。

原报告字节保持不变，因此其“本轮新增”“本轮 P1/P2”等数字只描述当时单批，不得替代本 README 的统一口径。本包不嵌套旧 ZIP，不要求接收方再拆多个交接包。历史材料只用于溯源，所有当前任务均以上述统一清单为准。
