# OPT01-A R2 FINAL STRING V2 checks (explicit AFTER binding)

The original six v1 files, their external frozen copies, 23 GREEN / 2 intentional
RED baseline receipts and the six frozen profiles/goldens remain unchanged. These
new phase-a files execute the selected AFTER source, not a relabeled C03 baseline.

```bash
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
export OPT01_SOURCE_ROOT=/workspace/scratch/1f717a486422/development-results-20261031/cumulative-C03-work/candidate
export OPT01_PROFILES_ROOT=/workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/http-profiles-v2
export OPT01_GOLDEN_ROOT=/workspace/scratch/1f717a486422/development-results-20261031/performance-opt01/golden-v1
export OPT01_PHASE_A_SOURCE_ROOT=/ABS/EXPLICIT_AFTER_SOURCE_ROOT
node --test --test-concurrency=1 tests/performance/opt01/phase-a-protocol.green.mjs tests/performance/opt01/phase-a-eligibility.green.mjs tests/performance/opt01/phase-a-initialization.green.mjs tests/performance/opt01/phase-a-capacity.green.mjs
```

The baseline helper intentionally loads and verifies original C03 as the golden
reference. Actual AFTER HTTP client, initializers, proposal/session scope, PG
protocol reader, API plugin and form authorization come from
`OPT01_PHASE_A_SOURCE_ROOT`; `phaseSourceBinding()` records all seven production
leaf byte hashes. A clean candidate can use the same frozen reference/data paths.
These tests are not registered in the root default gate.

## Additive protocol

`POST /current-form/saved-edit-sku-batch-v2/query` accepts the same strictly bounded
`{context,skuIds}` query. Its explicit wire `version:2` has exact-order `skus`
13-value tuples in this fixed order:
`[id,skuCode,productId,productCode,productName,colorId,colorName,fitId,fitName,sizeId,sizeName,sizeGroupId,barcodeAvailability]`.
All thirteen original values are transmitted; barcodeAvailability remains the
literal string `UNAVAILABLE`, never absent/inferred or mapped to numeric zero.
`products` has exactly one first-occurrence product outcome, either
`[productId,'ELIGIBLE',sizeGroupId]` or `[productId,'UNAVAILABLE']`.
The server's pure `encodeCurrentFormSavedEditSkuBatchWireV2(domain)` is exported
from the existing API leaf. PG and the decoded public client result keep the
original complete domain object revision `version:1`. Wire2 and domain1 are not
interchangeable. Diagnostic C08 wire1 was not a deployed compatibility interface;
there is no automatic retry/fallback. The old `/sku-batch/query` bare array and
its strict decoder remain unchanged.
Unsupported reader capability is 503, rejected new intent is denied, malformed
responses never fall back to per-code lookup. The selected source provider
explicitly admits the combined intent under its original current identity and
form/hall policy. The PG reader validates original SKU facts, then performs one
set-based PRODUCT-enabled/source-admission query and validates targeted native
price/category/name/group fields in the same RR READ ONLY snapshot. Current price
is never returned as a replacement for original saved line pricing.

Exact-ID lookup intentionally no longer decodes unrelated substring-collision
products. Target malformed facts still fail; old direct reads of malformed rows
keep their original decoder. UNAVAILABLE metadata leaves optional product group
absent, while actual missing/disabled/invalid SKU facts remain all-or-fail.

## Capacity correction and general byte proof

Diagnostic object-envelope wire1 has a confirmed old-reader-domain capacity
regression. Its immutable evidence and exact standalone generator remain in
external `sku-envelope-capacity-v1/`; do not overwrite or shrink that data. The
same generator is `sku-capacity-fixture.mjs`, writing a small receipt, not bodies.
It recreates exact legacy8,388,508-byte/hash and diagnostic wire1
8,388,667-byte/hash. FINAL STRING V2 with the identical source values is8,358,433
bytes and actually decodes all200 full domain rows under the unchanged8MiB guard.

For N requested SKUs, E eligible and U unavailable product outcomes,
1<=N<=200 and E+U<=N. Moving each SKU's same13 value tokens into a tuple saves
exactly151 bytes (13 fixed JSON keys + colons; all values/escaping are unchanged).
An eligible product tuple is90 bytes, unavailable54; enclosing punctuation gives:
`wire2Bytes - legacyArrayBytes = 34 - 151*N + 91*E + 55*U`.
Thus delta <= `34 - 60*N <= -26`, including N=1. No text-length assumption,
UTF8 width, truncation, compression or higher limit is needed. Positive tests
cover all13 fields, Unicode/escape value tokens, closed tuple arity/state/identity/
coverage/group validation, all1,373,500 N/P/E combinations and the original200-row
capacity witness. Negative rejection alone is not evidence of a working fix.

## Scope and truthful verdicts

- Fixed six profiles: independently verified old semantic golden, complete 200
  lines/two groups, sales independent old line IDs sharing one SKU, original raw
  input/prices/snapshots/lifecycle, and actual original dictionary reader calls.
- After owner detail: sales1 / transfer2 **for these fixed profiles**. Original
  dictionary authorization, complete members, pagination and renderer remain
  untouched. A separate >100-unrelated-group case explicitly has transfer3
  (metadata1 + dictionary2); the universal <=2 target remains unresolved.
- Mocked pool results verify SQL/protocol and errors, not actual source-admitted
  PG contents, production ordinary grants, query plans or transaction acceptance.
- Offline session ready is not canonical page-ready or a timing result. Actual
  PG AFTER belongs to its DB owner/new target; actual canonical UI and fixed-delay
  before/after evidence belong to the UI owner with explicit A4 binding.
- Byte/time/request/member limits, root configuration, SQL/ACL, layout/CSS and
  frozen OPT00/browser-host inputs are unchanged. The additional manual dictionary
  boundary case is explicitly not default/full-application acceptance.
