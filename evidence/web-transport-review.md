# Independent web query transport review

Review date: 2026-10-20 (UTC)
Scope: seven files under `apps/web/src/transport`, against inventory/product API plugins, application DTO parsers/validators, frozen web DTO/model/LatestQuery code, and root test discovery.
Method: source review plus independent targeted mocked-fetch probes only. No source edits, installs, real requests, browser, server, PostgreSQL, desktop, push, or deploy. The implementation owner's final 24 focused tests / 57 combined tests and root/web strict typechecks were reported by the owner; this review did not duplicate their aggregate run.

## Final decision: pass the scoped transport slice, with integration caveats

At 17:01 UTC the seven files were re-frozen. All five initial findings below are resolved in the final reviewed source. Independent targeted probes now reject all four malformed inventory responses as `malformed-response/INVALID_RESPONSE`, enforce `timeout/QUERY_TIMEOUT` under continuous stream activity, cancel an acquired body if the budget expires before the body lock, and round-trip the actual backend-validated inventory fixture unchanged through mocked HTTP.

No open defect was found in the final seven-file transport slice. This is not production readiness or whole-repository sign-off: root test discovery still needs the parent integration change, and the pre-existing empty-size backend/frontend mismatch, authenticated host composition, real inventory readiness/provider, and controlled media delivery remain outside this slice.

### Final verification

- R1/R2: page-wide SKU-to-product/color/fit/size map and per-variant size-to-SKU-or-absence map now reject contradictory or reused SKU identities without treating unknown as zero or rejecting known-vs-unknown coverage differences for the same actual SKU.
- R3: known cells call domain `quantity`; aggregate totals remain exact and may exceed signed bigint. Owner regressions cover both signed boundaries and overflow directions.
- R4: rows now agree on page-wide ordered warehouse IDs and header labels/counts. Explicit executed product/fit/warehouse ID filters are checked without trusting client-provided display labels. Opaque read references receive the backend's header-safe 200-character bound.
- R5: monotonic elapsed-budget checks surround fetch acceptance, each stream iteration, byte merge, UTF-8 decoding, JSON parse, and DTO validation. Timers still detach stalled promises; sync work cannot be preempted but cannot publish late success. Acquired bodies are cancelled on expiry before body lock.
- Independent final malformed-response probes: 4/4 rejected correctly.
- Independent final real-clock microtask-starvation probe: timeout, not size-limit failure (about 12 ms including runtime overhead for a configured 1 ms budget in the final run).
- Independent final deterministic expiry-after-response-acceptance/before-body-lock probe: timeout, fetch count 1, body cancel count 1.
- Independent actual server-validated fixture compatibility probe: exact JSON-preserving round trip succeeded. This uses direct validators plus mocked fetch, not Fastify/server/network.
- Final SHA-256 manifest aggregate, computed as `sha256sum apps/web/src/transport/* | sha256sum`: `2bbee5f4d3838901df52274c9fc5ff0c22ea2baeaaa740eff2aaf5dd827c895d`.

## Initial findings (all resolved in final transport freeze)

The following records preserve the initial evidence and initial source line references. They no longer describe the final source.

### R1. Contradictory SKU identity across warehouse rows is accepted (P2)

`response-validation.ts:53-60` checks cell shape but does not ensure that one product/color/fit/size coordinate denotes the identical SKU, or absence, in every warehouse. Existing `assertInventoryPage` only checks the inverse mapping within each product. A valid two-warehouse, one-size matrix with exact totals still succeeds after changing the second row's SKU ID.

The backend `inventory-query-response.ts` enforces a per-variant coordinate map. Mirror this pure DTO invariant in the new transport layer; do not change the frozen web model or infer nonexistent SKUs.

### R2. A SKU can be reused across different products (P2)

`response-validation.ts:44-64` relies on a frontend semantic map whose scope resets for each product. A second distinct product containing the first product's SKU ID is accepted with otherwise correct row/product/full-page totals. The backend's page-wide `MatrixBudget.skuCoordinates` rejects this. Use a page-wide SKU-to-product/color/fit/size map.

### R3. A known cell outside signed-bigint storage range is accepted (P2)

