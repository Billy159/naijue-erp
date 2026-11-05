# Combined closure/batch initializer integration

Source-only review candidate. No PostgreSQL execution, installation or runtime admission.

The explicit `renderWholeBatchClosureIntegrationCandidate(sourceRoot)` entry in `scripts/release/unified-install/whole-closure-integration-candidate.mjs` now combines the two independently source-reviewed SQL successors with the exact existing access verifier under one BEGIN/COMMIT:

1. Verify the installed original closure body, owner and hardened configuration; replace it with singleton/marker closure.
2. Verify that exact intermediate body; replace it with immutable INIT-to-batch binding closure.
3. Run the complete existing source/owner/role/ACL/metadata/deferred-trigger verifier with only the final closure body pin substituted, followed by its existing permission statements.
4. Commit only if all stages succeed. Transaction behavior still requires actual engine testing.

Every input file is SHA-256 pinned. Any byte drift refuses rendering. The earlier singleton entry and generated SQL hash remain unchanged; this is an explicit new entry, not silent retargeting. Current active initializer lists, catalog verifier, source-cohort records and trusted installation records are unchanged.

## Catalog and permissions are not auto-approved

The generated catalog-pin proposal describes exactly one routine's original→final body digest. It deliberately contains no installed catalog digest and no new source-spec digest; independentlyReviewed=false. It is not a genuine runtime source-spec capability or an OS-trusted installation record. The manifest states REFUSED_PENDING_VERSIONED_INSTALLATION_REVIEW and runtimeCatalogAdmitted=false. The active gate therefore continues rejecting the changed routine until an appropriately reviewed versioned cohort and independently attested installed catalog exist.

The artifact contains **2 GRANT and 8 REVOKE statements**, copied unchanged from the existing access policy. These are permission-changing SQL, not read-only verification. They have not executed. Matching source statements do not prove the actual ACL delta is zero. Future authorized installation requires reviewing the complete catalog/ACL delta and obtaining appropriate authorization for the exact isolated target, operation and permissions. Maintain exclusive client ownership and prevent concurrent DDL/ACL/admin changes for the full installation/verification window. Nothing here supplies that authorization or barrier.

## Artifacts and evidence

- SQL: evidence/batch-integration-candidate-20261104.sql
- Manifest: evidence/batch-integration-candidate-20261104.json
- Pin proposal: evidence/batch-integration-candidate-20261104.catalog-proposal.json
- SQL SHA-256: 57746137a1fd2ffc11350f1d9f22c09b53e8361c4046cbe66766eefe3d886667
- RED: 3 new tests failed before the explicit integration entry existed.
- GREEN: 35/35 targeted source/renderer tests passed.
- Logs: evidence/batch-integration-red-20261104.log and evidence/batch-integration-green-20261104.log.

```sh
node --test tests/whole-package-batch-integration-candidate.test.mjs tests/whole-package-batch-closure-candidate.test.mjs tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-kernel-source.test.mjs
```

These .mjs files require the explicit command. Tests run the real offline renderer and compare generated SQL/pin changes, but do not parse or execute PostgreSQL. Combined integration independent review is requested. No database, Mac, user data, typecheck, production or deployment action occurred.
