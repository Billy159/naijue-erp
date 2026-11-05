# 当前源码重新绑定与新目标验证计划

状态：计划，未执行。不得将旧结构快照视为当前完整源码、当前CLI通过或新目标准入。不得为恢复旧指纹移动、回退诊断代码，也不得更新旧证据hash使其通过。

## 已确定的来源差异

- 已观察178结构证据对应source spec `396d45bd8303a6f8e0e453e93467f4f17643a835e5f0b6574864d37df4f1a81a`。
- 当前source spec为`1252b5382664ff8bcfdeaefd646306cdfdf11abf7437ec678c806a9940cc6a15`。118个原安装来源中，当前仅`tools/unified-import/stream-import-cli.mjs`不同：`b3f59717d979f499067b1ac7639d641f9750df334b5c6107e17c479bcf0cd4c8`变为`e43218ea85f0584630222cbdfc79f53b7784d9e68804114da78bcd0b40e8e070`。冻结前必须重新核对此结论，不能假设此后无变化。
- 已核178函数体全部相同；新补入安装清单的20个支持源与旧178快照也相同。这不足以把旧证据重新标成当前源码证据。
- 当前wrapper在生成可执行安装内容前拒绝`FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS`。保留此拒绝及日志。
- 旧基线r3结构快照54/54源码测试通过，独立复核覆盖完整guard和wrapper。它未执行SQL；`engineVerified`、`installationReady`、`currentCliVerified`和`executionAuthorized`均为false。

## 1. 先收敛源码，再冻结

1. 保持所有现有WIP，包括Fresh35诊断与未接通路径的明确拒绝。
2. 先完成拟验证的独立152函数profile/record/host接线源码以及最终CLI分流。缺可信目录证据时必须拒绝，不关闭旧177/178 profile，不将通用成功标志当准入。
3. 在独立目录冻结当前来源，不覆盖工作树。清单分开记录：原178安装来源、Fresh35生成器完整实际加载闭包、最终CLI及host导入闭包、测试fixture和已安装依赖/锁文件。不能只沿用118条原清单；当前Fresh35生成器已有150条pins，独立实际加载观测45个repo模块均被覆盖。
4. 对冻结复制前后逐文件hash核验，并记录所有未包含内容。源码冻结后任何相关变更都必须产生新版本清单和受影响复验，不覆盖旧冻结记录。
5. 离线重建178 spec、组合SQL、全部178函数体，核对CLI差异及预期SQL是否变化。运行源码测试、CLI拒绝测试和既有导入协议回归。生成的SQL和模型仍只是准备材料。

## 2. 全新当前178结构基线

为避免把旧CLI的source spec套到当前CLI，推荐在最终源码冻结后重新建立当前178结构证据，不重启旧178实例、不复用旧测试身份。

需先由主控确定新cluster/database/role名称、端口、目录、进程生命周期和清理方案；创建临时访问身份与凭据需本次具体授权。权限只限新合成目标。不得连接真实数据库、读取业务数据、接触Mac或运行曾受阻的完整安全探测。

执行范围仅为：使用冻结来源创建当前178空结构，初始化必要schema_migration元数据，采集目录与schema-only dump，然后停库。不得在此阶段发行正式安装记录或进行业务导入。

新证据必须明确保存：

- 精确物理目标、PostgreSQL及Node版本、最终源清单hash、178 spec、组合SQLhash、日志与干净停库结果。
- 同一只读快照的完整functions/pg_get_functiondef/proacl/proconfig、关系/列/类型/排序规则、约束、索引、内外触发器、策略、序列参数、ACL/default ACL、角色/成员关系、pg_depend/pg_shdepend和完整schema-only dump。禁止保存密码/verifier。
- 对pg_get_functiondef/constraint/index/trigger的采集显式设置`search_path=pg_catalog`、`quote_all_identifiers=off`，使用明确非pretty重载，并把实际上下文随结果导出。
- 对default/generated/policy表达式显式设置`quote_all_identifiers=on`，保持与quote-all dump一致，保存`pg_get_expr(..., false)`的上下文；名称必须解析成可移植值，不能把OID或pg_node_tree当目标语义。
- 实际完整集合及空业务表计数。数量不是完整定义、ACL或权限证明。

旧采集源码明确设置了search_path，但没有单独保存quote_all_identifiers实际值；新轮不能仅依赖默认值推断该上下文。

## 3. 明确新版证据绑定，不替换旧pins

1. 对新证据目录与当前冻结源码做独立核验。比较新旧178的函数体、完整定义、ACL与结构，解释身份/OID变化及任何语义变化。
2. 新增显式版本的证据profile，固定新bundle各文件hash和上下文合同。旧profile与其反例仍保留；不得接受调用方自报hash或任意`complete=true`，不得放宽旧sourceSpec相等检查。
3. 用新版证据从真实178 dump生成35/152、显式新owner/controller映射、genuine metadata和完整guard。原子wrapper仍要求缺任何维度即拒绝。
4. 重新运行来源绑定、错误profile、改动ACL/SECURITY DEFINER/search_path/返回类型、漏对象、序列参数、collation、SQL变量歧义及sourcePins闭包反例。核对生成物逐hash并独立审查，再准备新35执行包。

## 4. 另一个全新35合成目标

新35使用另一组新身份和新的物理目标，既不复用旧178，也不把178原地删成35。角色/凭据创建须适用的当次授权；安装及测试范围事先写清。

- 原子安装绑定精确database/OID/system identifier/server version/普通owner，并在同一COMMIT前执行完整目录与空业务表断言；不使用DROP、CASCADE或TRUNCATE。
- 执行后独立重新采集真实35证据与schema-only dump，对比完整预期，不只查看wrapper退出码。
- 预期为35表、152函数、351用户表列、326约束、111索引、570触发器、4序列、32策略及70配套行/数组类型；这些数字需由完整集合对比支持。
- 核对21旧表与其类型不在目标中；检查真实pg_depend、routine/trigger/type引用与动态路径。词法扫描不能证明任意动态拼接没有依赖。
- 若安装失败，应验证原子回滚和无残留，并保留失败证据；不得省略失败门禁再重试。任何修复均重新冻结、复验受影响范围。

## 5. 整包与日常业务验收

结构通过不等于导入完成。使用预备的纯合成标准包及验收矩阵，在已通过目录/ACL绑定的新35目标中至少覆盖：

- 普通与stream整包路径、依赖顺序、完整成功、exact replay、错误包拒绝、故障回滚及不确定COMMIT后的原key续查。
- 原有历史SALE类型、严格来源证据、正负混合数量、原优惠、结算发生项持久UUID；不把SALE改成退换来绕过约束。
- 零值和未知库存分别处理，空日期、条码/基础资料、来源与审计闭合，历史库存零重放与后续unapprove锚点分别验证。
- 普通新增/编辑/审核/反审核、销售/调拨/结算；不只验证导入入口能打开。
- 成功、重放及失败后重新核对目录/ACL及21旧表不存在，不制造正式发行或真实业务完成记录。

只有新35真实结果、完整导入/回放/回滚及普通业务验收全部闭合后，才能报告该版本的合成35目标通过。真实有数据旧库的物理退役仍是另一项操作，需要逐表数据/身份/审计保全、备份恢复与回滚证据、目标确认和适用授权；本计划不授予删除真实旧表的权限。
