# 商品分类 / 颜色 / 版型：真实授权只读切片

独立源码已实现；**本切片自身不注册 Application 路由、配置或 API plugin，共享 owner 另行组合且正式能力默认关闭；没有接入真实 host policy，没有 PG / Mac 视觉验收，也不是已上线证明。** 不改 DDL、导入器、商品管理列表或原 `dictionary-read` 模块。

## 给共享接线 owner

- 分类：`src/product-categories/product-categories-page.tsx` 的 `ProductCategoriesPage`。
- 颜色：`ColorsPage`；版型：`../fits/fits-page.tsx` 的 `FitsPage`。
- 必须传当前 caller-owned `ReadScope`、`CatalogueSettingsBrowserReader`、必填 `onAccessFailure(kind)`。`createCatalogueSettingsHttpReader({fetch,origin,basePath})` 只访问同源 session API，不发送浏览器身份/role/grant。
- 颜色/版型的 `onSettingTab` + `allowedSettingTabs` 只允许切换父级实际可用的目的页。callback 本身不解锁未实现 Tab；共享 owner 后续可组合原尺码组/季节页，不应让本 lane 改其独立合同。
- server 用 `createCatalogueSettingsReadHttpPlugin({authenticate,dependencies})` 和 `PostgresCatalogueSettingsReadReader(pool)`，都为 inert 工厂。`authenticate` 必须是当前可信 session/POST Origin 校验；`dependencies.authorization.authorize` 每次读取明确返回对应目录的 exact grant。没有默认管理员、候选数据授权升级或放行 policy。
- 当前只有读能力：原新增、编辑、保存、删除、拖排、撤销入口均禁用并明确未接入。只读「查看」展示本次已授权分页快照，不调用写接口、不开本地编辑草稿、不提示保存成功。将来写功能需要另开受审合同与授权，不能仅把 disabled 移除。

## 严格只读 POST 协议

| 路径 | JSON 请求 | 返回 |
|---|---|---|
| `/catalogue-settings-read/categories/query` | `{}` | `{total,items:[{id,parentId,name,displayOrder,version,code:null,productCount:number|null,childCount}]}` |
| `/catalogue-settings-read/colors/query` | `{search,page,pageSize}` | `{page,pageSize,total,items:[{id,code,name,enabled,version}]}` |
| `/catalogue-settings-read/fits/query` | 同上 | 同上，来自独立 `fit` 原生表 |

分页 20/50/100；search ≤200字符、无控制字符；offset 须安全整数；额外 query、body 的 actor/grant/write 字段一律拒绝。全程 no-store。列表 count/page 同一 REPEATABLE READ READ ONLY 快照；越界页显式空，提供回第一页，不夹为其他页。颜色/版型保留空字符串、前后空格、原编码、启用 boolean、version 及同名不同ID，不按名称推导任何身份或状态。

分类完整树来自 `product_category`，技术上限5000；count 与原生行同快照，超限413、缺父/循环/重复/数量不符均拒绝，不静默截断、补根、补父或重排为两层。按原 `parent_id` 构树，兄弟按真实 signed `display_order` + UUID 稳定排序。原生没有分类编码列，`code:null` 明示「未提供」，不读迁移绑定冒充编码。分类名称、层级、顺序、version 都保真。

**商品数是额外权限，不属于目录权限：** 分类 grant 必须显式有 `productCounts:'NONE'|'ALL'`。NONE 完全不查询商品表，每个 productCount 为 null，显示「未提供」，不能造0。ALL 表示 host 已独立确认当前用户及使用的 pool/DB角色可见**完整所有商品计数**；厅限定/部分商品可见范围不能冒充 ALL。ALL 时统计每个分类的直接商品引用（不把后代重复累加）；有授权且真实无引用才显示0。service 再核 injected reader 与计数能力相符。childCount 由已授权完整目录的实际直接子分类数得出。

## 生命周期

