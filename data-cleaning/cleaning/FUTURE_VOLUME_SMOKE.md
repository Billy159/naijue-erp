> 历史隔离诊断资料。2026-10-01已由根 README、data-cleaning/README.md 与现行 IMPORT_CONTINUATION 文档替代正式操作入口；本页的旧路径和零期初假定仅说明当时执行，不适用于当前上线。

# Future volume smoke · 2026-09-24

本测试仅在原始 T+ 文件夹的**临时副本**中，追加一笔独立收款行及新单号；原始目录逐文件 SHA-256 不变。用 `pnpm tplus:rerun` 从新目录执行 v1 规则、结构校验、Cleaned、动态 Preflight、Diff、隔离 Import、Runtime Init 与 Verify。

- 动态 Preflight：**PASS**；独立收款隔离单 25156（原 25155）、隔离行 25623（原 25622）；库存 80794，unresolved FK 0。
- Diff：**REVIEW**，共享 product/SKU/warehouse/sale/transfer 身份漂移 0；未带 `--accept-review` 时命令按预期 STOP，且未创建测试库。
- 显式 `--accept-review --execute` 后：**PASS_REVIEWED**，独立 Source COMMITTED、Runtime 历史单 44021，重复初始化新增历史单 0、条码 0；旧 Source/Runtime 回读 9/9 项未变。
- 测试用 `*_a3_smoke` Source/Runtime schemas 已删除，临时副本和生成的模拟预检包随后清理。正式 A1 Cleaned 与隔离 Source/Runtime 保留；8878 未切换。
