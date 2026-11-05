# Historical mixed-document split: receiving gaps

Checked 2026-11-04. Synthetic source-level evidence only. No real-data cleaning,
PostgreSQL, browser, typecheck, merge, commit, push or deployment in this slice.

## User requirement

Split a historical mixed sales/return document only when original evidence
establishes the return and amounts. Preserve original-document traceability and
reconcile the split. Do not infer returns from negative signs, invent discount
allocation or settlement attribution, or replay historical inventory.

## Verified existing behavior

- `StandardRecord.source_refs` and identity references require pinned source file
  SHA-256, sheet and row locators. Multiple distinct standard documents may point
  to the same original locator.
- Explicitly supplied SALE and RETURN documents are validated individually for
  line amount, quantity, discount and RECEIVE-minus-REFUND totals. Known SALE
  discounts use the existing allocation rule; RETURN discount must be zero.
- Synthetic SALE gross 20, discount 4, due 16 and RETURN gross/due -4 with an
  explicit refund 4 are accepted as two ordinary historical documents. All 16
  original receipt rows and the separate refund survive. Validation mutates
  neither source references nor the inventory baseline.
- Historical signed SALE with zero discount remains a supported separate case.
  This requirement does not authorize splitting every negative quantity.

## Two demonstrated gaps (still open)

1. **One-to-many count reconciliation.** The current RECONCILIATION contract
   requires `source_rows = retained_rows + rejected_rows`, retained rows equal
   standard rows, and rejected rows zero. One original mixed header becoming two
   standard headers cannot use honest original counts under that contract.
   The positive receiving fixture counts two declared output headers; it does
   **not** establish reconciliation of one actual original header. Do not repair
   this by relabelling original counts as output counts.
2. **Original-group conservation proof.** Shared source references locate
   evidence but do not carry an independently checked original group total or
   original-line/settlement attribution. A synthetic mutation from SALE discount
   4 to 3, with its receipt total changed from 16 to 17, still passes when each
   output document balances. Thus current receiving validation cannot detect
   an incorrect split-group total merely from those references.

Source anchors: `packages/application/src/unified-import-contract.ts` report
validation and sales relation validation; `tools/unified-import/stream-relations.mjs`
per-document checks; `tools/unified-import/whole-package-reconcile.mjs` compares
package totals with imported/current DB proof, and explicitly does not verify
original source truth. The latter is not a replacement for group conservation.

## Required successor work, not implemented here

- Preserve the existing V1 contract/hash. Define an explicit versioned receiving
  representation for one original document to its cleaned output document IDs,
  original header/line/settlement evidence and each output attribution.
- Distinguish original counts, transformed output counts, and rejected/unresolved
  source items. Every original line and payment/refund must be accounted for
  exactly once, or have an explicitly evidenced allocation with exact totals.
- Check signed quantities and amounts, gross/discount/net and RECEIVE/REFUND
  conservation across the group using exact decimal/integer arithmetic. Reject
  missing or conflicting source facts rather than assigning proportional shares.
- Carry the same checked relationship through streaming preflight, immutable
  import proof and post-import reconciliation. Bind proof to exact identities
  and package bytes, not an unverified `verified: true` flag or free-text note.
- Test duplicated/omitted rows, reused settlement evidence, cross-group IDs,
  penny differences, negative/zero/unknown facts, replay and rollback. Database
  tests must confirm cutoff-history split imports do not apply inventory twice.

No new public fields, tables, permissions or installer changes are introduced by
this investigation. The required successor must be coordinated with the public
contract and SQL owners before implementation.

## Reproduce

Use Node 24.21.0 from the repository root:

    node --test tests/historical-mixed-split-intake.test.ts tests/historical-signed-sale-intake.test.ts

Actual result: 10/10 synthetic tests passed, including seven new cases. Two
explicit characterization tests retain the above limitations. They must change
with the successor implementation, not be cited as successful end-to-end split
acceptance. No source business values are included.

## Addendum — standalone successor implemented 2026-11-04

`mixed-split-evidence.mjs` now implements an isolated V1 declaration-conservation
checker with separate original/output counts, exact row and payment attribution,
closed source references and group totals. See [the contract and limitations](MIXED-SPLIT-EVIDENCE-V1.md).
It rejects the inaccurate balanced-output mutation demonstrated above. This
closes a pure validation building block, not either production integration gap:
the original receiving contract and SQL/CLI entrypoints remain unchanged, and
success explicitly says import admission, DB proof and source truth are false.
