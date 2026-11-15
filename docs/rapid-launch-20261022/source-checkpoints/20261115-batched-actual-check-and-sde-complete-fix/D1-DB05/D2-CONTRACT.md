# D2 叶消费约定

持久根仍是原 `whole_package_v2.root_operation` 指向的不可变初始化 receipt/audit。actor、namespace、manifest、plan、cutoff 和 baseline/document batch 身份必须一致。历史 full_xid、backend_pid、创建时间用于解释当时事实。

当前行授权必须同时满足原完整 typed 行比较、exact records membership、source pointer 和 `standard_import_record_proof(record_id).current_operation=true`。该标记在 D1 successor 中要求该精确 import_record、其 receipt 和 audit 三者真实 xmin 均为本事务，并且 reviewed_at/completed_at/occurred_at 均为本事务时间。历史成功来源的标记为 false。

`standard_whole_package_validate_context_v2(root,false)` 仅验证同根存在当前事务的操作，调用者仍须核精确行和精确操作。D1 的 `assert_standard_import_operation` 会另核正在验证的操作本身的当前 xmin。D2 的 party set/loop 分支应保留当前 source/receipt/audit 校验，与上述具体行授权联合使用。

D3 的单据工作组包含头、全部行、结算、对应 source records 和迁移效果，跨多个有界请求时仍同事务。因此 retained_record 的本事务 xmin 条件继续有效，INSERT 的 current_operation 继续要求 true。历史仓库 MASTER 来源允许在先前工作组提交，以原 root/actor/input/order、审批与完整 capture/source 证明关联，不能把它拿来授权本批新插入。

此前 row_intent、party 独立来源证明和单据 guard 的业务比较保留。D1 集成公共 record_proof/context，D2 独占 row_intent/相关叶的最小差分。

这些语义已写入 `durable-context.body.sql`、`current-operation.body.sql`、`record-proof.body.sql`。尚未经过 PostgreSQL 执行。组级完成 metadata 和有界组读接口正在按主控登记协调，不能用第一片全前缀 PARTIAL 接口充当生产续跑入口。
