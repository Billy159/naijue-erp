# 当前统一入口逐页矩阵

这是一份**能力/审查输入**，不是视觉验收结果。实际构建快照与HTML的hash以包内provenance为准。
同一个 `createApplication`、同一个左导航/菜单高亮/身份与dirty guard，闭合内存transport；没有iframe或跳到另一测试页。
源码目录以下省略 `apps/web/src/`。

状态含义：**可达只读**=真实页面+真实reader，响应合成；**内存新单**=真实session/prepare/SAVE/receipt，非数据库；**未接入**=disabled且说明；**待复验**不是PASS。

| 对照ID | 页面/入口 | 本版能力 / 写边界 | actual源码 | 视觉结论 |
|---|---|---|---|---|
| SH-01–09 | 统一外壳、所有9一级route、加载/错误/取消/身份 | 一键进入，无真实密码；未接菜单disabled；保持canLeave/旧身份清除 | application/controller.ts、demo-frame-presentation.tsx；demo-presentation/demo-frame.tsx | 未核对；原客户供应商拆分/认证位置差异保留 |
| IN-01–05,07 | 库存状况表、8类筛选/候选、矩阵、设置/范围/分页 | 可达只读，明确合成；查询前不假报空成功 | inventory/inventory-page.tsx、inventory-matrix.tsx、display-projection.ts | 未核对 |
| IN-06 | 单元格库存流水 | 未接入；缺onOpenCell，不捏造ledger | inventory/contracts.ts、inventory-page.tsx | 存在差异（缺接入） |
| TR-01–03 | 调拨单列表、筛选、详情激活 | 可达只读列表，独立detail/actionCSS | transfers/transfers-page.tsx、filter-controls.tsx | 修复待复验（原筛选/布局修复） |
| TR-04–07 | 新增调拨单、仓库/商品/SKU候选、数量矩阵、重置/离页 | 内存新单；保留真实proposal/session/dirty/prepare/取消/迟到 | current-form/transfer-proposal-form.tsx；transfers/commands/controller.ts | 修复待复验；候选modal与Demo交互差异 |
| TR-08,10 | 调拨单只读详情、稀疏规格 | 实际detail，仅合成target；只读seed与新SAVE隔离、历史只读、不造规格 | transfers/detail-host.tsx、detail-content.tsx、sparse-lines.tsx | 未核对 |
| TR-12 | 调拨详情商品Drawer | 本预览未配transfer productcap，真实查看动作disabled；不把target40路由到无关商品 | transfers/product-activation.tsx | 存在差异（本版未接） |
| TR-09 | 既有调拨编辑/审核/弃审/作废 | 正式组件有代码，但本合成协议只允许newSAVE；其他命令不可假成功 | transfers/commands/form.tsx、controller.ts | 存在差异/本版不可验完整写操作 |
| TR-11,13 | 调拨扫码/记录、导出/打印/操作历史 | 未接入，明确disabled | transfers相关页面disabled入口 | 存在差异（缺接入） |
| SA-01–03 | 销货列表、业务/状态/日期/引用筛选 | 可达只读，真实query/detail reader | sales/sales-page.tsx、filter-controls.tsx | 修复待复验（原标签/窄屏修复） |
| SA-04–10 | 新增销售、独立退货、独立换货、候选/付款、dirty确认 | 内存新单3变体；真实价格领域函数/prepare/newSAVE/幂等receipt，刷新清空 | current-form/sales-proposal-form.tsx；sales/commands/editor-session.ts | 修复待复验；锚定/行内候选与付款交互差异 |
| SA-11 | 销货只读详情（含业务类型/资金快照） | 可达真实detail；数据明确合成 | sales/detail-content.tsx、detail-header.tsx | 未核对 |
| SA-12–16 | 既有编辑/审核等、批量选货/换行身份、扫码、商品查看、导出打印历史 | 本合成协议不冒充旧单commands；原未接动作保持disabled | sales/commands/form.tsx及页面显式disabled入口 | 存在差异/缺接入，逐项记录 |
| SA-17 | 缺事实/拒权/不可用/丢SAVE响应/原回执 | 保留真实unknown与exact replay边界；只可证明页面内存模拟 | current-form/sales-proposal.ts、sales-create.ts；sales/commands/editor-session.ts | 未核对（新协议状态，非原Demo运行等价） |
| BS-05–08,SH-04 | 客户、供应商独立2页 | 真实Party列表/搜索/状态/分页；本预览显式只读，写disabled且transport拒绝 | parties/party-route.tsx、controller.ts、http-client.ts | 未核对；拆分为已确认差异 |
| PR-01 | 商品信息一级列表、4主/4高级筛选、10列分页 | 可达只读；新增disabled；不以交易候选补空冒充列表 | products/products-page.tsx、http-reader.ts | 修复待复验（年份/季节截断旧FAIL） |
| PD-01–05 | 商品Drawer基础/规格/图片3Tab、加载/错/预览 | 共享真实target只读Drawer，独立授权；各消费者分别验 | inventory/product-drawer-host.tsx、product-tab-*.tsx | 修复待复验（Esc返焦点旧FAIL） |
| PR-02–09,16 | 商品新增编辑6Tab、条码/九价/图片上传/库存、全页只读 | 未实现/未接入；不能用3Tab Drawer充当 | products/README.md能力边界 | 存在差异（缺接入） |
| PR-10 | 商品分类树、搜索、选中详情 | 可达只读；新增/保存/删除/排序disabled；productCount:null不补0 | product-categories/product-categories-page.tsx | 未核对；只读与Demo写维护差异 |
| PR-11 | 商品设置颜色Tab、搜索分页/只读详情 | 显式cap可达；新增/编辑/删除/确定disabled | product-settings/colors/colors-page.tsx | 未核对 |
| PR-12 | 商品设置版型Tab、搜索分页/只读详情 | 显式cap可达；同上，旧tab读取消/迟到隔离 | product-settings/fits/fits-page.tsx | 未核对 |
| PR-13 | 商品设置尺码组Tab、成员分页 | 可达只读；原Demo即只读，不添加假写 | product-settings/size-groups/setting-page.tsx | 未核对 |
| PR-14 | 商品设置季节Tab | 可达只读；原Demo即只读 | product-settings/seasons/seasons-page.tsx | 未核对 |
| PR-15 | 条码方案列表、当前/历史方案modal | 可达只读；无规则编辑 | barcode-schemes/barcode-schemes-page.tsx、barcode-scheme-view.tsx | 修复待复验（Esc返焦点旧FAIL） |
| BS-01–04 | 营业厅与仓库一级管理/新增编辑 | 未接actualApplication；即使独立readonly模块已有源码也不自动开cap | settings/已有独立模块，以最终依赖快照为准 | 存在差异（本版未接入） |
| BS-09–15 | 员工账号/收款方式/资金账户/操作记录 | 未接入；认证自改密码≠管理员工；交易候选≠全量配置 | 实际左导航disabled | 存在差异（缺接入） |
| ST-01–07 | 每页公共等待/空/错/重试/权限/取消/迟到/identity/viewport | 各可达页面分别验，不用一个错误页或DOM总PASS代替 | acceptance/PROMPT.txt及原audit状态表 | 未核对 |

