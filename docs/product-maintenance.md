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
main or most common barcode. This frozen drawer DTO v1 is unchanged. The separately
approved C01 maintenance detail below reads the actual nullable product selection.

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

## C01-approved editable product API v1

`product-maintenance-ports.ts` defines the new editing contract separately from the
old drawer DTO. Use `createProductMaintenanceHttpPlugin` with the current trusted
authenticator and `createProductMaintenanceService` dependencies. D1's
`PostgresMaintenanceCommandUnitOfWork` supplies the sole transaction/client and
evidence implementation to `PostgresProductMaintenanceUnitOfWork`; D2 never writes
generic receipt/audit SQL or runs migrations. Production registration and engine
verification are still separate tasks.

| Route | Exact input | Result |
| --- | --- | --- |
| POST `/products/maintenance/detail/query` | `{productId}` | `ProductMaintenanceDetail` with actual root/SKU versions, raw IDs, full editable values and real reference names/category path |
| POST `/products/maintenance/candidates/query` | `{kind,search,page,pageSize}` | exact count plus one page of native candidates; pageSize 20/50/100 |
| POST `/products/commands` | CREATE/EDIT/status command union below | strict `{operationId,kind:"PRODUCT",targetId,version}` after known commit |
| GET `/products/receipts/:requestKey` | no query/body | currently authorized original actor/key receipt |

Candidate kinds: categories, suppliers, seasons, size-groups, colors, fits,
barcode-schemes, years, thicknesses, collar-pants-types. IDs are actual native UUIDs
except the last three scalar options, which are actual distinct stored values.
No default year, default scheme, extra dictionary rows or labels-to-ID matching is
invented. Inactive selected supplier/reference names are retained in detail; new
choices use enabled/nondeleted rows where the native model has those states.

CREATE is `{action:"CREATE",requestKey,values,skus,barcodes}`. EDIT also requires
`id,expectedVersion`. The values object requires exactly productCode, name,
categoryId, supplierId, seasonId, sizeGroupId, year, systemItemCode, thickness,
collarPantsType, defaultBarcodeSchemeId, enabled, prices. Prices require all nine
existing snake_case price keys. NULL and zero remain distinct. New products require
the frozen Demo's explicit code/supplier/year/season/system code/default scheme and
at least one actual SKU; original unknown nullable values are not guessed on edit.
Existing product code is read-only, matching the frozen Demo.

SKU inputs are `{id,expectedVersion,skuCode,colorId,fitId,sizeId,enabled}`. A genuine
new SKU has explicit id:null and expectedVersion:null; the server assigns its UUID
and current created_operation_id. Existing coordinate/code identities cannot change.
Barcode inputs are `{id,barcode,colorId,fitId,sizeId,kind,schemeId,enabled}`. New rows
use id:null; existing raw binding/provenance cannot be changed. Missing child rows
are retained, not deleted/recreated. Explicit legacy SKU inputs do not imply a Cartesian matrix. Changes
to a product default scheme never regenerate or rebind existing barcodes.

Approved v17 adds optional `skuSelection: {colorIds: UUID[], fitIds: UUID[]}` only
to the original V2 CREATE/EDIT command (also with `imageChanges`). Keep `skus` and
`barcodes` present; a selection-only save uses `skus: []`, without client-created
SKU codes. IDs must be unique; sets are canonically sorted for the original key.
The server locks the actual group and enabled selected color/fit references,
reads all real group sizes, and creates only missing color × fit × size tuples.
New SKU IDs use the original server allocator and codes `NJNEW-<UUID32>`; no
barcode or inventory record is generated. Existing IDs, codes and disabled state
remain unchanged; shrinking/empty selections never delete or disable old SKUs.
An EDIT with this intent cannot change the persisted product size group.
Explicit new SKU inputs cannot overlap generated targets. More than 5000 final
SKUs fails instead of truncating. The existing permission/CAS/original-key and
single product/SKU/audit/receipt transaction rules apply. Exact replay returns the
original result without re-reading members or allocating IDs. Unsupported older
transaction providers return `PRODUCT_SPEC_GENERATION_NOT_READY` (503); real
reference/group conflicts remain 409 and invalid input 400. This source contract
does not claim actual PostgreSQL, consumer or deployment acceptance.

DISABLE, RESTORE and DELETE require exactly action, requestKey, id, expectedVersion.
DELETE retains the product identity/deleted_at and is unavailable without D3's
trusted complete per-warehouse/SKU zero and retained-reference guard. Unknown or
negative stock cannot be zero. Image attachment writes are not included in this
core save command yet; they must not be silently discarded or reported successful.

Current authorization is checked inside the D1 transaction for DETAIL/CANDIDATES
and every command/receipt. Read intents are not persisted operation actions. The
root CAS, actual child changes, sparse snake_case audit and receipt share one
transaction. Request replay preserves the same actor/key/hash and result; revoked
permissions are rechecked. A failure after COMMIT attempt is recovered via the
original key, without a new key or misleading rollback.
