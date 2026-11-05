# Fresh35 目录与导入 host 准备

## 当前结论

此增量实现的是 **只读目录证据合同和接线阻断点**，不是可安装、可导入或已验收的 Fresh35 profile。本模块不修改既有 `WHOLE_SALES_V1` 的 178-routine / 56-table profile、固定受保护记录、发布器或同物理连接 admission。并行任务对命令入口新增的失败诊断及其源绑定差异见本文末尾。不得把旧记录复制或改标签后用于 35 表。

新增 profile 名称为 `FRESH35_RETIRED152_V1`，草稿格式为 `FRESH35_INSTALLATION_RECORD_SOURCE_DRAFT_V1`。没有注册可信的初始152目录，没有新固定记录路径或可信发布器，没有运行时 import admission。

## 新文件与调用合同

- `scripts/release/unified-install/fresh35-catalog-contract.mjs`
  - `loadFresh35CatalogSpec(sourceRoot, {schemaDump})` 要求完整前驱178 schema-only dump，再调用 genuine retirement-plan 与编译器生成35/152。绑定源集合、前驱 spec、原始 dump、编译 schema、目录查询及新增模块字节的 SHA-256。
  - dump 的真实来源没有由此 API 认证。测试中的 parser fixture 不是可执行 schema，也不是 PG 证据。
  - `FRESH35_CATALOG_QUERY` 仅保留完整原始目录投影，**去掉全部旧运行时安全/权限判定，不调用应用例程**。不是旧gate的改名执行，不运行显式零库存安全复核。35与152只在返回数据的一致性筛查中使用；trigger/policy实际数量也只报告，不自动批准。新增查询需独立结构观察计划批准后才可运行，本轮从未运行。
  - `validateFresh35CatalogPacket(text, spec, expectedIdentity)` 验证精确35表、152签名/body/search_path、70个对应rowtype/array、7个 validated NULL check、完整目录字段和同一物理 identity。原始packet完整保存关系/列/函数ACL、roles/memberships、RLS/policy、依赖、索引、触发器、默认ACL等。其结果是 `OBSERVATION_ONLY_NOT_ADMISSION`，不是 ACL 审核或依赖闭包验收。`catalogCategoryKeysPresent` 仅表示分类键存在，`catalogMetadataComplete` 明确为 false；不能把空分类或局部body/计数比对冒充完整metadata验收。
- `scripts/release/unified-install/fresh35-catalog-collector.mjs`
  - `collectFresh35Catalog(client, spec, expectedIdentity)` 仅使用调用方已获授权、独占的连接，开启 RR/READ ONLY，设置事务内timeout与search_path，执行固定查询，确认 ROLLBACK。
  - 不创建连接、不创建数据库、不读应用业务行、不提交业务、不发布记录、不关闭调用方连接。采集器先核真实pg8 wire idle/queue/pipeline状态并对每次query、整体和cleanup设界限，拒绝并发调用。未知wire/timeout或cleanup不确定会隔离该client，不把ROLLBACK排到未知查询之后；调用方仍负责独占窗口及隔离后断开、关闭/停库证据。没有查询输出也拒绝。
  - 返回 `{source, catalogJson, observation}`，其中 `source` 明确为 `SUPPLIED_CLIENT_OBSERVATION_NOT_AUTHENTICATED_EXECUTION`。JSON和digest本身不能证明真实执行来源。
- `scripts/release/unified-install/fresh35-catalog-record-draft.mjs`
  - `renderFresh35RecordDraft(spec)` / `validateFresh35RecordDraft(text, spec)` 只生成/校验精确源草稿。physicalTarget、installedAt、reviewedCatalog、migrationLineage、installTransactionAcknowledgment 均保持 null。
  - `loadFresh35InstalledRecord` / `publishFresh35InstalledRecord` 均固定拒绝；不能用调用方传入record、自观察hash或approval替代。
- `tools/unified-import/fresh35-host-session.mjs`
  - `openReviewedFresh35Host` 在读取参数、连接、旧record或执行回调之前固定报 `FRESH35_FIXED_RECORD_INSTALLER_AND_HOST_NOT_WIRED`。
  - `describeFresh35HostReadiness(spec)` 返回未完成门，不给出可安装断言。

`expectedIdentity` 沿用完整物理目录身份，字段为 `system_identifier, database_oid, database_name, owner, controller, runtime_login, server_version_num`。未来运行时 target 仍应沿用既有 `{protocol, system_identifier, database_oid, database_name, catalog_sha256}`，不得发明宽松的 accepted/verified 布尔替代私有授权。

## 真正接通前需要的证据与共享修改

1. 同源真实178前驱 dump/目录来源及 PG dependency 审核，新的合成空35目标与 migration lineage。
2. 在该目标真实观测 trigger/policy/owner/RLS/ACL、依赖及完整schema语义，独立审核其初始目录，不能拿本次观察自动立为reference。
3. 独立固定152记录格式与路径；受保护来源、OS/ACL检查、固定launcher、安装事务结果、耐久发布及故障状态须不低于旧178链。失联/commit未知不可自动重装。
4. 经主控协调修改共享 `whole-host-session.mjs`（或完整独立物理host）、execution/stream admission与选择入口，使新profile只在相同独占physical client内签发私有、一次性/有限生命周期能力。旧177/178不能fallback为新35。
5. 按真实目标验收清单运行安装、导入、verify、原key重放、回滚和普通业务；保留停止证据。显式零库存已有独立安全审核限制不在本模块中绕过。

## 本轮验证范围

