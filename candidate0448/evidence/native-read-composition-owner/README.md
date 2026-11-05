# Native auth/read composition owner verification

These are synthetic in-process checks only. No listener/server startup, PostgreSQL connection, credential lookup, real account seed, schema change, migration, deployment or package installation was performed by this worker.

Parent/source baseline commit: `c48eba1e9b05c76ecc9eec20c548dff13b5719b1`. That committed engine archive does not contain this new composition source. Only the parent agent commits; this worker's files remain uncommitted until narrow parent review/acceptance.

- `focused-tests.log`: final focused source, `node --test --test-concurrency=1 apps/api/src/postgres-read-api.test.ts apps/api/src/transfer-authentication.test.ts`, passed 17/17, exit 0.
- Aggregate `./node_modules/.bin/tsc --noEmit -p tsconfig.json` completed exit 0 with no diagnostics in local exec session 54018. At that run, `postgres-read-api.ts` was SHA-256 `10d84b2511170fbf16e138548ca3ee65cd7d7f16dde96a5b8b462ddea50bab81`; the transfer helper and both focused tests were already at their final hashes. The sole later TypeScript-file edit replaced the interface comment `Stops Fastify admission/drains requests, then disposes this API's one owned bounded pool.` with `Delegates to Fastify shutdown, then disposes this API's one owned bounded pool.` No expression, declaration/type shape or runtime behavior changed after that passing aggregate check. Final exact-hash focused tests passed again after the comment clarification. No compiler output was emitted, so this line is a verification record, not a fabricated output log.
- `source.sha256`: exact owned source/test/document hashes used by the final focused run.

Earlier failed checks were corrected rather than reported as passes:

1. The first focused run passed 15/16. Its attempted inject AbortSignal did not emit the plugin's raw-request aborted event after light-my-request consumed the body. The final test deliberately emits that synthetic event and tests independent sibling signals. It does not claim real network interruption or pg-wire cancellation.
2. The first direct-local aggregate compiler run found only new test typing errors: unknown injected payload selected the wrong overload and an incomplete service stub cast was invalid. Tests now serialize payloads explicitly and supply a complete service stub; the final local aggregate compiler passed.
3. An initial `npx --no-install tsc` attempt unexpectedly tried registry.npmjs.org and continuation was denied under the no-network task restriction. That network operation was not retried. The already-installed compiler was verified and invoked directly without npm/npx. No installation or registry result is claimed.
4. Independent review identified that the exported transfer authenticator delegated through mutable caller options. The helper now captures/fixes the HTTPS origin and bound actual service method references before delegation; dedicated mutation regression coverage passes.
5. Independent teardown probes show that closing an injected, non-listening application can dispose a pool before an outstanding injected read completes. Source comments/documentation now describe delegation to Fastify's standard server lifecycle, without claiming inject establishes real HTTP draining or graceful network shutdown.

The complete required external business policy/media seams and remaining real acceptance boundaries are listed in `docs/postgres-read-api.md`. This is source composition plus inject/protocol-double evidence, not actual HTTP+PostgreSQL acceptance. Existing sparse-engine evidence at commit 318440a is separate and must not be relabeled as proof for this factory.
