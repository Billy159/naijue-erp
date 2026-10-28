# H02 已授权有效单据集合：当前消费者与验证边界

本次沿现有三个 reader 收敛，不新增表、字段、投影、缓存或写模型。B08 的授权候选集合、P03 的单请求计数/分页和 P04 的差额/守恒实现直接复用。源检查和协议 fixture 不代表 PostgreSQL、实际权限或性能通过；P04 实际驱动仍待原人类 ACL 授权。

## 权威来源与本次真实改动

- `history_*_header/line` 保存来源；已发布批次、完整 manifest、原 `IMPORT_PUBLISH` 的 receipt/claim/audit 决定历史资料是否可读。继续使用 `importedHistoryReadSql`，STAGED 不进入普通历史集合。
- `history_*_effective` 与原 revision 链是现有修订读投影。`headerValidity`、行有效性、原版本与单据身份检查保留；不直接拿最新 revision 或当前人员资料补造原单据事实。
- 普通列表与独立历史接口原先各写了一份调拨按厅谓词。本次只合并这份真实重复：`transferHallScopeSql` 保留来源仓库绑定、effective 两端仓所属厅、原创建厅及原营业员创建依据。普通页面保留原 scalar hall bind；显式历史 `TRANSFER_HALL_IDS` 保留原 array bind，修订调用的 proposed endpoint bind 也保留。新单厅入口只返回惰性 SQL，不签发权限。
- `authorized-effective-documents.ts` 被销货、调拨和独立历史列表实际消费，统一 dataset/batch/document/effectiveVersion、完整分页与身份重复校验，以及普通列表的 nullable 精确数量/金额解码。原 SQL 显式授权与发布证明仍由原 reader 在原 RR client 验证；该共享模块本身不是授权提供方。

## 消费范围

| 实际消费者 | 当前集合和约束 | 本次处理 |
| --- | --- | --- |
| 销货/调拨普通列表 | LIVE 与已授权、已发布、有效修订的 HISTORY；同一筛选用于 count、page、全筛选 totals | 保留 P03 单条 SQL、`matched AS MATERIALIZED`、分页前 scope、全授权历史坏对象校验；接共享身份/分页/精确 nullable 解码 |
| 销货筛选候选 | B08 的授权 LIVE/HISTORY 文档引用并集，保留停用但被历史引用的对象 | 复用相同 `normalDocumentReferenceScopeOn`；不自行加入候选 API 未接收的列表筛选字段 |
| 调拨 restricted 仓库候选 | 同一授权文档并集的 effective 两端仓，搜索/selectedIds 再相交 | 接同一个历史按厅谓词；不把 selectedIds 当授权 |
| 调拨 all-scope 仓库候选 | B08 明确保留的全仓目录例外 | 主控本轮明确确认保留；不改成仅文档出现过的仓库 |
| 独立历史列表/详情 | 原显式 HISTORY grant；exact19 读来源，exact26 读原 effective 投影；未发布不可见 | 列表接共享身份/分页，保留 P03 单条 count/page SQL、原 DTO 校验和类型差异；详情按厅谓词复用 |
| 销货结算统计 | 原 LIVE、APPROVED 的支付账户统计 | 主控本轮确认是 LIVE-only 例外；没有 HISTORY 结算统计验收，不添加 DTO 字段或混入历史金额 |
| 已有详情导出/打印 | 现有 Web 详情输出消费者，非本次六文件 owner | 不新增列表全筛选导出接口。其准确版本、授权/effective 详情消费由最终 H02/G01 另核；本轮未测 |

候选与列表共享授权/资料来源集合，不意味着候选 API 已承诺支持所有列表筛选。结算统计的 LIVE-only 口径及 all-scope 仓库广目录例外均已由主控在本轮确认。

## 日期、未知与精确值

业务日期沿原 effective business date 表达式筛选；原 local timestamp 与已知 UTC instant 分开保留，未知仍为 NULL。修订版本不是原创建/审核人或时间的替代来源；修订时间留在原 revision/audit 读取，不新增或借用原时间字段。

数量和金额保持原 SQL 精确文本及 BigInt 解码。NULL、零、缺失字段和非法数据库值分别保留或拒绝。未知赠品使原数量聚合保持 NULL；未出现的明细集合与实际已知零仍遵循原 SQL 规则，不用 JavaScript Number 累计金额/数量。分页只把有界页长度转为 Number，total/offset 比较使用 BigInt。

历史已计入基线的量不完整再过账。原 `planHistoryRevision` 的 A→B→C 净差必须等于 A→C，调拨 FROM/TO 差额和为零；读取治理不改变该写入合同，也不执行修订写操作。

## 检查与后续

新增 fixture 调用真实三个 reader、真实 SQL 构造与解码，以及原修订 planner，覆盖 LIVE-only/HISTORY-only/mixed、未知时间/金额/赠品相关数量、坏身份/版本/批次、分页前权限谓词、原 scalar/array 参数与调拨两端差额。存储返回是明确 scripted fixture，不是 SQL 执行器。

仅补受影响的 B08 参数与 P03 共享 CTE 检查，复用已有同范围结论；不恢复双扫描、不重跑无关旧业务套。真实 PostgreSQL parse/ACL/EXPLAIN、同条件跨消费者结果、并发快照/取消和 SLO 尚未验证。最终 H02/G01 须沿唯一 T45 的获准隔离目标补证，不能据本文件或局部测试放行整体上线。

回退仅撤本次六叶的源变更；原数据库、发布状态、来源、revision、请求键及写事务均未修改，不需要数据回退。后续如确需新投影、SQL DDL、字段、写合同或额外消费者写范围，先给主控准确差异；本次未申请也未实施。
