# 全页面 Demo → actual Application 对照清单

更新：2026-10-21。用户要求：**“你所有的页面都要和demo逐页对比”**。

## 验收口径（不得跳过）

- 基准：冻结 `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`，只读证据包 `/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/`；以 `LOAD_ORDER.md` 的最终覆盖顺序为准，不以早期 `app.js` 模板代替最终页面。
- 本表是**源码/能力盘点 + 浏览器验收待办**，不是已完成全站像素验收。现有 source/DOM/JSDOM/build 测试只证明结构、功能与边界，不能证明 computed style、缩放、滚动或截图相同。
- 视觉状态只有四种：`未核对`、`存在差异`、`修复待复验`、`通过`。**本轮没有任何条目被标为视觉“通过”**；“源码存在”不等于该页在实际 Application 可达。
- 云 Chromium 因本地 socket 权限失败；一次环境 escalation 也失败，未执行实际页面，不再重试/绕过。真实截图验收由已授权的 Mac 浏览器完成。不得为了本清单启动云 PG、读取真实业务数组或补造账号/权限。
- 当前 Application 一级路由枚举只有 `inventory / sales / transfers / customers / suppliers`。原 Demo 中其他页面应记为“缺接入”，不能链接到替代页、空成功页或假造可用按钮。
- `customers/suppliers` 替代原合并 `settings/parties` 是既有明确业务调整；要保留差异记录，不擅自回改为合并实体。
- frozen 包排除了认证入口、业务数据/桥、媒体、构建 bundle；因此无法从该包独立重建完整 Demo 运行时。下表“Demo 布局有源码”与“Demo 运行功能已证实”严格区分。没有实现证据的功能不凭空补。

### 每页的共同验收操作 V

1. 在同一受支持浏览器、相同 `innerWidth × innerHeight`、浏览器缩放 100%、相同 deviceScaleFactor 下打开原 Demo 与新 Application；记录视口，不用整屏尺寸代替 viewport。优先使用原截图视口；另补 1600×1000、1100×900、900×800（原 Demo 支持范围以实机结果为准）。
2. 记录路由、身份角色/只读或可写能力、数据场景（仅合成/已授权脱敏），等待同等终态，截完整视口；候选、模态、抽屉分别截图，不能只拍主页面。
3. 逐项比：品牌/侧栏宽、当前菜单高亮、面包屑、标题字号/行高、工具栏按钮顺序/禁用态、筛选字段/箭头/标签、表头列序/列宽/高度、表格粘性列、边框/背景、备注、汇总/分页、留白/滚动边界。
4. 实际操作：筛选展开/收起、输入/查询/重置、候选搜索/分页/选中、Tab/Shift+Tab/Escape、点击遮罩、关闭后焦点、横滚/纵滚、窗口缩小后浮层重定位。候选不得撑开正文或被 overflow 裁掉。
5. 在合成条件重现等待/空/错误/重试/403/取消/迟到响应；旧身份数据不得残留，未实现动作必须禁用并说明，不能用隐藏测试提示制造“正常”。
6. 对可写页补：取消、重置、返回、重复点击新增、脏草稿切换、准备失败、保存结果不确定、原回执核实、读取当前单据/采用当前单据。验证原保存与授权协议未被 UI 复制替换。
7. 每项“通过”必须填原/新截图路径、视口、操作记录、差异结论、测试人/时间；未填即不通过。

## 一、外壳、认证、路由与权限

| ID | Demo 页面/状态与证据 | actual Application 对应 | 当前视觉状态 / 明确差异 | 必验动作（除 V） |
|---|---|---|---|---|
| SH-01 | 品牌、业务侧栏、一级/子菜单、主区域：`frontend/index.html:9–16`；`styles.css`、`golden-consistency.css` | `src/demo-presentation/demo-frame.tsx`、`frame.css`；`application/demo-frame-presentation.tsx` | **未核对**；已有源码适配，尚无同视口截图证明 | 每个可达一级页都拍；不得只用库存截图代表全部 |
| SH-02 | 调拨列表/新增/单据菜单高亮与面包屑：`transfer-golden.js`、`transfer-current.js` | 列表内部 target 与外壳绑定正在补齐 | **修复待复验**；此前新增菜单禁用且面包屑仍为列表 | 列表→新增→保存→返回；重复点击新增；脏草稿切换 |
| SH-03 | 销货列表/新增/单据菜单高亮与面包屑：`sales-current.js` | `sales/sales-page.tsx` 与外壳绑定正在补齐 | **修复待复验**；同上 | 同 SH-02，含 SALE/RETURN/EXCHANGE |
| SH-04 | 原 `settings/parties` 合并往来单位菜单 | `customers`、`suppliers` 独立路由 | **存在差异**（既有业务调整，不属复制错误） | 两页独立高亮、草稿/列表不串；不得擅自合并 |
| SH-05 | 原右上员工头像/姓名/角色/退出菜单：`topbar-account.jsx` | 正式 `AuthenticationPanel` 位于 workspace 外部，账号/修改密码/退出位于独立 auth-session | **存在差异**；位置、菜单布局不同，尚未修改正式认证 | 正式/合成分开截图；无凭据时不提交 |
| SH-06 | 原登录入口源码被证据包排除：`EXCLUSIONS.md` | `authentication/authentication-panel.tsx` 登录、状态核验、密码对话框 | **未核对**；不能从冻结包声称原登录完全相同 | 只在安全合成环境验 blank/invalid/pending/cancel/expired；不输入真实密码 |
| SH-07 | 合成 harness 无原 Demo 对等页面 | `new-document-browser-harness/synthetic-auth-notice.ts` | **修复待复验**；仅 fixture 禁止真实密码输入/修改，并一键模拟进入；正式认证不变 | 标签持续可见、无真实密码提示；恢复授权可重新进入 |
| SH-08 | 原入口/路由等待、权限/不可见导航 | `application/controller.ts`；host 自备 home/loading/error/cancelled | **未核对**；host 状态不是可自动认定 Demo 对等页 | 配置能力缺失、非授权角色、401/403、CSS失败、route取消、身份清除 |
| SH-09 | 原浏览器历史/离页保护：`product-current.js`/`sales-current.js`/`transfer-current.js` guards | Application 有 canLeave；顶层 URL/history 由可信 host 决定 | **存在差异**；不可把内部页状态当完整 Back/Forward 接入 | 原标签与新标签分别 Back/Forward；不允许丢脏草稿 |

