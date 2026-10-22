# Arco 真实复用与实现分歧审查（源码事实，不是外观 PASS）

审查时间：2026-10-21 UTC。范围：当前工作树 `apps/web/src`，仅静态只读审查；**没有启动浏览器、PG、HTTP listener，没有网络请求、真实账号或真实业务数组**。本轮只新增本文件，未修改 backend/core、正式组件或 harness 入口。

## 结论先行

- `package.json:48` 与 `package-lock.json` 的直接依赖、安装包节点均锁定 **`@arco-design/web-react 2.66.16`**。不是通过给原生 DOM 加 `arco-*` class 就算使用了 Arco。
- 当前是**真实 Arco leaf / 延迟壳 / 原生与自绘结构混合**，不是“所有页面都由 Arco 组件组成”。混合本身不能直接判不合格：冻结 Demo 的列表/矩阵也有原生结构，必须逐控件核对最终加载层。
- 已确认的真实 Arco：共享商品候选 `Select/Tag`；共享多选 `TreeSelect/Tree`；共享每页数 `Select`；往来单位列表/编辑 `Input/Button/Table/Tag/Empty/Modal/Switch/Select`；调拨列表日期、两类既有单据日期 `DatePicker`。
- 应优先核对的明确分歧：**商品 Drawer/Tabs、分类管理 Tree、目录查看 Modal 目前是原生/自绘**；冻结 `product-arco.jsx` 确实存在对应 Arco 实现。新单两种日期是原生 `input[type=date]`，与既有单日期不同；销货列表日期也是原生，不能误报成 Arco DatePicker。
- **所有条目均未获真实浏览器视觉/交互通过。** 真实 import、源码测试、JSDOM 中存在 `.arco-*`，均不能替代同视口 screenshot/computed geometry、键盘/焦点/滚动/原生 dialog 行为核验。

## 1. 路由及组件树：逐页到真实实现

实际一级路由枚举以 `application/contracts.ts:13` 为准：inventory、sales、transfers、customers、suppliers、products、product-categories、product-settings、barcode-schemes。`application/controller.ts:49–56` 按显式 capability 懒加载对应入口；源码存在不代表部署已授权或已启用。

下表路径均相对 `apps/web/src/`；“原生”指 JSX 内 `<button/input/select/table/dialog>` 或自绘 `div/section`，不是 Arco 运行时组件。

