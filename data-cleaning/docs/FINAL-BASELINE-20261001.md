# 8877 Demo｜Final Baseline 收口报告

日期：2026-10-01。对象：8877 当前 Demo，分支 `codex/demo-8877-mainline`。

[COMPUTED|HIGH] 全站实际访问、直接修复、最终核心 18 项回放和数据还原已完成。当前确认的 P0/P1 均已修复；17 组前端回归、8 组后端回归通过。

[INFERRED|MED] 依据本报告明确的当前 Demo 范围与证据，具备冻结为 Final Baseline 的条件。

本轮按用户附件进行实际点击、直接修复、跨模块复测。普通读操作检查当前真实数据；商品/资料保存、员工状态迁移及单据审核使用独立运行区 `v2_runtime_test_final_20261001`、独立浏览器资料空间及认证 Cookie。保留开始前已有工作区修改，未迁移工程、未改写 T+ 来源数据。

## 1. 页面覆盖

全部 20 个当前路由形态均实际访问；父菜单、子菜单、页内入口和业务来源跳转均有浏览器记录。

| 页面 / 路由                       | 实际验证内容                                                   |
| ----------------------------- | -------------------------------------------------------- |
| 库存状况表 `#inventory`            | 商品候选、仓库/分类/供应商/版型/季节多选、高级筛选、查询、重置、空结果、矩阵、表格设置、分页、流水与来源跳转 |
| 调拨列表 `#transfer`              | 筛选、重置、分页、新增、详情入口                                         |
| 新增调拨 `#transfer/new`          | 出入库选择、创建者、商品规格、连续扫码、数量编辑、保存、审核                           |
| 调拨详情 `#transfer/doc/:id`      | 原尺码合计入口、原 SKU 明细、编辑、取消、保存、审核、弃审、历史、打印                    |
| 销货列表 `#sales`                 | 日期/状态/业务类型/厅/员工/客户/仓库筛选、查询、重置、空结果、末页、详情                  |
| 新增销货 `#sales/new`             | 商品录入与规格修改、同规格合并、赠品、折扣、整单优惠、客户推荐、内联混合支付、增删支付、保存、审核        |
| 销货详情 `#sales/doc/:id`         | 保存重开、真实账户快照、折扣参考价、弃审再编辑、操作历史、打印、历史销售与退货                  |
| 商品列表 `#products`              | 分类、年份、资料状态及多选筛选、分页、末页、库存汇总、查看/编辑、新增                      |
| 新增商品 `#product/new`           | 必填项、分类/年份/季节/供应商、当前规格、条码、九项价格、保存                         |
| 编辑商品 `#product/:code`         | 六个 Tab、当前与历史规格、价格粘贴、图片上传/替换/删除/取消、分仓库存、保存与取消             |
| 业务商品只读 `#product-view/:code`  | 营业员读取既有商品、六个 Tab、历史身份、条码、全部仓库及详细库存，无维护入口                 |
| 商品分类 `#product-categories`    | 一级/二级分类新增编辑、同层原生拖动与撤回、引用保护、空分类删除                         |
| 商品设置 `#product-settings`      | 颜色/版型新增编辑和业务候选返回；季节/尺码组只读；查询、分页与末页                       |
| 条码方案 `#barcode-schemes`       | 方案弹窗、新主码与兼容码查看、未来新码策略；既有主码保持                             |
| 营业厅 `#settings/stores`        | 查询/重置、新增/编辑、默认仓库、状态 Switch                               |
| 仓库 `#settings/warehouses`     | 所属厅选择、查询、新增/编辑、停用/恢复、历史停用仓库读取                            |
| 往来单位 `#settings/parties`      | 标签可全不选、新增/编辑、停用/恢复、筛选和分页                                 |
| 员工与账号 `#settings/staff`       | 新增同步开通默认勾选、编辑账号/权限、关闭登录、离职、恢复在职、改名后真实登录及旧名拒绝             |
| 收款方式 `#settings/payments`     | 查询、新增/编辑、状态在编辑内维护、支付候选读取                                 |
| 资金账户 `#settings/fundAccounts` | 新增方式下拉、查询/编辑/状态、创建后方式只读、正常账户及推荐账户                        |

旧地址 `#sales-returns` 已实际验证归一到销货列表；它不是额外业务页面。

实际打开的 Tab：商品「基础资料、规格、条码、价格、图片、库存」；商品设置「颜色、版型、尺码组、季节」；基础设置「营业厅、仓库、收款方式、资金账户」；单据操作历史及其版本明细。

