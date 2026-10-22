# 奈爵 ERP 本地接手工程入口

全局规则唯一权威：`/Users/billy/Desktop/Workspace/agents.md`。新任务先完整阅读；按其继续任务和冲突规则执行。

本工程为 `work/erp-local-source-20261022`，当前文件归属、状态和证据分别以同级 `local-takeover-20261021-control/OWNERSHIP.md`、`STATUS.json`、`EVIDENCE-MATRIX.json` 为准，先读最新本地接手补充。仅 GPT-6.1-sol / xhigh；不用 Astra。

保留当前 WIP 分支及全部未提交改动，不 reset/clean、不覆盖 main、不删除旧证据。冻结 Demo 和旧正式工程只读，不在其中构建。

前端独占 apps/web（排除锁定的 src/application/contracts.ts），后端独占登记的后端源码，公共合同及根配置由主控登记唯一 owner。不得双写，发现其他 writer 先保全并暂停受影响范围。UI 实现读取旧正式工程 `.agents/skills/arco-design/SKILL.md`，使用现有 React19/Arco2.66.16，不引入第二套组件系统。

sealed18 run2 已实际通过9场景（含父测试10/10）并停库，禁止重复同目标。新PG需主控协调，隔离合成目标并保留停止证据。历史人员/时间未知保持空；库存未知/零/缺失/读失败分开，金额和数量保留精确字符串，不猜授权、映射或零值。

优先交付最新整合构建与冻结 Demo 逐页对比，绑定源文件hash、版本、实际时间、截图、问题和未测项。局部测试不是整页或完整验收；线上版本未绑定要明确记录。正式切换前仍须具体影响、备份、回退和必要确认。

## 2026-10-22 rapid-launch nine-role current authority

Current C=01a161ca-f5d5-7de1-a8ad-1cdd43c96915. User explicitly replaced the old three-slot/broad frontend/backend ownership with the nine roles in docs/rapid-launch-20261022/TASKS.json and exact WRITE-OWNERSHIP.json. Previous entries remain historical. Writes activate on C checkpoint message. New fields/constraints/dependent writes require explicit user approval. Current user authorization permits phased testing/replacement/deployment at the existing public address, superseding old general production-not-authorized wording; backup, rollback and data protection remain required. Current progress lives only in that docs directory.
