# 分类同级排序与撤销：写入合同补充 v15

状态：用户已明确回复“确认 v15 分类排序与撤销方案”；仅本单精确范围获批，交原 D1/D2/F4 实施，当前尚无新增 writer、SQL 安装或拖动验收通过。原读取、单分类维护、其他页面及分批上线继续。

## 请确认的业务结果

1. 允许管理员、仓管在同一父分类内拖动真实分类到另一分类之前或之后，一次保存全部受影响兄弟的顺序。一级分类的父节点为 `NULL`，不新建“全部分类”资料；不能拖成子分类、跨父移动、改名、增删或影响商品归类。已有更深历史分类只在其原父节点下排序，不压平历史树。
2. 一次有效拖动将该父分类下**全部未删除兄弟**按最终顺序保存为 `display_order=0…N-1`，同序拖动是无变更，不制造回执。该序号是现有整数排序值，不是业务编号。搜索只改变显示，提交仍须含完整真实兄弟集合，不能只排序筛选结果。
3. 有实际排序值变化的分类，`version` 各增 1；未变化行不空增版本。任一兄弟集合、版本或归属发生变化，整次拒绝，重新读取后再操作；不覆盖另一人的修改，也不部分成功。
4. 保持 Demo 的“撤销排序”入口，只提供最近一次成功排序的一次撤销，不新增重做或撤销栈。撤销恢复服务端不可变审计中记录的**原始排序整数**，包括原有重复值、负数和间隔；不使用浏览器任意传入的旧值。撤销仍是新事务，实际变化行再增 1，原记录和原审计不删除、不降版本。
5. 撤销必须由原排序账号在当前仍有管理员/仓管权限时请求。原兄弟集合及其每行版本/顺序须仍等于该次排序的成功后态；之后改名、增删、移动、再排序等使其不一致，撤销整项冲突。已成功撤销用原请求键重放返回同一结果；换键再撤销同一排序因版本已变而拒绝。界面仅保存最近一次的操作引用，不能用旧快照覆盖新状态。
6. 同一个请求键保持现有幂等规则：同账号、同完整动作与内容只提交一次；同键改内容拒绝。网络中断或提交结果未知时查询原回执，不能自动换键重做。成功后按真实返回结果及原完整分类树重读刷新，不能只调浏览器本地顺序显示保存成功。

**需要批准的是以上批量写入/撤销语义、下面两个新动作及其审计回执闭包。没有新增数据库列，但这不是旧单目标 EDIT 已批准的同一写入合同。**

## 现有事实与 Demo 对照

- `product_category` 已有 `id uuid PK`、`parent_id uuid NULL FK product_category(id)`、`name text NOT NULL`、`display_order integer NOT NULL`、`version integer >0`，后继已加 `deleted_at timestamptz NULL`。本候选不改类型、NULL/default、ID、名称、父子 FK、商品 category FK 或删除语义。
- 原 `W6-CATALOGUE-API-v1.json` 明确 CATEGORY 只有 CREATE/EDIT/DELETE，并明确多兄弟原子排序/撤销未交付。原 adapter `load` 明确只锁一个根，原 evidence 只允许一个 actor/key/family 和一次 audit/receipt。
- 冻结 Demo `frontend/product-arco.jsx:223–227` 只准相同 parent 且 `dropPosition!=0` 的前后排序。`frontend/product-current.js:290` 保存完整同级列表，演示态赋 0…N-1，并提示可撤销最近一次；`:267` 的撤销使用先前列表。实际模式调用旧 `LEGACY_REAL.changeProductMaster(...,'order',{ids})`，不能当作新工程已存在该接口。
- F4 `P14-NATIVE-CATEGORY-01/DELIVERY.json` 保留 `draggable=false` 是正确边界；当前 UI 方向没有自动批准本候选。

## 拟沿用的接口与新增闭合动作

继续原 `POST /api/catalogue/categories/commands`，不新开 endpoint；原颜色/版型及原三个分类动作不变。角色由原可信会话和同事务当前身份校验，营业员拒绝；不接收客户端 actor、role 或权限字段。

```json
{
  "action": "REORDER",
  "requestKey": "原格式新请求键",
  "parentId": null,
  "movedId": "真实分类UUID",
  "expectedSiblings": [
    {"id": "真实分类UUID", "expectedVersion": 7}
  ],
  "orderedIds": ["同一完整兄弟集合按最终顺序排列的UUID"]
}
```

