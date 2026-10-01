# 销货黄金页提交记录

- 实现提交：`3d3a88d9ca3ed3eba29fd32df41ee31bf2f2751d`
- 分支：`codex/sales-golden-demo`
- 提交说明：`feat(sales): deliver isolated sales golden page and stock closure`
- 实现提交共36份文件；未推送远端。
- 项目原有未提交规格/历史资料继续保留，未纳入本轮。原有原型依赖仍沿用当前工作区；不宣称此提交单独克隆即可运行全部原型。
- PNG和XLSX按仓库现有忽略规则保留本地交付，哈希见 `verification/sales-evidence/artifact-manifest.json`。
- 自建本地Chrome测试实例已关闭；既有8767预览服务保留供人工验收。
- 本次测试的独立Chrome资料目录 `work/ERP-V2-sales-golden/chrome-profile` 及少量中间脚本留作清理候选，未自动删除、未纳入提交。

## 实现提交文件

- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/SALES_ACCEPTANCE_20260915.md`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/SALES_CURRENT.md`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/index.html`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-client.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-core.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-current.css`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-current.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-export.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-model.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/transfer-current.js`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-core.cjs`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/artifact-manifest.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/browser-flow-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/core-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/export-expected.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/export-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/index.html`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/integration-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/reliability-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/sample-two.pdf`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/scope-check.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/ui-results.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-evidence/verification-summary.json`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-integration.cjs`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-lab.html`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-reliability.cjs`
- `outputs/ERP-V2-Demo-V1/ui-structure-prototype/verification/sales-ui.cjs`
- `"outputs/ERP-V2-Demo-V1/ui-structure-prototype/\351\273\204\351\207\221\351\241\265\346\234\254\350\275\256\344\275\277\347\224\250\350\257\264\346\230\216.md"`
- `work/ERP-V2-sales-golden/LESSONS.md`
- `work/ERP-V2-sales-golden/TASK.md`
- `work/ERP-V2-sales-golden/before-hashes.json`
- `work/ERP-V2-sales-golden/browser-export.cjs`
- `work/ERP-V2-sales-golden/browser-flow.cjs`
- `work/ERP-V2-sales-golden/browser-print-final.cjs`
- `work/ERP-V2-sales-golden/browser-samples-final.cjs`
- `work/ERP-V2-sales-golden/cdp.cjs`

测试证据与操作入口见 [验收交接](SALES_ACCEPTANCE_20260915.md)。本文作为实现提交之后的交接记录单独提交。
