# Native transfer read independent review

Status: SOURCE-REVIEW CLEAR. No blocking finding or implementation correction was identified in the frozen native list/detail slice. This clearance is source and bounded synthetic verification, not real PostgreSQL, production service, historical-import, or transfer UI acceptance.

## Exact reviewed boundary

Reviewed all ten entries of `evidence/transfer-query-source.sha256`; every entry matched before and after review. Manifest SHA256: `9b5f7d806a637ea3821151deb066ac3f96015aae731b84eeda5956cd33f761aa`. It records exact ports/validation/service, native PG reader, HTTP/tests, focused tests/typecheck configuration, and contract-doc hashes. Existing 0001/0004 migrations and transfer command policy/service were read only as supporting evidence; no schema file or implementation was edited.

## Authorization and original-source alignment

- Original source `core16-strict-check-bUsiBu/project/server/security/policies.ts:33-40` permits non-salesperson roles and grants a salesperson visibility through either endpoint warehouse hall OR the original salesperson creator-hall/account identity. Its `domain/transfers/query.ts:206-211` applies that union in list SQL before count/page, including immutable creation-role/hall and first creator-account proof. The approved clean architecture section 5 and prior independent transfer-runtime review agree.
- The explicitly selected native query policy preserves that union: endpoint hall clauses OR `(created_hall_id = current actor hall AND created_role = SALESPERSON)`. It never checks the creator's current role/hall. The native account proof uses the existing non-null `created_by_account_id` FK, account-to-staff relation, trusted creation service facts, and 0004 immutable creation provenance rather than retaining the old revision/storage model. ADMIN/WAREHOUSE all-scope is explicit and never a request-selected/default provider. A salesperson without a current authoritative hall denies.
- Service and reader copy/validate trusted actor, scope and filters before awaiting external work. Current authorization runs for each list/detail call. Empty/unknown/malformed grants fail closed. Scope applies to list count/page and target header before any line read. Requested endpoint filters only narrow the result; they cannot grant access. Missing and hidden details share the same not-found behavior.

## Query, facts and lifecycle

- Count/page use identical one-to-one native reference joins, predicates and one read-only REPEATABLE READ snapshot. Server-side LIMIT/OFFSET and date/UUID tie-breaking are explicit; out-of-range pages retain the exact count without fallback/global hydration. Technical page sizes 1-200 and default ordering are disclosed implementation defaults, not asserted frozen Demo behavior or an approval blocker.
- Every scope/filter/target/pagination value is a driver parameter. Fixed column maps prevent identifier injection. Literal case-sensitive `strpos` does not turn percent/underscore/backslash/quotes into wildcards or SQL. No new table, schema, import/projection model, catalog load, stock-balance read, write query, or N+1 appears.
- Detail is one scoped native header/reference query plus one ordered current-line set query with a 2001 sentinel. Overflow rejects instead of truncating. Header identity, line ownership/ID/position uniqueness, positive signed-bigint quantity and persisted snapshot shape are checked. Formal SKU IDs and old product/color/fit/size/barcode snapshots are retained, including leading-zero barcodes. Header reference/creator/approver labels are separately current names, including disabled references, not invented historical names. Credentials, login names, audit JSON and request hashes are not selected.
- Count/quantities remain exact bigints and serialize to decimal strings; page/version are safe numbers. One acquired client is released exactly once. Failure/abort prevents subsequent reads and requests rollback; failed BEGIN, rollback failure and uncertain COMMIT discard appropriately with no retry. Service cancellation after reader completion prevents stale HTTP delivery. These checks do not claim cancellation of an in-flight SQL statement.
- HTTP requires explicit trusted authentication/authorization/reader composition, strict bounded JSON bodies, no query filters, no-store/no-cache and safe error allowlists/redaction. It registers routes without opening a listener. Production Origin/cookie/current-session composition remains the host's obligation.

## Independent verification

- `node --test tests/transfer-query*.test.ts apps/api/src/transfer-query-http.test.ts`: 24/24 passed.
- `./node_modules/.bin/tsc --noEmit -p tests/transfer-query.tsconfig.json`: exit 0.
- All ten freeze hashes matched.
- Four extra bounded synthetic probes passed: abort after acquisition releases without BEGIN/read; query/scope copies survive mutations across deferred connection; prefixed POST routing preserves no-listener and exact `9223372036854775807` count; a request-abort during delayed provider work rejects the late result and removes the listener.

Logs: `evidence/transfer-query-independent-check.log` and `evidence/transfer-query-independent-probes.log`. Extra-probe source is retained outside the repository at `/workspace/shared/erp-rewrite-planning/native-read-review-probes-20261020.mjs`. An initial reply-close simulation reset the inject harness before an HTTP assertion; it was not counted as application evidence. The corrected request-abort probe above passed.

No real PG/parser/optimizer/lock/concurrency/performance run, network request, service listener, DB/schema mutation, package installation, commit, push or deployment was performed. Historical baseline-aware import/edit/posting, transfer UI/candidates/history/output and production host wiring remain separate work. The reserved historical marker here does not fabricate creator facts or grant historical command permission.
