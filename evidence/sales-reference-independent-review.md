# Sales reference/name extension independent review

Status: SOURCE-REVIEW CLEAR. No blocking finding or implementation correction was identified in the frozen extension. This is source and bounded synthetic verification only, not PostgreSQL-engine, production authorization, host composition, or browser acceptance.

## Exact reviewed boundary

Reviewed the 14 entries in `evidence/sales-reference-source-sha256.txt`; every entry matched before and after review. Manifest SHA256: `8cbf8e4c97787c52af8af137f41d24c2e0fdce77ad09a0f6ca2dad43cd5b7e80`. The manifest contains the exact per-file hashes, including the required `sales-query-validation.ts` dependency and frozen owner evidence. The concurrent sales UI work was explicitly excluded. The pre-existing sales query implementation was read as necessary context; this report does not extend the previous frozen-base review to unrelated behavior.

## Review observations

- The reference endpoint is a historical sales FILTER projection, not an enabled-only create/edit picker or a new unrestricted master-catalog permission. Each call reuses the existing trusted authenticator/current LIST authorization with a neutral bounded list intent. Empty scopes deny before a connection. An authorized-sales correlated EXISTS is present in both count and page queries before search/pagination, so unused or exclusively unreadable masters cannot become candidates.
- The four table/column choices are a closed internal map. Scope, literal search, page size and exact offset are parameters. `strpos` preserves percent, underscore, backslash and quotes as literal input. Search includes the existing customer code only for customers. Master PK uniqueness/EXISTS prevents duplicate candidates; decoder checks reject duplicate/malformed IDs and blank labels. Count and page use the same source in one read-only REPEATABLE READ snapshot, with exact page-length validation and stable name/UUID ordering.
- Disabled references and former staff are deliberately not removed from historical filters. No role-to-hall inference, default grants, current-staff restriction, or form-eligibility claim is introduced.
- There is one enriched `/sales/detail/query`, not a named compatibility endpoint or optional empty provider. Its authorized header/reference query precedes child reads. Current hall/staff/customer/warehouse names are explicit current facts; stored settlement account/method snapshots remain separate authoritative historical facts. The current payment method is obtained through the current account relation and is not substituted into the snapshot fields.
- Header/reference, current native line snapshots, and settlements/names use three set reads on the same client/snapshot. The 2001-line sentinel rejects detail overflow; settlements use the existing fourth-row sentinel. There is no product/catalog hydration or per-ID/per-line request loop. Required joins agree with the existing 0001 non-null/FK shapes; nullable salesperson stays null.
- Existing precise SQL text decoding and HTTP bigint-to-decimal-string serialization remain intact. Existing cancellation checks stop subsequent work; rollback/release/discard paths preserve uncertainty instead of retrying a commit. The service checks cancellation after policy and reader completion. An already-running driver statement is not claimed to be canceled.

## Independent checks

- `node --test tests/sales-query.test.ts tests/sales-reference-query.test.ts tests/sales-query-postgres-protocol.test.ts apps/api/src/sales-query-http.test.ts`: 33/33 passed.
- `./node_modules/.bin/tsc --noEmit -p evidence/sales-reference-typecheck.json`: exit 0.
- Frozen manifest verification and scoped tracked-diff whitespace check passed.
- Two additional bounded synthetic probes passed: cancellation immediately after pool acquisition releases the client without BEGIN/read; mutating the supplied reference query/scope across a deferred pool connection cannot change the copied customer kind, literal search, grant or offset.

Logs: `evidence/sales-reference-independent-check.log` and `evidence/sales-reference-independent-probes.log`. Extra-probe source is retained outside the repository at `/workspace/shared/erp-rewrite-planning/native-read-review-probes-20261020.mjs`.

No implementation edit, DB/schema creation/change, real PG execution, network request, listener, package installation, commit, push, or deployment was performed by this reviewer. Real SQL parsing/planning, runtime isolation/performance, production policy composition, and concurrent sales UI integration remain outside this clearance.
