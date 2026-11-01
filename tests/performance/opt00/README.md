# OPT00 preparation — not an optimization or performance verdict

## Source, tools and ownership

- Delivery baseline: `59c6ae509fa17caddf58b8ea05d4abdaff16e227`.
- Recovered exact C03: `0905e799e69b0a486b0ae3366774c0c8fc3e7232`, tree
  `a2735e895e7a5a233cf9c85baa2d41744c1e4e61`. It has the same source tree as
  pre-reset `bef9e7e9009cb4479481542d83e6eff42814df2b`; old test receipts were NOT
  reused. Fresh candidate is read-only under `cumulative-C03-work/candidate`.
- Node **24.21.0**, npm **11.9.0**, `toolchain/use-exact-node.sh`.
- `opt00_preparation` owns this directory except `browser-host/**`, which belongs
  exclusively to `ui_local_launch`. No root scripts, package configuration, index,
  business implementation or candidate build output is modified.
- `AGENTS.md` read; its macOS global/takeover and `.agents/skills` files are not
  present in this executor. Current controller ownership applies. No production,
  deployment, GitHub push, real data, original frozen Demo or backup mutation.

## Truthful status and scopes

The **fresh** offline contracts validate generated DTOs against original browser
response validators/current-form decoder and run the actual saved-document session
initializers to `ready`. This is **not** browser performance, a real HTTP sample,
PG integration, successful SAVE/approve or full application acceptance.

The synthetic HTTP profile enables real-browser collection independently of PG.
Its declared server delay is artificial per-request delay, **not database latency
or measured network RTT**. Original `createApplication`, renderer, read clients,
editor/session and lazy styles remain the UI host's source of behavior.

The PG helper is deliberately **execution-disabled**, with empty source-owned
query/target allowlists, no driver import and no connection. Future execution needs
reviewed actual page/stock/history SQL, fixture-only bindings, NEW owned target,
finite component role, source/schema/content/reset receipts, literal local direct
identity + cluster birth proof, `BEGIN ... REPEATABLE READ READ ONLY`, fixed statement
and lock timeouts and rollback/stop evidence. EXPLAIN ANALYZE **executes SQL**;
SELECT lexing, a supplied allowlist or localhost alone is not authorization.
The stopped source-schema rehearsal is not a shared perf DB or full runtime/ACL
issuer. Preserve raw plans/loops/buffers; node buffers are inclusive, not summable
across parent/child nodes. Missing observations remain null, not zero.

## Reproducible data and profiles

`fixture-generator.mjs` creates `opt00.synthetic.v2`, fixed synthetic clock,
600 products / 4,800 SKUs / 260 **logical** document descriptors, imported/new SKU
source specifications, 100/200/500 inventory cases and separate unknown/confirmed
zero/missing/read-failed variants. It explicitly says `databaseSeeded:false`.
Logical publication specifications are not actual admission or checkpoint proof.
The historical/list/inventory catalogue still requires reviewed real adapter data;
only the saved-draft HTTP profiles below are currently wired and decoder-tested.

`http-profile.mjs` creates six immutable, serializable read-only DTO profiles:

| kind | shape | distinct products | unique SKU lines |
| --- | --- | ---: | ---: |
| sales / transfer | few | 3 | 12 |
| sales / transfer | distinct30 | 30 | 120 |
| sales / transfer | lines200 | 30 | 200 |

Original saved names/reference prices/deal prices differ from the current catalogue.
Sales have exact integer-string economics, discounts and gifts. Sales list quantity
excludes gifts, while `allLineQuantity` preserves document/inventory quantities.
Transfers do not invent sales money, gift or negative-return semantics. Both keep
actual SKU/product/size-group relations and original snapshots; no duplicate SKU
lines or 200-line truncation.

A 50-product code substring collision forces actual saved product 0 onto page 3.
The original initializer's **offline expected** request count is therefore 33 for
30 products (1 SKU batch + 32 product pages), or 6 for 3 products. This is an oracle,
**not an observed browser measurement**. Do not assert 31 or remove collisions to
make timing look better. Actual requests must be collected independently.

Stable exports: `createHttpProfile(kind,shape)`, `routeProfile(profile,endpoint,body)`
returns `{status,body}`, `profileDigest(profile)`, `serializeProfile(profile)` and
`writeHttpProfiles(freshAbsoluteDirectory)`. No function starts a listener or DB.
All SAVE/approve/prepare/receipt endpoints refuse explicitly; no success simulation.

The logical canonical JSON SHA, exact file SHA, profile canonical payload SHA and
profile file SHA are separate. Link them in each raw receipt. The profile manifest
pins source/tree/data/toolchain and says actual browser pending / DB not used.
Data or economics changes require a new reviewed version, never silent overwrite.

## Actual contracts, not guessed routes

The restored source was read directly; `git diff exact59` for both current-form
HTTP reader and existing-document preparation is empty.

- `POST /current-form/sku-batch/query`, body **only** `{context,skuIds}`.
  SALES context `{kind:'SALES',hallId}`; TRANSFER `{kind:'TRANSFER'}`.
  1..200 unique native IDs, no actor/grant/warehouse extras.
- Response is a **naked array** of equal length, exact requested-ID order.
  Strict fields: `id,skuCode,productId,productCode,productName,colorId,colorName,
  fitId,fitName,sizeId,sizeName,sizeGroupId,barcodeAvailability:'UNAVAILABLE'`.
  Do not add fake enabled/source fields to wire DTOs.
- Product DTO uses `retailPrice` in **yuan decimal text**, minimum price availability
  `UNAVAILABLE`, actual `sizeGroupId`; saved line prices/amounts use **minor-unit
  integer text**. Never convert quantities or money through floating point.
