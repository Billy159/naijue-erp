# Explicit source-confirmed native read authorization

`adapters/postgres/src/source-confirmed-read-authorization.ts` exports `createSourceConfirmedPostgresReadAuthorization(pool)`. It provides the existing inventory, sales and product authorization ports without widening generic `ActorContext`, adding schema, changing commands, reading credentials, or replacing transfer's canonical source-confirmed read policy.

This is an **explicit policy choice**, not a permissive default. The API's separate `authorization: { mode: "source-confirmed-native" }` profile composes these three policies and the existing canonical transfer policy using the same API-owned bounded pool. The existing explicit-provider object remains available for a trusted host/test composition. The adapter itself accepts an existing trusted pool, never creates/disposes it, never authenticates a public caller, and never registers routes.

## Source authority and limits

The inspected handoff source root was `/workspace/scratch/f6bee04e937b/erp-handoff/source/naijue-erp-v0.0.1`. Its `SOURCE-README.md` identifies this as candidate 617 application source, not frozen Demo backend inspection or production acceptance. No private seed/input module was read for these policies.

- Primary current visibility contract: `handoff-references/单据按厅可见权限补充-20261003.md`, lines 7–11, SHA-256 `dddc9b1d2a4c06339c8f3b77ec746d67c5e17d07bb02613f7951bf7e3af13e08`. SALESPERSON sales visibility uses the authenticated current hall only; missing/other-hall sales are not visible. ADMIN/WAREHOUSE see all sales/transfers with valid login and existing object/action rules. The salesperson's pre-existing all-warehouse inventory read permission remains unchanged. Server scope applies before count/paging and to detail/history/direct ID paths; this is not a command grant.
- Current warehouse simplification: `handoff-references/仓库单厅归属简化裁决-20261017.md`, lines 3–8, SHA-256 `2203cd267bc4543f5f5d94644808124c5f8ff1946678e7caa38816e5e222e445`. A native warehouse has one hall; simplifying configuration preserves hall/creation-hall permissions and does not authorize guessing historical ownership.
- Product business-page read evidence: `/workspace/shared/erp-rewrite-planning/demo-source-evidence/noncore-functions-source-report.txt`, lines 59–65 and 76, SHA-256 `9b6fe406c0ba01e14621ab6d08d55dbdf17773841148f147c0c454f341f7176e`. The report records three roles, active/login lifecycle, salesperson's normal-hall requirement, and read-only product facts through business pages despite no maintenance-page access. It explicitly does not claim role permission runtime acceptance.
- Candidate 617 corroboration, not a substitute for the primary contract: `frontend/master-data.js`, lines 31–39 and 49–58, SHA-256 `e471ec73a420a6e03973b7e8194c975bd81cc1232578352ff039031835937d48`, separates maintenance access from inventory/product-view and retains all warehouse identities in the business actor context. `server/security/policies.ts`, lines 11, 14–15, 28–30 and 48, SHA-256 `942d556ba8bee7f9501d74b1966b3d28eda952a99e554776b6cdbabbaf4e7d30`, assigns product detail/media to inventory-read, excludes salesperson from maintenance rather than these reads, and uses current hall for salesperson sales.
- Candidate target/auth corroboration: `server/security/repository.ts`, lines 49–62 and 126–136, SHA-256 `0fd59ae8a8fb674e2bb05bf6fc8180725297e592e455ff1139655acd2a41ce59`, validates current active/login/role/hall state and exact product existence/media relation. `server/security/service.ts`, lines 210–212 and 258–259, SHA-256 `bfdd5f8c0b3c12f70dde66f331670aafa4d61c842dc4149abb6fab583b43d51a`, applies exact detail/media target selection. There is no product-hall ownership grant to infer.

The normalized implementation deliberately accepts only canonical `ADMIN`, `WAREHOUSE`, `SALESPERSON` roles and exact `在职`, consistent with `packages/authentication/src/source-policy.ts`. It does not import candidate role aliases or source account data.

## Current identity boundary

Before any grant, a parameterized `account_id` lookup reads exactly one account/staff row plus its current optional hall in a read-only REPEATABLE READ transaction. It selects only account/staff identity, role, employment, login-enabled and hall identity/enabled state. It does not select password/hash, session/token, login name, or credentials. `LIMIT 2` detects unexpected duplicate identity results.

Required facts are:

1. Exact native account ID equals the immutable authenticated actor account ID, and native staff ID is valid.
2. Canonical role, `employment_status = '在职'`, and `login_enabled = true`.
3. The current native hall matches the captured `actor.hallId` exactly, including null. A changed hall never becomes an expanded grant.
4. SALESPERSON requires a real enabled current hall. ADMIN/WAREHOUSE may have null hall; if non-null it must also resolve to the same enabled native hall, consistent with existing authentication.

