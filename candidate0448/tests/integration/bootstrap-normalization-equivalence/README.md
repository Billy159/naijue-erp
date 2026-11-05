# Bootstrap normalization equivalence experiment

Status: **source-only specification, PostgreSQL NOT RUN**. No equivalence result,
bootstrap successor, installation, approved catalogue or final35 claim exists.
This is a disabled future experiment specification, not a migration. Existing V1 historical
proof,49/45/4 account closure and all installation gates remain unchanged.

## Purpose and exact scope

Compare two normalization expressions using only synthetic inputs:

1. The original operation: `to_jsonb(jsonb_populate_record(NULL::<rowtype>, input))`.
2. A proposed12-field `jsonb_to_record` projection with explicit SQL NULL handling.

The rowtype is a temporary table matching the12 scalar/JSONB field types from the
pinned0011 source. No application schema or function is created or replaced.
The original bootstrap source and table-definition file must match their exact
hashes before generation. The generated fixture includes both source hashes in
its observation snapshot. Retain the exact fixture SHA256 and Node/source test
logs with any eventual engine run; source fingerprints do not authenticate the
execution environment.

## Synthetic cases and expected acceptance

The24 cases cover:

- Exact snapshot: both normalize identically and match actual synthetic source.
- SQL NULL: preserve SQL NULL distinctly from JSON null; no source match.
- JSON null, scalar string and array: both expected to reject with22023.
- Empty object, missing id and explicit-null id: normalized null fields; no match.
- Extra field: ignored by the legacy conversion and therefore also by the candidate.
  Do not make this case stricter and call that equivalent.
- Uppercase UUID and bigint string: canonicalize to the original source and match.
- Bigint signed extrema: valid normalization, different source value.
- Invalid UUID/object and fractional/boolean bigint: expected22P02.
- Bigint overflow: expected22003.
- Changed source hash, missing/null/changed provenance and different source key: must
  fail comparison with the synthetic actual source, even if normalization succeeds.
- Text coercion and nested JSONB null/array values: compare exact normalized output.

These SQLSTATE expectations are test hypotheses based on intended PostgreSQL17
behavior, not engine observations. A disagreement must stop the experiment and
be reviewed, not silently update an expected result to obtain green.

Each case captures status, value, a distinct SQL-null flag, SQLSTATE, error text
and source-comparison result for both expressions. Equivalence requires exact
normalized value/null/source-comparison and SQLSTATE equality. Error message text
is retained but excluded from equality because expression/function names can
differ; callers depending on exact error text would require separate compatibility
review. Full historical source/account/receipt authorization is outside this test.

## Execution blocked pending trusted target evidence

This artifact is **NOT EXECUTABLE**. Its first effective psql instruction is an
unconditional quit before any SQL is sent. A second SQL-only boundary starts a
transaction and unconditionally raises
`BOOTSTRAP_EQUIVALENCE_TRUSTED_DISPOSABLE_TARGET_UNIMPLEMENTED` before target
settings, checks, temporary tables or experiment queries. No caller flag disables
these refusals. Do not remove them to run this fixture.

The earlier name/user/version checks do not establish a local endpoint, physical
cluster identity, or absence of real data elsewhere in the database. Operator
assertion alone is insufficient. A separately implemented and independently
reviewed launcher must bind a newly created disposable cluster, fixed local
endpoint/socket, server process/data directory identity, physical system and
database identifiers, ordinary role and clean database contents to the exact
fixture before a successor can become runnable. Permission and proof must both
be present. Such a launcher does not exist here, and no connection command is
provided. No PostgreSQL action was attempted.

A future reviewed successor must capture exact stdout/stderr/exit status, cluster
identity evidence, source/fixture hashes, version and cleanup. This disabled
artifact can yield no successful engine result or cleanup marker under psql.

## Proposed experiment bounds and cleanup (unreachable while blocked)

- Explicit READ COMMITTED transaction, statement15s, lock2s and idle-transaction30s.
-24 fixed bounded synthetic cases, no external files, no loops over real tables.
- Only temporary rowtype and results tables; no persistent application DDL or DML.
- Success emits the observation snapshot, checks all outcomes, rolls back, then
  verifies both temporary tables are absent before emitting the cleanup marker.
- Any failure stops psql via ON_ERROR_STOP. The dedicated connection must close;
  PostgreSQL rolls back its transaction on disconnect. Capture and verify the
  connection termination. Do not reuse an uncertain live connection or continue
  with manual commits. The success marker must be absent on failure.
- The fixture contains no COMMIT, installer invocation, grant or application
  function replacement. A synthetic name is an extra guard, not authorization.

## Meaning of a future reviewed successor green result

It would establish only these24 expression-level cases for the exact tested
PostgreSQL version and fixture. It would NOT establish complete input equivalence,
correctness of historical source proof, runtime caller/trigger reachability,
metadata/OID/ACL preservation, installation safety or permission to remove either
historical table. A separate source successor and comprehensive engine acceptance
would still be required. No gate is opened by this fixture or its results.

## Source verification performed

`node --test tests/bootstrap-normalization-equivalence-source.test.mjs
 tests/bootstrap-source-cast-boundary.test.mjs` passed10/10 on Node v24.22.1.
These verify fixture reproducibility, target/time/rollback guards, all24 cases,
strict snapshots and changed-source refusal. No PostgreSQL test was run.

Hardening adds source tests proving both unconditional boundaries precede all
target actions, and that missing_provenance omits the field while null_provenance
separately supplies JSON null. These are source assertions, not engine results.
