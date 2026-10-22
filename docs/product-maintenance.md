# Product detail reads on existing schema1–19

The existing `createProductQueryHttpPlugin` owns basics, specifications, images and
original-image metadata reads. `createProductDetailsQueryHttpPlugin` adds:

| POST path | Exact JSON input | Result |
| --- | --- | --- |
| `/products/prices/query` | `{productId}` | `{productId,version,prices}` or null; all nine product-level prices are exact yuan strings or preserved NULL |
| `/products/barcodes/query` | `{productId,page,pageSize}` | `{productId,version,page,pageSize,total,items,defaultScheme}` or null |
| `/products/stock/query` | `{productId,page,pageSize}` | D3-controlled `{productId,page,pageSize,total,items}` or null; explicit 503 if no reader is configured |

Page is a positive safe integer; pageSize is 20, 50 or 100. Unknown/extra keys and
query strings are rejected. Every POST uses the existing trusted session callback
with the host's Origin checks, application/json, no-store and an 8192-byte limit.
There is no built-in role or permissive provider fallback. D1 must inject a current
`ProductDetailsQueryAuthorization` granting the exact tab/product; a basics or
transaction-candidate grant alone does not grant nine-price access.

Construct `PostgresProductDetailsQueryReader` on the host's shared bounded pool.
It reads only existing product/SKU/raw-barcode columns in target-only consistent
read-only snapshots. Barcode count and one page share a snapshot. Disabled/raw
historical bindings remain visible as facts; raw strings (including leading zeros
and spaces), canonical SKU coordinates and each binding's nullable scheme ID are
preserved. Scheme names may be resolved through separately authorized dictionary
reads. No all-catalog fetch, inferred default scheme or stock query occurs here.

Until the proposed product-level default-scheme field is approved and implemented,
barcode results include `defaultScheme:{state:"UNAVAILABLE",reason:"NO_PRODUCT_SCHEME_FIELD"}`.
This is neither a stored NULL assignment nor a selection inferred from the first,
main or most common barcode. Proposed image roles, soft deletion, new maintenance
receipt types and all product write commands remain unimplemented pending C01.

`stockReader` is mandatory configuration and may explicitly be null. D3's reader
must independently apply current warehouse/inventory authority, product/SKU
membership and trusted publication/new-creation admission. The product tab grant
does not grant warehouse access. D2 only validates and returns the safe page fields;
it never writes balances, invents rows or converts unknown/missing/read failures
to zero. Known signed quantities remain exact strings, including negative values;
unknown, missing, unmapped and read-failed states require quantity:null.

These leaf plugins create no listener, pool, accounts or schema and are not yet
production-host registration. The original media plugin still requires a genuine
controlled-media provider; images do not become deliverable by registering these
new read routes. D1 owns final host composition and D3 owns stock SQL/admission.