- Product search has real page size 20 / decimal-string `exactTotal`, complete pages
  and exact product-ID matching. Substring code matches are not saved identities.
- Decoder lives inline in `current-form/http-reader.ts`. The original PG adapter
  keeps identity/role/login/employment/hall checks, authorization, SKU/product/
  color/fit enabled state and actual size membership; product reads also preserve
  unpublished-source exclusion. Wire DTO availability is not proof of DB policy.
- Full size dictionaries use `{id,name,sizes:[{id,name,displayOrder}]}`;
  transfer detail catalog instead uses `sizeGroups` / `members` with `sizeId` and
  `code`. These projections cannot be mixed. Fits use the original settings schema.
- The application only supplies the saved-edit reader when
  `commands.existingPreparation` is configured. `manualCreate:true` alone does not
  enable it. Use original `createSalesExistingPreparationHttpClient` /
  `createTransferExistingPreparationHttpClient`; pure ready collection never calls
  their `/sales/prepare-existing` or `/transfers/prepare-existing` write-adjacent flow.

## Samples, reset, evidence and execution order

`scenario-spec.mjs` is a **planning catalogue, not a new acceptance gate**:
37 performance descriptions + 7 correctness-only descriptions. The 111 pending
cold/repeat slots do not require every counterexample to be benchmarked. Prioritize
30-product sales/transfer edits, product wide/narrow and broad/late numbered document
lists for independent OPT01–03 delivery. Unknown/revision/cancel/invalid cases remain
correctness checks, not three extra performance runs each.

For each selected page retain **cold-1, repeat-1, repeat-2** raw; never P95,
best-of-three, omitted cold sample, fabricated zero, higher timeout, lower page cap,
smaller data, weaker assertion or hidden error. Record:

1. Actual C03 source closure/build SHA, logical/profile/content/schema SHA, account/
   role/scope SHA, Node/npm, OS/CPU/memory/load, actual browser version/UA (mark
   reduced UA or unknown patch honestly), viewport/DPR and fixed delay profile.
2. Intended cold mode: new context + HTTP cache disabled. If only a fresh tab and
   no-store responses are supported, label **first-open/no-store, process/memory
   cache uncontrolled**, not a verified fresh cold process. No DB/OS cache flush.
3. Before and after each sample verify profile content using `profileDigest` and
   write a `VERIFIED_UNCHANGED` receipt. Hash at sample boundaries, **not every timed
   request** (that would add fixture hashing cost). The read-only profile never
   mutates; write endpoints reject. Real DB restores belong to its owning adapter
   and only a NEW reviewed synthetic target; never truncate/drop an unknown target.
4. Separate correctness clones for SAVE/approve/CAS/idempotency/transaction/cancel.
   Do not commit actions into the timed read baseline. Prepared input comparisons
   are not successful save/approval acceptance.
5. Actual HTTP Host must be the literal owned loopback endpoint; Origin absent or
   exact loopback only, other origins denied. Retain original auth/transport guards.
   UI owner runs the native reachable server; executor/native network namespaces
   can differ. Never switch targets or production because a local connection fails.
6. Count initialization requests **after detail-ready through actual edit-ready**,
   with statuses/errors/abort events, not only successes. No premature ready before
   product/size-group admission. Detail latency and initialization latency separate.
7. Raw request events + actual-ready observation + inputs/original snapshots + reset
   and environment receipts need immutable relative artifact paths and SHA256. No
   cookies, authorization headers, passwords, tokens or real request parameters.
8. Bundle collector reads finished `production-build.json` and verifies input/output
   byte hashes against exact C03. Test-host/preview bundles are not production
   OPT04 baseline. Standardized per-file gzip is not actual wire encoding; include
   actual initial JS/CSS/inline/lazy closure and first-heavy-click waiting separately.
9. Inventory OPT05 needs actual layout/main-thread, measurement-node and synchronous
   read counts at 200/500, first-layout/settings separately; DOM-only or FPS is not
   sufficient. Preserve wrapping/images/geometry/scroll/fixed columns/keyboard.

`evidence.mjs` refuses invalid or unbound raw records, fake pending zeros and mixed
scope/data/network/cache comparisons. It cannot authenticate a manually invented
artifact: owners must retain actual observations. Correctness verdicts and timing/
optimization acceptance stay separate. Actual browser/PG baseline is pending until
those owners collect it. No OPT01 implementation is authorized by this directory.

See `commands.md`. Reusable source lives here; generated large JSON/build/raw data
belongs only to external `development-results-20261031/performance-opt00`.

## v2 correction and preserved v1 evidence

Before any actual browser baseline, independent review found a missing-dynamic-
resource closure check and self-review found logical history descriptors 7/8
misclassified as runtime. Two red cases reproduced both defects (18 pass / 2 fail),
then narrow helper/fixture fixes were made without production changes. v1 generated
JSON, manifest, original 19-test log and exact old helper source bytes are retained
externally. v1 catalogue is NOT a valid historical/native seed. v2 has new data/
profile hashes; all six saved-draft native HTTP payloads must compare byte-identical
canonically against v1 before use. No actual timing from v1 is reused.

The production artifact collector additionally rejects dirty tracked source before/
after collection and compares every non-dependency input with the pinned Git blob,
not merely live bytes plus a self-consistent manifest. A tiny private Git fixture
checks ordinary dirty input, assume-unchanged hidden drift, untracked source and
false input hashes. node_modules inputs are explicitly dependency-byte observations,
not committed source; locked fresh-ci provenance is separately required.
