/** Synthetic HTTP/application composition. No listener, real account or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createProductMaintenanceHttpPlugin } from "./product-maintenance-http.ts";
import type { ProductAggregate, ProductMaintenanceCommand, ProductMaintenanceDependencies, ProductMaintenanceEvidence, ProductWriteValues } from "../../../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
import { PostgresProductMaintenanceUnitOfWork } from "../../../adapters/postgres/src/product-maintenance-store.ts";
const id = (n: number) => sid("product", n);
test("W15 richer images HTTP returns exact F2 metadata and distinguishes real empty, denied, missing and failed", async t => {
  let mode = "image", reads = 0; const unused = async (): Promise<never> => { throw Error("UNEXPECTED_WRITE"); };
  const dependencies: ProductMaintenanceDependencies = { now: () => "UNUSED", newId: () => "UNUSED", unitOfWork: new PostgresProductMaintenanceUnitOfWork({ async transaction(work) {
    return work({ evidence: { async assertAllowed() { if (mode === "denied") throw new DomainError("FORBIDDEN", "PRIVATE_ROLE"); }, getReceipt: unused, complete: unused }, client: { async query() {
      reads++; if (mode === "failure") throw Error("PRIVATE_SQL");
      const rows = mode === "missing" ? [] : [{ id: id(12001), version: 7, images: mode === "empty" ? [] : [{ id: id(12002), product_id: id(12001), version: 3, image_role: null, color_id: null, file_ref: "PRIVATE_FILE", display_order: 0, mime: "image/png", byte_size: "68", created_at: "2026-10-22T00:00:00.123456Z", created_by_account_id: null, valid_color: true }] }];
      return { rows, rowCount: rows.length };
    } } });
  } }, { deletionGuard: null }) };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createProductMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies }));
  const send = (payload: unknown = { productId: id(12001) }) => app.inject({ method: "POST", url: "/products/maintenance/images/query", payload: JSON.stringify(payload), headers: { "content-type": "application/json" } });
  const response = await send(); assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.json()).sort(), ["images", "productId", "version"]); assert.deepEqual(Object.keys(response.json().images[0]).sort(), ["byteSize", "colorId", "createdAt", "createdByAccountId", "displayOrder", "id", "mime", "role", "thumbnailState", "thumbnailUrl", "version"].sort());
  assert.equal(response.json().images[0].thumbnailState, "UNAVAILABLE"); assert.equal(response.json().images[0].role, null); assert.doesNotMatch(response.body, /PRIVATE|fileRef/);
  assert.equal((await send({ productId: id(12001), actor })).statusCode, 400);
  mode = "empty"; assert.deepEqual((await send()).json().images, []);
  for (const [next, status] of [["denied", 403], ["missing", 404], ["failure", 500]] as const) {
    mode = next; const before = reads, r = await send(); assert.equal(r.statusCode, status); assert.doesNotMatch(r.body, /PRIVATE|"images"/); if (next === "denied") assert.equal(reads, before);
  }
});
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

test("season v2 HTTP: new routes require verified contract; old editor upgrade and malformed bodies use bounded sanitized errors", async t => {
  let ready = false, active = true;
  const unitOfWork: ProductMaintenanceDependencies["unitOfWork"] = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("No write"); }
  }, async load() { throw Error("Must stop before load"); }, async readReferences() { throw Error("Must stop before refs"); },
  async readCandidates(q) { return { ...q, total: 0, items: [] }; }, async validateReferences() {}, async assertCanDelete() {}, async putProduct() { throw Error("No write"); }, async putSku() {}, async putBarcode() {} }); } };
  Object.defineProperty(unitOfWork, "seasonContract", { get: () => ready ? "product-season-array-v1" : undefined });
  const dependencies = { unitOfWork, now: () => "unused", newId: () => "unused" };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createProductMaintenanceHttpPlugin({ authenticate: async () => active ? actor : null, dependencies })); await app.ready();
  const { seasonId: _scalar, ...data } = values, v2 = { ...command, values: { ...data, seasonIds: [] } };
  const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } });
  for (const [url, body] of [["/products/v2/commands", v2], ["/products/maintenance/v2/detail/query", { productId: id(1) }]] as const) {
    const result = await post(url, body); assert.equal(result.statusCode, 503, result.body); assert.equal(result.json().error.code, "PRODUCT_SEASON_NOT_READY"); assert.equal(result.headers["cache-control"], "no-store");
  }
  assert.equal((await post("/products/v2/commands", { ...v2, values: { ...v2.values, seasonIds: [null] } })).statusCode, 400);
  assert.equal((await post("/products/v2/commands?seasonIds=x", v2)).statusCode, 400);
  ready = true;
  for (const [url, body] of [["/products/commands", command], ["/products/maintenance/detail/query", { productId: id(1) }]] as const) {
    const result = await post(url, body); assert.equal(result.statusCode, 409, result.body); assert.equal(result.json().error.code, "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED");
  }
  active = false; assert.equal((await post("/products/v2/commands", v2)).statusCode, 401); assert.equal(app.server.listening, false);
});
