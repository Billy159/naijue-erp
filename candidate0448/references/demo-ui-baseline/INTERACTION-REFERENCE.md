# UI and interaction reference boundaries

All observations below derive from selected frozen source. Source ranges are listed in MANIFEST.json. Current taskbook decisions override historical Demo behavior.

| Area | Reusable UI | Current boundary |
| --- | --- | --- |
| Shell | Grouped left navigation, breadcrumb, title/actions, compact spacing | New routing/session/permissions; separate customer/supplier; password-change above logout is a later requirement absent from frozen topbar |
| Selectors | Arco Select/TreeSelect, 32px controls, search/tags/popup/Esc | Fetch candidates on demand; do not copy old full catalogue loaders/global state |
| Document lists | Date/status/scope filters, draft vs applied query, pagination and loading/error/empty states | Server pagination/permissions; unknown historical actors/times remain unknown |
| Sales editor | Date, business type, hall/staff/customer/warehouse, saved number, notes, receipt/refund fields, incoming/outgoing sections | Preserve internal SALE/RETURN/EXCHANGE and exact money; request keys/receipts and audit/inverse effects follow new contracts |
| Transfer editor | Toolbar, source/destination warehouses, date, initial size matrix and scan drawer | Business timezone, genuine SKU identity; no old mock persistence |
| Inventory | Product/category/warehouse row, advanced filters, states, result tools, matrix and 100/200/500 pager | Balances/paged ledger; distinguish unknown/zero/negative/read failure/unmapped; output actual full filter scope |
| Products | Six tabs, three-column base fields, specs/barcodes, nine-price paste table, controlled photo layout, warehouse stock | Original barcode strings; NULL vs zero; no SKU price overrides, media bundles or invented SKU combinations; size groups/seasons read-only |
| Settings | Store/warehouse tabs, filters/table, 520px modal, 580px staff form, employment confirmation, payment configuration | Warehouse one hall; fund account multiple halls; parties split; actual save/auth/reference protection, no simulated success |

Verbatim sources can still refer to old globals, local state and DOM bridges. They are NOT approved runtime logic. Adapt visual fragments into the new application's query/state/auth/command/receipt mechanisms. Do not infer new field approval from a control present in the Demo.