Missing, malformed, disabled, unknown-role, stale and null-mismatched identities fail closed. Every invocation re-reads these facts. There is no global account cache, mutable role map or hidden channel carrying a role through `ActorContext`.

This lookup **supplements actual session authentication**; it is not an account-ID login or credential bypass. The existing cookie/session/auth-version/expiry/revocation service must run first. Policy and business readers use separate short snapshots; these policies do not claim linearizable revocation midway through an already-authorized request.

## Granted read scopes

- Inventory, all candidate kinds, and the existing ledger service use one finite set of **all native warehouses**, for all three approved roles. One additional warehouse/hall reference SELECT requests at most 1001 rows. Empty scope, more than 1000 warehouses, duplicate IDs, invalid hall relations or invalid labels fail the entire read; no truncation, implicit global scope, request labels, stock-presence query or synthetic “全部” warehouse is used.
- Disabled warehouse and warehouse-hall records remain historical-readable references, as in the existing native inventory/transfer readers. The identity's own required hall is still enabled. Read eligibility is not command/candidate-for-new-operation eligibility. Inventory publication/readiness remains the native reader's separate responsibility, never a permission source.
- Sales returns `{ kind: "all" }` only for current ADMIN/WAREHOUSE. SALESPERSON receives exactly `{ kind: "restricted", clauses: [{ hallId: currentHallId }] }`, with no creator/staff/request-selected hall extension. The existing services and native readers apply this scope before count/page/sum/reference/detail/history work.
- Products return only the exact parsed requested `productId`, for basics/specifications/images/image, for all three roles. The existing native product reader still proves target existence and exact image-to-product ownership; controlled media delivery remains separately required. No all-product preload, per-product authorization N+1 or stock query is introduced. This does not grant product maintenance.
- Transfer policy and command authorization are unchanged.

## Retrieval order is not frozen UI display-order acceptance

The minimal native warehouse table has no `display_order` or persisted phonetic key. This adapter retains exact native warehouse IDs, hall IDs and complete labels in deterministic `name COLLATE "C", id` retrieval order. It does not mutate labels or independently claim to implement the frozen warehouse picker order.

Candidate 617 `frontend/inventory-filters.jsx`, lines 133–145, SHA-256 `f8c6219d3c6908096f0e781e5596d8afdc98dedd6a15231f9f0f9f19cf4e150c`, has a separate presentation sort: 杭州多立方总仓/多立方总仓 first, then romanized name when ready, and a UI-only “全部” selection. Matching and independently accepting that exact UI order remains a presentation concern; this adapter does not silently replace that utility or manufacture a native entity for “全部”.

## Resource and failure behavior

The caller must supply finite acquisition/query/statement/lock/idle-transaction limits, such as the existing `BoundedPostgresPool`; raw structural compatibility alone is not evidence that an arbitrary caller pool is bounded. Construction is lazy. A successful sales/product grant needs one bounded identity SELECT; inventory needs that SELECT and one bounded warehouse set SELECT. All queries stay on one lease between read-only BEGIN and COMMIT/ROLLBACK, with no query/transaction retry.

Signals are checked before acquisition, before/after awaited queries and before returning scope. Abort during acquisition releases the late lease without BEGIN. Abort or failed work never returns a partial grant. Failed/uncertain BEGIN/COMMIT and failed rollback discard the lease; cleanup runs once. An acknowledged successful COMMIT is recorded before checking cancellation: an abort at that boundary withholds the grant but does not issue a fictitious ROLLBACK or discard the clean committed lease. Abort checks stop subsequent work, **not** an already-running driver query/acquisition; finite pool/server timeouts bound those separately.

## Verification

`tests/native-read-authorization-postgres-protocol.test.ts` is synthetic scripted protocol evidence only. It covers canonical roles/read intents; all-warehouse inventory vs own hall; exact salesperson sales scope; exact product target; active/login/current-hall/unknown-role failures; null-safe hall comparison; no secret columns or mutable role cache; empty/1000/1001/duplicate/invalid warehouse facts; captured inputs; abort/acquisition/rollback/COMMIT; finite data-query counts; and services awaiting authorization before business reads.

The tests do not parse SQL or prove actual PostgreSQL, session security, production configuration, frozen UI acceptance, performance, deployment or command completeness. No runtime database, credentials, network service, listener, migration, install, deployment or commit is performed by this slice. Real DB acceptance and independently authorized integration checks are separate evidence.