| 页面 / 入口链 | 真正 Arco 路径 | 原生 / 自绘与待核点 |
|---|---|---|
| 库存 `application/routes/inventory.tsx` → `inventory/inventory-route.tsx` → `InventoryPageView` | `CandidateSelector` → 商品 `ProductCandidateAction` 的 `ArcoSelect/ArcoTag`；其余维度 `DemoMultiSelect` → `DemoMultiSelectAction` 的 `ArcoTreeSelect/ArcoTree`。分页经 `InventoryPagination` → `InventoryPageSizeSelect` → `DemoPageSizeSelect` → `DemoSingleSelectAction` 的 `ArcoSelect`。 | `inventory/inventory-page.tsx` 工具栏按钮、查询范围原生 dialog、设置 checkbox；`inventory/inventory-matrix.tsx` 自有 table、折叠、库存按钮及 eager/windowed 两路径；`EmptyIcon` 是静态 SVG，不是 Arco Empty。不能因为矩阵未用 Arco Table 就判错。 |
| 销货列表 `application/routes/sales.tsx` → `sales/sales-route.tsx` → `SalesPageView` | `SalesStatusSelect/SalesBusinessTypeSelect/SalesReferenceMultiSelect` → `DemoMultiSelect` 的激活 leaf；`SalesPagination` → `DemoPageSizeSelect`。 | `sales/sales-page.tsx:79–80` **原生日期 input**；列表 table、单号、按钮、空/错态为原生。静态 route 图刻意不 eager 引 Arco，见 `sales/tests/run-frozen-source-check.mjs`、`application/tests/run-build-check.mjs`。不能把“首次未加载 Arco”与“激活后没用 Arco”混为一谈。 |
| 调拨列表 `application/routes/transfers.tsx` → `transfers/transfers-route.tsx` → `TransferPageView` | `transfers/filter-controls.tsx:1,13–29` 直接 `DatePicker`，`TransferStatusSelect/TransferWarehouseSelect` **直接**使用 `DemoMultiSelectAction`；分页用 `DemoPageSizeSelect`。 | 与库存/销货不同，没经过 `DemoMultiSelect` 延迟壳；列表 table/按钮/空错态仍原生。`TransferDate` 的 popup container 有 `document.body` fallback。 |
| 客户、供应商 `application/routes/parties.tsx` → `CustomerPageHost/SupplierPageHost` → 同一 `PartyPage` | `parties/party-route.tsx:1–4,66–76` 真实 `Input/Button/Table/Tag/Empty/IconSearch`；状态与分页的 `PartySingleSelect` 真实 `Select`；`PartyForm` 真实 `Modal/Input/Button/Switch`。 | `PartyPagination` 页码/跳页仍原生；`PartyFormLeaf` 加载中 fallback 是 `section role=dialog`，虽有 `arco-modal` class 却还不是 Arco Modal。关闭确认、回执恢复是业务层状态，不是 Arco 自动保证。 |
| 商品列表 `application/routes/products.tsx` → `products/products-route.tsx` → `ProductsPageView` | 商品维度复用 `CandidateSelector` 的商品 Arco leaf（数据源为独立商品管理 reader）；另外 7 维复用 `ProductFilterControl` → `DemoMultiSelect`；分页复用 `InventoryPagination` 的真实 Select leaf。 | `products/products-page.tsx` 的 10 列 table、标题、按钮、状态为原生；新增禁用、查看能力显式配置。没有因为复用选择控件就复用交易候选 API，也没有把“查看”说成编辑。 |
| 商品分类 `application/routes/product-categories.tsx` → `ProductCategoriesPage` → `CatalogueCategoryTree` | 本页树、详情没有 Arco 运行时 import。 | `product-categories/category-tree.tsx:5–28` 自绘 `role=tree/treeitem`、搜索 input、展开 button、键盘遍历；详情原生 readonly input。CSS 注释引用 frozen Tree 样式，不等于实际 Arco Tree。冻结原版 `product-arco.jsx:210–223` 有 Arco Tree；**复用差异待决**，不能仅按外观认定等价。 |
| 商品设置：颜色、版型 `application/routes/product-settings.tsx` → `ReadOnlyProductSettingsHost` → 懒加载 `ColorsPage/FitsPage` → 共用 `CatalogueEntryPage` | 仅分页经 `CataloguePagination` → `DemoPageSizeSelect` 的 Arco Select。 | `product-settings/colors/entry-page.tsx` 搜索、四 Tab、table、按钮均原生；`CatalogueEntryView` 是原生 `<dialog class=pc-arco-modal>` + readonly input，**不是 Arco Modal/Input**。颜色/版型共用一实现，非两套表格。 |
| 商品设置：尺码组、季节 同 host → `SizeGroupsPage/SeasonsPage` → 共用 `ReadOnlySettingPage` | 仅 `DictionaryPagination` → `DemoPageSizeSelect`。 | `product-settings/size-groups/setting-page.tsx` 搜索、四 Tab、table、状态原生；尺码组成员为文本事实，不提供虚构编辑。尺码组/季节共用一实现，且与颜色/版型另有一套近似壳。 |
| 条码方案 `application/routes/barcode-schemes.tsx` → `BarcodeSchemesPage` → `BarcodeSchemeView` | 列表分页复用 `DictionaryPagination` → Arco Select。 | `barcode-schemes/barcode-schemes-page.tsx` 7 列原生 table；`barcode-scheme-view.tsx:17` 原生 dialog（有 `pc-arco-modal` class），原生详情/按钮。方案查看单独真实 query；未冒充条码编辑或重新生成。 |

共享外壳/认证也不应漏记：`demo-presentation/demo-frame.tsx` 的侧栏、details/summary子导航、按钮/anchor、面包屑为原生React JSX，无Arco Menu/Layout import；`authentication/authentication-panel.tsx` 的 `LoginForm`、`AuthenticationPanel`、`:85` 的 `PasswordDialog` 均为原生input/button/dialog。冻结包排除了认证入口，不能凭空判其“原版必须用Arco”；正式凭据流也不能拿合成免密码入口的外观结论代替。

