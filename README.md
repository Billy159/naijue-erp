# 奈爵服饰 8877 Demo

当前工程位于 `/Users/billy/Desktop/Workspace/project-007-业务管理系统/奈爵服饰-8877-Demo`。冻结对象是当前工作区实际运行、已完成最终 Smoke Test 及最后局部修正的版本；页面源码、历史兼容规则及已确认业务裁决均保留。

# 8877 Final Baseline

**基线：`8877-final-baseline` · Frozen: 2026-10-01**

1. 当前版本是奈爵服饰 ERP V2 正式开发唯一的产品需求 / UI / 交互基线。
2. 后续正式系统开发有争议时，以该版本实际运行效果和已确认规则为准。
3. Demo 冻结后原则上不再继续日常开发，不主动优化 UI、清理代码、性能重构或增加业务功能。
4. 新需求进入正式系统需求，不静默修改 Final Baseline；基线确有需求错误时，必须明确记录为 `baseline correction`。
5. 库存状况表是当前系统主要 UI / 交互设计语言基线。
6. 当前版本仍是产品 Demo，不等于正式生产代码。正式 ERP 后续在独立 `naijue-erp-v2` 工程开发，Demo 仓库只保存产品蓝图和追溯依据。
7. 历史兼容数据、原 SKU / 尺码含义及历史条码不得因为正式开发而被随意重编或删除。

最终冻结提交由 `git rev-parse 8877-final-baseline^{commit}` 查询。较早的 Smoke Test 冻结标签另存为 `8877-final-baseline-before-final-freeze-20261001`，用于保留原有追溯；唯一正式基线名称保持 `8877-final-baseline`。

**当前 Demo 采用增量导入口径：保留已接纳数据和已激活库存快照，只计激活后的有效增量。完整全仓期初库存及最终截止时点仍需按正式上线数据确定；旧“零期初重建”方案不得作为当前正式上线默认口径。** 后续收到整套新 T+ 文件夹时，仍按既有裁决在独立新库完成迁移与核验；本次冻结不修改迁移程序或业务规则。

## 目录

```text
奈爵服饰-8877-Demo/
├── 启动Demo.command       页面 8877 与数据服务 8878
├── 停止Demo.command
├── frontend/             当前页面、样式、源码、运行包、字体及图片
├── server/               当前服务、事务、登录、数据库维护及回归检查
├── data-cleaning/        清洗、转换、导入、规则、裁决、冻结基线、历史隔离重放
├── inputs/               当前原件、冻结原件、尺码/条码/库存资料和必要截图
├── backup/               一份当前业务数据库备份
├── README.md
├── package.json / package-lock.json
├── .env.example          本机配置模板，仅随完整项目保留，不纳入 Git
└── .git/                 当前开发主线与 8877-final-baseline 标签
```

`node_modules/`、`.venv/`、`.runtime/`、`dist/`、`build/`、cache、logs、临时文件、`.env*`、凭据及清洗运行目录不纳入 Git。7 个 `frontend/assets/*.bundle.js` 为可重新生成的构建产物，当前运行文件保留在原位，Git 保存全部入口源码、构建配置及依赖锁；从 Git 获取后先执行下列构建步骤。

`data-cleaning/`、`inputs/`、`backup/` 和各 README 均继续保留。`inputs/`、`backup/` 与较大的冻结比对压缩包随完整项目文件夹保存；它们有文件哈希清单，不能只拷贝 Git 后误认为业务数据与迁移资料也已拷贝。当前运行前端 / 服务 / 资源的 SHA256 清单及轻量冻结验证见 [最终冻结记录](data-cleaning/verification/final-freeze-20261001/FINAL-FREEZE.md)。正式开发与上线主计划保留在本机 `docs/正式开发与上线主计划-20261001/`，属于正式系统工作资料，不纳入 Demo 冻结仓库。

## 启动和停止

