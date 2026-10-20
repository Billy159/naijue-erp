# 奈爵服饰 ERP v0.0.1 工程

当前工程版本：**v0.0.1**；已进入多模块正式开发与验收，尚未完成 ERP V2。ERP V2 是正式开发与上线主计划的目标。

独立工程路径：`/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1`。

> 目录命名更正（2026-10-02）：本工程最初以`naijue-erp-v2`目录名建立，按用户指示改为`naijue-erp-v0.0.1`；ERP V2仍是项目目标，目录名表示当前阶段。冻结Demo与`8877-final-baseline`保持不变。

T07已建立严格TypeScript/Fastify5构建基础，前端从最终冻结提交`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`选择性复制并继续按既定业务实现。当前源码已有数据库、身份权限、媒体、事务、库存、商品及公共输出/导入等模块；真实服务是否启用取决于显式环境及安全配置。健康契约仍返回`applicationStage=foundation`、`businessReady=false`，不代表源码只有健康接口，也不代表生产业务已开放。各任务/Gate状态以监工最新限定范围验收为准。

## 本地构建

锁定 Node **24.21.0** / npm **11.19.0**。`.nvmrc`、`.node-version`、`packageManager`、`engines` 和执行检查一致；工程内 runtime 不改变电脑上其他项目的 Node。

已有正确版本时直接执行 npm；本机已放置工程内 runtime，可使用以下命令。新开发机有其他 Node 时先执行 `node scripts/bootstrap-node.mjs`，从官方发布目录下载并核验 SHA256。

```sh
./scripts/npm.sh ci --no-audit --no-fund
./scripts/npm.sh run build
./scripts/npm.sh run lint
./scripts/npm.sh run check:dependencies
./scripts/npm.sh test
./scripts/npm.sh run release:pack
./scripts/npm.sh run release:verify
./scripts/npm.sh run release:smoke
```

`npm run check`连续执行构建、lint、依赖核验及当前`tests/*.test.mjs`，已不限于T07测试。完整十九组前端/十一组旧后端接入由 T14 负责；各专项是否建立隔离数据库以所属任务命令为准；不得由T07历史测试行为推断当前全套检查均不连接数据库。T07 的类型错误反例会短暂删除自身生成的后端包并重新构建，保持正式源码不变。

输出：`dist/server/` 严格编译的服务、`dist/web/` 白名单前端、两个构建摘要。前端构建的 Vite 输出覆盖至 `dist`，不向源码 `frontend/assets` 写 bundle。后端类型错误会退出非零并清除旧产物，禁止用旧包冒充新构建成功。`references` 中的旧后端不参与正式构建；原有幂等领域模块保持原文复制到 `server/domain/idempotency/` 并接受严格检查，事务等业务接入的当前范围见对应任务交付与验收。

可单独验证后端启动：

```sh
APP_ENV=local APP_PORT=18878 ./scripts/npm.sh start
```

默认绑定 `127.0.0.1:18878`，与 Demo 8877/8878 分开。该启动例默认本地回环；前端由同源Web层托管并请求`/api`。只配置基础健康模式时不连接数据库；配置显式数据库及安全参数后由当前源码注册受权业务接口。不得把启动例或页面包直接当生产开放许可。

## 资源和发布边界

`config/frontend-release.json`明确当前JSX/Vite入口及公开脚本、样式、字体和许可文件；入口数量以该现行清单为准，不沿用T07七入口快照。每次构建生成完整文件 SHA256 清单，核验 HTML 引用、字体和模块依赖。所有商品原图及缩略图保持源码路径和摘要，登记在 `outputs/T07/copied-source-manifest.json`，不放入公开静态包；T13已有媒体持久化交付，具体迁入范围与未知属性见下文及T13报告。

`npm run release:pack` 生成 `outputs/releases/naijue-erp-v0.0.1-t07-*.tar.gz`。包仅含已验证的 `web/`、编译后的 `server/`、构建清单、精简运行 `package.json` 和离线生成的运行锁。没有 `node_modules`；运行依赖在目标构建环境按锁安装，T45 再生成并验证 `linux/amd64` 镜像。本机 arm64 产物不冒称服务器镜像。