### 单据、新单与商品 Drawer

| 子页 / 组件 | Arco / 非 Arco事实 | 必须单独核对 |
|---|---|---|
| 调拨新单 `current-form/transfer-proposal-form.tsx` 的 `TransferProposalForm` | 无 Arco import；`:71` 原生 date；`TransferDialog` 为固定 overlay + section，候选列表 button、矩阵 table、数量 input 原生。 | 与原锚定仓库选择/行内找货不同；modal 不能因尺寸相似就算同交互。准备取消/草稿丢弃/原生SKU身份不能被 UI 替换破坏。 |
| 销售/退货/换货新单 `current-form/sales-proposal-form.tsx` 的 `SalesProposalForm` | 无 Arco import；`:71` 原生 date；厅/客户/仓/商品/资金选择用自有 overlay；native select/input/checkbox、10列表格。 | SALE/RETURN/EXCHANGE 分别验；与既有 `SalesCommandForm` 的 DatePicker、与共享候选 leaf 均非同一组件。 |
| 既有调拨编辑 `transfers/commands/form.tsx` → `TransferCommandForm` | 真实 `DatePicker`；明细 `TransferEditableLines`、按钮、确认、回执与恢复内容主要原生。 | 不能因用了 Arco 日期就把整个表单称为 Arco；读当前/采用、脏草稿、未知写结果与角色禁写逐项核对。 |
| 既有销货编辑 `sales/commands/form.tsx` → `SalesCommandForm` | 真实 `DatePicker`（`:1,58`）；收退方向、计价方式原生 `<select>`；金额/数量/赠品/表格原生。 | 审核/弃审、精确配平、赠品/零价确认、原回执恢复不是组件库负责；与新单状态/控件不相同。 |
| 销货/调拨只读单据 `sales/detail-host.tsx`、`transfers/detail-host.tsx` → `*DetailContent` | action CSS/code 先就绪；详情 table/矩阵/状态/返回原生。调拨可激活共享商品 Drawer，销货详情不可假设同能力存在。 | CSS失败/重试/取消/迟到与大稀疏明细单独验；不是 Arco Modal。 |
| 共用商品 Drawer `inventory/product-drawer-host.tsx:27,68` → `ProductDrawerContent` → 3个 `ProductTab` | **原生 dialog 模拟右侧抽屉**，3 Tab 为 button role=tab；图片 preview 也是原生 dialog（`product-tab-images.tsx:61`），没有 Arco Drawer/Tabs/Image。 | 消费者为库存、products、`transfers/product-activation.tsx`；冻结原版 `product-arco.jsx:184–196` 明确 Arco Drawer/Tabs，当前复用边界是代码架构，不是等价证明。嵌套图预览 Escape、焦点、遮罩、top-layer、scroll lock 待实机。 |

## 2. 真正共享的控件、消费者与激活边界

1. **商品候选**：`components/candidate-selector.tsx` 按 kind 分流；商品分支初态是 native combobox + `IdleSelectionTokens`，激活后动态加载 `components/product-candidate-action.tsx:2–5` 的 `ArcoSelect/ArcoTag`。消费者：`inventory/inventory-page.tsx:94`、`products/products-page.tsx:67`。`ProductCandidatePreview` 读基础/规格/缩略图，不应误认成完整 Drawer。
2. **多选**：`demo-controls/multi-select.tsx` 是身份/互斥 popup/CSS-ready/取消/迟到保护壳；`multi-select-action.tsx:2–5,103–132` 才是 `TreeSelect/Tree`。消费者：库存非商品候选、销货状态/业务类型/远程候选、商品列表 7 维。调拨直接调用 action，是不同装配路径，需双路径验收。
3. **单选每页数**：`demo-controls/page-size-select.tsx` → `single-select-contract.ts:loadDemoSingleSelectAction` → `single-select-action.tsx:2,38`；壳初态 button，focus/action 后真 Select。消费者：`components/inventory-page-size.tsx`（库存+商品）、`sales/sales-pagination.tsx`、`transfers/pagination.tsx`、`product-settings/colors/pagination.tsx`、`product-settings/size-groups/pagination.tsx`（尺码组/季节/条码）、`settings/stores/pagination.tsx`（源码组件，当前不在上述一级枚举）。
4. **往来单位单选另一路**：`parties/party-single-select.tsx` 直接 barrel import Select，不使用 DemoPageSizeSelect；消费者 `PartyPage` 状态、`PartyPagination`。popup、lazy CSS 生命周期与共享壳不同。
5. **身份与请求基础设施**：上述组件广泛复用 `loading/ReadScope`、`LatestQuery`、`AsyncLeafRegistry`，这是状态基础设施复用，**不是 Arco 复用**。真实授权/校验仍在各 reader/controller；不能以 Arco 的选中态替代业务事实。
6. **未证明的消费者要标明**：`parties/party-candidate-selector.tsx` 有独立原生 trigger/懒加载 popup，但本轮非测试业务源码搜索未发现其外部实际消费者；不把它计入“各页面已统一候选”。