新增离线合约测试覆盖源绑定、缺dump拒绝、旧profile不变、目录体漂移/表或rowtype残留/缺ACL/错误NULL check/目标切换拒绝、只读采集与ROLLBACK、并发拒绝、记录不可自签和host提前拒绝。它们是合成测试，不代表PG/真实导入通过。单独解析JSON从不认证其来源。纯目录采集不执行旧安全gate，更不会证明安全gate通过。

## 完整 schema 文本后验比较

`fresh35-catalog-schema-diff.mjs` 的 `compareFresh35SchemaDumps(spec, {compiledSchema, observedSchema})` 核编译schema SHA，并保留所有函数体、quoted identifier、owner/ACL、列顺序、默认值、策略、触发器、索引、序列和其他语句token。仅7个计划内NULL check允许从独立ALTER进入CREATE TABLE内联和精确单/双括号表示差异；非7约束、ONLY以及其他语句/member顺序都不忽略。外层空白、注释和精确pg_dump配置/随机restrict框架不参与比较。

比较应消费同PG版本、同dump选项（含quote-all-identifiers）的真实观察；该函数本身不认证版本、调用来源、角色membership或引擎依赖。来源/实际版本必须由后续计划独立核验。返回 `SCHEMA_TEXT_MATCH_NOT_ADMISSION`，而非安装或发布结果。

真实178证据（2026-11-04已停库）已校验应用dump `1552f7a055ceaa42cfea7656b4f22a52ce3f7bad83915e8c4661f905a7954354` 与 inventory/functions/objects/ACL/dependencies 对应校验和；离线编译schema为 `0d80a108e9e8c02b2f53b77e5cfe432186f9f5d21fab6642ae643abfa52c4be9`。根据真实前驱对象和明确退役集合推算的后继预期为35表、351用户表列、152函数、326约束、111索引、4序列、570触发器（152外部、418内部）、32策略。这些是后续观测对照项，不是实际35目标结果；旧物理身份不得复用。

## 安装后完整声明校验源码（新模块，另行审查）

`fresh35-catalog-postconditions.mjs` 从固定SHA的真实178证据读取完整函数definition、ACL和结构对象，生成安装事务中的只读后验guard。API为 `loadFresh35PostconditionEvidence(directory)` 与 `buildFresh35CatalogPostconditions(evidence, genuinePlan, {oldOwner:newOwner, oldController:newController}, genuineMetadata?)`。它内部重新编译原dump、使用显式身份映射，再核genuine metadata的sourceSha256；不接受调用方的 `complete:true` 或任意SQL补充。

覆盖源码预期为：152完整函数definition哈希/owner/ACL、schema ACL与owner default-ACL空集、150个关系及ACL/RLS/存储和逻辑标志、351个列ACL及完整列声明/生成列/默认值、326约束、111索引、570触发器（内部系统名仅转为结构标识）、4序列参数/ownership、32策略表达式/角色、70个配对rowtype/array。原OID由关系和约束名称等语义地址替代，不移植到新库。前驱fast-default的missing-value存储优化不是直接CREATE TABLE的逻辑声明，新目标要求无missing cell。

该SQL只读取目录并比较期望，不执行应用例程、不调用旧has_*权限安全gate、不写发行记录。原函数/触发器/策略源码在JSON期望中出现不表示执行它们。完整源码生成也不是engineVerified或installationReady。

在当前共享工作树，18:10 UTC发现并行CLI诊断改变了whole-sales spec所绑定的 `stream-import-cli.mjs`。后验源码测试按设计拒绝旧178证据与当前新spec配对，未修改pin放行。精确差异和失败日志在 `RETIREMENT-HOST-SOURCE-DRIFT.md`。需要主控冻结正确源集合并独立审查后才可重跑/计划新35执行；本轮仍未连接或执行新35数据库。


## r3 独立源码审查与采集上下文边界（2026-11-04 18:29 UTC）

独立旧178结构分析快照位于 `/workspace/shared/fresh35-structure-review-20261104-1822-r3`，不是当前完整CLI源码，也不是新35执行许可。其组合源码测试54/54通过，无skip；postconditions独立复核6/6通过，无skip。SQL中9组目录集合比较全部使用限定的 `observed.item` / `declared.value`，不与DO变量冲突；显式C collation按 `{schema,name}` 对象比较。独立重渲染逐字节匹配：

- postconditions module SHA256: `989b3d7aeb33b2fa008f468130e55819b56f0ba0a34f599666256bbfb752af35`
- generated review SQL SHA256: `57a03cdeb22a73e26cd3420cbb746cffce855cb14801ed1b8606853f0ef8fa9e`
- metadata model SHA256: `727ce4aa4657fc2e87497dcdbd3d1ab1c94cb1ec8ae5dd0301b1dca52377eaf5`

已只读追溯原178采集器：`/workspace/shared/schema178-plan-20261104-1710/inventory.sql` SHA256为 `fb33765d7f4dadfcf9ba07fecd9830d807af0b6fae1594f0365091320fcdca4c`，`run.py` SHA256为 `bc8068820864dcf1c7c60be054442a264475cdb86856d02abb1d8a7529900a2e`。snapshot前缀显式固定 `search_path=pg_catalog`；函数、约束、索引、触发器均采用单参数 `pg_get_*def`，原SQL没有显式传pretty参数。采集会话没有显式设置或读取 `quote_all_identifiers`，保留配置与输出支持其默认off，但不能据此宣称该设置有实测记录。两个pg_dump另用独立连接，明确启用 `--quote-all-identifiers`，不等于目录采集会话也启用。

新证据计划应显式保存各会话的server_version、search_path、quote_all_identifiers和deparser调用形式，再按当前最终源码重建与绑定证据。旧实例已停止且旧临时身份已撤销，不为核实设置而重启、重连或复用。当前树对旧178证据仍拒绝，原失败日志与旧bundle保留；所有engine/current-CLI/admission/install声明仍为false。
