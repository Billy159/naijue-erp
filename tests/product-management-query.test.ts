/** Synthetic application contract only. No production role policy, source arrays or database. */
import assert from "node:assert/strict";
import test from "node:test";
import { createProductManagementQueryService } from "../packages/application/src/product-management-query-service.ts";
import { checkedProductManagementCandidatePage, checkedProductManagementGrant, checkedProductManagementListPage,
  parseProductManagementCandidateQuery, parseProductManagementListQuery } from "../packages/application/src/product-management-query-validation.ts";
import type { ProductManagementQueryDependencies, ProductManagementReadGrant, ProductManagementReadIntent } from "../packages/application/src/product-management-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

const productId = sid("product", 7001), other = sid("product", 7002);
const filter = { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] };
const input = { filter, page: 1, pageSize: 100 };
const candidateInput = { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 };
const item = { id: productId, code: "SYNTHETIC-CODE", name: "合成商品", categoryLabel: "合成分类", year: null,
  seasonLabel: null, supplierLabel: null, fits: [], thickness: null, retailPrice: null, totalStock: null };
const result = { page: 1, pageSize: 100 as const, exactTotal: 1, items: [item] };
const candidates = { page: 1, pageSize: 20 as const, exactTotal: 1, items: [{ id: productId, label: "合成商品", code: "SYNTHETIC-CODE", name: "合成商品" }] };
const signal = () => new AbortController().signal;
function fixture(override: { grant?: unknown; authorize?: ProductManagementQueryDependencies["authorization"]["authorize"]; list?: unknown; candidate?: unknown } = {}) {
  let reads = 0, authorizations = 0; const intents: ProductManagementReadIntent[] = [];
  const dependencies: ProductManagementQueryDependencies = {
    authorization: { async authorize(context, intent, abort) { authorizations++; intents.push(intent); assert.deepEqual(context, actor);
      return override.authorize ? override.authorize(context, intent, abort) : (override.grant ?? { kind: "products", productIds: [productId], totalStock: "unavailable" }) as ProductManagementReadGrant; } },
    reader: { async readList() { reads++; return (override.list ?? result) as typeof result; }, async readCandidates() { reads++; return (override.candidate ?? candidates) as typeof candidates; } }
  };
  return { service: createProductManagementQueryService(dependencies), dependencies, counts: () => ({ reads, authorizations }), intents };
}
test("product management requires explicit policy and independent current grants; catalogue is not a drawer or stock grant", async () => {
  assert.throws(() => createProductManagementQueryService({} as never), /explicit authorization/);
  const f = fixture(); const value = await f.service.readList(actor, input, signal());
  assert.equal(value.items[0]!.totalStock, null); assert.equal(value.items[0]!.retailPrice, null); assert.deepEqual(f.counts(), { reads: 1, authorizations: 1 });
  assert.equal(f.intents[0]!.kind, "list");
  for (const grant of [{}, { kind: "all" }, { kind: "products", productIds: [], totalStock: "unavailable" }, { kind: "all", totalStock: "own-warehouse" },
    { kind: "all", totalStock: "unavailable", role: "ADMIN" }, { productId }]) {
    const denied = fixture({ grant }); await assert.rejects(() => denied.service.readList(actor, input, signal()), { code: "FORBIDDEN" }); assert.equal(denied.counts().reads, 0);
  }
});
test("product management validates all eight dimensions, exact query keys and bounded pagination before authorization", async () => {
  const f = fixture();
  for (const bad of [{ ...input, role: "ADMIN" }, { ...input, page: 0 }, { ...input, pageSize: 20 }, { ...input, filter: { ...filter, q: "x" } },
    { ...input, filter: { ...filter, productIds: ["bad"] } }, { ...input, filter: { ...filter, years: [2026] } },
    { ...input, filter: { ...filter, fitIds: [sid("fit", 1), sid("fit", 1)] } }, { ...input, filter: { ...filter, thicknesses: ["\u0000"] } }]) {
    await assert.rejects(() => f.service.readList(actor, bad, signal()), { code: "INVALID_PRODUCT_MANAGEMENT_QUERY" });
  }
  assert.deepEqual(f.counts(), { reads: 0, authorizations: 0 });
  const all = parseProductManagementListQuery({ ...input, filter: { productIds: [productId], categoryIds: [sid("category", 2)], years: ["2026"], seasonIds: [sid("season", 3)],
    supplierIds: [sid("supplier", 4)], fitIds: [sid("fit", 5)], thicknesses: ["厚"], shapeCodes: ["ROUND"] } });
  assert.ok(Object.isFrozen(all.filter.years)); assert.equal(all.filter.shapeCodes[0], "ROUND");
});
test("product management candidate search is literal, selected lookup exclusive, all eight kinds are parsed", () => {
  for (const kind of ["product", "category", "year", "season", "supplier", "fit", "thickness", "shape"]) {
    assert.equal(parseProductManagementCandidateQuery({ ...candidateInput, kind, search: "%_literal" }).search, "%_literal");
  }
  for (const bad of [{ ...candidateInput, kind: "warehouse" }, { ...candidateInput, selectedIds: [productId], search: "x" },
    { ...candidateInput, search: "x".repeat(101) }, { ...candidateInput, selectedIds: ["not-id"] }, { ...candidateInput, pageSize: 100 }]) assert.throws(() => parseProductManagementCandidateQuery(bad));
});
test("product management preserves native nulls, exact price/negative totals and full category candidate facts", () => {
  const value = checkedProductManagementListPage({ ...result, items: [{ ...item, year: 2026, retailPrice: "0.00", totalStock: "-12345678901234567890" }] });
  assert.equal(value.items[0]!.retailPrice, "0.00"); assert.equal(value.items[0]!.totalStock, "-12345678901234567890");
  const category = checkedProductManagementCandidatePage({ ...candidates, items: [{ id: sid("category", 1), label: "分类", parentId: sid("category", 2), parentLabel: "原父名", depth: 1 }] }, "category");
  assert.equal(category.items[0]!.parentLabel, "原父名");
  for (const price of [0, "0", "-1.00", "1.001", "1e2", "10000000000000000.00"]) assert.throws(() => checkedProductManagementListPage({ ...result, items: [{ ...item, retailPrice: price }] }));
});
test("product management refuses truncated pages, pagination mismatches and off-grant/unauthorized-stock responses", async () => {
  for (const list of [{ ...result, exactTotal: 2 }, { ...result, page: 2 }, { ...result, items: [{ ...item, id: other }] },
    { ...result, items: [{ ...item, totalStock: "0" }] }, { ...result, items: [{ ...item, retailPrice: "bad" }] }]) {
    const f = fixture({ list }); await assert.rejects(() => f.service.readList(actor, input, signal()), /trusted product management/);
  }
  assert.throws(() => checkedProductManagementCandidatePage({ ...candidates, exactTotal: 2 }, "product"));
  assert.throws(() => checkedProductManagementCandidatePage({ ...candidates, items: [{ id: productId, label: "缺失code/name" }] }, "product"));
  const incomplete = fixture({ grant: { kind: "all", totalStock: "all-warehouses" } });
  await assert.rejects(() => incomplete.service.readList(actor, input, signal()), /Mismatched trusted/);
});
test("product management policy revocation is checked on every list and candidate call before storage", async () => {
  let allowed = true;
  const f = fixture({ authorize: async () => { if (!allowed) throw new DomainError("FORBIDDEN", "Revoked"); return { kind: "all", totalStock: "unavailable" }; } });
  await f.service.readList(actor, input, signal()); allowed = false;
  await assert.rejects(() => f.service.readCandidates(actor, candidateInput, signal()), { code: "FORBIDDEN" }); assert.equal(f.counts().reads, 1);
});
test("product management cancellation before policy, pending policy and after storage never publishes late facts", async () => {
  const before = new AbortController(); before.abort(); const f = fixture();
  await assert.rejects(() => f.service.readList(actor, input, before.signal), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" }); assert.deepEqual(f.counts(), { reads: 0, authorizations: 0 });
  const pending = new AbortController(); let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const mutable = { ...input, filter: { ...filter, productIds: [productId] } }, mutableActor = { ...actor };
  const g = fixture({ authorize: async (seenActor, intent) => { await wait; assert.equal(seenActor.accountId, actor.accountId); assert.equal(intent.kind === "list" && intent.parameters.filter.productIds[0], productId); return { kind: "all", totalStock: "unavailable" }; } });
  const read = g.service.readList(mutableActor, mutable, pending.signal); mutable.filter.productIds[0] = other; mutableActor.accountId = sid("account", 99); pending.abort(); release();
  await assert.rejects(() => read, { code: "PRODUCT_MANAGEMENT_READ_ABORTED" }); assert.equal(g.counts().reads, 0);
  const after = new AbortController(), h = fixture();
  const service = createProductManagementQueryService({ ...h.dependencies, reader: { ...h.dependencies.reader, async readList() { after.abort(); return result; } } });
  await assert.rejects(() => service.readList(actor, input, after.signal), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" });
});
test("product management explicit grants are copied and frozen; no implicit global scope or field grants", () => {
  const ids = [productId], grant = checkedProductManagementGrant({ kind: "products", productIds: ids, totalStock: "unavailable" }); ids[0] = other;
  assert.equal(grant.kind === "products" && grant.productIds[0], productId); assert.ok(Object.isFrozen(grant));
});
