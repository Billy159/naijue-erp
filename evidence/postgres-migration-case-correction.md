# PostgreSQL migration IF/CASE correction, 2026-10-20 UTC

## Status and scope

The first real PostgreSQL acceptance attempt against frozen commit `b508ce88127ce3e4562ff731982ac8b50a980146` **FAILED**, before business scenarios. The original failed target and evidence are retained. This correction task did not access PostgreSQL, run SQL, inspect credentials, install software, use the network, create a commit, or alter any earlier evidence.

The rewrite migrations have never been deployed. The parent explicitly authorized this minimal pre-deployment source correction after the first isolated-engine failure. No history rewrite, automatic checksum repair, hash-validation weakening, new migration, table, field, schema semantics or business-rule change is included. A real-engine rerun requires a separately fresh target and frozen reviewed source, operated by the PostgreSQL owner. **Corrected engine result: NOT RUN by this task.**

## Preserved first failure

- Frozen acceptance source: `/workspace/shared/erp-pg-source-b508ce8-20261020T2016`.
- Original TAP: `/workspace/shared/naijue-pg-disposable-20261020-xqs195/evidence/acceptance-01-b508ce8.tap`.
- TAP SHA-256: `23ebee8db974ac1673ccfa92a06b5d0941270b5bb3655cc445ba5a04a7b052ca`.
- TAP result: 1 test, 0 pass, 1 fail; SQLSTATE `42601`, `syntax error at end of input`. No business-scenario success is inferred.
- PostgreSQL owner reports exact server version PostgreSQL 17.11 (Debian 17.11-0+deb13u1), gcc 14.2.0, 64-bit.
- Owner's server-log error: character 11489, 2026-10-21 05:20:08.400 JST (2026-10-20 20:20:08.400 UTC). Original TAP did not log driver filename/position fields.
- Static mapping only: `/workspace/shared/naijue-pg-disposable-20261020-xqs195/evidence/first-error-character-mapping.json`, SHA-256 `22cd7c42db01839ddf7e9247b25d9fecbae721281e6ea7687ef428a53ae07692`.
- Mapping into exact frozen 0004 bytes: line 161, column 71, immediately before the first CASE branch THEN in the warehouse endpoint comparison. This is source-position attribution, not database-registry forensics or engine acceptance.

## Exact SQL correction and explicit manifest review

Only grouping parentheses were added around three SQL CASE expressions inside PL/pgSQL IF conditions:

1. `0004_transfer_runtime.sql:161`, `validate_transfer_effect`: warehouse endpoint CASE.
2. `0004_transfer_runtime.sql:313`, `validate_transfer_commit`: final action/status CASE. This second occurrence has the same top-level IF/THEN delimiter hazard and was found during the broader multiline CASE audit.
3. `0008_runtime_sparse_first_use.sql:84`, copied `validate_transfer_effect`: warehouse endpoint CASE.

The first CASE branch THEN would otherwise appear at the outer IF condition's parenthesis level. Grouping the CASE expression makes its branch THEN tokens nested, removing that delimiter ambiguity while preserving the expression's result and all original guards. This is the targeted source repair; only a fresh real-engine rerun can establish successful PostgreSQL migration execution.

Other CASE expressions in reviewed migrations were inspected and left unchanged: they are assignment/DDL expressions, or already inside grouping/function/EXISTS parentheses. In particular, 0004 lines 323, 367 and 369, and 0007 line 353 remain untouched.

Reviewed SHA-256 changes, explicitly applied to `tests/integration/migration-manifest.ts`:

- `0004_transfer_runtime.sql`
  - Original: `a85dd812fdf561652433e6fc2da49024f95db1137e52b84170470ec5f937224d`.
  - Corrected: `7dc7c0b37fa03ef20b5a86f261b7d8a2185dd1d410caf57473d2661e6cce8f3e`.
  - Exactly four additional characters, two parenthesis pairs; no other byte changes.
- `0008_runtime_sparse_first_use.sql`
  - Original: `4ad006940ddf408a01d319941ce7eba80abefb571788beeb1e8c7edcf60f5765`.
  - Corrected: `0988168c117517d8122564cecd41b66e9f34753b27e3b438cb53cbd3029d2262`.
  - Exactly two additional characters, one parenthesis pair; no other byte changes.

All other migration hashes, exact manifest order, hash-before-Pool validation, fresh-target safety gates and business assertions are unchanged. Prior manifests/reviews remain historical evidence of their original bytes and were not rewritten.

## Sanitized migration diagnostics

`tests/integration/database.ts` now wraps only a failed migration query, adding its reviewed filename, strictly validated five-character SQLSTATE and positive numeric source position. Arbitrary driver message/context/detail/query/connection fields are not copied or logged, and there is no cause carrying those fields. The original thrown object is not mutated. Unknown/malformed fields are labeled unknown.

The outer cleanup still performs rollback of any failed open transaction and discards/releases only harness connections. The new wrapper is not used by business/deferred-constraint probes, so their exact raw-driver code/message/function assertions remain unchanged.

## Source-only verification actually run

Toolchain: existing Node v24.19.0, npm 11.9.0, installed pinned dependencies. No installation or real database access occurred.

1. `node --test --test-reporter=tap tests/integration/migration-source.test.ts tests/integration/safety.test.ts tests/integration/proof.test.ts`: exit 0, **17/17 pass**. Raw output: `postgres-migration-case-source-checks.tap`.
   - New tests reverse only the three parenthesis additions and recover each exact frozen failing SQL SHA-256, proving no unrelated migration changes.
   - All eight current reviewed hashes match exact source bytes.
   - Fabricated diagnostic-error tests verify filename/SQLSTATE/position preservation, no secret/SQL/driver-text propagation, no original-error mutation and malformed-field rejection. They import the installed pg module but never construct a Pool or execute SQL.
2. `./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json`: exit 0.
3. Syntax checks for changed database/helper test source: exit 0.
4. `node tests/integration/plan.ts --suite sparse-0001-0008`: exit 0, PLAN_ONLY_NO_CONNECTION, all eight reviewed hashes match.
5. Existing independent source-only guarded plan probes: exit 0, including no-driver/network/spawn-import and target/credential-read guards for plan execution.
6. `git diff --check` over owned source paths: exit 0.
   - Outputs for checks 2–6: `postgres-migration-case-static-checks.log`.
7. Focused existing protocol/source regressions: exit 0, **184/184 pass**. Raw output: `postgres-migration-case-regression.tap`.
   - Files: inventory-first-use-postgres-protocol, inventory-first-use-schema-contract, inventory-cutoff-schema-contract, postgres-protocol, transfer-postgres-protocol, postgres-schema-contract, transfer-schema-contract, sales, transfer-service, all under `tests/` with `.test.ts` suffix.

These are TypeScript/source/hash/fabricated-error/protocol checks only. They do not parse or execute PL/pgSQL, prove PostgreSQL trigger composition, locks, durability, constraints, business scenarios or migration acceptance. No engine PASS is claimed. This focused task did not run the complete repository or UI suite.

Final correction source/evidence hashes: `postgres-migration-case-final-source.sha256`.