## 二、库存状况表及共用商品只读资料

| ID | Demo 页面/状态与证据 | actual 对应文件/能力 | 当前视觉状态 / 明确差异 | 必验动作（除 V） |
|---|---|---|---|---|
| IN-01 | `#inventory` 主筛选/高级筛选、查询提示、结果工具：`inventory-workbench.js:45,47–59`、`inventory-workbench.css`、`inventory-refinement.css` | `inventory/inventory-page.tsx`、`inventory.css` | **未核对** | 商品/分类/仓库；高级供应商/版型/季节；字段文本不截断 |
| IN-02 | 库存商品候选搜索、预览、分类树、仓库多选：`inventory-select.jsx`、`inventory-category.jsx`、`inventory-filters.jsx` | `components/candidate-selector.tsx`、candidate menu、demo-controls、popup host | **未核对**；有边界/加载策略适配，非全量旧 catalog | 每种候选独立截图；多选/全部/搜索/无结果/分页；预览图片缺失 |
| IN-03 | 颜色×尺码×仓库矩阵/商品分组/小计合计：`inventory-matrix-experiment.js:37,87–88`、`matrix-sections.js` | `inventory/inventory-matrix.tsx`、`display-projection.ts`、`windowing/` | **未核对**；大数据窗口化不是像素等价证明 | 正/零/负库存、多组/异名尺码、折叠、粘性列、滚动；不能用0代未知 |
| IN-04 | 库存显示设置：`gold.js`、`inventory-workbench.js` + 最终覆盖 | `inventory/settings-popup.ts`、`inventory-page.tsx` | **未核对** | 打开/勾选/恢复默认/Escape/遮罩/resize；不被滚动裁切 |
| IN-05 | 查看查询范围/分页：`inventory-workbench.js:51–57` | `components/pagination.tsx`、`inventory-page.tsx` scope dialog | **未核对** | 页大小100/200/500、跳页、边界、执行条件与未提交条件区分 |
| IN-06 | 库存单元格详情/库存流水：`inventory-ledger.css`、`inventory-workbench.js` | 只有显式 `inventory.actions.onOpenCell`；Application 默认不捏造 ledger UI | **存在差异**（视实际 host 能力而定） | 无能力时禁用；有能力才核对真实授权流水页，不能点击空成功 |
| IN-07 | 库存等待/无结果/错误/当前范围：`inventory-workbench.js` | `inventory-page.tsx` 空态、旧结果提示、retry/cancel | **未核对** | 首次未查询、查询中、0结果、失败保留旧结果、取消、身份失效 |
| PD-01 | 商品只读 Drawer 框架：`product-arco.jsx:173–205`、`product-current.js:136,156–165`；右侧 `min(660px,100vw)` 无 footer | `inventory/product-drawer-host.tsx`、`product-drawer-frame.css`、`product-drawer.css` | **未核对** | 库存/调拨来源分别打开；宽度/遮罩/标题/只读标识/关闭焦点 |
| PD-02 | Drawer 基础资料 Tab | `inventory/product-tab-basics.tsx` | **未核对** | 款号/名称/分类/年份/季节/供应商/系统货号；未提供≠空造值 |
| PD-03 | Drawer 规格 Tab：颜色、尺码组、版型三个纵向区块 | `inventory/product-tab-specifications.tsx` | **未核对** | 多颜色/多版型/缺组；不同身份规格不合并 |
| PD-04 | Drawer 图片 Tab、缩略图/大图/错误 | `inventory/product-tab-images.tsx` | **未核对** | 无图、缩略图错、大图错/重试、图片预览 Escape不误关父抽屉 |
| PD-05 | Drawer 加载/页签失败/权限关闭 | `product-tab-state.tsx`、各 leaf/host | **未核对**；原/新错误恢复文案或不同 | rapid switch Tab/关闭/换身份，迟到响应不复活旧商品 |

