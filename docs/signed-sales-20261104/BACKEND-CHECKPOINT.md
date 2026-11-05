# Signed-sales backend checkpoint

Captured 2026-11-04 03:53 UTC. Repository baseline remains 051bbe14a4cba4e1849b8547665f13df85dd8fe0; changes are uncommitted WIP. Preserve unrelated work.

## Scope and decision

Historical original SALE remains SALE, without splitting. Signed historical economic edits preserve original whole discount. Net due is signed new line total minus that unchanged discount. No automatic settlement generation. Unbalanced drafts save; approval compares actual receive-minus-refund and reports the exact minor-unit difference. New return/exchange mixed documents retain zero whole discount.

Current backend continuation additionally permits explicit-priced incomplete draft rows to retain nullable pricingRule/isGift/zeroConfirmed. This uses existing nullable proposal fields, not a new business type or a skip-validation flag. Known contradictions, signed amount arithmetic, references, current minimums, versions, permissions and transaction processing remain checked.

Approval distinguishes original historical unknowns from changed/new unknowns using the original transaction's audit/receipt history. Unknown rows touched economically in a SAVE cannot be laundered by a later memo SAVE. History must have contiguous versions, matching target/actor/action/result/receipt/time, and a valid lease. Missing/invalid history fails closed. No previous UNAPPROVE means the audit reader starts with version 2 SAVE events; imported native version 1 is the baseline. Other imported starting versions without complete supporting history are not silently inferred.

## Executed checks

Actual command (Node v24.22.1):

    node --experimental-strip-types --test tests/native-sales-preparation.test.ts tests/sales-business-rules.test.ts tests/sales-retained-approval*.test.ts tests/sales.test.ts tests/native-sales-return-exchange-preparation.test.ts

Result: 130 tests, 130 passed, zero failed/skipped/todo. Synthetic tests and PostgreSQL protocol simulations only, not actual PostgreSQL or browser.

Evidence retained in the supplied evidence directory:
- backend-incomplete-red.log: changed incomplete historical SAVE failed old behavior.
- backend-new-incomplete-red.log: new incomplete atomic proposal failed old parser.
- backend-incomplete-regression-01.log and -02.log: intermediate failures retained. One test fixture lacked the existing SKU resolver; final synthetic fixture supplies known synthetic SKU selection only, real preparation/service remain under test.
- backend-incomplete-regression-03.log: final 130/130 result.

Superseded SAVE-reject assertions now assert successful incomplete draft preservation plus rejection at approval, per the latest explicit user decision. Existing pricing contradiction and prior-original-approval assertions remain.

## Files touched by this continuation

- packages/application/src/native-sales-preparation.ts
- packages/application/src/sales-business-rules.ts
- packages/application/src/sales-service.ts
- packages/application/src/sales-retained-approval.ts
- adapters/postgres/src/sales-retained-approval-reader.ts
- tests/support/synthetic-store.ts (audit history selection only)
- tests/native-sales-preparation.test.ts
- tests/sales-business-rules.test.ts
- tests/sales-retained-approval.test.ts
- tests/sales-retained-approval-postgres-protocol.test.ts

Earlier signed-sales WIP also touched sales-native-facts.ts and other owners' UI/import/inventory files; this report does not replace their manifests.

## Remaining acceptance

No typecheck, real PostgreSQL, browser, production import, deployment or push was executed here. Independent review of the new provenance validator is still required. This is a source candidate, not final acceptance.

Local Codex should verify nullable incomplete SAVE compatibility with the installed constraints and real audit serialization/permissions; run changed historical row -> SAVE -> memo SAVE -> reject APPROVE until real pricing facts supplied, and unchanged unknown sibling -> changed complete row -> balanced APPROVE. Test both original imported DRAFT and approved -> UNAPPROVE origins. Verify missing/truncated/wrong-receipt history fails closed and transaction rollback leaves no effects. Re-test complete final combination with real inventory anchors, browser and installer.

