> Current authority update 2026-10-22: C01-v1 A-D, supplement v2-B and v3-A product.season_ids are explicitly approved. The earlier product_season relation-table proposal is rejected/superseded, preserved only as history. See FIELD-APPROVAL-SUPPLEMENT-v3-A.json and SCHEMA-SUPPLEMENT-v3-PRODUCT-SEASONS.json. Runtime schema remains EXACT19 until C executes and verifies the applicable migration; source contracts alone do not enable writes.

# 接口合同 v1：现有字段接口已冻结

冻结来源：B00当前源码清单，见EXISTING-API-MATRIX.json；源码基准8211285。仅冻结当前实际存在的接口/DTO，不代表生产验收或批准新字段。

外部统一同源/api，叶插件路径保持原值；服务端核实会话、Origin/CSRF与实际角色，前端不传schema证明。已有DTO精确源码以矩阵dtoSources为准，不能擅自扩宽字段、分页和金额单位。

- AUTH四路和LIVE单据SAVE/APPROVE/UNAPPROVE/VOID既有合同保留；prepare-create不是CREATE命令。
- 保存/读取内部金额minor-unit整数文本，商品/导入历史SQL金额为元的十进制文本，禁止互相当作同一单位；数量和计数保持整数文本。
- 现有receipt返回operationId、单据ID、version、status、ledgerEntryIds；实际单号由保存后detail读取，不猜测或生成前端单号。
- party-maintenance与party-read的重叠GET由D1唯一总装配选择；D2叶插件不跨界总装配。
- HISTORY与LIVE明确分开；imported-history四POST仅已发布真实基线可读，schema19限定证据不等于真实输入已导入。
- 新维护/六页签/历史修订接口等待D2/D3建议汇入本合同；涉及未批准字段的写语义仍关闭。

B01生产宿主配置冻结：公网Origin=https://1n5635n614.goho.co；外部API前缀/api；保留旧local-https宿主回环合同。实际listen/可信代理和运行配置由C02核真实服务器后写入部署配置，禁止猜测代理网段或放宽校验。生产host应要求显式输入这些值，缺少配置拒绝启动。

## Existing-field read extension v2

InventoryRouteConfiguration.ledger?: true is an explicit UI opt-in. F1 must inject createInventoryLedgerHttpReader(input.http) and the current application access-failure owner; omission preserves the original disabled/unavailable state. F2 owns the leaf implementation. No database field or permission grant added.

Product details read DTO v1 is frozen at packages/application/src/product-details-query-ports.ts; prices/barcodes/stock routes use existing schema1-19 fields only. Prices are all nine exact yuan strings/null; barcodes retain raw text and real SKU identity; product-level default scheme reports UNAVAILABLE until separately approved. ProductWarehouseStockReader is D3-owned and must independently authorize inventory/warehouse scope; absence returns unavailable, never zero.

## Product maintenance v1 frozen at d38c83b (source review pending)

Exact DTO/route snapshot: K/reports/backend/rapid-launch-20261022/D2/W2-PRODUCT-API-v1.json. Real POST /products/maintenance/detail/query and /products/maintenance/candidates/query provide IDs/versions and separately scoped maintenance candidates. POST /products/commands and GET /products/receipts/:requestKey preserve exact original key; new writes require D1 shared driver and approved schema21-23. Missing D3 deletion proof stays unavailable. Source contract freeze does not mean real PostgreSQL or production acceptance. Existing read-details v1 remains unchanged.

## Shared history posting v1

D1/HISTORY-POSTING-CONTRACT-v1.json and inventory-posting.ts define post(sameClient,context,effects). No new pool/transaction or receipt writer. Empty effects do no stock I/O; missing original businessDate blocks quantity effects, never substitutes current date. Actual EX24 adapter/PG evidence still pending.

## Fixed incremental contracts at 842f0db

Portable exact DTO snapshots are in api-contracts/INDEX.json with source commit and hash. W5 organization is source/protocol accepted at 542e90f; W6 catalogue and W7 accounts are fixed and under QB review. Current-form barcode has exact raw-text and actual-SKU semantics, fixed with F1 scanner at 842f0db. Payment session workspace is F3 source-ready; F1 session integration remains pending. No source DTO snapshot opens production writes.

User requires true multiple independent seasons. Scalar seasonId is a historical source interface, not the final requirement. A new relationship, seasonIds read/write contract, exact source migration, and constraints will be submitted together before dependent DDL/writes. Never create combined dictionary season values or silently choose the first season.

D3 HISTORY revise HTTP source is fixed at 842f0db: POST /imported-history/{sales|transfers}/revise with exact HistoryRevisionCommand; original unknown businessDate remains null for money-only correction, quantity effects require proven original date. Source HTTP is not persistence/EXACT24/real-history acceptance.
