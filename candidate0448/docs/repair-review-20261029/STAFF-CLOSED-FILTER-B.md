# 员工已关闭筛选：用户确认的B口径

2026-10-29 23:02 UTC用户确认：已关闭仅指已有账号但停用；无账号保留未开通，仅在全部中出现。只读筛选，不创建/关闭账号，不改权限、表结构或身份授权。

实现：保留原请求合同，在原匹配CTE中分别使用OPEN/IS TRUE、CLOSED/IS FALSE；NULL不匹配CLOSED。去除服务和adapter原待决定拒绝，保留当前ADMIN、hall、CORE出生范围，原HTTP503错误映射不作无关清理。HTTP reader能力同步true，现有前端按能力启用，无新增样式/页面。

先测后改：dot原生Node24.21.0基线API/reader/SQL协议CLOSED失败及真实HTTP-fixture503回执保留；capability=true的DOM已有实现，首轮新增断言因安全请求对象null原型而失败，改为比较完整own字段后基线通过，非业务缺陷。实现后23项API/协议/reader、9项DOM、1项Fastify→service→D1 native-read-adapter scripted PG fixture通过；全仓及runtime类型检查退出0。

证据上限：上述scripted PG不是PostgreSQL执行或真实账号验证；脚本不给任何写权限，不假造成功登录。固定产物headed浏览器与真实PG成员归属仍待后续实际回执，未测不算通过。

## 2026-10-29 23:45 UTC 追加实际回执

固定3dccea7b产物在dot前台浏览器实际通过3组限定步骤：CLOSED能力/查询触发与false-only成员；员工状态/营业厅/岗位组合；重置分页、未开通展示、OPEN/ALL及零写请求。底层仍是原HTTP→服务→D1 adapter配脚本PG，非PostgreSQL引擎验收。

另发现交互预览传输层仍保留旧CLOSED503。已先在dot原生Node复现失败，再仅加入严格false匹配并移除预览拒绝。8项预览及持久化员工基本资料EDIT回读测试通过，全仓/runtime类型检查退出0。原QA数据全为已开通，CLOSED空列表是合法结果；不伪造停用账号。此修改仅对齐合成预览，未改变生产授权或员工账号写入规则。浏览器新产物仍须重建和验证。
