# 同包营业厅与原金额差异：离线 CLI 补充验收

2026-11-05，固定 Node 24.21.0，仅合成数据；没有 PostgreSQL 连接、生产写入、推送或部署。

## 已确认的结果

- 同一份新历史厅 profile 包同时包含 1 个历史头的厅依据和 6 行原金额差异；真实普通 `validate --offline` 与 `stream-preflight` 均通过。
- 再在同一包加入未知导出时间及独立 alignment 证据，同时使用待核厅，两入口也通过。原 `exported_at=null` 和待核厅 `null` 未补造。
- 组合套件 8/8，产生 38 次实际 CLI 子进程：4 次正例成功，34 次负例拒绝。原始命令、stdout、stderr、进程退出码在 `final/*/cli-raw-results.json`。
- 统一包、金额、厅预检、厅 CLI、导出时间、既有普通包六文件整合连续两次 111/111，退出码 0；末次 `verified.log` 的前后源码 SHA 清单完全相同，稳定性检查退出码 0。
- `cli.ts` 专属 strict 类型检查退出码 0。实际命令在 `commands.txt`，环境、依赖实际路径及 hash 在 `environment.log`。
- `final/combined-known-positive/synthetic-files/` 和 `final/combined-unknown-positive/synthetic-files/` 留存合成包、三类原核查文件（适用时）、普通 JSON 报告、流式 SQLite/JSONL/summary。测试逐文件比较原包前后 SHA，并从 SQLite 读回逐行原数量、原单价、原金额及头部厅依据。

## 唯一实现补充

`tools/unified-import/cli.ts` 的普通 validate 分支原先不接受包外证据参数。现在它复用三个现有 bounded reader，支持厅、金额和未知导出时间证据；任何证据参数都要求显式 `--offline`、清单 pin、文件与 SHA 成对提供。拒绝重复参数、包内核查文件、错 SHA、数据库参数。既有不带证据的普通离线验证行为由旧包回归覆盖。

此前 `before-wiring.log` 保留实际普通 CLI `INVALID_ARGUMENTS` 失败（子进程 2，测试 1），然后才修改接线。`before.log` 另保留测试自身初次语法错误。`after-wiring.log` 的唯一失败是测试把 SQLite 的小写 entity 查成大写；修正的是测试查询，没有为通过测试放宽生产规则。所有旧日志均保留。

## 不代表什么

测试夹具自行生成合成审阅内容及 SHA，这是验证机械绑定和篡改拒绝的方法，不是独立业务信任或真实来源认证。实际使用仍需外部已授权核查人提供可信审阅文件和 pin。

本批 host/compiler/可执行导入接线仍未开放。这是普通和流式离线接收与读回验收，不是 SQL 安装、业务数据库提交、重新连接读回、权限或保存审核验收。金额编辑与审核规则未被本补充放宽。SQL 源码候选和其他工作组的测试需单独审阅。

## 文件与状态

- `changed-files.sha256`：本补充改动的 CLI、组合测试和说明文档。
- `verified-before.sha256`、`verified-after.sha256`：末次执行依赖范围源码 hash。
- `verified.exit=0`、`verified-source-stability.exit=0`、`typecheck-cli.exit=0`。
- `final.log` 和 `verified.log`：两次 111/111 原始日志。

本补充源码写入冻结。后续任何共享文件变化都需要主控重新复验，不能继承本次 hash 结论。
