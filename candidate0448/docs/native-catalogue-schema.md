# Native catalogue authority 0009: source-only contract

`0009_catalogue_prices_barcodes.sql` implements the already-approved storage fields,
not a request to choose the same fields again. The approved Page is
https://chatgpt.com/space/page_503dc756b3fc8191a29c8cf269409092 (sections 11–12,
current sequence 8 when read). Later exact user instructions retain all nine frozen
Demo whole-product prices and RMB yuan inputs with at most two decimal places.
No PostgreSQL migration has been executed in this slice.

## Mandatory order and compatibility

This is a first-install, empty-product migration, not an in-place conversion of a
populated catalogue. Apply the exact reviewed 0001–0008 prefix, then 0009, before
any product creation/first import or product fixture. In one transaction 0009 locks
product in ACCESS EXCLUSIVE mode, verifies exactly versions 1–8, and rejects a
nonempty product table before adding nullable fields. A failed precondition is not
permission to truncate, delete, backfill NULL, forge registry rows or disable guards.

The immutable original1–8 byte manifest now lives in
`tests/integration/frozen-0001-0008-manifest.ts` as historical evidence only. It is
not an executable compatibility suite. The single current MIGRATIONS list is1–10:
apply all ten before any product/settlement fixture, then insert all nine explicit
price values. Version10 is the separately approved original-method settlement
snapshot, not another catalogue field. No earlier migration bytes were rewritten.
Passing old eight-version evidence does not verify0009/0010 or current writehost.

Current native sales writes/facts require version10, without legacy options. The
schema-neutral proposal reader remains a deliberately incomplete read projection;
its optional recommendations may degrade unavailable on missing later schema, but
that never grants schema-critical write authority. No genuine new migration ran.

## Product prices

Existing retail_price is the Demo price/零售价 authority. Exactly eight nullable
nonnegative decimal(18,2) fields are added: purchase_price, wholesale5_price,
wholesale6_price, wholesale7_price, wholesale8_price, wholesale9_price,
wholesale10_price and minimum_price. Prices stay on product, never SKU. There is no
minimum-price state field, made-up default, extra business cap or old-row backfill.

Validated product creation/import must require all nine source keys explicitly.
Known unset is NULL and exact zero remains zero. Missing/unknown input is rejected
or quarantined, not cast to known unset. Amounts must be parsed from exact yuan
strings without floating-point arithmetic, rounding or extra precision. PostgreSQL
numeric storage itself may coerce/round inputs: SQL-text tests are not proof that
unvalidated arbitrary SQL preserves the required input precision.

The empty-product guard protects first-install ordering, not source completeness
of every future INSERT. The actual creation/import publication path must establish
that completeness before native sales economics is enabled. A nullable SQL value
by itself cannot prove whether the source explicitly left the field unset.

## Raw barcode authority

barcode_scheme stores only the approved descriptive fields: UUID id; required
name, barcode_type, rule_description and rule_version text; nullable positive
code_length; required CURRENT/HISTORICAL status. It has no seeded rule, assumed
Code128/15-digit default, executable script or new maintenance UI/API.

sku_barcode stores UUID id, exact raw barcode text, canonical SKU FK,
MAIN/CONFIRMED_OLD kind, nullable scheme FK and enabled. Built-in C collation keeps
raw uniqueness bytewise/deterministic rather than silently case-folding codes. The
column is never numerical, trimmed or regenerated. Unknown old schemes stay NULL.

A raw value is unique including disabled rows. At most one enabled MAIN can belong
to a SKU; multiple distinct confirmed old aliases may bind the same SKU. An update
cannot change a binding ID, raw code or SKU target. Deletion is refused so deleting
a disabled record cannot enable a cross-SKU rebind; disabling remains available.
The trigger does not silently change schemes/kinds/statuses or add a maintenance
workflow. Source conflicts remain import exceptions, not whichever row was found.

## Validation and outstanding work

`node --test tests/catalogue-authority-schema-contract.test.ts` passes 7 source
contract tests. They assert the guard/order, exact added fields, raw constraints,
no seeds/defaults/state/credentials and unchanged earlier migration bytes. They do
not parse/execute SQL in PostgreSQL or verify actual constraints, locks, races,
rollback, import, native economics, production startup or browser acceptance.

Still required: strict explicit-nine-price input validation at the actual product
creation/import path; reviewed native in-transaction batch reference/pricing facts;
trusted import completeness proof; current barcode read/scan adapters; dedicated
1–10 real-engine acceptance; document numbering; and real write-host composition.
The current CURRENT proposal reader honestly keeps minimum/barcode availability
UNAVAILABLE rather than treating this unexecuted schema source as live authority.

Only the new migration, source-contract test, this document and evidence files
listed in catalogue-authority-manifest.json belong to this scope. Remove those
source files to revert this unexecuted slice; never reset other workers' changes.
No install, live migration, import, operations, compiler/build, commit or publication
was performed by this worker.
