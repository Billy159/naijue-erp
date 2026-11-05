# Independent sales transaction-authorization review

Baseline: `c568785`. Reviewed the owner's frozen working-tree core, not a separate implementation. No blocking finding remains from the inspected slice.

## Verified results

- `node --test evidence/sales-write-authorization-independent/independent.test.mjs`: **14 passed, 0 failed**. See `results.tap`.
- `node --test tests/sales-authorization.test.ts tests/sales.test.ts tests/postgres-protocol.test.ts apps/api/src/sales-http.test.ts`: **147 passed, 0 failed**. See `regression-results.tap`.
- The six core hashes in `source-before.sha256` matched after both runs. See `source-hash-check.txt`.
- `git diff --check`: passed.

The independent checks cover:

1. 144 role/action/document-hall/actual-creator/status combinations. SALESPERSON may SAVE/VOID own-hall records, APPROVE own actual account-created records only, and never UNAPPROVE. ADMIN/WAREHOUSE cross-hall action grants remain subject to existing command guards.
2. Exact active/login/role/staff/hall identity validation, including missing, stale, malformed and null-hall facts.
3. All four service/receipt authorization call sites receive the command transaction. Existing SAVE checks both stored and proposed records on the same handle.
4. Forged creator, creation hall and creation timestamp in caller drafts cannot overwrite the service's actual creation facts; a selected salesperson never substitutes for the actual creator.
5. Original SAVE replay and HTTP GET receipt recovery still work after a later APPROVE, but current account revocation denies both without writes.
6. Cross-hall proposed SAVE, revoked identities and forbidden actions do not mutate synthetic document/line/settlement/balance/ledger/audit/receipt tables.
7. Existing state, exact settlement, version CAS, historical-edit blocking and privileged inverse posting protections remain in effect.
8. Native identity lookup uses the existing command lease and explicit account/staff SHARE locks, plus a separate hall SHARE lock. Its bounded cache is transaction-local, account-bound and rejects closed handles before cached return.
9. A scripted waiting identity/hall query returning revoked/disabled facts denies authorization. In-flight identity lookup returning after callback closure cannot yield a grant.
10. Lookup and rollback failures produce one cleanup path, without a second identity lookup or implicit retry. Native creation snapshots resist mutation through the returned header alias and mismatched new creators.

## Evidence boundary

These are **synthetic/scripted PostgreSQL protocol tests and Fastify.inject**, not real PostgreSQL-engine acceptance. The fake waits demonstrate application control flow only. SQL syntax, engine row-lock ordering, READ COMMITTED rechecks after real lock waits, real revocation contention and database cleanup under actual driver failure were **not** executed here. PostgreSQL stayed closed; no listener, browser, production plugin, schema migration, dependency installation, deployment or typechecker was started by this review.

`createSalesActionAuthorization()` is an explicit action-only policy. It does not authenticate sessions or replace the still-required trusted reference-scope and economics providers, and this review does not claim production write assembly or enablement.

The reviewer edited only this isolated evidence directory, not the owner's source or tests.
