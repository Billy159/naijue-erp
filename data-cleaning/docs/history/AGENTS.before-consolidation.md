# ERP V2 项目入口

全局行为规则遵循 `/Users/billy/Desktop/Workspace/agents.md`。

进入本项目必须首先完整读取 [PROJECT_BRAIN.md](outputs/ERP-V2-Demo-V1/PROJECT_BRAIN.md)，它是当前项目唯一事实源；再按需读同目录 DEMO_REQUIREMENTS.md 和 OPEN_QUESTIONS.md。

2026-09-13：需求基线已由用户确认，本轮只交付需求，未获指令进入开发或源码审查。下一阶段为单独的同事源码审查 → KEEP / ADAPT / DROP → 确定实际开发起点。

CONTEXT.md 的旧正文、20260910 合并需求与开发规划、旧任务包及 PROGRESS 均为历史资料，不能覆盖新基线或作为自动启动指令。旧 DONE 不代表 V2 已完成或已验收。同事资料只作来源参考，源码中的实现不自动构成需求。保留原始资料，不删除历史。


## Arco Design UI

本项目后续前端 UI / UX / 交互统一采用 Arco Design React（@arco-design/web-react）。

凡涉及页面、前端组件、表单、表格、弹窗、选择器、导航、反馈、布局或其他 UI 实现时，必须先完整读取：

`.agents/skills/arco-design/SKILL.md`

并按任务需要继续读取该 Skill 指向的 references。

Arco Design 是本项目唯一基础 UI Component System。能使用 Arco Design 官方组件实现的基础能力，优先使用官方组件；不要引入 Ant Design、MUI、shadcn 等第二套基础 UI 组件库，也不要重复自制 Arco 已提供的 Button、Input、Select、Form、Table、Modal、Dropdown 等基础组件。

其他 UI / Taste / Frontend Skill 只能辅助信息层级、布局和 UX；与 Arco Design 基础组件/API规范冲突时，以项目内 Arco Design Skill 为准。

业务规则、库存/金额/条码算法、权限、审核/弃审、历史数据等仍以 PROJECT_BRAIN.md 及最新已确认业务基线为准，UI Skill 不得覆盖业务事实。

## 单一工作目录（2026-09-23 用户明确要求）

本项目只在 `/Users/billy/Desktop/Workspace/project-007-业务管理系统` 中继续。不要另建第二个项目目录或独立工作树。
