# Dot 接续：2026-11-01，用户暂停后交接

仓库：https://github.com/Billy159/naijue-erp
分支：codex/db-v7-r1-preparation-20261031
完成源码提交：c0794b4bdcbdfcf1fff4026a6fcf798f84133ca2
包含本说明的最终提交以远端该分支 HEAD 为准。旧 codex/erp、SOURCE950、normal44 不代表本次源码。

已合入：历史未审核调拨备注与完整明细编辑；独立行身份、重复 SKU 和原来源保留；V2 有效读回与完整尺码组；正常历史页面接线；来源指针 F01 修复；四个原数据库函数后继 SQL；精确历史写能力、API观察及原发布清单接线。没有新增表、列或权限。

## 验证边界及未完成

- D3/F1/D1 原包已有定向自检；原 QB 已审 D3/F1 接缝及 D1 四叶源码/协议/SQL文字，F01 在17cb446f定向复验关闭。
- 最新14叶能力/API/发布清单仅有44项定向自检及定向类型检查，独立验收、最新整组构建和浏览器验证均未做。证据副本在 evidence-history-draft-20261101/，绝对本机路径只作历史定位。
- 生成器写完原发布声明块后按现有保护返回 DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED（exit1）。原批准 pin 未更改，不能直接发布。
- prepare-runtime26-v8.mjs 仅负责原 V7→V8 权限准备，不安装此次四函数。实际 SQL解析/安装、新canonical、普通账号保存→审核→重开→弃审→读回、锁/权限/回滚/库存余额与冲销、备份恢复仍未完成。V7/V8是ERP合同版本，不是PostgreSQL版本或迁移编号。
- QA178窗口02已关闭，M01/M02已提交，不可重放；新03没有本轮环境执行批准。历史余额保持未知，不补零或倒算。
- 浏览器固定60仍为526ca75e旧候选，不包含本次历史编辑，不能将旧PASS算到新源码。全站整页、真实业务、硬件扫码与正式性能仍有缺口；五项新增性能优化暂停。
- 三叶历史合成样例未完成且未跑任何检查，未合入正常源码。WIP-history-synthetic-fixture.NOT-APPLIED.patch包含两个修改文件和一个新增文件，供Dot在独立工作区先审再应用。不能直接启用其中historyRevision.transfers=true。本机原三叶仍保留未提交。详见PAUSED-HANDOFF-20261101.json。

## 运行环境和操作入口

以package.json、lockfile和release-contract为准：Node24.21.0、npm11.9.0；React19.1.1、Arco2.66.16、Fastify、PostgreSQL。在干净clone根目录执行npm ci及npm run check:dependencies；旧机复用依赖不等于新机干净安装通过。sharp/esbuild必须匹配实际OS/CPU，不能把macOS node_modules复制到Linux。

npm run typecheck和npm run build用于类型/编译，不代表前端产物、应用启动或PG验收。前端沿apps/web/demo-replica/build-production-host.mjs的buildProductionHost，传准确配置、固定40位提交和全新绝对输出目录；合成UI沿原unified-service fixture/browser脚本，保持SYNTHETIC/NOTPRODUCTION标识。

正式API入口apps/api/src/production-main.ts需要准确私有配置、容量预算和新鲜观察、原单池、目标匹配的独立metadata审核及普通运行身份。仓库不包含密码、私有连接配置或真实数据；不得用owner运行或删校验来启动。SQL、权限、服务及生产操作仍须遵守用户授权边界。冻结8877 Demo只读，基线b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3。

用户要求此次提交推送后停止。原owner已停写，后续由用户指挥Dot继续。推送不是上线；未测不标通过。

---

## Original r1 handoff history (superseded where conflicting)

# 奈爵 ERP：数据库升级准备与 GitHub 源码交接

本期按用户最新要求先交新源码与数据库升级配套材料，不等待全部 UI/global 验收。
**这是可供主控核查、准备和隔离演练的交接包，不是可以直接盲跑的生产升级包，也不代表上线。**

## 先做什么
1. 确认主控收到的是本包全量 source/，不要继续拿 GitHub 最初版或旧 SOURCE598/V1 只读候选作为新数据库预期。
2. 检查仓库 CI/CD 的实际分支触发条件。建立独立准备分支，先不覆盖发布分支、不触发部署、不强推。
3. 核对 SHA256SUMS.txt 和 SOURCE-FILES.json，按 GITHUB-HANDOFF.zh-CN.md 对齐源码。此包未创建或推送远端 commit；6a85 仅为已交付基线，不是本包修改后的 commit。
4. 阅读 database-upgrade/README.md、MAIN-CONTROL-CHECKLIST.md 和 READONLY-TOOLS.zh-CN.md。V7 是 ERP catalog/ACL 合同，不是 PostgreSQL 服务端版本；schema migration 编号仍为1..26。
5. 主控回传实际缺失4函数/3函数体不匹配的完整签名和 actual/expected hash、完整权限/约束/触发器差异，再制定目标专属 V6 前置修复；不能按截图猜函数。
6. 完整V6通过后，再审查V7增量与普通运行账号。隔离合成库演练、备份恢复、应用兼容、回滚边界及上线授权齐备后才安排线上切换。

## 数据库关键边界
- migrations 1..26 不等于完整 V6。V5→V6工具只补16个读取权限单元，不能恢复缺函数和完整最小写权限。
- 本包没有声称已经验证一个通用完整V6安装器。旧patch中存在历史目标绑定，**禁止按文件名顺序批量执行全部SQL，禁止删guard或改expected hash凑通过。**
- V7准备器是离线、明确合成隔离scope的候选。14项纯测试通过不等于已在目标库安装，更不是生产执行授权。
- 新LIVE事件记录可信前后余额。历史修订/旧导入保持NULL/未知，不倒算、不补零。
- 普通新认证runtime必须非owner/非superuser，按真实最小权限核验。owner SET ROLE及全部回滚组件测试不能替代真实普通账号提交→读回→弃审。
- 只读工具不连接数据库、不携带密码。独立预期元数据不能拿actual直接复制；JSON审核标签不等于签名或授权。

## 本包内容
- source/：应用、适用SQL源、测试、构建/发布源、必要文档。未包含.git、node_modules、数据库文件、凭据、真实业务数据导出或旧历史报告全集。
- CHANGES-SINCE-6a85.*：仅针对准确6a85基线的115项文件变化（最终实际列表为准）。GitHub初始版不能直接套这个增量，应对齐全量source。
- database-upgrade/：V6依赖图/关键51文件hash、差异核查字段、V7隔离前置说明、无目标默认值的计划模板。
- evidence/：实际测试日志与分层证据摘要。包含失败修复说明，不把未测试层次标成通过。
- KNOWN-GAPS.zh-CN.md：未完成验收、目标环境与正式发布阻塞。

原ae7包与6a85包没有修改。后续继续修复与定时汇报；五项新增性能优化未启动。