每次 activation 建独立 child scope / LatestQuery。父身份/session/permission revision 失效时立即清除当前结果、树选择详情与 modal。Close/Escape/unmount/取消拒绝迟到事实与迟到拒权；当前401/403先清本地 child，再交 mandatory host callback 处理全局身份。leaf 不擅自dispose caller scope。错误只显示安全文案，保留旧成功结果时明确其搜索/页/完整目录为「上次成功」，不当成本次成功。

颜色/版型 inline 搜索为180ms真实服务端debounce，变化立即取消旧请求、page回1，Enter不与debounce重复派发；没有全量冻结数组fallback或自动retry。分类搜索仅过滤本次已经获授权且完整读取的真实树，保留原父链，支持展开、方向键/Home/End/Enter/Space。分类搜索采用KMP流式跨路径匹配与一次祖先标记，不对每条记录重建完整祖先字符串；5000层synthetic深链有回归，不能当作浏览器性能验收。modal只读且Close/取消/Escape先关闭原生dialog、解除inert后再回原查看按钮；刷新/搜索会先关闭旧快照modal。PG signal 只在调用间检查，**不能取消正在进行的 pool acquisition/SQL**；host 必须配置连接池、statement及lock timeout。rollback/COMMIT不确定失败丢弃client，不自动重试。

## 冻结 Demo 对照与有意差异

基准 `8877-ui-evidence-b8bcfe3`，遵循 `LOAD_ORDER.md` 后置覆盖。精确文件hash见 `source-provenance.json`；没有加载原全局runtime或导入真实资料。

| 对照 | 最终源结构 | 当前保留 / 真实读取必要适配 |
|---|---|---|
| PR-10 分类 | `product-current.js:176–181`；`product-arco.jsx:19–33,210–229`；`product-inventory-unified.css:49–69` 后接 `product-rework.css:31` | 280px可搜树/右资料、路径/名称/商品数/下级数、两列facts、删除区；原native层级不强降二级。树为受控原生ARIA重建，不复制可拖拽旧runtime；drag/undo禁用。原生code/order/version增加只读事实区，不捏造源码中未提供的分类编码。 |
| PR-11 颜色 | `product-current.js:193–200,208`；`product-inventory-unified.css:72–85` 后接 `product-rework.css:32–33` | 原4Tab、名称/编码/操作3列、280px搜索、32控件、34行/36表头、480px名称/代码modal（最终注入Arco modal覆盖：4px圆角、43px最小header、11px/14px header padding）。新增/编辑/删除/确定disabled；额外明确「查看」，modal增加真实启用状态和version，标题不冒称编辑。 |
| PR-12 版型 | 同上独立kind | 与颜色共用源布局，但真实独立fit读、UUID、code/name/enabled/version。没有从code或名称猜ID或跨kind合并；不复制旧字母ID构造。 |

CSS 限定 `.catalogue-workbench`、`.catalogue-categories`、`.catalogue-entry-modal`，不靠裸表单默认样式，也不导入全局Arco CSS污染其他页面。源布局/样式移植和DOM检查**不等于实际像素一致**。

## 验证命令

```sh
node --test tests/catalogue-settings-read.test.ts tests/catalogue-settings-read-postgres-protocol.test.ts apps/api/src/catalogue-settings-read-http.test.ts apps/web/src/product-settings/colors/http-reader.test.ts apps/web/src/product-categories/tree-model.test.ts
node apps/web/src/product-settings/colors/tests/run-dom-tests.mjs
node apps/web/src/product-settings/colors/tests/run-build-check.mjs
./node_modules/.bin/tsc --noEmit -p apps/web/src/product-settings/colors/tsconfig.json
npm run typecheck
```

全部测试数据为显式synthetic。PG scripted driver协议不是SQL真实执行证明；DOM不是浏览器布局证明。已知云PG/Chromium权限拒绝，本lane未重试/绕过。后继：共享owner接线（默认关闭直到授权capability明确）、目标PG实读/隔离/权限验证、Mac逐页与原Demo截图及交互比对、受控上线验证。
