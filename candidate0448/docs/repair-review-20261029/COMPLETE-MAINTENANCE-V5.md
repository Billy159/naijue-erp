# 完整维护行版本权限合同 V5

## 已确认问题

隔离真实PostgreSQL中，供应商、客户创建成功后，分类创建在原deferred维护回执校验处以42501失败。原validate_maintenance_receipt_commit按维护对象读取version与xmin；原V3的精确13项只覆盖部分维护根，缺少分类等九种对象。简单增加xmin权限会使V3精确13项校验拒绝启动，不能伪造通过或切换较弱旧配置来掩盖。

## 最小源码修复

增加独立版本V5：EXACT26_RUNTIME_CATALOG_EXPORT_V5 / 26_hv2_history_set_guards_complete_maintenance_xmin_from_v22。
精确22项为旧V3的13项加color、fit、hall、payment_account、payment_method、product_category、staff、user_account、warehouse。仅新增完整维护xmin读取合同；V3精确13、V4准备12的生成SQL字节及哈希保持不变。
原issuer的真实租约、权限、角色、source routine、catalog hash、提交前核验及目的限制均保留。生产source-host的严格profile/format对应表同步支持V5，正常API仍经原issuer构建；不是仅用于测试的死分支。数据库迁移、触发器、数量金额及业务状态规则没有改动。

## 实际检查与边界

原生先RED：7项关注用例中6项按预期失败、1项旧跨版本拒绝仍通过；应用后全部7项通过，包含真实production-provider构建及路由挂载、缺少/额外xmin与跨版本证据拒绝、旧V3/V4查询哈希保持。这里的协议模拟不能替代实际PG的ACL负向验证或分类COMMIT。
全量运行三个相关文件为117/170，存在53个失败，不能写成全通过。另建只读基线worktree固定e521d2cb，用同一原生Node运行未修改的三个文件为110/163、同样53个失败，失败名称完全一致、新失败0；新7项全通过。主要旧夹具缺少当前要求的capacity admission及旧v14断言漂移仍待单列，不通过放松生产校验消除失败。后端tsconfig类型检查退出0。
证据：云端recovery/maintenance-profile-complete-fix-prep/的red-native-0340、green-native-0342、baseline-native-0344、BASELINE-COMPARISON-0346及typecheck-native-0344。

本提交时真实V5精确22、负向ACL及剩余业务链路仍待执行；源码修复不是数据库全链路或上线放行。

## 接手要求

采用V5必须针对实际目标，独立核对精确22项列权限、真实catalog及新review；不能把旧V3 review改名复用。除新增九项xmin SELECT外不扩大写入权限；序列只读实际需要的last_value/is_called，不能授予整个序列SELECT而额外暴露xmin。当前两项已提交客户/供应商及失败分类回执状态必须保留，只接续未完成命令，禁止全量重放或重置数据。
只push代码不会自动完成正式环境的权限及运行合同切换。本次未操作生产；正式应用须由主控核验实际环境、备份回退、必要授权、合并后测试和发布门禁。旧profile继续按旧规则拒绝不匹配权限，不增加自动降级或宽松回退。
