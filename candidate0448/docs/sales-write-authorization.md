# 销货动作授权：本轮边界

## 已确认动作规则

营业员可以保存、作废本厅未审核销货单，只能审核本人账号创建的单，不能弃审。管理员、仓管可跨厅操作。

本轮把这条规则实现为独立的动作策略，而不是绕过原有业务守卫：

- `SALESPERSON`：所有动作首先要求单据厅等于当前员工厅；当前厅不得为空。`SAVE`、`VOID` 不以创建者过滤；`APPROVE` 只认服务从已加载单据读到的 `createdByAccountId`，不认选中的业务员，也不认请求拟写的创建字段；`UNAPPROVE` 拒绝。
- `ADMIN`、`WAREHOUSE`：动作策略不限制单据厅或创建者，但当前身份仍须有效。员工当前厅为空时，认证 actor 也必须确为 `null`；非空时要求真实、启用且与认证 actor 完全一致。
- 不认识的角色、账号停用、员工非精确“在职”、身份不存在、账号不匹配、认证厅过时或非空厅不存在/停用，均不能获得动作授权。

状态守卫仍由原服务负责：只有草稿可编辑、作废或审核；只有已审核单据可弃审。审核的精确收退配平、引用/经济规则、版本 CAS、库存覆盖和过账来源检查、历史基线分支阻断全部保留。

动作策略本身不统一要求 `DRAFT`。原键重试与 GET 原回执按当前单据重新授权后返回原结果；例如原 `SAVE` 回执必须能在单据后来已审核时恢复。恢复不会重执行该动作或变更库存。

## 应用端口与四处接线

`packages/application/src/sales-authorization.ts` 提供：

- `assertSalesActionAllowed`：仅使用显式身份事实、认证 actor、动作及可信服务传来的单据范围，执行纯动作矩阵。
- `createSalesActionAuthorization`：显式启用上述动作策略。必须收到第四参数的原 `SalesTransaction`，无事务即拒绝；没有默认管理员或另开连接的回退。

`SalesAuthorization.assertAllowed` 的第四个事务参数仅为兼容已有显式测试 provider 保持可选。服务和 HTTP 始终传入自己的事务：

1. 命令原键重试，查到原回执后加载当前目标再授权。
2. 普通命令加载原单；新 `SAVE` 则授权拟写目标。
3. 已存在单据的 `SAVE` 另行授权拟写范围，不能因能操作旧厅而搬进未授权新厅或引用范围。
4. HTTP GET 原回执，在查到 actor/key 与当前目标的同一事务里授权。

原键 fingerprint 继续只绑定稳定账号身份及业务命令，不把可变的当前厅放进 hash。当前厅仍在上述每次动作/回执授权中重新核对。HTTP 不从请求体接收角色、actor 或创建者。

## PostgreSQL 事务内身份事实

`SalesTransaction.getCurrentSalesIdentity(accountId)` 只提供非秘密的账号 ID、员工 ID、账号是否启用、角色、在职状态、当前厅与厅是否有效。不读取密码、会话、令牌或其他凭证，也不代替会话认证。

PostgreSQL 实现沿用原命令 `READ COMMITTED` 事务和原连接：

1. 先绑定原回执账号/键以及唯一的销货目标；未绑定、换账号或事务关闭时拒绝身份查找。
2. 定向 `user_account JOIN staff`，`WHERE a.id = $1::uuid FOR SHARE OF a, s`。这两个锁保持至本命令提交/回滚，身份修改不得在授权检查与写入之间穿透。
3. 当前厅非空时，再单独查询 `hall WHERE id = $1::uuid FOR SHARE`。不对 nullable outer join 一侧加锁；独立 READ COMMITTED 语句避免等待账号/员工锁之前的旧厅快照。空厅不查假造的厅行。
4. 只在该事务内部缓存同一个绑定账号的身份事实。缓存命中前和异步查询返回后都检查 active/scope；没有跨请求缓存、第二个池连接或独立只读快照。

这里是源码与脚本化 pg 协议证据，不是真实 PostgreSQL 对锁、隔离、等待或并发语义的运行验收。本轮没有启动、连接或运行 PostgreSQL。

## 创建事实的小型适配器防御

服务创建新单时继续用认证 actor 覆盖 `createdByAccountId`、`createdHallId`，并由服务时钟写 `createdAt`；更新继续保留旧值。

PostgreSQL UoW 另行保存已加载头部的 creator/creating-hall/creation-time 字符串快照，写入时要求完全不变，防止调用者修改返回对象的别名后篡改创建事实。新插入的 creator 必须等于本事务原回执 actor。该防御没有新增迁移、触发器或数据库级不可变约束，不能描述成任意直连 SQL 都无法修改这些字段。

合成 store 仅供测试，可以显式 `seedIdentity`。未 seed 的账号返回 `undefined`；绝不默认管理员。合成序列化不是真实数据库隔离证据。

## 尚未完成与禁止扩大结论

这份 factory 只是已确认的角色/厅/创建者动作授权，不是整套生产写授权 provider。正式装配仍须明确组合可信的仓库、客户、付款账户等引用有效性/可选范围策略，以及商品价格与经济事实 provider。没有客户-厅原生关系时，本轮不臆造这种关系。

本轮不修改原拟写范围检查，不使用现有只读授权代替写授权，不注册或启用生产销货写插件，不改调拨权限、迁移或字段合同，不测试生产。原有历史编辑功能仍为待独立基线感知实现的阻断分支，不能宣称历史永久只读或完整 ERP 已完成。

## 限定验证

定向检查运行：

`node --test tests/sales*.test.ts tests/postgres-protocol.test.ts apps/api/src/sales-http.test.ts`

覆盖动作矩阵、本人真实创建/他人业务员字段、跨厅角色、当前身份撤权/离职/厅变更、拟写范围、状态/库存/配平等既有回归、四处事务传递、原 SAVE 回执在后来已审核时恢复、事务缓存不跨请求、关闭及未完成异步 lookup、失败回滚/连接释放、创建字段写入防御。测试使用合成数据和预脚本 pg client，未运行真实 PG。整仓严格 TypeScript 检查另行执行；最终结果及日志哈希由集成证据记录。
