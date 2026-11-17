# 三函数升级接线源码（未绑定运行身份）

现有 catalog35 的 PG driver、有限 host/native 双层授权、owner 切换、事务 ACK、提交后独立只读读回与 child/连接清理机制足够复用，无需新发布器或任意 SQL 接口。旧入口固定 used catalog35 key / normal35 / Root06 / 单函数0028，不能直接再次执行。本目录提供最小 native successor 源码和既有 host 的精确适配/输入合同；未改旧入口、SQL、consumer或T45文件。

`settlement24-catalog-run.UNBOUND.mjs` 从实际成功的 catalog35 runner `e85116b9…` 派生，差异见 `CATALOG35-TO-THREE-ROUTINES.patch`。REQUEST / START / INNER 均为 null；入口会在读取任何未来 C、时钟、凭据或建立连接前拒绝。本文的 SOURCE 交付不代表 host 已绑定、根已登记或 SQL 已升级。

## 固定消费及读回

- 只消费未来实际 Root08 `operation` 下已审 Source768 / QB976 的 PINS `faaa57ae…` 和 SQL `daf37843…`；只允许固定3签名/精确before与after SHA。SQL文件未改，未提供SQL文本/路径参数。
- 原模型626、三函数before body/definition与权限元数据读回；在同一 READ COMMITTED 事务中执行已审 SQL 的两个原 SET LOCAL 与完整原 DO，随后核新模型ada8、三函数after和全部原pg_proc非body元数据不变。
- 原补丁BEGIN/COMMIT由既有native逐命令ACK机制承载，两个SET LOCAL与DO原字节保留。本地只做整个原SQL字节重组一致检查，不重做SQL语义审或91项已验分支。
- COMMIT明确ACK之后另开 READ ONLY 事务，独立再次核ada8与三个after body/definition/权限元数据；ROLLBACK结束读事务，RESET ROLE、关闭连接、捕获completion。提交/读回不确定保留UNKNOWN，不重放。
- catalog 仍用既有161元数据 guard / observation，无新增业务表全量扫描、数据重算或全量migration。

`HOST-UPGRADE-CONTRACT.json` 逐项列出当前有限host入口需替换的固定字段，以及每个真实前置。保持原 `catalog_update` host、current-service核验、私有凭据投影、child生命周期和原driver；只适配三函数/新PINS与SQL/Root08/descriptor/model读回。既有install32与catalog35仅为历史before锚，不重跑13层安装或旧catalog35作业。

## 必须后续实际绑定

1. Root08已真实登记并物化：actual marker需匹配392/rows3b8/sourceac85，状态只能是 SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED。marker/sourceModelada8不能作已安装SQL证据。
2. 诊断02真实durable结果及三个实际before prosrc/definition事实，加Main明确恢复决定。当前没有这些事实，不假定零业务写入或before已通过。
3. Main/T45给实际唯一SQL升级job、真实维护C/epoch、finite-admin apply及窗口和内外授权。所有这些当前为null，未选择writer新key。
4. 维护升级before626与afterada8明确分开。不得把Root08新host导出的after-ada8最终导入context，当成升级前live数据库证明；最终import gate要在真实升级/独立读回之后才消费。

Main/T45后续将上述实际身份绑定到既有host合同和此UNBOUND runner，不需要引入新服务或参数化SQL平台。APPa7/native旧闭包继续记为未升级，单独处理后继native配对。

## 本地检查

20项仅新增接线检查通过：实际e851父runner锚、daf3 SQL原字节、精确事务拆合、两个原settings、runtime null前置拒绝、before626/afterada8链、三函数及post-commit独立读回接线。另做新runner Node24语法检查。未import/执行native runner、源码业务模块、issuer/clock、服务器或PG，未重验SQL语义/旧91项/sealed18。完整真实数据导入、守恒及正式验收仍未通过，STAGED和发布限制保持。