`response-validation.ts:19,34` bounds integer text to 100 characters but does not enforce the known-cell signed-bigint range. The canonical exact cell value `9223372036854775808` is accepted when totals are adjusted consistently. Backend `exactInteger(value, true)` invokes domain `quantity`, which rejects that cell. Individual cells need signed-bigint validation; aggregate totals must remain arbitrary exact integers within the existing technical text bound and must not be incorrectly capped to signed bigint.

### R4. Warehouse headers and matrix facts may contradict each other (P2)

`response-validation.ts:43,56-59` validates labels individually but never relates the page-wide warehouse labels to row identities/order. A response declaring `warehouseLabels: ['Different Warehouse']` while every group has rows `Warehouse 6`, `Warehouse 7` succeeds. Backend response validation requires each group to contain the same authorized warehouse identities, labels, and order, and headers to match. The client cannot validate server authorization but can reject internally inconsistent matrix/header data and identities outside explicitly requested warehouses.

### R5. Timer starvation can overrun a configured streaming deadline (P2)

`http-query.ts:144` only sets a timer; the streaming loop checks `signal.aborted` but not elapsed time. Continuously resolved `reader.read()` microtasks starve the timer. A zero-byte stream with `timeoutMs: 1` reached 65,538 source pulls and failed `too-large` after 619-745 ms, not `timeout`. Byte/chunk bounds still prevent an unlimited read, but this does not meet the advertised streaming deadline. Keep the abort timer for stalled promises and add monotonic elapsed-budget checks around awaits/stream iterations, decode, and validation. Synchronous JavaScript cannot be preempted, so do not promise hard preemption of JSON parse/validation.

Independent reproduction: `/tmp/web-query-transport-review-probes.mjs`. It uses injected mocked fetch only. Initial output: four malformed DTOs ACCEPTED, deadline rejected as `too-large/RESPONSE_TOO_LARGE` rather than `timeout/QUERY_TIMEOUT`.

## Verified positive behavior on initial freeze

- Both factories are inert. Each of six explicit methods performs one POST, without retry, eager tab/original loading, all-catalog query, cache, fixture branch, or synthetic success.
- Exact API paths match: `/inventory/query`, `/inventory/candidates/query`, `/products/basics/query`, `/products/specifications/query`, `/products/images/query`, `/products/image/query`.
- Bodies match backend strict parsers: full inventory filter selections/page/pageSize; candidate kind/search/page/pageSize/selectedIds/categoryId; `{ productId }`; and `{ productId, imageId }` for one original. Projection excludes QueryRead identity, route/entity metadata, client roles, and extra selection fields.
- Explicit canonical HTTP(S) origin and explicit restricted basePath are required. Absolute/protocol-relative paths, query/fragment, escapes, dot segments, backslash, encoded separators, and whitespace cannot alter the request destination. Paths are fixed in the reader methods.
- Every request uses same-origin mode/credentials, no-store, JSON accept/content-type, and redirect:error. Observable redirect/changed URL responses fail closed. There is no data-dependent outbound URL or diagnostic transmission from these adapters.
- Response body bytes, chunk count, request bytes, error-body bytes, and timeout configuration have finite technical bounds. Stream readers are cancelled/released on failure. Limits reject, never truncate/fabricate facts. Cancellation detaches non-cooperative fetch/body promises and consumes late rejection; late response bodies are cancelled.
- HTTP 401/403/409/503, unavailable media (501), image-not-found (404), request/media failures, size, network, malformed success, caller abort, and timeout have distinct safe kind/code/status representation. Only allowlisted status-matching server codes survive complete error envelopes. Server messages, exception causes, raw URLs, and arbitrary codes do not survive.
- Success requires HTTP 200, JSON MIME, strict UTF-8/JSON, exact required/allowed object fields, typed nested DTOs, and existing semantic validators. Page/count/targets, canonical exact integer syntax, totals, explicit unknown/not-applicable, duplicate product/variant/warehouse IDs within the existing model, product specification membership/SKU coordinates, and image schemes are checked. The initial confirmed gaps above were repaired and independently re-probed before final sign-off.
- Genuine null product metadata and empty image lists remain valid. No failure is converted to empty inventory/images or zero stock. LatestQuery still owns old-success retention, supersession, and context cleanup; adapters do not publish or cache results.