## 三、调拨交易全页面与浮层

| ID | Demo 页面/状态与证据 | actual 对应 | 当前视觉状态 / 明确差异 | 必验动作（除 V） |
|---|---|---|---|---|
| TR-01 | `#transfer` 列表：`transfer-current.js:listPage`、最终 `transfer-golden.js:enhanceList` | `transfers/transfers-page.tsx`、`transfers.css` | **修复待复验**；本轮修筛选截断/窄屏挤连，其他仍未逐像素核对 | 日期/状态/调出/调入/高级单号、10列顺序、44px行/40px表头、20/50/100/200分页 |
| TR-02 | 列表日期弹层/状态多选/仓库多选/单号建议/更多分类标签 | `transfers/filter-controls.tsx`、`filter-controls.css`；number普通输入、历史分类未提供 | **存在差异**；单号建议/历史分类快照尚未提供，不能猜数据 | 有功能分别核对；缺能力说明不冒充原建议/标签 |
| TR-03 | 列表 empty/loading/error/只读权限 | `transfers-page.tsx`、query controller | **未核对** | 未查询/空/失败旧结果/候选403；无commands时新增禁用 |
| TR-04 | `#transfer/new` 空单：`transfer-golden.js:enhanceEditor`、`transfer-matrix-experiment.js:tableSection`、`golden-consistency.css` | `current-form/transfer-proposal-form.tsx`、新 `transfer-proposal.css` | **修复待复验**；已从裸纵排表单改为紧凑表头+备注+矩阵+汇总 | 同行操作/6列表头；空矩阵；内容高度和大留白；禁用扫码说明 |
| TR-05 | 新单已选商品/尺码矩阵 | 同 TR-04；仅视图按原生sizeGroupId/sizeId分组 | **修复待复验**；不伪造未读取的尺码，保存仍用实际SKU | 同色/版型两尺码；同名不同sizeId；跨尺码组；删除/数量raw校验 |
| TR-06 | 调出/调入仓库、商品/SKU候选：原 `entity-select.js`/`unified-single-select.jsx`/`product-finder.js` | 新单 fixed modal 候选 | **存在差异**；本轮从撑开正文改浮层，但 modal≠原锚定单选/行内找货完全同交互 | 弹窗不挤正文/不裁切；搜索/页码/加载/无结果/重复SKU/选同仓错误；需逐项决定还原 |
| TR-07 | 重置/离页未保存确认：`interaction-common.js`、`confirmation-dialogs.css` | proposal modal + 既有session reset/cancel guard | **修复待复验** | 保留/放弃、Escape、遮罩、焦点、重复新增与切路由不丢数据 |
| TR-08 | `#transfer/<id>` 只读单据，日期仓库单号创建者/备注/矩阵/底汇总 | `transfers/detail-host.tsx`、`detail-content.tsx`、`detail.css` | **未核对** | DRAFT/APPROVED/VOID/CUTOFF_HISTORY；原保存快照与当前名区分 |
| TR-09 | 既有未审核调拨编辑/保存/审核/弃审/作废 | `transfers/commands/form.tsx`、`editable-lines.tsx` | **存在差异**；有命令UI但仅原明细数量/日期/备注，仓库与SKU编辑不开放 | 保存→读当前/采用、冲突/不确定回执；历史不能写；各动作权限 |
| TR-10 | 大稀疏/历史规格、原尺码数量弹层 | `transfers/sparse-lines.tsx`、`matrix.ts`、`saved-records.tsx` | **存在差异**；超预算切实际明细分页是明确适配，不可称原像素一致 | full-size标签页/分页不截断，无历史规格隐式合并 |
| TR-11 | 扫码录入 Drawer/扫码记录：`transfer-scan-drawer.js/.css` | 当前 UI 扫码按钮禁用，未接原生条码读能力 | **存在差异**（缺接入） | 不编造成功扫描；今后逐验扫描/撤销/错误/日志/只读记录 |
| TR-12 | 商品查看：原 shared商品Drawer /只读新页 | `transfers/product-activation.tsx` → shared product Drawer（仅显式capability） | **未核对** | 缺product capability禁用；具备时按 PD-01–05全部核对 |
| TR-13 | 导出/打印预览/操作历史：`transfer-print-template.js`、`transfer-matrix-experiment.js`、`transfer-current.js:showHistory` | 对应按钮仍禁用“尚未接入” | **存在差异**（缺接入） | 不把禁用当已复制功能；未授权不补导出/打印/历史数据 |

## 四、销货、独立退货/换货全页面与浮层

