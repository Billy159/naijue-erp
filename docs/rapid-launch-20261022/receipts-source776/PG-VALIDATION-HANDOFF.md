# v22 原QB/T45真实PG验证交接

这是 source-ready 交付，不是 PG 或业务 PASS。D1 未连接/建库/恢复/SSH/跑服务、未实施DDL或R1写入。只读171/172和168权限事实直接复用。

## 原始实际入口

生产安装入口为 R/adapters/postgres/patches/0026-v22-staged-prefix-bind.sql，由原T45/C精确登记新载体后既有owner通道运行，旧169/164/148不重跑。固定目标R1/OID1027659/原socket与postmaster；前置registry1..26/完整131routine body+definition均匹配原currentv20，原两列ACL已在位，旧canonical64c4作为父态需在执行准入绑定。SQL仅一个CREATE OR REPLACE原函数，其他表/列/约束/trigger/ACL/role不改，不新增27 registry。

安装真实PG成功才证明PLpgSQL编译，不由本地文本测试代替。owner短事务错误ROLLBACK；成功后原普通runtime导出现行canonical，新profile=26_v22_staged_prefix_bind_from_v20，单函数bodySHA8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5，131routine，其他manifest差异必须明确审。原QB签准确currentreview及实际purposes；旧471/64c4不能代替新schema证明。C/T45另固定新执行grant/input/sourceconsumer真实差异。原actor/key/109命令不变；provider/host/run按D3末版传same stagedPrefixBinding26 option。

原R1若获C具体实际导入载体准入，走原source host→originalcutoff service/store→genuine issuer pool→authorizer.capture→原事务逐expected有界全projection查询→BIND CAS/auditproof/receipt→真实延迟约束COMMIT；核原键准确新receipt/audit/checkpoint、前缀没改量/改身份、stillSTAGED未开放。此为正式导入的必要实际步骤，不能拿R1注入失败当测试，不在D1自行执行范围。

## 隔离PG测试入口的真实缺口

当前没有已登记且可直接运行的v22隔离PG harness。本交付两个test文件只有Node scripted protocol/codec；不能把它们或root公式静态检查当PG通过。已有B07 SYN数据库是另一条v21-from-v16-v14，旧07/19目标也不是v20父态，不能复用它们来套v22或重跑既有normal/rollback。

若C要求隔离实际正反例，需原T45先登记一个现有可用的exactv20环境，或沿其既有保护/备份路线创建受控R1一致快照的隔离clone；只能T45实施和保护真实来源/账号资料，不导出凭据给D1。clone应保留同逻辑batch、未绑定前缀、原CORE/scheme回执及原来源产物身份，registry26/131routine原body和原ACL。其实际dbOID/socket/postmaster/角色必须按真实值独立固定，不能冒原R1身份。

现安装SQL严格固定R1，不能直接在clone运行，更不能删身份断言。隔离安装的exacttarget前态段需要C登记、QB明确接受为测试载体的真实身份变化；函数正文必须逐byte保持上述同一SHA，原业务/来源/成员/权限/codec/约束断言不得修改。原source authority/currentreview/grant也须真实绑定clone，不能把R1/148目标授权伪作clone已授权。如果现有source authority无法在不更改原source/command身份的前提绑定该clone，准确报该准入缺口给C，不走raw-SQL假expected或owner代普通runtime。

只有上述隔离目标/入口真实就绪，C再协调必要小范围：准确完整前缀原BIND成功；每八表/原SKUrecord的缺失、外来、重复、关键字段或关联改变拒绝；其他17表非空拒绝；错原binding/pins/旧profile拒绝；失败真实COMMIT触发器全回滚BIND元数据/audit/receipt且既有前缀不变；按原键只读恢复与重放无重复。实现的root重复核验可能被原多项延迟约束多次调用，真实全前缀耗时尚未测，不宣称性能通过，不为提速删验证。当前没有这些PG测试结果，也不自动恢复未知提交或继续109。

## 已有本地证据与边界

D1：25个本地mock/codec cases先通过，权限无新增改为等价展开后仅受影响4项通过，包含1个新原26projection/seed/fold/final字节协议对照，共26unique accepted cases；原CORE/BIND受影响5项复用通过，定向strict类型检查通过。真实PG解析/函数调用/延迟trigger/锁与回滚语义、真实八表全成员和原生快照、实际UNKNOWN COMMIT及性能仍未测。D3五文件末版有其独立必要source tests。合包后原QB只审本次差异。

不得新GRANT掩盖codec helper权限：当前runtime已有encode/row_hash EXECUTE，其余私有projection/key/seed/fold/finish不调用；公式和projection固定展开，ACL不变。SKU import_record为原已存在关联凭证，逐全11列核对后才接纳，其他record及非WAREHOUSE claim仍拒绝。STAGED不暴露、缺失历史人员/时间NULL、前端必填和2958异常条码排除、全仓守恒及最终发布限制保持。
