# Versioned installation-record finalizer source

Implemented candidate, execution DISABLED and NOT INVOKED. Independent security/source review requested. No live database or installation configuration was accessed; no trusted record was created.

## Pre-Node launch blocker

The first executable statement of `main()` unconditionally throws `FINALIZE_TRUSTED_PRE_NODE_LAUNCH_REQUIRED`. No argument, environment variable, configuration field or caller token enables finalization. The remaining main body is an unreachable source candidate, not an executable installation path.

The previous environment and source-tree checks ran after Node startup and static dependency evaluation. They cannot prevent preload or module-resolution execution that happens earlier. The unconditional stop prevents this candidate's main-body database/publication work; it does **not** establish safe startup or make root execution safe. Do not launch this file as root. Enabling a future successor requires independently reviewed pre-Node runtime/environment/source/dependency trust assurance, explicit target/publication authorization, and renewed source binding. No such launcher or assurance was implemented here.

The new source regression failed before the change, then the bounded five-file source/pure/temp-file suite passed 19/19 on Node v24.22.1; syntax check passed. Main was not invoked. Evidence: `evidence/versioned-finalizer-pre-node-red-20261104.log` and `evidence/versioned-finalizer-pre-node-green-20261104.log`. This is not a database or privileged-launch acceptance result. Earlier 18/18 evidence below describes the previous source version.

`finalize-whole-batch-closure-v1.mjs` is a bounded finalizer for an **already installed** successor on a loopback synthetic_whole_* target. It is not a schema installer and issues no SQL permission changes. Its explicit main entry requires the dedicated finalization flag, root execution, clean runtime/database environment, trusted Node binary and root-owned trusted source tree. Importing its pure review validator does not run main.

## Required independent inputs

Two fixed, independently provisioned root-owned files are required beneath /etc/naijue-erp (or /private/etc on Darwin):

- whole-batch-closure-review-v1.json: exact WHOLE_BATCH_CLOSURE_INDEPENDENT_REVIEW_V1 evidence containing combinedSqlSha256 and the fully reviewed versioned installation record.
- whole-batch-closure-finalize-config-v1.json: private connection configuration for the exact reviewed controller/database, explicit loopback endpoint and noConcurrentDdlAclAdminChanges acknowledgment.

This code creates neither input. Root ownership alone is not a user permission grant: appropriate target-specific authorization and independent catalog/ACL review must occur before provisioning or executing them. Review evidence must be prepared independently from the actual installed target; do not relabel a freshly observed packet as approved.

Directory/file trust checks include root ownership, nonsymlink trusted path, no-follow open, single hard link, regular bounded file and safe permissions. The connection file must not be readable by group/other. The source cohort includes this finalizer, so changing the finalizer changes the required reviewed source digest.

## Unreachable candidate publication flow

1. Refuse if any versioned installation record already exists, before database connection.
2. Load genuine successor source spec and validate exact review format, original/final source binding, final closure body and combined SQL digest.
3. Open a dedicated ordinary-controller pg.Client with explicit bounded timeouts and no environment endpoint fallback.
4. Read the full unchanged catalog/ACL packet in REPEATABLE READ READ ONLY. Compare it to the independently reviewed record's exact raw-catalog digest, source digest and physical/user identity using the existing packet verifier.
5. Require acknowledged ROLLBACK and successful client close. Recheck source, review and configuration unchanged.
6. Publish the **reviewed record**, not a new record constructed from observation, using the existing no-overwrite durable publisher. Report uncertain publication durability distinctly; never automatically retry or overwrite.

The catalog transaction ends before filesystem publication. The external no-concurrent-DDL/ACL/admin-change window must hold through publication; this code does not provide an administrator lock or persistent admission lease. Publication is itself consequential and requires authorization. It does not mark the PostgreSQL acceptance cases passed.

## Validation performed

Source tests first failed before implementation. Final source/pure-review-validation plus existing publication/record/catalog tests: 18/18. JavaScript syntax check passed. Existing publisher tests use temporary synthetic files only; main, trusted paths, connection flow and publication path were not invoked.

```sh
node --test tests/whole-batch-closure-finalizer-source.test.mjs tests/whole-batch-closure-versioned-admission.test.mjs tests/unified-install-record-publish.test.mjs tests/unified-whole-installation-record.test.mjs tests/unified-whole-catalog-gate.test.mjs
```

Logs: evidence/versioned-finalizer-red-20261104.log and evidence/versioned-finalizer-green-20261104.log.

## Remaining minimum-engine blockers

The dedicated finalizer source now exists, but source review and real finalizer behavior remain unverified. Still required: explicit authorization; isolated fresh PG17 and roles; exact baseline/combined installation; independent actual catalog/ACL/metadata review; trusted review/config provisioning; authorized finalizer execution; non-root versioned admission; and real single-case direct-COMMIT validation. No production, Mac, user data, typecheck, database or installation action occurred here.

## 2026-11-04 13:28 UTC clarification after formal sales issuer wiring

The legacy batch-only finalizer remains disabled and is not a prerequisite or recovery route for the supported sales installer. The current fixed Python launcher accepts only original177 and sales installation modes; added negative contracts reject the finalizer flag, arbitrary entry paths and an arbitrary checkout before Node. Do not enable its body merely to produce a record or invoke this module as root: its static imports execute before main's refusal. The supported sales issuer composes and installs the current reviewed successor and publishes its own exact versioned record after full verification. A target already altered by a SQL-only harness cannot be retroactively recognized by invoking this finalizer.

Current formal chain and append-only test evidence are in COMBINED-SALES-INSTALLER-CANDIDATE-20261104.md, checkpoint 13:28 UTC. The expanded source/mock suite passed 56/56; this is not privileged execution or Mac/PG/host acceptance. No finalizer source, refusal gate, grant or record was changed by this continuation.