打包前会比较源码、构建产物、配置及锁文件摘要，拒绝过期构建。打包后实际展开归档并逐文件回读，拒绝输入原件、工作簿、CSV、备份、密码/密钥、`.env`、参考源码、商品原图、测试与日志。配置模板位于 `config/templates/`，只含空值和示例；不随发布包传递。

## 目录与执行依据

```text
frontend/                 冻结前端源码、检查与受保护图片
server/                   正式严格 TypeScript 后端
scripts/                  版本检查、构建、资源/归档核验
tests/                    当前构建边界和各专项验证
config/                   当前发布白名单、工具链和配置模板
references/frozen-baseline/ 选择性复制的领域规则/旧后端，禁止作为正式服务启动
references/planning-20261001/ T07当时计划及T01/T05/T06依据的不可改写历史副本
references/planning-20261002/ 当前计划、访问/库存裁决及阶段验收（含10月3日同步）
inputs/                   未来原件入口，当前为空且不进入Git/发布
work/                     中间工作与独立归档展开
outputs/T07/              验收报告、复制与保护摘要
outputs/releases/         本地构建归档及回读结果
logs/T07/                 安装、构建、检查、失败与复测证据
```

T07当时读取的主计划 SHA256 为 `1fce30aa357ee6ac133d706a61f94801889fcca01306980c8b06a09ec8e16e20`。任务清单旧 `plan_sha256=1e1a074f…` 的旁项和原副本继续保留；本次不改写T07验收证据。T01/T05/T06及G0原放行有效，不自动放行后续Gate。

当前执行计划使用[2026-10-02主计划](references/planning-20261002/主计划.md)和[任务清单](references/planning-20261002/任务清单.json)，内容/摘要同步主控此次授权修订。员工固定公网HTTPS＋ERP账号，优先现有花生壳，无Tailscale；管理员继续Tailscale+SSH，公网不开放SSH/PG/Docker API/内部管理，测试保持隔离。T02/T04原准入已通过，T15按基础双环境及公网维护入口阶段PASS：原URL/443及服务器18080回源已证。剩余U02/U04/U05/U06及最终外部边界仍按G4/G5/G6；实际业务未开放，不重装或重做已验收任务。原登录/三角色/业务规则不变。

后续开发请将 Codex 项目主文件夹切换到 **naijue-erp-v0.0.1**，将 **奈爵服饰-8877-Demo** 设为附加源文件夹。此后新执行任务在正式工程创建，Demo 继续冻结只读。

当前文件及历史交付边界见[全量同步说明](references/planning-20261002/全量计划同步说明-20261003.md)。以下Txx分节描述对应交付的功能和测试范围，不作为永久运行状态表；过往“等待验收”等时点说明以监工最新记录覆盖。

## T11 前端统一服务适配

`frontend/service-client.js` 收口认证、业务桥接和历史读取适配器，所有请求使用相对 `/api` 与同源 Cookie。URL 中旧 `account-api` 参数不再选择服务，读取结果也不再绑定旧库名、schema 或批次。原业务数据映射、SKU/条码/图片身份及 React 19 / Arco 2.66.16 保持。

写入发出前记录原请求 ID；响应丢失、超时或回读失败时保留输入，显示“查询原请求”，阻止同对象同操作的新提交。查询只读取原结果，`NOT_FOUND` 不代表已回滚；成功后回读最新受权单据，明确回滚后才允许重新提交。索引和销货/调拨草稿按当前账号隔离，刷新可恢复。busy 覆盖业务提交、详情/库存回读和列表回读。

恢复运输约定、后端接入要求与验证边界见 [T11 服务合同](outputs/T11/SERVICE-CONTRACT.md) 和 [T11 验收报告](outputs/T11/REPORT.md)。本任务使用合成数据替身与本机独立 Chrome，通过局域网地址验证同源取数；未访问正式服务器或业务数据库，不代表后端幂等、异机实务或上线 Gate 已通过。

