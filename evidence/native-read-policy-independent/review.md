# Independent native read-policy review

Status: no remaining blocking findings for the reviewed source freeze. This is source review plus synthetic scripted-protocol/Fastify.inject evidence, not actual PostgreSQL or release acceptance. The review lane changed no application source, tests, schema, or host configuration and made no commit.

## Frozen outcome and checks

- Independent adversarial probes: 15/15 passed (`probes.log`, replayable `probes.mjs`).
- Targeted native authorizer/API/transfer-authenticator/bounded-pool regressions: 64/64 passed (`focused-regressions.log`).
- Final combined recheck: 79/79 passed (`final-combined-probes.log`). No skipped/cancelled tests. Selected runtime, tests and probe sources were hash-stable before/after this run (`source-tested-freeze.sha256`).
- The later documentation-only citation correction was independently verified to consist of exactly the three declared text changes; its original content reconstructs to the prior hash. `doc-only-delta.json` records this check. Runtime/tests were unchanged and were not needlessly rerun. The final 31-file selected manifest is `source.sha256`, SHA-256 `918192697ba97d3046d7ca9a1407e169f98af33ec3c949a96af8a571b4edafe2`; all final hashes verify in `final-hash-check.log`.
- All eight source-authority hashes cited by the owner documentation were independently verified (`authority.sha256`, `authority-hash-check.log`).
- Owner logs record successful whole-repository strict noEmit checks (`../native-read-authorization-typecheck.log`, `../native-policy-profile-typecheck.log`). The independent lane did not run the shared compiler or a root aggregate.

Final primary files:

- Adapter: `3800ffd48bcd5f9eee0df41662533430464c1da5ad033c1a291c48056aa15caf`.
- Adapter tests: `47c18fc489d0f72626bf33a017ba6ddc481f4dcdfac8d6e4af5695e6c5dee9d8`.
- Adapter docs: `7a2fe58732f4fe12a39693a8e1624cdd6b4894a7c578ff87438ae32c400d29cb`.
- API factory: `02694b4e9ae55726c3d82fc8a71704c9d979f3e591f0d4512171037c416f3455`.
- API tests: `1f069791d9320e50c61baf81a0114d27b04a413f1fdfaaabf0aeb7fb08c10111`.
- API docs: `2a3608be9de69cb2edb28aadcaaaa77f9a77d9461b80b382dd8a30622f0571be`.

## Contract and adversarial findings

1. Fresh parameterized read-only account/staff/hall lookup selects no password, login name, session, token or auth-version columns. Canonical role, exact active employment/login, native staff/account identity and enabled/null-safe current hall are validated on every invocation. Missing, malformed, unknown, disabled and changed facts fail closed before a business reader; no account cache or role-bearing ActorContext extension exists.
2. SALESPERSON sales grants have exactly one current-hall clause, never creator/request-selected hall extensions. ADMIN/WAREHOUSE have all-sales scope. The actual composed sales SQL applies this scope before a foreign-hall filter/count/page. Native authorization supplements, not replaces, current cookie/session authentication; snapshots do not promise linearizable revocation.
3. All three roles retain all native warehouse IDs/halls/full labels, including disabled historical warehouse/hall references. The scope query neither prunes enabled-only references nor scans products, balances, ledgers, imports or stock presence. The 1001-row sentinel rejects overflow beyond the existing 1000 bound; empty, duplicate and unknown hall facts never produce a partial/invented grant. Native C-order retrieval is not frozen UI display-order acceptance.
4. Shared product read evidence supports exact-target read-only facts through business pages for canonical authenticated roles. Product existence/image ownership remain native-reader checks; there is no product-hall ownership, maintenance permission, command grant or invented media-delivery implementation.
5. The native API selector is exactly the sole own `mode: "source-confirmed-native"` choice. Unknown/mixed/extra keys, undefined overrides, symbols/non-enumerable keys, inherited modes and prototype-carried overrides fail before driver allocation. Ordinary and null-prototype sole selectors work. Selection is captured host configuration, never request JSON or headers. Existing explicit providers remain a tested trusted-host seam, not legacy data compatibility.
6. One lazy API-owned bounded pool serves authentication, native policies and readers. The existing canonical transfer FROM/TO/immutable salesperson-creator-hall union is unchanged; no second pool, command routes, listener, environment discovery or fallback is introduced. Shutdown/disposal remains bounded and failures remain truthful.
7. Cancellation stops later callback work, not active pg operations. Query, begin, commit, rollback and release failures are never retried. Failed/uncertain COMMIT discards and attempts rollback; failed rollback preserves both failures. Release failure does not return a successful grant or retry cleanup.

## Corrected during review

- The API test driver's generic account-query handler initially shadowed the new native identity marker. The wire owner corrected dispatch; integrated native identity denial/cancellation tests now exercise their intended branch.
- Root raised, and independent probes confirmed, that cancellation after a successfully acknowledged read-only COMMIT issued a misleading ROLLBACK and discarded an otherwise clean lease. The adapter owner added explicit committed state. Final independent and owner probes verify all policy families withhold canceled grants after acknowledgment without rollback or discard, while actual COMMIT rejection remains quarantined with no retry. The pre-fix failure is retained in `pre-fix-probes.log`.

## Acceptance limits

No actual PostgreSQL connection or SQL execution, credentials lookup, network service, listener, install, migration, account seeding, deployment or production mutation occurred in this lane. Synthetic driver events do not prove browser/network or pg-wire cancellation. No real-PG acceptance claim follows from these results. Future engine/transport acceptance remains the separate designated runtime-owner checkpoint against the reviewed freeze.
