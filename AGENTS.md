# 奈爵服饰 8877 Demo 开发入口

全局行为规则以 `/Users/billy/Desktop/Workspace/agents.md` 为准。

本项目唯一开发目录为当前 `奈爵服饰-8877-Demo/`。当前工程、启动、清洗、恢复与导入口径先读根 README 和 `data-cleaning/README.md`；业务需求与历史决策按需读 `data-cleaning/docs/PROJECT_BRAIN.md`、`DEMO_REQUIREMENTS.md`、`OPEN_QUESTIONS.md`，并结合已确认最新的 `IMPORT_CONTINUATION_20260930.md`、`server/runtime/inventory-cutover-policy.json` 和当前源码 / 数据回读。旧文档中的路径、阶段状态和零期初方案不能覆盖现行裁决。

当前采用增量导入；完整全仓期初库存及截止时点仍待提供；零期初重建不得作为当前上线默认口径。历史零期初模型仅在隔离库诊断复跑，不能成为当前库存或正式上线入口。原 SKU 身份、历史尺码含义、精确条码及手工旧条码兼容必须保留。

前端基础组件体系继续使用 Arco Design React；涉及 UI、交互或布局实现时，先完整读取 `.agents/skills/arco-design/SKILL.md` 和所需 references。其他前端技能只辅助层级和布局，不引入第二套组件体系，不覆盖业务规则。

从 `8877-final-baseline` 主线继续。实际业务库禁止执行回归、历史清洗重放或测试写入；后端测试使用已恢复的 `demo_8877_*` 隔离库。修改后运行与范围相称的已有检查；不要为了代码形式合并语义不同的业务组件。当前运行包保留以供启动，重新生成使用根目录 `npm run build`。
