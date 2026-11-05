# 只读商品管理接线验收边界

2026-10-21，冻结Demo `b8bcfe3`；本记录是代码/合成协议/DOM/build证明，**不是Mac视觉通过或生产上线证明**。

## actual Application 已接线

| 实际route | 显式配置，缺失默认关闭 | 原菜单/面包屑 | 读能力 |
|---|---|---|---|
| `products` | `routes.products={stylesheet,product?}` | 商品管理 / 商品信息 | `/product-management/{query,candidates/query}`；可选独立目标Drawer |
| `product-categories` | `routes.productCategories={stylesheet}` | 商品管理 / 商品分类 | 完整原生分类树；商品计数另有独立授权，不从目录cap推出 |
| `product-settings` | `routes.productSettings={stylesheet,allowedTabs,initialTab}` | 商品管理 / 商品设置 | `allowedTabs`显式colors/groups/fits/seasons且initial必须启用；缺少的Tab仍禁用 |
| `barcode-schemes` | `routes.barcodeSchemes={stylesheet}` | 商品管理 / 条码方案 | 独立方案列表和精确schemeId只读详情 |

- 没有新增尺码组/季节/颜色/版型一级菜单；四种资料在原商品设置Tab内。颜色/版型只有显式allowedTabs才可读，所有新增/编辑/保存/删除维护仍禁用，callback自身不启用缺cap Tab。
- 配置只控制composition/presentation，不是服务端授权。服务端商品列表grant、全仓stock grant、各dictionary kind及scheme target grant仍逐次显式。
- 当前APIhost及source-confirmed-native授权profile完全未加生产注册；没有可信现行policy时不得启用生产HTTP或误称上线。
- 当前401走现有认证expire；当前新只读route的403调用route-local fail、销毁旧scope/facts并允许同菜单重试，不改变销货/调拨命令workspace/dirty/未知写回执。已取消/已替换scope的迟到401/403不影响新页/身份。
- route代码和CSS均经过lazy readiness；取消、更新导航、CSS失败不能挂载迟到旧页。dispose包含商品可选action CSS去重释放。
- `DemoFrame`原组件/交易document navigation未改，只在presentation映射既有navId。

## development-host：兼容旧配置、默认不可用

原`inventory/sales/transfers`三个必填开关保持不变，老配置和老8-key asset manifest仍受支持。
新可选项：

```ts
routes: {
  inventory: true, sales: true, transfers: true,
  products: false, // 可省略
  productCategories: false, // 可省略；不包含商品计数权限
  productSettings: false, // 或 { groups: true, seasons: true, colors: true, fits: true, initialTab: 'colors' }
  barcodeSchemes: false, // 可省略
}
```

新cap显式开启时必须有相应manifest CSS；未配/false没有导航target、module/CSS activation或业务读取。development-host不注入任何角色、服务端grant或fixture，不会自动启用生产API。未配商品target查看cap，列表“查看”继续禁用；不能借已有transfer-product能力暗自打开。

## 验证（合成/静态）

本批检查命令：

```sh
node --test apps/web/src/development-host/configuration*.test.ts
node apps/web/src/application/tests/run-management-controller-tests.mjs
node apps/web/src/application/tests/run-build-check.mjs
node apps/web/src/development-host/tests/run-build-check.mjs
node apps/web/src/application/tests/run-dom-tests.mjs
node apps/web/src/application/tests/run-sales-dom-tests.mjs
node apps/web/src/application/tests/run-transfer-dom-tests.mjs
node apps/web/src/development-host/tests/run-dom-tests.mjs
node apps/web/src/product-settings/size-groups/tests/run-dom-tests.mjs
node apps/web/src/product-settings/size-groups/tests/run-build-check.mjs
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

新controller测试：缺cap禁导航/无IO；配置clone/freeze；显式4route及4Tab；目标CSS不预取；更新导航/取消/CSS失败；action与route provider去重dispose。
既有Application、销货、调拨与development-host DOM回归均继续检查原dirty/不确定结果/身份边界，不通过改交易逻辑“修测试”。

另新增独立`apps/web/management-browser-harness/`，只在该harness受控synthetic transport里提供演示数据，实际复用Application。醒目标注非正式、不输入真实密码；不改变正式HTTP reader或生产host。其自带DOM/build检查和离线单HTML由同目录README说明。

## Mac逐页必须继续

商品信息、商品设置尺码组、商品设置季节、条码方案列表、查看方案modal、商品Drawer均分别对照冻结/已核验原Demo；不能一次截图覆盖所有页。
同viewport/deviceScaleFactor/100%缩放，补1600×1000、1100×900、900×800；含主/高级筛选、横/纵滚动、popup resize/外点/Escape、分页/空/失败/403/迟到请求/换身份。
原生字段差异见`products/README.md`及字典owner记录；源包缺runtime与真实数据的未知处保留未知，不补造。
云PG/Chromium启动明确拒绝，本批未尝试；DOM/CSS文本/bundle均不得标“视觉通过”。

## 旧管理包真实Mac FAIL：修复待复验（不得用新页通过覆盖）

旧HTML SHA `95c7790d9e498dd2967a9f4ce89f85d7b9d9945bc86cbb5ee75ad1efcb238bef`：Mac已运行旧三页/105商品/23组/季节/两方案和36项状态检查，但以下明确FAIL：

- 默认全部年份/全部季节省略：1470×724/DPR2/zoom1，160px trigger，idle selection121，token79（重复减42），label client47/scroll48。当前仅商品页闭态单token `:only-child` 取消二次reserve；有+N计数/多token及active Arco仍保持原样。active原本label48/48，合法input32×24、visible，完全不隐藏input。
- 商品Drawer、scheme详情Esc：真实查看button→关闭×→Esc→BODY，旧trigger仍connected/enabled同节点。当前先native close，再关闭commit微任务按真实click节点恢复，且scope失效/新focus/新dialog取消返回；native teardown保留已出现的外部新focus。

原生竞态shim必须只在dialog仍open时模拟close→BODY；测试真实focus查看trigger后click，再Esc及commit微任务等待。普通JSDOM无native焦点行为的旧断言不足以证明此缺陷已修。最终仍需Mac同1470×724/DPR2/zoom1复验默认标签完整、合法input正常、两个详情Esc返同节点；新分类/颜色/版型另逐页验，互不覆盖。
