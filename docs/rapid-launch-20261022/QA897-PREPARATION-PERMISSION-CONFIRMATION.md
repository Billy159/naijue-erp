# QA897 合成隔离库：导入准备角色与权限确认

## 本次确认对象

仅数据库 `naijue_erp_test_hv2_qa897_20261029_01`（OID `21551`），已登记 PG17 隔离实例。创建唯一准备角色 `hv2_qa897_prepare_20261029_01`，用于原完整合成来源准备及发布流程。生产库、普通运行角色及其他数据库不在范围内。

角色可沿原私有连接通道登录；无超级用户、建库、建角色、复制、绕过行权限、继承或任何角色成员关系，不拥有数据库、schema、表或函数。凭据仅由原服务器负责人沿原私有机制保管，不展示、不入 Git。角色实际 OID 必须创建后回读。

## 准确权限范围

按下方原候选逐对象、逐列清单，共 170 项基础权限：69 项指定列 SELECT（含准确 12 表 xmin）、43 项指定列 UPDATE、41 项指定列 INSERT、15 个既有函数 EXECUTE、仅本库 CONNECT、仅既有 schema USAGE。无整表 UPDATE、DELETE、TRUNCATE、对象所有权或 grant option。

另申请原发布校验锁表所需的 19 项表级 MAINTAIN，准确表为：product、sku、product_category、color、fit、size、size_group、season、hall、customer、staff、warehouse、supplier、size_group_member、sku_barcode、barcode_scheme、payment_method、payment_account、payment_account_hall。

**MAINTAIN 不只允许加锁，也赋予适用的 VACUUM、ANALYZE、REINDEX、CLUSTER 等维护能力。此次仅申请在上述合成隔离库准备角色上的这 19 项权限，不安排执行这些维护操作。** 原 135 个函数、事务和约束保持，不改成 owner、SET ROLE 或新增提权函数。

170 + 19 = 189 项是源码需求全集，不是已经证实缺少 189 项。原负责人先回读实际 BEFORE，只补本次准确缺失项；已有 PUBLIC/owner/其他角色及默认权限保持。未知或不符则停止相应执行，不能直接整批盲授。

## 具体清单与独立审核

- [原逐对象逐列候选 SQL](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D1/QA897-PREPARATION-PUBLISH-ACL-01/CANDIDATE.sql)：51599 字节，df6558fc08d6d32fec216f2737c6c9532e3ccb90879398a624aeea3b99ba9e17。当前全部为注释候选，不能直接当可执行授权。
- [SOURCE922 引用修订](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D1/QA897-PREPARATION-PUBLISH-ACL-01/SOURCE922-DELTA.json)：7626 字节，20262ad31c4861bc2d04f6dc432d617dd58a871fdec26300d5e98a943ab46869。采用准备角色 12 表 V4，不能拿普通角色 13 表 V3 代替。
- [原 QB 静态审核](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/qa-backend/rapid-launch-20261022/QB/HV2-QA897-PREPARATION-ACL/QB-PREPARATION-ACL-STATIC-RESULT.json)：4239 字节，799b6b63c7ee57e2dedbf9ce0767d4c75d8352f3cb9350042a6726095fac3556。仅证明清单、源码引用和撤回模板一致，不证明实际权限充分或导入通过。

## 执行、回读与撤回

确认后由原 T45 唯一执行：新有限作业绑定准确实例、数据库 OID、准备角色实际 OID 和 BEFORE；记录实际新增权限及 COMMIT_POST，读取新的完整 V4 元数据目录。原 QB 沿现有路由审核实际新增目录及 purpose 绑定。未知 COMMIT 按原流程查实际结果，不重放。

[撤回模板](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D1/QA897-PREPARATION-PUBLISH-ACL-01/WITHDRAW-CANDIDATE.sql)仅撤本次证实新增的权限，保留原权限；先停止并结清对应准备连接和未知提交，使用 RESTRICT，不用 CASCADE。发布并准确读回后或本次准备失败安全收口时，沿原负责人执行准确撤回与新目录回读。权限撤回不代表资料、回执或序列回滚；不删除资料、不重置序列、不删除角色。

本确认仅覆盖上述合成隔离角色创建、准确权限实施及回读/撤回，不自动执行来源导入或发布，不覆盖普通角色 normal90 的另一次待确认，不授权生产部署、迁移、停服或生产权限变更。完整来源执行仍须现有准确来源/原请求键/CORE/业务验证条件满足。当前尚未实施。
