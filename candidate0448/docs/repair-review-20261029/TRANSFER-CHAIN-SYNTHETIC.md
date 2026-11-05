# Isolated transfer real-service chain (not PostgreSQL/shared sales ledger)

The test bridge reuses the existing SyntheticTransferStore, formal transfer HTTP/service, current identity policy, native preparation and reference checks. Only actual known QA inventory cells are seeded, missing coverage remains unknown; no static APPROVED documents are imported. Posting, inverse ledger, version/CAS, receipts and rollback remain service/store-owned. Read projections reuse existing document/product transports and one committed snapshot per request. Current fixture warehouses/SKUs are enabled; disabled-source changing-inventory policy is NOT covered by this static warehouse fact setup.

`--transfer-chain` is explicit and mutually exclusive with `--sales-chain`. Both existing stores have private state and transaction queues; they cannot be merged by summing/copying balances. A future shared test kernel needs one COW state/queue, typed UoW views, global (actor,key) receipt uniqueness with target-kind conflict, shared ledger uniqueness and rollback/escape tests. This fixture is NOT installed in the retained user's sales preview.

## Native tests on dot
Evidence `recovery/transfer-chain-20261029/` outside repo:
- red: missing fixture module; green: four real-service lifecycle/rollback/rejection cases PASS.
- read-red: missing request method; read-green failed because strip-only Node cannot load an existing TS parameter property; corrected runner to transform-types, not source semantics.
- read-green2: incorrect test accessed inventory.items instead of actual products; corrected to exact two warehouse SKU cells. read-green3: 6/6 PASS.
- bridge-red: simultaneous stores not rejected; bridge-green: 7/7 PASS.
- SAVE -> APPROVE (two opposite warehouse entries) -> UNAPPROVE (one inverse per original) -> EDIT versions 1–4; replay no duplicates, stale/altered key rejection, receipt fault full rollback, revoked identity, same warehouse/nonpositive/unknown SKU, missing balance rejection.
- List/detail/history/inventory/original receipt are read from the same committed transfer store; both SKU cells move -2/+2 while aggregate stays constant. Prepare performs no writes. Foreign origin and sales command path rejected.

Headed browser-fourth on fixed a148adac build PASS, typecheck exit 0. Four actual commands v1–4, source/destination SKU cells 3/2 -> 1/4 -> 3/2 -> 3/2; aggregate unchanged, lost UNAPPROVE response resolved by original receipt, edited note and four history rows read back. Approved/edited screenshots inspected. Earlier headed attempts retained: first nonexistent list selector, second reused sales build with transferExistingEdit=false, third did not wait for draft auto-edit initialization. Fourth uses an isolated test config enabling existing transfer edit and disabling sales create/edit; no production gate change. No actual PostgreSQL transaction/locking/durability or combined sales→transfer proof is claimed.