| ID | Demo 页面/状态与证据 | actual 对应 | 当前视觉状态 / 明确差异 | 必验动作（除 V） |
|---|---|---|---|---|
| SA-01 | `#sales` 列表：`sales-current.js:list`、`sales-golden.css`、`sales-refinement.css` | `sales/sales-page.tsx`、`sales.css` | **修复待复验**；本轮修业务类型token二次截断、窄筛选/日期挤连 | 6主筛选/高级单号客户仓库；11列表头；列宽/金额/时间/分页 |
| SA-02 | 日期、状态/业务类型/营业厅/营业员/客户/仓库候选 | `sales/filter-controls.tsx`、`reference-popup-host.ts` | **修复待复验**（截断相关）；其余未核对 | 所有单独弹层、全部/部分选中、长标签、无结果、搜索/懒分页 |
| SA-03 | 列表 loading/empty/error/权限 | `sales-page.tsx`、query controller | **未核对** | 错误保留旧结果、无detail CSS时查看禁用、无commands时新增禁用 |
| SA-04 | `#sales/new` 销售空单：最终 `sales-current.js:editor/entryRow`、`sales-detail-alignment.css` | `current-form/sales-proposal-form.tsx`、新 `sales-proposal.css` | **修复待复验**；已从竖排7列表改紧凑表头/10列/备注/收退/汇总 | 业务类型、日期、厅/客户/营业员/仓库；单号/优惠/应结/收退；列宽与对齐 |
| SA-05 | 销货已选商品、颜色/版型/尺码、数量/折扣/成交价/金额/行操作 | 同 SA-04 | **修复待复验**；10列宽取冻结270/100/122/84/80/95/90/108/99/142 | 数量、单价、赠品、普通零价确认、无零售价不能折扣、raw错误不吞 |
| SA-06 | 独立退货新单 | 同 proposal，businessType RETURN | **修复待复验**；业务协议为独立退货，不补关联原单 | 负数量/退款方向、整单优惠为0、列标题/金额/应结；无原销货联想 |
| SA-07 | 独立换货新单 | 同 proposal，businessType EXCHANGE | **修复待复验**；原 demo 分退回/换出区，当前布局需实机逐项比 | 正负混合、差额收/退/无需收退、方向清楚，勿合并身份 |
| SA-08 | 新单厅/客户/营业员/仓库/商品/SKU候选：原 unified单选/行内找货 | proposal fixed modal | **存在差异**；已不撑开正文，但 modal≠原锚定选择/行内找货完全同交互 | 厅未选禁止下游；换厅清依赖；每种候选的焦点/Escape/页码/无结果 |
| SA-09 | 收退款账户选择：`sales-funds-ui.js:field/open/render`、`index.html` funds editor | proposal付款方式→账户候选 + 本单收退区 | **存在差异**；原资金选择交互/当前多行区不是已证实等同 | method-scoped账户；无推荐不自动选；金额/收退/移除；3行边界 |
| SA-10 | 新单取消/重置/未保存离页确认 | proposal modal、session dirty guard | **修复待复验** | 保留/放弃、脏草稿跨页、重复新增、准备中修改/取消后迟到响应 |
| SA-11 | `#sales/doc/<id>` 只读详情：`sales-current.js:editor/entrySections/summary` | `sales/detail-content.tsx`、`detail-header.tsx`、`detail.css` | **未核对** | SALE/RETURN/EXCHANGE、已审/未审/作废/历史、10列、分区、资金快照 |
| SA-12 | 既有未审核销货编辑/保存/审核/弃审/作废 | `sales/commands/form.tsx`、editor-session | **存在差异**；只改原实际行价格/数量及收退金额，身份/账户换选未接 | dirty、配平、审批权限、history只读；冲突/read-current/adopt |
| SA-13 | 批量选货/规格矩阵/更换行身份：`sales-current.js:pick/matrix/identityRow` | 新单是实际SKU逐项选择；既有单不提供身份更换 | **存在差异**（交互/缺接入） | 不把仅列相同认作原批量/行内换货已复制 |
| SA-14 | 扫码工作台/记录/撤销：`scan-workbench.js`、`sales-current.js:openScan` | 原生条码能力尚未接，按钮禁用 | **存在差异**（缺接入） | 不伪造扫描成功；仅授权完成原生读能力后核对 |
| SA-15 | 销货商品资料/规格查看：原 `openSalesDetail`/PRODUCT_UI | 只读detail的商品查看仍禁用 | **存在差异**（缺接入） | 保持解释，不跳到无关页 |
| SA-16 | 导出/打印/操作历史/更正原因：`sales-current.js:showHistory/reasonModal/exportDoc/printDoc` | 导出/打印/操作历史禁用；有部分原命令确认/恢复UI | **存在差异**（缺接入/恢复UI新增） | 对每个动作分别核对，不能一个保存通过覆盖所有按钮 |
| SA-17 | 缺可信价格/条码/原生准备失败/结果不确定 | 既有new-document/session/command recovery | **未核对**（clean协议新增态，非复制原runtime） | 409缺proof/403/503/保存丢响应；不另建请求、原回执核实；不冒称原Demo等价 |