## Cross-layer caveats, not evidence of a production integration

1. Root `package.json` initial `test` glob does not include `apps/web/src/transport/*.test.ts`. The parent has acknowledged and owns integrating discovery. Targeted owner tests are not evidence that root `npm test` currently discovers them.
2. No production web entry point imports/constructs these factories. Existing preview entry points remain synthetic. A genuine host must explicitly inject readers into InventoryPageView/ProductDrawerHost and clear authenticated ReadContext on logout/session/permission changes.
3. API plugins are inert factories requiring current trusted authentication/Origin-CSRF protections and authorization/read providers. No production plugin/provider composition, authenticated host, real service request, or SQL cancellation has been verified.
4. Inventory coverage/readiness persistence and a real trusted snapshot reader remain required. A 503 remains unavailable, not empty success. Controlled product storage/thumbnail/original delivery remains a separate required media implementation; a 501 remains unavailable.
5. The existing product-model URL policy accepts arbitrary HTTPS image hosts, blobs and allowed raster data URLs. The transport itself does not fetch image bytes or leak identity. The backend controlled-media provider validates its configured HTTPS delivery origin and opaque links; therefore this review does not certify a client-side media-origin allowlist or actual media readiness. One mocked arbitrary HTTPS image-host probe was accepted, as expected under that existing policy.
6. Additional confirmed pre-existing backend/frontend mismatch: backend checkedInventorySnapshot accepts an inventory product with `sizes: []`, `cells: {}`, `sizeTotals: {}`, and exact zero totals, but frozen frontend assertInventoryPage rejects missing verified size columns. Tested using the backend synthetic fixture and both validators directly, with no server/network. Prefer making the backend fail closed rather than weakening/inventing frontend facts. This is outside the seven-file transport remediation and should be reconciled before real inventory integration.

## Exact initial reviewed source hashes (SHA-256)

- `README.md`: `f8f5ac43ab71907233a04f666e81ec52a261875dc0a6ad0f571fe660a193336b`
- `http-query.ts`: `8fd6f365560a87ca33f5d1a8ba1ec6d7e3e7e394c07854d1681fe6d9c5f97370`
- `http-readers.test.ts`: `442ee84c2d0c9bf3f9bb9ee48b908386325df46bd4abe64aee090d34bc7751bd`
- `index.ts`: `9a0d42be36146d910ac28844583dfec3982d12ffe32d8ac4806209fa21c1eac3`
- `inventory-http-reader.ts`: `ea95174283db99ea6bbd6563cc16e3b3f5539f811dc01aa8ad83a29261939fe8`
- `product-http-reader.ts`: `cb172dcc3e3b8e4b0a52cd3c710e089022e4e0442086a8117b6d92434c90f3bc`
- `response-validation.ts`: `7d97dab30871410807bd2af2174be0d3fd086e4180029db1a3d9d7f68a0fc52e`


## Exact final reviewed source hashes (SHA-256)

- `README.md`: `211de71bdb686ba208eb6ff461699cedbfe19fbedca19fe42e86116f01ae80c3`
- `http-query.ts`: `39332b02e0512aa85a1cae14ad940ea6629aaa07794ff32825fff689cb08fd2d`
- `http-readers.test.ts`: `8467bf1de073816b98e8335e24b73aacfeb757ea10e7794370ceed3799a7f6b2`
- `index.ts`: `9a0d42be36146d910ac28844583dfec3982d12ffe32d8ac4806209fa21c1eac3`
- `inventory-http-reader.ts`: `ea95174283db99ea6bbd6563cc16e3b3f5539f811dc01aa8ad83a29261939fe8`
- `product-http-reader.ts`: `cb172dcc3e3b8e4b0a52cd3c710e089022e4e0442086a8117b6d92434c90f3bc`
- `response-validation.ts`: `c9c6c9514d1c3df25fc6c3a69697cee73fadef31d8372083f47b1f64ed881b93`

The final manifest was independently recomputed twice and matched the owner's freeze. Review source reads did not modify any repository source file.