本机使用 Node.js、Python 3 和 PostgreSQL 17；已验证 Node 25.8.2、Python 3.9、PostgreSQL 17.11。首次安装依赖，在本目录执行：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r data-cleaning/requirements.txt
npm run build
```

随后双击 `启动Demo.command`，访问 <http://127.0.0.1:8877/>，用现有员工账号登录。保持启动窗口打开；按 Control+C 或双击 `停止Demo.command` 同时停止页面与数据服务。已有服务占用 8877 / 8878 时，入口会提示先停止，不会终止其他进程。

数据库连接默认使用本机 `business_management`，Source 为 `tplus_demo_20260922_a2`，Runtime 为 `v2_runtime_stage03c`。默认本机配置无需 `.env`；完整项目可按需要复制本机 `.env.example` 为 `.env`，或自行设置 `POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_USER`、`POSTGRES_DB`、`POSTGRES_SCHEMA`。所有 `.env*` 均不提交，密码由本人保管。PostgreSQL 客户端优先使用 `PG_BIN` 或 `PATH`，本机也可从 `$HOME/pg17/bin` 找到。

## 数据和图片在哪里

实时业务数据在 PostgreSQL 中。本机服务的数据目录为 `$HOME/pg17/data`，它属于已安装的数据库服务，不依赖任何旧 Demo 工作树。当前工程内的 `backup/` 保存可恢复的 Source 和 Runtime 两个业务 schema，共 89 张表。

商品文件在 `frontend/assets/product-media/` 及相邻的当前图片资源目录；数据库保存关联和路径。浏览器还保存界面偏好、基础设置覆盖和未提交草稿，继续使用同一浏览器与 `127.0.0.1:8877` 可保留这些状态。单独恢复数据库不会复制其他电脑的浏览器本地状态；完整迁移请同时保存 `frontend/` 和所有项目资料。

## 备份与恢复

当前唯一备份为 `backup/business-management-current-20261001.dump`。备份时间、字节数、SHA256、逐表指纹和恢复验证在 `data-cleaning/verification/database-backup-current.json`。本轮最新备份已实际恢复，并核验 89 张表的行数及完整内容摘要，差异为 0。

重新备份：

```sh
python3 server/database.py backup
```

工具在同一只读快照中导出数据并生成逐表指纹，先恢复到新建的临时数据库核验全部内容，再替换这一份最新备份。失败时现有备份保持；不会改动业务库。

恢复到新的独立数据库：

```sh
python3 server/database.py restore --database demo_8877_recovery_20261001
```

恢复工具拒绝覆盖当前业务库或已有数据库。验证通过后，可在 `.env` 将 `POSTGRES_DB` 指向该恢复库，再从同一入口启动；Source / Runtime schema 名称保持。数据库与上传图片必须一起保存。连接参数由环境变量传给维护工具，若调整过 `.env`，在终端执行维护命令前先加载它。

## 清洗与整批接收

完整目录和使用边界见 `data-cleaning/README.md`，现行裁决见 `data-cleaning/docs/IMPORT_CONTINUATION_20260930.md` 和 `data-cleaning/inventory-cutover-policy.json`。

- `inputs/tplus-current/`：当前 T+ 原件；`inputs/tplus-frozen-v1/`：74 份按历史哈希复原的冻结原件，两者分别保留，不能用后来的原件覆盖历史复跑输入。
- `data-cleaning/cleaning/`：v1 规则、结构检查、人工队列、差异审查和验证。
- `data-cleaning/conversion/`、`import/`：转换、预检和事务导入。
- `data-cleaning/authority/`、`size-mapping/`、`supplemental/`：商品、分类、尺码、历史 SKU、条码、仓库、营业厅、往来单位、资金账户和人工裁决。
- `data-cleaning/baselines/TPLUS-20260922-A2.tar.gz`：已接纳导入数据的完整比对基线，删除旧备份后仍需保留。

用户于2026-10-01将后续输入改为完整新文件夹。当前接收入口默认使用现有原件；未来可指定新路径：

```sh
npm run data:receive
npm run data:receive -- --input '/新T+完整文件夹的绝对路径'
```

接收封存原件、文件哈希、工作表 / 表头和既定裁定，生成 `data-cleaning/runs/received/<批次指纹>/`。重复接收复核副本并跳过；结构改变、缺少必需文件或新增未映射文件列出复核。接收阶段不连接数据库，不读取账号密码数据行。入口说明见 [整批接收](data-cleaning/intake/README.md)。

为验收保留的历史诊断模型仍按当时的零期初重建规则运行，**仅用于隔离复跑，不作为当前库存、正式导入或上线入口**。先用上面的恢复工具准备一个隔离数据库，再执行：

```sh
.venv/bin/python data-cleaning/replay.py \
  --database demo_8877_recovery_20261001 \
  --run data-cleaning/runs/replay-20261001