以上为字段示意，不是可执行样例。`expectedSiblings` 必须为当前全部未删除兄弟，按原 `display_order,id` 顺序、各 ID 唯一，`orderedIds` 必须是同一集合的排列。除 `movedId` 的位置变化外，其他节点相对次序必须保持，不能借一次拖动提交任意换序。父节点和所有版本均在服务端实际锁定后核对，不信任客户端排序数值。

```json
{
  "action": "UNDO_REORDER",
  "requestKey": "另一个原格式新请求键",
  "originalOperationId": "本账号原成功REORDER操作UUID",
  "expectedSiblings": [
    {"id": "真实分类UUID", "expectedVersion": 8}
  ]
}
```

撤销的 parent、原值、锚点和完整前后集合从原成功 receipt/audit 取得；客户端不提交要恢复的整数，不允许引用普通 EDIT 或其他账号的操作。当前完整集合/版本同时核对原排序后态，任何变化都返回冲突。

新两个动作返回同一窄扩展，旧动作仍严格原 4 字段结果：

```text
{operationId,kind:'CATEGORY',targetId,version,
 order:{parentId,undoOfOperationId:null|UUID,
        members:[{id,version,displayOrder}]}}
```

`members` 是本次成功后完整兄弟列表，保留真实版本。`targetId/version` 是服务端选择的一个实际变化分类锚点及其新版本；选择按变化 ID 的稳定顺序固定，不能选未变化节点伪造根写入。撤销沿用原锚点。原 `GET /api/catalogue/categories/receipts/:requestKey` 对新动作返回同一结果和原 requestKey/action/status/completedAt，用于不确定结果恢复。

新增参数错误沿原 400；未登录 401、当前无权 403；原分类或原操作不存在 404；版本/集合/同键异内容/无变化/不可撤销 409；体积超限 413；实际失败 500 脱敏且保留原键恢复。具体新增业务错误仅 `CATEGORY_ORDER_CONFLICT`、`CATEGORY_UNDO_CONFLICT`；不借错误返回未授权分类名单。

继续复用原分类树技术上限 5000，不增加业务条数限制或截断。现 commands 的 8192B 无法容纳完整大兄弟集合，拟仅分类 commands 提升到现商品维护已有的 1MiB 级 body 上限，并核完整请求实字节；颜色/版型保留 8192B。超限明确拒绝，不能拆成多次 EDIT。读取仍原 `POST /api/catalogue-settings-read/categories/query` 完整树合同，不引入第二份树数据。原审计 16MiB/深度16/500000项限制不放宽；完整候选按原限制核实，超限明确拒绝。

## 事务、CAS 与不可变证据

1. 复用原 `naijue:catalogue-maintenance` advisory transaction lock 和原受控池/事务；按实际 UUID 稳定顺序锁全部兄弟，原父节点必要时锁定。原所有单目标分类写入也使用该目录锁，不能并行插入兄弟后蒙混通过。原 request-key 锁顺序、当前身份锁顺序由 D1 在同一现有 driver 内统一，不能另外建池或嵌套事务。
2. 原回执重放检查在修改前完成，仍重核当前权限。无原成功回执时才核完整成员/版本及实际 parent/deleted 状态，计算新的整数顺序或原审计的撤销值。任一版本耗尽、成员缺失、跨父、已删除、无变更均零写拒绝。
3. 一次请求用**一个 operationId、一个类别 CATEGORY 的不可变聚合 audit、一个成功 receipt、一次 COMMIT**。锚点根审计 old_version/new_version 保持原 `+1`；`before_values/after_values` 保留其真实稀疏根差异，并增加闭合 `category_order` 元数据：`{parent_id,moved_id,undo_of_operation_id,rows:[{id,version,display_order}]}`。rows 包含完整兄弟前态/后态，包含未变化行以证明成员闭包；不记录伪造全局树版本。
4. 原 `prepare` 在任何分类更新前插入该唯一审计；只对实际变化行 CAS 更新 `display_order` 和 `version`。name、parent_id、deleted_at、商品引用保持原值，未变化行不更新。原 `complete` 使用同一审计内容写唯一新动作回执；扩展 result 与审计后态逐项一致。
5. D1 在现有延迟数据库约束加**仅 CATEGORY 新动作**的准确分支：每个变化兄弟必须匹配同事务唯一锚点审计及其 rows 中的实际 OLD/NEW，版本各只增 1；提交时完整成员集合及其最终数值必须等于后态，未知额外写入、少写/漏写、修改名称/父级或孤立 receipt/audit 均不能提交。不能仅给锚点一张审计、让其他分类绕过当前根触发器。
6. Undo 另有新的 operation/audit/receipt，`undo_of_operation_id` 指原 REORDER；原 receipt/audit 保持不可变。数据库与服务端共同验证原操作属于当前账号、CATEGORY/REORDER、前后成员同一父级、当前等于原后态，恢复值等于原前态；不能把任意审计 JSON 当可执行恢复脚本。
7. 任一已知失败整事务回滚，原未知 COMMIT 分支丢弃连接并通过原键恢复；不发送后续自动回滚/重试或把部分行写成功。实际未知提交后的确认沿原 owner 工具与证据方式完成，不新建发布/恢复平台。

