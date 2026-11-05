# Independent review: approved customer/supplier numbering

Date: 2026-10-20 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Verdict

No blocking P1/P2 source defect found in the frozen seventeen-file party-maintenance slice. The new allocator implements the approved independent KH000001/GYS000001 scheme, preserves existing codes and treats six digits as a minimum width rather than a 999999 cap.

Independent verification: all 44 focused checks passed again; the scoped strict TypeScript check exited 0; eight additional pure/synthetic/injected-protocol review probes passed. These results do not establish PostgreSQL engine behavior or production readiness. No database/network operation, implementation edit, commit, push, installation or deployment was performed.

This report supersedes only the prior review's unresolved allocation-policy decision: the decision is now approved and an explicit allocator factory exists. The prior report remains the baseline for unchanged authentication, maintenance, policy and evidence contracts. Host composition, database grants, real engine verification and frontend acceptance are still open.

## Frozen source identity

Manifest: `evidence/party-source-sha256.txt`.

Manifest SHA-256: `31d3a34afb65eacfa807cd0169214159d35936eb8f531b61b91c085092e4777e`.

`sha256sum -c evidence/party-source-sha256.txt` matched all 17 files before and after review. The checkout contains uncommitted slice files and concurrent unrelated work, so this review is tied to the manifest, not to an assumption that HEAD contains the implementation.

Principal numbering sources and hashes:

- `packages/application/src/party-numbering.ts`: `8517e8bf065026192dc2c282dd641f122f2765b619f05200230fbcf14c1288fd`.
- `adapters/postgres/src/party-maintenance-store.ts`: `d39c59ea8ec31d5147e8661d7ddf3527e8f8dfde8795723d8615439d7129849c`.
- `adapters/postgres/migrations/0006_party_maintenance.sql`: `f8b894ec1d3788857b12853a72d078056f4b1d8696248975b16335517e600572`.
- `packages/application/src/party-maintenance-ports.ts`: `8f205e5075797804e5e6167eb4b5da654bb0b30f02ad0433a4030da95c798c19`.
- `packages/application/src/party-maintenance-service.ts`: `679615b42e67a9eaa3ea7faa4db035af5e62a09be2253dffcdf10bd2b6b449c3`, unchanged from prior review.

## Source findings

### Separate identity, counters and read-only generated codes

The allocator factory delegates customer and supplier allocation to separate transaction methods (`party-numbering.ts:35–41`). 0006 creates two independent bigint sequences with START 1, CACHE 1 and NO CYCLE (`0006:6–13`). There is no merged subject identity or shared numeric counter.

The API still rejects code fields on create/edit (`party-maintenance-validation.ts:25–35`). The service assigns new codes server-side and preserves existing record code on other commands (`party-maintenance-service.ts:36–59`). Adapter CAS and native identity checks retain original code and original nullable creation timestamp (`party-maintenance-store.ts:104–121`; `0006:87–101`). This is backend read-only enforcement, not a claim that a customer/supplier frontend has been implemented or accepted.

### Existing-code collision handling

Allocation reads the highest all-digit suffix for the exact same-kind prefix in the same physical table, including disabled rows. It compares significant decimal string length and C-collated digits, not floating-point numbers or a numeric cast of arbitrary imported text (`party-maintenance-store.ts:90–97`). Leading zeros are ignored only for numerical comparison; the stored old code is not modified. Zero suffixes, unrelated prefixes, lowercase variants and nonnumeric suffixes cannot be mistaken for a higher matching counter.

The chosen number is beyond both the current sequence reservation and highest existing matching suffix (`party-numbering.ts:18–28`). Each table's original UNIQUE(code) remains the final exact collision guard. A named same-table code conflict is surfaced as PARTY_CODE_CONFLICT, not resolved by rewriting the old row or retrying with a silent renumber (`party-maintenance-store.ts:112–119`).

### Concurrency and native inserts

The adapter acquires `naijue:party-code:CUSTOMER` or `naijue:party-code:SUPPLIER` before sequence/current-code reads and holds that transaction-level lock through native row, audit and receipt commit or rollback (`party-maintenance-store.ts:81–100`). Under the adapter's explicit READ COMMITTED transaction, the highest-code query is a later statement after lock acquisition, not a pre-lock cached table scan (`party-maintenance-store.ts:32–43`).

0006's BEFORE INSERT native trigger takes the same matching per-kind lock (`0006:79–85`). Consequently explicit native inserts participate in serialization rather than slipping between a generated allocator's scan and insertion. If an explicit insert later tries an already-generated exact code, native uniqueness still rejects it. These are source-level conclusions; actual lock wait, snapshot, trigger and failure behavior remains an engine-test gate.

The adapter guards reservation against absent/existing loaded rows, wrong kind, missing receipt identity, repeated reservation and prior write. Closed transaction handles cannot execute queries (`party-maintenance-store.ts:55–56,81–83`).