实际打开的 Modal/弹层：商品颜色/尺码/版型 Transfer、分类 Cascader、年份/季节/供应商、分类新增/编辑/删除保护、颜色/版型新增编辑、条码方案/主码/兼容码、商品取消修改、图片预览与两项图片菜单、销售商品/颜色/版型/尺码候选、客户推荐、支付方式/账户推荐、批量选货与规格录入、保存校验、弃审/离开确认、单据历史与打印、六类基础资料新增/编辑、员工离职/恢复确认及日期筛选。

实际打开的 Drawer：库存流水、调拨扫码、基础资料操作记录；全部仓库/详细库存的对应页面与详情入口也已实际打开。操作记录实测中间内容滚动，Header、筛选与 Pagination 保持固定。1440×900 主视口及 980×760 窄视口均有检查。

详细记录、截图和覆盖清单在 `work/ERP-V2-final-baseline-20261001/`。原始记录保留发现缺陷和浏览器驱动选错目标等失败；最终结论以修复后重新验证的具体案例为准，不把原始日志整体宣称全部通过。

## 2. 已修复 P0

| 问题                                        | 修复结果与验证                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| 新增商品选择有效颜色、尺码、版型后仍被保存边界当成空规格，阻塞商品闭环       | 保存提交当前选择集，保持原历史数组；实际新增、编辑、生成条码、调拨和销货使用同一 SKU 成功                     |
| 多版型商品在业务候选/条码/调拨/销货/库存间丢失版型，可能投向另一版型的 SKU | 保持规范款号、商品 UUID、原 SKU/条码；内部版型视图贯穿找货、扫码、矩阵、保存、回读和打印。两版型独立调拨及销货、库存追溯通过 |
| 营业员访问旧 `sales-returns` 地址可落入旧商品管理壳        | 外层权限守卫先将旧地址归一到 `sales`，路由许可只接受明确销售路由；三角色及营业员 12 个受限地址实际检查通过         |

## 3. 已修复 P1

| 问题                                     | 最终行为                                              |
| -------------------------------------- | ------------------------------------------------- |
| 规格选择混入其他尺码组；分类弹层关闭导致不必要的页面重挂载          | 当前选择只来自当前尺码组；历史规格另行保留；分类关闭只在形状变化时刷新               |
| 退出当前颜色的旧配图阻塞保存                         | 原图片保留为历史素材；新上传的无对应当前颜色图片仍拒绝                       |
| 图片替换后文件选择没有完成，菜单关闭卸载上传节点               | 图片菜单保留上传节点，原生文件选择、替换、删除及取消恢复实际通过                  |
| 历史图片入口被旧局部要求隐藏                         | 按本轮最新要求恢复「历史图片」默认折叠，只读预览，无替换/删除入口                 |
| 结清后新一笔金额为 0，违反本轮空白要求                   | 结清/无剩余时新行金额为空；待收/待退时带入剩余；已有金额不变化；最多三笔，审核仍要求配平     |
| 异步推荐到账整页重绘，打断正在打开的客户等控件                | 更新支付区域，保留其他控件；实际客户候选继续打开和选择                       |
| 首次先选择支付方式时，正在打开的资金账户下拉仍显示旧选项           | 原位更新账户选项及推荐分组，保留宿主、焦点、已选账户和输入金额；冷启动顺序实际通过         |
| 审核前发出的推荐请求可在审核后恢复旧缓存                   | 成功销售写操作使缓存和在途请求失效；过期响应等待当前请求；审核与弃审后推荐按有效单据更新      |
| 新运行态单据缺少 `business_day` 时被较早历史单据排在推荐前面 | 推荐排序使用保存的单据日期回退，按厅与支付方式取最近有效账户；草稿、作废、其他厅、弃审排除测试通过 |
| 保存写入后、列表回读结束前过早解除忙碌，立即离开出现过期未保存提示      | 保存/审核/弃审持续忙碌直到单据与列表回读完成；失败释放状态。延迟回读回归通过           |
| 保存重开后 9 折的参考售价丢失                       | 新行保存真实参考价快照，回读仍可编辑 9 折；历史缺失参考价保持空值，不补造现价          |
| 混合支付打印只显示空账户或一笔简化数据                    | 打印全部真实收退款记录、账户名、方向及金额，原颜色/版型/尺码保留；打印不修改单据         |
| 当天流水日期按 UTC 截断，午夜附近不一致                 | 使用本地业务日，跨午夜刷新与边界回归通过                              |
| 新操作历史误标为历史导入                           | 使用真实员工操作身份，调拨/销货/流水来源记录与登录角色匹配                    |

## 4. 已修复 P2

顶栏明确显示真实「姓名 · 角色」；修正页面模式 class 残留及日期双边框；业务按钮恢复统一 32px；图片使用紧凑缩略图平铺和紧凑颜色矩阵；隐藏面向用户的内部归属待核验字段。共享视觉 token、只读状态与文本操作沿用当前库存基线。

