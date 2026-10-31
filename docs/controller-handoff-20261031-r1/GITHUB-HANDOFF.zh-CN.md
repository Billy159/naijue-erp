# 主控源码对齐与推送

1. 先核对实际远端仓库URL、分支、HEAD和CI部署触发规则；本包没有查询或推送远端。
2. 在干净工作区保留旧版本备份，再建立独立准备分支（例如 prep/naijue-db-upgrade-20261031）。不要覆盖线上发布分支、强推或默认执行发布workflow。
3. GitHub若仍初始版，用 source/全量源文件和 SOURCE-FILES.json 对齐，逐项审查已有旧入口、构建配置和文件删除。禁止把EXCLUDED列表用于删除数据或private config，禁止无审查rsync --delete。
4. 仅当本地准确为6a85基线时，才使用CHANGES-SINCE-6a85.patch；先检查补丁适用性并比较应用后的文件hash。本包是源码过滤快照，不是完整Git历史bundle。
5. 不提交 .env、密码/连接串、数据库导出、用户数据、node_modules、实际catalog含私有信息的观察文件。明确暂存源码/测试/文档，检查git diff --cached。
6. 运行源码package.json现有测试/类型/依赖检查，并执行READONLY-TOOLS里的离线工具测试；按KNOWN-GAPS补目标环境验收。源码包/测试结果不等于可部署。
7. 提交后用新实际commit填核查计划的sourceCommit，并记录source文件校验值。推送独立分支前再次确认不会自动部署；推后用已认证远端证据核对commit和CI。不要声称本包基线6a85就是修改后commit。
8. 最终线上DB与应用要核兼容后配套切换。主控先提供只读差异、修复方案、隔离普通账号证据和回滚方案，再安排线上动作。
