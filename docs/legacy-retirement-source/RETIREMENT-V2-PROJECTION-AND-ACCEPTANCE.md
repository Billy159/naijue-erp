# V2真实前驱后的35目标源投影与验收计划

2026-11-05。本页记录离线源码工作，不是安全复核通过、可信profile登记、35安装或整包导入结果。没有启动数据库、创建凭据、重启旧实例或删除真实表。

## 依据及来源边界

- V2实际178前驱证据：`cloud-pg-schema178v2-20261105-r2/evidence`；87项完整证据清单SHA256为`700f43affb2bdb035b4f50dab9613613db9498eec67bf2ab5d81e6f0f723d3e5`。
- 当前178 source spec为`88db01d978e0777d4f8a6fa4ca0d0918d80832cccf9300bb3ff5148b2990a86e`，177项来源binding为`3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6`。本轮保持这些输入逐字节不变。
- 实际应用dump SHA256为`94b2ff3c5507f9dfaf5dd5858346a4deeab92f8a0599db8968f53e7efa6991f8`。实际采集上下文、同一导出快照与停库证据已保留；资料一致性不等于安全、依赖或目标准入。
- 新增analysis adapter和V2 projection各自绑定源码，合成179项离线分析来源。没有把V2 candidate放入旧V1私有evidenceSet，也没有改变恒拒绝的V2 reviewed loader。

## 本轮生成物

新增`fresh35-retirement-v2-projection.mjs`只接受adapter产生的genuine UNREVIEWED analysis，生成前后重核来源。它不输出安装wrapper或安装guard，不提供任何开库或host执行接口。

输出目录：同级`fresh35-v2-projection-20261105-r1`。

- 未映射SQL：`ca77ff27437641a202cf9ba3ec9ebef4b7031475f73ab3024a6ec3acfe94509a`。
- 映射SQL：`d09756e12378dce598e64926bddde2a54e1cd13e1e0a8e007fa957ddc804987b`。
- 179项分析来源集合：`7fb718c8afc684aedaa59a8599818659bc69d35fe9a43d8c0f6490aeafb9b474`。

`fresh35_owner_v2_review`与`fresh35_controller_v2_review`仅为明确的源分析标签，不是已经创建的角色或批准目标；没有虚构database OID或system identifier。确定真实合成目标后必须重新生成、重新绑定其身份。

真实dump共1089个section决策：776原样保留、19仅函数体专化、7个FK换成NULL约束、26个历史函数及10个其metadata块省略、251个旧表所属块省略。结果预期为35表、152函数、351用户列、326约束、111索引、570触发器、4序列、32策略，全部是投影模型而非新35实测。

保留标准整包命令/闭合函数、零金额归档、结算校验与结算发生项身份相关8个关键函数体的原hash。该保留事实不能代替历史SALE混合正负、原优惠、来源证据及结算UUID的实际业务测试。

新增4项测试先缺模块失败，再通过；与source/plan/schema/identity/metadata测试合计46/46，无skip。测试覆盖genuine对象边界、原177与新增2模块的179来源绑定、身份映射不改152函数体、完整模型数量、克隆/改源码拒绝，以及旧V1和V2 reviewed路径继续拒绝。

## 前驱静态依赖审计

完整逐边JSON与复核脚本在`/workspace/shared/v2-retirement-dependency-audit-20261105/`，并在投影产物中保留副本。分类以catalog OID、表归属和constraint归属为依据，不按描述文本或JSON标签substring分类。

- 直接指向21旧表/行类型的677条边：670来自省略对象，7来自精确替换FK。保留来源与未知来源均为0，范围仅限该前驱捕获图。
- 扩展所属对象后1169条边：1127省略→省略，14替换FK→旧列/旧索引，28内部RI触发器→替换FK。
- 有106个内部触发器位于保留表，但其constraint属于旧表。必须先按`tgconstraint`归属省略，不能只按`tgrelid`过滤。7个替换FK另有28个内部触发器，两个表端都要说明。
- 前驱178中41个函数体有旧表词法线索，其中17个函数身份仍属于最终152。它们依赖精确专化后才清零，而`pg_depend`没有记录相应保留函数→旧表边。这是“静态图零引用不证明动态闭包”的实际反例。

未单独采集完整pg_type/pg_attrdef元数据；本次只从结构OID边推导归属。新35必须重新采集并验证这些维度，未知class或冲突归属不得静默丢弃。

## 下一步必须闭合的范围

1. **独立安全与证据复核。** 明确reviewed profile的授权边界，核对真实来源、ACL/角色、SQL专化语义、来源完整性与动态路径；文件整理或内部一致性报告不能自动成为这一结论。
2. **新增版本层。** 当前177绑定包含旧V1安装器、postconditions和恒拒绝的V2 reviewed loader。不能直接改它们再沿用相同采证身份。可信V2 profile和V2原子安装器应独立版本化并重新审查完整代码闭包；确需修改已采证输入时，重新建立来源证据。
3. **授权的全新空35目标。** 预先明确真实目标、身份、访问范围与停止/清理安排；创建临时访问身份和凭据需适用的当次确认。不得复用或重启旧178目标，不触真实数据库。无DROP/CASCADE。
4. **原子安装与实际目录。** 完整目标guard、建模SQL、27迁移描述与函数metadata/ACL、列、类型、约束、索引、内外触发器、序列、策略检查在同一提交前执行。提交后独立schema dump和目录完整集合对比，不能只看返回码或计数。
5. **实际依赖闭包。** 核对21旧表及行类型不存在、pg_depend/pg_shdepend、动态SQL及触发器路径。保留上述“17旧body漏出目录依赖”反例，防止用目录0引用取代实际路径验证。
6. **标准整包及日常业务。** 使用现有纯合成验收包，覆盖普通/stream成功、exact replay、失败回滚、不确定COMMIT后的原key续查、历史SALE混合正负及原优惠/来源保留、结算发生项UUID、未知库存与零值区分、空日期、条码/资料，以及新增/编辑/审核/反审核和结算。结构通过不意味着导入完成。

未来依赖负例应包括：伪装label但真实OID指旧表、无关OID的旧表名label、未知source class、保留表default读旧表、同名不同表FK、两端内部RI trigger归属、保留trigger调用省略routine、歧义rowtype/attrdef归属、改包hash与改来源。它们是后续分类器/实际目录测试计划，不在本轮46项源码测试中冒记为通过。

真实有数据旧库的物理退役仍另需数据/身份/审计保全、备份恢复和回滚证据，以及目标确认与适用授权。本轮`oldTablesRemoved`、`engineVerified`、`installationReady`、`targetAdmitted`与`hostEnabled`均为false。
