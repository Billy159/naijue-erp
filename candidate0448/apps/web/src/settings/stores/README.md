# 营业厅与仓库：只读独立模块交接（WIP，不是上线完成）

2026-10-21 checkpoint。用户已要求把余项移交本地 Codex；本模块停止继续扩展。

## 已有源码

- `StoresPage` / `WarehousesPage`：同标题两 Tab、名称/状态查询（默认正常）、仓库所属厅筛选位置、最终 Demo 表格、20/50/100 分页、520px 只读详情 modal。新增/编辑/操作记录明确 disabled；使用状态只展示，不假保存。
- `createStoreSettingsHttpReader`：真实同源 session 读取，不发送浏览器身份/角色作为授权；没有 fixture/candidate/importer 回退。
- `StoreSettingsReadController`：独立子 scope；列表/详情目标/厅目录 LatestQuery，取消/迟到结果抑制；当前 401/403 先清所有私有结果再通知宿主；身份变更/卸载清理；不销毁宿主 scope。
- 独立 application ports/service/strict validation、`PostgresStoreSettingsReadReader`、`createStoreSettingsReadHttpPlugin`。只提供 POST 查询，不开放维护命令或迁移。

## Demo 证据边界

冻结包 `/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3` 的 `LOAD_ORDER.md` 确认最终设置入口由 `basic-settings-v2.jsx` 接管，而非早期 `app.js` / `basic-settings.js`。

- 最终 JSX:19–26、49–67、146–196：标题“营业厅与仓库”，营业厅/仓库两个 Tab；状态默认正常。
- JSX:171–175：营业厅列为**名称 / 默认零售客户 / 默认出库仓 / 状态100px / 操作76px**；仓库列为**仓库名称 / 所属营业厅 / 状态100px / 操作76px**。最终行操作仅“编辑”；停用/恢复在编辑 modal 的状态开关，不是独立行按钮。
- JSX:73–101：名称、默认零售客户、默认出库仓或所属营业厅、编辑使用状态；`basic-settings-v2.css` 定义 520px modal、Tab gap20、工具栏8px、搜索max440/选择178(min128)、底部 pager。
- `inventory-workbench.css` 的表格/输入/Modal adapters 与统一单选外观已局部迁移到 `source-store-settings.css`，无 body/app/sidebar 全局规则。

这是**按冻结源码移植布局的 WIP**，没有浏览器截图逐页视觉通过证据。DOM 结构/可访问性也尚未运行验证。新增说明文案、名称点击查看、只读原生 dialog 与原可编辑 Arco Modal 存在已知交互差异。

## 宿主接线（尚未做）

1. 本地前端负责 route/registry/config/frame/懒加载样式接入；本 checkpoint 未修改 shared Application 这些文件。
2. 挂载前显式加载 `style-entry.css`（含 Arco 基础样式和既有 tokens/controls），离开后由宿主清除；不能只加载局部 CSS 就宣称视觉正确。
3. 创建 `ReadContext` 的当前 scope，注入 `scope` / `reader` / `onAccessFailure`。可选 `onTab` + `allowedTabs` 只代表已实现导航，不是服务端授权。
4. `allowHallDirectoryRead` 未提供时，仓库所属厅筛选保持原位置但禁用；若为 true，用户打开/搜索/翻页时单独请求 **stores/list**（status=all），服务端仍必须新鲜授权。响应只当分页目录显示，不冒充全量。不能用交易候选替换此能力。
5. 本地后端负责显式 register HTTP plugin、真实 session/Origin callback、trusted directory policy、受限 pg pool/timeouts；没有任何默认开放或内置角色推断。

## 服务端授权与数据事实合同

每次 list/detail 必须返回严格对象：

```ts
{ kind: 'stores' | 'warehouses', operation: 'list' | 'detail',
  scope: { kind: 'ALL' } | { kind: 'HALL_IDS', hallIds: string[] },
  references: 'NONE' | 'REFERENCES', targetId: null | exactRequestedId }
```

- list 的 targetId 必须为 null；detail 必须精确等于请求原生 UUID。没有 scope 就不进入 reader。
- HALL_IDS 对厅用 `hall.id`，对仓用 `warehouse.hall_id` 过滤；空数组不代表 ALL。
- REFERENCES 是宿主**另行明确授权**读取本次可见记录的实际 FK 对象名称，包括已停用引用/真实跨厅默认仓；不允许枚举客户/仓/厅目录。NONE 不 JOIN 目标表，名字返回 null。不得从交易候选权限推导此 grant。
- 厅默认客户来自 `hall.default_customer_id -> customer.id`；默认出库仓来自 `hall.default_sales_warehouse_id -> warehouse.id`；仓所属厅来自 `warehouse.hall_id -> hall.id`。名字从不反推 ID，也不假设默认仓属于该厅。
- 无引用（FK 为 NULL）显示“未配置”；有 FK 但名字 null 显示“名称未提供”。native ID 保留用于详情，不造默认客户/默认仓。
- hall/warehouse 没有创建/更新时间列，DTO 固定 null；不能借导入审核时间填补。仓库存事实固定 null，没有读取库存，也不能据此判定可停用。
- 列表 count/page 在同一 REPEATABLE READ READ ONLY 快照，参数化范围/状态/名称字面子串，稳定 name COLLATE C + id 排序；页码不静默夹紧。detail 独立新授权新快照，绝不拿列表 clone 假详情。
- AbortSignal 只在 SQL 阶段之间阻断/抑制结果，**不能取消已在运行的 pg 获取/SQL**；宿主必须设置 pool/acquire/statement/lock 超时。commit不确定或rollback失败丢弃连接，不自动重试。

HTTP 路径：

```
POST /store-settings-read/stores/query
POST /store-settings-read/warehouses/query
POST /store-settings-read/stores/detail/query
POST /store-settings-read/warehouses/detail/query
```

list body 严格为 `{search,status,hallId,page,pageSize}`，营业厅 hallId 必须 null；detail body 严格为 `{id}`。只允许 JSON，无 URL query 参数。无写路由、无 listener、no-store。

## 验证与待移交

已跑 synthetic service + scripted pg protocol + Fastify inject + Fetch + lifecycle 共24测试全部通过；真实 PG/SQL解析/浏览器视觉不在此证据范围。首次 PG测试被 Node strip-only 不支持 TS parameter properties 阻塞，已改为显式字段初始化并重跑通过。

完整/模块 typecheck 的最终结果记录在 `verification/` 与父任务交接消息中。尚未跑：DOM/键盘/focus/Arco popup 行为、esbuild生产 bundle、真实 PostgreSQL、Mac 浏览器冻结 Demo逐页截图、实际宿主路由/API/授权集成、安全独立复核、完整回归。

下一步由本地 Codex 前端/后端/主控分工完成上述接入与验证。维护能力另开显式命令合同（版本、幂等、授权、原生FK、停用库存完整性/引用限制、审计、失败回执），不得通过 importer 或本只读模块补假保存。
