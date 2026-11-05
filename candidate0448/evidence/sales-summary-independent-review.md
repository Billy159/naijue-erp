# Independent review: native sales list summary extension

## Result

No blocking finding in the nine-file frozen backend/DTO/strict-client extension. Reviewed the owner's final worktree freeze on HEAD `df4fb3373893fa42105d573f3d0f4603cbd26b82`; all nine SHA-256 values matched before and after the independent probes. The final content is identified by `sales-summary-independent-source-sha256.txt`, not by HEAD alone. No production source was changed by this reviewer.

## Semantics and boundaries checked

- Required `quantity`, `incomingQuantity`, `outgoingQuantity` fields are application bigints and exact canonical decimal strings on the existing HTTP serializer. Aggregates are not narrowed through the row-level bigint quantity validator. Incoming/outgoing are nonnegative magnitudes and quantity equals outgoing minus incoming.
- Native line signs, not header business type, determine direction. Only `is_current AND NOT is_gift` rows participate. Numeric casts occur before sum and before negating negative values, avoiding individual bigint-min negation and bigint-sum overflow.
- `updatedAt` comes from the native NOT NULL header timestamp using the existing explicit UTC format. Missing/null persisted timestamps fail decoding; missing/null/invalid timestamps fail the strict client contract.
- Count, page and quantity aggregate run through one read-only REPEATABLE READ snapshot. Both count and page retain the same authorization/filter parameters. Only the already-scoped, already-paged IDs are supplied to one bounded line batch, up to 200 IDs. Empty pages skip the batch. No detail hydration, product/catalog inference, settlement read, or N+1 path was introduced.
- SQL's page relation and LEFT JOIN produce actual zero aggregate rows for no matching non-gift current lines. Missing, extra, duplicate, foreign, malformed or arithmetically inconsistent aggregate facts fail closed. Shuffled aggregate order maps back to the original header-page order.
- Request contracts remain unchanged and reject response-only summary fields at both root and filter positions before authorization. Current trusted authorization remains per invocation. Client contract requires all four new fields, exact page/query membership and unique IDs, and rejects unknown category/unit extensions.
- Frozen `frontend/sales-summary.js` was executed with bounded synthetic fixtures: signed non-gift net units, separate gifts, ignored retired-return records, and an explicit missing historical category instead of today's catalog category. Frozen `frontend/sales-current.js` source confirms the sales-net versus return/exchange incoming/outgoing list mapping and Asia/Shanghai minute presentation. The native line snapshot has no category or measurement unit, so this extension correctly fabricates neither. Visual/DOM integration is outside this review.

## Independent evidence

Command: `node --test evidence/sales-summary-independent-probes.mjs`

Result: 6 test groups passed, 0 failed. Full final output is in `sales-summary-independent-probes.log`.

The independent probes cover a 200-document single batch; negative bigint minimum; sums beyond signed bigint; large incoming/outgoing cancellation; explicit zero; missing/duplicate/foreign aggregates; malformed exact values; duplicate page identities; null timestamp; abort after aggregate before commit; request-only field injection; repeat authorization; exact HTTP serialization; required/strict client fields; timestamp, duplicate-ID and query/page mismatch rejection.

One initial probe-harness assertion expected asynchronous rejection for a synchronously rejected request parser. It was corrected to assert a synchronous throw; no production change was needed. The final run and both surrounding source-hash checks passed.

Owner evidence inspected, not rerun: focused four-file Node tests, 46/46 passed (`sales-list-summary-extension-tests.log`); scoped strict TypeScript exited 0 (`sales-list-summary-extension-types.log` and its explicit tsconfig). No compiler or full-suite repeat was performed by this reviewer.

## Limits

These are read-only production-source review and synthetic protocol/runtime/source probes. Scripted PostgreSQL results do not parse or execute SQL, prove actual database isolation, or establish performance. No database, server/listener, network, browser, install, commit, push, or production mutation was performed. No claim is made about whole-repository verification or final visual fidelity.
