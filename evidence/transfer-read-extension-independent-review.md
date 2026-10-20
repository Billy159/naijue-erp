# Transfer read extension: independent frozen-source review

Result: PASS. No blocking defect found in the reviewed application, PostgreSQL reader, unregistered HTTP plugin, scoped tests, or contract documentation.

## Frozen source and reproduction

- Reviewed source manifest: `evidence/transfer-read-extension-independent-source.sha256` (10 entries).
- Manifest SHA-256: `231eb2c007e20dbb3f2e204df0f6044705982449d45d71f63dda7bd54dca0625`.
- All entries verified both immediately before and after the final test run.
- Final command: `node --test tests/transfer-query.test.ts tests/transfer-query-postgres-protocol.test.ts apps/api/src/transfer-query-http.test.ts evidence/transfer-read-extension-independent-probes.test.ts`.
- Final result: 76/76 passed, comprising 48 owner read-contract tests plus 28 independent probes. Output: `evidence/transfer-read-extension-independent-final-tests.log`.
- Independent probe source: `evidence/transfer-read-extension-independent-probes.test.ts`. This is excluded from the production/scoped compiler configuration. No compiler was run by this reviewer; the owner separately reports its scoped compiler passed.

## Reviewed guarantees

- Required arrays-only statuses/fromWarehouseIds/toWarehouseIds, nullable scalar dates/number, duplicate/unknown/legacy-scalar rejection, immutable parsed copies, and bounded canonical ID arrays. Empty arrays restrict nothing and grant nothing.
- Scope is a union of complete nonempty intersection clauses. The same native header/warehouse/hall/account/staff parent relations govern count/page/detail and restricted warehouse endpoints. Creation hall/role remain header facts, not current creator staff facts.
- All-scope warehouse lookup may return unused native rows. Restricted lookup uses a fully authorized document EXISTS and candidate endpoint intersection. Selected IDs narrow that relation and never supply permission. Count/page use the same relation. Disabled native flags are preserved.
- Required updatedAt and exact current-line totalQuantity. One page-wide unnest/LEFT JOIN/SUM covers only returned IDs, preserves zero-line documents, supports aggregate values above signed-bigint/JS-safe-integer ranges, and rejects missing/duplicate/foreign/inexact aggregates rather than guessing zero. Empty pages skip the aggregate. No N+1, category substitution, or catalog hydration occurs in list reads.
- Ordering is updated_at DESC, number COLLATE "C" ASC, id ASC. The documented binary-C versus frozen browser default-locale tie-break difference is retained explicitly.
- Document-number matching uses bound `strpos(lower(h.number), lower($q::text)) > 0`. Both operands are lowercased; wildcard punctuation is literal and the needle is never SQL text. Existing PostgreSQL locale/Unicode differences from JavaScript lowercasing are documented rather than disguised as exact browser parity.
- Detail reads preserve actual current line snapshots and exact quantities, including leading-zero barcode snapshots and native CUTOFF_HISTORY facts. Canonical metadata contains all native SKU sizes for only the actual-line product/color/FIT tuples, plus complete referenced native size-group membership with IDs, labels/codes and signed persisted order. Disabled SKU presence is availability, not stock or command eligibility. Empty documents skip both metadata reads.
- Duplicate/foreign/missing SKU and group identities, repeated coordinates, inconsistent same-ID current labels/product groups, and SKU membership inconsistencies fail closed. Duplicate display labels/codes with distinct canonical IDs remain distinct. Independent probes accept exactly 20,000 SKU rows and 20,000 complete group members, and reject the first overflow of either bound without partial response.
- One acquired client and read-only REPEATABLE READ transaction contain each invocation's complete count/page/aggregate or header/lines/two-metadata sequence. Cancellation stops later work; failures roll back; unknown commit is not retried. Service prevents post-policy/post-reader stale delivery.
- All three HTTP routes retain explicit trusted authentication/authorization composition, exact decimal-string serialization, redacted failures, body/media/query-string guards and no-store/no-cache. Synthetic Fastify inject does not start a listener.

## Review hardening and limits

Initial review suggested keyed consistency checks for repeated product/color/FIT/size current facts. The owner added these before freeze; independent inconsistent product label/group, color label and FIT label probes pass.

This evidence is synthetic application/HTTP and scripted PostgreSQL-driver protocol verification, plus source/schema-contract inspection. No real PostgreSQL engine, SQL parser, browser, network, server/listener, installation, full-suite run, schema/index change, production edit, commit, push or external mutation was performed by this reviewer. Frozen-source files were not edited. The only reviewer additions are this bounded `evidence/transfer-read-extension-independent-*` evidence set. Actual database execution/isolation/performance and browser/Demo visual acceptance remain unclaimed.
