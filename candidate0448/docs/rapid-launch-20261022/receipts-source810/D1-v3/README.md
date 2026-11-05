# v3：仅修复197权限补丁的空ACL规范化

此目录两份SQL是新准确待审交付，不覆盖或重跑198使用的v2。授权范围及197原始前态继续引用同一原件：`../R1-NEXT-STAGE-MINIMUM-ACL-v2-197/CAPTURED-197-EXACT-PRESTATE.json`，47054字节/8a1ebdf7fa96d4b71508dc5e695aef283a300f4c20f552b88834bea58ec3f374。八表16条正向/16条反向、76授权位、所有已有ACL、精确身份/OID/owner/role/RLS/完整列/原始前态、规范old+76位比较和前后读回均保持v2原样。

确认事实：198 FAILED，原server message/context/行未保存，只能精确重建22023错误字节；不能伪称恢复原上下文。199实际原普通R1/RRRO已证明完整catalog及八表raw/规范ACL全部等于197前态，changedsections/columns均空，canonical仍6d3e；198没有持久ACL增量，因此不执行自动反向。

199在保存点内实际重现：aclexplode(coalesce(NULL或空acl数组,'{}'))均22023，消息“ACL arrays must be one-dimensional”；aclexplode strict=true，空数组cardinality0/ndimsNULL。原非空ACL正常。候选CASE在NULL/空数组返回[]、实际非空原ACL返回完全相同规范集合，三例实测匹配。这是199的实际诊断证据，不是198原上下文。

最小实现变更：每份SQL只有两处规范ACL读取改为相关CASE。NULL或cardinality0明确[]，不调用aclexplode；仅非空分支调用aclexplode(a.attacl)，原json字段和排序不变。不将NULL列ACL替换为默认表权限，不改变原所有有效位保留及no-extra-bit/grantor/grantoption核对。逐文件去除这两处读取后与旧v2字节完全一致；嵌入197前后集合和所有授权语句逐字相同。

后续：原QB仅审此实现delta，复用QB485的授权范围/197前态/规范检查审查与199实际probe；C再给T45新准确ACL-only载体，禁止重198/199、不叠旧barcode-onlyv1。T45执行失败须保存必要脱敏SQLSTATE/message/context与固定文件行/阶段，不含凭据/业务参数，不建新日志平台。

原执行及回退边界详见v2 README：原owner精确目标、fail-stop事务；任何错误ROLLBACK。反向仅撤本次76位且先核无后续ACL改动，不回滚业务，也不保证REVOKE后attacl NULL/空数组文本或canonical与旧值完全相同。新GRANT实际提交后必须按普通runtime导出新完整catalog、原QB精确ACL当前差异审查，并将config/currentpurpose/consumer/external授权绑定实际新canonical；旧6d3e不能直接沿用。v22body/profile/131routines/registry/trigger/store/issuer/provider/原键和业务合同不变。

D1没有执行PG写入或完整v3 SQL。本轮通过的是静态精确delta检查和T45的三类内建表达式实际probe，未称完整SQL/权限提交或后缀writer通过。BIND不重放、STAGED隐藏、2958异常商品级码不导入，历史未知语义、前端必填及逐仓数量守恒继续原合同。
