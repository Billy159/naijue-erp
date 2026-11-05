# Independent customer / supplier maintenance

Source-faithful customer/supplier list and modal adaptation of frozen Demo
b8bcfe3, with real native clean HTTP/controller behavior. This is not a claim of
pixel, real-browser, live server/PG, deployed readiness or performance acceptance.
Exact source bytes became available after the nonvisual baseline. That earlier
baseline is historical, not the current verification result. See
SOURCE-ADAPTATION.md and verification/result.json for current evidence/boundaries.

## Source and business contract

Read before implementation: the frozen core/noncore source summaries, approved
frontend-loading-discussion sections4.6/5.3/6/8, and current real
`docs/party-maintenance.md`, ports, validators, service and HTTP plugin. Then read
actual frozen basic-settings-v2.jsx/.css, shared inventory-workbench Arco adapters,
unified-single-select.jsx and pager markup. Source-adaptation manifest records the
precise bytes; no old business data/runtime/global bridge is imported or executed.

- Customer and supplier have separate identities/controllers/lists/filters/forms/
  candidates and native endpoint families. No combined subject, tags, same-name
  merge, delete, invented contacts/addresses/classification or old data fixture.
- Actual Arco Input/Button/Table/Tag/Empty/Modal/Switch/Select and source-derived
  settings CSS replace the earlier guessed presentation. List order is name/code/
  state/edit; old tag column/filter/field is removed by approved split. Modal520px,
  name then readonly code, plus edit usage-state Switch,确定/取消.
- On explicit route activation, read only current kind's ENABLED first page20.
  Filter typing does not query. Bounded per-kind raw search/status drafts persist
  in the session workspace across route reentry, separately from applied results.
  Paging/refresh use only the immutable executed range, never an unapplied draft;
  Reset clears only the current kind's draft and reapplies defaults/page1.
  Sizes20/50/100, exact safe total, real numeric pager and out-of-range correction.
- New codes are assigned only on server CREATE, KH/GYS independently. The source
  readonly code field shows 保存后生成 before save. Existing original codes and
  nullable timestamps remain exact; no client reservation/prediction/reformat.
- CREATE exact body: action/requestKey/name, initially enabledtrue. EDIT exact
  body: action/requestKey/id/expectedVersion/name/enabled. Enabled is required,
  never implicitly defaulted or omitted. Name/state/both changes are ONE atomic
  CAS/transaction/key/receipt. A blocked default-customer disable changes neither.
  Unchanged pair is a no-op rejection. No misleading two-command modal save.
- Separate DISABLE/RESTORE native endpoints remain supported in the client and
  controller, but no extra row controls are invented beyond source's Edit action.
  Restore/disable in the actual edit modal is the same atomic EDIT with state.
- Source 操作记录 is explicitly unavailable because the real party backend has no
  authorized audit-list endpoint/DTO. No fake records or guessed URL is supplied.

## Commands, conflicts and uncertainty

One collision-resistant key is minted only for an explicit valid fresh submit.
The original exact command snapshot includes BOTH name and enabled. Duplicate
clicks are blocked. No automatic write retries or new-key recovery exist.

After dispatch, network/timeout/detach/malformed-success/5xx outcomes are treated
conservatively as uncertain. Inputs, target, original CAS and key stay locked.
Explicit recovery uses only real native GET receipt or POST exact replay. Receipt
404 does not prove rollback; replay rejection cannot prove original uncommitted.
Receipt/read/replay 403 cannot establish rollback either. While either kind has an
unresolved command, a 403 stays a local failure and preserves its original key,
target, CAS, name and enabled payload without expiring the host session or retrying
the write. A fresh definitively rejected command with no other unresolved work
retains the existing access-failure cleanup. Current 401 and trusted explicit
identity/session/permission invalidation still clear both stores and recovery.
Success is acknowledged only from a validated native result/receipt. This is the
original operation result, not a reconstructed current record or optimistic rename.
The source-style modal closes and refreshes only the last executed current list.

Definitive conflict preserves name AND state drafts. Current server detail is
read separately, with an explicit compare/reprepare action before a new CAS/key.
There is no forced overwrite, automatic merge or swallowed dependency protection.
The UI does not show internal UUIDs as business names or expose raw provider errors.

Read/write waits abort on invalidation; late ignored-signal replies cannot restore
facts. Account/session/permission changes clear both lists, editor facts, drafts
and pending command references before trusted host access handling. Route suspend
retains an uncertain original command in its workspace and never claims a server
transaction was cancelled. A real route leave clears a clean unchanged modal,
without clearing dirty/uncertain drafts or treating StrictMode probes as navigation.
Reused route IDs cannot retain prior React filter state.
Unapplied filter drafts, like editor drafts, clear on identity invalidation/disposal;
they do not block ordinary navigation or survive a new authenticated workspace.

