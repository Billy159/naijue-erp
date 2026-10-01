# 清洗、规则与现行迁移口径

**后续采用整套新T+文件夹，复用确认裁定重建独立数据库。完整全仓期初库存及共同截止时点仍待提供；零期初重建不得作为当前上线默认口径。**

本目录将现行映射、人工裁决、固定条码清单、迁移辅助工具及历史比对基线收在同一工程。已定稿历史不会因为复跑而自动生成新条码、合并 SKU 或改变已确认尺码。

| 目录 | 保留能力 |
| --- | --- |
| `intake/` | 完整文件夹接收、原件和规则副本、文件哈希、工作表 / 表头合同及结构差异；不写数据库 |
| `cleaning/` | 原件哈希、结构校验、v1 规则、人工审核队列、差异报告、隔离验证 |
| `conversion/` | 商品字段 / 分类、尺码、颜色、版型、仓库、营业厅、往来、员工、结算方式、资金账户、历史单据和库存转换 |
| `import/` | 预检数据包、基线建表和事务导入；原批次幂等检查 |
| `authority/current/` | 当前已确认档案、分类、账户与关系裁决、已确认来源依据 |
| `authority/frozen-v1/` | 历史复跑使用的冻结裁决与前端档案快照 |
| `size-mapping/` | 当前原 SKU 尺码身份、原值、映射表和 402 条确认裁决 |
| `historical-runtime/` | 冻结的历史诊断 Runtime；仅写隔离库，与当前服务代码分开 |
| `supplemental/` | Demo 期初验证、3 张调拨裁决、尺码同步的依据和可复核工具 |
| `baselines/` | 完整接纳数据压缩包、旧清洗报告与被替代的测试合同 |
| `docs/` | 现行导入口径、项目需求和原交付文档 |
| `verification/` | 当前冻结、复制、备份恢复、独立复跑、页面与代码清理证据 |

当前固定条码与补充清单在 `../server/runtime/excel-barcode-authority-20260930.json`、`barcode-scheme-supplement-20260930.json`；源文件位置已指向工程内 `inputs/`，SHA256 校验继续有效。资金账户裁决在 `authority/current/decisions/accounts/`，全商品分类裁决在同级 `categories/`，仓库和营业厅关系在 `relations-confirmed.json`。有效决策同时按历史上下文冻结保存，不能用复跑结果覆盖当前人工裁决。

## 独立复跑

依赖为根目录的 npm 锁定依赖及本目录 `requirements.txt`。使用根目录 `.venv/bin/python`；PostgreSQL 客户端使用 `PSQL_BIN`、`PG_BIN` 或本机 PATH。输入为 `../inputs/tplus-frozen-v1/` 的 74 份冻结工作簿以及已保存的 authority、输入结构合同和比对压缩包，不需要旧 worktree 或旧备份项目。

根目录 README 给出 `server/database.py restore` 和 `replay.py` 的完整命令。`replay.py` 先展开哈希已核验的接纳基线，再调用原有清洗、动态转换、预检、差异检查；显式执行时只接受 `demo_8877_*` 恢复数据库和独立 `tplus_clean_*` / `v2_runtime_clean_*` schema。发现未说明的业务变化、身份漂移、未决分类或输入结构改变时停止。

本轮复跑结果为 `PASS_REVIEWED`：一处已知描述尾空白按原 TPC-001 规则处理，资料出处更新为新相对路径；单据、SKU 身份、数量及条码规则不变。导入 2,941 商品、14,864 SKU、44,021 历史单据；历史库存诊断控制量 80,794、负库存键 1,231，均按冻结模型验证。导入第二次为 `ALREADY_COMMITTED`；Runtime 二次初始化创建 0，历史过账 0；原 Source / Runtime 控制项无变化。详见 `verification/consolidation-20261001/cleaning-replay/`。

这些历史诊断数量不能替代当前 Demo 期初数量。当前 Demo 按已激活快照加后续有效增量工作，正式上线仍等待完整全仓期初和共同截止时点。

## 后续整批接收与独立建库

用户已将后续输入改为整套新T+文件夹。默认 `inputs/tplus-current/`，入口为 `intake/receive.py`，说明见 [接收入口](intake/README.md)。当前实现保存原件副本、哈希、文件结构和既定裁定；重复批次校验后返回 `ALREADY_RECEIVED`，结构差异列出复核。

收到新文件夹 → 接收并封存 → 复用确认分类、尺码、精确条码及关系裁定 → 按来源身份匹配档案 / SKU、单据多来源去重并列出变更与例外 → 核定本批完整全仓库存及共同截止时点 → 在独立空库导入历史查询资料和数量期初 → 逐仓逐SKU / 单据 / 资金回读并备份。当前不把任意新批清洗和建库标为已实现。细则在 `docs/IMPORT_CONTINUATION_20260930.md`。

历史员工、营业员和操作身份必须保留。登录账号是否重整尚未裁定；接收只读取账号表头，不读取密码数据行，不更改当前账号。

`cleaning/HANDOFF.md`、旧 future runbook 和 frozen baselines 只保存当时的诊断背景，不是当前上线流程。`supplemental/` 中带 apply / prepare 的脚本属于特定已确认批次的重放或核验，不能对当前业务库重新套用以替代新批建库。现有业务库已有期初和修订，保持独立；新批先在新库完成验证。