T11 请求层回归：`./scripts/npm.sh exec -- node --test tests/frontend-service.test.mjs`。测试默认纳入工程 `npm test`；浏览器证据和替身只在 `outputs/T11/`、`logs/T11/`，不进入静态发布白名单。

## T08 数据库版本迁移

T08 建立显式 Source / Runtime / Auth / Control 配置、环境身份、非超级用户应用角色与两项版本化 DDL；没有请求内建表、默认业务库/系统用户、伪管理员种子或历史回填。新空库建立结构，当前冻结备份的隔离恢复库先核对结构再升级；原历史人员、修订、版本和业务行保持原值。新 Auth 为空，账号方案和业务接入由后续 T09/T10/T37 执行。

使用及交接见 [T08 数据库指南](outputs/T08/DATABASE-GUIDE.md)，相称验证及逐项证据见 [T08 验收报告](outputs/T08/REPORT.md)。维护命令先读显式环境变量，拒绝 production 与非 demo_8877_* 目标；不连接现有业务库或服务器。仅本地 foundation 健康启动可继续不配置数据库；stage/qa/production 必须填齐配置，不能用空值或默认账号运行。

```sh
./scripts/npm.sh run build:backend
./scripts/npm.sh run database:plan
./scripts/npm.sh run database:bootstrap
./scripts/npm.sh run database:migrate
./scripts/npm.sh run database:inspect
T08_PG_BIN=/Users/billy/pg17/bin ./scripts/npm.sh run test:database
```

数据库复验自行建立并停止独立本地 PostgreSQL 实例，原件只读；证据归 outputs/T08 与 logs/T08。构建/测试/打包可指定 `ERP_TASK_ID=T08`，本任务发布归档放 outputs/T08/release，测试不会覆盖 T07 的已有交付记录。当前仍为业务未就绪的 foundation，T08 自验不代替主控验收或后续上线 Gate。

## T09 连接池与数据访问层

`server/database/access.ts` 提供 `read`、`transaction` 和 `close`。每个动作只借用一个 pg 连接，在同一连接执行 T08 环境身份、角色权限和精确迁移版本核验，再进入参数化仓储查询；失败回滚并销毁连接，成功清理会话后归池。HTTP 持有惰性连接池并在关闭时释放，健康接口仍为 `businessReady=false`，没有新增匿名业务入口。

接口、锁顺序、超时、精度与后续接入约束见 [T09 数据访问指南](outputs/T09/DATA-ACCESS-GUIDE.md)，逐项证据见 [T09 验收报告](outputs/T09/REPORT.md)。运行目标目前继续限定为显式 `demo_8877_*` 非生产库；服务器与正式切换仍待后续授权。

```sh
T09_PG_BIN=/Users/billy/pg17/bin ./scripts/npm.sh run test:data-access
ERP_TASK_ID=T09 ./scripts/npm.sh run check
```

专项验证在 `logs/T09/` 严格编译独立副本并新建 PostgreSQL 17 实例，禁用 TCP，使用两个合成夹具库；不依赖并行任务可重建的共享 `dist`。完成后停止实例，证据归 `outputs/T09/` 和 `logs/T09/`。`psql` 仅留在 T08 维护工具中，不进入 HTTP 数据访问导入链；身份权限和库存业务内核分别由 T10/T17 实现。

## T10 服务端身份与权限

`server/security/` 使用 T09 动作连接，按 T05 固定角色、单据营业厅、原始录入 actor 和每侧仓库检查权限。所有业务入口必须通过 `registerBusinessRoute` 与 `IdentityService.execute` 接入；账号变更撤销旧会话，权限核验与业务动作在同一事务内完成。旧查询、输出、打印及媒体入口先鉴权，未接入的业务模块明确返回未实现；库存过账仍归 T17，`businessReady` 保持 false。

