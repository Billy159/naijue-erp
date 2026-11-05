# Independent review: frozen customer/supplier maintenance backend

Review date: 2026-10-20 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Verdict

No blocking P1/P2 defect was found within the exact fourteen-file frozen backend slice identified below. The code respects the approved physical customer/supplier split and deliberately does not invent a new-code allocation policy. Seven additional focused synthetic/protocol probes passed. The original supplied evidence reports 33 focused checks and a successful scoped strict TypeScript check.

This is a bounded source/protocol review, not permission to deploy and not a claim that customer/supplier maintenance or the whole ERP is operationally complete. Production creation remains fail-closed until a business-approved allocation rule and explicit trusted customer/supplier providers are supplied. KH000001/GYS000001 are proposals only, not approved policy. Real PostgreSQL migration/trigger/isolation/race behavior, host route/auth/policy composition and deployed/browser acceptance remain unverified.

## Scope and integrity

The review began and ended with `sha256sum -c evidence/party-source-sha256.txt`; both checks matched all fourteen files. No repository source was edited. The checkout contains concurrent unrelated work and uncommitted slice additions; the review identifies source by the hashes, not by assuming HEAD includes the slice. Observed HEAD was `121eecc`.

Manifest SHA-256: `4779897eea87ffe70ef989d1e2cdad0e2cbb8e54f7923d3f0de5588dbbf990ff`.

Exact reviewed manifest contents:

```text
262f893b98c0ea651cd0f8c07263c448418fa8bafc9d3632844c4ef93dfeba36  adapters/postgres/migrations/0006_party_maintenance.sql
213495adf85eeab9716f0bb84add44f63f7d11068b1c22af6257a17f29ff4e73  adapters/postgres/src/party-maintenance-store.ts
e2ebbc2ed2ff3a326c7ef69173d77c7472d539ca605664eef5beb7660bc70c18  apps/api/src/party-authentication.ts
828ffb018810804aa946d3a02d7ad6cec7f6096e94df849a3ebf1f5cc7861fe1  apps/api/src/party-maintenance-http.test.ts
89bb71480f3159c357f7a3ba9b7501199813babfaf94fdc03af6b480d15904e5  apps/api/src/party-maintenance-http.ts
f46d513415211eefa8462f12cebfc05330b4ccbc7125ed6d7dac8f5ace72319c  docs/party-maintenance.md
1fbe42d67c6041fa4c379bd2b52e023e4b34e4d03b02e4d02ea5bb7fe0ef3d01  packages/application/src/party-maintenance-policy.ts
975806c362108caf2a70255190bace07edc316ac9557009b021efafa0a7de4f5  packages/application/src/party-maintenance-ports.ts
679615b42e67a9eaa3ea7faa4db035af5e62a09be2253dffcdf10bd2b6b449c3  packages/application/src/party-maintenance-service.ts
292f06b6d39a08c1b62754984d69190d57c307317f2b23de088eff765812e843  packages/application/src/party-maintenance-validation.ts
ae01ded728c74ecae48e94592b5b349ac3fefa8c75ce778a9a4584440fdfbe8e  tests/party-maintenance.test.ts
f3cdcab7afa521e48bb5fb90e2e2728d4dab5538acdd8faa54b2ec98ab0c632b  tests/party-postgres-protocol.test.ts
f4f850732494609c37fb285cba8915cf2087eb569ce28b7551122eb9e40b3864  tests/party-schema-contract.test.ts
b3c5113531b4e2d97467063cb7dab025891a8d6c69e5a94c88e56eb67e87207e  tests/support/party-synthetic-store.ts
```

## Reviewed contracts

### Physical identity and maintenance

