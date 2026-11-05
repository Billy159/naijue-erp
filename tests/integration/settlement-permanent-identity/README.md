# Permanent settlement identity: prepared real PostgreSQL case

Status: NOT EXECUTED. Only `program.test.mjs` has run; it is an offline fixture/registration check, not PG evidence.

After the final source is frozen, the controller must authorize a fresh isolated target. Never reuse sealed or previously tested targets. Install the reviewed whole-package schema/roles first using the existing authorized process. No installer or connection discovery is provided here.

Use `createSyntheticPgSetup(config, ['success-and-exact-replay'])` from `../whole-package-pg-setup.mjs` to supply the existing guarded setup. Register `registerSettlementIdentityPg(test, setup, expectedTarget)` from `./real-pg.mjs`. Config contains exactly one `success-and-exact-replay` case, using fresh `synthetic_whole_*` loopback database and explicit ordinary writer / observer identities. Keep credentials in private local input, never evidence.

The independently approved expectedTarget must contain exactly: database_name, database_oid, system_identifier, server_address, server_port, catalog_sha256. Catalog binding is the existing SHA256 of ordered function definitions. The runner verifies both clients' physical identity and the observer's catalogue hash before mutation. The setup requires empty business tables and schema lineage 27. Existing snapshot and replay runner checks transaction isolation, COMMIT, exact replay without state changes, verify counts/totals, and conflicting plan rejection.

The new program adds sixteen equal-content settlements with distinct parent-bound permanent occurrence identities, including one EXISTING_VERIFIED target UUID. After publication, actual SQL checks all sixteen native rows and import-record proofs for exact target UUID, record UUID and sales parent. Full table/sequence hashes must remain unchanged through replay. This is SQL readback, not the native Sales API reader. A final runtime/API readback remains separate acceptance work.

Offline command:

    node --test tests/integration/settlement-permanent-identity/program.test.mjs

No PG case is automatically registered by import, no network connection is made during offline tests, and missing setup fails rather than silently skipping.