启用身份服务需同时显式配置 `SESSION_ORIGIN`（准确 HTTPS 来源）和 `SESSION_SECRET_FILE`（外部、本人属主、私有权限、32–128 字节密钥），会话最长 8 小时。Cookie 固定 Secure/HttpOnly/SameSite/Host 范围，并绑定环境、数据库实例、schema 与来源；写请求需同源 JSON 和会话 CSRF 令牌。没有安全配置时仍为仅健康接口的 foundation，不开放账号初始化入口或业务数据。

```sh
T10_PG_BIN=/Users/billy/pg17/bin ./scripts/npm.sh run test:auth
ERP_TASK_ID=T10 ./scripts/npm.sh run check
```

专项测试在 `logs/T10/` 编译独立后端、新建并停止私有 PostgreSQL 17 实例和两个 `demo_8877_*` 库。只放合成人员、商品和单据，每个拒绝用四 schema 的全表/序列指纹前后比较；不连接生产、真实业务库或服务器。接入合同、权限矩阵、主控验收证据归 `outputs/T10/`；不改写 T14 流水线入口。

## T13 媒体持久化

媒体只通过 T10 受权服务读写。图片先以 base64 JSON 暂存，服务端检查字节签名与解码结果、生成 WebP 缩略图，再以 SHA-256 内容路径写入私有目录；数据库身份校验先完成，文件写入在数据库动作外，随后用 T09 数据动作关联 `runtime.product_image`。取消只清理暂存文件。替换会把旧运行态记录标为 `history/` 并保留其文件与历史快照。清理前核对 Source/Runtime 媒体行、登记索引及显式备份摘要；有引用且缺少持久副本的暂存会保留。超过 7 天且无上述引用的持久孤儿文件会清理，活动、备份或登记引用会阻止删除。

存储按 `APP_ENV` 和数据库实例 UUID 隔离。stage、qa、production 必须设置绝对 `MEDIA_STORAGE_ROOT`；local 默认使用 `var/media/local/<instance>`。媒体根目录不可位于公开 `dist/web` 或前端静态图片目录；`var/media/` 不跟踪、不进入构建包。首次访问存储时核对环境标记和目录属主/私有权限。

T07 已登记的 67 张原图和 67 张历史缩略图按清单摘要迁入本机私有 local 媒体区；原文件保留在前端源码作为迁移来源，不进入公开包。文件清单没有记录的角色、颜色及排序保持未知，运行态数据库中既有历史行不由迁移脚本改写。迁移命令只复制和校验文件，不读数据库：`./scripts/npm.sh run media:migrate`；结果在 `outputs/T13/media-migration.json`。

API：`POST /api/media/:productId/stage` 暂存；`POST /api/media/:productId/associate` 保存新关联；`PUT /api/media/:productId/replace/:imageId` 替换并保留旧记录；`DELETE /api/media/:productId/stage/:mediaId` 取消；`GET /api/media/:mediaId?purpose=original|thumbnail` 按 T05 授权返回 base64 内容。隔离环境清理命令还要求私有 `MEDIA_BACKUP_REFERENCE_FILE`：`./scripts/npm.sh run media:cleanup`。历史图片区域继续按最终基线隐藏，T13 不改前端显示。

T13 隔离验收：`T13_PG_BIN=/绝对路径/pg17/bin ./scripts/npm.sh run media:verify`。它在项目私有临时目录启动 PostgreSQL 17，仅建立合成 `demo_8877_*` 数据库；结果写入 `outputs/T13/verification.json`，实例完成后停止。

## T23 库存校正

库存状况表增加管理员/仓库人员可用的 Arco 校正入口，按原仓库、原 SKU 与已核实计量单位输入实际数和原因。确认与 T17 共享库存锁；版本变化返回最新差额并要求再次确认。零差额保留确认记录，不制造库存流水；重复请求只生效一次，营业员直接调用也拒绝。详情/来源由 T19 读取，响应丢失按 T11 原请求恢复。