## 必验控件矩阵（每种消费者独立截图/操作）

| 类别 | 消费者 | 必验 |
|---|---|---|
| 单选/多选/分类树/远程候选 | 库存、销货/调拨列表、新单、商品筛选、Party状态 | 默认全部/清空/部分/长标签、搜索、分页、拒权、滚动定位、不裁切、合法input可见 |
| 日期 | 销货列表原生、调拨列表Arco、新单原生、既有编辑Arco | 来源与交互差异；格式/范围/清空/键盘/弹层/必填，不只外观 |
| 表格/矩阵 | 库存、交易列表/新单/详情、Party、商品、4Tab、方案 | 列序/宽高、空态、未知/零/负值、粘性列、横纵滚、窄屏 |
| 分页 | 共用Pagination、PartyPagination、管理各分页 | 可选页大小、跳页raw输入、边界/总量未知、执行条件稳定、切页焦点 |
| modal/drawer/confirm | Drawer、barcode查看、颜色/版型只读、新单候选/dirty、Party | 真实Arco或自绘来源；Portal/container、native close顺序、Esc/遮罩、回焦、新导航不抢焦点 |
| 状态/授权/恢复 | 所有route及action leaf | 403不是空成功、401清身份、旧响应不覆盖、新scope旧401不驱逐、unknownSAVE不重复 |

## 盘点口径

历史总盘点“35页面/65浮层”的**原始来源**为 Mac task7 的 `ALL-PAGES-COMPARISON.md`（目前仅Mac本机，汇总索引待接收）；这不是35条已实现路由或65个已可点弹窗。未收到原索引前不硬凑计数。
本版明确只有9个一级route，其中商品设置同页4Tab；新单/detail/Drawer为子状态。所有原audit ID均保留映射和缺口，不凭空将状态凑数。
本表不能替代原始Demo完整盘点，也不改变原尚未复验的FAIL。
