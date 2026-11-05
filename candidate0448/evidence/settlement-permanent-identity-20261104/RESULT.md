# Settlement permanent occurrence identity

Scope: synthetic offline verification only; no Mac, production, real source data, PostgreSQL connection, build or typecheck.

## Baseline and change

The v3 (1204) and v4 (1258) frozen copies of `packages/application/src/unified-import-stable-identity.ts` both have SHA256 `ec6449408b0ff428703ed5e53dffafe772016bd06688e4c4063ff5b1f70459be`. Both omit SALES_SETTLEMENT.

Add SALES_SETTLEMENT to the existing occurrence identity codec and generator. Its key contains the canonical SALES_HEADER source key, permanent ID basis, and original occurrence ID. Validate sales_id against that exact parent registry entry in the shared ordinary/stream binding validator. Existing unprefixed identities and existing verified target UUIDs remain unchanged. No database/schema change.

Changed code/tests:
- packages/application/src/unified-import-stable-identity.ts
- tests/unified-import-stable-identity.test.ts
- tests/unified-import-stable-identity-preflight.test.mjs

## Evidence

- red.log: new settlement helper test fails with LINE_ENTITY_INVALID; previous five tests pass.
- green.log: 26/26 pass. Covers occurrence UUID validation, distinct identical-business occurrences, provenance/reorder stability, parent binding/missing/wrong parent, duplicate identity rejection, existing verified target UUID preservation, ordinary/stream full request parity, stable replay record IDs and SQLite fact readback. Includes the existing 22-zero-record archive test, zero funds actions.
- regression.log: 20/20 pass. Existing settlement identity source guards, published identity protections, archive intake/request preservation and archive reader/source proof tests.

Commands:

    node --test tests/unified-import-stable-identity.test.ts tests/unified-import-stable-identity-preflight.test.mjs tests/unified-zero-amount-archive.test.ts
    node --test tests/unified-standard-import-settlement-identity-source.test.ts tests/published-settlement-identity-source.test.mjs tests/zero-amount-archive-intake.test.mjs tests/zero-amount-archive-proof.test.mjs

Limits: request preparation and SQLite readback are not actual PostgreSQL import or native sales API readback. Source guard tests are not SQL runtime execution. No complete project acceptance claim is made.

## Prepared PG continuation (not executed)

Added `tests/integration/settlement-permanent-identity/{program.mjs,real-pg.mjs,program.test.mjs,README.md}`. The program uses sixteen equal-content settlement occurrences and one retained EXISTING_VERIFIED UUID. The real-PG registration reuses the existing guarded whole-package atomicity runner and requires separately approved physical target plus catalogue binding. It checks native settlement rows and import-record proofs for UUID/parent association after COMMIT; existing replay checks require unchanged table/sequence snapshots and conflicting plan rejection. No target started or connected; `pg-fixture-offline.log` is 2/2 offline fixture tests only. Native Sales API readback remains unexecuted.

Read-only tracing found the native reader selects s.id/s.sales_id with ORDER BY line_no,id and no business-content DISTINCT, then decodes every row. SQL verification resolves each source proof by target_type SALES_SETTLEMENT and target_id, comparing typed original settlement fields. No additional production code change identified in that path.

## Departed staff null-hall approval: read-only follow-up

Reused four existing suites: `unified-historical-staff-hall-approval.test.ts`, `unified-historical-staff-hall-preflight.test.mjs`, `historical-staff-hall-sql-source.test.mjs`, `historical-sales-execution-admission-path.test.mjs`: 24/24 pass, in `staff-hall-readonly-regression.log`. No staff-hall source/tests changed.

Both `whole-import` and `stream-import` share `stream-import-cli.mjs`, read the externally pinned approval, bind its namespace and source hashes to the package, pass approval to full stream preflight and both planners, and bind its exact bytes in initialization. Existing tests reject absent independent hash, package-owned approval, hash mismatch, namespace mismatch, absent current source hash, wrong target/key/source refs, forged capability and active employees. Ordinary active salesperson hall validation remains required. Offline `stream-prepare` and standalone preflight CLI do not expose approval flags; the formal import entries do. These are source/negative/offline checks, not successful real-data import evidence.