Explicit boundaries: nullable unknown payment-method edits remain guarded; only exact unchanged historical settlement methods may remain unknown. Legacy prepareCreate still requires complete pricing input; atomic native SAVE and existing-document preparation are the incomplete-draft paths. Final combination across all API legacy/new routes and pure-positive result after editing an originally mixed historical SALE remains to be checked. Missing historical settlements are not converted to a zero record or inferred settled.

## Post-checkpoint corrections, 2026-11-04 04:05 UTC

The earlier 11:56 Beijing source package does not include these corrections. Independent review reproduced two defects, retained in backend-review-defects-red.log:

1. Historical discount exception was lost after the last negative row became positive. It now follows the original historical signed SALE through verified full audit history, not current sign. Tests cover approve, unapprove, re-edit, and removing the last negative row while retaining its inactive identity. Original discount remains immutable for this exception.
2. A malformed before-only audit row or after-row differing from the locked current row could pass the unknown-row proof. History now reverses sparse header, line and settlement evidence against exact current values, validates membership and receipts, and fails closed on mismatch. Before-only sales rows are invalid because removal retains an inactive native row; settlement removal is explicitly handled.

The PostgreSQL reader now reads all bounded native versions >=2. Whole-document unchanged-original restoration still validates only its latest UNAPPROVE-and-SAVE suffix. Origin tracking additionally consumes earlier approvals/unapprovals so the historical exception cannot disappear after another approval cycle. Original classification and unchanged-settlement identity are process-local capabilities bound to exact locked document values, transaction ownership and lifetime; no request flag, schema field or privilege is introduced.

A third targeted RED (backend-payment-origin-red.log) showed unchanged historical NULL payment method incorrectly blocking approval after changing lines while preserving the same actual net payment. The verified original-settlement capability now permits this exact unchanged original, without guessing its method. Changed unknown payment method/direction/amount is not given that exception.

Latest synthetic/protocol command adds tests/sales-native-retained-settlements.test.ts and tests/sales-native-facts.test.ts to the command above. Result: 163/163 PASS in backend-review-fix-05.log, zero skip/todo. Intermediate failures remain. The first two direct preparation test fixtures needed the same real receipt-actor binding now required for audit reads; no transaction gate was relaxed.

Earlier “pure-positive result after editing mixed” remaining item is now covered by targeted synthetic tests, not PostgreSQL acceptance. Independent review of this latest revision is pending. All previously stated PG/browser/typecheck/production limits remain.

04:06 UTC additional self-review: provenance reads now occur after both source and proposed-destination authorization in the command service. A targeted rejected-authorization test first observed one unwanted history read (backend-auth-order-red.log), then zero after the fix. Latest same targeted suite: 164/164 PASS, backend-review-fix-06.log. Independent reviewer has been asked to inspect this exact latest source; no claim of completed independent review yet.

04:08 UTC independent-review correction: lifetime-origin rewind now requires reaching native version 1. A truncated prefix beginning with a later UNAPPROVE is rejected, demonstrated RED in backend-origin-prefix-red.log and GREEN in backend-review-fix-07.log (165/165). The separate old unchanged-original-approval certifier retains its existing suffix semantics; it is not reused as proof of import origin. If an imported document starts above native version 1 without its complete history, the new origin exception fails closed and requires a real trusted origin solution, not a guessed version. Original existing suffix-certifier tests are unchanged.

04:08:48 UTC independent review received: reviewer reran the final expanded suite with exact Node24.21.0, 165/165 PASS. Reviewed strict-v1 prefix, exact-current sparse rewind, unchanged original payment-method capability and command authorization ordering; no remaining critical finding in that reviewed scope. This closes that independent source-review item only. PostgreSQL, browser, typecheck and full combined installation remain unverified. The >1 native starting-version limitation above is explicitly retained for local acceptance.

## 2026-11-04 local 11:56 audit follow-up (04:53 UTC)