- Migration 0001 already contains separate `customer` and `supplier` tables, each with native IDs and a separate exact-text `UNIQUE(code)`. 0006 does not create a merged table or add role/tag fields. Same code/name across tables remains legal; names are not an identity or merge key. A novel probe also verified two same-name customers remain separate records.
- Commands are the explicit closed CREATE/EDIT/DISABLE/RESTORE set. Creation accepts no code, ID or client actor fields. Existing command bodies accept no code change. Service spread-preservation, PG update/CAS predicates and 0006's identity trigger retain original code and nullable original creation timestamp. There is no DELETE endpoint, and the native trigger rejects row deletion.
- Compare-and-swap validates the expected version, requires exactly one native version advance and rejects storage overflow. PG writes use a locked native row and an old-version predicate; zero affected rows roll back before audit/receipt insertion. No-op rename and redundant disable/restore fail rather than produce spurious audit rows.
- Relevant code: service lines 20–67; validation lines 25–35; PG adapter lines 71–105; 0006 lines 64–88.

### Authenticated role policy and safe candidate scope

- HTTP registration requires explicit authentication and service dependencies. The session adapter resolves the current server principal rather than trusting role/account/hall fields from clients. It requires explicit HTTPS origin configuration and rejects bearer ambiguity, conflicting origin/fetch-site values, duplicate matching session cookies and malformed session tokens. Responses use no-store and allowlisted generic errors.
- The explicit source policy permits ADMIN and WAREHOUSE maintenance, list, detail and receipt access. SALESPERSON can read only business candidates. Candidate searches are enabled-only and return exactly ID/code/name, not versions, timestamps, audit material or unrestricted maintenance rows.
- The source report `demo-source-evidence/noncore-functions-source-report.txt` documents ordinary settings maintenance by administrator/warehouse roles and salesperson read-only product access (line 76), customers used in sales and suppliers in product business selectors (lines 50–53). Supplementary inspection of the available Demo `frontend/master-data.js` found matching role settings policy, enabled selector behavior and no hall restriction on parties. Hall-scoped sales access does not imply a customer/supplier ownership column or an invented party hall filter. The separate native schema has no such ownership field.
- New HTTP probe covered salesperson supplier candidates, disabled-supplier exclusion and denial of supplier list/detail/receipt. This supplements the provided customer-candidate checks; it does not grant access beyond these minimal business candidates.
- Relevant code: party-authentication lines 8–30; policy lines 8–12; service lines 69–89; HTTP lines 16–52.

### Global idempotency and current replay authorization

- Receipt keys are exact strings scoped globally to the authenticated account, not to party kind or hall/role. The same advisory-lock input `naijue:receipt:${JSON.stringify([account, requestKey])}` is used by party, sales and transfer adapters. Native `UNIQUE(actor_account_id, request_key)` remains intact.
- The fingerprint includes the party kind/action/body and stable account ID, not mutable role/hall. Different content or another target kind with the same account/key conflicts before target disclosure. Another authenticated account can use its own same textual key, and receipt reads remain account-bound.
- Exact replay returns the original committed result even when the current native row has a newer version/state; it does not allocate IDs/codes or invoke the clock again. Authorization occurs before receipt disclosure and again before returning the original result, with a retained target existence check. New PG-protocol probes exercised successful original-result decoding and denial at the second authorization point; denial rolled back with no result or writes.
- Relevant code: service lines 24–33 and 82–89; PG adapter lines 56–75 and 126–130. The current authentication/session read is per request, and the authorization provider is an explicit trusted host dependency. This review does not claim atomic account-revocation linearization across separate auth and business transactions.

### Sparse audit and shared native provenance

- Runtime audit stores old/new versions plus only changed name/enabled fields; initial creation naturally includes initial code/name/enabled/version. No unchanged timestamp/full-row snapshot or name-based merge is introduced.
- 0006 extends the closed shared receipt/audit union with generated native customer/supplier FKs and kind-specific action checks. It preserves existing same-kind reciprocal deferred FKs, global account/key uniqueness, immutable receipt/audit/ledger triggers and sales/transfer native references.
- Existing 0004 sales and transfer final-consistency triggers are already dispatched only for their corresponding kinds (0004 lines 382–387); 0006 does not replace or broaden those triggers. Its sales/transfer receipt-result branch retains the existing required facts, and the new party result branch is exact-keyed and rejects unknown/NULL-invalid shape through `IS TRUE`.
- New deferred native checks tie sparse changes, actor, action, native version and action timestamps to the corresponding receipt/audit. Party receipts must describe final native code/version/enabled state and have no inventory effect. Existing native row types/references are unchanged.
- Relevant code: service lines 10–12 and 59–65; 0006 lines 8–58 and 104–164. These are source-level observations, not engine-executed assertions.

