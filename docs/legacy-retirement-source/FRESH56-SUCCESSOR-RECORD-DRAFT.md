# Successor catalogue and installation-record draft contract

## Existing compatibility boundary

The installed whole-package host does not accept arbitrary source expectations.
`loadWholeCatalogSpec` returns a branded object whose177 routine pins and ordered
source manifest are bound into `source_spec_sha256` with `WHOLE_CATALOG_QUERY`.
`verifyWholeInstalledCatalog` requires that branded object, verifies exact live
query acknowledgments and compares the observed catalogue packet against its
reviewed hash and physical identity.

The existing `WHOLE_INSTALLATION_RECORD_V1` contains exactly `format`,
`installedAt` and `binding`. Binding contains `system_identifier`, `database_oid`,
`database_name`, `owner`, `controller`, `runtime_login`, `server_version_num`,
`catalog_sha256` and `source_spec_sha256`. Its fixed OS path is the existing
whole-installation record. Loading requires a nonroot runtime, trusted root-owned
parent directories, no symlink, a root-owned regular single-link bounded file,
strict JSON and exact source binding. Publication/observation and host target
matching are separate gates. These structures and paths are unchanged.

The new candidate changes20 bodies and seven constraints. A source-level draft
cannot supply observed target OIDs, approved role/ACL metadata or a genuine
installed catalogue hash. Reusing the old source token/record or accepting both
pin sets in the old gate would violate that boundary.

## New source-only model

`fresh56-successor-record-draft.mjs` now derives a separately branded source
model from the combined three-candidate review. It records:

- Profile `FRESH56_PUBLICATION9_FK7_ROWTYPE11`.
- Existing predecessor source-spec and catalogue-query hashes.
- Exact candidate SQL pins and hashes of the two new model modules.
- Exact177 successor routine pins, seven FK deltas and preservation expectations.
- Table count56, not35, and outstanding observation/installation requirements.

An opaque genuine token is required for describing or serializing this model.
The serialized format is explicitly
`FRESH56_INSTALLATION_RECORD_SOURCE_DRAFT_V1`, not an installation record.
`physicalTarget`, `installedAt` and `reviewedCatalog` must remain null;
`sourceOnly` must be true and readiness/admission must be false. The validator
accepts only bounded strict JSON exactly matching the genuine model, including
every body pin, FK expression and field. Its success result is a draft diagnostic,
not a capability, reviewed binding or reusable installed spec.

Both exported live-record entry points unconditionally throw
`FRESH56_INSTALLATION_EVIDENCE_UNIMPLEMENTED` before touching caller arguments.
There is no disk publication, new OS path, database connection or host wiring.
Old record validation rejects the new draft; new draft validation rejects the
old profile. Existing active profiles and frozen handoff are unchanged.

## Still required for a real successor

Implement and independently review an exact successor catalogue query, including
constraint delta and invariant ACL/policy/trigger metadata. Observe the exact
physical target only after authorized atomic installation, then bind independently
reviewed engine evidence to a distinct durable record and explicit host profile.
Reuse the existing protection principles, but do not route the new record through
the old spec WeakSet or old source hash. Test wrong-role/target/catalogue/source,
record races, symlink/hardlink/permission failures, revoked/replaced evidence,
transaction/rollback failures and profile confusion before enabling anything.

## Verification

RED: new test failed before the model module existed. GREEN:20/20 tests passed:

```
node --test tests/fresh56-successor-record-draft.test.mjs \
 tests/fresh56-pin-conflict-analysis.test.mjs \
 tests/fresh56-combined-candidate.test.mjs \
 tests/unified-whole-installation-record.test.mjs
```

Five new tests cover genuine tokens, exact expectations, cross-profile rejection,
false observation and tamper rejection, duplicate/malformed/oversized JSON and
argument-unobserving refusal. Node v24.22.1; no typecheck, build, full suite,
PostgreSQL installation, production or Mac access.

## Provenance limitation and hardening

The source fingerprint is not authenticated execution evidence. The loader now
requires both named model files under the supplied sourceRoot to be byte-for-byte
equal to the corresponding module files next to the executing loader, and rejects
an alternate-root changed copy before loading the source candidate. The model
explicitly labels this as current module-file equality, not authenticated execution.

This does not authenticate the bytes Node previously loaded, its module cache,
transitive dependencies, process integrity, privileged concurrent mutation or a
future deployment. A module file can change after import. Source hashing and an
in-process genuine token do not attest an execution environment. No installation,
reviewed observation or admission authority follows from this diagnostic.

The added alternate-root test confirms changed model bytes are refused. The
record/combined/existing-record focused suites pass18/18 after hardening; live
load/publication still refuse without observing caller arguments.
