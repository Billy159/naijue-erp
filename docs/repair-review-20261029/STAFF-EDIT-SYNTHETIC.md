# 员工编辑：权限与测试桥边界

用户截图 b7 的读列表正常，但该候选只开启 routes.staffSettings，未开启显式 routes.maintenance.staffSettings，测试桥也拒绝所有业务写入。正式编辑入口/controller/HTTP/service已存在，不得为预览放宽ADMIN或服务权限。

- 只读状态现在解释“员工维护未启用或当前账号无维护权限”，按钮仍禁用。
- 测试专用 `--staff-edit` 显式选择有限合成姓名/联系方式维护；未传参数仍只读。
- 使用真正 StaffMaintenance HTTP plugin/service：业务校验、expectedVersion、requestHash及receipt均由原service负责；fixture只提供串行copy-on-write存储/审计/回执端口。
- 仅 EDIT + account:null；角色、营业厅、雇佣状态、账号、密码变更全部拒绝。无真实凭据、DB或监听端口。列表/详情来自同一保存状态。
- 合成identity固定为QA ADMIN，不是cookie登录验证。非ADMIN、伪hall、撤权按合成存储中的当前身份拒绝；读路由也检查撤权。

## dot原生测试

RED：旧桥返回501，无法保存；只读禁用无说明；追加撤权读取返回200。各项先重现再修复。
GREEN：18项原生维护、HTTP、runtime及桥回归、typecheck0；追加撤权桥4组通过。覆盖成功EDIT/版本+1/原回执、同key重放、同key不同payload409、旧版本409、并发重放仅一次、列表详情读回、非ADMIN/伪hall拒绝、完成阶段故障全回滚、撤权后读写回执403、账号/角色/离职尝试零写入。
证据：`recovery/staff-edit-20261029/{red,notice-red,native-final,native-final-types,revoke-red,revoke-green}.*`。

## 尚未等同通过

- 前台真实产物点击保存：待本批build验收。
- PostgreSQL员工全链写入、EXACT26完整runtime、真实会话认证：未执行。
- 本次EDIT审计位于fixture snapshot.audit，操作记录页面仍是历史静态样例；未验证该页面审计刷新。
- 测试表单仍显示正式支持的其他动作，但本fixture严格拒绝；本批不证明新增/凭据/离职可用。

## 固定产物前台补验

`2e7e804b` 生产构建 + 显式合成 staff maintenance 开关，dot headed Chromium/sandbox、封闭测试桥，实际：员工列表→测试仓库员编辑→填写姓名/联系方式→确定→真实HTTP/service返回200→列表更新→重新编辑从详情读取新联系方式→取消。截图已目视，pageerror为空。证据 `staff-edit-20261029/browser2/`。首次browser1因标签同时命中group/input的测试选择器失败，改用精确textbox后重跑；不计第一次通过。该补验仅将上文“前台点击保存”改为通过，其余PG/认证/审计页面缺口仍保留。
