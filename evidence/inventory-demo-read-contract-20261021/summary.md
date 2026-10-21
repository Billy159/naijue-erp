# Inventory Demo read-contract extension

Base: 6b3e5647fb174201f028518f677f7cb43e2da0e3. No commit was made.

## Contract and native read boundary

- Unreleased inventory request filter now has categories: Selection[]; normalized server filter has categoryIds: EntityId<"category">[]. Candidate requests have categoryIds: string[]. No legacy scalar alias is accepted.
- Categories are positive OR selections. A native product matches its own category or one of its native direct-parent IDs. All dimensions combine with AND inside the unchanged hall/warehouse intersection. Empty category arrays add no category predicate, not a global-scope grant. The base product relation is filtered with OR/EXISTS, not joined to a selected-category list, so selecting both parent and child cannot multiply it.
- Every selection array remains bounded to 100 canonical unique UUIDs and copied/frozen before authorization awaits. Sparse arrays are now rejected explicitly. Unknown/scalar/malformed fields fail closed.
- Product candidate search now matches native product_code, name, or nullable system_item_code using the same parameterized literal strpos predicate for count/page. No UUID-as-system-number mapping, wildcard conversion, schema change, extra query, or DTO change. Null system_item_code does not create a search hit.
- Product candidates directly project native product_code and name in the existing single bounded 20-row candidate query. Category candidates directly project native parent_id, with null roots and verified two-level depth/parent labels. No eager details, global product IDs, per-row calls, extra catalog fetch, or label parsing.
- ProductBasics.retailPrice is a required nullable exact decimal string. Its only native source is product.retail_price::text in the existing target WHERE p.id=$1 query. Null is missing; 0.00 is an actual zero; neither is inferred from a SKU, sales history, nor a fixture price.
- The approved native product schema already stores nullable retail_price decimal(18,2) CHECK >=0. No migration/schema/domain-write/authorization/authentication code changed. Categories/catalog remain shared under the existing authorization model; no invented category ACL was introduced.

## Decimal versus minor-unit boundary

Domain Product.retailPrice remains MinorAmount, a bigint integer in minor units, unchanged. This read-only DTO deliberately uses exact source decimal(18,2) text, for example 9007199254740993.01, without converting through JS number, parseFloat, rounding, or guessing a scale. Native and web validators require canonical nonnegative 2-decimal strings within 16 whole digits, or explicit null. Existing preview/test providers that have no stored price now return null, never an invented price.

## Verification

- evidence/inventory-demo-read-contract-tests.log: 133/133 passed. Inventory/product application, scripted native PG protocol, web semantic model, HTTP transport validation. New regressions cover malformed/legacy/sparse/duplicate/oversize categories, capture-before-await, empty/denied warehouse scope, same CATALOG source predicate for list/count/full summary, positive OR/EXISTS instead of row-multiplying joins, direct candidate fields, parent identity, and nullable/zero/large/invalid decimal text.
- evidence/inventory-demo-dependent-read-tests.log: 131/131 passed. Existing native authorization, inventory ledger service/protocol, first-use/product schema source checks, Fastify inventory/product HTTP tests, and read-API composition tests.
- git diff --check passed. The protected paths adapters/postgres/migrations, packages/domain, and adapters/postgres/src/source-confirmed-read-authorization.ts have no diff from the base.
- These are scripted clients, Fastify.inject, source-contract checks, and generated finite fixtures. No actual PostgreSQL parsing/execution/query plan/isolation or production behavior is claimed. No DB/network/listener operation, full compiler/build, schema write, production action, commit, push, or deploy was performed. Root owns final aggregate compilers and UI/browser acceptance after all work freezes.

## Approved system-number-search follow-up

- Source evidence: migration 0005_product_read_fields.sql:4–9 already declares nullable product.system_item_code; product-query-reader.ts target basics query already depends on that field and exposes systemCode. product-tab-basics.tsx labels it 系统货号.
- The missing third candidate search branch was added with root approval. evidence/inventory-demo-system-code-search-tests.log: 83/83 passed across inventory application/protocol and Fastify HTTP tests. This overlaps the main suites and is not added to their counts.
- The new test checks the exact generated shared count/page SQL and a clearly labeled finite scripted model with system-number-only hits, NULL nonmatch, continued code/name hits for a NULL system number, literal percent/underscore, malformed searches, unmodified scope/category parameters, stable ordering, and 20-row bounds. PostgreSQL parsing/execution and actual deployed migration/column presence remain unverified. No compiler/DB/commit/schema change was performed.
- Main read-contract focused suite was rerun after this change (133/133). Dependent suite remains the earlier 131/131 run; its owned native sources did not change in this narrow follow-up.
- Later concurrent changes to apps/web/tests/run-dom-tests.mjs were not absorbed into the owned patch or original hash. The original price-only hunk is retained; inspect current hashes and reverse dry-run before reverting.

## Revert and change ownership

owned-files.txt lists this extension's exact changed source/fixture/test paths; owned.patch captures only those paths. It excludes the concurrent inventory page/components/CSS restoration and shared multiselect changes. owned-file-sha256.json records the file content at handoff. Before reverting, verify hashes or use git apply --reverse --check owned.patch; do not overwrite later work. A reverse dry run passed at capture. Both source and required fixtures must be reverted together because this is an unreleased breaking read-contract change.
