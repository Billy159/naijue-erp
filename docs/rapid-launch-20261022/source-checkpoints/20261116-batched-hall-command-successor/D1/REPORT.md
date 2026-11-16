# 批式导入的历史销货归厅

后继候选基于服务 32 实际安装的 DB05，源码集为 `23991537d21caa7fc6db4d06a395e2441392637f0dd70f7fcf763216f5e6f1d6`。正式库保持原安装状态，由 T45 集成和执行实际后继。

`DOCUMENTS` 现在验证同批已提交的 `MASTER`。它锁定实际仓库，比较仓、厅和版本，读取原 `standard_import_record_proof` 核对来源记录及其指纹，并验证 `MASTER` 的根操作、操作人、计划、清单、命名空间、截止时间和顺序。跨提交分支使用真实的批式操作身份；旧整事务入口和正常读回的原事务判据保留。实际目标观察仍存于原 `historical_hall_target_captures`，来源记录的指纹包含原输入意图，目标捕获时间由数据库写入。

用户裁决来源只接受一条已批准的 V2 销货记录。该记录保留原单身份和来源行引用，并附上独立的裁决原件引用。源运行仓厅捕获、身份桥和多厅解析均为空。写入时另外验证目标 `HALL` 和 `WAREHOUSE` 的已提交主档，两个主档均须包含裁决引用。正常读回通过原批准字节、主档证明和目标捕获确认归属。

## D3 资料形态

- 沿用 `HISTORICAL_SALES_HALL_APPROVAL_V2`，保留其他记录和它们的 `source_captures`、`identity_bridges`、`resolutions`。将裁决原件按现有方式登记到来源清单，并由既有包外审批摘要锁定批准文件。
- 新记录的批准项仍带原销货 `source_key`、`target_id` 与 `source_refs`。`target_initialization` 带实际 `warehouse_source_key` 和 `hall_source_key`，对应私域已批准的主档记录。
- 该项 `evidence` 与原销货头的 `historical_hall_evidence` 完全相等。使用原已批准的 `warehouse_id` 和 `selected_hall_id`。`target_snapshot` 写同一仓厅和实际主档版本，`captured_at:null`。`basis:'MIGRATION_DERIVED'`，`original_hall_id:null`，`source_capture:null`，`identity_bridge:null`，`resolution:null`，`has_difference:false`，`review_required:false`。
- 该项 `evidence.migration_decision` 的 `basis` 固定为 `USER_APPROVED_NEW_WAREHOUSE_HALL`。`decision_ref` 指向可定位的真人裁决记录，`evidence_sha256` 为已登记原件的指纹，`source_refs` 是该原件的实际文件指纹、页签或空值及行号。每个 `file_sha256` 等于该 `evidence_sha256`，这些引用同时包含于新厅和仓的实际主档来源引用中。保留原销货的日期、明细、数量与金额。

## T45 集成

源码增量位于 `source/`。PINS.json 列出 8 件逐项基准及候选指纹，DELTA.patch 列出覆盖的文本源码差分。新增 `0028_batched_history_hall_provenance.sql` 对已装 DB05 作单一例程的事务后继，仅替换六参 `standard_whole_package_command_v2`，核对变更前后的函数体及完整运行属性。适用原函数体 `a9e432e35c39edcd2b6fd43530fb3e0a72e0d2d8cc710f49f2bf6674bb7b3e00`，候选函数体 `cc11ea590f93b579a0e1286a2c28bd2fc7a6b423a366bc35ef54406a4cc46fba`。新增 SQL 的 SHA 为 `d677eebb66c8e7f1d6327ca83d5d244a1ac646b4d108a0ee1a16d81710d46dc4`。

用三个候选 `EXPECTED161` 文件和目录编译器的新指纹生成后继 writer 的源码和目录绑定。旧 DB05 安装回执保留作为旧目录证据。最终源码闭包、现场后继安装回执和 writer 授权由原负责人配对。

## 已跑验证

- 本机隔离 PostgreSQL 17.11 只监听专用 Unix socket。应用了精确后继 SQL 并通过原函数元数据等同检查。用真实提交边界复现旧写侧跨提交拒绝。新写侧接受普通 V2 与裁决来源的已提交 `MASTER`，拒绝过期仓版本、错误计划、错误顺序及缺少厅主档。将真实捕获挂到独立提交的历史收据后，原生读回函数和正常读回 SQL 均返回通过且保留裁决和空的旧捕获。隔离实例已停止。结果在 LOCAL-PG-RESULT.json。
- Node 24.21.0 下运行 21 项现有归厅证据、包预检和源码合同检查，另跑 1 项裁决包的完整内存校验、流式预检及解码检查，全部通过。三个改动的 TypeScript 文件及其依赖通过定向严格类型检查，启用了项目依赖的 `.mjs` 模块解析。隔离测试使用合成记录及真实提交，正式完整批的导入、运行角色真实权限与端到端执行仍需最终包验证。
