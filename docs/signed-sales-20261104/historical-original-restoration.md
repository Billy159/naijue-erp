# Historical original approval restoration: source-only SQL candidate

## Boundary

This is an uninstalled source candidate, not PostgreSQL acceptance. It changes only the existing `validate_sales_settlement()` body, after the separately reviewed missing-settlement successor. It creates no helper function, table, column, row, privilege or importer/runtime exception flag. Existing WIP and both predecessor candidates remain untouched.

The candidate requires the exact reviewed whole-package source-profile cohort, hardened paths, private execution metadata and the existing native immutable/ordinary mutation guards. It replaces two unique literal body anchors and checks the resulting body SHA-256 plus all `pg_proc` metadata other than `prosrc`. Dependency bodies, definer status, search paths, absence of PUBLIC execution, and required enabled trigger identities/timing are checked before replacement. Installation and execution remain unverified.

## Proposed database proof

Ordinary approval of a `CUTOFF_HISTORY` document with no actual settlement rows requires proof even when net due is zero. The candidate admits only an original positive-version APPROVED SALE with one immutable MIGRATE_DOCUMENT receipt/audit, original empty settlements, an exact snapshot digest, matching published document and baseline cohorts, original initializer coverage digest and complete source identity bindings.

The source proof is inline and read-only. It verifies existing import records against their immutable standard-import receipt/audit, exact original request rows, recomputed source hashes and nonempty source-reference arrays. Header and complete physical line fields must match the immutable migration snapshot. Every original nonzero current line requires an explicitly sourced baseline key, with its original zero/no-effect or nonzero baseline-ledger evidence. It does not call functions that require the historical actor to remain employed or the caller to be the current importer. It does not call the runtime-inaccessible source-proof helper or add execution privileges.

All actual physical line rows, including inactive and zero rows, ordering, signed quantities, identities, prices, nullable pricing facts and snapshots, must still match the origin exactly. Current settlement rows must remain absent. Header identity/provenance and economic fields must match the origin. Known gross/net, signed quantity-times-price and known allocation contradictions reject before the absence exception. No missing settlement is filled with a zero, receipt/refund row or settled status.

Every SALES audit and receipt from the verified migration version through the current version is counted and checked without a truncated history window. Each later event must be contiguous, paired with its exact committed receipt, actor, recorded time, target, result version/status and exact immutable inventory effect IDs. The proof replays only paired sparse header keys. Explicit NULL differs from a missing key; before/after key asymmetry rejects. Action timestamps are compared as instants, preserving sub-millisecond PostgreSQL precision rather than JavaScript millisecond rounding.

Allowed later events are ordinary UNAPPROVE/APPROVE and draft SAVE of note/responsible staff only. All later line and settlement audit arrays must be exactly empty. Inventory effects are verified once per nonzero current line with signed quantity, warehouse, SKU, business date, posting time, version, source and reversal evidence. The final reconstructed native header must equal the current header. Existing current actor, authorization, same-transaction evidence and inventory/balance validators still run unchanged.

## Deliberately unsupported

- Any economic edit anywhere after migration, even if a later edit restores the original amount.
- Any line or settlement edit, including an edit later undone or an otherwise harmless row rewrite that produces a delta.
- Origins without a positive migration version matching the sealed header and receipt, original DRAFT/VOID, non-SALE types, unpublished or nonstandard cohorts, incomplete source/receipt/audit chains, or unsupported sparse header shapes.
- Created-by staff repair and before/after asymmetric metadata upgrades. The candidate rejects them rather than treating an omitted original fact as NULL.

These limitations do not authorize weakening normal approval. Economic edits still need their actual known receive/refund facts and ordinary balance checks. Missing evidence remains unknown. Native application capability evidence alone is not this database proof. An inaccessible or malformed source fails the statement rather than granting a fallback exception.

## Source evidence

Command, from the repository root:

```
NODE=../erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node
$NODE --test tests/historical-original-restoration-sql-source.test.mjs
```

`evidence/historical-original-restoration-RED.log` was saved before candidate creation: 8 tests, 0 pass, 8 ENOENT failures. This demonstrates a missing source candidate only, not a semantic PostgreSQL failure. The first implementation source check had one harness failure because a pinned dependency is itself constructed by the preceding profile successor, rather than present as a literal CREATE FUNCTION. The next source check had one harness false positive from the word “grant” in a comment. Both intermediate outputs are separately retained. Corrected construction checks passed 9/9 with zero skips. These tests check body construction, exact pins, source guards and preservation of the ordinary suffix. They do not simulate or establish database transaction behavior.

No PostgreSQL process, connection, parser, installer, typecheck, browser, Mac action or production action was used. A lexical parenthesis balance check is not a PostgreSQL parse.

## Required isolated acceptance before execution admission

Use a newly authorized isolated target and final combined frozen cohort. The minimum positive case is an original approved SALE with +1000/-300 lines, retained discount 10, net 690 and no settlement rows. Import without stock replay, unapprove, change note/responsibility through a supported sparse SAVE, and reapprove. Confirm exact signed line identities/economics, nullable original facts, no invented settlement record/status and exact reversal/reapproval inventory effects. Repeat with net zero, original null actor/time metadata, same-SKU opposite occurrences, zero/inactive lines and timestamp spelling/precision differences. Repeated unchanged lifecycle cycles must remain traceable.

Negative cases must reject forged/missing origin source, publication/coverage evidence, wrong digest, wrong source hash/reference/typed fields, missing or duplicate chain versions/receipts, asymmetric or omitted NULL keys, any prior economic/line/settlement edit (including edit-then-restore), known economic contradictions, runtime masquerading as historical, and every incorrect/extra/missing ledger effect. Existing nonempty contradictory settlements and ordinary runtime positive/zero-net approval rules must remain unchanged. Verify current authorization, idempotent retries and full rollback of rows, audit, receipts, ledger and balances for an injected failure. Run under the actual restricted runtime identity and prove there is no extra execution grant. Verify trigger timing, parser validity, catalog invariance and required role/RLS access before installer admission. No such acceptance is claimed here.

