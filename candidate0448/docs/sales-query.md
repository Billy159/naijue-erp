# Native sales multi-value read filters

This is a read-query contract extension, not a business database change. No table,
column, migration, stored business type, command, authorization grant or permission
was added or changed.

## One current unreleased contract

POST `/sales/query` and `/sales/settlement-statistics/query` accept exactly:

```ts
{
  filter: {
    startDate: BusinessDate | null,
    endDate: BusinessDate | null,
    statuses: readonly DocumentStatus[],
    businessTypes: readonly SalesBusinessType[],
    hallIds: readonly EntityId<'hall'>[],
    salespersonIds: readonly EntityId<'staff'>[],
    customerIds: readonly EntityId<'customer'>[],
    warehouseIds: readonly EntityId<'warehouse'>[],
    number: string | null
  },
  page: number,
  pageSize: 20 | 50 | 100 | 200
}
```

All keys and all six lists are required. Empty lists add no restriction; populated
lists mean OR within their own dimension. Dimensions intersect with each other and
with the independently obtained current trusted authorization scope. No requested
filter, including a foreign-hall selection, grants access.

Statuses are the distinct native DRAFT, APPROVED and VOID values. Business types
are distinct native SALE, RETURN and EXCHANGE values. Each enum list permits at
most three entries. Each ID list permits at most 1000 canonical lowercase UUIDs,
as a request-resource bound rather than a business catalog limit. Duplicate IDs or
enums, sparse arrays, null/scalar lists, malformed IDs, unknown enum values, missing
or extra fields and old singular filter aliases are rejected. Syntactically valid
IDs are query values, not new reference eligibility grants; unmatched IDs naturally
match no rows, without a catalog scan or per-selected-ID query. Validation copies
and freezes every list before authorization can await.

This intentionally replaces the previous scalar shape of the unreleased read API.
There is no legacy compatibility branch. Current web adapters and active API,
application, authorization and gated integration fixtures use the plural shape.
Previously recorded verification evidence remains historical and unchanged.

The existing 65,536-byte total JSON request cap remains independent of per-list
bounds, both in HTTP transport and the API route. A combination of individually
valid lists can therefore exceed the total byte cap and be rejected as too large;
1000 entries per list is not a promise that every maximal combination fits one
request. There is no silent truncation or selection-to-first-value conversion.

## Demo presentation and native facts

The six sales dimensions now use the shared source-adapted TreeSelect multi-select
presentation, also reused by transfer filters. Drafts retain every selected
reference and its full label. Status is a complete three-option universe; business
type is exactly the two Demo groups SALE (销售) and RETURN_EXCHANGE (退货/换货).
RETURN_EXCHANGE projects to native `[RETURN, EXCHANGE]`, never a stored/API type.
Native list/detail facts preserve RETURN versus EXCHANGE.

The sales shell prepares action code/CSS only on first focus or action, obtains
exclusive popup ownership before opening, and starts reference data only while
that popup owns a live child scope. One bounded 20-entry page follows opening or
debounced search; another page requires bottom scrolling. At most 200 candidates
are retained per popup activation without truncating its exact total. Selected
references survive search/page changes; popup data itself is discarded on close,
provider/target replacement, detail entry, route or identity invalidation.

Known frozen-Demo interaction limits are explicit, not silently approximated:

- Exact all-minus-one is available only for a complete unsearched single response.
  A filtered, partial or accumulated multi-page set cannot establish that universe.
  In that case the checkbox operation is refused with an explanatory notice; a
  separately labelled 仅选择该项 action may start a positive subset. There is no
  excluded-ID API, page-only complement or eager full-catalog enumeration.
- Clearing a selection returns to all/unrestricted and displays 全部…. The frozen
  local zero-selected display despite an unrestricted query is not reproduced.
- Native candidates intentionally include authorized historical references, unlike
  frozen enabled/current master choices. Remote search retains the existing literal
  name (and customer code) contract, not unsupported whole-catalog pinyin matching.

These controls and source/configuration checks do not claim full Demo behavior,
real-browser appearance, computed layout or performance parity.

## Predicate and loading boundaries

`PostgresSalesQueryReader` constructs one shared Predicate for list count/page and
settlement summary/account page. Each populated dimension becomes one parameterized
`= ANY(...)` predicate. Migration 0001 stores status/business_type as text CHECKs
and the four reference columns as uuid, so the fixed casts are text[] and uuid[].
Scope is always a separate AND term. Statistics additionally intersect with
`h.status = 'APPROVED'`; selecting drafts does not make drafts enter settlements.
Dates remain inclusive actual-calendar/range-validated bounds. Number remains a
trimmed, control-free 1–200 character literal case-insensitive substring; %, _,
backslashes and quotes do not become SQL wildcards or source. PostgreSQL lower()
still follows database locale; exact browser Unicode edge equivalence is not claimed.

List exact count and page remain in the same read-only REPEATABLE READ snapshot.
Current non-gift quantities use one page-ID batch, not a full document/catalog
hydration or per-selected-value/document loop. Nonempty list work stays at three
business statements plus BEGIN/COMMIT; an empty page skips its quantity batch.
Statistics remain two business statements plus BEGIN/COMMIT. Counts, money and
quantities remain exact integers, serialized as decimal strings at HTTP boundaries.

Reference candidate reads keep the existing authorized observed-header projection,
20-entry paging, search/cancellation and fail-closed guards; their authorization's
neutral list intent now uses empty plural lists. Existing explicit query, applied
versus draft filters, page-size retry/cancel, stale response rejection and
identity/permission cleanup paths remain in place. No automatic query is added.

## Verification boundary

Focused application, scripted PG protocol, Fastify inject and web model/transport
checks exercise bounds, full-list forwarding, immutable capture, authorized shared
predicates and exact numeric serialization. Sales and composed application jsdom
checks cover the temporary group adapter and retained loading/lifecycle behavior.
These are not genuine PostgreSQL SQL execution, browser pixels or performance tests.

The next existing gated isolated backend suite has prepared assertions for native
six-dimension multi-value queries with matching values deliberately second, unchanged
A/B authorization and list/statistics totals. It also checks both persisted RETURN
and EXCHANGE types in one selected group. These engine scenarios were not executed
for this change. Previous engine evidence does not validate the new ANY predicates.
