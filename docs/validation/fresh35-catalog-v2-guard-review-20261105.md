# Fresh35 V2 目录 guard 审阅源码，2026-11-05

## 状态与边界

本增量仅新增离线源码、离线测试和本文档，不修改既有模块、冻结清单或原始 177 来源。唯一公共 API 是 `buildFresh35V2CatalogGuardReview(root, analysis, identityMapping)`。

返回状态为 `UNREVIEWED_BLOCKED_GUARD_SOURCE`。唯一 SQL 字段 `guardReviewSql` 是一个 DO statement；首个可执行语句无条件抛出 `FRESH35_V2_GUARD_REVIEW_NOT_AUTHORIZED`。模型赋值、目录比较和 transaction-local GUC 设置全部位于此语句之后、同一个 DO 内。没有异常处理、跳过开关、单独的无阻挡比较 SQL、installer、record、profile 注册或 host 能力。

源码中没有 DDL、ACL 修改或业务写入语句。包含不可达的 `pg_catalog.set_config`，用于把 `search_path` 固定为 `pg_catalog`，并保持旧目录比较所需的 core `quote_all_identifiers=off` 与 dump 声明 `quote_all_identifiers=on` 两种反解析语义。因此不把整段 SQL 笼统称为“全只读 SQL”。SQL 未提交给 PostgreSQL，未被 PostgreSQL 解析或执行；不能称完整可执行安装 guard 已具备。

以下值保持 false：`reviewedEvidenceRegistered`、`independentSafetyReviewComplete`、`executionProvenanceAuthenticated`、`catalogMetadataComplete`、`engineDependenciesVerified`、`engineVerified`、`executionAuthorized`、`installationReady`、`targetAdmitted`、`hostEnabled`、`existingTargetMutation`、`existingDataMigrationSupported`、`oldTablesRemoved`、`sqlParsedByPostgres`、`sqlExecutedByPostgres`、`guardReviewCodeRanDuringCapture`。

## 输入与来源绑定

- 只接受现有 V2 adapter 实际产生的 genuine analysis。复制对象、调用方布尔值和伪造 model 都不能代替它。
- 身份映射必须是普通 data properties，先独立快照；四个 source/target 值必须都是 primitive string，之后才可递归冻结副本。拒绝 accessor、嵌套标量对象、额外参数、额外 mapping 字段、错误 source 标签和不符合现有约束的 target 标签。不冻结调用方对象。
- 入口及返回前使用 adapter 的 `assertCurrent`，并重新执行现有纯 V2 projection。不会接受调用方提供的 projection 或 metadata。
- 独立绑定本 guard-review 文件的加载时 hash。最终完整来源列表在模型生成前、返回前分别逐文件复核全部 180 项，包含 projection 文件，不能只用 adapter 的 178 项当前性检查代替。
- `captureSourcePins` / `captureSourceBindingSha256` 指原 177 捕获来源。`projectionSourceSetSha256` 指原 177 + adapter + projection。`guardReviewSourceSetSha256` 指原 177 + adapter + projection + 本 guard-review 文件，共 180 项。
- 这个 180 项集合不等于安装 source candidate 的另一个 180 项集合；数量相同不表示 hash、成员或权限相同。本增量不修改安装 candidate 冻结清单。
- `guardReviewSourcePin` 单独指明后写 renderer 的来源。它没有在原 capture 中执行过。来源检查是离散文件读取，不是原子文件系统快照，也不认证目标环境或执行 provenance。

所选证据为已存在的 178 V2 snapshot；SHA256SUMS 文件的 SHA-256 为 `700f43affb2bdb035b4f50dab9613613db9498eec67bf2ab5d81e6f0f723d3e5`。`artifactPins`、全部 87 项 `evidencePins`、manifest hash 和 dump hash 原样保留，用于标识 adapter 已验证的内存输入快照，不代表新增采证或安全审阅。

## 离线预期模型与比较范围

模型包含 35 tables、351 columns、4 sequences、32 policies、152 routines、326 constraints、111 indexes、570 triggers、150 relations、351 column ACL 行，以及空 default ACL 多集。

columns 使用声明解析结果与对应实采 `pg_attribute` 属性组合。默认值、generated expression、UUID 数组维度、类型与 typmod、nullability、identity、显式 C collation 都进入精确行比较。仅按既有 fresh CREATE TABLE 语义将 predecessor fast-default `atthasmissing` / `attmissingval` 归一为 false / null；没有把 predecessor 的物理 missing-cell 优化冒充新表必需状态。

sequence 参数保持十进制字符串，含 owner、类型、start/increment/min/max/cache/cycle 与 owned-by 关系。policy 保留 command、permissive、排序 roles、USING 与 WITH CHECK 表达式。core 使用原 V2 projection 的完整函数 definition SHA-256，非仅 body hash；同时比较 owner/ACL、relations、constraints、indexes、triggers、schema ACL 及 owner/schema 范围 default ACL。

