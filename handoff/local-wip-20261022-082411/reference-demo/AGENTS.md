# 奈爵服饰 8877 Demo 冻结基线入口

全局行为规则以 `/Users/billy/Desktop/Workspace/agents.md` 为准。

本项目唯一 Demo 目录为当前 `奈爵服饰-8877-Demo/`。当前工程、启动、清洗、恢复与导入口径先读根 README 和 `data-cleaning/README.md`；业务需求与历史决策按需读 `data-cleaning/docs/PROJECT_BRAIN.md`、`DEMO_REQUIREMENTS.md`、`OPEN_QUESTIONS.md`，并结合已确认最新的 `IMPORT_CONTINUATION_20260930.md`、`data-cleaning/inventory-cutover-policy.json` 和当前源码 / 数据回读。旧文档中的路径、阶段状态和零期初方案不能覆盖现行裁决。

2026-10-01 已按用户明确要求最终冻结为 `8877-final-baseline`。本工程是正式 ERP V2 唯一产品需求 / UI / 交互参考，原则上停止日常开发、UI 优化、代码清理、性能重构与新增业务。正式系统在独立 `naijue-erp-v2` 工程推进。基线确有需求错误时须按用户明确指令记录 `baseline correction`，保留原因、授权和局部验证；不得静默修改或移动正式基线标签。

用户2026-10-01已将后续输入改为整套新T+文件夹，复用确认裁定，在独立新库重建；不再默认后续只做增量。接收入口为 `data-cleaning/intake/receive.py`，默认 `inputs/tplus-current/`，目前完成原件、结构与规则接收，整批清洗和新库导入需据下一批实际内容完成。完整全仓期初库存及共同截止时点仍待提供；零期初重建不得作为当前上线默认口径。历史零期初模型仅在隔离库诊断复跑，不能成为当前库存或正式上线入口。原 SKU 身份、历史尺码含义、精确条码及手工旧条码兼容必须保留。历史人员和操作身份有依赖；登录账号是否重整尚未裁定，不得全删或将历史人员改成新管理员。

前端基础组件体系继续使用 Arco Design React；涉及 UI、交互或布局实现时，先完整读取 `.agents/skills/arco-design/SKILL.md` 和所需 references。其他前端技能只辅助层级和布局，不引入第二套组件体系，不覆盖业务规则。

正式开发参考 `8877-final-baseline`。实际业务库禁止执行回归、历史清洗重放或测试写入；获准的基线修正若需要后端测试，使用已恢复的 `demo_8877_*` 隔离库，并运行与范围相称的已有检查。不要为了代码形式合并语义不同的业务组件。当前运行包保留以供启动、Git 忽略可重新生成的 bundle；重新生成使用根目录 `npm run build`，对照最终冻结资源摘要核验。