## 5. UI 统一结果

| 控件         | 结果                                                                       |
| ---------- | ------------------------------------------------------------------------ |
| Input      | 搜索、字段、规格 Transfer 搜索与支付金额采用共同 32px 节奏；真实 Arco wrapper 接入公共适配，不另造基础设置高度体系 |
| Select     | 单选使用共享 Arco Select；库存多选与各筛选复用现有筛选组件；商品分类保留官方 Cascader；推荐与普通账户同一弹层，正常账户可选 |
| Table      | 字号、表头、行距、单元格和文本操作一致；历史同列尺码显示一个合计入口，原 SKU 另行查看；单一内容滚动，固定操作列在窄视口检查         |
| Pagination | 复用统一分页呈现，页码、每页数量、跳页与间距一致；列表和操作记录底部位置固定；不同业务页的既有分页单位保留                    |
| Modal      | 统一 Header/内容/Footer、紧凑宽高及取消/确定位置，减少多余分隔；下拉使用受控 portal，不被内容区裁剪            |
| Drawer     | 标题、关闭、筛选与底部统一；操作记录、库存流水和扫码各自内容滚动，实际原生滚轮检查                                |
| Button     | 业务操作使用文字与共享尺寸/颜色；删除/弃审明确提示，Arco 搜索、日期、关闭等原生图标保留                          |
| Tag        | 筛选标签、选择状态及审核/停用状态统一 token；当前选择与历史标记保持区分                                  |

本轮保持库存状况表的结构、搜索黄金控件与业务矩阵规则，没有替换页面设计。

## 6. 历史兼容结果

| 样本 / 状态                             | 核对结果                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `000JK0000006`、旧条码 `90000006000504` | 六个商品 Tab 可读；旧 SKU 与条码仍对应原身份；原尺码 `175/92A` 的标准显示不改写来源；负库存保留                   |
| `026MS5133001` 原图片                  | 历史图片区默认收起、可展开预览、只读；当前图片与颜色配图独立                                               |
| 历史销货 `SA-2026-09-0207`              | 原商品、SKU、数量与支付事实可读取，不用当前售价补造历史参考价                                             |
| 历史退货 `SA-2026-09-0195`              | 原退货数量及来源身份可打开读取，不改变原记录                                                       |
| 历史调拨 `ALAL-2026-09-0128`            | 原 SKU、尺码与数量保留；此次只打开核对，不保存或审核历史单                                              |
| 多原尺码对应同一标准列                         | 合计入口与原 SKU 数量分开；原尺码编辑确认/取消、打印/导出数量保持；不能重分摊历史数量                               |
| 多版型同色同尺码                            | 不合并不同版型身份；两版型扫码、调拨、销售与流水独立                                                   |
| 停用但有库存仓库                            | 原数据缺少适合的完整样本；另建隔离资料空间，仅对真实库存仓库设置停用测试标记。全部仓库/详细库存仍显示，调出可选、调入排除。该状态夹具不冒称正式仓库操作 |
| 未映射规格 / 未绑定条码                       | 当前加载业务视图未发现可用的真实异常样本；边界回归覆盖无有效 SKU 禁止生成业务行、历史缺失资料不伪造。不能声称实际点开不存在的样本          |

正式数据指纹结果见最终数据核对附件：86 张被核对表行数相同，84 张全文摘要相同；差异仅为既有编辑租约与主资料引用同步时间。主资料引用的业务字段另外比较，差异 0。认证会话等三张操作表明确排除，未将其称为不变。

## 7. 安全代码清理

移除商品业务查看入口后的三段不可达旧详情拼装；移除已经退役且不可达的销售退换路由加载/面包屑分支；旧地址保留明确跳转。没有根据名称或表面无引用大批删除模块，未删除历史数据、原条码或既有业务能力。

本轮相对开始快照改变 26 个 UI 源码/资源文件及 1 个后端生产文件；测试、报告、证据与 Finder 元数据另计。完整变化名单及最终 SHA-256 清单附在验收目录。

## 8. 性能

只做已定位的低风险改动：推荐返回前每次调用一次整页销售重绘，现在整页调用为 0；焦点在支付区域时仅更新变化的账户选项，宿主与输入焦点保持。分类弹层关闭也避免无条件重绘。新增回归直接检查节点身份、焦点及旧金额保持。

商品与单据列表继续使用既有分页，候选继续按已有分批机制加载。实际搜索、候选、大型 Select、图片、库存、列表及末页没有观察到阻塞核心流程的卡顿。本轮没有严格计时的搜索前后基线，不编造毫秒提速或百分比。扫码成功提示的实际持续时间另行记录，满足约 2–3 秒要求；它是交互时序验证，不是性能提速结论。