## 数据库对象差异与原 owner

**0 新表、0 新列、0 新枚举、0 新索引、0 新业务 FK；不是 0 数据库行为差异。**

- D1 新增一个有界后继补丁候选 `adapters/postgres/patches/0026-category-reorder-undo.sql`，正式 profile/顺序由 C/D1 登记，不修改旧迁移 0001/0021/0022 原件，不直接在本候选执行 SQL。
- `maintenance_action_allowed` 仅为 CATEGORY 增加 REORDER、UNDO_REORDER；现有 action CHECK 通过它生效，其他 family 不扩权。`receipt_result_by_kind` 仅新两个动作允许上面的闭合 order 扩展，旧动作严格原 4 键不变。
- 复用 `maintenance_audit_actor` 当前角色校验、`product_category_maintenance_final_consistency` 和 `maintenance_receipt_final_consistency` 触发器；对其 `validate_maintenance_root_commit`、`validate_maintenance_receipt_commit` 新增窄 CATEGORY 排序分支，必要一个内部 `maintenance_check_category_order` helper。不关闭/删除旧触发器，不改变审计双向 FK、operation 唯一性或历史证据。
- 新函数体/完整目录若改变，由 D1 更新现有精确 runtime catalog/ACL/profile 绑定并保全旧版本，不能只因 schema migration MAX 未变而当新能力可用；没有这个准确 profile 的旧 host 拒绝新动作，不回退成多次 EDIT。不新增普通写权限或通用 SQL lease；若现有限 statement 范围需新增，只登记本批精确查询。

请求 C 登记的实现清单（确认后才写）：

- D2 原叶：`packages/application/src/catalogue-maintenance-ports.ts`、`catalogue-maintenance-validation.ts`、`catalogue-maintenance-service.ts`、`adapters/postgres/src/catalogue-maintenance-store.ts`、`apps/api/src/catalogue-maintenance-http.ts` 及原直接测试。原单根 `load/put` 保持，新增受限同级批量方法，不能把其限制悄悄取消用于其他 family。
- D1 公共叶：`packages/application/src/maintenance-commit-ports.ts`、`adapters/postgres/src/maintenance-command-unit-of-work.ts`、上述新补丁、`adapters/postgres/src/native-import-accounting-capability.ts`；必要宿主 profile 装配由其原 owner 登记。只增加准确 CATEGORY 聚合证据支持，不泛化整个事务平台。
- F4 独占 UI 消费：`apps/web/src/product-categories/category-tree.tsx`、`product-categories-page.tsx`、`apps/web/src/product-settings/catalogue-maintenance-http-client.ts`、原 `catalogue-maintenance-state.ts` 及必要原 contracts/tests。若后两公共文件当前另有 owner，C 先登记唯一接线 owner。D2 不修改这些文件。
- C 最终维护 R/docs 确认单、批准记录、精确文件 owner 和候选版本；真实 SQL、PG、构建、受控部署仍 C 唯一执行。

## 必要一次验证与交付界线

只验证新动作及受影响接缝：同父拖动/根层 NULL、完整兄弟与空搜索视图、防跨父/缺成员/重复 ID、并发 CAS 全回滚、幂等同键/异内容/未知响应回执恢复、唯一聚合证据缺行拒绝、撤销恢复旧负值/重复排序数而保版本递增、撤销后态冲突与二次拒绝、管理员/仓管与营业员拒绝。原有效读取、CREATE/EDIT/DELETE 仅补实际受影响检查，不重跑全 settings/49/旧套。

正式入口只有在准确新 profile、事务/触发器及原前端严格新动作接线成对就绪后才启用拖动/撤销。源码/合成检查不等于真实 PG、角色、浏览器或整页验收通过。备份、回退和提交后恢复仍沿原 C 流程，不用旧代码自动回写已成功排序的数据。

**建议用户一次确认：采用本单的同父原子重排、0…N-1 排序、完整兄弟 CAS、防覆盖一次撤销，以及 0 新表列但新增 CATEGORY 两动作/聚合审计回执/准确 SQL 约束分支。** 未确认仅此写分支等待，原只读与其他已批模块继续。
