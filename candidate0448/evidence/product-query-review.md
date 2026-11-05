# Product query read slice: independent security review

Reviewed 2026-10-20. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Verification first

- Focused service, PostgreSQL-protocol, migration-source and HTTP-injection tests: **30/30 passed on latest disk** after the persisted image-ID validation correction and wrong-target/abort-after-media regression additions. Independent log: `/tmp/product-query-security-focused-20261020.log`. The initial run also passed 29/29.
- Synthetic deferred-query probe: confirmed an abort while SELECT is unresolved does not settle the operation or release the client; after SELECT resolves, the operation rejects with `PRODUCT_READ_ABORTED`, rolls back and releases.
- Repository typecheck initially failed on concurrent implicit-any errors in `apps/web/src/authentication/http-client.ts`, outside the reviewed slice. The independent latest-disk rerun also failed on lines 137/141/144/145; the owner's final-check log records the same `TYPECHECK_EXIT=2`. Do not describe aggregate typecheck as green unless a later rerun passes.
- No PostgreSQL service, SQL parser, real database, migration, listener, production authentication/policy, media delivery, install, network action or commit was performed. The protocol tests are scripted clients, and the HTTP tests are Fastify injection without a listener. Source/schema tests are explicitly labeled as non-execution evidence.

## Result

**No blocking authorization, SQL-injection, target-scope or raw-media-disclosure defect found in this explicitly injectable read slice.** This is not a production-integration or deployed-security sign-off. One medium-priority availability hardening item remains below.

### P2: Abort does not interrupt an in-flight SQL operation, and the reader establishes no finite execution deadline

Source: `adapters/postgres/src/product-query-reader.ts:58-75`, especially pool acquisition at line 60, query wrapper at line 61 and rollback at line 68. The signal is checked before/after operations, but is neither passed to a supported cancellation mechanism nor paired with a locally enforced SQL/acquisition deadline. A pool acquisition or SELECT that never resolves can leave a disconnected request pending and its transaction/client occupied indefinitely unless the supplied pool/server independently provides timeouts. Rollback itself is also unbounded. The owner has now explicitly documented this host timeout requirement in the class comment at lines 47-48, which accurately scopes the implementation.

Evidence: the independent deferred-query probe held SELECT pending, aborted the request signal, and verified the returned promise remained pending and the client unreleased. It resolved SELECT only for test cleanup, then verified rollback and release. The existing `tests/product-query-postgres-protocol.test.ts:110-115` checks abort between resolved scripted query steps, not actual PostgreSQL query cancellation.

Action: before deployment, establish and verify finite connection/query/transaction-cleanup deadlines in the host configuration or adapter; if active cancellation is implemented, discard uncertain/broken clients safely. Add a deferred/unresolved-query regression and a real PostgreSQL cancellation/timeout integration check when authorized. Do not claim prompt in-flight SQL cancellation from the present signal tests.

## Reviewed safeguards

- Authentication executes on each HTTP request before service access (`apps/api/src/product-query-http.ts:24-35`). Service authorization is mandatory, separately invoked for each intent, and a mismatched target grant fails before reader/media calls (`packages/application/src/product-query-service.ts:24-38`). There is no default actor, role-based client grant, authorization fallback or product enumeration route.
- Matching POST Origin compatibility with the existing session callback is covered at `apps/api/src/product-query-http.test.ts:89-102`. Missing/cross-site Origin is rejected before session lookup, and session revocation is re-resolved per request. The plugin requires a trusted callback rather than implementing its own permissive cookie path.
- Inputs accept exact canonical lowercase UUID-shaped target objects only, reject actor/role/scope/URL extras, reject query-string parameters, require JSON and enforce an 8 KiB request body bound. Error output is allowlisted/redacted and responses are no-store.
- PostgreSQL reads bind product/image/group IDs and numerical bounds as parameters. Product lookups are primary-key-targeted; multirow group/SKU/image reads request maximum plus one and fail on overflow, rather than silently truncating. Specification reads use three set queries, not N+1/full-catalog loading or a generated Cartesian matrix (`adapters/postgres/src/product-query-reader.ts:75-153`).
- Specifications retain actual SKU relation identities and all four coordinates `(product, color, fit, size)`, reject duplicate coordinates and outside-group sizes, use stored full names, and preserve `size_group_member.display_order` with deterministic identity ties (`:98-128`).
- Nullable persisted year/system code/season/supplier values remain null. Missing product remains JSON null; missing explicit image is a safe 404. Required category and size-group joins agree with the existing NOT NULL/FK schema rather than fabricating values.
- Image metadata never becomes an HTTP DTO. Only ID/product-name label and controlled delivery URL are projected. Raw `file_ref`, bytes, public paths and original URLs are absent from list responses. Required media availability is explicit: null yields 501 when nonempty image delivery is requested, with no invented URL/storage implementation.
- The trusted media contract requires opaque HTTPS delivery on an explicit origin, current authorization again when bytes are delivered, derived thumbnails, and no original-byte fetch during thumbnail resolution. Link checks reject wrong image, wrong variant, wrong origin, embedded credentials and direct file-reference echoes. This contract cannot itself prove that an unimplemented real provider enforces those requirements.
- List reads resolve one thumbnail batch; only explicit image reads call `resolveOriginal`. The SQL adapter reads metadata only, never original bytes.
- Each snapshot uses repeatable-read/read-only BEGIN, commits successful reads including missing targets, rolls back failure/abort, releases exactly once, and discards clients with uncertain BEGIN/COMMIT or failed rollback outcomes. These finite-result cleanup paths have scripted protocol coverage.
- Migration 0005 is additive and retains unknown historical fields as NULL, adds MIME/8 MiB image metadata restrictions and an ordered product-image index, and contains no fabricated historical timestamps/backfill, global size uniqueness, minimum-price guess or SKU-price parallel column. It remains unexecuted.

## Deployment limits

The code defines an adapter/service/plugin slice, not a complete production composition. A real product policy, configured pool with availability limits, actual controlled thumbnail/original delivery with access rechecks, approved migration execution, and integration tests against those providers remain separately required. Passing synthetic tests must not be described as proof those external systems are implemented or secure.
