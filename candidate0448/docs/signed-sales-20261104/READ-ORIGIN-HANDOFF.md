# Historical signed-sale origin in detail reads

Snapshot: 2026-11-04 04:49 UTC. Baseline 051bbe14a4cba4e1849b8547665f13df85dd8fe0 plus preserved uncommitted work. Source candidate, not PostgreSQL/browser/production acceptance.

## Purpose and output contract

An originally signed historical SALE can become all-positive after an edit. Current line signs cannot identify that origin after reopening. The authorized detail response now optionally contains:

    historicalSaleOrigin: { kind: 'SIGNED_SALE', originalOrderDiscount: '25' }

The amount is an exact minor-unit string on HTTP; application representation is MinorAmount. It is present only after the server proves native original signed SALE and verifies the current whole discount still equals the original. This is presentation information, not a permission, new business type, or accepted SAVE field. It is absent for runtime documents, originally pure-positive history, and unproven origin. An absent field must not be replaced with a guessed stockBasis/current-sign exemption. User interface changes consume the field separately and do not send it back in SAVE.

## Actual read sequence

1. Existing HTTP authentication and service authorization select the permitted target scope.
2. Existing ordinary identity/publication gates and scoped header query run in the same READ ONLY REPEATABLE READ snapshot.
3. Read current editable lines and settlement facts as before.
4. Historical SALE above native version1 privately reads at most 2001 inactive lines and the bounded native audit/receipt chain. Those extra records never enter the editable detail or wire projection.
5. Reverse-check exact sparse after values against the native snapshot, receipts, versions and complete origin to native v1. Derive the original signed classification and original discount, without inferring missing facts.
6. Return only the kind and exact original discount. Current lines stay unchanged. No ledger, command, writes, row lock or authentication changes are introduced.

Native v1 itself is the original snapshot; no audit query is needed for that case. Versions above1 without complete evidence do not obtain the exception. Inactive-row overflow or missing/unverifiable audit omits the projection but retains actual viewable details. SQL/permission and codec errors deliberately propagate and roll back the read, rather than pretending that origin was successfully checked.

## Tests and evidence

RED: backend-read-origin-red-02.log shows the previously missing projection after original negative quantity became positive. The initial red log also preserves a synthetic fixture missing category identity; it was corrected before recording the meaningful RED.

Command:

    node --experimental-strip-types --test tests/ordinary-sales-detail-postgres-protocol.test.ts tests/sales-query-postgres-protocol.test.ts tests/sales-query.test.ts tests/sales-retained-approval*.test.ts apps/api/src/sales-query-http.test.ts

Author result: 107/107 PASS, backend-read-origin-regression-04.log, Node24.22.1. Independent reviewer reran the preceding 106-test set on exact Node24.21.0, all passed, and found no critical source issue in this scope. The only later addition is the HTTP test that rejects a client-supplied origin projection before policy/provider reads; production source did not change.

Coverage includes original v1 signed versus pure-positive history; current signs becoming positive; removing the last negative row with inactive identity retained privately; missing audit and receipt; tampered audit row; hidden target; runtime no exception; inactive overflow; SQL failure and malformed inactive row rollback; exact HTTP minor-unit string; no raw audit/request-hash disclosure; and rejection of client origin input.

## Local acceptance requirements

- Actual PostgreSQL, browser and typecheck remain unverified here.
- Historical detail above native version1 now requires permitted reads of its audit_change, operation_receipt, and inactive sales_line records. Verify actual read-role ACL and RLS in the isolated local database. A missing permission fails the detail query, intentionally; no role permission was widened here.
- Using the final combined source, import a synthetic signed historical SALE with original discount, change/remove its last negative row, save/approve/unapprove as needed, close and reopen the browser editor. Confirm original type/discount persist and no ordinary discount redistribution is introduced.
- Confirm the response omits the projection when history is incomplete, and the UI does not infer an exemption or send projection fields in SAVE.
- Confirm removed rows/audit/receipts/request hashes are not exposed in the response. Verify actual read-only transaction behavior and inaccessible target isolation.

## 2026-11-04 05:01 UTC successor: legitimate migration starting versions

The earlier native-version-1-only boundary above is superseded. SQL 0027 permits a positive imported starting version (for example 4). Origin now accepts either a complete native chain to version 1 or a complete chain ending at the exact version and complete financial snapshot of a verified immutable MIGRATE_DOCUMENT anchor. It never accepts an arbitrary truncated UNAPPROVE prefix. Both existing anchor verification profiles retain their full checks; runtime27 uses published control evidence without legacy source-row joins. Actual read-role access to these already-existing migration/baseline controls and pinned functions must be included in local acceptance. Missing permissions or pins are not bypassed.
