import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkedInventoryScope } from "../packages/application/src/inventory-query-validation.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { inventoryScope } from "./support/synthetic-inventory-query.ts";
import { inventoryCatalogStatusSql, previousInventoryMembershipSource } from "./support/inventory-membership-proof.ts";

// SOURCE/RELATIONAL-MODEL evidence only. No pg import, connection, SQL execution, plan or timing claim.
const source = readFileSync(new URL("../adapters/postgres/src/inventory-query-reader.ts", import.meta.url), "utf8");
const currentSql = inventoryCatalogStatusSql(source);
const previousSql = inventoryCatalogStatusSql(previousInventoryMembershipSource(source));

test("inventory membership source: carry the already joined group identity; remove only the repeated catalog-status product join", () => {
  assert.match(currentSql, /SELECT s\.id, s\.product_id, s\.color_id, s\.fit_id, s\.size_id, p\.size_group_id FROM naijue_erp\.sku s JOIN matched_products p ON p\.id = s\.product_id/u);
  assert.match(currentSql, /EXISTS \(SELECT 1 FROM filtered_skus s WHERE NOT EXISTS \(\s*SELECT 1 FROM naijue_erp\.size_group_member m WHERE m\.size_group_id = s\.size_group_id AND m\.size_id = s\.size_id\)\) AS invalid_sku_size/u);
  assert.doesNotMatch(currentSql, /filtered_skus s JOIN matched_products/u);
  assert.match(previousSql, /filtered_skus s JOIN matched_products p ON p\.id = s\.product_id/u);
  // Check the reviewed before/after expression is the only difference in the actual SELECT text.
  assert.equal(currentSql.replace(", p.size_group_id FROM naijue_erp.sku s JOIN matched_products", " FROM naijue_erp.sku s JOIN matched_products")
    .replace("FROM filtered_skus s WHERE NOT EXISTS (\n      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = s.size_group_id",
      "FROM filtered_skus s JOIN matched_products p ON p.id = s.product_id WHERE NOT EXISTS (\n      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id"), previousSql);
});