## 五、商品管理：Demo 有页面源码，但 actual 尚无一级能力

下列不是“Demo 没实现”。冻结 `product-current.js` 明确渲染了这些布局；actual `ApplicationRoute` 与 route configuration 没有对应入口，当前 DemoFrame 显示禁用菜单。不得用库存里的商品只读抽屉冒充完整商品管理。

| ID | Demo 页面/子页与证据 | actual 情况 | 当前视觉状态 | 后续核对范围 |
|---|---|---|---|---|
| PR-01 | `#products` 商品信息列表：`product-current.js:list:80–81` | 缺一级商品列表route | **存在差异**（缺接入） | 商品/分类/年份/季节/高级供应商/版型/厚薄/领裤型，10列/分页/空态 |
| PR-02 | `#product/new` 新增商品、`#product/<id>` 编辑：`:125–134` | 无商品写表单/授权 | **存在差异**（缺接入） | 基础资料、规格、条码、价格、图片、库存六Tab；保存/取消/删除/脏草稿 |
| PR-03 | 商品基础资料/分类/供应商/季节、必填校验跳Tab：`:89–98,136–172` | 仅只读Drawer部分字段 | **存在差异**（缺接入） | 不能把只读Drawer的7字段当完整编辑页 |
| PR-04 | 商品规格颜色/版型编辑、尺码组只读：`:specsBody/mountProductDetails` | 只读Drawer有3区；无编辑 | **存在差异**（缺接入） | 原只读尺码组/季节不能凭空加编辑 |
| PR-05 | 商品条码Tab、当前主/历史兼容/人工补旧码/删除确认：`:barcodeBody/openCompatible/viewBarcodes` | 无对应页 | **存在差异**（缺接入） | 原生身份/条码协议未授权不得复制为假写入 |
| PR-06 | 商品价格Tab：`priceBody` | 无对应页 | **存在差异**（缺接入） | 各价格名/校验/权限，不能从销售参考价反推 |
| PR-07 | 商品图片管理、角色/颜色图/大图：`imageManager/ingestImages` | 仅只读图Tab/大图 | **存在差异**（缺上传/编辑） | 图片顺序/主图/颜色图/上传失败，需明确上传权 |
| PR-08 | 商品库存Tab、所有仓/有库存、历史规格、跳库存并返回：`:120–124,toInventory/restoreInventory` | 无完整商品库存Tab | **存在差异**（缺接入） | 跳转保留查询、历史关联未知明确— |
| PR-09 | `#product-view/<id>` 全页只读商品六Tab：`:253–260` | 仅3Tab Drawer，不同于六Tab全页 | **存在差异**（缺接入） | 不把Drawer截图当本页通过 |
| PR-10 | `#product-categories` 分类树/选中资料/新增一二级/拖排/撤销/删除：`:176–190` | 无对应route | **存在差异**（缺接入） | tree展开/搜索/选中、空选择、同级拖动、脏草稿和删除限制 |
| PR-11 | `#product-settings` 颜色Tab：`:194–204` | 无对应route | **存在差异**（缺接入） | 搜索/新增/编辑/删除/编码/分页 |
| PR-12 | 商品设置版型Tab | 无对应route | **存在差异**（缺接入） | 同颜色；不能将库存FIT筛选当设置页 |
| PR-13 | 商品设置尺码组Tab | 无对应route；原Demo明确只读 | **存在差异**（缺接入） | 组名/包含尺码/分页；**不要造新增编辑** |
| PR-14 | 商品设置季节Tab | 无对应route；原Demo明确只读 | **存在差异**（缺接入） | 季节列表/分页；**不要造新增编辑** |
| PR-15 | `#barcode-schemes` 列表/查看方案modal：`:schemes/openScheme` | 无对应route；原为查看，非改规则 | **存在差异**（缺接入） | 7列/历史当前/规则/总长/适用范围；**不要造方案编辑** |
| PR-16 | 商品模块共用模态：保留草稿/放弃、删除、颜色/版型、条码、图片、暂存草稿返回 | 无对应模块 | **存在差异**（缺接入） | 每个modal独立同视口+键盘+遮罩截图，按原功能证据补而非猜 |

## 六、基础设置