Local production build reported TS2345 at the call to `unchangedProposalLine`: atomic SAVE lines can select a `spec`, while the helper parameter unnecessarily required `skuId`. The helper now accepts the common economic fields (`Omit<NativeSalesExistingProposal['lines'][number], 'skuId'>`). Both callers already resolve and compare SKU identity before using it. No cast, behavior change or weakened validator was added. Cloud typecheck/build was not run and the local compile fix remains to be confirmed there.

Executed `node --experimental-strip-types --test tests/native-sales-preparation.test.ts tests/native-sales-return-exchange-preparation.test.ts`: 42/42 passed; log `/workspace/shared/signed-sales-evidence/backend-proposal-type-regression.log`. `git diff --check` passed.

The three older unified-service failures were reviewed, not suppressed. Unknown-pricing SAVE rejection assertions need separation from the newer authorized incomplete-draft semantics, while wrong signed amount/allocation and missing snapshot checks must remain. A current unmodified run of `tests/unified-ordinary-document-service.test.ts` yielded 18 tests, 5 passed and 13 failed (`backend-local-inventory-current.log`): its history fixture starts at version 4 without a native version-1 audit prefix, and the new strict historical-origin reader fails closed. Do not fabricate that prefix, blanket-update expected errors, or claim the ordinary inventory suite passes. A trusted actual import-version anchor or correctly evidenced native fixture must be resolved before that acceptance can close.

## 2026-11-04 verified migration anchor successor (05:01 UTC)

The follow-up confirmed that a version-4 import is valid, not necessarily a stale fixture: migration 0027's `audit_version_by_action` explicitly permits `MIGRATE_DOCUMENT` with a positive initial version, and `assert_document_migration` binds that version to the sealed snapshot rather than forcing 1. The prior strict version-1 origin-only check is superseded by a second, equally strict termination condition: an independently verified complete immutable migration snapshot, followed by every subsequent runtime version. Arbitrary UNAPPROVE suffixes remain insufficient.

The original and published inventory anchor readers now expose their already-verified complete snapshot while keeping their original public inventory API and every guard/pin. The sales origin reader selects the same profile as the UOW: published runtime27 does not reintroduce legacy import-row joins. Financial amounts are defensively returned as SQL text before JSON parsing (the original snapshot contract already textifies them); decoding and complete rewind comparison preserve precision, unknown markers, separate rows, settlements, exact original discount and import version. A verified inventory anchor is reused within the same locked transaction, preserving one anchor read. Missing, malformed or mismatched anchors fail closed; SQL permission errors are not hidden.

Synthetic test adapters explicitly retain the original seeded import snapshot as a separate immutable fixture, not fabricated SAVE/APPROVE audit events. The three earlier unified-service assertions now distinguish authorized incomplete drafts from forbidden approval: invalid amount/allocation still reject, incomplete pricing may save but cannot approve, and new NULL product snapshots still reject without changing state. Their original failure logs remain preserved.

Targeted integrated command (259/259 before the additional exact-large-money case):
`node --experimental-strip-types --test tests/native-sales-preparation.test.ts tests/sales-business-rules.test.ts tests/sales-retained-approval*.test.ts tests/sales.test.ts tests/native-sales-return-exchange-preparation.test.ts tests/sales-native-retained-settlements.test.ts tests/sales-native-facts.test.ts tests/unified-ordinary-document-service.test.ts tests/sales-migration-origin-reader.test.ts tests/runtime27-ordinary-anchor-protocol.test.ts tests/ordinary-sales-detail-postgres-protocol.test.ts tests/sales-query-postgres-protocol.test.ts tests/sales-query.test.ts apps/api/src/sales-query-http.test.ts`

Evidence is in `/workspace/shared/signed-sales-evidence/backend-migration-origin-*`, plus `backend-local-inventory-current.log` and `backend-local-inventory-anchor.log` showing unresolved pre-fix states. No PostgreSQL, browser, production, build or typecheck was executed. Local acceptance must exercise both legitimate version-1 and version>1 imports, full changed/reopened lifecycle, and actual read-role access to the existing published migration/baseline controls. Function-body pin mismatch or missing permission remains a real blocker, not bypassed by the adapter.