## 3. 重复实现与状态验证差异（不擅自合并）

| 差异 | 事实位置 | 风险 / 待办，而非当前故障宣判 |
|---|---|---|
| 页码/跳页外壳多份 | `components/pagination.tsx`、`sales/sales-pagination.tsx`、`transfers/pagination.tsx`、`parties/party-pagination.tsx`、目录两个 `pagination.tsx` | 每页 Select 很多已共用，但“Arco Pagination 全站统一”不成立。目录两份外壳近似（20/50/100、超页返回第一页），库存100/200/500、交易20/50/100/200不同；不能为减重复丢业务分页语义。统一验边界页、换size、Enter跳页、旧结果及禁用态。 |
| 单选三种装配 | `DemoSingleSelectAction`、`PartySingleSelect`、`StoreSettingsSingleSelect` | 共享leaf严格scope/显式打开/样式租约；party无同类activation壳且有body fallback；store自管open/search/footer。不要只验其中一种宣称所有Select通过。 |
| 候选窗口与选择上限不同 | `components/inventory-candidates.ts`、`sales/reference-candidates.ts`、`transfers/warehouse-candidates.ts`、`products/candidate-window.ts`；各 filter-control | UI相似不代表已加载集合完整。商品 `ProductFilterControl` 选中上限100，sales远程筛选上限1000；各菜单有不同readiness/技术加载界限。保留 completeUniverse、全部范围不可凭当前页反选的提示，不能泛化“全选已完成”。 |
| 查询owner两套近似 | `product-settings/colors/read-owner.tsx:16` 的 `useCatalogueReadOwner`；`size-groups/read-owner.tsx` 的 `useDictionaryOwner` | 都新建child scope、当前403/401清事实；dictionary另暴露 `invalidateAccess` 供方案详情拒权清父页。不要只测一个owner就覆盖四Tab/条码。 |
| 设置列表壳两套 | `CatalogueEntryPage`（颜色/版型）、`ReadOnlySettingPage`（尺码组/季节） | 搜索180ms debounce/Enter、防重复、旧结果标识近似；颜色/版型另有target snapshot查看；两类query校验器与权限不同，按四Tab分别验。 |
| Modal/dialog/focus多套 | Arco `PartyForm`；`CatalogueEntryView`、`BarcodeSchemeView`、`ProductDrawerHost/ImagePreview` native dialog；current-form两个自绘overlay | 焦点陷阱、遮罩、Escape、原生inert/top-layer、dialog close后焦点不是同一实现。`components/use-dialog-focus-return.ts` 的hook/helper已被products/条码/Drawer等使用，但颜色/版型 `entry-page.tsx` 仍有本地trigger.focus；必须实机验证，不把JSDOM focus当native close证明。 |
| 日期不一致 | sales列表、新单两类 native date；调拨列表、两类既有单 Arco DatePicker | 输入raw、清空、不合法日期、键盘与弹层样式均可能不同。先按冻结最终挂载事实+实际交互确认该保留还是替换，不能批量一刀切。 |

## 4. CSS 隔离与“访问顺序改变外观”的风险

