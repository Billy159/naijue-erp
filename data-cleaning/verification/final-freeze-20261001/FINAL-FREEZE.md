# 8877 Final Baseline 最终冻结 · 2026-10-01

[COMPUTED|HIGH] 本轮轻量冻结验证 10/10 通过。冻结当前工作区实际运行版本，并纳入最终 Smoke Test 后已验收的商品图片局部修正。没有回退旧代码、恢复旧数据库、开发功能、修改 UI、性能优化或清理业务代码。

## 正式引用

- 分支：`codex/main`
- 最终提交信息：`chore: freeze 8877 final demo baseline`
- 唯一正式标签：`8877-final-baseline`，必须与本轮最终冻结提交相同；用 `git rev-parse 8877-final-baseline^{commit}` 回读。
- 旧标签原目标 `d4328c39f6df24afbff86907f1b9beb2b55e4f77` 另存为 `8877-final-baseline-before-final-freeze-20261001`；较早的 `8877-final-baseline-pre-smoke` 保留。
- 当前没有配置 Git remote，本轮不推送或创建 GitHub 仓库。
- 根 README 和项目 AGENTS 已明确冻结边界。后续正式 ERP 在独立工程开发，真正的需求错误须明确记录 `baseline correction`。

## 轻量验证

| 项目 | 结果 | 当前证据 |
| --- | --- | --- |
| 启动Demo.command | 从当前规范路径实际停启，8877 HTTP200，8878健康正常 | startup-result.json |
| 登录页 | 独立 Chrome 无痕窗口显示现有登录表单 | login.png |
| 管理员登录 | 用户本人输入密码，登录后“演示管理员 · 管理员”；无登录拦截 | admin-login-result.json / admin-login.png |
| 首页 / 库存状况表 | 页面正常，点击查询后矩阵及查询结果加载 | inventory-result.json / inventory.png |
| 商品页 | 026MS5133001 基础资料正常打开 | product.png / page-results.json |
| 调拨单 | ALAL-2026-09-0132 原单正常打开 | transfer.png / page-results.json |
| 销货单 | V2-XS-ad693d2e 原单正常打开 | sales.png / page-results.json |
| 基础设置 | 营业厅与仓库列表正常打开 | settings.png / page-results.json |
| 图片 / 静态资源 | 62 张当前图片全部加载，85 项脚本/样式资源已加载，无失败资源 | images-result.json / images.png |
| 启动级错误 | 页面错误记录及 Chrome Runtime / Network 错误检查为 0 | browser-errors.json / image-errors.json |

只进行了上述轻量验证，没有再次执行全站 Smoke Test。验证脚本曾遇到自身表达式换行和图片 Tab 选择器错误，修正探针后完成验证，没有为此修改产品代码。登录会话和正常查看产生的临时租约属于系统正常行为，没有执行单据保存、审核、商品保存或数据导入。

## 运行状态与保留文件

运行前端、服务和资源在冻结任务前后摘要完全相同，全部清单见 `runtime-sha256.json`。本轮直接读取当前业务库两套 schema 的字段结构，见 `database-structure.json`；未读取密码字段的业务内容。

`.gitignore` 排除所有 `.env*`、密钥、凭据、依赖、缓存、日志、临时目录和生成产物；80 个已跟踪的配置模板、日志及 7 个 bundle 只取消 Git 跟踪，磁盘原文件及 SHA256 均保持。Git 保留当前源码、依赖锁、构建配置、正式字体和图片；从 Git 获取后先执行 README 中的安装与构建步骤，对照运行资源摘要。

`data-cleaning/`、`inputs/`、`backup/` 继续保留。当前备份文件与已验证 SHA256 完全一致，详见 `retained-data.json`；未用旧备份覆盖当前数据库。大备份、原件、历史日志和本机正式开发主计划随完整项目目录保存，不纳入 Demo Git 基线。

凭据检查未发现真实员工密码、私钥、token 或 API key 被当前 Git 索引跟踪；隔离测试口令为人工测试夹具。检查范围是当前提交树，不把本轮检查宣称为 Git 全历史重写或凭据轮换。

## 数据口径及冻结后原则

当前 Demo 保留既有数据、库存快照及激活后的有效增量；完整全仓期初和最终截止时点仍待正式上线数据确定。旧零期初重建不作为上线默认。后续整批新 T+ 文件夹仍按已确认裁定在独立新库迁移；本次只分别说明当前 Demo 和未来上线边界，不修改迁移程序、人工裁决或业务数据。

完成最终提交和正式标签后不再修改 Demo。业务需求 / UI / 交互争议以该版本实际运行效果及确认规则为准。当前是产品 Demo，历史身份、SKU、原尺码含义和历史条码必须保留。
