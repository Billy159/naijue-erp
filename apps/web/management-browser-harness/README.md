# 商品只读管理：actual Application 合成浏览器验收包

**合成演示数据 / 非正式 / 不输入真实密码。** 仅用于冻结Demo逐页核对的受控输入。
这里使用真正的 `createApplication`、共享壳、4个一级route及其实际HTTP reader/页面，
但注入的是本目录封闭内存transport。没有实际数据库、真实账号/库存或正式API授权；
**不代表新功能已生产注册、上线、真实PG通过或像素通过。**

## 最小 Mac 文件包

在源码根运行：

```sh
node apps/web/management-browser-harness/build.mjs
```

唯一运行文件：`dist/synthetic-management.html`（本目录下dist，gitignore）。
建议Mac最小验收包：HTML + `README.md` + `MAC_CHECKLIST.md` + `provenance.json`（后3文件由builder一起复制/生成）。运行只需HTML；其余用于核对与记录。provenance只记working-tree源输入及依赖manifest的hash，绝不把HEAD当实际源码或部署版本。双击或浏览器打开本地文件，不需服务器、npm、数据库、网络或密码。
构建是静态打包，未启动浏览器/监听器/数据库。JS、CSS与必要状态全部内联，
`connect-src 'none'` / `form-action 'none'` CSP和固定origin白名单transport双重禁止真实网络/凭据请求。
当前构建内联了route/action CSS，**不是正式lazy-CSS握手验证**；正式build由Application owner另验。

1. 页面顶部持续显示非正式警示。点“模拟进入商品验收（无需密码）”。
2. 左侧菜单实际导航：商品信息、商品分类、商品设置（颜色/尺码组/版型/季节4Tab）、条码方案；其余无能力菜单禁用。
3. 商品信息为105条明确合成商品，100/200/500页大小，8种筛选；含null价格、零价、负量与未知总库存。
4. “新增商品”禁用；“查看”复用真实只读Drawer基础/规格/图片3Tab。没有原6Tab维护、新增/编辑/删除能力。
5. 商品分类返回6个完整目录节点（含真实3级父链），childCount按合成父关系得出；所有productCount:null演示未获独立计数权限，不以0替代未知。新增/保存/删除/排序入口禁用。
6. 商品设置默认尺码组，显式开放4个只读Tab。尺码组、颜色、版型各23行用于20/3分页，颜色/版型另支持50/100页大小与名称/编码搜索；季节独立读取。新增/编辑/删除/确定均禁用，只读“查看”不冒称写维护。
7. 条码方案为当前/历史只读合成记录，长度与适用范围未知保留“未提供”，查看独立目标modal。
8. “下一次读取”可注入403/503/网络失败/成功0条。切换控件只设置下一业务读取，不会请求真实API。
9. 点“下一读取延迟3秒”，再点页内查询/刷新，随后取消或换页，确认旧响应不能复活前页。
10. “模拟身份失效”走实际认证的session核验/identity清理；无需密码即可重新模拟进入。

正式AuthenticationPanel代码未修改。仅此验收页隐藏/禁用其登录表单和改密码按钮；
transport明确拒绝`/auth/login`、`/auth/password`及一切命令端点。日志只记固定方法/路径，
从不记录请求body、密码、token或真实数据。刷新会清空一切合成状态。

## source 对照与待验

冻结基准：`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`，
`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/LOAD_ORDER.md`；
商品以`product-current.js:list/settings/schemes`及最后`product-rework.css`覆盖为准。
不得把早期app.js或只读Drawer当完整商品管理页面。未装载任何冻结数据/runtime/bundle。

需Mac实机为每页分别拍原/新同viewport截图，100%缩放并记录deviceScaleFactor；
优先原截图viewport，另补1600×1000、1100×900、900×800。
合成警示/请求日志属于验收壳，应单独记录其高度；比较业务区时原/新可用业务viewport须一致，
不能拿整屏尺寸冒充应用viewport或隐藏警示后宣称正式界面。

逐页范围：PR-01商品列表（4主/4高级筛选、10列、横滚/底分页、错误/空/等待）、
PR-10商品分类、PR-11颜色、PR-12版型、PR-13尺码组、PR-14季节、PR-15条码方案及查看modal、PD-01–05 Drawer。
测试键盘Tab/Shift+Tab/Escape、候选打开/收起、resize/滚动重定位、modal关闭焦点、权限与身份清空。
每条记录原/新截图路径、viewport、操作、差异和测试时间。
**本目录没有运行Chromium、Safari或Mac；视觉状态仍“修复待复验”。**

原生事实差异仍保留：商品无created_at所以不能伪造原创建倒序；shape存值无已确认中文映射；
版型来自实际SKU、季节单FK，不能把旧Demo多季节/无SKU声明版型当已迁移；目录grant不等于全仓库存grant。
这些并不由合成fixture掩盖，也不能把fixture成功当真实权限通过。


## 旧包 Mac 真实 FAIL：保留，不以 DOM 冒充复验

旧HTML SHA256：`95c7790d9e498dd2967a9f4ce89f85d7b9d9945bc86cbb5ee75ad1efcb238bef`。
父任务报告的实际Mac失败：商品年份/季节默认“全部”标签截断；商品Drawer Esc关闭后焦点为BODY；条码方案详情Esc关闭后焦点为BODY。
本轮core已做局部token reserve与原生close/React commit焦点次序修复，harness增加竞争回归；
**这些旧FAIL只可标“修复待Mac复验”，不能因Node/DOM/build通过改为视觉通过。**
标签截断需记录真实computed geometry和截图；DOM只证明文字存在，不证明未被裁切。

## 已验证命令

```sh
./node_modules/.bin/tsc --noEmit -p apps/web/management-browser-harness/tsconfig.json
node --test apps/web/management-browser-harness/synthetic-transport.test.ts apps/web/management-browser-harness/build.test.mjs
node apps/web/management-browser-harness/run-application-dom-tests.mjs
node apps/web/management-browser-harness/run-catalogue-application-dom-tests.mjs
node apps/web/management-browser-harness/build.mjs
```

- Node7项：封闭transport/无credential与写通道、8维筛选与DTO、页数、NULL/0/负量、字典/独立catalogue协议（分类计数null、颜色/版型23行）、受控失败、单HTML完整打包/CSP、literal内联字节。
- Actual Application原DOM4组保留：真实菜单/面包屑/105款分页与Drawer；组/季节Tab；方案目标查看；403本地清除和重试、迟到请求、身份清空/重新进入。
- 新catalogue DOM4组：完整分类树/本地搜索与层级/未授权商品计数/disabled写、颜色/版型各20+3分页与搜索/只读modal、跨Tab迟到；每种新kind均验取消、迟到403、当前拒权、identity清空。两套global fetch均为0。
- 旧Mac焦点FAIL回归采用真实focus查看按钮再click，dialog.close shim在实际open→close时故意把焦点转BODY；Esc后等待React commit/微任务严格回原trigger，同时新菜单/403恢复控件不得被旧target抢焦点。
- Typecheck/build/DOM均非真实浏览器视觉或真实PG结果。

只改本新目录；未改共享App配置/registry、现有交易harness、字典实现、APIhost、授权policy、migrations或package脚本。
