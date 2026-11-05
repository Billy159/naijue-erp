# Versioned batch-closure catalog admission source

Implemented in separate modules; not activated, installed or database-tested. Existing host/CLI/default admission paths are unchanged; the synthetic runner has a later explicit successor-profile entry described in MINIMUM-ISOLATED-PG-BLOCKERS-20261104.md.

- scripts/release/unified-install/whole-batch-closure-catalog-v1.mjs
- scripts/release/unified-install/whole-batch-closure-record-v1.mjs

## Real source/catalog binding

`loadWholeBatchClosureSpecV1(root)` loads the existing genuine source cohort and exact combined SQL renderer, verifies that the existing closure pin matches the expected predecessor, and changes exactly that routine's pin to the final batch-binding body. Routine count, all other pins and the complete catalog/ACL/security query remain unchanged. The resulting source spec is privately branded and immutable.

Its distinct digest binds the predecessor source spec, combined SQL digest, final closure body, and unique sorted hashes of the entire predecessor source set plus both SQL candidates, renderer, new gate and record loader. Conflicting hashes for the same path reject. A copied/caller-created spec cannot reach verification.

`verifyWholeBatchClosureInstalledV1(client, spec)` loads its own fixed OS-trusted record before issuing SQL. It accepts no caller-supplied approval or observed catalog packet as a reference. The existing full catalog query checks all original table/routine/trigger/role/ACL/metadata conditions. The existing packet verifier then requires exact catalog bytes/hash, source digest and physical/user identity against the trusted record.

## Independent installation record remains mandatory

The fixed record path is /etc/naijue-erp/whole-batch-closure-installation-v1.json (under /private/etc on Darwin). The loader retains non-root runtime, root-owned nonsymlink directories, safe directory modes, no-follow file opening, root-owned regular single-link bounded file and non-writable-by-group/other checks. Its new exact format binds predecessor source spec and final closure body in addition to the existing complete binding fields and timestamp.

The pure JSON validator is only a schema/binding validator. It does not create trusted authority. Verification obtains the record exclusively through the fixed OS-trust loader, not from that validator's caller or return value.

No record was created, captured, installed, approved or read here. No write/capture/publish helper exists in these two loader/gate modules. A later separate explicit finalizer source is documented in VERSIONED-FINALIZER-SOURCE-20261104.md; it has not been invoked and its main entry is unconditionally disabled pending independently reviewed pre-Node launch assurance. Do not run that candidate as root; its in-process checks cannot establish safe startup. Missing record, stale source, wrong physical target, altered catalog or forged spec must fail closed. Source-level review does not approve an installation or its ACL delta. Future record publication requires an independently reviewed authorized installation and appropriate authorization; it must not be inferred from whatever catalog is currently observed.

## Transaction and activation limits

Caller must own the exclusive physical client and begin REPEATABLE READ READ ONLY; the unchanged catalog query requires those transaction settings and original session role. Caller must prevent concurrent DDL/ACL/admin changes throughout admission and subsequent operation. This verifier does not acquire an external admin barrier or provide a persisted admission lease.

These modules are not wired into the active importer or host. A later explicit WHOLE_BATCH_CLOSURE_V1 synthetic-runner selection uses them; the original runner default remains unchanged. This preserves the old gate. Activation requires independent review and a separately authorized target/installation-record workflow. Combined SQL still contains the disclosed 2 GRANT/8 REVOKE statements and requires catalog/ACL delta review before any future execution.

## Source validation

New tests first failed before implementation (3 RED). After implementation, 17/17 source, pure record validation, existing gate and renderer tests passed:

```sh
node --test tests/whole-batch-closure-versioned-admission.test.mjs tests/unified-whole-catalog-gate.test.mjs tests/unified-whole-installation-record.test.mjs tests/whole-package-batch-integration-candidate.test.mjs
```

Evidence: evidence/versioned-admission-red-20261104.log and evidence/versioned-admission-green-20261104.log. No registered database case, actual record-loader invocation or PostgreSQL query ran. These .mjs tests require the explicit command and are not full-project/typecheck/engine acceptance. Independent source review requested.
