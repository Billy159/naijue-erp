/** Actual driver/leaf and read SQL projection, scripted only; no engine or release. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCatalogueMaintenanceUnitOfWork } from "../adapters/postgres/src/catalogue-maintenance-store.ts";
import type { CategoryOrderWriteCapability } from "../adapters/postgres/src/catalogue-maintenance-store.ts";
import type { MaintenancePgContext } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { createCatalogueMaintenanceService } from "../packages/application/src/catalogue-maintenance-service.ts";
import { PostgresCatalogueSettingsReadReader } from "../adapters/postgres/src/catalogue-settings-read-reader.ts";
import { PostgresProductQueryReader } from "../adapters/postgres/src/product-query-reader.ts";
import { PostgresProductDetailsQueryReader } from "../adapters/postgres/src/product-details-query-reader.ts";
import { PostgresProductManagementQueryReader } from "../adapters/postgres/src/product-management-query-reader.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("category", n), target = id(10);
function orderStore(options: { cas?: number; invalidParent?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], originalOperation = sid("operation", 950), parent = id(99);
  const before = { parent_id: null, moved_id: id(2), undo_of_operation_id: null, rows: [{ id: id(1), version: 3, display_order: -1 }, { id: id(2), version: 4, display_order: 40 }] };
  const after = { ...before, rows: [{ id: id(1), version: 4, display_order: 1 }, { id: id(2), version: 5, display_order: 0 }] };
  const context: MaintenancePgContext = { client: { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("category-order:parent")) return { rows: options.invalidParent ? [] : [{ id: parent }], rowCount: 1 };
    if (sql.includes("category-order:siblings")) return { rows: [{ id: id(1), name: "FIRST", version: 3, parent_id: values[0], display_order: -1 }, { id: id(2), name: "SECOND", version: 4, parent_id: values[0], display_order: 40 }], rowCount: 2 };
    if (sql.includes("category-order:original")) return { rows: [{ actor_account_id: actor.accountId, result_data: { operationId: originalOperation, kind: "CATEGORY", targetId: id(1), version: 4,
      order: { parentId: null, undoOfOperationId: null, members: [{ id: id(2), version: 5, displayOrder: 0 }, { id: id(1), version: 4, displayOrder: 1 }] } }, before_values: { version: 3, display_order: -1, category_order: before }, after_values: { version: 4, display_order: 1, category_order: after } }], rowCount: 1 };
    return { rows: [], rowCount: sql.includes("category-order:update") ? options.cas ?? 1 : 0 };
  } }, evidence: { async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("Not used by leaf protocol"); } } };
  let verified = 0;
  const capability: CategoryOrderWriteCapability = { profile: "CATEGORY_ORDER_UNDO_V15", async assertReady(actual) { assert.equal(actual, context); verified++; } };
  const driver = { async transaction<T>(work: (c: MaintenancePgContext) => Promise<T>) { return work(context); } };
  return { uow: new PostgresCatalogueMaintenanceUnitOfWork(driver, capability), driver, context, calls, parent, originalOperation, verified: () => verified };
}
test("v15 catalogue leaf: same-context proof and complete stable sibling locks precede order-only CAS, without nested transactions", async () => {
  const f = orderStore();
  await f.uow.transaction(async tx => {
    await tx.lockDirectory(); await tx.categoryOrder!.assertReady();
    const rows = await tx.categoryOrder!.loadSiblings(null); assert.equal(rows.length, 2); assert.equal(rows[0]!.parentId, null);
    const changed = { ...rows[0]!, displayOrder: 1, version: 4 };
    await tx.categoryOrder!.put(rows[0]!, changed);
    await assert.rejects(tx.categoryOrder!.put(rows[0]!, changed), { code: "TRANSACTION_SCOPE" });
    await assert.rejects(tx.load("CATEGORY", rows[0]!.id), { code: "TRANSACTION_SCOPE" });
    await assert.rejects(tx.categoryOrder!.put(rows[1]!, { ...rows[1]!, name: "INJECT", displayOrder: 0, version: 5 }), { code: "TRANSACTION_SCOPE" });
  });
  assert.equal(f.verified(), 1);
  const locked = f.calls.find(c => c.sql.includes("category-order:siblings"))!;
  assert.deepEqual(locked.values, [null, 5001]); assert.match(locked.sql, /parent_id IS NOT DISTINCT FROM \$1::uuid AND deleted_at IS NULL/); assert.match(locked.sql, /ORDER BY id LIMIT \$2 FOR UPDATE/);
  const update = f.calls.find(c => c.sql.includes("category-order:update"))!;
  assert.deepEqual(update.values, [id(1), 1, 4, 3, null, -1]); assert.match(update.sql, /SET display_order=\$2,version=\$3/); assert.doesNotMatch(update.sql, /SET name|SET parent_id/);
  assert.ok(f.calls.every(c => !/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(c.sql)));
});
test("v15 catalogue leaf: non-root parent and original same-actor immutable audit/receipt are exact, failed CAS refuses", async () => {
  const f = orderStore();
  await f.uow.transaction(async tx => {
    await tx.lockDirectory(); await tx.categoryOrder!.assertReady();
    const original = await tx.categoryOrder!.loadOriginal(f.originalOperation, actor.accountId);
    assert.equal(original!.before.rows[0]!.display_order, -1); assert.equal(original!.after.rows[1]!.version, 5);
    const rows = await tx.categoryOrder!.loadSiblings(f.parent); assert.ok(rows.every(r => r.parentId === f.parent));
  });
  const original = f.calls.find(c => c.sql.includes("category-order:original"))!;
  assert.deepEqual(original.values, [f.originalOperation, actor.accountId]); assert.match(original.sql, /r.actor_account_id=\$2::uuid/); assert.match(original.sql, /r.action='REORDER' AND r.status='COMMITTED'/); assert.match(original.sql, /a.object_id=r.target_id/);
  const g = orderStore({ cas: 0 });
  await assert.rejects(g.uow.transaction(async tx => { await tx.lockDirectory(); await tx.categoryOrder!.assertReady(); const rows = await tx.categoryOrder!.loadSiblings(null); await tx.categoryOrder!.put(rows[0]!, { ...rows[0]!, displayOrder: 1, version: 4 }); }), { code: "CATEGORY_ORDER_CONFLICT" });
});
test("v15 catalogue leaf: old driver has no new capability, a flag is rejected and expired callbacks cannot write", async () => {
  const f = orderStore();
  await new PostgresCatalogueMaintenanceUnitOfWork(f.driver).transaction(async tx => { assert.equal(tx.categoryOrder, undefined); });
  const flag = new PostgresCatalogueMaintenanceUnitOfWork(f.driver, { profile: "CATEGORY_ORDER_UNDO_V15", assertReady: (async () => true) as never });
  await assert.rejects(flag.transaction(async tx => { await tx.lockDirectory(); await tx.categoryOrder!.assertReady(); }), { code: "CATALOGUE_ORDER_NOT_READY" });
  let escaped: (() => Promise<void>) | undefined;
  await f.uow.transaction(async tx => { await tx.lockDirectory(); escaped = () => tx.categoryOrder!.assertReady(); });
  await assert.rejects(escaped!(), { code: "TRANSACTION_SCOPE" }); assert.ok(f.calls.every(c => !c.sql.includes("category-order:update")));
});
function setup(options: { reference?: boolean; duplicate?: boolean; cycle?: boolean; role?: string; receiptFault?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = []; let sequence = 600;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,name,version")) return { rows: [{ id: target, name: "SOURCE", version: 3, deleted_at: null, parent_id: null, display_order: 0, code: "001", enabled: true }], rowCount: 1 };
    if (sql.includes("category-depth:subtree")) return { rows: [{ id: target, depth: 0, cyclic: false }], rowCount: 1 };
    if (sql.startsWith("WITH RECURSIVE ancestors")) return { rows: [{ id: options.cycle ? target : id(20), parent_id: null, retained: true, cyclic: false }], rowCount: 1 };
    if (sql.includes(" AS duplicate")) return { rows: [{ duplicate: options.duplicate ?? false }], rowCount: 1 };
    if (sql.includes(" AS referenced")) return { rows: [{ referenced: options.reference ?? false }], rowCount: 1 };
    if (sql.includes("maintenance:audit")) return { rows: [], rowCount: 1 };
    if (sql.includes("maintenance:complete")) { if (options.receiptFault) throw Error("SYNTHETIC RECEIPT FAILURE"); return { rows: [{ result_data: JSON.parse(values[7] as string) as unknown }], rowCount: 1 }; }
    return { rows: [], rowCount: sql.startsWith("UPDATE") || sql.startsWith("INSERT") ? 1 : 0 };
  }, release() {} }; } });
  return { calls, service: createCatalogueMaintenanceService({ unitOfWork: new PostgresCatalogueMaintenanceUnitOfWork(driver), now: () => "2026-10-22T08:00:00Z", newId: kind => sid(kind, sequence++) }) };
}
test("catalogue PG protocol: category path/cycle and same-level names use serialized actual native identities", async () => {
  const command = { action: "EDIT", requestKey: "edit", id: target, expectedVersion: 3, values: { name: "RENAMED", parentId: id(20), displayOrder: 4 } };
  for (const [options, code] of [[{ cycle: true }, "CATEGORY_CYCLE"], [{ duplicate: true }, "CATALOGUE_NAME_CONFLICT"], [{ role: "SALESPERSON" }, "FORBIDDEN"]] as const) {
    const f = setup(options); await assert.rejects(f.service.execute(actor, "CATEGORY", command), { code }); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.calls.some(c => c.sql.startsWith("UPDATE")));
  }
  const f = setup(), result = await f.service.execute(actor, "CATEGORY", command); assert.equal(result.version, 4); assert.equal(f.calls[1]!.values[0], "naijue:catalogue-maintenance"); assert.equal(f.calls.at(-1)!.sql, "COMMIT");
  assert.deepEqual(f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.product_category"))!.values, [target, "RENAMED", 4, null, id(20), 4, 3]);
});
test("catalogue PG protocol: deletion retains root/FKs, checks real references and fails whole transaction on receipt error", async () => {
  const command = { action: "DELETE", requestKey: "delete", id: target, expectedVersion: 3 };
  for (const kind of ["CATEGORY", "COLOR", "FIT"] as const) {
    const rejected = setup({ reference: true }); await assert.rejects(rejected.service.execute(actor, kind, command), { code: "CATALOGUE_IN_USE" }); assert.ok(!rejected.calls.some(c => c.sql.startsWith("UPDATE")));
    const f = setup(); await f.service.execute(actor, kind, command); assert.ok(f.calls.every(c => !c.sql.startsWith("DELETE FROM"))); const update = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp."))!; assert.match(update.sql, /version=\$7 AND deleted_at IS NULL/); assert.equal(update.values[3], "2026-10-22T08:00:00Z");
    const audit = f.calls.find(c => c.sql.includes("maintenance:audit"))!; assert.deepEqual(JSON.parse(audit.values[8] as string), { version: 4, deleted_at: "2026-10-22T08:00:00Z" });
  }
  const f = setup({ receiptFault: true }); await assert.rejects(f.service.execute(actor, "COLOR", command)); assert.ok(f.calls.some(c => c.sql.startsWith("UPDATE"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
});
test("retained-delete read projection: directory, product list and six drawer reads filter real deleted_at in SQL", async () => {
  const calls: string[] = []; const pool = { async connect() { return { async query(sql: string) { calls.push(sql);
    const rows: Record<string, unknown>[] = sql.includes("product-management:count") ? [{ exact_total: "0", invalid_category_tree: false }] : sql.startsWith("SELECT count(*)") ? [{ total: "0" }] : [];
    return { rows, rowCount: rows.length };
  }, release() {} }; } }, signal = new AbortController().signal, productId = sid("product", 100), imageId = sid("product", 101);
  const retained = { profile: "catalogue-retained-delete-v22" as const, assertVerified(actual: object) { assert.equal(actual, pool); } };
  const directory = new PostgresCatalogueSettingsReadReader(pool, retained);
  await directory.readCategories({ actor, signal, grant: { kind: "categories", operation: "tree", productCounts: "ALL" }, intent: { kind: "categories", operation: "tree", parameters: {} } });
  for (const kind of ["colors", "fits"] as const) await directory[kind === "colors" ? "readColors" : "readFits"]({ actor, signal, grant: { kind, operation: "list" }, intent: { kind, operation: "list", parameters: { search: "", page: 1, pageSize: 20 } } });
  const reader = new PostgresProductQueryReader(pool, retained), read = { actor, signal, grant: { productId }, parameters: { productId } };
  for (const method of ["readBasics", "readSpecifications", "readImages"] as const) assert.equal(await reader[method](read), null);
  assert.equal(await reader.readImage({ ...read, parameters: { productId, imageId } }), null);
  const details = new PostgresProductDetailsQueryReader(pool, retained);
  assert.equal(await details.readPrices({ actor, signal, parameters: { productId }, intent: { kind: "prices", parameters: { productId } }, grant: { kind: "prices", productId } }), null);
  assert.equal(await details.readBarcodes({ actor, signal, parameters: { productId, page: 1, pageSize: 20 }, intent: { kind: "barcodes", parameters: { productId, page: 1, pageSize: 20 } }, grant: { kind: "barcodes", productId } }), null);
  const management = new PostgresProductManagementQueryReader(pool, retained);
  assert.equal((await management.readList({ actor, signal, grant: { kind: "all", totalStock: "unavailable" }, parameters: { page: 1, pageSize: 100, filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] } } })).exactTotal, 0);
  const selects = calls.filter(sql => sql.startsWith("SELECT") || sql.startsWith("/* product-management:")); assert.ok(selects.length >= 12); for (const sql of selects) assert.match(sql, /deleted_at IS NULL/);
  assert.ok(!calls.some(sql => /inventory_balance|inventory_ledger|DELETE FROM|UPDATE naijue/.test(sql)));
});