test("inventory membership source: complete filtered range, publication/scope proof and fail-closed flags stay before page selection", () => {
  assert.doesNotMatch(currentSql, /\b(?:LIMIT|OFFSET)\b/u);
  for (const marker of ["published_scope", "authorized_warehouses", "matched_products", "filtered_skus", "missing_sizes", "uncovered_sku", "invalid_sku_size", "invalid_balance", "AS quantity"])
    assert.ok(currentSql.includes(marker));
  for (let number = 1; number <= 8; number++) assert.ok(currentSql.includes(`$${number}::uuid`));
  assert.match(source, /integrity\(!booleanValue\(row\.invalid_category_tree\) && !booleanValue\(row\.missing_sizes\) && !booleanValue\(row\.invalid_sku_size\) && !booleanValue\(row\.invalid_balance\)/u);
  assert.match(source, /requireDomain\(!booleanValue\(row\.uncovered_sku\), "INVENTORY_NOT_READY"/u);
  assert.match(source, /const status = await catalogStatus\(query, values\);\s*const products =/u);
});

type Product = { id: string; group: string; category: string; supplier: string; season: string };
type Sku = { id: string; product: string; fit: string; size: string };
type Member = { group: string; size: string };
type Filter = { products: readonly string[]; categories: readonly string[]; suppliers: readonly string[]; seasons: readonly string[]; fits: readonly string[] };
const emptyFilter: Filter = { products: [], categories: [], suppliers: [], seasons: [], fits: [] };
const products: readonly Product[] = [
  { id: "A", group: "group-A", category: "good", supplier: "good", season: "good" },
  { id: "B", group: "group-B", category: "good", supplier: "good", season: "good" },
  { id: "Z-bad", group: "group-A", category: "bad", supplier: "bad", season: "bad" }
];
// Shared sizes are legitimate across distinct groups. Labels/codes, including repeated code 900, do not enter either predicate.
const members: readonly Member[] = [{ group: "group-A", size: "shared-size" }, { group: "group-B", size: "shared-size" }, { group: "group-B", size: "B-only-size" }];
const skus: readonly Sku[] = [
  { id: "sku-A", product: "A", fit: "good", size: "shared-size" },
  { id: "sku-B", product: "B", fit: "good", size: "B-only-size" },
  { id: "sku-bad", product: "Z-bad", fit: "bad", size: "B-only-size" }
];
function relations(ps: readonly Product[], ss: readonly Sku[], filter: Filter, hasAuthorizedWarehouse = true) {
  const selected = (values: readonly string[], value: string) => values.length === 0 || values.includes(value);
  const matched = hasAuthorizedWarehouse ? ps.filter(p => selected(filter.products, p.id) && selected(filter.categories, p.category)
    && selected(filter.suppliers, p.supplier) && selected(filter.seasons, p.season)
    && (filter.fits.length === 0 || ss.some(s => s.product === p.id && filter.fits.includes(s.fit)))) : [];
  const filtered = ss.flatMap(s => matched.filter(p => p.id === s.product && selected(filter.fits, s.fit)).map(p => ({ ...s, group: p.group })));
  return { matched, filtered };
}
function parity(ps: readonly Product[], ss: readonly Sku[], ms: readonly Member[], filter: Filter = emptyFilter, hasAuthorizedWarehouse = true) {
  const { matched, filtered } = relations(ps, ss, filter, hasAuthorizedWarehouse);
  const previousInvalid = filtered.some(s => matched.some(p => p.id === s.product && !ms.some(m => m.group === p.group && m.size === s.size)));
  const currentInvalid = filtered.some(s => !ms.some(m => m.group === s.group && m.size === s.size));
  assert.equal(currentInvalid, previousInvalid);
  return { invalid: currentInvalid, matched };
}

test("RELATIONAL MODEL ONLY: valid shared size identities and invalid cross-group membership retain exactly the preceding boolean", () => {
  assert.equal(parity(products, skus.slice(0, 2), members).invalid, false);
  assert.equal(parity(products, skus, members).invalid, true);
  assert.equal(parity(products, skus, [...members, { group: "group-A", size: "B-only-size" }]).invalid, false);
  assert.equal(parity(products, skus, []).invalid, true);
  assert.equal(parity(products, [], members).invalid, false);
  assert.equal(parity([], skus, members).invalid, false);
});

test("RELATIONAL MODEL ONLY: product/category/supplier/season/fit filters keep whole-filter invalid membership semantics", () => {
  for (const [key, value] of [["products", "A"], ["categories", "good"], ["suppliers", "good"], ["seasons", "good"], ["fits", "good"]] as const)
    assert.equal(parity(products, skus, members, { ...emptyFilter, [key]: [value] }).invalid, false);
  for (const [key, value] of [["products", "Z-bad"], ["categories", "bad"], ["suppliers", "bad"], ["seasons", "bad"], ["fits", "bad"]] as const)
    assert.equal(parity(products, skus, members, { ...emptyFilter, [key]: [value] }).invalid, true);
  assert.equal(parity(products, skus, members, { ...emptyFilter, products: ["missing-product"] }).invalid, false);
  // A rejected fit is excluded at SKU level, not merely at product selection.
  const mixed = [...skus, { id: "bad-fit-on-good-product", product: "A", fit: "bad", size: "B-only-size" }];
  assert.equal(parity(products, mixed, members, { ...emptyFilter, products: ["A"], fits: ["good"] }).invalid, false);
  assert.equal(parity(products, mixed, members, { ...emptyFilter, products: ["A"] }).invalid, true);
});

test("RELATIONAL MODEL ONLY: off-page bad SKU still invalidates page one and an empty page; page does not narrow proof", () => {
  for (const page of [1, 2, 20]) {
    const result = parity(products, skus, members);
    const visible = result.matched.slice((page - 1) * 2, page * 2);
    if (page === 1) assert.deepEqual(visible.map(p => p.id), ["A", "B"]);
    if (page === 20) assert.deepEqual(visible, []);
    assert.equal(result.invalid, true);
  }
  assert.equal(parity(products, skus, members, emptyFilter, false).invalid, false);
});

test("inventory scope: empty or unbounded all shortcut cannot turn missing authority into a global catalogue grant", () => {
  const code = (expected: string) => (e: unknown) => e instanceof DomainError && e.code === expected;
  assert.throws(() => checkedInventoryScope({ hallIds: [], warehouses: [] }), code("FORBIDDEN"));
  assert.throws(() => checkedInventoryScope({ kind: "all" } as never), code("INVALID_INVENTORY_RESPONSE"));
  assert.deepEqual(checkedInventoryScope(inventoryScope), inventoryScope);
  assert.equal(parity(products, skus, members).matched.length, 3, "no product filter still means the complete finite authorized catalogue");
});

test("RELATIONAL MODEL ONLY: exhaustive small membership combinations preserve the same existential result", () => {
  const possible = products.flatMap(p => ["shared-size", "B-only-size", "not-a-member"].map(size => ({ group: p.group, size })));
  for (let mask = 0; mask < 1 << possible.length; mask++) {
    const ms = possible.filter((_m, n) => mask & (1 << n));
    for (const filter of [emptyFilter, { ...emptyFilter, fits: ["good"] }, { ...emptyFilter, products: ["Z-bad"] }])
      parity(products, skus, ms, filter);
  }
});
