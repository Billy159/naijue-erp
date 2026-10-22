# 商品信息：独立真实只读能力（PR-01）

基准：冻结 Demo `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`，
`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/LOAD_ORDER.md`。
只读检查 `product-current.js` 的 `productFilterBridges` / `filtered` / `list`，
并按 `product-refinement.css → product-inventory-unified.css → product-rework.css` 最终层实现。
**源码、类型、DOM、bundle验证不等于视觉通过。当前为修复待 Mac 原/新同视口复验，未部署。**

## 已实现边界

- 一级商品信息只读列表，不是库存 Drawer 的替代入口，也不调用交易候选 API。
- 默认激活只读取第1页100款（effect microtask避开StrictMode废弃attachment）；筛选改动只改draft，明确查询才生效。
- 10列顺序：款号、商品名称、商品分类、年份 / 季节、供应商、版型、厚薄、零售价、总库存、操作。
- 主筛选：商品、商品分类、年份、季节；高级筛选：供应商、版型、厚薄、领型 / 裤型。各维度OR，维度间AND；分类支持原生自身/直接子类。
- 原“新增商品”禁用说明；原“编辑”有意改为“查看”。没有创建/编辑/删除商品、价格、条码、媒体写API。
- 查看仅在显式 `product` capability 存在时可用，复用现有基础资料/规格/图片3Tab只读Drawer；其原有目标/tab/media授权不被列表grant替代。不伪装为原六Tab维护页。
- 原页大小100/200/500、确切总数、上一/下一/跳页；分页沿用已执行条件，不偷偷采用未提交draft。失败保留并标识旧结果，取消和旧请求迟到无权覆盖新结果。
- 当前403/401即清本页全部结果与候选/Drawer scope并通知可信host；已取消/已替换请求迟到403不能清新身份。权限/session revision或卸载中止全部子读取；重新进入没有旧结果缓存。
- 页面横滚筛选保持原1114px最小列布局。商品及字典popup保持在各自scope/control内，以viewport坐标定位，避免被横滚form裁切；不把数据portal移到body。resize/scroll与关闭释放需Mac实测。

## 真正的查询合同和权限

新增独立端点：

- `POST /product-management/query`
- `POST /product-management/candidates/query`

服务、原生PG reader、HTTP plugin均须显式注入。没有默认账号、角色、`ADMIN`捷径、fixture生产fallback、数据库创建、监听器或自动注册。

`ProductManagementQueryAuthorization.authorize` 每次fresh决定：

```ts
{ kind: 'all', totalStock: 'unavailable' | 'all-warehouses' }
// 或非空、受限的真实product IDs
{ kind: 'products', productIds: [...], totalStock: 'unavailable' | 'all-warehouses' }
```

请求选项、筛选ID、浏览器角色均不授予读权限。目录grant与库存grant分离，**授权仓库子集的和绝不能标为“总库存”**。
`totalStock:'unavailable'` 不执行库存SQL，DTO返回`null`，UI为“未提供”；不是0。
只有明确全仓权限且同一RR READ ONLY快照验证既有完整cutoff publication、最终receipt/checkpoint、完整性guards、全部原生仓库和全部匹配SKU覆盖后，才允许汇总native balances与把已证实缺balance视为0；缺证明拒绝503，负量保真。

列表与候选在授权范围约束后才count/page/汇总；固定set queries无N+1。候选只由授权商品关联原生事实产生，不把商品列表权限扩大为全局字典管理。供应商/版型候选排除native disabled；无season enabled字段不造状态。
候选20项/页、popup最多200项窗口，达到窗口明确提示缩小搜索；只有单次完整未搜索页可证明ALL universe，不以多页快照猜全量。`selectedIds`是独立受限lookup；UI browse/search传`[]`并保留本地已选标签，绝不混淆lookup与候选全集。

## 必须保留的事实差异（不可宣称完整Demo等价）

1. native product没有`created_at`，不能复制Demo创建倒序；当前稳定按`product_code COLLATE "C", id`分页。
2. native `collar_pants_type`只有存储text，没有已确认的旧code→中文标签映射；候选显示真实存值，不补造中文。
3. native版型关系来自实际SKU，单个`season_id`；不能假设旧Demo多季节、未有SKU的声明版型已经持久化。列表fits仅报告当前实际SKU的版型。
4. 候选限定授权商品关联事实，非全部未使用字典；没有字典全局授权就不扩大枚举。
5. `null`价格/可选文字不造空事实或0。UI空单元格跟随原列呈现；库存未知明确显示“未提供”。
6. 新增/编辑维护、全六Tab详情不在本次范围。不能把查看成功标为PR-02–09通过。

## 交给统一composition owner

独立 `application/routes/products.tsx` 导出 `prepareProductsRoute` / `ProductsRouteConfiguration`。
初始query lane不改共享注册；随后经父任务明确指定，当前共享Application已新增默认关闭的 `products`、`product-categories`、`product-settings`、`barcode-schemes` 只读route/config/lazy CSS及菜单映射。既有交易session/dirty/命令、API生产host、package.json、migrations及导入owner文件保持不变。

挂实际菜单前必须完成：

1. 可信host明确商品目录和全仓/不可读库存的真实policy，不能从交易候选或Drawer权限推断。
2. 统一注册两个HTTP读端点，使用既有当前session/Origin认证和实际已迁移PG pool；无默认放行。
3. 统一路由枚举/config/style与菜单注册现已完成，配置缺失仍禁用。`ProductsRouteConfiguration`需要`stylesheet`，可选独立product action stylesheet；Application controller注入当前scope的access-failure owner，独立standalone prepare则须提供callback。
4. Application当前401使用既有expire；当前只读403仅failRoute并支持同菜单重试，旧scope迟到401/403无效；standalone `onAccessFailure`仍须对接可信host。页面本地已先清空。本函数须稳定引用，不能每次render新建而反复重挂读取。
5. 最后才注入显式目标商品只读reader；媒体provider缺失遵循现有501，不造public URL。

## 验证命令（全部仅合成/静态，禁止误称真实PG或浏览器验收）

```sh
node --test tests/product-management-query*.test.ts apps/api/src/product-management-query-http.test.ts apps/web/src/products/*.test.ts
node apps/web/src/products/tests/run-dom-tests.mjs
node apps/web/src/products/tests/run-build-check.mjs
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

后端tests验证授权先IO、参数化SQL、RR只读事务、分页、空值/负量/0、全仓cutoff证明和缺proof503、回滚/释放、HTTP拒权/Origin/session过期/错误脱敏。
Web tests验证constructor惯性、独立真实HTTP路径、完整页校验、8维过滤、晚到/取消/403清空，popup数学边界；React19 StrictMode DOM补列序、4+4筛选、实际共享商品搜索/年份TreeSelect、原分页、Drawer只读与关闭焦点、身份清理/卸载。
Arco现有React19 `element.ref`弃用警告不等于test失败；不在此lane改共享依赖。

云PG与云Chromium启动已明确拒绝，**本模块没有尝试**。实际SQL迁移后执行、host policy/路由可达性、Mac原/新同viewport成对截图（含1600×1000/1100×900/900×800）、computed geometry、横纵滚动/resize、popup、Drawer/错误/403态验收仍待统一owner执行。