**已确认事实，不是猜测：**

- `application/styles/parties.css:1`、`application/styles/transfers.css:1` 引入整份 `dist/css/arco.css`；`parties/party-route.tsx:4`、`transfers/transfers-route.tsx:2` 也有CSS import。build采用 `application/build-application.mjs` 显式leaf CSS图覆盖 eager aggregate CSS；是否最终只装入一次必须看实际产物和 document link/style，不能仅数源码import就称重复执行。
- 安装版全量 CSS 确有全局规则：`node_modules/@arco-design/web-react/dist/css/arco.css:597–620` 作用 html/body字体、行高、margin/padding；`:739–749` 作用 button/input/select/textarea行高；`:907` 为 `* { outline:none; }`。因此跨页focus-visible与字体不是“天然无影响”。
- `application/stylesheet.ts` 每provider首次load插入link、重复load复用promise；`ApplicationController.dispose()` 才统一dispose所配置styles。普通路由切换没有逐次移除各provider的代码。故必须验证 **先原生页→party/transfer→返回原生页** 的加载顺序效应；不能只测冷启动单页。
- shared action CSS `demo-controls/{single,multi}-select.css`、`components/product-candidate-action.css` 只import所需leaf，不引整份library reset；各自 `*-styles.ts` 有owner租约/失败移除/dispose。自有覆盖以 `.demo-single-select`、`.demo-multi-select`、`.inventory-product-select` 收窄；Arco上游leaf CSS本身仍是 `.arco-*` 类规则，不是ShadowRoot隔离。
- 冻结 Demo 的不少控件在ShadowRoot内，而新共享leaf在本地DOM host，`getPopupContainer` 多数返回本host。`DemoMultiSelectAction`、`ProductCandidateAction` 不允许无host逃到body；`TransferDate/PartySingleSelect` 与既有单DatePicker仍有 `document.body` fallback。Portal位置、祖先overflow及继承变量要实测。
- `products/products.css:1` 引入 `inventory/inventory.css`；product-settings的两套CSS也会同时进入route CSS。自有样式大多以 `.pm-products/.catalogue-workbench/.dictionary-workbench/.catalogue-entry-modal/.dictionary-scheme-modal` 等前缀限定，**本轮未据此证明毫无级联冲突**。
- `authentication/authentication.css:1–17` 已说明并收窄auth控件/focus/alert选择器；仍有 `.auth-panel *` 的box-sizing。`authentication/tests/run-style-isolation-tests.mjs` 是隔离测试源码，不等于本轮真实浏览器已复验。

**统一浏览器必须记录：**每次导航后的link/style顺序；只读页冷/热两次computed font、line-height、outline、button/input rect；弹层host/rect与overflow；resize/缩放后定位；禁用态、键盘focus-visible；关闭后新路由焦点不被旧dialog抢回。

## 5. 哪些“应该用 Arco 却没用”：只能列待核，不能擅判

| 优先级 | 可核实原版事实 | 当前事实 | 统一验收所需决策/证据 |
|---|---|---|---|
| 高 | 冻结 `product-arco.jsx:184–196` 为 Arco Drawer/Tabs，图片用其产品照片组件 | `ProductDrawerHost/ProductDrawerContent/ImagePreview` 原生/自绘 | 先判用户是否要求组件级复用本身；若要求同技术链，此项不能外观PASS代替。若允许适配，仍要逐项证明焦点/top-layer/键盘/尺寸/遮罩/滚动等价，并明确差异。 |
| 高 | 冻结 `product-arco.jsx:210–223` 为 Arco Tree，含拖拽 | 分类管理当前自绘只读树，写/排序禁用 | 只读业务能力与Arco复用是两件事；不得为“使用Tree”擅自开放拖拽写入。树键盘/搜索/展开/层级/scroll逐项验后决策复用。 |
| 高 | 冻结 `product-arco.jsx:66` 使用 Arco Modal | 颜色/版型与条码查看 native dialog，仅样式class相近 | 做实际DOM组件树与原版对应弹层对照；不能把pc-arco-modal class当真实Arco证据。 |
| 高 | 冻结 `transfer-date.jsx:4` 导入 DatePicker；哪些销售/新单最终挂载仍须按 `LOAD_ORDER.md` 和具体桥验证 | native/Arco日期并存，见上表 | 不推断所有date必须替换。确认每处原版最终挂载，再定逐组件还原任务。 |
| 中 | 原版列表/matrix本来就可能是原生模板；冻结 `product-current.js:list` 原生table是明确事实 | inventory/sales/transfer/product/setting多原生table | 不为追求“全站Arco”盲换Table造成列宽/矩阵身份/性能回退；原版为Arco的basic-settings列表单独核对。 |
| 中 | 冻结 `basic-settings-v2.jsx:4–14` 用真实Arco基础设置组件 | parties保留多数真实组件；新增store源码为Arco列表+native查看dialog | party与原合并页拆分是已有业务调整；store源码当前不在ApplicationRoute，不作为已上线页面。两类都需独立组件树+交互结论。 |

