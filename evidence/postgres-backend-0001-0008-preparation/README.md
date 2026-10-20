# Additional current-schema backend acceptance source

## Status: backend engine suite NOT RUN

This is source-only preparation for explicit `backend-0001-0008`. No database, migration, SQL/DDL, EXPLAIN, import, server startup, new target or network operation was performed to prepare or validate it. The already successful `sparse-0001-0008` run remains separate evidence at `evidence/postgres-real-acceptance-318440a/` and must not be relabeled as backend-suite acceptance.

The new file is `tests/integration/backend-acceptance.ts`. Plan/safety/dispatch changes add only the exact backend enum while keeping sparse selection and the historical `native-0001-0005` refusal. The same exact eight migration hashes, runner marker, explicit target settings, direct loopback identity, non-admin owner, fresh/exclusive target and post-0005 sparse reference hook remain required. Migration SQL and production adapters/services are unchanged. `sparse-acceptance.ts` is unchanged.

The additional planned engine assertions are disabled-account authentication STORAGE commit/rollback/locking/version revocation; targeted pricing/reference/image/numeric/session schema rejection; real same-document sales and transfer version-CAS/insertion races with observed waiters; signed RETURN/EXCHANGE effects and inverses; scoped native sales reads/statistics; count/page REPEATABLE READ across a real intervening committed SAVE; exact three-SKU/two-size product specifications and image METADATA; and a real deferred two-line transfer-position swap.

Authentication uses only a permanently login-disabled synthetic account and explicitly unusable sentinels, not a usable password/login token. No login, password verification, authentication-service/policy composition, HTTP/UI, media delivery, real-data compatibility, production grants/RLS, normal-planner performance, load, all lock schedules, unknown-COMMIT recovery, upgrades, deployment readiness or production acceptance is established.

Current-scope setup goes through the real staged import service and a nonzero synthetic baseline. There is no initial-zero stock seeding, old five-version prefix, or obsolete missing-balance=>not-ready expectation. Product metadata expects the current three real SKUs and two sizes. The historical body remains dormant and uncalled.

## Source-only validation

Recorded output files will identify exact commands, exit status, source SHA-256 values and whether a check was pure/static. Plan-only and fabricated/source-regression tests are not PostgreSQL evidence. Actual engine execution requires independent source review, a root-selected exact committed/frozen archive and a separately fresh approved target.

The new source regression is explicitly run with `node --test --test-reporter=tap tests/integration/safety.test.ts tests/integration/proof.test.ts tests/integration/migration-source.test.ts tests/integration/backend-source.test.ts`; it is not added to the root default test/build commands. Its captured `source-regressions.tap` is pure/fabricated/source-only evidence. Both `node tests/integration/plan.ts --suite backend-0001-0008` and the corresponding explicit sparse selection are recorded separately as plan-only JSON. Each `tests/integration/*.ts` file is also checked with `node --check`. Scoped `./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json` completed separately with exit 0 and no diagnostics; see `typecheck.log`. All 21 explicitly selected driver-free tests passed, both plan-only commands exited 0, and every integration source syntax check passed. These results do not constitute backend PostgreSQL acceptance.

## Operator extension proposal, NOT activated

`operator-fixed-enum-proposal.patch` is a minimal proposed external supervisor delta, not a repository runtime change. It preserves the existing `run` command's sparse-only meaning and adds only an explicit `run-backend` command. Both select a closed two-value enum and feed the same unchanged guarded runner. It adds no SQL, arbitrary command/environment mechanism, credential extraction, role capability or database bypass.

The current live holder's functions cannot be safely hot-reloaded. Editing its source file does not update the running function and stopping that holder loses its ephemeral credentials. No hot patch, memory manipulation, alternate credentials or restart/cluster workaround has been attempted.

A separately proposed lifecycle, requiring parent review and permission before any step:

1. Preserve all original evidence and the old successful/failed database directories. Freeze and review the new backend source and exact operator delta; select the source commit/archive and verify every migration hash.
2. Orderly stop only the currently owned disposable instance using its existing bounded stop command. Verify clean shutdown and that its owned loopback port is free. Do not delete, reset, repair, reuse or weaken authentication on the retained cluster.
3. Only after explicit authorization, use a never-before-used isolated directory for a separately initialized physical instance with the reviewed supervisor. Reuse only the already authenticated official PostgreSQL binaries or reverify their exact official package hashes. No host package/service/security changes, public listener, tunnel, production connection or real-data import.
4. Generate fresh admin/test credentials in process memory, feed initdb through a real inherited anonymous pipe, and use least-privilege dedicated test-role setup. Keep passwords only in memory/child environment and normal server hash storage, never chat/argv/source/logs/credential files. The persistent non-secret bounded command loop must be active before initialization finishes.
5. Verify nonsecret physical system identifier, primary status, exact `127.0.0.1` binding and explicit unused port, dedicated non-admin owner and separately fresh database. Report the fingerprint before execution. Only a further approved explicit backend selection may then invoke the same guarded runner against the reviewed frozen archive.

This proposal is not permission to stop or provision anything. A runtime/network/listener/tool denial must be reported and respected, not rerouted. The existing holder remains controlled and idle until the parent decides.
