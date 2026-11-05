# 合成 NEW 调拨浏览器验收页（非正式、无数据库）

这是 **真实浏览器运行实际应用组件 + 显式合成内存接口**，不是实际网络、
PostgreSQL、真实账号、库存或正式部署验收。不连接任何外部 API；所有业务
Fetch 由 `main.tsx` 明确拦截。内存里的“保存成功”仅模拟接口响应，不代表后端
或真实业务成功。刷新会丢失全部合成记录。没有真实用户数据。

## 构建与打开

在仓库根目录：

```sh
node apps/web/new-document-browser-harness/build.mjs
node --test apps/web/new-document-browser-harness/inline-assets.test.mjs
node_modules/.bin/tsc -p apps/web/new-document-browser-harness/tsconfig.json
```

直接用云端 Chrome 打开：

```
file:///workspace/scratch/f6bee04e937b/erp-current/apps/web/new-document-browser-harness/dist/synthetic-new-transfer.html
```

单文件内嵌 JS/CSS，无需启动服务器。`dist/index.html` + 同目录资源也保留为
可选静态多文件构建。生成物在本目录 `.gitignore`，源码可复建；没有上传。
本包内嵌既有样式，不作为 lazy CSS / 网络性能证明。

## 正常用户点击路径

1. 点顶部 **模拟授权／权限失败后重新授权**（无需输入任何账号密码）。
2. 点 **打开调拨单列表** 或实际应用左侧 **调拨单列表**。
3. 列表内点 **新增调拨单**，分别选择“合成仓库 20”和“合成仓库 21”。
4. **添加商品规格** → 合成衬衫 → `165/S` 或 `170/M`，关闭候选。
5. 输入有效日期、正整数数量、可选备注。点 **校验草稿** 或 **保存**。
6. 保存先走实际 preparation client，再走实际 native SAVE client / workspace；
   模拟响应确认后展示既有 native command editor。日志明确标为页面内存保存。
7. 点 **返回列表**；列表显示旧结果提示时点 **刷新当前列表范围**。
8. 再新增应为空白草稿。也可保存后用顶部 **返回应用首页**、再进列表、新增，
   检查不会把上次已保存单据冒充新增。
9. 有未保存输入时顶部“返回应用首页”应被应用导航守卫拦截。取消新增/重置
   要先确认放弃；确认后可离页。

## 故障与恢复

- 顶部选择 **候选403**，打开任意候选；或选 **准备403**，已有完整草稿点保存。
  应触发现有应用权限失败/身份清理路径，不发送 SAVE。再点 **模拟授权**
  会清除故障选项并建立新的可操作应用会话。
- **准备服务503**：保存显示准备失败，输入仍保留；恢复“正常合成响应”可重试。
- 勾选 **准备延迟5秒**：保存后改备注、改数量、重置或取消准备；5秒后的旧响应
  不能把过时草稿保存。此模拟故意忽略 abort 来验证前端序列保护。
- **保存后丢响应**：合成服务在页面内存保存后丢失响应；既有 workspace 必须进入
  “结果不确定”，不得重复新增。点 **核实原操作回执** 可取回同一操作结果。
  此情形是明确模拟，不是数据库或实际网络断线证明。

仅模拟 **新建 SAVE**；编辑已有单据、审核/弃审/作废返回明确合成拒绝，不能
用于验收库存效果。销售 SALE 草稿另有模型/DOM测试，但其最低价/完整价格目录
与可信创建准备尚不完备，不在此页宣称销售业务闭环。

单文件内联构建使用替换回调保留 bundle 中的 `$&` / `$\'` / `$` 等替换元字符，
并转义 script/style 闭合片段。上述测试重建并实际解析 HTML DOM，检查唯一
完整脚本、无外部脚本依赖、页面正文没有压缩 JS 泄漏；不代替真实浏览器点击验收。

## Independent SALE browser harness

`node apps/web/new-document-browser-harness/build-sales.mjs` creates
`dist/synthetic-new-sale.html`, without rewriting transfer outputs. Open it under
the same static server or directly as a self-contained file. It uses the actual
Application sales route, native prepare client and command workspace with an
explicit page-memory synthetic transport: **no PG, real proof, real authentication
or production network**, and no evidence of backend end-to-end integration.

Click 模拟授权 → 打开销货单列表 → 新增销货单. Choose the synthetic hall/customer/
warehouse/SKU; date `2026-10-21`, quantity `1`, price `39.90`; add the synthetic
cash account with receive amount `39.90`. Set 缺九价proof, Save, verify refusal;
set 正常合成响应 and explicitly retry. Alternatively select 保存后丢响应 before
Save and click 核实原操作回执 (same operation). Back → New must be blank. Failure
modes also cover candidate403, prepare403, unavailable service and 5s late prepare.
Refresh discards all synthetic documents and receipts. The transfer page remains
available via the separate link.

Checks:
- `node --test apps/web/new-document-browser-harness/sales-browser.test.mjs`
- `./node_modules/.bin/tsc -p apps/web/new-document-browser-harness/tsconfig.sales.json`