集合比较按完整 JSONB 行排序后保留重复项；不是仅比较数量，也不使用 DISTINCT。PL/pgSQL 变量使用 `routine_item`，SQL 子查询使用 `observed.entry`，避免旧 `item` 名字冲突。SQL 只引用目录对象和明确列出的反解析/GUC函数。

## 相对旧 V1 的 rowtype 差异和证据缺口

178 inventory 没有捕获 `pg_type` 原始行。旧 V1 比较只有 70 行数量、owner/ACL 及 composite/array 类型关系判断。本审阅候选改为明确列出由 35 张表声明推导的 35 composite + 35 array 语义行，标为 `DERIVED_FROM_TABLE_DECLARATIONS`。

每行只包含 schema/name/owner/ACL/kind/category 和 table/element/array 关系。SQL 候选比较整个 schema 的类型集合，并检查 table→rowtype、rowtype→table、composite→array、array→composite 双向关系与 schema 归属。额外旧表类型、旧数组类型、重复行、错误连接和意外非零引用都不能被集合过滤静默省略。无法解析的非零引用产生显式 `<UNRESOLVED>` 失配值。

这些是离线声明预期，不是实采 `pg_type` 属性。未凭经验补齐 typinput、typoutput、存储属性或其他未采字段。`missingEvidence` 明确保留 `RAW_PG_TYPE_ROWS_AND_UNMODELED_TYPE_PROPERTIES` 和 `AUTHORIZED_NEW35_TARGET_CATALOG_AND_ENGINE_DEPENDENCIES`；`catalogMetadataComplete` 保持 false。

仍缺：独立 V2 evidence/安全审阅、未建模类型与完整目标依赖证据、明确 reviewed profile 和可执行 guard 的授权绑定、经授权新 35 表目标的安装与实际 PG 目录检查、全包重放/回滚及普通业务验收。本增量不降低这些门槛，不重试已拒操作，不进入现存业务目标。

## 离线测试

先新增测试，再运行得到预期红灯 `ERR_MODULE_NOT_FOUND`，随后新增实现。首轮新增测试 8/8 通过、0 skip；最终加入原 V2 projection 回归，合计 12/12 通过、0 skip（Node v24.22.1）。测试覆盖 genuine brand、精确完整模型、身份映射与独立来源漂移、180 来源及证据 pin、同 DO 首部无条件拒绝、无 DDL/ACL/业务写入、只有固定不可达 GUC 设置、无绕过参数、rowtype 旧表/数组残留与双向错配模型、全部 false 状态，以及原 V1/V2 已审入口继续拒绝。

最终命令：

`FRESH35_V2_EVIDENCE_DIR=/workspace/scratch/f6bee04e937b/cloud-pg-schema178v2-20261105-r2/evidence node --test tests/fresh35-catalog-v2-guard-review.test.mjs tests/fresh35-retirement-v2-projection.test.mjs`

测试入口是 `tests/fresh35-catalog-v2-guard-review.test.mjs`。真实 pinned snapshot 测试需要 `FRESH35_V2_EVIDENCE_DIR` 指向已存在的证据目录；未设置时会显式 skip，不能将 skip 当通过。仅执行 Node 离线测试，不连接 PostgreSQL，不读取凭据，不使用网络、端口或数据库进程管理。

### 独审后的标量输入边界修复

初版及上述 12 项通过记录保留为历史。独审发现：data descriptor 本身安全，不表示其值一定是安全标量；source/target 若持有含 getter 的对象，原递归 freeze 会触发内部 getter，普通嵌套对象也会被冻住。

先新增两项 RED 测试，使用 genuine analysis 实际得到 `reads=1` 和调用方嵌套对象 `Object.isFrozen=true`，然后在 fields 快照后、freeze 之前严格验证四个值都是 string。回归分别覆盖 owner/controller 的 source/target 四个位置，要求 getter 零调用、调用方所有对象仍可变。合法映射的固定输出 hash 也加入断言：model `5617b3e43d5796e6e906c91720abf5d2071d99edb8926da0556bbf0f1853a264`，blocked SQL `1c7b343153efa2d1746b3d7768670e0eeda4f9dfc19b8e25bc15375a210795c3`。本修复不改变合法模型/SQL或原 captured 来源，仅更新 guard-review 模块自身 pin 与对应来源集合 hash。

修复后重新执行上方同一联合命令，得到 **14/14 通过、0 fail、0 skip**：guard-review 10 项，原 projection 4 项。新增两项 RED 均转绿，模型/SQL固定 hash 保持一致；先前 12 项及其他独审联合结果只作为历史记录，不替代这次实际复测。
