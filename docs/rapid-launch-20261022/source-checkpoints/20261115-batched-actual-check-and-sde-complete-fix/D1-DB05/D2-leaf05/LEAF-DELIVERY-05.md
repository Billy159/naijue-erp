# 05完整叶：冻结合同已解除协议门及拒绝策略待定

本次准确消费D1 INTERFACE-V1 d6a79421…、record_proof35d2bc55…、context1921cdcd…、current_operation94eb1599…及D2-CONTRACT d7b94b3c…。五份文件及当前SOURCE-PINS中对应条目均匹配。聚合SOURCE-PINS已变为f8181dc7…，不冒充主控先前提到的8d142189…整清单；本叶只依赖上述五份准确输入，其他D1文件未消费。

主控明确冻结：whole_package_v2仅选择proof-enforced协议；新6参命令保留其root/ordinal外形，batched_import_v1补组身份但不提供行权限。匹配后的具体proof不满足时23514拒绝，原proof/context/STRICT错误传播，不回普通维护或兄弟项。普通非whole行为保留。D1其他command/commit guards保证新batch入口走whole协议。

据此，05完整body与03历史草案**逐字相同**，无须再造代码差异。区别在于05的协议/失败策略现有明确冻结依据，03/04历史状态不改写。仅05是本次可交D1集成的源叶；没有将03原先的待定状态追溯标为通过。

## 准确交付

- ROW-INTENT-BATCH-AFTER-05.body.sql.review：完整helper body5933c1461819a212de6cfd9a4f6437506bce9d7eb4bf38243c0e3a8e12461baa。
- ROW-INTENT-BATCH-AFTER-05.definition.sql.review：完整definition3e34ff7a47193dccd7ace35419ff4fdbcd0b79880a88bec22e573f653d6b3227。
- ROW-INTENT-BATCH-05-vs-accepted.diff：从准确已接受2f5e原实现到05，含751读取成果及新fallback精确proof。
- ROW-INTENT-BATCH-05-vs-751.diff：只显示751以后新增授权接线；751是已评价但未采纳的读取稿，不冒充安装前置。
- INTEGRATION-MANIFEST-05.json、INPUT-PINS-05.json：签名、前后摘要、三保留叶及冻结输入；D1唯一集成，不附旁路安装器。

## 授权路径

保原角色门及有id来源候选/STRICT/proof/context快路。fallback保真实source_a.xmin/IMPORT/profile及751 records读取，仅额外输出实际operation_id、已有whole协议选择值和root文本小绑定。

先原同kind逐项typed转换，再比较完整native行。匹配且属于whole协议时，对这个item.id取真实D1 proof；要求current_operation=true、operation_id对应当前实际audit、kind/id/target_id/fields精确一致。D1 proof负责该精确source pointer及source/receipt/audit三者真实当前xmin/时间。随后context(root,false)只核同根补证，不代替具体行许可。

谓词不满足23514拒绝；proof/context/STRICT原错误传播。没有预筛复合键、全局唯一候选、LIMIT、空数组归一化、排序、catch或GUC/cache放行。普通非whole仍走原typed匹配。whole标志本身不能触发true；精确proof和typed比较共同控制结果。

party、settlement、unified_document三叶准确原文保留，本批xmin及current_operation不改；另六个直属caller不变。早warehouse MASTER跨commit的持久root/input/ordinal证明由D1公共record_proof/context处理，不由D2双写。

## 验证与后续

check-leaf-05.py仅核准确输入/冻结历史、05和已检查03的源码一致、定义头/角色及有id快路/typed顺序/精确proof要求，不执行SQL。当前SOURCE_READY_FOR_D1_INTEGRATION_NOT_SQL_TESTED，尚未安装、采纳或运行PG/server。

原16项行为要求合并成SCENARIOS-05.json的6组有限场景，供QB一次窄审和后续获准的必要定向验证；不是16个环境或广泛重验。使用真实D1 proof及批次种子，不stub、不扩大helper权限。旧751的14项及9.04/10.73ms不转签新增proof语义或成本。

D1若最终候选改变上述实际输入，仅补真实新增差异。完整公共SQL和新组写入/提交守卫由D1唯一集成，协调器由D3承接；本目录没有整包carrier/fullcompile/Linux整包微测或第13层。
