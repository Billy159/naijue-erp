# Inventory zero / ready-only contract review

## Outcome
- Published stock cells are known exact integer quantities or nonexistent-SKU not-applicable. There is no per-cell unknown success state.
- Published totals are complete with zero unknown cells. Both runtime boundaries reject incomplete totals and missing cells, without filling server holes.
- Trusted reader snapshots can return only ready. A runtime incomplete envelope rejects the whole inventory/candidate query with INVENTORY_NOT_READY, mapped to HTTP 503, before any partial payload is sent. Invalid/missing readiness, unknown cells, corrupt totals and failed reads reject the whole query as errors.
- Ready is the trusted reader assertion for the entire authorized filtered dataset, not a client inference from a page. The actual PG reader and production import proof remain unimplemented.
- In complete finite SERVER-side test sources, the catalog and full sparse stock source are explicitly modeled. A legal SKU absent from that complete stock source yields exact zero; an absent SKU yields not-applicable. Unproven/incomplete source cases remain rejection regressions, not converted fixtures.
- Exact negatives, signed-bigint cell bounds, arbitrarily exact aggregate integers, source size/FIT identities, full-filter totals, paging, scope cancellation and prior-result retention remain covered.

## Verification
- Bounded focused application/API/model/transport batch: 85 tests passed.
- Focused strict TypeScript imported graph after literal typing fix: passed. Reusable evidence/inventory-zero-contract-tsconfig.json is equivalent to the temporary checked configuration.
- Full jsdom inventory/drawer script: passed, including new incomplete-source whole-query failure and no unknown DOM assertions. Repeated-row product actions are now targeted by exact product identity in tests.
- git diff --check on the 14 owned source leaves: passed.
- Root typecheck was attempted. It exposed current parties UI Arco/pagination errors plus transport test literal widening; the latter is fixed and passed focused strict typecheck. The root must rerun its final aggregate after other owners finish.

## Review boundaries
The manifest freezes 14 owned leaves and records an immutable copy under /tmp for independent review. Matrix behavior cleanup was handed to the frozen-Demo presentation owner; do not attribute their later matrix/CSS/layout changes to this semantic slice. No storage/schema decision, real PG query, install, listener, network, migration execution, commit or push was performed. jsdom does not prove real-browser appearance, screenshots, frozen-Demo parity, network behavior or workload performance.