| ID | Demo 页面/子页与证据 | actual 对应 | 当前视觉状态 / 明确差异 | 必验动作（除 V） |
|---|---|---|---|---|
| BS-01 | `#settings/stores` 营业厅Tab：`basic-settings-v2.jsx:19–26,49–67,146–196` | 无营业厅维护route；DemoFrame禁用 | **存在差异**（缺接入） | 名称/默认零售客户/默认出库仓/状态/操作；筛选/分页 |
| BS-02 | 同页仓库Tab | 无仓库维护route，只有交易候选 | **存在差异**（缺接入） | 仓库名/所属厅/状态；stock限制；候选≠维护页 |
| BS-03 | 营业厅新增/编辑modal | 无对应写页 | **存在差异**（缺接入） | 默认客户/仓、状态、保存验证；不得捏造当前值 |
| BS-04 | 仓库新增/编辑modal | 无对应写页 | **存在差异**（缺接入） | 名称/所属厅/状态；保留历史引用 |
| BS-05 | `#settings/parties` 往来单位列表/客户供应商标签 | `parties/party-route.tsx` 独立客户与供应商 | **存在差异**（既有业务调整）；两页视觉均**未核对** | 独立列表搜索/状态、编码、状态/操作、20/50/100分页；原标签列差异留证 |
| BS-06 | 新增/编辑往来单位modal：名称/标签/编码/状态 | `parties/party-form.tsx` 独立客户modal | **存在差异**（去合并标签）；视觉**未核对** | 新增/编辑/停用/恢复、编码只读、520px modal、脏关闭 |
| BS-07 | 同 BS-06 供应商 | 同表单独立SUPPLIER身份 | **存在差异**（同上）；视觉**未核对** | 不与客户串状态/草稿，两个modal分别截 |
| BS-08 | 往来单位保存失败/状态/操作记录 | Party冲突/原回执/重新准备/恢复UI；无原操作记录drawer | **存在差异**；恢复UI是clean协议新增 | 不确定/停止等待不等于失败；查询回执/精确重放；记录缺接入 |
| BS-09 | `#settings/staff` 员工账号列表 | 无员工维护route | **存在差异**（缺接入） | 姓名/账号/角色/厅/员工状态/登录权限/操作；5筛选 |
| BS-10 | 员工新增/编辑、同步账号/初始或重置密码/登录开关 | 无员工维护UI；正式自改密码不等价 | **存在差异**（缺接入） | 需明确账号管理授权；不得复制默认账号/密码或补假权限 |
| BS-11 | 员工离职/恢复在职确认/受阻状态：`:changeEmployment` | 无对应页 | **存在差异**（缺接入） | 恢复在职仍保留登录关闭，历史保留；不能用状态切换猜业务 |
| BS-12 | `#settings/payments` 收款方式Tab | 无收款配置route，只有交易付款候选 | **存在差异**（缺接入） | 搜索/状态/新增编辑/停用/分页 |
| BS-13 | 同页资金账户Tab | 无资金账户维护route，只有交易method-scoped候选 | **存在差异**（缺接入） | 账户名/所属方式/状态/操作；不读取真实账号数据作布局样本 |
| BS-14 | 收款方式/资金账户新增编辑modal | 无对应维护UI | **存在差异**（缺接入） | 原编辑账户所属方式只读，新增必选；不得放开权限 |
| BS-15 | 基础设置操作记录Drawer：`basic-settings-v2.jsx:LogDrawer` | 无对应Drawer | **存在差异**（缺接入） | 各类别筛选/空/错误/关闭，需真实授权读取，不造记录 |

## 七、通用状态矩阵（每个可达页面都补，不是单一“错误页”）

| 状态 ID | 页面集合 | 当前状态 | 证据要求 |
|---|---|---|---|
| ST-01 | IN/TR/SA/BS已接入列表 | **未核对** | 未查询、首次loading、成功含行、成功0行、查询错误无旧结果、错误保留旧结果、取消、retry |
| ST-02 | 所有候选/筛选弹层 | **未核对**（本轮交易相关修复待复验） | 初次读/搜索读/0结果/error/retry/加载更多/到顶上限、全部/单选/多选/长标签、重开清理 |
| ST-03 | 商品Drawer各Tab/大图，交易单据detail | **未核对** | action CSS/code等待/失败、数据等待/失败、权限关闭、无图片/未提供字段、关闭后焦点 |
| ST-04 | 新单/既有编辑 | **未核对**（新单布局修复待复验） | clean/dirty、raw输入错、当前准备、准备失败、取消与迟到响应、save pending/rejected/uncertain/committed |
| ST-05 | 每类可写操作 | **未核对** | 角色/状态禁止、缺事实、历史只读、配平限制、读取当前/采用当前、dirty guard；保持服务端授权 |
| ST-06 | 每个模块共享外壳 | **未核对** | 页内关闭、跨页、退出/403清身份；各页菜单/面包屑同步，不留上一页内容 |
| ST-07 | 全站viewport/缩放 | **未核对** | 原视口、1600/1100/900（适用时）、100%缩放；控件不纵向散落、表头不折成竖字、浮层不溢视口、滚动边界正确 |

## 八、逐页验收结果填写模板

复制一份用于每个上述 ID / 每个业务变体，不把多页合并成一次“测试通过”。

```text
页面 ID / 名称：
原 Demo commit / route / 状态：b8bcfe3 / … / …
新 actual source revision / route / 状态：
身份/显式capability（仅说明，无密码/token）：
视口 / deviceScaleFactor / 浏览器缩放：
数据场景（合成/已授权脱敏）：
原截图路径：
新截图路径：
操作记录（具体点击、输入、键盘、滚动、resize）：
computed geometry（grid/flex、列数、关键rect、overflow与dialog rect）：
差异：表头 / 表格 / 工具栏 / 弹窗 / 导航 / 间距 / 空态 / 权限：
功能检查证据（DOM/真实浏览器分别列，不混写）：
结果：未核对 / 存在差异 / 修复待复验 / 通过
仍缺能力或阻塞：
核对人 / UTC时间：
```

