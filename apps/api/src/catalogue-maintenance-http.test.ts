/** Synthetic HTTP contract, no listener or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createCatalogueMaintenanceHttpPlugin } from "./catalogue-maintenance-http.ts";
import { PostgresCatalogueMaintenanceUnitOfWork } from "../../../adapters/postgres/src/catalogue-maintenance-store.ts";
import { maintenanceContextClient, PostgresMaintenanceCommandUnitOfWork } from "../../../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { PgSalesClient, PgSalesPool } from "../../../adapters/postgres/src/sales-unit-of-work.ts";
import type { CatalogueMaintenanceDependencies, CategoryOrderResult, CategoryWriteRecord } from "../../../packages/application/src/catalogue-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../../../packages/application/src/maintenance-commit-ports.ts";
import { checkedCategoryOrderEvidence, checkedCategoryOrderResult } from "../../../packages/application/src/catalogue-maintenance-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
test("v15 receipt recovery integration: original directory lock precedes identity/key locks through real service, store and shared UOW", async t => {
  const calls: { sql: string; values: unknown[] }[] = [], releases: (Error | boolean | undefined)[] = [];
  const operationId = sid("operation", 2050), first = sid("category", 2051), second = sid("category", 2052), key = "committed-order";
  const result: CategoryOrderResult = { operationId, kind: "CATEGORY", targetId: first, version: 4,
    order: { parentId: null, undoOfOperationId: null, members: [{ id: second, version: 5, displayOrder: 0 }, { id: first, version: 4, displayOrder: 1 }] } };
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push({ sql, values: structuredClone(values) }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("maintenance:identity")) rows = [{ account_id: actor.accountId, staff_id: sid("staff", 2053), login_enabled: true, employment_status: "在职", role: "ADMIN", hall_id: actor.hallId }];
    if (sql.includes("maintenance:hall")) rows = [{ id: actor.hallId, enabled: true }];
    if (sql.includes("maintenance:receipt")) rows = [{ id: operationId, request_hash: "a".repeat(64), action: "REORDER", target_type: "CATEGORY", target_id: first, result_data: result, completed_at: "2026-10-24T03:00:00.000000Z" }];
    return { rows, rowCount: rows.length };
  }, release(error) { releases.push(error); } };
  const pool: PgSalesPool = { async connect() { return client; } };
  let capChecks = 0;
  const dependencies: CatalogueMaintenanceDependencies = {
    unitOfWork: new PostgresCatalogueMaintenanceUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool), { profile: "CATEGORY_ORDER_UNDO_V15", async assertReady(context) {
      assert.equal(maintenanceContextClient(context, pool), client); capChecks++;
    } }), now() { throw Error("Receipt cannot create a new completion time"); }, newId() { throw Error("Receipt cannot allocate a new operation"); }
  };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies, categoryOnly: true }));
  const response = await app.inject({ method: "GET", url: `/catalogue/categories/receipts/${key}` });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { requestKey: key, action: "REORDER", status: "COMMITTED", completedAt: "2026-10-24T03:00:00.000000Z", result });
  assert.equal(capChecks, 1); assert.equal(calls[0]!.sql, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.deepEqual(calls[1]!.values, ["naijue:catalogue-maintenance"]);
  const identityIndex = calls.findIndex(c => c.sql.includes("maintenance:identity")), keyIndex = calls.findIndex(c => typeof c.values[0] === "string" && c.values[0].startsWith("naijue:receipt:"));
  assert.ok(identityIndex > 1 && keyIndex > 1); assert.equal(calls.at(-1)!.sql, "COMMIT");
  assert.ok(calls.every(c => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b|ROLLBACK/.test(c.sql))); assert.deepEqual(releases, [undefined]);
  assert.equal(response.headers["cache-control"], "no-store"); assert.equal(app.server.listening, false);
});
function orderDependencies(ready = true) {
  const a = sid("category", 2100), b = sid("category", 2101);
  const rows = new Map<string, CategoryWriteRecord>([[a, { id: a, kind: "CATEGORY", name: "A", parentId: null, displayOrder: -1, version: 2, deletedAt: null }], [b, { id: b, kind: "CATEGORY", name: "B", parentId: null, displayOrder: 40, version: 3, deletedAt: null }]]);
  const receipts = new Map<string, MaintenanceReceipt>(), audits = new Map<string, MaintenanceCompletion>(); let seq = 3000, allow = true;
  const dependencies: CatalogueMaintenanceDependencies = { now: () => "2026-10-24T03:00:00Z", newId: kind => sid(kind, seq++), unitOfWork: { async transaction(work) { return work({
    async lockDirectory() {}, async load() { return undefined; }, async validateChange() {}, async assertUnreferenced() {}, async put() {},
    evidence: { async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt(_actor, key) { return receipts.get(key); }, async prepare(c) { audits.set(c.operationId, c); },
      async complete(c) { const base = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion };
        let result = base;
        if (c.action === "REORDER" || c.action === "UNDO_REORDER") { const e = checkedCategoryOrderEvidence(c.afterValues.category_order);
          result = { ...base, kind: "CATEGORY", order: { parentId: e.parent_id, undoOfOperationId: e.undo_of_operation_id, members: e.rows.map(r => ({ id: r.id, version: r.version, displayOrder: r.display_order })).sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)) } } as CategoryOrderResult;
        }
        receipts.set(c.requestKey, { requestHash: c.requestHash, action: c.action, result, completedAt: c.completedAt }); return result;
      } },
    ...(ready ? { categoryOrder: { async assertReady() {}, async loadSiblings() { return structuredClone([...rows.values()]); },
      async loadOriginal(operation: string, account: string) { const c = audits.get(operation); if (!c || c.action !== "REORDER" || c.actorAccountId !== account) return undefined;
        return { actorAccountId: account, result: checkedCategoryOrderResult(receipts.get(c.requestKey)!.result), before: checkedCategoryOrderEvidence(c.beforeValues!.category_order), after: checkedCategoryOrderEvidence(c.afterValues.category_order) }; },
      async put(_previous: CategoryWriteRecord, next: CategoryWriteRecord) { rows.set(next.id, next); }
    } } : {})
  }); } } };
  return { dependencies, rows, a, b, revoke() { allow = false; } };
}
test("v15 catalogue HTTP categoryOnly: one original category surface is mounted without color/fit routes or readiness shortcuts", async t => {
  const f = orderDependencies(false), app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies, categoryOnly: true }));
  const command = { action: "REORDER", requestKey: "selected-order", parentId: null, movedId: f.b, expectedSiblings: [{ id: f.a, expectedVersion: 2 }, { id: f.b, expectedVersion: 3 }], orderedIds: [f.b, f.a] };
  const category = await app.inject({ method: "POST", url: "/catalogue/categories/commands", payload: command });
  assert.equal(category.statusCode, 503, category.body); assert.equal(category.json().error.code, "CATALOGUE_ORDER_NOT_READY");
  assert.equal((await app.inject({ method: "GET", url: "/catalogue/categories/receipts/missing" })).statusCode, 404);
  for (const family of ["colors", "fits"]) {
    assert.equal((await app.inject({ method: "POST", url: `/catalogue/${family}/commands`, payload: { action: "CREATE", requestKey: "hidden", values: { name: "C", code: "A", enabled: true } } })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: `/catalogue/${family}/receipts/missing` })).statusCode, 404);
  }
  const legacy = Fastify({ logger: false }); t.after(() => legacy.close());
  legacy.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies }));
  const normal = await legacy.inject({ method: "POST", url: "/catalogue/colors/commands", payload: { action: "CREATE", requestKey: "legacy-color", values: { name: "C", code: "001", enabled: true } } });
  assert.equal(normal.statusCode, 200, normal.body); assert.deepEqual(Object.keys(normal.json()).sort(), ["kind", "operationId", "targetId", "version"]);
  assert.throws(() => createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies, categoryOnly: false } as never), /explicitly true/);
});
test("v15 catalogue HTTP: new category results and original-key receipts are paired; old actions remain exact four keys", async t => {
  const f = orderDependencies(), app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies }));
  const command = { action: "REORDER", requestKey: "http-order", parentId: null, movedId: f.b, expectedSiblings: [{ id: f.a, expectedVersion: 2 }, { id: f.b, expectedVersion: 3 }], orderedIds: [f.b, f.a] };
  const response = await app.inject({ method: "POST", url: "/catalogue/categories/commands", payload: command });
  assert.equal(response.statusCode, 200, response.body); assert.deepEqual(Object.keys(response.json()).sort(), ["kind", "operationId", "order", "targetId", "version"]);
  assert.deepEqual(response.json().order.members.map((r: { id: string }) => r.id), [f.b, f.a]); assert.equal(response.headers["cache-control"], "no-store");
  const receipt = await app.inject({ method: "GET", url: "/catalogue/categories/receipts/http-order" });
  assert.equal(receipt.statusCode, 200, receipt.body); assert.deepEqual(receipt.json().result, response.json());
  const undo = await app.inject({ method: "POST", url: "/catalogue/categories/commands", payload: { action: "UNDO_REORDER", requestKey: "http-undo", originalOperationId: response.json().operationId, expectedSiblings: response.json().order.members.map((r: { id: string; version: number }) => ({ id: r.id, expectedVersion: r.version })) } });
  assert.equal(undo.statusCode, 200, undo.body); assert.deepEqual(undo.json().order.members.map((r: { displayOrder: number }) => r.displayOrder), [-1, 40]);
  const old = await app.inject({ method: "POST", url: "/catalogue/colors/commands", payload: { action: "CREATE", requestKey: "old", values: { name: "C", code: "001", enabled: true } } });
  assert.equal(old.statusCode, 200, old.body); assert.deepEqual(Object.keys(old.json()).sort(), ["kind", "operationId", "targetId", "version"]);
  f.revoke(); assert.equal((await app.inject({ method: "GET", url: "/catalogue/categories/receipts/http-order" })).statusCode, 403); assert.equal(app.server.listening, false);
});
test("v15 catalogue HTTP: category-only 1MiB budget, strict new bodies, explicit not-ready and conflict statuses", async t => {
  const f = orderDependencies(false), app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies }));
  const expectedSiblings = Array.from({ length: 200 }, (_, i) => ({ id: sid("category", 4000 + i), expectedVersion: 1 })), orderedIds = expectedSiblings.map(r => r.id);
  const command = { action: "REORDER", requestKey: "large", parentId: null, movedId: orderedIds[199], expectedSiblings, orderedIds: [orderedIds[199], ...orderedIds.slice(0, 199)] };
  assert.ok(Buffer.byteLength(JSON.stringify(command)) > 8192);
  const response = await app.inject({ method: "POST", url: "/catalogue/categories/commands", payload: command });
  assert.equal(response.statusCode, 503, response.body); assert.equal(response.json().error.code, "CATALOGUE_ORDER_NOT_READY");
  for (const family of ["colors", "fits"]) assert.equal((await app.inject({ method: "POST", url: `/catalogue/${family}/commands`, payload: command })).statusCode, 413);
  const bad = await app.inject({ method: "POST", url: "/catalogue/categories/commands", payload: { ...command, actor } }); assert.equal(bad.statusCode, 400);
  const conflict = orderDependencies(), other = Fastify({ logger: false }); t.after(() => other.close());
  other.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => actor, dependencies: conflict.dependencies }));
  const stale = await other.inject({ method: "POST", url: "/catalogue/categories/commands", payload: command });
  assert.equal(stale.statusCode, 409, stale.body); assert.equal(stale.json().error.code, "CATEGORY_ORDER_CONFLICT");
});
test("catalogue HTTP: exact three families, current denial, original receipt and no extra mutation surfaces", async t => {
  let sequence = 100, loggedIn = true, allow = true;
  const dependencies: CatalogueMaintenanceDependencies = { now: () => "2026-10-22T08:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({
    async lockDirectory() {}, evidence: { async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt() { return undefined; }, async complete(c) { return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; } },
    async load() { return undefined; }, async validateChange() {}, async assertUnreferenced() {}, async put() {}
  }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  for (const [prefix, values, kind] of [["categories", { name: "C", parentId: null, displayOrder: 0 }, "CATEGORY"], ["colors", { name: "C", code: "001", enabled: true }, "COLOR"], ["fits", { name: "F", code: "A", enabled: true }, "FIT"]] as const) {
    const response = await app.inject({ method: "POST", url: `/catalogue/${prefix}/commands`, payload: { action: "CREATE", requestKey: `create-${prefix}`, values } }); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().kind, kind); assert.equal(response.headers["cache-control"], "no-store"); assert.equal((await app.inject({ method: "GET", url: `/catalogue/${prefix}/receipts/missing` })).statusCode, 404);
  }
  assert.equal((await app.inject({ method: "POST", url: "/catalogue/seasons/commands", payload: {} })).statusCode, 404);
  const payload = { action: "CREATE", requestKey: "create", values: { name: "F", code: "A", enabled: true } };
  assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload: { ...payload, actor } })).statusCode, 400);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload })).statusCode, 403); loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