### Enabled hall default-customer dependency and concurrency design

- Disable locks the actual customer row before querying enabled hall dependencies. Enabled hall references block disable, while disabled hall references do not; harmless rename is not blocked.
- The hall assignment/enable trigger takes `FOR SHARE` on that same customer and requires enabled=true. That conflicts with the disable path's `FOR UPDATE`, addressing both orderings of assignment/enable versus disable rather than relying only on a check-then-write query. The native customer update guard also rejects disable while an enabled hall references it.
- This design was reviewed in SQL and adapter protocol only. No claim is made that its PostgreSQL trigger snapshots, wait/recheck behavior, isolation, deadlock properties or race outcomes have been demonstrated. Those remain mandatory engine tests.
- Relevant code: PG adapter lines 71–75 and 100–105; 0006 lines 79–102.

### Query bounds and exact inputs

- Customer/supplier routes are independent closed mappings, never a user-selected SQL table. Query keys and command keys are exact. Canonical positive page integers, page sizes 20/50/100, a safe offset, a 200-character bounded search and exact enabled filter values are enforced. Duplicate query fields become invalid non-string values rather than being silently chosen.
- PG search is parameterized literal substring matching with separate native tables, deterministic name/ID ordering, one-statement total/page snapshot and valid totals even for an empty later page. Candidate totals/counts cover only enabled rows. POST input is bounded to 8192 bytes, with JSON media checks and no error detail echo.
- Relevant code: validation lines 6–17 and 37–50; PG adapter lines 107–119; HTTP lines 29–52.

## Mandatory allocator decision remains open

`PartyDependencies.codes` requires both `allocateCustomerCode` and `allocateSupplierCode`. Construction fails closed if either is absent, and no production allocator/prefix fallback is supplied. Allocated values are validated as nonempty exact codes; per-table unique constraints remain the final collision guard. Providers must reserve safely for concurrent creation, and must never rewrite old codes.

The available Demo fallback generated `V2-CP-` using max+1 over a merged parties collection; it does not resolve the approved physically split-table allocation scope. This review does not adopt that prefix/scope, KH/GYS, or any replacement policy. A host implementation and concurrency tests follow only after explicit business approval of the allocation rule. Test-only SYNTHETIC allocators are not production defaults.

## Verification evidence and exact limits

### Supplied frozen evidence, inspected rather than redundantly rerun

- `evidence/party-targeted-check.log`: 33 passed, 0 failed: 10 application, 8 HTTP/session, 9 injected PG-protocol and 6 SQL-text checks. SHA-256: `f39ae18685475e3851670c73a7a804b319aedb3b7bcc3c4c26e74be569add17c`.
- `evidence/party-typecheck.json`: scoped include set for party application, PG, HTTP, tests and fixtures. SHA-256: `950305f2012da18f6b89b081cf97f00c963d43240c93dcaa6778b71dd8b8b5d2`.
- `evidence/party-scoped-typecheck.log`: empty successful-output log; recorded exit code 0 in the verification JSON. SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `evidence/party-verification.json`: supplied scope/command/status record. SHA-256: `8c89f2bf2257f0f44e185c0d7ced5922f4e010e656c4834f00c2741f664acdc4`.
- `evidence/party-typecheck.log`: records whole-project exit 2 for unrelated `tests/integration/safety.ts:21` (`string | undefined` passed to URL). SHA-256: `be03d52bd569b07d32dc57edaddb37c189c1c20bce493ad4072c3af32b1e98ee`. I did not rerun the aggregate or claim this historical failure is still present after concurrent work.