## 当前收口与开放项

- 正在修复的交易实际组件：TR-04/05/07、SA-04/05/06/07/10；以及列表筛选截断 TR-01、SA-01/02、交易导航 SH-02/03。**均需 Mac 实机原/新同视口复验后才能改为通过。**
- 库存、商品Drawer、独立客户/供应商虽有源码适配及大量DOM边界测试，**不能当作本轮逐页视觉核对完成**。
- 商品管理完整六Tab/分类/设置/条码方案，营业厅仓库、员工账号、收款配置、操作记录等：冻结 Demo 有布局代码，actual Application 缺接入；不能标“Demo本身无实现”。
- 原 Demo 明确只读的尺码组、季节、条码方案查看，不能为了追求“所有按钮可点”虚构写功能；认证源码/真实数据/历史运行bundle缺证据的部分要保留未知，而不是猜。
- 原生协议新增的回执/冲突/身份清除状态应单独验可用性与安全，不要求伪装成旧 runtime；保留必要警示不等于“简陋测试页”可以不还原正常业务布局。
- 没有任何一条通过“一个 demo-restoration 脚本名”整体覆盖；只有逐页记录、成对截图、实际操作和差异闭环可以完成用户要求。

## 九、下一阶段安全分工短表（仅代码能力盘点，不是部署可用性证明）

审计：2026-10-21；只读 `apps/api/src`、`packages/application/src`、`adapters/postgres/src` 与现有 web 组件，**没有连接数据库、发 API 请求或启用任何能力**。“已有码”表示 DTO/service/HTTP adapter/reader 在当前树中存在，不表示目标环境已注册、授权、迁移完成或实机验证；后者均待独立确认。并行中的 `native-*-import` 是导入/来源证明通道，不是用户日常维护 API，不能让网页直接调用或把导入成功等同 CRUD 已实现。

