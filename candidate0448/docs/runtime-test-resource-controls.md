# Explicit runtime-test resources

The supported aggregate remains `npm run check:launch`. Its runtime stage discovers
and sorts the original `apps/web/demo-replica/frontend/runtime/**/*.test.mjs|ts`
files; the list is not copied into a second runner. Without an option, the original
Node command and default concurrency remain unchanged. There is no environment
variable, automatic fallback, retry, skipped test or new npm alias.

## Select a resource budget explicitly

```sh
# Plan only: no version probe, Git process, child test or acceptance execution.
npm run check:launch -- --plan --runtime-test-concurrency 2

# Same aggregate and original tests, explicit runtime-file concurrency.
npm run check:launch -- --runtime-test-concurrency 2

# Existing absolute acceptance path remains a separate, unchanged requirement.
npm run check:launch -- --runtime-test-concurrency 2 --acceptance /ABS/current-acceptance.json
```

The CLI accepts canonical positive decimal integers `1` through `64` only. It
rejects missing/duplicate/unknown options, `02`, `+2`, fractions and out-of-range
values. `--plan` and `--acceptance` remain mutually exclusive, as before; either
can be combined with the resource option in either order. The API is
`launchCommands({runtimeConcurrency: 2})`, with an own primitive safe integer.
Only `replica-runtime-tests` receives `--test-concurrency=2`; the other nine
aggregate stages, root tests and import tests do not receive that flag.

Explicit selections appear as
`runtimeResources.replicaRuntimeTestConcurrency` in the plan/result JSON. Absence
of that field means the original Node default was selected. This is configuration
metadata, not evidence that a blocked or failed command ran successfully.

## What the evidence establishes

One control run used the original C11 direct Node `--test` command for all 72
files, adding only the Node flag `--test-concurrency=2`. It passed all 236 tests
on 2026-11-01, in 95.002 seconds; the new root CLI entry did not exist for that
run and was not exercised by it. Its original application/runtime-test source, HTTP 100 ms
deadline, 15 ms settle, 130 ms timeout negative and all assertions were unchanged.
That is a pass for the explicit concurrency-2 condition, **not** a pass for the
original default-concurrency gate. The earlier C09/C10/C11 default failures and
instrumented diagnostic failures remain preserved. One green comparison does not
prove their root cause, a CPU-quota mismatch, or that other concurrency values
have passed. Native available-parallelism and quota/load equivalence are distinct
questions; do not infer resource capacity merely from a CPU count.

The resource setting does not change application source, runtime test cases,
their deadlines or business concurrency. This implementation does change the
root launch script and its pure tests. The experiment's 600-second child budget was an outer observation
budget, not a new application timeout and not a timeout added to this aggregate.

All stages still run once and failures still aggregate. Exit meanings remain
`0` PASS, `1` local FAIL, `2` blocked environment/acceptance. Invalid CLI input
fails before any command is spawned. Current exact toolchain/commit guards,
31 actual-scope acceptance requirements, receipt hashes and release-helper
reapproval blocks are unchanged. Selecting resources is not deployment approval,
does not manufacture acceptance receipts, and never makes an old failing gate
green retroactively. PostgreSQL engines and benchmarks remain opt-in, outside
this option.
