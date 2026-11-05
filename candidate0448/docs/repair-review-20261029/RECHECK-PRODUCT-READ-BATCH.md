# Original-105 product readonly batch

Fixed candidate source 4bebacd0 was actually exercised on dot via `recheck-products-read-browser.py`, with each original caseId recorded separately. Controlled readonly response variants use real closed DTOs (explicit null fields, zero/decimal prices, NOT_SET default scheme, an existing valid synthetic PNG, explicit image/stock read failures). No business writes/media network or authentication changes.

Initial headed evidence: `recovery/recheck-products-20261029/read-first`.
- P08: fields and six-tab return identity, explicit null fields shown as unavailable: candidate listed steps PASS.
- P09: six actual size groups and current color/fit identity: PARTIAL pending frozen comparison. Both source implementations use three unpaginated specification sections; do not fabricate a pager to satisfy an erroneous matrix step.
- P10: AVAILABLE scheme detail and NOT_SET disabled button with no scheme query: candidate listed steps PASS.
- P11: real RED: nine values/order/null/zero correct, but readonly page falsely promised Excel paste.
- P12: real RED: explicit original-image failure/retry/open/Esc works, but no-image readonly page lacked clear empty labels and inherited upload/save wording.
- P13: first runner assertion mistakenly expected filter.products string IDs, while actual contract carries `{id,label}` selections. Corrected to assert exact real IDs. Actual stock failure/retry and product context succeeded. Full return behavior still to verify separately.
- P19: six current/history scheme details and close/Esc, unknown applicability retained: candidate listed steps PASS.

Minimal P11/P12 fix: readonly price caption explicitly readonly; ProductPhotos upload/save guidance only when edit capability exists, readonly empty roles/colors say no image. No layout/CSS change, and editor upload instructions retained. Native existing product-model tests 5/5 and typecheck exit 0; fixed build headed retest pending at this checkpoint.

Frozen Demo pairing uses only derived immutable b8 build and closed synthetic reads. First runner used nonexistent data-pc=edit selector; second reached a missing synthetic /runtime/stock reader (501). These are preserved harness failures, not production failures. Add only exact known synthetic stock rows to its harness, without changing frozen frontend or creating zero coverage. Pairing remains pending until actual output records success.

No whole-105 or whole-page acceptance claim follows from these candidate subresults. Original 105 mapping is independent at `recheck-evidence-map-1752/EVIDENCE-MAP-105.json`.

## Final candidate and frozen results
Fixed d9a318243deef6d46282fcfcde050717fd853efe: `read-third/result.json`, native exit 0, no page errors. P08/P10/P11/P12/P19 exact listed steps pass; P12 includes both Escape and close button after an explicit read failure. P09/P13 remain partial with scope explained in the ledger. `read-second` functional assertions passed but runner exit predicate incorrectly required literal PASS; corrected the runner, preserved exit 1, reran to independent read-third output.

Frozen b8 `frozen-products-recheck-1803/result.json`: six tabs and all six scheme dialogs actually opened, exit 0, no page/console errors. Both implementations have unpaginated specification sections; no pager is fabricated. Inventory return restores the previous successful inventory query, not a nonexistent return-product action. Candidate exact filter/page/pageSize restoration passed; unsubmitted filters, scroll and folding are not claimed. The original Demo also advertised paste on readonly price; removing the false promise is an explicitly recorded truthfulness fix, not a claim that Demo differed.

Counts are separate: five original-case listed-step completions, two partial; not five whole-page acceptances. Original 105 baseline has 30 partial mappings, and no complete-all-states acceptance.