| 模块 / 对照 ID | 可复用 actual UI（不混淆页面层级） | 真实 API 代码已有 / 缺失（静态结论） | 建议安全独立文件边界与前置闭环 |
|---|---|---|---|
| 商品一级列表 PR-01 | `inventory/product-drawer-host.tsx` 可作为“查看”动作；`components/candidate-selector.tsx`、`demo-controls`、分页/表格tokens可复用；**没有一级商品列表组件** | 已有 `POST /current-form/products/query` 仅交易候选（code/name/零售价、hall/业务context）和 `/inventory/candidates/query`；**不是** Demo 商品管理的10列/全部筛选列表。未发现独立商品管理列表/分类年份季节供应商等管理筛选 HTTP 合约 | UI lane 新目录 `src/products/`，独立 `application/routes/products.tsx`、route CSS/tests；API lane 单独 product-management query ports/service/HTTP/reader。先定授权、分页及完整10列事实，再接 actual route；不要把候选数据补空字段做假列表 |
| 商品六Tab新增/编辑/全页只读 PR-02–09 | 现有 Drawer 只有基础/规格/图片 **3个只读Tab**：`inventory/product-tab-{basics,specifications,images}.tsx`，可复用只读块与media状态，不等价6Tab编辑页；可复用source字段布局，不复制旧全局runtime | 已有目标只读 `POST /products/{basics,specifications,images,image}/query`、`PostgresProductQueryReader`；零售价可读，不代表九价完整。**未发现商品CREATE/EDIT/DELETE/价格/图片上传维护HTTP**。图片仅受控媒体port；未注入实际delivery provider时明确501，不能造public URL | 新 `src/products/editor/`、`src/products/read-only-page.tsx` 与单独样式/tests；后端单独维护contract/版本与幂等/授权，媒体存储另开owner。不要改 shared Drawer 来假装新增页；先提供缺失条码/价格/库存Tab读协议，再接完整页面 |
| 商品分类 PR-10 | 库存分类树选择器/branch model可复用交互基础，**没有分类管理树+详情编辑页** | 分类仅在库存/候选/商品基础读与导入字典中出现；未发现分类管理列表/CREATE/EDIT/DELETE/拖排/撤销HTTP | 独立 `src/product-categories/` + `application/routes/product-categories.tsx`；独立API/读写ports。先明确一二级结构、引用删除限制、版本和排序协议，不能把选择器的onSelect当管理保存 |
| 商品颜色/版型设置 PR-11/12 | `demo-controls`/Arco字段、Party modal密度可借用；现有商品规格Tab只读名称；无颜色/版型维护列表 | 可从单商品specifications/实际SKU候选读到目标相关颜色/版型；**不是全量字典管理授权**。未发现颜色/版型维护HTTP；`native-catalogue-import` WIP不等价日常维护 | 独立 `src/product-settings/colors/`、`fits/`（可共用本目录list/form壳），各自API和tests；不要碰交易表单/导入owner文件；先明确名称/编码唯一性和删除引用规则 |
| 尺码组/季节只读 PR-13/14 | 商品Drawer specs区可复用单商品组名；通用表格/分页可复用；无独立字典列表页 | 单商品规格可读sizes/sizeGroup；单商品基础可读seasonLabel；未发现独立全部尺码组含成员/季节列表HTTP。原Demo明确只读，**不需要也不应发明写API** | `src/product-settings/size-groups/`、`seasons/` 独立只读页/reader/tests；API先补有授权分页字典读。页面必须实际读成功/空/失败三态，不用冻结数组假造当前字典 |
| 条码方案/商品条码 PR-05/15 | 可复用只读字段、table/modal骨架；现有Drawer没有条码Tab或方案页 | `CurrentFormSku.barcodeAvailability` 明确 UNAVAILABLE；保存准备可有独立可信条码事实，不代表提供了浏览/维护API。未发现方案列表/查看、SKU主/历史兼容条码浏览或人工补旧码HTTP。`native-barcode-import`不等价维护端点 | 只读方案与商品条码Tab分开 `src/barcode-schemes/`、`src/products/tabs/barcodes/`；先厘清有权读的来源事实和历史不可重算规则。原方案是查看，不添加方案编辑；人工补码/删码需单独原生维护合约与授权 |
| 营业厅/仓库 BS-01–04 | 可复用Party页面的Arco工具栏/表格/520px modal密度，以及single select；现有 `TransferWarehouseSelect` 和current-form厅/仓候选仅交易用途，**不是维护页** | 已有码 `/current-form/sales-references/query`（hall/warehouse等）、`/current-form/transfer-warehouses/query`、`/transfers/warehouses/query` 历史筛选；未发现营业厅/仓库日常CREATE/EDIT/停用维护HTTP。底层native导入/表存在不证明维护API | 独立 `src/settings/stores/`、`warehouses/` 与own route/config/CSS/tests；后端按厅/仓维护独立ports。前置默认零售客户/默认出库仓事实与权限、停用库存/引用限制；不复用交易候选结果冒充可编辑全量记录 |
| 员工与账号 BS-09–11 | 正式 `AuthenticationPanel` 仅登录/本人改密码/退出，**不是管理员工列表/创建账号**；Party modal可复用布局，但不能复用其授权 | 已有 `/auth/login`、`GET /auth/session`、`/auth/logout`、`/auth/password`，只维护当前认证用户会话/本人密码；current-form salesperson候选只读。未发现员工列表/新增编辑、开关登录、重置他人密码、离职/恢复HTTP | 敏感独立lane `src/settings/staff/`、独立account-admin API/ports/policy/tests；先明确角色/厅范围、账号唯一性、凭据交接与session失效。不得用自改密码端点代替重置他人，不复制旧账号初值，合成harness无密码不代表正式功能删除 |
| 收款方式/资金账户 BS-12–14 | 新销货的method→account候选/收退显示和Party密度可复用；**没有收款配置一级页/Tab/维护表单** | 已有 `/current-form/sales-references/query` 的paymentMethod/paymentAccount **按hall/method限定当前交易候选**，sales detail存历史收退快照；未发现付款方式/资金账户列表/CREATE/EDIT/停用管理HTTP；无余额/对账API | 独立 `src/settings/payments/`、`fund-accounts/`，各自API/reader/form/tests。明确账户所属方式编辑只读、业务授权与引用停用规则；交易账户候选不能升级为全账户枚举，更不补造余额 |
| 操作历史/设置记录 BS-15/TR-13/SA-16 | 有交易/Party recovery notice及receipt UI，但**receipt不是用户操作历史列表**；现有导出/打印/历史按钮多为禁用，不能假启用 | 交易 `/sales/receipts/:requestKey`、`/transfers/receipts/:requestKey`、Party `/customers|suppliers/receipts/:requestKey` 是精确原请求回执；未发现通用审计历史/按对象分页操作记录HTTP。数据库或命令结果存在operationId不证明可列历史 | 独立 `src/audit-history/`（只读Drawer/分页/对象context）+审计query ports/service/HTTP；先确定可见字段、脱敏、对象范围与分页。保持原回执核实安全语义，不拿receipt列表伪装历史；导出/打印另需授权scope |

**建议交接顺序：**先完成当前交易修复与 Mac 逐页复验；下一批可以并行做“商品只读管理查询contract + 一级列表”和“基础设置读能力盘点”，但只有显式授权/真实API闭环后才挂 actual 菜单。共享 `ApplicationRoute/configuration`、`DemoFrame` 与共用tokens应单一owner合并，其他lane只写各自模块/CSS/tests；并行导入、migration、package.json、真实数据及当前交易表单保持各原owner。缺API的页面可准备source-faithful组件与受控fixture测试，**不得以fixture/静态数据上线冒充真实已实现页**。
