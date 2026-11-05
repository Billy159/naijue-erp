# 统一实际 Application 合成验收入口

工作源码新增显式验收配置（尚需新固定构建与浏览器验证）：默认 `standard` 保持原交易配置；`transfer-readonly` 仅让调拨使用原有不含 commands 的只读宿主，并提供40/83/2000条实际明细、200个规范尺码的合成夹具。重复的是 SKU，每条 `line.id` 独立。配置不是后端角色授权，不能移到真实宿主作权限开关或合成回退。

验收调试栏的新配置选择器与切换按钮使用共享真实 Arco 控件。根数量准确为最多一个业务 `Application` React 根，另有一个验收工具栏 React 根；切换先遵守现有 dirty/uncertain 导航保护，成功后销毁旧业务根及合成身份，再在同一容器创建未认证的新应用，需明确重新进入。没有两个业务应用并存、iframe或链接目录。revoke/dispose可中断在途切换，不能由忙碌锁忽略。

**合成演示数据 / 非正式 / 不输入真实密码。** 此文件是离线受控验收，不是正式上线，不产生真实业务、数据库写入或网络请求。

打开 `dist/synthetic-unified.html`，首次只点“进入验收版”。在每个已进入的合成配置会话内，同一 `createApplication`、同一认证/controller/session、同一左侧 DemoFrame 菜单，到达库存、销货、调拨、客户、供应商、商品信息、商品分类、商品设置、条码方案、营业厅与仓库十个 route。商品设置为颜色/尺码组/版型/季节四个只读 Tab；营业厅与仓库为两个现有清单 Tab。未接页面保留明确禁用，不用 iframe/链接拼接多个应用。十路由是装配范围，不是35页面/页签与65弹层的验收通过数。

调试工具默认折叠在右下角；常驻小型合成标识不占业务 viewport 的文档流高度。正式认证组件没有改成假登录：仅这个合成 host 隐藏并禁用真实密码表单，调用显式合成会话，绝不调用登录或密码接口。不可在此输入任何真实数据。

## 保留与限制
- 正式业务源码、真实HTTP reader和DTO验证均参与打包；仅注入封闭页面内存transport。真实API host、policy、数据库、部署仍未接，不增加任何默认生产grant。
- 直接复用 management synthetic transport；库存复用既有有限完整fixture，HTTP边界可逆映射fixture身份为native UUID，不复制矩阵数据。商品null、未知总库存、分类null计数原样保留。
- 销货/调拨原 manualCreate → 候选 → 原生准备 → 新增 `SAVE(expectedVersion:null)` → 内存回执原协议保留，使用既有价格/折扣领域函数。dirty导航守卫、SAVE后丢响应uncertain、原回执核验均由实际组件处理。仅内存新增草稿；编辑/审核/反审核/作废/库存过账被拒绝，不能当正式写端到端证明。
- 销货/调拨查询各包含1条独立CUTOFF_HISTORY合成只读示例，便于实际列表→详情对比；不进入SAVE map或计数，不改变新单RUNTIME_LEDGER。首次列表仍按原行为等待显式“查询”。
- 调拨商品target查看能力未配置，其详情商品查看按钮原生disabled；不能把库存/商品信息Drawer通过扩大成调拨target通过。
- 客户/供应商在本host显式只读，新增/编辑原生禁用。transport不允许任何party写入。库存流水onOpenCell未配置，合法原生disabled；非假成功占位。
- 营业厅/仓库使用原有四个 `/store-settings-read/{stores|warehouses}/{query|detail/query}` POST只读合同；本host提供显式合成目录，正常/停用/搜索/分页及所属厅目录独立读取。新增、编辑、停用、恢复、操作记录均未接入；详情缺失时间、关联名称及库存检查原样保留，不能据此判定可维护。真实development host只调用注入的同源fetch，不导入此合成transport，也不把allowHallDirectoryRead界面意图当服务器grant。
- CSP `connect-src 'none'`；origin/path/method严格白名单；不允许真实fetch回退、账号登录/改密、外部媒体或storage。故障日志只保留method和固定path，绝不记录body或凭据。

## 构建与验证
仓库根目录执行，使用已有锁定依赖，不启动browser/server/PG：
```
./node_modules/.bin/tsc --noEmit -p apps/web/unified-browser-harness/tsconfig.json
node --test apps/web/unified-browser-harness/synthetic-transport.test.ts apps/web/unified-browser-harness/build.test.mjs
node apps/web/unified-browser-harness/run-application-dom-tests.mjs
node apps/web/unified-browser-harness/run-store-settings-dom-tests.mjs
node apps/web/unified-browser-harness/build.mjs
sha256sum apps/web/unified-browser-harness/dist/synthetic-unified.html
```
`provenance.json`记录实际working-tree输入sha256与锁文件，不把当前Git HEAD谎称为实际源码版本。此child不上传/发布；父任务按实际依赖清单收集独立源码快照与中文交接包。

## 视觉验收状态
冻结基线 `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`。DOM/编译通过不等于视觉通过；没有在云启动Chromium、数据库或监听服务。旧管理v1 Mac实测FAIL（年份/季节“全部”截断、商品Drawer与方案详情Esc焦点落BODY）保留为“源码修复待Mac复验”，统一版必须实测复验，不得覆盖为通过。参见 `MAC_CHECKLIST.md`。

本机后续证据独立记录于控制目录reports/frontend：v2.1已实际复验默认标签与标准Arco输入，v3.2商品Drawer/方案Modal关闭、焦点和Tab循环在Chrome DPR1及主控IAB DPR1.22限定范围通过；旧Mac DPR2完整条件未复现，全站视觉PASS仍0。v4继续营业厅/仓库只读接入，不改写旧失败证据。剩余原生dialog、完整页面、写能力和线上源码绑定另列。

## 本地修复与范围

2026-10-22 本地 P1-SALES-NEW-REENTRY：原严格脚本在实际 Application 路径先退出1，确认保存回执后跨模块直接NEW错误地保留原CREATE编辑器。修复销售页host对已确认提交的视图分类，并为明确的新建动作重新挂载新建host。dirty和uncertain仍保留原草稿/原请求，不自动清理。

原严格命令已转为通过的回归，保留原症状断言：
```
node apps/web/unified-browser-harness/run-known-sales-new-reentry-regression.mjs
UNIFIED_ASSERT_SAME_ROUTE_NEW=1 node apps/web/unified-browser-harness/run-known-sales-new-reentry-regression.mjs
node apps/web/unified-browser-harness/run-application-dom-tests.mjs
```
同路径跨模块重入、同页NEW、明确返回列表、销货/调拨dirty与uncertain保持、调拨跨模块空白下张均有独立断言。前端类型检查通过。实际浏览器及逐项验收继续按本地版本证据记录，不能用此DOM通过声称全站通过。冻结review-v0及其已知FAIL不改写。

## 当前标准控件批次 v6

本机运行源码中的原生input/select/textarea/button JSX和原生dialog已迁入真实Arco组件；这不等于所有领域自绘候选层都已转换。商品Drawer、商品设置和营业厅/仓库现共用StandardTabs（实际Arco Tabs/TabPane），统一roving Tab、方向键/Home/End、禁用项和lazy切换后的焦点恢复；每个业务owner仍独立取消旧读取。原生DOM为Arco内部实现时不误报。认证改密只有合成DOM测试、无真实凭据。完整35页面/页签+65弹层和真实API/PG/TLS验收仍未完成，visual PASS=0；对应固定版本浏览器结果见控制目录reports/frontend，不把当前构建的NOT_RUN自动升级。
