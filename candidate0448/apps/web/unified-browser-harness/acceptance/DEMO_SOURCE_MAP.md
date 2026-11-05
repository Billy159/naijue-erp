# 冻结 Demo 对照定位（不重发数据或 runtime）

基准：`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`。
云只读提取证据：`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/`。
用户 Mac 使用已有原 Demo 文件；本验收包不复制业务数组、数据桥、账号、媒体或原构建 bundle。
Mac 实际路径由父任务核实后填 `VERIFIED_DELIVERY`，不能把上面的云路径当 Mac 路径。

先读证据目录 `LOAD_ORDER.md`、`LAYOUT_MAP.md`、`EXCLUSIONS.md`、`DEPENDENCIES.json`。
原 `frontend/index.html` 中 classic scripts 顺序执行，后置脚本/JSX 注入 CSS 覆盖前层。不要只看早期 app.js。
源文件与运行 bundle 对应关系并未由本包重建证实；排除项未知必须保留。

| 页面/交互 | 冻结布局入口 | 最终重点样式/覆盖 |
|---|---|---|
| 品牌、侧栏、业务导航、顶栏 | frontend/index.html:9–16；gold.js | ui-tokens.css、styles.css、gold.css、brand-components.css、golden-consistency.css |
| 库存筛选/候选/查询结果/显示设置/分页 | inventory-workbench.js:45,47–59；inventory-select.jsx、inventory-category.jsx、inventory-filters.jsx | inventory-workbench.css、inventory-refinement.css、inventory-ledger.css；ShadowRoot Arco 后局部 CSS |
| 库存矩阵/分组/小计 | inventory-matrix-experiment.js:37,87–88；matrix-sections.js | matrix-experiments.css、golden-consistency.css、product-inventory-unified.css |
| 调拨列表/新增/单据 | transfer-current.js；transfer-matrix-experiment.js；最后 transfer-golden.js:15,30,37 | transfer-current.css、matrix-experiments.css、golden-consistency.css；transfer-date.jsx |
| 销货列表/销售退货换货单据 | sales-current.js 的 list/editor/lineTable/entryRow；sales-funds-ui.js；sales-summary.js | sales-golden.css、sales-refinement.css、sales-detail-alignment.css、sales-returns.css、entry-shared.css；inventory-filters.jsx、transfer-date.jsx |
| 单据扫码/扫描记录 | transfer-scan-drawer.js、scan-workbench.js | transfer-scan-drawer.css；本版未接，不能假验通过 |
| 商品10列列表与8筛选 | product-current.js:list:80–81；product-arco.jsx | product-current.css、product-refinement.css、product-inventory-unified.css、最后product-rework.css |
| 商品6Tab新增/编辑/全页只读 | product-current.js:89–172,253–260 | 同上；本版3Tab Drawer不等于完整页 |
| 商品3Tab只读Drawer | product-arco.jsx:173–205；product-current.js:136,156–165 | 右侧min(660px,100vw)、无footer；product-arco.jsx:40–62追加Arco后局部覆盖 |
| 分类树/详情 | product-current.js:176–190 | product-current.css、后置product-rework.css；本版仅读，禁新增/删/拖排 |
| 商品设置颜色/组/版型/季节 | product-current.js:194–204 | product-current.css、最后product-rework.css；组/季节原Demo只读 |
| 条码方案列表/查看 | product-current.js:schemes/openScheme | product-current.css、最后product-rework.css；不是规则编辑器 |
| 往来单位（新端独立客户/供应商） | basic-settings-v2.jsx:55–67,74–100,146–196 | basic-settings-v2.css、basic-settings.css；后注入Arco再settingsCss；拆分是已确认业务差异 |
| 营业厅仓库/员工账号/收款配置/记录 | basic-settings-v2.jsx:19–26,49–67,146–196、LogDrawer | basic-settings.css、basic-settings-v2.css；本版未接一级入口，不以交易候选替代 |
| 通用单选/确认/增强 | entity-select.js、unified-single-select.jsx、interaction-common.js | unified-single-select.css、confirmation-dialogs.css、ui-review.js/ final-ui.js MutationObserver后增强 |

原清单详细状态 ID 见 `ALL_PAGES_DEMO_AUDIT.md`（历史盘点，部分“尚未接入”已被当前 PAGE_MATRIX 更新；不得直接当当前能力或视觉结论）。