### Independently executed novel probes

Command: `node /tmp/party-maintenance-review-probes.mjs`. The identical probe source is retained at `/workspace/shared/erp-rewrite-planning/party-maintenance-review-probes.mjs`; it imports the exact checkout modules and uses synthetic fixtures/injected drivers only. Node version: v24.19.0; installed TypeScript binary inspected as 5.9.2. No installation occurred.

Seven of seven passed:

1. Same-name customers remain two distinct identities without merge.
2. Same textual key is independent across accounts and each account sees only its own receipt.
3. Request-key case and Unicode/space name bytes remain exact.
4. Salesperson supplier candidates omit disabled rows/metadata; supplier maintenance/detail/receipt are denied.
5. PG-protocol replay returns original version/state after later native changes and calls no ID/clock/allocator provider.
6. Denial at replay's second authorization point rolls back without a result or writes.
7. A missing supplier allocator, even with a customer allocator supplied, fails at construction.

Probe source SHA-256: `a4a82e3b79794473cb7c7d020a8796c07b16a9280d572a87c4f47f4acb6f5517`.

Results: `/workspace/shared/erp-rewrite-planning/party-maintenance-focused-probes.log`; SHA-256: `4ff1b125bc7a11e5e045d14da032f296bfe008b900a8250b15cbc5a28a4f3a61`.

### Supplementary sources read for compatibility/policy

- `0001_runtime_sales.sql`: `7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf`.
- `0004_transfer_runtime.sql`: `a85dd812fdf561652433e6fc2da49024f95db1137e52b84170470ec5f937224d`.
- Authentication service: `668f9407d21c5e4e009cdc1c711b0c8e1593c5e91da25bd411da2d2113f7cfd9`.
- Available Demo `core16-strict-check-bUsiBu/project/frontend/master-data.js`: `e471ec73a420a6e03973b7e8194c975bd81cc1232578352ff039031835937d48`; supplementary local source, not claimed to be a newly verified remote baseline.
- Planning source report `demo-source-evidence/noncore-functions-source-report.txt`: `9b6fe406c0ba01e14621ab6d08d55dbdf17773841148f147c0c454f341f7176e`.
- Planning source report `demo-source-evidence/core-functions-source-report.txt`: `0b612324bc5d4191aed0d61a9586922d3162ea4575a48722684bd20c744a8aa9`; that report records the earlier frozen Demo revision `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3` and its source-only evidence limits.

## Remaining gates, not silently closed

1. Explicit business decision on new customer/supplier code allocation, then trusted provider implementation and concurrency/collision/rollback verification. No prefix was approved or implemented by this review.
2. Authorized disposable PostgreSQL test of exact 0006 source, including create/edit/disable/restore, deferred cross-kind/audit/receipt negatives, same-table code collisions, preserved historical nullable creation timestamps, hard-delete rejection, and both hall assignment/enable versus customer-disable race orderings. Also regress existing sales/transfer receipts and posting invariants after 0006. No real PostgreSQL was touched.
3. Explicit host composition of session authenticator, approved policy, pool/UoW, clock/ID and approved allocators; deploy-time origin/session behavior and frontend/candidate integration. No server was started and no operational accounts were created.
4. Aggregate type/build/test acceptance belongs to the final integrated snapshot. The scoped evidence is not an all-project pass. The separately prepared integration harness currently explicitly lists only migrations 0001–0005, so it must not be described as 0006 evidence or silently glob 0006 into its scope.

Not performed: PostgreSQL connection; migration execution; real constraint/trigger/race checks; server/listener start; account/credential creation or access; installation; local Mac access; commit; push; deployment; full suite or aggregate check. Only the named source files and compatibility/policy dependencies were read, seven new synthetic/protocol probes were executed, and this report/probe evidence was written outside the repository source tree.