原版证据根：`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/`；先读其中 `LOAD_ORDER.md`。冻结包未提供运行bundle/真实数据完整闭环，不能宣称已证明原runtime恰好执行了所有静态分支。

## 6. 测试证据边界及验收清单

本轮**未运行任何测试或浏览器**，只读下列测试源码作为覆盖入口；历史日志/PASS字样不自动承接为当前统一验收通过：

- shared：`demo-controls/tests/run-source-and-boundary-tests.mjs`、`run-action-dom-tests.mjs`、`run-multi-select-shell-dom-tests.mjs`、`run-idle-selection-dom-tests.mjs`、`run-multi-select-layout-dom-tests.mjs`、`run-category-branch-dom-tests.mjs`；`components/tests/run-inventory-page-size-dom-tests.mjs`。
- 库存/Drawer：`inventory/tests/run-{inventory-query-lifecycle,settings-popup,product-drawer-lifecycle,product-candidate-layout}-dom-tests.mjs`；窗口化另见 `inventory/tests/run-windowing-dom-tests.mjs`。
- 销货：`sales/tests/run-dom-tests.mjs`、`run-reference-popup-dom-tests.mjs`；调拨：`transfers/tests/run-dom-tests.mjs`、`run-filter-dom-tests.mjs`；既有commands各自 `commands/tests/run-dom-tests.mjs`。
- 新单：`current-form/tests/run-dom-tests.mjs`、`run-create-route-dom-tests.mjs`、`run-sales-create-route-dom-tests.mjs`。
- parties：`parties/tests/run-dom-tests.mjs`；商品：`products/tests/run-dom-tests.mjs`；目录：`product-settings/{colors,size-groups}/tests/run-dom-tests.mjs`；实际route集成：`application/tests/run-management-controller-tests.mjs`。

统一验收不接受“只拍一个页面、一个弹窗或正常态”：

1. **每页、每Tab、每种真实消费者**记录入口和激活后的Arco根DOM（Select/TreeSelect/Tree/Picker/Table/Modal）；明确哪些是原生，不伪造组件证明。
2. 冷启动原生页→party→transfer→原生页→4settingTab→条码→商品Drawer，检查整份reset与action CSS加载/释放顺序、样式失败/重试。
3. 候选首次开/关、反复打开、ALL与显式子集、搜索/分页/上限、完整集合未知、禁用已选项、快速切控件、Escape、resize、外点与焦点返回。
4. 列表等待/0行/失败保留旧结果/取消/重试/403/身份替换、迟到旧成功与迟到拒权；分页超页/换size/未提交draft区分。不能用一套组件的成功覆盖另一装配路径。
5. native dialog与Arco Modal分别测Tab/Shift+Tab、Escape、遮罩、浏览器back/forward、关闭时新页面已获得焦点、嵌套图片预览；原生inert与top-layer不能由JSDOM代证。
6. 1600×1000、1100×900、900×800（原demo适用范围以实机为准），同viewport/100%缩放/deviceScaleFactor成对截图；记录computed rect、overflow、font与focus-visible。技术组件复用结论和像素结论分别填写。

**当前判定：源码事实盘点完成；Arco组件级统一与浏览器行为/视觉验收均待核。没有任何页面在本报告中标为PASS。**
