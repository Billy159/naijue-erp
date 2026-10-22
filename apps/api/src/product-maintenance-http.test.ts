/** Synthetic HTTP/application composition. No listener, real account or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createProductMaintenanceHttpPlugin } from "./product-maintenance-http.ts";
import type { ProductAggregate, ProductMaintenanceCommand, ProductMaintenanceDependencies, ProductMaintenanceEvidence, ProductWriteValues } from "../../../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
const id = (n: number) => sid("product", n);
const values: ProductWriteValues = { productCode: "SYNTHETIC_01", name: "SYNTHETIC", categoryId: id(1), supplierId: id(2), seasonId: id(3), sizeGroupId: id(4),
  year: 2026, systemItemCode: "00001", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: id(5), enabled: true,
  prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, k === "retail_price" ? "0.00" : null])) as ProductWriteValues["prices"] };
const command: ProductMaintenanceCommand = { action: "CREATE", requestKey: "synthetic-http-create", values,
  skus: [{ id: null, expectedVersion: null, skuCode: "EXACT-SKU", colorId: id(6), fitId: id(7), sizeId: id(8), enabled: true }], barcodes: [] };
test("product maintenance HTTP: save/replay/original receipt traverses the actual application and rejects authority/client fields", async t => {
  let p: ProductAggregate | undefined, seq = 100, writes = 0, active = true, granted = true;
  const receipts = new Map<string, NonNullable<Awaited<ReturnType<ProductMaintenanceEvidence["getReceipt"]>>>>();
  const dependencies: ProductMaintenanceDependencies = { newId: kind => sid(kind, seq++), now: () => "2026-10-22T06:00:00Z", unitOfWork: {
    async transaction(work) { return work({ evidence: {
      async assertAllowed() { if (!granted) throw new DomainError("FORBIDDEN", "PRIVATE_POLICY"); }, async getReceipt(_actor, key) { return receipts.get(key); },
      async prepare() {}, async complete(c) { const result = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion };
        receipts.set(c.requestKey, { requestHash: c.requestHash, action: c.action, result, completedAt: c.completedAt }); return result; }
    }, async load(target) { return p?.product.id === target ? p : undefined; },
    async readReferences(root) { return { categoryPath: [{ id: root.categoryId, name: "SYNTHETIC CATEGORY" }], sizeGroup: { id: root.sizeGroupId, name: "SYNTHETIC GROUP" },
      supplier: root.supplierId === null ? null : { id: root.supplierId, name: "SYNTHETIC SUPPLIER", enabled: true }, season: root.seasonId === null ? null : { id: root.seasonId, name: "SYNTHETIC SEASON" },
      defaultBarcodeScheme: root.defaultBarcodeSchemeId === null ? null : { id: root.defaultBarcodeSchemeId, name: "SYNTHETIC SCHEME", ruleVersion: "1", status: "CURRENT" as const } }; },
    async readCandidates(q) { return { kind: q.kind, page: q.page, pageSize: q.pageSize, total: 0, items: [] }; },
    async validateReferences() {}, async assertCanDelete() {},
    async putProduct(product) { writes++; p = { product, skus: [], barcodes: [] }; }, async putSku(s) { writes++; p = { ...p!, skus: [...p!.skus, s] }; }, async putBarcode() {} }); }
  } };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductMaintenanceHttpPlugin({ authenticate: async () => active ? actor : null, dependencies })); await app.ready();
  const post = (payload: unknown, suffix = "") => app.inject({ method: "POST", url: `/products/commands${suffix}`, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } });
  const saved = await post(command); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().kind, "PRODUCT"); assert.equal(saved.headers["cache-control"], "no-store");
  assert.deepEqual((await post(command)).json(), saved.json()); assert.equal(writes, 2);
  const detail = await app.inject({ method: "POST", url: "/products/maintenance/detail/query", payload: { productId: saved.json().targetId } });
  assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().values.defaultBarcodeSchemeId, values.defaultBarcodeSchemeId);
  assert.equal(detail.json().skus[0].expectedVersion, 1); assert.ok(!Object.hasOwn(detail.json().skus[0], "createdOperationId"));
  assert.equal(detail.json().references.categoryPath[0].id, values.categoryId);
  const candidates = await app.inject({ method: "POST", url: "/products/maintenance/candidates/query", payload: { kind: "categories", search: "", page: 1, pageSize: 20 } });
  assert.equal(candidates.statusCode, 200); assert.equal(candidates.json().kind, "categories");
  const receipt = await app.inject(`/products/receipts/${command.requestKey}`); assert.equal(receipt.statusCode, 200); assert.deepEqual(receipt.json().result, saved.json());
  assert.equal((await post({ ...command, values: { ...values, name: "CHANGED" } })).statusCode, 409);
  assert.equal((await post({ ...command, actor })).statusCode, 400); assert.equal((await post(command, "?hallId=x")).statusCode, 400);
  granted = false; const denied = await post(command); assert.equal(denied.statusCode, 403); assert.doesNotMatch(denied.body, /PRIVATE_POLICY/);
  active = false; assert.equal((await post(command)).statusCode, 401); assert.equal(app.server.listening, false);
});
