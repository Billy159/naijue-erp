> 本包实际工具入口为 source/scripts/release/ 的已离线测试 successor；本文中的 candidate/recovery 路径为制备审计引用，不是让主控执行这些云端路径。操作以本目录 READONLY-TOOLS.zh-CN.md 为准。

# 新源码随包：主控操作顺序 + 只读入口候选

> **醒目阻断：尚未证明通用完整V6从零安装器。新库只装1–26不能直接执行V7。这里新增的入口只做只读核查，不升级数据库。V7 preparation renderer仅用于其封闭合成scope，不是production脚本。**

## Repo-relative新增候选

将 `candidate/` 中两文件置于新源码相同相对路径（由root先测试、再打包，本代理未运行）：
- `scripts/release/render-runtime26-readonly-check.mjs`
- `scripts/release/compare-runtime26-metadata.py`

无需数据库驱动依赖。renderer仅复用既有 `adapters/postgres/src/native-import-accounting-capability.ts` 导出的V6/V7 SELECT；本身不连接数据库。须在已确认且完整可信的新源码根运行；sourceFile必须为固定repo-relative路径、SHA256必须与包一致；sourceCommit只是声明，主控仍须独立验证整个commit/依赖来源。既有export probe没有返回manifest，本候选只在最终SELECT增加去除routine.source后的manifest输出，不改原catalog hash计算。

### 1. 准备读取计划（没有可用默认目标）

计划是JSON，必须提供全部键：

```
format: RUNTIME26_READONLY_METADATA_PLAN_V1
scope: EXACT_TARGET_METADATA_ONLY_NO_UPGRADE
sourceFile: adapters/postgres/src/native-import-accounting-capability.ts
sourceSha256: <实际文件SHA256>
sourceCommit: <已确认40位commit>
profile: V6 或 V7
target:
  database: <精确名称>
  databaseOid: <实际OID字符串>
  runtimeRole: <已授权普通LOGIN角色>
  sessionUser: <同runtimeRole，不允许管理员SET ROLE>
  serverAddress: <实际地址字符串；Unix必须显式null>
  serverPort: <实际整数；Unix必须显式null>
  postmasterStart: <实际时间字符串>
  serverVersionNum: <实际版本字符串>
```

所有目标值由主控现有受控元数据渠道确认；不知道就REFUSE，不能自动探测生产或猜测。无密码/连接URL字段。Unix null仅支持只读身份核查，不构成V7 preparation的Unix目标授权或认证配置。

### 2. 生成并审查观察脚本（离线）

在新源码根使用包要求Node24环境：

```
node scripts/release/render-runtime26-readonly-check.mjs /absolute/reviewed-plan.json > /absolute/private-output/catalog-readonly.psql
```

确认renderer退出0、源SHA、目标guard、READ ONLY、原probe和ROLLBACK完整后，才由主控在明确授权的数据库身份上使用现有受控psql连接入口执行该文件。**不提供默认数据库、用户名、地址、密码、PGPASSWORD或生产连接命令。** psql必须禁用个人startup（`-X`），保留`ON_ERROR_STOP`；不在已有业务事务内运行；全程普通LOGIN身份。目标不匹配用除零终止，禁止错误后跳过guard继续。数据库拒绝或超时即停止，不提权、不改ACL。

脚本仅BEGIN READ ONLY/局部超时与search_path设置/SELECT/ROLLBACK；不写DDL、ACL、业务表，不执行应用自定义函数。原probe只读取schema_migration版本及PG catalog；manifest不含业务行或凭据值，routine.source已去除。输出含角色/对象名称等内部元数据，私有保存，不公开贴仓库。

主控使用psql原有JSON/CSV/unaligned捕获能力保存**probe那一行**的字段（不要把guard的数字行当catalog）。本候选没有自行实现在线结果导出/连接器：由主控把原始行无修改封装为下面observation。保留原psql日志与文件hash；禁止手工改true或catalog_sha256。

### 3. 离线比对入口

actual.json：`sourceCommit`、`sourceSha256`、`observation`（完整原行：manifest/identity/migration_versions/catalog_sha256/source_routines_match/complete_write_xmin_acl_match，V7再含recorded_live_balance_contract_match）。

expected.json：同样字段，加 `independentReview: {decision:"REVIEWED_EXPECTED_METADATA", reviewId:"独立审核记录标识"}`。必须是**同精确目标、同直接LOGIN角色形态、同源commit的独立真实预期catalog**；其来源/签审由主控验证。标签不是签名；本工具不签审、不制造expected，不接受用actual复制expected作为审核。目标尚未有完整V6基准时，先依据README源码索引与MAIN-CONTROL-CHECKLIST建立受审查差异/隔离方案；此时入口应REFUSE，不从fixture构造hash。

```
python3 scripts/release/compare-runtime26-metadata.py /absolute/private/actual.json /absolute/private/expected.json > /absolute/private/differences.json
```

不连接DB。缺完整manifest、target/source不一致、无独立expected标识均REFUSE（退出2）；存在差异也REFUSE（退出2）。精确匹配退出0仍仅`EXACT_METADATA_ONLY_NOT_UPGRADE_AUTHORIZATION`，不是运行/部署许可。输出逐signature body/definition hash差异、ACL/role/system-column权限差异及结构字段差异；复杂结构值只输出hash，原始actual/expected保留私有供审核，绝不输出routine.source。

### 4. 最小随源码材料（不表示完整运行依赖）

- 原工程完整可构建源码、lockfile/config，与已确认commit和发布artifact hash绑定；不要只交下列少数文件当完整app。
- `adapters/postgres/migrations/*.sql`（26个原字节，不重写历史）
- `adapters/postgres/patches/*.sql`（18个原字节，顺序/分支辨别见README，不全部盲执行）
- `adapters/postgres/src/native-import-accounting-capability.ts`
- `apps/api/src/postgres-read-api.ts`
- `config/release-contract.json`
- `scripts/release/prepare-runtime26-v6.mjs`及原tests（不是完整安装器）
- 上述两只读入口候选及root独立测试结果
- 0030的V7 renderer候选按 `scripts/release/prepare-runtime26-v7.mjs` 单独复核纳入；0018/0030测试及静态/来源合同随交接保留。不得把两个renderer版本互相覆盖后混用测试。
- 本目录README、CHECKLIST、所有pins和本说明；源码文件hash相对根以SOURCE-PINS为准，外部候选文件见V7-CANDIDATE-PINS。

### 5. 主控阶段门

先核查当前入口/新源码/GitHub基线 → 只读导出actual与明确七项签名/ACL差异 → 完整V6隔离安装方案和最小ACL另审 → 真实普通PG V6通过 → V7有限增量隔离演练/真实普通PG → 新入口应用兼容/回滚验证 → 单独申请线上数据库升级与切换。

GitHub先核查目标repo/分支/CI部署触发条件，独立准备分支推送完整新源码与hash材料；推送不自动迁移库，不覆盖发布分支或触发部署。主控如果当前仅有最初版，必须先核对新的准确commit，不依据旧远端patch就操作真实库。
