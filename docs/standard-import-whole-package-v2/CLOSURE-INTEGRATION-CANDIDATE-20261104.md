# Closure successor initializer integration candidate

Source-only, not installed or runtime-admitted. PostgreSQL NOT RUN.

The next concrete integration gap was that replacing the closure routine leaves the existing access verifier expecting its predecessor body digest. The new offline renderer composes the complete closure successor and a copy of the real access verifier into one SQL transaction. Only the exact closure body digest changes in that copy. No predicate, role, privilege, trigger requirement, ACL test or other routine pin is removed or changed.

Implementation: `scripts/release/unified-install/whole-closure-integration-candidate.mjs`.

The renderer accepts only the exact SHA-256 source cohort of the existing whole-package kernel, reviewed closure candidate and existing access patch. It verifies the original closure routine digest is the candidate predecessor and occurs exactly once in the access cohort. It strips only the pinned source files' top-level transaction framing, then emits one BEGIN and one COMMIT containing predecessor/owner checks, routine replacement, full access/metadata/trigger checks and existing precise grants/revocations. A PostgreSQL error should therefore abort the entire successor operation, subject to actual engine validation.

## Permission-changing SQL, not read-only

The generated SQL includes the existing access script’s **2 GRANT and 8 REVOKE statements**. They are present and unexecuted, not removed or replaced by a read-only verifier. They are intended to retain the exact predecessor permission policy, but idempotence and the actual ACL delta require engine validation. Before any future installation, inspect and review the full catalog/ACL before-and-after delta and obtain appropriate explicit authorization for the exact target and permission-changing operation. Source review is not installation or permission approval.

This is a follow-on candidate for the existing initializer, not a replacement full installer. Existing installer lists, fresh-source pins, installation records and runtime catalog gate remain unchanged. The old runtime gate will reject the changed closure digest; that is deliberate. A reviewed versioned runtime-catalog successor is still required before use. The renderer does not manufacture that approval.

## Evidence

- New renderer tests initially failed because implementation did not exist (4 RED); this is implementation absence, not evidence of a historical SQL failure.
- Implemented renderer plus closure/kernel/search-path tests: 34/34 GREEN.
- Generated real SQL review artifact: `evidence/closure-integration-candidate-20261104.sql`.
- Generated manifest: `evidence/closure-integration-candidate-20261104.json`.
- SQL SHA-256: `d0e7188b09614310945137599e30e3521f6601c782177c3c257541bbb9071ead`.
- Manifest explicitly records engineExecuted=false, reviewed=false, runtimeCatalogAdmitted=false.
- Logs: `evidence/closure-integration-red-20261104.log` and `evidence/closure-integration-green-20261104.log`.

Run explicitly; these `.mjs` files are outside the root `.test.ts` glob:

```sh
node --test tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-kernel-source.test.mjs tests/unified-whole-search-path.test.mjs
```

No database connection, PostgreSQL execution, user data, Mac, typecheck, production or deployment action occurred. Independent source review found no blocker, with the permission-changing SQL caveat recorded above. Actual engine/metadata/ACL preservation tests remain required. The earlier closure routine itself has an independent source-level review with no blocker; that does not clear the new integration or runtime gate.
