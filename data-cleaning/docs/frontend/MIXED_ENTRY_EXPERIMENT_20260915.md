# 销货混合录入与独立矩阵试验交付

2026-09-15 · 已完成本轮开发与验证，**等待人工验收**。未改正式 Contract，也未将试验登记为已验收 CURRENT。

## 可操作入口

- [销货修复（独立验收空间）](http://127.0.0.1:8877/?tr-space=mixed-sales-demo&sale-fixtures=1&sale-inline-cases=1#sales/new)
- [调拨矩阵试验](http://127.0.0.1:8877/transfer-matrix.html) · [原版调拨](http://127.0.0.1:8877/#transfer)
- [库存矩阵试验](http://127.0.0.1:8877/inventory-matrix.html) · [原版库存](http://127.0.0.1:8877/#inventory)

本机预览服务保留在8877端口。原版入口默认关闭两项试验；三个验收入口各有独立存储空间。

## 原因与修改

| 部分 | 本轮结果 |
|---|---|
| 销货混合行 | 复现原来“2条正式行＋1条手工临时行”：汇总有金额，手工行却缺单位及操作。改为所有已选商品立即进入同一份明细，编辑状态只引用稳定行ID；未完成项保留并定位校验。 |
| 提交语义 | 手工设置最终数量、批量追加本次数量、扫码＋1。统一详情／更多／赠品／移除；不同价格不合并；待定价与0价分开。 |
| 共用找货 | 行内、销货批量、调拨试验、库存试验共用匹配、候选和预览。仅回传商品／已映射规格身份；保留前导零、短片段、同尾号、更多结果、输入法及过期响应保护。 |
| 悬浮扫码 | 非模态、拖动／最小化／关闭、记录折叠；每个应用页面绑定一个目标。手工编辑暂停，原生确认／详情／批量窗口优先。准确条码才录入，失败记录沿用原工作记录。 |
| 调拨试验 | 商品＋颜色行、按真实尺码身份分区，只显示已选颜色。保留原保存草稿→审核→弃审→再审核、编辑资格、权限、历史及防重链。更换取消或重选原商品颜色不清空原数量。 |
| 库存试验 | 商品＋颜色＋仓库行，全局200条分页。保留查询草稿／已执行条件、批量选择、分类、仓库、独立小计／合计、详情、流水和全量输出；扫码只查询。 |

未改字体、配色、商品交互或原库存／调拨默认展示；未接真实后端。

## 实际浏览器操作

使用独立浏览器逐步点击、输入及按键，没有用预填业务单替代录单：

- 两种手工／批量顺序均为3条明细、25件、8815元，均保存重开；扫码一次26件、9014元，撤销恢复。
- 连续键盘录入同规格100–109共10个价格，保留10条、1045元；末位31531、31527加赠品袜子保存为258元。
- 三页面同尾号四个候选可区分，Tab不误选；短片段有更多匹配；明确选择后分别录销售、录调拨、执行库存查询。另检验窄屏候选边界。
- 扫码窗拖动、最小化、关闭重开、手工改价、详情／批量优先级、连续扫描和目标切换均验证。
- 调拨同单混录标准上衣、裤装、历史上衣、46/48模拟规格、无尺码；手工＋扫码＋批量后，逐规格核对保存、审核、弃审、再审核的两仓变化。
- 库存4仓查询2036条：跨页无重复；全部库存按钮包含隔离样本仓后按实际范围查询。扫码前后所有库存值、仓库范围不变。打印与实际下载文件覆盖已执行全部结果。
- 分别关闭两项试验，原版可用；调拨单据／库存、库存查询逐行值保留，销货修复仍在，正常空间数据未被实验写入。

## 独立截图

| 场景 | 截图 |
|---|---|
| 混合录入前／后 | [修改前](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-before-mixed.png) · [修改后](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-after-mixed.png) |
| 两种顺序保存重开 | [手工先录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-manual-first-reopened.png) · [批量先录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-mixed-reopened.png) |
| 连续10行／历史赠品 | [10价格1045元](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-ten-prices.png) · [258元含赠品](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/A-history-258.png) |
| 共用候选 | [销货](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/B-sales-same-tail.png) · [调拨](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/B-transfer-same-tail.png) · [库存](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/B-inventory-same-tail.png) · [窄屏](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/B-narrow-candidates.png) |
| 扫码工作窗 | [工作窗](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/C-scan-window.png) · [拖动后](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/C-dragged-window.png) · [最小化](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/C-minimized.png) · [记录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/C-records.png) · [详情优先](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/C-detail-priority.png) |
| 调拨 | [五种尺码混录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/D-mixed.png) · [已审核](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/D-audited.png) · [已弃审](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/D-reversed.png) |
| 库存 | [第1页](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/E-all-page1.png) · [第2页](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/E-all-page2.png) · [扫码只查询](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/E-scan-query.png) · [打印预览](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/E-print-preview.png) |
| 原版对照 | [原库存](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/F-original-inventory.png) · [试验库存](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/F-experiment-inventory.png) · [原调拨](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/F-original-transfer.png) |

## 测试结果（与浏览器操作分开）

| 范围 | 实际结果 |
|---|---|
| 销货原专项 | 61项通过：核心20、界面22、可靠性11、集成8。 |
| 销货新增 | 混合15项、未完成／赠品／零负库存／撤销边界8项通过。 |
| 公共组件 | 找货9项、扫码8项通过；覆盖异步乱序、旧编辑行、连续同码与目标切换。 |
| 调拨 | 既有核心／更正／可靠性各24项、界面22项通过；试验10项通过，包含同一审核请求重试、逐仓恢复及真实XLSX逐格校验。 |
| 库存 | 既有查询48项、详情10项、商品冻结回归11项通过；试验13项通过，覆盖765行跨三体系分页、未知／失败、全部页及XLSX／打印逐身份对应。 |

测试只更新了新入口选择器及本轮明确改变的“款号不是准确扫码条码”预期；金额、库存、权限、版本等业务断言未改来迁就结果。

**已知旧测试差异：**`inventory-workbench.cjs`仍查找进入商品编辑的 `.iw-identity[data-pc]`。修改前快照与当前版本均在同处失败；当前已验收规则是库存商品名称只读，因此未恢复旧编辑入口，也未改该断言。[当前输出](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-mixed-entry/final-inventory-workbench-old.log) · [修改前输出](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-mixed-entry/final-inventory-workbench-baseline.log)。

[自动检查结果目录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence) · [浏览器导出记录](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/G-browser-downloads.json) · [回退验证](/Users/billy/Desktop/Workspace/project-007-业务管理系统/outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/mixed-entry-evidence/F-rollback-checks.json) · [原61项等运行输出](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-mixed-entry)。

## 分别关闭／撤回

1. 调拨先保存需要保留的草稿，再点页面“关闭此试验，使用原版”。只移除`matrix-experiment=transfer`，保留当前存储空间及已保存单号。
2. 库存点对应关闭链接，只移除`matrix-experiment=inventory`。原版继续读取同空间数据；不会影响调拨或销货。
3. 不需要清浏览器数据。两个独立入口分别使用`matrix-transfer-lab`、`matrix-inventory-lab`；库存试验显示偏好也单独存储。
4. 源码分界：销货修复／公共组件保留；调拨试验入口与`transfer-matrix-experiment.js`可单独停用；库存试验入口与`inventory-matrix-experiment.js`可单独停用。`matrix-sections.js`、`matrix-report.js`和公共找货／扫码属于共用依赖，不能随某个试验一并删除。

提交分段：销货`cd3e75e`；找货`6721fd6`；扫码`d5fd366`；调拨`221354d`；库存`8d39acc`；边界修补`af02f23`。未重置、清理或回滚整个脏工作区。

## 边界与交接

- 实体扫码枪、真实账号／后端、生产跨设备并发未验证；本轮是键盘模拟和本机隔离Demo。
- 46／48没有提供可确认的真实商品关联，本轮使用明确标注的模拟规格。历史175/92A和无尺码使用原字典行ID；缺少尺码组关系时按明确ID集合独立分区，不猜测归并或映射。
- [任务原文](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-mixed-entry/TASK.md)、[修改前快照清单](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-mixed-entry/snapshot-manifest.json)与快照完整保留。工作浏览器资料和下载重试文件未擅自删除；如需清理，另按清单授权。

完成后停止，等待人工验收。

## 2026-09-15 加载故障修复

用户 Chrome 的8767同源存储出现 `QuotaExceededError`，导致共用服务初始化失败，调拨、销货均不能打开。只检查存储键长度和错误类型，未清除任何数据。ERP 专用启动端口改为8877；已在同一 Chrome 逐页回读调拨矩阵输入、库存试验对象及销货商品输入存在，三个服务初始化均成功。8877是新的独立演示空间，8767旧数据完整保留、未迁移。
