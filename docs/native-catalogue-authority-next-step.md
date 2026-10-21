# Approved native catalogue authority: minimal next implementation

This is a coordination plan, not a migration or executed database change. The
CURRENT read slice deliberately reports missing current storage honestly until
these already-approved contracts are implemented and validated.

## Existing approvals, not new business decisions

Approved schema plan: https://chatgpt.com/space/page_503dc756b3fc8191a29c8cf269409092
Root recovered sections 11–12 and the exact user approvals. It defines:

- barcode_scheme: id, name, barcode_type, rule_description, nullable code_length,
  rule_version, status CURRENT or HISTORICAL.
- sku_barcode: id, barcode text, sku_id, barcode_kind MAIN or CONFIRMED_OLD,
  nullable scheme_id, enabled. One current MAIN per SKU, multiple confirmed old
  aliases, no cross-SKU rebinding and no re-encoding original strings.

Later user instructions retain all nine frozen Demo whole-product price fields,
entered in RMB yuan with no more than two decimals. Root also confirmed a NEW EMPTY
DB and validated first import. No minimum_price_state or speculative state columns
are needed merely to backfill existing products: this is not an old-row upgrade.

## Source-only migration work, separately owned

Retain product.retail_price for Demo price. Add exactly eight nullable amount columns
at product level: purchase_price, wholesale5_price, wholesale6_price,
wholesale7_price, wholesale8_price, wholesale9_price, wholesale10_price and
minimum_price. Each uses the existing decimal(18,2), nonnegative contract. No SKU
price override, generated price, extra business cap or automatic price selection.

Preserve frozen labels and order: purchasePrice 采购价; price 零售价;
wholesale5 五级批发价（工厂店供货价）; wholesale6 六级批发价（贴牌价）;
wholesale7 七级批发价（批发价）; wholesale8 八级批发价（代理商供货价）;
wholesale9 九级批发价（工厂店零售价）; wholesale10 十级批发价（葛玉珠）;
minimumPrice 最低售价. Existing evidence is
`evidence/frozen-demo-price-fields-b8bcfe3/8877-price-fields-b8bcfe3.json`.

The new source migration must enforce/check the agreed empty-product precondition,
not silently add unknown-null prices to populated products. Validated product
creation/first import must require all nine keys explicitly. A supplied confirmed
unset value becomes NULL; an omitted/unknown key fails completeness validation.
Zero is exactly zero. Decimal strings are parsed without floating point, rounding
or added default values. Storage access alone does not prove import completeness:
the actual validated creation/import publication path must establish that gate
before the real sales pricing provider is enabled. Partial/unknown source records
stay quarantined, not published as zero/no-minimum products.

Create the approved barcode_scheme and sku_barcode shapes without adding legacy
storage or code-generation rules. The minimal binding protection is raw barcode
uniqueness including disabled bindings, plus at most one enabled MAIN for each SKU,
and existing native SKU/nullable scheme FKs. Raw text is preserved byte-for-byte;
no numerical conversion, trim-based replacement or guessed scheme/length. A source
collision across SKUs is an import exception, never resolved by choosing one row.
Repeated same-SKU aliases need explicit deduplication/provenance in validated import.
The current domain type uses PRIMARY/CONFIRMED_HISTORICAL names: the implementation
must deliberately map the approved native MAIN/CONFIRMED_OLD semantics or coordinate
a reviewed domain change, not introduce a silent third barcode-kind contract.

## Trusted in-transaction facts, separately owned

The existing SalesBusinessRules resolver is synchronous and has no transaction
argument. The sales UoW currently supplies locked current identity but no complete
native reference/pricing batch. Therefore a native provider must first gain a
reviewed, transaction-bound batch seam. It cannot open a second read-only pool
snapshot, retain a global mutable facts cache or accept prepared client facts.

A minimal request-local batch covers the exact proposed hall, warehouse, customer,
optional staff, distinct payment accounts/methods, target SKU IDs, their product
prices and formal color/fit/group membership, and approved barcode bindings. Lock
and read the real facts on the original command client in a canonical bounded order;
load each product price once even if multiple SKU/actual lines use it. Preserve
stored current line snapshots across renames when unchanged; new/replaced snapshots
must match trusted selected identity rather than request labels. Original scan/raw
barcode observations and catalogue MAIN are distinct facts, not interchangeable.

Choose either asynchronous business-rule methods receiving the command transaction,
or an explicit per-transaction facts context preloaded by the same transaction.
The choice must preserve concurrent command isolation, current identity checks,
existing source+proposed authorization, original idempotency keys/results, receipt
re-authorization, version CAS and atomic rollback. Do not bypass these by enabling
a write plugin in postgres-read-api.ts.

Transfer already has native transaction warehouse/SKU facts but reads SKU facts in
an individual-call loop and relies on session actor role/hall. Batched preload and
fresh in-transaction identity require separate focused work if production writes
are to claim those guarantees. The CURRENT proposal reader does not fix them.

Finally compose the real trusted session authenticator, explicit form policy,
transaction UoWs, full reference/economic providers, clock and stable ID provider,
CSRF/origin protection and bounded host settings. Document number format/allocation
is still missing: recovered KH/GYS rules are party codes, not sales/transfer document
numbers. No arbitrary prefix/counter/default is inferred from them.

No production migration, real DB test, seed/import, operational startup or external
change is performed by this plan. Root coordinates the owners before implementation
so schema, import, domain/application ports and frontend work do not overlap.
