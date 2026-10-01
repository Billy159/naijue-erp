# 奈爵服饰 8877 Demo

当前正式工程位于 `/Users/billy/Desktop/Workspace/project-007/奈爵服饰-8877-Demo`。此工程从实际运行页面、未提交修改、当前数据库和图片冻结后整理，开发基线使用 `8877-final-baseline`。页面源码、历史兼容规则及已确认业务裁决均保留。

**当前采用增量导入；完整全仓期初库存及截止时点仍待提供；零期初重建不得作为当前上线默认口径。**

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
├── .env.example
└── .git/                 当前开发主线与 8877-final-baseline 标签
```

`node_modules/`、`.venv/`、`.runtime/` 和清洗运行目录可重新生成，不纳入 Git。`inputs/`、`backup/` 与较大的冻结比对压缩包随完整项目文件夹保存；它们有文件哈希清单，不能只拷贝 Git 后误认为业务数据与迁移资料也已拷贝。

## 启动和停止

本机使用 Node.js、Python 3 和 PostgreSQL 17；已验证 Node 25.8.2、Python 3.9、PostgreSQL 17.11。首次安装依赖，在本目录执行：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r data-cleaning/requirements.txt
npm run build
```

随后双击 `启动Demo.command`，访问 <http://127.0.0.1:8877/>，用现有员工账号登录。保持启动窗口打开；按 Control+C 或双击 `停止Demo.command` 同时停止页面与数据服务。已有服务占用 8877 / 8878 时，入口会提示先停止，不会终止其他进程。

数据库连接默认使用本机 `business_management`，Source 为 `tplus_demo_20260922_a2`，Runtime 为 `v2_runtime_stage03c`。按需要复制 `.env.example` 为 `.env` 并调整连接；密码由本人保管，不提交。PostgreSQL 客户端优先使用 `PG_BIN` 或 `PATH`，本机也可从 `$HOME/pg17/bin` 找到。

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

## 清洗与增量导入

完整目录和使用边界见 `data-cleaning/README.md`，现行裁决见 `data-cleaning/docs/IMPORT_CONTINUATION_20260930.md` 和 `server/runtime/inventory-cutover-policy.json`。

- `inputs/tplus-current/`：当前 T+ 原件；`inputs/tplus-frozen-v1/`：74 份按历史哈希复原的冻结原件，两者分别保留，不能用后来的原件覆盖历史复跑输入。
- `data-cleaning/cleaning/`：v1 规则、结构检查、人工队列、差异审查和验证。
- `data-cleaning/conversion/`、`import/`：转换、预检和事务导入。
- `data-cleaning/authority/`、`size-mapping/`、`supplemental/`：商品、分类、尺码、历史 SKU、条码、仓库、营业厅、往来单位、资金账户和人工裁决。
- `data-cleaning/baselines/TPLUS-20260922-A2.tar.gz`：已接纳导入数据的完整比对基线，删除旧备份后仍需保留。

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

下一批真实增量必须保存原件和截止时点，对新增、重复、同单号变更、规格缺失及重码作预检，再通过事务和幂等身份写入。现有工程保留这套依赖和规则；**任意新 Excel 的一键增量导入尚未实现和验收**，需针对下一批实际资料补充入口，不能把历史复跑成功当作其验收。

## 当前数据口径和待办

Demo 已启用现有库存快照：32,430 个仓库 / SKU 数量格，24 个有数量仓库、340 个负库存格，逐格映射差异 0；只计该快照及激活后的有效增量，旧历史与旧运行过账不再叠加。只在 Demo 范围将快照未列出的格按 0 处理。

402 条尺码裁决、原 SKU 身份、历史 900 / 910 无尺码含义、14,960 条有效主条码、10 条无需条码及手工旧条码兼容保留。131 张盘盈 / 盘亏及 88,800 条原明细保持，成因仍为“未查明”；3 张调拨的已确认修订保持。

仍待补充：最新完整全仓期初与统一业务截止时点、库存成本依据、14 款新增商品的正式分类 / 供应商 / 销售价 / 进价、下一批真实增量数据与该批预检。缺失历史审核人与时间继续保持未知。

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

旧目录与重复备份已按用户批准的19项清单删除，唯一正式入口为本工程。完整16项交付、磁盘复测与保留/删除明细见 [收口验收报告](data-cleaning/verification/consolidation-20261001/收口验收报告.md)。本轮恢复了误删的调拨页面状态和商品条码校验引用，并新增直接覆盖这两类问题的回归检查；前端19组、后端11组通过。后续开发从 `codex/main` 的 `8877-final-baseline` 继续。
