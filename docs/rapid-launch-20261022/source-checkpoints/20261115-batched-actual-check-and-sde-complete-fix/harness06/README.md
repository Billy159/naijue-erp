# 06：完整 DB04 + 单 CHECK 短验 + 原 162 六场景（仅准备）

当前未执行，无 ATTEMPT，无新 PG/fixture 编译。主控已通知 DB04/3067…及 HOST receipt delta 的 scoped SOURCE PASS；06 不使用 HOST。仍等 QB06 准确载体 readiness 和主控新的单次决定。02–05 失败回执及 roots 保持不动；没有沿用已消费许可。

## 安装和模型

新三元：/tmp/d3-batched-core-20261115-06、demo_8877_d3_batched_20261115_06、Unix socket55496。安装固定为 base35+精确12层→真实155→完整 DB-CANDIDATE-04/sql/source-slices.sql 一次。完整 DB04 已含 FIX03 和 one-CHECK DO；不先装 FIX03 到161再重放 DB04，不另执行 group-access/receipt-check SQL。

DB04/PINS SHA3067e7f192766a86ad2ebf1b2ad50bbcf5e065845da6026384e67d613afeca31，完整 SQL SHA4cfa22c3b55bd9742583a9da5a284dbe663f7f9a8698420801a764dbe8b01e85，EXPECTED161-MODEL SHAb169ef5be7170bbebc90bcb778b0b9bb94f0449e3ca78b732c866d4e4324caa8。BODY/DEFINITIONS 取 DB04 中原字节副本，摘要仍分别5c7d1506…和bb7d7bb7…。TARGET.candidate04 是唯一当前安装/模型来源，没有旧 model 冒充新 CHECK。INSTALL-BINDING.json 给准确路径/摘要。

原161函数 body/definition/owner/ACL 和表/列/索引/约束数量读回沿旧代码；不重新审查其业务语义或325条旧 CHECK。只在161 catalog读回中新增 operation_receipt.receipt_result_by_kind 一行的 pg_get_constraintdef(false) 摘要和 kind/validated/deferrable/initiallyDeferred 对照。源预期 condef SHA b58f2364e39d2fe34f987c15e970aa005030aeb4ca0202bdaa6fbc8731ac32d5，仍待真实采集；当前不能写实际 PASS。只导出摘要及布尔元数据，不导出 CHECK SQL。

## 单 CHECK 样本范围

原 compileFixture 当前162流程之后，在 bootstrap 自己的临时表做 CHECK-only 样本。临时表仅从原 receipt 取五个引用列的数据类型、WITH NO DATA，再添加从当前真实 pg_constraint 读回且摘要匹配的原 CHECK 定义。没有重新实现 predicate，没有业务表插入或禁用/放松任何现有 guard。

10个短样本：旧合法 standard 结果、带原 CORE closed marker 合法结果；extra marker key、缺旧 ledgerEntryIds required key、JSON-null marker、scalar marker、identity非空字段为null、descriptor数值变字符串、full_xid变数值、SQL-null result 均须拒绝。CORE 原 descriptor 的可空 predecessor 字段保持真实 null。样本 result 是 CHECK-only 合成投影，以原 identity/descriptor/op endpoints 绑定，绝不替代真实162请求/receipt或业务写入。

每项 SAVEPOINT 后插入并实际观察接受或拒绝 SQLSTATE，再回滚该项；只接受实际 CHECK23514 或 JSON/data22类错误作为拒绝，不预设所有拒绝同一 SQLSTATE。最后确认整个临时事务 ROLLBACK；表和行不留存。输出 scope 明确 ONE_ACTUAL_CHECK_ONLY_TEMP_PROJECTION_NO_TRANSACTION_OR_PERMISSION_PROOF，不能冒充角色授权、组提交、业务或其他 shape/历史分支完整覆盖。历史 optional 规则及其余定义等价按源 PASS 复用，未另扩样本。10项未运行。

## 原六场景与准确首错

04的原162输入/原键/权限/请求、六场景操作和断言保留。CHECK样本结果作为独立 checkSamples 字段，不增加原 events 六项：安装161、成功前缀与HISTORY半组拒绝、真实COMMIT后协调器回复抑制UNKNOWN、新连接原锁/错误身份和原source重放拒绝、同原键恢复与单xmin、独立最终verify。ACK抑制位置、privileged foreign actor样本、非genuine/V2等原边界均不变。

原05 core-error-fields.mjs 原字节复用。对本场景所拥有 client 的真实 query catch 当场保存最早 PG scalar 错误；STEP/INSPECT 从真实参数识别 groupPhase/ordinal，角色/COMMIT/ROLLBACK等如实标 kind。firstFailure 保存实际 groupPhase、ordinal、kind 和当前场景进度标签；外层Assertion/ROLLBACK错误不能覆盖它。旧 lastSqlFailure 字段保留兼容，实际首错以 firstFailure 为准，不把外层 half-group 进度标签冒充HISTORY成功。

有意注入的半组真实PG错误只有在原全部断言通过并记录成功事件后，才作为 expectedPgFailure 记入该事件并清空暂存；后续不预期错误能取得自己的首错。原负向检查只在 SQLSTATE 确属原允许集合时清除本次匹配 expected 错误引用；意外 SQLSTATE 会在随后的断言失败后仍保留。CHECK样本的预期拒绝也只清除该次匹配引用，不掩盖别的早期错误。

每个安全首错对象<=4KiB；沿05消息<=1024UTF8、请求/私参/引号值过滤、可疑SQL/多行null、constraint/table/column标识符和最多3函数行帧，不复制DETAIL/SQL/参数/行数据/rawWhere/凭据/一般stderr。所有旧成功范围不重复测试；05过滤检查直接复用。仅新增纯内存首错保留5项检查，证明CORE0首错不被ROLLBACK/ERR_ASSERTION覆盖、真实阶段/序号/kind、仅清匹配预期错误、后阶段新记录及大小界限，已通过，无PG/fixture/harness。

## 收尾及依赖

02 finally 逐字保留；04守护函数逐字保留，安装诊断只换允许DB04路径/标签。170秒工作/180总计/statement40000ms/response42000ms、allocated3GiB/512MiB余量/50ms、日志回执2MiB/末尾16KiB预留不变。正常SIGINT、失败SIGQUIT，不SIGKILL postmaster，真实stop/reap/信号和所有失败保新根；全部实际成功和停机回收/资源条件确认才删本次新根。首失败停止，不重试，不新genuine/V2/full511234/服务器/R3/真实数据操作。

INPUT-PINS653条：640条旧外部摘要原样复用，5条当前候选运行依赖切到DB04(PINS/fullSQL/MODEL/BODIES/DEFINITIONS)，自身8条。去掉2条分开FIX03安装引用；18条旧候选说明/源归档摘要仅保留来源链，不是当前SQL/model或运行输入。INPUT-DELTA.json逐项说明；没有重哈希/重审旧外部闭包或重跑旧套件。base原字节，过滤器原05字节，新Python仅AST解析，新3个Node文件仅--check。PG/CHECK样本/161新模型/六场景均未执行。

DELTA-04-TO-06.diff 给准确runner/TARGET/安装清单/catalog/scenario及两个新增运行文件差分，PINS绑定全部准备件。

## 等新一次决定的唯一命令（当前不执行）

```sh
python3 '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D3/20261115-r3-batched-pg-local-06/run-local.py' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/e5c5a762-cleaning-intake-20261102/complete-source-20261103-typecheck-20261104-01/actual-pg-browser-20261104-01/vendor-input/pgsql/bin' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/node_modules'
```