### Overflow and number width

Calculation uses BigInt and checks a canonical decimal string against the signed-bigint boundary before converting arbitrary imported suffixes (`party-numbering.ts:4–15`). KH999999 proceeds to KH1000000. Values above Number.MAX_SAFE_INTEGER remain exact. The technical maximum is 9223372036854775807, not a six-digit business cap; an exhausted counter or matching imported maximum fails explicitly with PARTY_CODE_EXHAUSTED before setval/native insertion (`party-numbering.ts:18–33`). There is no wrap or precision-loss fallback. HTTP maps the exhaustion to a non-leaking explicit 409 (`party-maintenance-http.ts:11–13,29–36`).

### Rollback gaps and replay

Reservations use setval, intentionally outside transaction rollback semantics. A failed command may consume a number while native row/audit/receipt roll back; the next command advances rather than reusing the reservation. The implementation and documentation make no gapless claim (`0006:9–11`; `party-maintenance-store.ts:84–100`; `docs/party-maintenance.md:48`).

Exact replay checks the global account/key receipt before clock, IDs or allocator invocation; it reauthorizes and returns the original recorded result rather than generating another code (`party-maintenance-service.ts:24–33`). The new reservation therefore does not alter the prior replay semantics, including original-result replay after later row changes.

## Independently executed verification

Node v24.19.0. Commands used existing dependencies and no listener/real database:

1. `node --test tests/party-*.test.ts apps/api/src/party-maintenance-http.test.ts`: 44 passed, 0 failed. Log: `/workspace/shared/erp-rewrite-planning/party-numbering-review-focused.log`; SHA-256 `5d4e07a45535890195ee1962259444c9ccfc1f7cdd12d32c680a0fae2682f38c`.
2. `./node_modules/.bin/tsc --noEmit -p evidence/party-typecheck.json`: exit 0. Log: `/workspace/shared/erp-rewrite-planning/party-numbering-review-typecheck.log`; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
3. `node --test /workspace/shared/erp-rewrite-planning/party-numbering-review-probes.mjs`: eight passed, 0 failed. Probe source SHA-256 `14d66687eb418e40fc0570ead187528315d62635ce3096c5e1c8c512aa2c2ca1`; log `/workspace/shared/erp-rewrite-planning/party-numbering-review-probes.log`, SHA-256 `e47ce01784923eb4d4953164325eb3dbe0656e9d68ae5e85384277ead40530f4`.

The eight novel probes cover:

- Exact arithmetic above 2^53 and adjacent to bigint exhaustion.
- 512 exact decimal model cases with historical padding preserved.
- Unloaded/existing/wrong-kind/repeated reservation guards.
- Code-lock, sequence read, highest-code read and exact setval argument ordering.
- Missing/malformed sequence state rolling back without reservation/native write.
- Mismatching setval acknowledgement and escaped closed handles.
- Same-table code-conflict translation and rollback without recoding.
- Twenty simultaneous exact-key synthetic creates converging to one row/audit/receipt/reservation, followed by independent customer/supplier advances.

The supplied frozen 44-check log was also inspected: `evidence/party-targeted-check.log`, SHA-256 `65309a717f80259b379e55525e9e6fc1c3fccc8822b53cfcfb04c250b4cfa38c`. Supplied verification record: `evidence/party-verification.json`, SHA-256 `a121b1470ff1ca1151def13e2023200400fce5963b551bc8c29f880bb545d679`. Its whole-project typecheck success is supplied evidence, not an independently rerun aggregate check in this review.

## Remaining gates

1. An authorized disposable PostgreSQL run of the exact 0001–0006 migration chain. Include real same-kind concurrent creation, independent cross-kind counters, both orderings of generated allocation versus explicit native insert, uniqueness conflicts, rollback gaps, maximum/exhausted suffixes, exact replay and commit uncertainty. Regress the existing party provenance/hall-dependency checks and sales/transfer native invariants. Pure/synthetic drivers and SQL regex checks cannot close this gate. The inspected integration harness still explicitly lists only 0001–0005 (`tests/integration/database.ts:8–14`); its results cannot be represented as 0006 evidence or extended by silently globbing migrations.
2. Explicit trusted host composition with createApprovedPartyCodeAllocator, session authentication, current policy, pool/UoW, clock and IDs. Runtime sequence SELECT/UPDATE and required native table/trigger permissions must be configured and verified; this slice creates no runtime accounts or grants.
3. Final integrated type/build/test acceptance and customer/supplier frontend/backend acceptance. The frozen slice's scoped checks are not an all-project build, browser or operational acceptance claim.

The only new files written by this review are the report, probe and verification evidence under `/workspace/shared/erp-rewrite-planning`. Implementation and frozen manifest files were not modified.