## Frozen source pins and independent review

- Required settlement predecessor body: `fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86`.
- Proposed settlement successor body: `bd6a69b4814d165f6e662787da3fdcced4af86581ecbf50664545d2724f1a217`.
- Final candidate file: `cd526efc8828a4156647eaf2bcc848612f6dad0b1f58d77e1066a11c2254addd`.

A separate source read at 2026-11-04 04:28 UTC found and corrected the dependency pin for `guard_unified_document`: the required body is its standard-initialization successor (`fa51aa3c…`), not the earlier migration body. The independent pinned-Node run then passed the new nine checks and prior missing-settlement check, 10/10 with zero skips. Its raw log is `evidence/historical-original-restoration-independent-source-GREEN.log`; its reviewed candidate file was `b233d3aa539f8879c9b1fdb88e60b5b4e92a6a191b86a8c242cd84d76ec307e8`. The final file subsequently added one metadata-only requirement for the enabled BEFORE INSERT baseline-reversal trigger. The proposed function body is unchanged. The final combined three-candidate source run passed 11/11 with zero skips in `evidence/historical-original-restoration-combined-source-GREEN.log`. Independent source review and these construction tests are not PostgreSQL parsing, runtime privilege or transaction acceptance.

The independent reviewer reran the new nine checks plus the prior missing-settlement check against the final `cd526efc…` candidate: 10/10 passed, zero failures/skips. Final independent output is retained separately as `evidence/historical-original-restoration-independent-final-source-GREEN.log`. It reported no remaining source-review finding, while explicitly retaining the PostgreSQL acceptance requirement.


## 2026-11-04 05:11 UTC: sealed migration version alignment

The earlier `cd526efc…` candidate was internally source-consistent but limited to a version-1 migration, unlike the current backend's proven sealed version-4 migration support. The corrected source candidate derives `origin_version` only from the unique immutable MIGRATE_DOCUMENT audit. It rejects NULL/nonpositive origins and origins not below the current approval version, and requires exact JSON numeric equality with both the sealed header and receipt result. It does not infer an origin from a partial ordinary audit chain.

Complete target audit/receipt counts are now `current version - origin version + 1`. These remain all-target counts with no filtering that could hide older or extra events. Contiguous replay begins at the verified origin, and the first UNAPPROVE requires that migration's baseline anchor at that exact origin version; subsequent reversals still require the preceding ordinary APPROVE ledger. The exact origin digest, published/source/baseline proofs, missing settlement restriction, economics, physical rows, sparse deltas and unchanged ordinary validator suffix remain required.

- Prior file preserved byte-for-byte externally at `migration-sql-origin-review-20261104/cd526efc-original.sql`, SHA `cd526efc8828a4156647eaf2bcc848612f6dad0b1f58d77e1066a11c2254addd`.
- Intermediate version-alignment candidate SHA: `d10a7cb79274740fa3260952bf6d7a1139a85ac7d0d74c0766a03ec2aea9475c` (superseded below).
- Current proposed function body SHA: `c8254568d222ec8b0146d739cb21b1698e7b69988bf8ac0e2bfe83404b4b2a63`; predecessor pin unchanged.
- Pinned Node24.21.0: all three SQL-candidate construction suites 11/11 PASS; backend `sales-migration-origin-reader.test.ts` 4/4 PASS. Logs retained externally under `migration-sql-origin-review-20261104/`.

These source/protocol tests are not SQL execution. The prior independent review applies to the archived prior bytes, not this changed body. PostgreSQL parser, role/RLS, trigger and atomic lifecycle acceptance remain required. Add a migrated version-4 APPROVED origin and its first version-5 UNAPPROVE, note-only SAVE and reapproval to the isolated acceptance cases above; reject mismatched origin/header/receipt versions, missing/duplicate/pre-origin events and incorrect first-versus-later reversal anchors. Nothing was installed; no PostgreSQL connection/process, typecheck, Mac or production action was used.


## 2026-11-04 05:14 UTC: trigger admission hardening

Independent review found that matching trigger name/function/type/enabled/deferred state alone could admit a modified trigger with a false WHEN predicate or narrowed UPDATE columns. Admission now also requires noninternal triggers, zero arguments and empty argument bytes, empty UPDATE column vector, and no transition tables. Nine required triggers must have no predicate. The ordinary-operation constraint trigger must retain exactly its original SALES/TRANSFER predicate, using the same canonical `pg_get_triggerdef` predicate comparison already present in the published document-anchor verifier. A blanket no-predicate requirement would incorrectly reject the original cohort.

The new source-construction test checks all ten original declarations from migrations 0001/0007/0027, their empty argument lists and lack of UPDATE OF/transition aliases; it verifies the sole intended predicate and exact admission checks. RED captured the missing invariants (9 pass, 1 failure). Final combined candidate suites: 12/12 PASS on Node24.21.0. Logs: `migration-sql-origin-review-20261104/trigger-admission-RED.log` and `trigger-admission-GREEN.log`.

Final current candidate SHA: `0051520ce229b3bfc88a9fa954c91642de59f7df9964b14f84398e1930ae37a3`. Function body SHA remains `c8254568d222ec8b0146d739cb21b1698e7b69988bf8ac0e2bfe83404b4b2a63`; this last change affects installer admission only. Exact catalog/deparser compatibility and rejection of tampered actual triggers still require isolated PostgreSQL execution. No such execution or installation is claimed.
