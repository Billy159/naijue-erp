# 基础资料逐项补验（仅列明读取/取消步骤）

2026-10-29 19:49 UTC，固定a066e405生产产物，Dot原生sandbox headed，合成只读网络。未修改生产业务源码。

- B01沿用foundation-second/result.json中单项PASS：trim、编辑默认仓取消继续/放弃、重开恢复、新增默认仓禁用解释。该轮总体FAIL来自B02定位错误，不能抹掉总体失败。
- B02 foundation-root1947/result.json及.exit=0：选厅、空候选、全部、trim唯一总仓、新增选厅取消继续/放弃、使用状态取消恢复。补了响应status/total/实际四仓/DOM与所属厅断言及结束可见alert为空，pageerror为空。
- 修正测试定位：ReferenceSelect的选项portal与.arco-select是同一shadow host内的兄弟，旧脚本错误只搜select后代，出现真实可见网点营业厅却超时。改定位runtime-settings-select宿主，不改业务/预期。
- 保留foundation-first/second失败（名称group与input歧义、portal定位）；新增零case不可PASS保护。
- 只有一个营业厅，四仓都启用且同厅；没有跨厅排除、停用数据正向、真实保存、数据库或完整冻结Demo配对证据。不得把这些边界写成通过。

## 19:58 UTC B03–B06有限读取/取消补验
- 固定a066生产产物，四独立headed运行各exit0，result明确PARTIAL，不是整case通过；全部22列明步骤PASS，截图实际目视。
- B03客户/供应商tab、trim搜索响应和列表、只读编辑禁用、返回原tab。原生产party GET被通用旧fixture桥拒501，新增测试桥仅放行精确客户/供应商GET到原transport，不改正式API/权限，不返回任意假成功。
- B04角色/厅/在职三筛选开合选择查询重置、closed选项维持禁用；编辑姓名草稿取消继续/放弃/重开原值，无保存。
- B05微信trim、停用空/全部/重置、编辑禁用；B06收款方式、无匹配、全部恢复、现金trim、tabs往返及编辑禁用。
- 缺口：party/payment维护flag未启，编辑取消/保存尚未验；closed账号能力未就绪、离职仅空样本；资金账户单厅且列表无厅列，不能证明多厅展示。旧staff有限保存证据不混成此profile完整写验收。
- 私有预备脚本实际通过后同字节逻辑入repo，改为相对import。native Python compile/Node check均0，入库脚本B03实际入口再运行exit0且仍PARTIAL。原输出不覆盖。

## 20:08 UTC 合法维护准备配置下B05/B06编辑取消
- 新隔离产物payment-cancel-prep/testbuild，source ae9836db。configuration仅在既有routes.paymentSettings=true基础上加maintenance.paymentSettings=true，原ADMIN/WAREHOUSE权限门控不改，实际session为有限合成ADMIN。不是生产权限修复。
- B05实际9步通过：trim/状态/重置+编辑改名称草稿→取消正常确认→继续保留→取消放弃→重开详情所有字段原样→干净取消，无commands/receipt；仅原列明读/取消步骤，不保存或整页全状态。
- B06实际11步通过但原case仍PARTIAL：方式/空候选/全部/trim/tab+同样取消保护，所选原营业厅保留。多厅只有一个样本未验证，不能冒多厅维护成功。
- 证据payment-cancel-prep/actual-b05、actual-b06/result.json，两个exit0；截图实际目视。入repo相对bridge入口后nativePython编译0及repo-entry-b05实际0，验证交接脚本可从本仓运行。
- tests/payment-cancel-public-config.json仅供synthetic-management.invalid隔离验证；只读fixture永拒写，不是可部署配置，不得据此认为确定按钮提交可用。