当前接口见 [T23 单位版接入合同](outputs/T23/post-review-remediation/20261004-r04/API-CONTRACT.md)，本轮复验见 [T23 r04 报告](outputs/T23/post-review-remediation/20261004-r04/REPORT.md)；[原交付报告](outputs/T23/REPORT.md)保留历史结论。`T23_PG_BIN=/绝对路径/pg17/bin ./scripts/npm.sh run verify:correction` 使用私有编译副本和自行建立、关闭 TCP、结束后停止的 PostgreSQL 17 合成 QA。每轮输出至新的 `outputs/T23/post-review-remediation/<runId>/verification/`，日志至对应 `logs/T23/post-review-remediation/<runId>/`；可设 `T23_VERIFY_RUN_ID` 指定新版本标识，已存在的复验目录会拒绝覆盖。新迁移 `0005-inventory-correction` 不改写既有 SQL 或 Source。专项通过不代替主控验收、工程通用检查或上线 Gate。

## T19 库存查询与来源链

服务端库存接口提供分仓原 SKU 筛选分页、标准展示成员、分单位汇总与期初/有效流水对账；停用资料继续可查。来源链可读取过账的不可变单据修订和操作版本；库存全仓读取不会绕过原单的营业厅/版本权限。查询只读，不重放、补档或修复余额。

接口、标准展示包接缝和后续迁移要求见 [T19 接口合同](outputs/T19/API-CONTRACT.md)，逐项自验及工程检查见 [T19 报告](outputs/T19/REPORT.md)。专项验证新建并停止独立本机 PostgreSQL 17 QA 集群，仅使用合成 `demo_8877_t19_qa_*` 数据，通过私有 Unix socket、关闭 TCP；不连接生产库、现有业务库或服务器。执行：`T19_PG_BIN=/绝对路径/pg17/bin ./scripts/npm.sh run verify:inventory`。当前完成状态以主控最新限定范围验收为准，`businessReady=false` 保持。

## T18 商品规格与条码

商品六 Tab 接入受权商品服务；分类、颜色和版型按版本维护，尺码组与季节只读。商品/SKU 停用、九项价格、人工旧码、资料删除预检和图片保存均由服务端复核。原 SKU 与当前展示尺码分开，已有主码不重新生成。新商品明确选择已有计量单位；图片通过 T13 私有媒体存储关联和受权读取。

接口和后续接入约束见 [T18 接口合同](outputs/T18/API-CONTRACT.md)，验收证据和跨任务待核项见 [T18 报告](outputs/T18/REPORT.md)。专项命令为 `T18_PG_BIN=/绝对路径/pg17/bin ./scripts/npm.sh run verify:products`，使用自行建立并停止、关闭 TCP 的 PostgreSQL 17 合成 QA 集群。界面回归使用实际六 Tab 控制器及真实 QA API 的 JSDOM 驱动；不代表真实浏览器、业务库或上线验收。构建与通用测试应设置 `ERP_TASK_ID=T18`，证据归 `outputs/T18/` 和 `logs/T18/`。

## T22 独立退换与历史关联保护

销货单的“退货/换货”支持独立退入仓/换出仓，纯退、纯换出只要求实际使用侧仓库；签名数量与收退款方向由服务端复核，两侧一次审核/弃审。旧关联仅沿用可信原导入及 Source 引用，汇总累计退量并保护原销售的规格、数量、成交价、仓库和优惠分摊；严格备注修订可保留已审核原单的有效贡献。旧即时退换及原单专用写入口只读。

合同、逐项自验及共享失败见 [T22 API 合同](outputs/T22/API-CONTRACT.md) 和 [T22 报告](outputs/T22/REPORT.md)。`T22_PG_BIN=/绝对路径/pg17/bin ERP_TASK_ID=T22 ./scripts/npm.sh run verify:returns` 自建并停止私有 PostgreSQL 17 合成 QA；`ERP_TASK_ID=T22 ./scripts/npm.sh run check` 进行工程核验。T22 专项通过不替代主控验收、真实迁移、真实浏览器或上线 Gate，`businessReady=false` 保持。