```

它完成清洗、预检和新旧差异报告。发现差异会停止；核对 `result/TPLUS_BATCH_DIFF_REPORT.md`、JSON、原件哈希和业务变化后，使用同一目录继续隔离导入：

```sh
.venv/bin/python data-cleaning/replay.py \
  --database demo_8877_recovery_20261001 \
  --run data-cleaning/runs/replay-20261001 \
  --accept-review --execute
```

复跑约需 5 GB 临时空间。运行结果及 import/runtime/verify 报告需要留存；全量 JSONL 和清洗中间副本可在结果校验完成后重建。

收到新的完整文件夹后，按实际内容完成清洗和身份匹配，对同单号多来源、规格歧义、重码及旧裁定冲突作预检，采用本批经确认的完整全仓库存期初，在独立空库导入、回读和备份。**当前已实现接收检查；任意新文件夹的自动清洗与建库尚未验收**，不能把接收或历史复跑成功当成新批数据正确。

## 当前数据口径和待办

Demo 已启用现有库存快照：32,430 个仓库 / SKU 数量格，24 个有数量仓库、340 个负库存格，逐格映射差异 0；只计该快照及激活后的有效增量，旧历史与旧运行过账不再叠加。只在 Demo 范围将快照未列出的格按 0 处理。

402 条尺码裁决、原 SKU 身份、历史 900 / 910 无尺码含义、14,960 条有效主条码、10 条无需条码及手工旧条码兼容保留。131 张盘盈 / 盘亏及 88,800 条原明细保持，成因仍为“未查明”；3 张调拨的已确认修订保持。

仍待补充：新的完整T+文件夹、最新完整全仓期初与统一业务截止时点、库存成本依据、14 款新增商品的正式分类 / 供应商 / 销售价 / 进价。新批实际资料可补齐此前缺项。缺失历史审核人与时间继续保持未知。

人员档案、登录账号与历史操作身份须分开处理。2026-10-01只读检查确认：44,021张导入历史单据的创建者字段均为空，其中29,810张关联营业员；运行系统的版本与过账记录还引用操作人员。建议保留历史身份，重整在职人员登录；是否关闭旧登录、重建账号尚待用户裁定，本次未更改账号。

## 开发验证

```sh
npm run build
npm run lint
npm run typecheck
npm run check:dependencies
npm test
POSTGRES_DB=demo_8877_recovery_20261001 PSQL_BIN="$HOME/pg17/bin/psql" \
  node server/run-tests.mjs --backend
```

后端回归只允许隔离库；会创建测试 schema，不应对真实库执行。构建覆盖当前 7 个前端入口，前端回归 19 组、当前后端回归 11 组。旧的自动 local-admin 测试合同保存于 `data-cleaning/baselines/retired-tests/`，已被既有员工登录与 Demo 期初口径替代，不属于当前回归。登录、HTTP 读取、正负库存、尺码、条码、图片、清洗和恢复的实际证据在 `data-cleaning/verification/consolidation-20261001/`。

历史文档保留当时事实与来源名称；可执行流程以本 README 和 `data-cleaning/README.md` 为准。旧路径在来源校验记录中只表示出处，不参与启动、导入、图片读取或恢复。

## 本次收口验收

旧目录与重复备份已按用户批准的19项清单删除，唯一正式入口为本工程。完整16项交付、磁盘复测与保留/删除明细见 [收口验收报告](data-cleaning/verification/consolidation-20261001/收口验收报告.md)。此前恢复了误删的调拨页面状态和商品条码校验引用，并新增直接覆盖这两类问题的回归检查；前端19组、后端11组通过。

最终 Smoke Test 后的图片局部修正已一并纳入本次冻结。`codex/main` 的 `8877-final-baseline` 是后续正式开发的产品参考，Demo 本身进入冻结状态。修改基线须单独记录 `baseline correction`，保留修正原因、授权、变更范围和验证证据；不得静默移动标签或继续日常开发。