## 9. 尚未解决问题

本轮当前 Demo 范围内，没有已确认而未修复的 P0/P1。历史未映射/未绑定状态的真实样本不足及停用库存仓库的夹具性质已在第 6 节明确，不将不存在的样本算作实际验证。

## 10. 最终结论

[COMPUTED|HIGH] 最终核心 18 项全部 PASS；最新一轮包含 67 项细节检查、260 次原生点击/输入动作，未出现失败断言。扫码成功提示本轮实测 2.623 秒。观察到的应用源文件未处理异常为 0。所有修改后的代码在该轮回放全过程保持一致。

| 项目             | 结论                                                           |
| -------------- | ------------------------------------------------------------ |
| 剩余 P0          | 当前范围没有已确认的剩余 P0                                              |
| 剩余 P1          | 当前范围没有已确认的剩余 P1                                              |
| Final Baseline | 具备冻结当前 Demo 的条件，保留可复核代码指纹与证据                                 |
| 回归数据           | 11 张新增测试单据全部未审核；14 个 SKU/仓库单元净影响 0；仅保留在隔离运行区供追溯              |
| 正式数据           | 86 张表行数不变；84 张内容摘要相同；2 张操作元数据差异单列；资料业务字段差异 0                 |
| 预览与服务          | 正常 8877 页面及 8878 健康检查均返回 200；独立 8880 服务与自有 QA 标签页已关闭，原员工会话保留 |

最后一次修复后从登录开始，实际重新完成以下流程：

|  # | 核心流程             | 结果   | 浏览器证据                                                                                                                                                      |
| -: | ---------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1 | 管理员登录            | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/250-freeze-final-product-spec-barcode.png)             |
|  2 | 仓库人员登录           | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/255-freeze-final-warehouse-login.png)                  |
|  3 | 营业员登录            | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/258-freeze-final-sales-permissions.png)                |
|  4 | 商品新增 / 编辑        | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/250-freeze-final-product-spec-barcode.png)             |
|  5 | 规格               | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/250-freeze-final-product-spec-barcode.png)             |
|  6 | 条码               | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/250-freeze-final-product-spec-barcode.png)             |
|  7 | 库存查询             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/262-freeze-final-inventory-one-and-ledger-sources.png) |
|  8 | 调拨新增             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/256-freeze-final-scan-drawer.png)                      |
|  9 | 扫码               | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/256-freeze-final-scan-drawer.png)                      |
| 10 | 调拨审核             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/257-freeze-final-transfer-approved.png)                |
| 11 | 销货新增             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/259-freeze-final-gift-discount-mixed-payment.png)      |
| 12 | 赠品               | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/259-freeze-final-gift-discount-mixed-payment.png)      |
| 13 | 混合支付             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/259-freeze-final-gift-discount-mixed-payment.png)      |
| 14 | 销货审核             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/260-freeze-final-print-real-payments.png)              |
| 15 | 基础资料新增 / 编辑 / 停用 | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/251-freeze-final-party-create-edit-disable.png)        |
| 16 | 员工账号 / 权限 / 离职   | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/252-freeze-final-staff-departed.png)                   |
| 17 | 操作记录             | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/254-freeze-final-audit-fixed-regions.png)              |
| 18 | 历史数据打开           | PASS | [截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/268-freeze-final-historical-transfer.png)              |

本轮生产变化为 26 个 UI 源码/资源文件及 1 个后端生产文件。开始快照范围内的 UI、新增业务视图和后端入口共 228 项指纹在最终回放中不变；另附 39 项当前运行态源码、配置及依赖清单指纹。

关键证据：

- [页面/弹层覆盖](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/COVERAGE.md)
- [最终核心 18 项及细节结果](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/FINAL-REGRESSION.json)
- [前端 17 组测试结果](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/final-tests.json)
- [后端 8 组测试日志](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/backend-tests.log)
- [20 个脚本语法检查](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/syntax-checks-final.json)
- [生产文件变化名单](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/production-changes-final.json)


- [正式数据指纹对比](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/data-integrity-final.json)
- [回归单据/库存还原](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/fixture-restoration-final.json)
- [Final Baseline 指纹](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/FINAL-BASELINE-SHA256.json)
- [应用异常观察](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/final-browser-app-errors.json)
- [正式预览截图](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/evidence/270-normal-preview-final-baseline.png)
- [原始点击/输入日志](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001/browser-actions.jsonl)

最终验收不把历史目录所有旧验证脚本算作通过；当前通过清单明确列出实际运行的文件，旧脚本失败及调试记录保留供追溯。
