# Same-origin read-only HTTP adapters

`createInventoryHttpReader` implements `InventoryReader` and `createProductHttpReader`
implements `ProductReadOnlyReader`. Both require an injected `fetch`, the exact trusted
application `origin`, and an explicit `basePath` such as `''` or `'/api'`. Construction
is inert. Each reader call makes one JSON POST to its fixed route, without a retry,
prefetch, all-catalog read, data cache, or synthetic fallback.

Routes are the API plugin paths, relative to the deployment prefix:

- `/inventory/query`: `InventoryParameters`
- `/inventory/candidates/query`: `CandidateParameters`
- `/products/basics/query`: `{ productId }`
- `/products/specifications/query`: `{ productId }`
- `/products/images/query`: `{ productId }`
- `/products/image/query`: `{ productId, imageId }`

Only parameter DTO fields are projected into the body. `QueryRead.identity`, route
IDs and client roles are not credentials or authorization and are never transmitted.
The browser uses `credentials: 'same-origin'`, `mode: 'same-origin'`, `cache: 'no-store'`
and `redirect: 'error'`. The host must serve the application and these routes on the
configured same origin, and the backend must resolve and authorize the current server
session plus enforce trusted Origin/CSRF protections. These adapters cannot establish
an authenticated session or replace server authorization.

The caller's abort signal is combined with an internal deadline, forwarded to fetch,
and observed during body reading. Cancellation detaches even a fetch that ignores its
signal; a late response body is cancelled. The deadline covers fetch and body streaming
(default 30 seconds, configurable up to 120 seconds), with monotonic elapsed-budget
checks so immediately resolved stream chunks cannot starve deadline enforcement.
Checks also surround synchronous decode/parse/validation: these operations cannot be
preempted, but cannot publish a success after the deadline expires. JSON request bodies are limited
to 64 KiB. Decoded response streams have byte and chunk limits (default 8 MiB,
configurable up to 32 MiB, at most 65,536 chunks). Integer text has the backend's
100-character technical bound before BigInt validation. Error bodies have a 16 KiB ceiling.
Limits reject, never truncate or invent zero quantities. These are technical safety
bounds, not an acceptance of any production workload or a promise of SQL cancellation.

HTTP 200 responses require `application/json`, valid UTF-8/JSON, complete DTO shape,
and existing inventory/product semantic validators. Known stock cells use the domain's
signed-bigint boundary; aggregate integer totals may exceed it. A SKU has exactly one
product/color/fit/size coordinate across the page, and that coordinate has a consistent
SKU-or-absent identity across warehouses. Every matrix group uses the same ordered
warehouse identities and exactly the header's warehouse labels. Executed product/fit/
warehouse ID filters and bounded opaque read references are checked as response
consistency, not used as client authorization. Exact integer strings, full source
labels and exact negative/zero quantities remain unchanged. Published inventory has only known or not-applicable cells. Incomplete source coverage rejects the whole query; the client never fills holes or infers readiness. Unrecognized
response fields are rejected. Null product metadata and an actual empty image list
are valid facts, not transport failures; originals are read only by the explicit
single-image method.

`HttpQueryError` provides a safe `kind`, `code` and nullable HTTP `status`. Statuses
401, 403, 409, 503, and unsupported media/not-found responses remain distinct from
network failure, caller abort, deadline, size limit, and malformed success. Only a
known status-matching server code is retained from a complete error envelope; raw
messages, URLs, exceptions and causes are not exposed. `LatestQuery` remains responsible
for scope cleanup and superseded responses; adapters never publish or cache results.

## Composition boundary

No existing preview entry point is changed to use these readers. A real authenticated
host must explicitly construct the readers with its trusted origin/deployment prefix
and inject them into `InventoryPageView`/`ProductDrawerHost`, attach current session
identity to `ReadContext`, and clear that context on logout/session/permission changes.
The production server must register the matching plugins with real trusted providers.
The inventory snapshot reader/readiness persistence and controlled product media
storage/delivery remain separate required backend capabilities; a 503/501 is not a
successful empty inventory/image result.

Mocked-fetch verification, with no server or external network calls:

```sh
node --test apps/web/src/transport/*.test.ts
npm run typecheck
npm run typecheck:web
```
