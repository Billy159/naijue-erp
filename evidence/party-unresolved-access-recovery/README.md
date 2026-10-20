# Party unresolved-write access recovery

Parent: `38a1a9d00ce5060879af409c6e7e1febad07ab5f` on `codex/clean-erp-foundation`. This owner repair changes only the three files in `implementation.sha256`; no application callback, transport, schema, database, dependency or production configuration was changed. The parent owns commits.

## Diagnosis and fix

A native receipt 403 used to dispose the shared party scope before calling the host bridge, which expired authentication and erased the original unknown command. The independent actual-composed baseline is preserved separately in `../application-core-integration-independent-party403-repro.log` and its baseline hash manifest.

A 403 is now local while the current command remains unresolved or the bounded opposite-kind store has unresolved work. Receipt failure stays uncertain; replay rejection cannot establish rollback. The same immutable request key, target, CAS, exact name and enabled value remain available only for explicit receipt/replay recovery. No write retry or new recovery key is generated. Fresh definitively rejected 403 still follows the previous cleanup when no other command is unresolved. Current 401 and explicit trusted identity/session/permission invalidation continue clearing both stores; late/aborted replies cannot expire or repopulate a replacement identity.

## Reproduction and final checks

All fixtures are synthetic and run locally. The final 15 focused tests were copied, together with their existing loading/contracts/validation dependencies, into an isolated temporary directory. Only controller.ts was replaced there by `git show 38a1a9d00ce5060879af409c6e7e1febad07ab5f:apps/web/src/parties/controller.ts`. The baseline controller hash and unchanged final test hash are in `baseline-inputs.sha256`: 8 passed / 7 failed, expected exit 1 (`baseline-final-tests.log`). The initial 12-test baseline is retained separately, not the final acceptance result.

Commands against the final implementation:

- `node --test apps/web/src/parties/receipt-access-recovery.test.ts`: 15/15 passed (`focused-unit.log`).
- `node --test --test-concurrency=2 apps/web/src/parties/*.test.ts`: 49/49 passed, including those 15 (`party-unit.log`).
- `node apps/web/src/parties/tests/run-dom-tests.mjs`: 11 existing synthetic Arco DOM groups passed (`party-dom.log`).
- `./node_modules/.bin/tsc --noEmit -p apps/web/src/parties/tsconfig.json`:passed (`party-typecheck.log`). Initial closure-inference diagnostics are retained in `party-typecheck-initial.log`; the bounded opposite-kind lookup corrected them before final acceptance.
- `node apps/web/src/parties/tests/run-build-check.mjs`:passed static/lazy-leaf build checks (`party-build.log`).
- `git diff --check -- apps/web/src/parties`:passed.

`implementation.sha256` seals the three repaired files. `dependencies.sha256` identifies inspected/tested loading, party and composed-application inputs plus declared dependencies. This is focused controller/DOM/build evidence, not aggregate-check or production acceptance. JSDOM does not render CSS or establish browser/pixel geometry; existing Arco/React 19 ref warnings remain visible. No network request, listener, database, install, schema application, commit, push or deployment occurred in this repair. Durable recovery after reload/authentication invalidation remains outside the unchanged session-only recovery contract.