## Reuse / host composition

- Inert index exports no React/CSS route. Lazy-import party-route.tsx only on
  authorized menu/deep-link activation, then mount CustomerPageHost or SupplierPageHost
  with a session-owned workspace. Form code is a click leaf; candidate options are
  another click leaf. Await stylesheet assets before exposing usable controls.
- createPartyWorkspace requires current ReadScope, explicit PartyClient,
  newRequestKey and onAccessFailure. Use crypto.randomUUID or equivalent unique
  production keys; TEST counters are only fixtures. Keep this two-entry bounded
  workspace across navigation so unresolved commands are not silently dropped.
  Consult canLeave before navigation/reload. Dispose/invalidate before a replacement
  principal. No localStorage/sessionStorage or durable draft persistence is added.
- Reuse current authentication lifecycle and ReadContext. Verified current ADMIN/
  WAREHOUSE is a maintenance-menu hint only. Server policy reauthorizes every
  command/read/receipt. No client actor/role is transmitted. The access-failure
  callback connects current redacted401, and403 only when no unresolved command
  would be discarded, to the host's trusted lifecycle. It is not called for a
  recoverable403 or a stale/aborted response.
- Global schema/runtime readiness belongs startup/deployment, not a fabricated
  allowedActions/readiness API. An empty successful list never proves readiness.
- PartyCandidateSelector opens only the exact independent enabled-only native page
  on explicit click/search/page. It clears/aborts child scope on close/invalidation.
  No hidden other-kind lookup, whole-catalog preload or global business-data store.
- Shared ReadScope/LatestQuery/AsyncLeafRegistry, DemoFrame semantic tokens and
  demo-presentation controls are reused. Incompatible product pager/candidate DTOs
  are not passed fake adapters. Actual settings Select/pager presentation is adapted
  from verified source, not inventory's100/200/500 product-page contract.
- HTTP reuses HttpQueryOptions and established same-origin/session safety patterns:
  cookie-only credentials, no-store, redirect:error, bounded strict JSON/timeouts/
  abort cleanup, redacted errors. Existing shared transport is read-only POST and
  cannot express these native GET/error/uncertain-write contracts; the local client
  is narrowly limited to the real five party operations, not POST-as-GET routing.

## Remaining production and recovery gaps

1. Frozen screenshots/runtime cascade and real-browser comparison are unavailable.
   Source-faithful Arco/CSS is not verified pixel or dropdown geometry parity.
   Arco2.66.16 emits React19 element.ref deprecation warnings in development; this
   observation is not hidden. Synthetic keyboard/DOM tests do not prove browser layout.
2. Real authenticated router/history/styles/navigation and reload guard composition
   must be verified. This slice edits only NEW parties/**; separate root work may
   integrate it, but its production evidence is not claimed here.
3. Real trusted same-origin party HTTP registration, session/policy/CSRF protection,
   approved allocator/runtime grants and PostgreSQL must be verified. No server,
   account, grant, schema migration, network, listener or database was used here.
4. Durable recovery after reload/identity invalidation is not supplied by the real
   API: it retrieves a KNOWN actor-owned key, not an unresolved-operation discovery
   list or persisted command. In-memory drafts intentionally clear on identity
   changes. Do not infer a result from current names/codes, treat404 as rollback,
   invent a recovery URL or silently generate a new key. A separately authorized
   durable recovery/storage contract is necessary for that scenario.
5. Receipt/result contains no current full record, original request name/hash or
   audit-list. Exact replay uses backend content-hash validation; fresh native detail
   is required for current facts. No local hash, fake audit or full snapshot is sent.
6. Root aggregate test/build discovery, live runtime permission/race tests, full
   accessibility, production capacity/performance and deployment remain separate.
   No root package/lock/backend/DB edits, install, commit, push or deploy in this slice.
   Root independently declared the already-installed exact Arco version.

## Verification

Run sequentially from repository root:

- node --test --test-concurrency=2 apps/web/src/parties/*.test.ts
- node apps/web/src/parties/tests/run-dom-tests.mjs
- node apps/web/src/parties/tests/run-build-check.mjs (includes actual Select prop AST regression)
- ./node_modules/.bin/tsc --noEmit -p apps/web/src/parties/tsconfig.json

All fixtures are synthetic. Actual Arco components are exercised, but CSS is
omitted in DOM tests and Select's native keyboard path is used because JSDOM has
no real layout/virtual-list geometry. Current source/reference manifests and logs
are in verification/. timing-observation.txt preserves initial brittle timing
failures and their deterministic clock/reader correction. Historical nonvisual
logs/manifests do not substitute for the final source-adapted atomic-EDIT results.
