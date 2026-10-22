/** D2 leaf SQL protocol only; D1 owns actual transaction/receipt/audit execution and schema. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresProductMaintenanceUnitOfWork } from "../adapters/postgres/src/product-maintenance-store.ts";
import type { PgProductMaintenanceDriver } from "../adapters/postgres/src/product-maintenance-store.ts";
import { createProductMaintenanceService } from "../packages/application/src/product-maintenance-service.ts";
import type { ProductMaintenanceCommand, ProductMaintenanceDependencies } from "../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("product", n);
const command: ProductMaintenanceCommand = { action: "CREATE", requestKey: "leaf-create", values: {
  productCode: "REAL-CODE-0001", name: "SYNTHETIC", categoryId: id(1), supplierId: id(2), sizeGroupId: id(3), seasonId: id(4), year: 2026,
  systemItemCode: "0000123", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: id(5), enabled: true,
  prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, k === "retail_price" ? "0.00" : null])) as Extract<ProductMaintenanceCommand, { action: "CREATE" }>["values"]["prices"]
}, skus: [{ id: null, expectedVersion: null, skuCode: "0001-A", colorId: id(6), fitId: id(7), sizeId: id(8), enabled: true }],
barcodes: [{ id: null, barcode: "000012345 ", colorId: id(6), fitId: id(7), sizeId: id(8), kind: "MAIN", schemeId: id(5), enabled: true }] };
function setup(options: { badSize?: boolean; barcodeCollision?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = []; let completed = 0, seq = 900;
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async prepare() {}, async complete(c) { completed++; return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
  }, client: { async query(sql, values = []) {
    calls.push({ sql, values: structuredClone(values) }); let rows: Record<string, unknown>[] = [];
    if (/SELECT .*FROM naijue_erp.product_category/.test(sql)) rows = [{ id: id(1) }];
    else if (sql.includes("FROM naijue_erp.supplier")) rows = [{ id: id(2), enabled: true }];
    else if (sql.includes("FROM naijue_erp.size_group_member")) rows = options.badSize ? [] : [{ size_id: id(8) }];
    else if (sql.includes("FROM naijue_erp.size_group")) rows = [{ id: id(3) }];
    else if (sql.includes("FROM naijue_erp.season")) rows = [{ id: id(4) }];
    else if (sql.includes("FROM naijue_erp.barcode_scheme")) rows = [{ id: id(5) }];
    else if (sql.includes("FROM naijue_erp.color")) rows = [{ id: id(6), enabled: true, retained: true }];
    else if (sql.includes("FROM naijue_erp.fit")) rows = [{ id: id(7), enabled: true, retained: true }];
    if (options.barcodeCollision && sql.startsWith("INSERT INTO naijue_erp.sku_barcode")) throw Object.assign(Error("PRIVATE UNIQUE DETAIL"), { code: "23505" });
    return { rows, rowCount: sql.startsWith("INSERT") ? 1 : rows.length };
  } } }); } };
  const dependencies: ProductMaintenanceDependencies = { newId: kind => sid(kind, seq++), now: () => "2026-10-22T06:00:00Z",
    unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }) };
  return { service: createProductMaintenanceService(dependencies), calls, completed: () => completed };
}
test("product leaf PG: actual root/SKU/raw-barcode inserts stay in injected D1 context with explicit nullable prices and creation operation", async () => {
  const f = setup(), result = await f.service.execute(actor, command);
  const writes = f.calls.filter(c => c.sql.startsWith("INSERT")); assert.equal(writes.length, 3); assert.equal(f.completed(), 1);
  assert.match(writes[0]!.sql, /^INSERT INTO naijue_erp.product/); assert.equal(writes[0]!.values[1], "REAL-CODE-0001");
  assert.ok(writes[0]!.values.includes("0.00")); assert.ok(writes[0]!.values.includes(null));
  assert.equal(writes[1]!.values.at(-1), result.operationId); assert.equal(writes[2]!.values[1], "000012345 ");
  assert.ok(f.calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK)/.test(c.sql))); assert.ok(f.calls.every(c => !/INSERT INTO naijue_erp.(operation_receipt|audit_change|inventory_)/.test(c.sql)));
  const member = f.calls.find(c => c.sql.includes("FROM naijue_erp.size_group_member"))!; assert.deepEqual(member.values, [id(3), [id(8)]]);
});
test("product leaf PG: missing membership blocks all native writes; raw-code collision maps safely before evidence completion", async () => {
  const f = setup({ badSize: true }); await assert.rejects(f.service.execute(actor, command), { code: "PRODUCT_SIZE_GROUP_MISMATCH" });
  assert.equal(f.calls.filter(c => c.sql.startsWith("INSERT")).length, 0); assert.equal(f.completed(), 0);
  const g = setup({ barcodeCollision: true }); await assert.rejects(g.service.execute(actor, command), { code: "BARCODE_CONFLICT" }); assert.equal(g.completed(), 0);
});
test("product leaf PG: complete editable snapshot uses real IDs/versions/path; nullable product default never follows a barcode binding", async () => {
  for (const selected of [id(5), null]) {
    const targetId = id(20), skuId = id(21), queries: string[] = [];
    const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
      async assertAllowed(_actor, _kind, action) { assert.equal(action, "DETAIL"); }, async getReceipt() { return undefined; }, async complete() { throw Error("No write evidence during detail read"); }
    }, client: { async query(sql, parameters = []) {
      queries.push(sql); let rows: Record<string, unknown>[] = [];
      if (sql.includes("FROM naijue_erp.product WHERE")) rows = [{ id: targetId, product_code: "0001", name: "REAL LABEL", category_id: id(1), supplier_id: id(2), season_id: id(4),
        size_group_id: id(3), year: 2026, system_item_code: "0000123", thickness: "偏厚", collar_pants_type: "翻领", default_barcode_scheme_id: selected, enabled: true, version: 9,
        deleted_at: null, ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, null])) }];
      else if (sql.includes("FROM naijue_erp.sku WHERE")) rows = [{ id: skuId, product_id: targetId, sku_code: "0001-A", color_id: id(6), fit_id: id(7), size_id: id(8), enabled: true, version: 3, created_operation_id: null }];
      else if (sql.includes("FROM naijue_erp.sku_barcode b")) rows = [{ id: id(22), barcode: "000001", sku_id: skuId, barcode_kind: "MAIN", scheme_id: id(11), enabled: true }];
      else if (sql.includes("su.id AS supplier_id")) rows = [{ supplier_id: id(2), supplier_name: "DISABLED RETAINED SUPPLIER", supplier_enabled: false,
        season_id: id(4), season_name: "SOURCE SEASON", size_group_id: id(3), size_group_name: "SOURCE GROUP", scheme_id: selected, scheme_name: selected === null ? null : "EXPLICIT PRODUCT SCHEME",
        rule_version: selected === null ? null : "SOURCE-V1", scheme_status: selected === null ? null : "CURRENT" }];
      else if (sql.startsWith("WITH RECURSIVE category_path")) { assert.deepEqual(parameters, [id(1)]); rows = [
        { id: id(9), parent_id: null, name: "ROOT", cyclic: false }, { id: id(1), parent_id: id(9), name: "LEAF", cyclic: false }
      ]; }
      return { rows, rowCount: rows.length };
    } } }); } };
    const service = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }), now: () => "unused", newId: () => "unused" });
    const detail = await service.detail(actor, { productId: targetId });
    assert.equal(detail.version, 9); assert.equal(detail.skus[0]!.expectedVersion, 3); assert.equal(detail.values.thickness, "偏厚"); assert.equal(detail.values.collarPantsType, "翻领");
    assert.equal(detail.values.defaultBarcodeSchemeId, selected); assert.equal(detail.barcodes[0]!.schemeId, id(11)); assert.equal(detail.references.defaultBarcodeScheme?.id ?? null, selected);
    assert.deepEqual(detail.references.categoryPath.map(c => c.name), ["ROOT", "LEAF"]); assert.equal(detail.references.supplier!.enabled, false);
    assert.ok(!Object.hasOwn(detail.skus[0]!, "createdOperationId")); assert.ok(queries.every(q => !/INSERT|UPDATE naijue|DELETE|inventory_/.test(q)));
  }
});
test("product leaf PG: candidate count/page share one bounded statement and literal search never becomes SQL", async () => {
  const calls: { sql: string; values: unknown[] }[] = [], search = "%' OR 1=1 --";
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed(_actor, _kind, action) { assert.equal(action, "CANDIDATES"); }, async getReceipt() { return undefined; }, async complete() { throw Error("No writes"); }
  }, client: { async query(sql, values = []) { calls.push({ sql, values }); return { rows: [{ total: "1", items: [{ id: id(6), name: "EXACT COLOR", code: "00006", parent_id: null, version: 2 }] }], rowCount: 1 }; } } }); } };
  const service = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }), now: () => "unused", newId: () => "unused" });
  const result = await service.candidates(actor, { kind: "colors", search, page: 1, pageSize: 20 });
  assert.equal(result.items[0]!.code, "00006"); assert.equal(calls.length, 1); assert.deepEqual(calls[0]!.values, [search, 20, 0]);
  assert.ok(!calls[0]!.sql.includes(search)); assert.match(calls[0]!.sql, /m.enabled AND m.deleted_at IS NULL/); assert.match(calls[0]!.sql, /LIMIT \$2 OFFSET \$3/);
});
