# Runtime sparse first-use verification

Final owned source/test/document snapshot: `evidence/runtime-sparse-first-use-manifest.sha256` (17 files). No commit, push or deployment performed by this task.

## Focused regression run

Command:

    node --test tests/postgres-protocol.test.ts tests/transfer-postgres-protocol.test.ts tests/sales.test.ts tests/transfer-service.test.ts tests/postgres-schema-contract.test.ts tests/transfer-schema-contract.test.ts tests/inventory-first-use-postgres-protocol.test.ts tests/inventory-first-use-schema-contract.test.ts

Exit: 0. Result: 176 tests, 176 pass, 0 fail/cancelled/skipped/todo. Output persisted in `evidence/runtime-sparse-first-use-tests.log`. This is a focused 8-file application/write/protocol/schema-source subset, not the full test suite.

## Scoped TypeScript run

Command: `./node_modules/.bin/tsc --noEmit -p /tmp/tsconfig-first-use.json`.

Final successful invocation exit: 0. Stdout: empty. Stderr: empty. Exact selected roots and boundary are recorded in `evidence/runtime-sparse-first-use-typecheck.log`. The temporary configuration extends the repository tsconfig with explicit repository `node_modules/@types` because the config itself is outside the repository.

The successful scoped typecheck preceded only the final SQL-string exact size_group_member JOIN/FOR SHARE hardening and read/assertion changes in two legacy SQL-source test files. No production TypeScript signatures or control flow changed after that pass. Root owns the final integrated compile. No compiler rerun was performed solely to generate evidence.

## Independent review and limits

Independent reviewer owns `evidence/inventory-first-use-independent-probes.*` and `evidence/inventory-first-use-independent-review.md`; see its final frozen-hash result separately.

Migration 0008 was authored as approved source only, replacing exactly two existing function bodies and adding only its migration marker. Migrations 0001–0007 were not edited. There was no database execution, network, server, browser, installation, commit, push or deployment. Scripted pg protocol and SQL-source assertions do not establish actual PostgreSQL parsing, real lock ordering/deadlocks, concurrent races, deferred trigger/FK behavior or rollback/durability.
