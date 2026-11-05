# Successor admission integration and minimum isolated PG test

Current state: offline source integration only; no database operations, installation or trusted record publication have occurred.

## Integrated source path

The direct-COMMIT acceptance runner now supports an explicit sixth argument `WHOLE_BATCH_CLOSURE_V1`. Its default remains `ORIGINAL_WHOLE177`. This is a strict enum, not a callback, review flag or catalog hash. The successor selection routes only to `admitWholeBatchClosureAcceptanceTargetV1`, then the genuine versioned spec and fixed OS-trusted record verifier. Failure cannot fall back to the original profile. Admission ends with acknowledged read-only ROLLBACK before any package write.

Existing physical target bindings, one-case selection, whole-window exclusivity acknowledgment, nonempty-target rejection, independent observer checks and safe cleanup remain in force. Production importer/host/CLI defaults are unchanged. A profile name selects code; it does not provide authority.

## Exact remaining prerequisites

1. **Authorized isolated target:** explicit permission for a new disposable PG17 synthetic target, its exact system identifier/database OID/name/loopback endpoint, ordinary schema owner/controller/runtime identities, observer access, and all necessary installation/ACL operations. No existing user or production data may be used.
2. **Complete installed predecessor:** existing fresh installer prerequisites and full original role/schema/catalog cohort must be installed. The combined candidate is a follow-on, not a standalone schema. The protected role/trigger/RLS/source gates must remain intact.
3. **Authorized successor execution:** execute the exact reviewed combined SQL candidate under the matching schema/function owner, with recorded backup/rollback/disposal plan and full-window exclusive DDL/ACL/admin control. Its 2 GRANT/8 REVOKE statements require appropriate authorization. Review actual before/after routine metadata, source bodies, ACLs, trigger mounts and catalog delta. Source tests are not evidence this succeeded.
4. **Independent trusted record:** create the new versioned root-owned installation record only through a separately authorized trusted workflow after reviewing the actual installed catalog, target, full source digest, predecessor source digest and final closure body. Do not treat an observed packet as approval. The existing record-whole-installation entry publishes only the original record; a dedicated versioned finalizer has now been implemented as uninvoked source (see VERSIONED-FINALIZER-SOURCE-20261104.md), but its main entry is now unconditionally disabled pending independently reviewed pre-Node launch assurance. In-process environment/source checks do not secure startup or static imports. Do not run it as root or bypass the stop; security review, an enabling successor and real execution remain pending. A full versioned schema installer is not included. Manual trusted publication is also consequential and needs its own precise review/authorization. Neither copying the old record nor passing a hash to the test supplies authority.
5. **Stable source and exclusive window:** finalize the source cohort before record publication. Any subsequent hashed source edit invalidates the record. Keep exclusive physical clients and no concurrent DDL/ACL/admin changes from admission through cleanup; no check here provides an external administrator barrier.
6. **One actual engine case:** on that trusted target/executor, register one named case with independently verified bindings, exclusive-window acknowledgment and explicit successor profile. The minimal complete-package direct-COMMIT case must prove real deferred-trigger closure, acknowledged COMMIT, observer visibility and exact receipt/publication readback. Then use separately authorized fresh targets/records for prepare-only and baseline-only direct-COMMIT rejection. Do not reuse a mutated target or rotate records silently.

PostgreSQL function compilation, actual metadata/ACL preservation, trusted record loading, real catalog verification and all three engine cases remain NOT RUN. A local PostgreSQL environment was not inspected or provisioned here. The next work cannot be represented as successful engine acceptance without those steps.

## Validation performed

Strict-profile regression first failed before implementation. After integration, 26/26 source/registration/pure-record/existing-gate tests passed:

```sh
node --test tests/whole-package-direct-commit-runner.test.mjs tests/whole-package-acceptance-admission-source.test.mjs tests/whole-batch-closure-versioned-admission.test.mjs tests/unified-whole-catalog-gate.test.mjs tests/unified-whole-installation-record.test.mjs
```

Logs: evidence/successor-runner-profile-red-20261104.log and evidence/successor-runner-profile-green-20261104.log. No registered engine callback ran. Independent integration review requested.
