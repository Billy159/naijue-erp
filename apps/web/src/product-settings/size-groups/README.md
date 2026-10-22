# 尺码组 / 季节 / 条码方案只读页

状态：独立实现、未注册路由或 API。**不是已上线或视觉验收通过证明。**

## 真实读取闭环（由共享应用 owner 显式组合）

- UI：`SizeGroupsPage`、`SeasonsPage`、`BarcodeSchemesPage`。
- 注入 `createDictionaryHttpReader({ fetch, origin, basePath })` 与当前 caller-owned `ReadScope`。没有冻结数组、synthetic fallback、浏览器 role、持久缓存或 importer 请求。
- `onAccessFailure` 为必填；host 处理当前 401/403 时必须失效当前认证/权限上下文。组件先关闭自己的 child scope 并清除资料；不会擅自销毁 caller scope。切换身份/权限时 host 必须让原 scope 失效。
- 可选 `onSettingTab` 仅交给父路由切换已有设置页；没有可用 destination 时其他 tab 禁用。没有编辑/新增/保存/删除按钮或写 API。
- HTTP 独立工厂 `createDictionaryReadHttpPlugin` 需要现有 trusted session authenticator 与 `DictionaryReadDependencies`；PG 工厂 `PostgresDictionaryReadReader` 必须注入现有 pool。此 lane 不启动 server，不创建 pool，不迁移/seed，不修改 registry/configuration/Application。
- mandatory `authorization.authorize` 每次查询显式返回 exact `{kind,targetId}` grant。list `targetId:null` 表示获批枚举**该字典**；详情为 exact scheme UUID。它不接受交易候选 grant，也不含默认全目录放行 policy。host 仍需提供经确认的现行授权实现后才可启用。

## 四个严格 POST 读协议

| 路径 | JSON 请求 | 返回 |
|---|---|---|
| `/dictionary-read/size-groups/query` | `{search,page,pageSize}` | `{page,pageSize,total,items:[{id,name,sizes:[{id,name,displayOrder}]}]}` |
| `/dictionary-read/seasons/query` | 同上 | `{page,pageSize,total,items:[{id,name}]}` |
| `/dictionary-read/barcode-schemes/query` | 同上 | 分页 scheme DTO |
| `/dictionary-read/barcode-scheme/query` | `{schemeId}` | scheme DTO 或真实 `null` |

`pageSize` 仅 20/50/100；page 正安全整数且 offset 安全；search 最长200字符，不接受控制字符。输入不含角色、身份、grant、写字段或 URL query。所有响应 no-store。列表 count、page、页内有序成员在同一 PostgreSQL REPEATABLE READ READ ONLY 快照，offset 不静默 clamp；越界页显式空，并提供回第一页。每组成员技术上限1000，溢出报错不截断；保留不同 size ID 的同名成员，不按显示名去重。PG AbortSignal 在调用之间断开，不能声称取消了正在运行的 pg SQL/pool acquisition；host 仍需数据库/连接池 timeout。

scheme DTO 为 `{id,name,barcodeType,ruleDescription,codeLength,ruleVersion,status,applicability}`。直接读取 native `barcode_scheme`。`codeLength:null` 显示“未提供”；schema 没有 applicability，返回显式null并显示“未提供”。没有 prefix、segments、priority 等 native 字段，绝不从名称（例如2026）推导当前状态、长度、编码规则或默认新商品用途。状态只用实际 CURRENT/HISTORICAL。方案查看只显示原Demo四项：方案名称、条码类型、编码规则、总长度；不是可执行条码规则引擎，不重算已有条码。

## 冻结 Demo 来源与有意的实读适配

基线：`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3`，按 `LOAD_ORDER.md` 最终覆盖链阅读：`product-current.js` 的 `settings()` / `schemes()` / `openScheme()`；`product-inventory-unified.css` 后接 `product-rework.css`；modal 来自 `product-arco.jsx` 后注入规则。不拿早期 app.js 模板当最终页。

- 商品设置保留颜色/尺码组/版型/季节四Tab；尺码组2列“尺码组/包含尺码”，季节1列“季节”。原20/50/100分页；inline名称搜索改为180ms server debounce而非加载冻结全数组。
- 方案保留7列和“查看”；原方案源 priority 无 native字段，采用明确的 native status/name/id 稳定顺序，不捏造 priority。方案也增加真实分页，避免一次枚举全目录。
- CSS 限定 `.dictionary-workbench` / `.dictionary-scheme-modal`，保留原行34/表头36、设置tab34/搜索32、480px查看modal几何。modal使用受控原生dialog重建只读结构与焦点/关闭生命周期，不拷贝旧全局DOM桥或dangerouslySetInnerHTML。
- 实读新状态：等待、失败、重试、取消、拒权、范围失效；上一成功结果必须标明其旧搜索/页，不得当本次结果。Close/Escape/unmount/身份变化取消本地等待并拒绝迟到结果。

## 验证与仍待

运行：

```sh
node --test tests/dictionary-read.test.ts tests/dictionary-read-postgres-protocol.test.ts apps/api/src/dictionary-read-http.test.ts apps/web/src/product-settings/size-groups/http-reader.test.ts
node apps/web/src/product-settings/size-groups/tests/run-dom-tests.mjs
node apps/web/src/product-settings/size-groups/tests/run-build-check.mjs
./node_modules/.bin/tsc --noEmit -p apps/web/src/product-settings/size-groups/tsconfig.json
npm run typecheck
```

结果日志在 `verification/`。只读原生SQL的 scripted协议测试不是数据库解析/实库验收；React DOM不是浏览器布局证据。**真实现行授权、父路由/API注册、目标数据库实读，以及最终 Mac 浏览器三页逐页视觉对比尚未完成。** 已知云PG/Chromium权限拒绝，此lane没有重试或绕行。
