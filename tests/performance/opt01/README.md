# OPT01 RED-first preparation — no production implementation

Exclusive scope for this phase is this directory. The earlier external preflight
audit remains unchanged. No root test registration, API/frontend/backend change,
build, listener, browser, DB connection, deploy or push is authorized here.

## Run explicitly

```bash
cd /workspace/scratch/1f717a486422/naijue-erp-dev-59c6ae50
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
export OPT01_SOURCE_ROOT=/workspace/scratch/1f717a486422/development-results-20261031/cumulative-C03-work/candidate
export OPT01_PROFILES_ROOT=/workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/http-profiles-v2
node --test --test-concurrency=1 tests/performance/opt01/invariants.green.mjs
node --test --test-concurrency=1 tests/performance/opt01/request-budget.red.mjs
```

The second command is **expected to exit 1** on the original implementation, only
at `OPT01_REQUEST_BUDGET`. Do not connect it to the root ERP regression gate or
weaken the assertion to turn it green. Missing exports, parse/import errors and
setup failures are not acceptable target RED evidence. These filenames avoid
automatic `*.test.mjs` discovery; they are explicitly passed to `node --test`.

This phase deliberately pins C03 commit `0905e799e69b0a486b0ae3366774c0c8fc3e7232`
and tree `a2735e895e7a5a233cf9c85baa2d41744c1e4e61`, not active WIP or C06. The helper
refuses a different commit/tree, dirty candidate, changed source pins, changed
v2 manifest or profile bytes. A future candidate-mode revision is itself reviewed
test work, not permission to relabel C06 as the original baseline.

## What executes

- Read the **existing six frozen files**, verify exact manifest/file/canonical
  profile and logical-data hashes, and use separate in-memory clones for named
  counterexamples. No profile file is modified or regenerated.
- Reuse OPT00 `routeProfile` through an injected fetch; original C03 strict HTTP
  decoders, raw-input converters, ExistingDocumentSession and ProposalSession run.
  The owner snapshot facade is minimal, not the entire editor or copied page.
- Golden expectations are derived from frozen original lines, actual SKU mapping
  and original raw inputs, independently of the observed proposal. Tests compare
  all native line IDs/order, 200 lines, quantities, saved reference/deal prices,
  input flags, current SKU relations, source snapshots and optional product groups.
  Hashes in diagnostics make the same golden reusable in the later before/after
  comparison. Full SAVE/approve/CAS behavior is not executed.
- GREEN tests establish current invariants and negative behavior. The baseline
  missing-product projection intentionally remains ready with no optional
  product.sizeGroupId; mandatory actual SKU failures reject the whole session.
  This synthetic projection **does not prove** the PRODUCT SQL import predicate.
- RED tests first prove the correct semantic proposal, then assert the new target:
  sales <=1, transfer <=2 after-detail DATA requests. Original observed offline
  protocol counts are expected to be 33 and 34. Transfer includes one original
  dictionary read required by the known frozen profile. This is not execution of
  React effects, actual HTTP, browser edit-ready timing or PostgreSQL.

True canonical edit-ready remains the UI owner's real copied renderer/DOM oracle,
with every saved quantity editable and full group axes. The first cold list action
can auto-enter DRAFT edit; it must not be mislabeled a cold Modify. Actual total
click-to-ready and after-last-owner-detail-to-ready are separate observations.
Neither offline ready nor these counts establish the >=50% timing target.

## Minimal stable coverage now

All six profiles; independent golden and 200-line/two-group retention; missing
product optional metadata; missing actual SKU; unfinished/invalid inputs; null
reference price versus exact zero/current price; scope-loss/late rejection;
owner-input replacement; unchanged legacy bare-array schema; unrelated corrupt
search collision error scope; independent dictionary deny; target groups after
101 unrelated groups; complete no-SKU axis; empty versus missing group; original
HTTP response/member/413 guards. No fake new decoder is supplied.

`pending-contract-cases.json` records additive versioned-envelope/target-batch
negative cases awaiting the real production seam. They are **NOT RUN**, not skipped
tests disguised as implementation coverage. The main controller will later assign
one exclusive full-stack owner; this document does not activate source ownership.

## Two important limits on equivalence

1. Old substring search decodes every item of each page, including unrelated
   collisions. A malformed unrelated product can fail the old read even though the
   target is healthy. Exact-ID batch should retain all original validation on
   **targeted admitted products**, but intentionally no longer reads unrelated
   collision records. Do not claim every old incidental error is equivalent.
2. Original dictionary limits remain: request body 8192 bytes, default decoded
   response 8 MiB (transport supports configuration, but this task never raises
   it), max 65536 stream chunks, 1000 members per group and complete member order.
   200 requested groups x 1000 members can exceed 8 MiB even with one-character
   labels. Failing too-large with existing feedback is legitimate; truncating
   members, increasing caps, assuming a single group or claiming full ready is not.
   Valid empty members are not missing metadata. PG overflow and browser feedback
   need later real-source tests; current guards are protocol/validator evidence.

Sources: `apps/web/src/transport/http-query.ts:36-37,89-109,139-141`;
`apps/api/src/dictionary-read-http.ts:38-54`;
`packages/application/src/dictionary-read-validation.ts:62-70`;
`adapters/postgres/src/dictionary-read-reader.ts:70-86`;
canonical `apps/web/demo-replica/frontend/runtime/documents/transfer-proposal-form.tsx:39-40,65`.

## Evidence and stopping line

External command logs, source/profile/test manifests and actual outcomes belong in
`development-results-20261031/performance-opt01/`. Keep expected target RED separate
from GREEN correctness and prior ERP regression results. No timing is invented.
Stop once this minimum RED/GREEN set is stable; await real baseline-ready, PG source
lock release and exact production ownership before implementation.
