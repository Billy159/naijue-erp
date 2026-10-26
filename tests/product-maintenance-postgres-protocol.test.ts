/** D2 leaf SQL protocol only; D1 owns actual transaction/receipt/audit execution and schema. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresProductMaintenanceUnitOfWork, withProductMaintenanceTransaction } from "../adapters/postgres/src/product-maintenance-store.ts";
import type { PgProductMaintenanceDriver } from "../adapters/postgres/src/product-maintenance-store.ts";
import { appendProductSkusInTransaction, createProductMaintenanceService } from "../packages/application/src/product-maintenance-service.ts";
import type { DocumentProductSkuAppendInput, ProductMaintenanceCommand, ProductMaintenanceDependencies, ProductMaintenanceTransaction } from "../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
import type { ProductMediaWriteCapability, PgProductMaintenanceContext, ProductImageColorSwapCapability } from "../adapters/postgres/src/product-maintenance-store.ts";
import type { ProductMaintenanceImageMetadata } from "../packages/application/src/product-maintenance-ports.ts";
const id = (n: number) => sid("product", n);
test("v17 selection leaf locks original group and enabled selected references and reads only complete native group members in bounded batches", async () => {
  const calls: { sql: string; values: unknown[] }[] = [], group = id(4), product = id(17001), color = id(6), fit = id(7), sizes = [id(8), id(9)];
  let invalid = false;
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: { async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("UNEXPECTED_WRITE"); } }, client: { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("product-selection:group")) rows = [{ id: group }];
    if (sql.includes("product-selection:references")) rows = (values[0] as string[]).map(id => ({ id, enabled: !invalid, retained: true }));
    if (sql.includes("product-selection:members")) rows = sizes.map(size_id => ({ size_id }));
    return { rows, rowCount: rows.length };
  } } }); } };
  const uow = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null });
  await uow.transaction(async tx => {
    await assert.rejects(tx.readSkuSelectionSizes!(product, group, { colorIds: [color], fitIds: [fit] }), { code: "TRANSACTION_SCOPE" }); assert.equal(calls.length, 0);
    assert.equal(await tx.load(product), undefined);
    assert.deepEqual(await tx.readSkuSelectionSizes!(product, group, { colorIds: [color], fitIds: [fit] }), sizes);
  });
  const members = calls.find(c => c.sql.includes("product-selection:members"))!;
  assert.deepEqual(members.values, [group, 5001]); assert.match(members.sql, /WHERE m\.size_group_id=\$1::uuid ORDER BY m\.size_id LIMIT \$2 FOR SHARE OF m,z/);
  assert.match(members.sql, /JOIN naijue_erp\.size z ON z\.id=m\.size_id/); assert.doesNotMatch(members.sql, /sku|default|CROSS JOIN/);
  assert.equal(calls.filter(c => c.sql.includes("product-selection:references")).length, 2);
  assert.ok(calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE)/.test(c.sql)));
  invalid = true; const n = calls.length;
  await assert.rejects(uow.transaction(async tx => { await tx.load(product); return tx.readSkuSelectionSizes!(product, group, { colorIds: [color], fitIds: [fit] }); }), { code: "PRODUCT_REFERENCE_UNAVAILABLE" });
  assert.ok(!calls.slice(n).some(c => c.sql.includes("product-selection:members")));
});
test("product visibility: original load gates published imports and committed births before bounds; barcodes bind only returned SKUs", async () => {
  const calls: { sql: string; values: unknown[] }[] = [], product = id(19001), sku = id(19002);
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("UNEXPECTED_WRITE"); }
  }, client: { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM naijue_erp.product WHERE")) rows = [{ id: product, product_code: "VISIBLE", name: "RETAINED", category_id: id(1), supplier_id: null, season_id: null,
      size_group_id: id(3), year: null, system_item_code: null, thickness: null, collar_pants_type: null, default_barcode_scheme_id: null, enabled: false, version: 9,
      deleted_at: null, ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, null])) }];
    else if (sql.includes("FROM naijue_erp.sku WHERE")) rows = [{ id: sku, product_id: product, sku_code: "KEEP-0001", color_id: id(6), fit_id: id(7), size_id: id(8), enabled: false, version: 3, created_operation_id: id(19003) }];
    return { rows, rowCount: rows.length };
  } } }); } };
  const result = await new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }).transaction(tx => tx.load(product));
  assert.equal(result!.product.version, 9); assert.equal(result!.skus[0]!.skuCode, "KEEP-0001"); assert.equal(result!.skus[0]!.enabled, false);
  const children = calls.filter(c => c.sql.includes("FROM naijue_erp.sku WHERE") || c.sql.includes("FROM naijue_erp.sku_barcode bc"));
  assert.equal(children.length, 2);
  for (const { sql, values } of children) {
    assert.equal(values[0], product); assert.equal(typeof values[2], "string");
    assert.match(sql, /b.status='IMPORTED'/); assert.match(sql, /HISTORY_TYPED_CLOSURE_V1/); assert.match(sql, /IMPORT_PUBLISH/);
    assert.match(sql, /f.decision_reason=\$3::text/); assert.match(sql, /pg_current_xact_id_if_assigned/);
    assert.ok(sql.indexOf("b.status='IMPORTED'") < sql.lastIndexOf(" LIMIT $2"));
    assert.doesNotMatch(sql, /BEGIN|COMMIT;|ROLLBACK|INSERT INTO|UPDATE naijue|DELETE FROM/);
  }
  assert.match(children[0]!.sql, /native_creation_operation_valid\('SKU',sku.id,sku.created_operation_id\)/);
  assert.match(children[0]!.sql, /x.source_row_id=s.id AND x.canonical_sku_id=sku.id/);
  assert.match(children[0]!.sql, /ORDER BY id LIMIT \$2 FOR UPDATE$/);
  assert.deepEqual(children[1]!.values[3], [sku]); assert.match(children[1]!.sql, /bc.sku_id=ANY\(\$4::uuid\[\]\)/);
  assert.match(children[1]!.sql, /a.before_values->'barcodes'/); assert.match(children[1]!.sql, /item-'enabled'=to_jsonb\(bc\)-'enabled'/);
  assert.match(children[1]!.sql, /ORDER BY bc.id LIMIT \$2 FOR UPDATE OF bc$/);
});
test("v19 barcode reference leaf reads actual scheme/color/fit/size codes on original locked context and refuses missing refs without writes", async () => {
  const calls: { sql: string; values: unknown[] }[] = [], product = id(19100), scheme = "0e70e45e-1a51-4d44-afe8-0002cf3fb7ef";
  let missing = false;
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("UNEXPECTED_WRITE"); }
  }, client: { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("product-barcode:scheme")) rows = [{ id: scheme, status: "CURRENT", code_length: 15 }];
    if (sql.includes("product-barcode:codes") && !missing) rows = (values[0] as string[]).map(id => ({ id, code: sql.includes("naijue_erp.fit") ? "B" : sql.includes("naijue_erp.color") ? "001" : "202" }));
    return { rows, rowCount: rows.length };
  } } }); } };
  const uow = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null });
  const sku = { id: id(19101), productId: product, skuCode: "REAL", colorId: id(6), fitId: id(7), sizeId: id(8), enabled: true, version: 1, createdOperationId: id(19102) };
  await uow.transaction(async tx => {
    await assert.rejects(tx.readBarcodeGenerationReferences!(product, scheme, [sku]), { code: "TRANSACTION_SCOPE" }); assert.equal(calls.length, 0);
    await tx.load(product); const refs = await tx.readBarcodeGenerationReferences!(product, scheme, [sku]);
    assert.deepEqual(refs.scheme, { id: scheme, status: "CURRENT", codeLength: 15 }); assert.equal(refs.colors[0]!.code, "001"); assert.equal(refs.fits[0]!.code, "B"); assert.equal(refs.sizes[0]!.code, "202");
  });
  const codeReads = calls.filter(c => c.sql.includes("product-barcode:")); assert.equal(codeReads.length, 4);
  assert.ok(codeReads.every(c => c.sql.endsWith("FOR SHARE"))); assert.deepEqual(codeReads[0]!.values, [scheme]);
  assert.deepEqual(codeReads.slice(1).map(c => c.values), [[[id(6)]], [[id(7)]], [[id(8)]]]);
  assert.ok(calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE)/.test(c.sql)));
  missing = true; await assert.rejects(uow.transaction(async tx => { await tx.load(product); return tx.readBarcodeGenerationReferences!(product, scheme, [sku]); }), { code: "PRODUCT_REFERENCE_UNAVAILABLE" });
});
test("v19 NULL native size code stays NULL through original leaf while color and fit codes remain actual text", async () => {
  const product = id(19110), scheme = "0e70e45e-1a51-4d44-afe8-0002cf3fb7ef";
  const calls: string[] = [];
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("UNEXPECTED_WRITE"); }
  }, client: { async query(sql, values = []) {
    calls.push(sql); let rows: Record<string, unknown>[] = [];
    if (sql.includes("product-barcode:scheme")) rows = [{ id: scheme, status: "CURRENT", code_length: 15 }];
    if (sql.includes("product-barcode:codes")) rows = (values[0] as string[]).map(id => ({ id, code: sql.includes("naijue_erp.size") ? null : sql.includes("naijue_erp.fit") ? "A" : "001" }));
    return { rows, rowCount: rows.length };
  } } }); } };
  await new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }).transaction(async tx => {
    await tx.load(product);
    const refs = await tx.readBarcodeGenerationReferences!(product, scheme, [{ id: id(19111), productId: product, skuCode: "NULL-SIZE", colorId: id(6), fitId: id(7), sizeId: id(8), enabled: true, version: 1, createdOperationId: id(19112) }]);
    assert.equal(refs.sizes[0]!.code, null); assert.equal(refs.colors[0]!.code, "001"); assert.equal(refs.fits[0]!.code, "A");
  });
  assert.ok(calls.every(sql => !/^(INSERT|UPDATE|DELETE)/.test(sql)));
});
function imageProtocol(options: { absent?: boolean; rows?: readonly Record<string, unknown>[]; fail?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = []; let authorized = false;
  const unused = async (): Promise<never> => { throw Error("UNEXPECTED_WRITE"); };
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: { async assertAllowed() { authorized = true; }, getReceipt: unused, complete: unused }, client: { async query(sql, values = []) {
    assert.ok(authorized); calls.push({ sql, values }); if (options.fail) throw Error("SYNTHETIC_METADATA_FAILURE");
    const rows = options.absent ? [] : [{ id: id(12001), version: 7, images: options.rows ?? [] }]; return { rows, rowCount: rows.length };
  } } }); } };
  return { calls, service: createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }), now: () => "UNUSED", newId: () => "UNUSED" }) };
}
const imageRow = () => ({ id: id(12002), product_id: id(12001), file_ref: "PRIVATE_REAL_REF", mime: "image/png", byte_size: "68", display_order: 0, version: 3, image_role: "COLOR", color_id: id(6), created_at: "2026-10-22T00:00:00.123456Z", created_by_account_id: null, valid_color: true });
function imageWriteProtocol(options: { capability?: boolean; zeroCas?: boolean; badFinal?: boolean; rejectPrepared?: boolean; cycleCount?: 2 | 3; swap?: boolean; rejectSwap?: boolean; skipReinsert?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = []; let prepared = false, reads = 0, context: PgProductMaintenanceContext;
  const row = imageRow(), rows = new Map<string, Record<string, unknown>>([[row.id, row]]), v = (command as Extract<ProductMaintenanceCommand, { action: "CREATE" }>).values;
  if (options.cycleCount) for (let n = 1; n < options.cycleCount; n++) rows.set(id(12002 + n), { ...row, id: id(12002 + n), color_id: id(6 + n), created_by_account_id: actor.accountId });
  const root = { id: id(12001), product_code: v.productCode, name: v.name, category_id: v.categoryId, supplier_id: v.supplierId, season_id: v.seasonId, size_group_id: v.sizeGroupId, year: v.year,
    system_item_code: v.systemItemCode, thickness: v.thickness, collar_pants_type: v.collarPantsType, default_barcode_scheme_id: v.defaultBarcodeSchemeId, enabled: true, version: 7, deleted_at: null, ...v.prices };
  const unused = async (): Promise<never> => { throw Error("UNEXPECTED_SHARED_WRITE"); };
  const driver: PgProductMaintenanceDriver = { async transaction(work) {
    context = { evidence: { async assertAllowed() {}, getReceipt: unused, async prepare() { calls.push({ sql: "PREPARE_ORIGINAL_AUDIT", values: [] }); prepared = true; }, complete: unused }, client: { async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("product-maintenance:locked-images")) { reads++; return { rows: [...rows.values()].map(r => options.badFinal && reads > 1 ? { ...r, display_order: 999 } : r), rowCount: rows.size }; }
      if (sql.includes("FROM naijue_erp.product WHERE")) return { rows: [root], rowCount: 1 };
      if (/^(UPDATE|INSERT|DELETE)/.test(sql)) {
        assert.ok(prepared); if (options.zeroCas) return { rows: [], rowCount: 0 };
        if (sql.startsWith("DELETE FROM naijue_erp.product_image")) rows.delete(values[0] as string);
        if (sql.startsWith("INSERT INTO naijue_erp.product_image") && options.cycleCount) {
          assert.ok([...rows.values()].every(r => r.image_role !== "COLOR" || r.color_id !== values[10]), "Immediate color uniqueness must hold on every actual row operation");
          if (options.skipReinsert) return { rows: [], rowCount: 1 }; // Fault: command reports a row but final native reread must reject it.
        }
        if (sql.startsWith("INSERT INTO naijue_erp.product_image") || sql.startsWith("UPDATE naijue_erp.product_image")) rows.set(values[0] as string, { id: values[0] as string, product_id: values[1] as string,
          file_ref: values[2] as string, mime: values[3] as string, byte_size: values[4] as string, display_order: values[5] as number, created_at: (values[6] as string).replace(/\.(\d{1,6})Z$/, (_match, digits: string) => `.${digits.padEnd(6, "0")}Z`),
          created_by_account_id: values[7] as null, version: values[8] as number, image_role: values[9] as string, color_id: values[10] as string, valid_color: true });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    } } }; return work(context);
  } };
  const proof: ProductMediaWriteCapability = { profile: "product-media-write-v22", assertVerified(target) { assert.equal(target, driver); }, async assertReady(actual) { assert.equal(actual, context); await actual.client.query("/* image-proof:original-client */ SELECT 1"); },
    async assertPrepared(actual, completion) { assert.equal(actual, context); assert.ok(prepared); assert.equal(completion.kind, "PRODUCT"); assert.ok(Array.isArray(completion.afterValues.images));
      if (options.rejectPrepared) throw Error("SYNTHETIC_D1_PRIVATE_PROOF_REJECT"); calls.push({ sql: "PROVE_ORIGINAL_PREPARED_IMAGES", values: [] }); } };
  const swapProof: ProductImageColorSwapCapability = { profile: "product-image-color-swap-v4", assertVerified(target) { assert.equal(target, driver); }, async assertReady(actual, completion) {
    assert.equal(actual, context); assert.ok(prepared); assert.equal(completion.kind, "PRODUCT");
    if (options.rejectSwap) throw Object.assign(Error("SYNTHETIC_ACTUAL_V7_GUARD_UNAVAILABLE"), { code: "PRODUCT_MEDIA_NOT_READY" });
    calls.push({ sql: "PROVE_APPROVED_ACTUAL_COLOR_SWAP_GUARD", values: [] });
  } };
  const uow = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null, ...(options.capability === false ? {} : { mediaWriteCapability: proof }), ...(options.swap ? { imageColorSwapCapability: swapProof } : {}) });
  async function write(replace: boolean) { return uow.transaction(async tx => {
    await tx.assertImageWriteReady!(); const aggregate = (await tx.load(id(12001)))!, previous = await tx.loadImages!(id(12001)), old = previous[0]!;
    const next: ProductMaintenanceImageMetadata = replace ? { ...old, version: 4, fileRef: "NEW_PRIVATE_REF", displayOrder: 2 } : { ...old, id: id(12003), version: 1, createdAt: "2026-10-22T01:00:00.000Z" };
    const facts = (i: ProductMaintenanceImageMetadata) => ({ id: i.id, product_id: i.productId, file_ref: i.fileRef, mime: i.mime, byte_size: i.byteSize.toString(), display_order: i.displayOrder, version: i.version, image_role: i.role, color_id: i.colorId, created_at: i.createdAt, created_by_account_id: i.createdByAccountId });
    const completion = { operationId: id(12100), actorAccountId: actor.accountId, requestKey: "media-protocol", requestHash: "a".repeat(64), kind: "PRODUCT" as const, action: "EDIT" as const, targetId: aggregate.product.id,
      oldVersion: 7, newVersion: 8, beforeValues: { images: [facts(old)] }, afterValues: { images: [facts(next)] }, completedAt: "2026-10-22T01:00:00Z" };
    await tx.evidence.prepare!(completion); await tx.assertImagesPrepared!(completion);
    await tx.putProduct({ ...aggregate.product, version: 8 }, aggregate.product); await tx.writeImages!([old], [next]); return next;
  }); }
  async function swap() { return uow.transaction(async tx => {
    await tx.assertImageWriteReady!(); const aggregate = (await tx.load(id(12001)))!, before = await tx.loadImages!(id(12001));
    const after = before.map((i, n) => ({ ...i, version: i.version + 1, colorId: before[(n + 1) % before.length]!.colorId }));
    const facts = (i: ProductMaintenanceImageMetadata) => ({ id: i.id, product_id: i.productId, file_ref: i.fileRef, mime: i.mime, byte_size: i.byteSize.toString(), display_order: i.displayOrder, version: i.version, image_role: i.role, color_id: i.colorId, created_at: i.createdAt, created_by_account_id: i.createdByAccountId });
    const completion = { operationId: id(12100), actorAccountId: actor.accountId, requestKey: "color-swap-protocol", requestHash: "a".repeat(64), kind: "PRODUCT" as const, action: "EDIT" as const, targetId: aggregate.product.id,
      oldVersion: 7, newVersion: 8, beforeValues: { images: before.map(facts) }, afterValues: { images: after.map(facts) }, completedAt: "2026-10-22T01:00:00Z" };
    await tx.evidence.prepare!(completion); await tx.assertImagesPrepared!(completion); await tx.assertImageColorSwapReady!(completion);
    await tx.putProduct({ ...aggregate.product, version: 8 }, aggregate.product); await tx.writeImages!(before, after); return { before, after };
  }); }
  return { calls, write, proof, swapProof, driver, swap };
}
test("W18 cycle SQL locks original rows, proves approved guard then deletes all cycle rows before same-ID final inserts", async () => {
  for (const cycleCount of [2, 3] as const) {
    const f = imageWriteProtocol({ cycleCount, swap: true }), result = await f.swap(), index = (s: string) => f.calls.findIndex(c => c.sql.includes(s));
    assert.ok(index("PROVE_ORIGINAL_PREPARED_IMAGES") < index("PROVE_APPROVED_ACTUAL_COLOR_SWAP_GUARD") && index("PROVE_APPROVED_ACTUAL_COLOR_SWAP_GUARD") < index("UPDATE naijue_erp.product SET"));
    const deletes = f.calls.filter(c => c.sql.startsWith("DELETE FROM naijue_erp.product_image")), inserts = f.calls.filter(c => c.sql.startsWith("INSERT INTO naijue_erp.product_image"));
    assert.equal(deletes.length, cycleCount); assert.equal(inserts.length, cycleCount);
    assert.ok(f.calls.indexOf(deletes.at(-1)!) < f.calls.indexOf(inserts[0]!));
    assert.deepEqual(new Set(deletes.map(c => c.values[0])), new Set(inserts.map(c => c.values[0])));
    for (const insert of inserts) { const old = result.before.find(i => i.id === insert.values[0])!; assert.equal(insert.values[1], old.productId); assert.equal(insert.values[6], old.createdAt); assert.equal(insert.values[7], old.createdByAccountId); assert.equal(insert.values[8], old.version + 1); }
    assert.equal(f.calls.filter(c => c.sql.startsWith("UPDATE naijue_erp.product SET")).length, 1); assert.equal(f.calls.filter(c => c.sql.includes("product-maintenance:locked-images")).length, 2);
    assert.ok(f.calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK)/.test(c.sql))); assert.equal(f.calls.some(c => c.sql.startsWith("UPDATE naijue_erp.product_image")), false);
  }
});
test("W18 absent or stale actual v7 swap proof rejects before root writes; omitted reinsertion is caught by final snapshot", async () => {
  const absent = imageWriteProtocol({ cycleCount: 2 }); await assert.rejects(absent.swap(), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.ok(absent.calls.every(c => !/^(UPDATE|INSERT|DELETE)/.test(c.sql)));
  const stale = imageWriteProtocol({ cycleCount: 2, swap: true, rejectSwap: true }); await assert.rejects(stale.swap(), /SYNTHETIC_ACTUAL_V7_GUARD_UNAVAILABLE/); assert.ok(stale.calls.every(c => !/^(UPDATE|INSERT|DELETE)/.test(c.sql)));
  await assert.rejects(imageWriteProtocol({ cycleCount: 2, swap: true, skipReinsert: true }).swap(), { code: "INVALID_DATABASE_VALUE" });
  const f = imageWriteProtocol();
  assert.throws(() => new PostgresProductMaintenanceUnitOfWork(f.driver, { deletionGuard: null, imageColorSwapCapability: { ...f.proof } as never }), /capability/);
  assert.throws(() => new PostgresProductMaintenanceUnitOfWork(f.driver, { deletionGuard: null, imageColorSwapCapability: { ...f.swapProof, assertVerified() { throw Error("WRONG_SWAP_DRIVER"); } } }), /WRONG_SWAP_DRIVER/);
});
test("W17 image PG original-client proof/root lock/CAS and remove-before-add share exact native parameters and final snapshot", async () => {
  const f = imageWriteProtocol(); await f.write(false);
  const index = (s: string) => f.calls.findIndex(c => c.sql.includes(s));
  assert.ok(index("image-proof:original-client") < index("FROM naijue_erp.product WHERE")); assert.ok(index("FOR UPDATE") < index("product-maintenance:locked-images"));
  assert.ok(index("PREPARE_ORIGINAL_AUDIT") < index("UPDATE naijue_erp.product SET")); assert.ok(index("UPDATE naijue_erp.product SET") < index("DELETE FROM naijue_erp.product_image"));
  assert.ok(index("PREPARE_ORIGINAL_AUDIT") < index("PROVE_ORIGINAL_PREPARED_IMAGES") && index("PROVE_ORIGINAL_PREPARED_IMAGES") < index("UPDATE naijue_erp.product SET"));
  assert.ok(index("DELETE FROM naijue_erp.product_image") < index("INSERT INTO naijue_erp.product_image"));
  assert.equal(f.calls.filter(c => c.sql.includes("product-maintenance:locked-images")).length, 2);
  const insert = f.calls.find(c => c.sql.startsWith("INSERT INTO naijue_erp.product_image"))!; assert.equal(insert.values[4], "68"); assert.equal(insert.values[7], null); assert.equal(insert.values[8], 1);
  assert.ok(f.calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK)/.test(c.sql)));
  const updated = imageWriteProtocol(); await updated.write(true); const update = updated.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.product_image"))!;
  assert.match(update.sql, /version=\$12/); assert.match(update.sql, /created_by_account_id IS NOT DISTINCT FROM \$8/); assert.equal(update.values[11], 3); assert.equal(update.values[8], 4);
});
test("W17 image PG missing proof, stale CAS and wrong final rows fail without a fallback or second transaction", async () => {
  const missing = imageWriteProtocol({ capability: false }); await assert.rejects(missing.write(false), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.deepEqual(missing.calls, []);
  await assert.rejects(imageWriteProtocol({ zeroCas: true }).write(true), { code: "VERSION_CONFLICT" });
  await assert.rejects(imageWriteProtocol({ badFinal: true }).write(true), { code: "INVALID_DATABASE_VALUE" });
  const rejected = imageWriteProtocol({ rejectPrepared: true }); await assert.rejects(rejected.write(true), /SYNTHETIC_D1_PRIVATE_PROOF_REJECT/); assert.ok(rejected.calls.every(c => !/^(UPDATE|INSERT|DELETE)/.test(c.sql)));
  const f = imageWriteProtocol(); assert.throws(() => new PostgresProductMaintenanceUnitOfWork(f.driver, { deletionGuard: null, mediaWriteCapability: { profile: "product-media-write-v22" } as never }), /capability/);
  assert.throws(() => new PostgresProductMaintenanceUnitOfWork(f.driver, { deletionGuard: null, mediaWriteCapability: { ...f.proof, assertVerified() { throw Error("WRONG_ACTUAL_DRIVER"); } } }), /WRONG_ACTUAL_DRIVER/);
});
test("W15 product images SQL owns native root+image snapshot in one bounded ordered read without writes or original bytes", async () => {
  const f = imageProtocol({ rows: [imageRow()] }), result = await f.service.readImages(actor, { productId: id(12001) }, new AbortController().signal);
  assert.equal(result.version, 7); assert.equal(result.images[0]!.version, 3); assert.equal(result.images[0]!.role, "COLOR"); assert.equal(result.images[0]!.colorId, id(6)); assert.equal(result.images[0]!.thumbnailUrl, null);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0]!.values, [id(12001)]); assert.match(f.calls[0]!.sql, /ORDER BY i.display_order,i.id LIMIT 1001/);
  assert.match(f.calls[0]!.sql, /i.version,i.image_role,i.color_id/); assert.match(f.calls[0]!.sql, /s.product_id=p.id AND s.color_id=i.color_id/);
  assert.match(f.calls[0]!.sql, /p.deleted_at IS NULL/); assert.doesNotMatch(f.calls[0]!.sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_REAL_REF|file_ref/);
});
test("W15 product images SQL empty/absent/read failure/bad membership and ordering never become a fabricated image set", async () => {
  const input = { productId: id(12001) }, signal = new AbortController().signal;
  assert.deepEqual((await imageProtocol().service.readImages(actor, input, signal)).images, []);
  await assert.rejects(imageProtocol({ absent: true }).service.readImages(actor, input, signal), { code: "PRODUCT_NOT_FOUND" });
  await assert.rejects(imageProtocol({ fail: true }).service.readImages(actor, input, signal), /SYNTHETIC_METADATA_FAILURE/);
  for (const rows of [[{ ...imageRow(), valid_color: false }], [{ ...imageRow(), byte_size: "0" }], [{ ...imageRow(), product_id: id(9) }], [imageRow(), imageRow()], Array.from({ length: 1001 }, () => imageRow())])
    await assert.rejects(imageProtocol({ rows }).service.readImages(actor, input, signal), { code: "INVALID_DATABASE_VALUE" });
});
const command: Extract<ProductMaintenanceCommand, { action: "CREATE" }> = { action: "CREATE", requestKey: "leaf-create", values: {
  productCode: "REAL-CODE-0001", name: "SYNTHETIC", categoryId: id(1), supplierId: id(2), sizeGroupId: id(3), seasonId: id(4), year: 2026,
  systemItemCode: "0000123", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: id(5), enabled: true,
  prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, k === "retail_price" ? "0.00" : null])) as Extract<ProductMaintenanceCommand, { action: "CREATE" }>["values"]["prices"]
}, skus: [{ id: null, expectedVersion: null, skuCode: "0001-A", colorId: id(6), fitId: id(7), sizeId: id(8), enabled: true }],
barcodes: [{ id: null, barcode: "000012345 ", colorId: id(6), fitId: id(7), sizeId: id(8), kind: "MAIN", schemeId: id(5), enabled: true }] };
function setup(options: { badSize?: boolean; barcodeCollision?: boolean; seasonArray?: boolean; retained?: boolean; selectedGroup?: string; members?: readonly string[] } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], prepared: unknown[] = []; let completed = 0, seq = 900;
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed() {}, async getReceipt() { return undefined; }, async prepare(c) { prepared.push(structuredClone(c)); }, async complete(c) { completed++; return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
  }, client: { async query(sql, values = []) {
    calls.push({ sql, values: structuredClone(values) }); let rows: Record<string, unknown>[] = [];
    if (options.retained && sql.includes("FROM naijue_erp.product WHERE")) { const v = command.values; rows = [{ id: id(20), product_code: v.productCode, name: v.name,
      category_id: v.categoryId, supplier_id: v.supplierId, season_id: v.seasonId, season_ids: [], size_group_id: v.sizeGroupId, year: v.year,
      system_item_code: v.systemItemCode, thickness: v.thickness, collar_pants_type: v.collarPantsType, default_barcode_scheme_id: v.defaultBarcodeSchemeId,
      enabled: true, version: 7, deleted_at: null, ...v.prices }]; }
    else if (options.retained && sql.includes("FROM naijue_erp.sku WHERE")) rows = [{ id: id(21), product_id: id(20), sku_code: "SOURCE-SKU-KEEP", color_id: id(6), fit_id: id(7), size_id: id(8), enabled: true, version: 3, created_operation_id: null }];
    else if (/SELECT .*FROM naijue_erp.product_category/.test(sql)) rows = [{ id: id(1) }];
    else if (sql.includes("FROM naijue_erp.supplier")) rows = [{ id: id(2), enabled: true }];
    else if (sql.includes("FROM naijue_erp.size_group_member")) rows = options.badSize ? [] : (options.members ?? [id(8)]).filter(size => (values[1] as string[]).includes(size)).map(size_id => ({ size_id }));
    else if (sql.includes("FROM naijue_erp.size_group")) rows = [{ id: options.selectedGroup ?? id(3) }];
    else if (sql.includes("FROM naijue_erp.season")) rows = [{ id: id(4) }];
    else if (sql.includes("FROM naijue_erp.barcode_scheme")) rows = [{ id: id(5) }];
    else if (sql.includes("FROM naijue_erp.color")) rows = [{ id: id(6), enabled: true, retained: true }];
    else if (sql.includes("FROM naijue_erp.fit")) rows = [{ id: id(7), enabled: true, retained: true }];
    if (options.barcodeCollision && sql.startsWith("INSERT INTO naijue_erp.sku_barcode")) throw Object.assign(Error("PRIVATE UNIQUE DETAIL"), { code: "23505" });
    return { rows, rowCount: /^(INSERT|UPDATE)/.test(sql) ? 1 : rows.length };
  } } }); } };
  const dependencies: ProductMaintenanceDependencies = { newId: kind => sid(kind, seq++), now: () => "2026-10-22T06:00:00Z",
    unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null, ...(options.seasonArray ? { seasonCapability: { profile: "product-season-array-v1" as const, assertVerified(target: object) { assert.equal(target, driver); } } } : {}) }) };
  return { service: createProductMaintenanceService(dependencies), calls, driver, prepared, completed: () => completed };
}
function borrowedAppendInput(): DocumentProductSkuAppendInput {
  const skuId = id(40001), operationId = id(40000);
  return { actor, productId: id(20), expectedVersion: 7, operationId, requestKey: `doc-spec:${id(39999)}:${id(20)}`,
    completedAt: "2026-10-23T14:00:00.000000Z", skus: [{ id: skuId, productId: id(20), skuCode: `NJNEW-${skuId.replaceAll("-", "")}`,
      colorId: id(6), fitId: id(7), sizeId: id(9), enabled: true, version: 1, createdOperationId: operationId }] };
}
test("v11 borrowed product append PG: original leased context writes root/SKU only, keeps actual group locks and closes without commit/release", async () => {
  const f = setup({ retained: true, members: [id(8), id(9)] }); let escaped!: ProductMaintenanceTransaction;
  const saved = await f.driver.transaction(context => withProductMaintenanceTransaction(context, async tx => {
    escaped = tx; return appendProductSkusInTransaction(tx, borrowedAppendInput());
  }, { seasonArray: true }));
  assert.equal(saved.result.version, 8); assert.equal(f.completed(), 1); assert.equal(f.prepared.length, 1);
  const writes = f.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql)); assert.equal(writes.length, 2);
  assert.match(writes[0]!.sql, /^UPDATE naijue_erp.product/); assert.match(writes[0]!.sql, /version=\$\d+/);
  assert.match(writes[1]!.sql, /^INSERT INTO naijue_erp.sku/); assert.equal(writes[1]!.values[5], id(9)); assert.equal(writes[1]!.values[8], borrowedAppendInput().operationId);
  assert.deepEqual(f.calls.find(c => c.sql.includes("FROM naijue_erp.size_group_member"))!.values, [id(3), [id(8), id(9)]]);
  assert.ok(f.calls.every(c => !/^(BEGIN|COMMIT|ROLLBACK)|INSERT INTO naijue_erp\.(?:audit_change|operation_receipt|sku_barcode|inventory_)/.test(c.sql)));
  const count = f.calls.length;
  await assert.rejects(escaped.readCandidates({ kind: "years", search: "", page: 1, pageSize: 20 }), { code: "TRANSACTION_CLOSED" }); assert.equal(f.calls.length, count);
});
test("v11 borrowed product append PG: foreign/no-size outside actual product group and denied purpose cannot mutate", async () => {
  const f = setup({ retained: true, members: [id(8)] });
  await assert.rejects(f.driver.transaction(context => withProductMaintenanceTransaction(context,
    tx => appendProductSkusInTransaction(tx, borrowedAppendInput()), { seasonArray: true })), { code: "PRODUCT_SIZE_GROUP_MISMATCH" });
  assert.equal(f.prepared.length, 0); assert.ok(f.calls.every(c => !/^(INSERT|UPDATE|BEGIN|COMMIT|ROLLBACK)/.test(c.sql))); assert.equal(f.completed(), 0);
  let queries = 0;
  await assert.rejects(withProductMaintenanceTransaction({ client: { async query() { queries++; throw Error("Must not query"); } }, evidence: {
    async assertAllowed() { throw Object.assign(Error("SYNTHETIC_PARENT_DENIED"), { code: "FORBIDDEN" }); }, async getReceipt() { throw Error("Must not query"); }, async complete() { throw Error("Must not complete"); }
  } }, tx => appendProductSkusInTransaction(tx, borrowedAppendInput()), { seasonArray: true }), { code: "FORBIDDEN" });
  assert.equal(queries, 0);
});
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
test("all-size seam PG: original EDIT appends a dictionary size without MAIN; retained group membership still blocks an incompatible no-size switch", async () => {
  const { seasonId: _legacy, ...v } = command.values, values = { ...v, seasonIds: [] };
  const added = { ...command.skus[0]!, skuCode: "EXPLICIT-SYNTHETIC-NEW-SIZE", sizeId: id(9) };
  const edit = { action: "EDIT", requestKey: "same-group-new-size", id: id(20), expectedVersion: 7, values, skus: [added], barcodes: [] };
  const f = setup({ seasonArray: true, retained: true, members: [id(8), id(9)] }), saved = await f.service.executeV2(actor, edit);
  assert.equal(saved.version, 8); const writes = f.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql));
  assert.equal(writes.length, 2); assert.match(writes[0]!.sql, /^UPDATE naijue_erp.product/); assert.match(writes[1]!.sql, /^INSERT INTO naijue_erp.sku/);
  assert.equal(writes[1]!.values[5], id(9)); assert.equal(writes[1]!.values[8], saved.operationId);
  assert.ok(!f.calls.some(c => /^(INSERT|UPDATE).*sku_barcode/.test(c.sql)));
  assert.deepEqual(f.calls.find(c => c.sql.includes("FROM naijue_erp.size_group_member"))!.values, [id(3), [id(8), id(9)]]);
  // Both dictionary groups exist. The original imported size remains retained,
  // and is not a member of the explicit synthetic no-size group.
  const noSizeGroup = id(30), noSize = id(31), g = setup({ seasonArray: true, retained: true, selectedGroup: noSizeGroup, members: [noSize] });
  await assert.rejects(g.service.executeV2(actor, { ...edit, requestKey: "cross-to-no-size", values: { ...values, sizeGroupId: noSizeGroup }, skus: [{ ...added, sizeId: noSize }] }), { code: "PRODUCT_SIZE_GROUP_MISMATCH" });
  assert.equal(g.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql)).length, 0); assert.equal(g.completed(), 0);
  assert.deepEqual(g.calls.find(c => c.sql.includes("FROM naijue_erp.size_group_member"))!.values, [noSizeGroup, [id(8), noSize]]);
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
test("year candidates: Demo 2015 through Shanghai current year plus one joins retained historical years even without next-year products", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
    async assertAllowed(_actor, _kind, action) { assert.equal(action, "CANDIDATES"); }, async getReceipt() { throw Error("Read only"); }, async complete() { throw Error("Read only"); }
  }, client: { async query(sql, values = []) {
    calls.push({ sql, values });
    assert.match(sql, /generate_series\(2015,/); assert.match(sql, /CURRENT_TIMESTAMP AT TIME ZONE 'Asia\/Shanghai'/);
    assert.match(sql, /::integer\s*\+\s*1/); assert.match(sql, /UNION\s+SELECT year FROM naijue_erp.product/); assert.doesNotMatch(sql, /UNION ALL/);
    assert.match(sql, /ORDER BY name::integer DESC,id COLLATE "C" LIMIT \$2 OFFSET \$3/);
    const years = [2027, 2026, 2015, 2012].filter(year => String(year).includes(String(values[0])));
    return { rows: [{ total: String(years.length), items: years.map(year => ({ id: String(year), name: String(year), code: null, parent_id: null, version: null })) }], rowCount: 1 };
  } } }); } };
  const service = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null }), now: () => "unused", newId: () => "unused" });
  const result = await service.candidates(actor, { kind: "years", search: "", page: 1, pageSize: 20 });
  assert.deepEqual(result.items.map(i => i.id), ["2027", "2026", "2015", "2012"]); assert.equal(result.total, 4);
  const next = await service.candidates(actor, { kind: "years", search: "2027", page: 1, pageSize: 20 });
  assert.deepEqual(next.items.map(i => i.id), ["2027"]);
  const outside = await service.candidates(actor, { kind: "years", search: "2028", page: 1, pageSize: 20 }); assert.deepEqual(outside.items, []);
  assert.deepEqual(calls.map(c => c.values), [["", 20, 0], ["2027", 20, 0], ["2028", 20, 0]]);
});

test("season v2 PG: actual array column and dictionary locks share driver; EDIT does not assign legacy scalar", async () => {
  for (const before of [null, [], [id(4), id(44)]] as const) {
    const calls: { sql: string; values: unknown[] }[] = [], audits: unknown[] = []; const target = id(900);
    const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: {
      async assertAllowed() {}, async getReceipt() { return undefined; }, async prepare(c) { audits.push(c); },
      async complete(c) { assert.equal(audits.length, 1); return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
    }, client: { async query(sql, values = []) {
      calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
      if (sql.includes("FROM naijue_erp.product WHERE")) rows = [{ id: target, product_code: command.values.productCode, name: command.values.name,
        category_id: id(1), supplier_id: id(2), season_id: id(4), season_ids: before, size_group_id: id(3), year: 2026,
        system_item_code: "0000123", thickness: null, collar_pants_type: null, default_barcode_scheme_id: id(5), enabled: true, version: 1, deleted_at: null, ...command.values.prices }];
      else if (sql.includes("su.id AS supplier_id")) rows = [{ supplier_id: id(2), supplier_name: "SUPPLIER", supplier_enabled: true, season_id: id(4), season_name: "LEGACY", size_group_id: id(3), size_group_name: "GROUP", scheme_id: id(5), scheme_name: "SCHEME", rule_version: "1", scheme_status: "CURRENT" }];
      else if (sql.startsWith("WITH RECURSIVE category_path")) rows = [{ id: id(1), parent_id: null, name: "CATEGORY", cyclic: false }];
      else if (sql.includes("FROM naijue_erp.product_category")) rows = [{ id: id(1) }];
      else if (sql.includes("FROM naijue_erp.supplier")) rows = [{ id: id(2), enabled: true }];
      else if (sql.includes("FROM naijue_erp.size_group")) rows = [{ id: id(3) }];
      else if (sql.startsWith("SELECT id,name FROM naijue_erp.season")) rows = ((values[0] ?? []) as string[]).map((id, i) => ({ id, name: i === 0 ? "春" : "夏" }));
      else if (sql.includes("FROM naijue_erp.season")) rows = Array.isArray(values[0]) ? (values[0] as string[]).map(id => ({ id })) : [{ id: id(4) }];
      else if (sql.includes("FROM naijue_erp.barcode_scheme")) rows = [{ id: id(5) }];
      if (sql.startsWith("UPDATE")) { assert.equal(audits.length, 1, "prepared original audit first"); return { rows: [], rowCount: 1 }; }
      return { rows, rowCount: rows.length };
    } } }); } };
    const unitOfWork = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null, seasonCapability: { profile: "product-season-array-v1", assertVerified(actual) { assert.equal(actual, driver); } } });
    const service = createProductMaintenanceService({ unitOfWork, newId: () => id(999), now: () => "2026-10-22T08:00:00Z" });
    const { seasonId: _scalar, ...values } = command.values;
    await service.executeV2(actor, { action: "EDIT", requestKey: "array-edit", id: target, expectedVersion: 1, values: { ...values, name: "CHANGED", seasonIds: [id(44), id(4)] }, skus: [], barcodes: [] });
    const rootRead = calls.find(c => c.sql.includes("FROM naijue_erp.product WHERE"))!; assert.match(rootRead.sql, /season_ids/);
    const lock = calls.find(c => c.sql.includes("FOR KEY SHARE"))!; assert.deepEqual(lock.values, [[id(4), id(44)]]); assert.match(lock.sql, /ORDER BY id FOR KEY SHARE/);
    const update = calls.find(c => c.sql.startsWith("UPDATE naijue_erp.product"))!;
    assert.match(update.sql, /season_ids=\$/); assert.doesNotMatch(update.sql, /(?:SET |,)season_id=/); assert.deepEqual(update.values.at(-2), [id(4), id(44)]); assert.equal(update.values.at(-1), 1);
    // Scripted read snapshot intentionally remains the original row; this is query/DTO evidence, not real persistence.
    const detail = await service.detailV2(actor, { productId: target }); assert.deepEqual(detail.values.seasonIds, before); assert.deepEqual(detail.references.seasons.map(s => s.id), before ?? []);
    const refs = calls.filter(c => c.sql.startsWith("SELECT id,name FROM naijue_erp.season")); assert.equal(refs.length, 1); assert.match(refs[0]!.sql, /ORDER BY display_order,id/); assert.deepEqual(refs[0]!.values, [before]);
  }
});
test("season v2 PG: missing dictionary, malformed stored array and mismatched proof reject rather than partial writes", async () => {
  const f = setup(); const { seasonId: _scalar, ...values } = command.values;
  await assert.rejects(f.service.executeV2(actor, { ...command, values: { ...values, seasonIds: [] } }), { code: "PRODUCT_SEASON_NOT_READY" }); assert.equal(f.calls.length, 0);
  const missing = setup({ seasonArray: true }); await assert.rejects(missing.service.executeV2(actor, { ...command, values: { ...values, seasonIds: [id(4), id(44)] } }), { code: "PRODUCT_REFERENCE_UNAVAILABLE" }); assert.equal(missing.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql)).length, 0);
  const empty = setup({ seasonArray: true }); await empty.service.executeV2(actor, { ...command, values: { ...values, seasonIds: [] } });
  const insert = empty.calls.find(c => c.sql.startsWith("INSERT INTO naijue_erp.product("))!; assert.match(insert.sql, /season_ids/); assert.deepEqual(insert.values.at(-1), []); assert.equal(insert.values[5], null);
  const driver: PgProductMaintenanceDriver = { async transaction(work) { return work({ evidence: { async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("No evidence"); } }, client: { async query(sql) {
    if (sql.includes("FROM naijue_erp.product WHERE")) return { rows: [{ id: id(1), ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, null])), product_code: "x", name: "x", category_id: id(2), supplier_id: null, season_id: null,
      season_ids: [id(4), id(4)], size_group_id: id(3), year: null, system_item_code: null, thickness: null, collar_pants_type: null, default_barcode_scheme_id: null, enabled: true, version: 1, deleted_at: null }], rowCount: 1 };
    assert.ok(!/^(INSERT|UPDATE)/.test(sql)); return { rows: [], rowCount: 0 };
  } } }); } };
  assert.throws(() => new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null, seasonCapability: { profile: "product-season-array-v1", assertVerified() { throw Error("UNVERIFIED TARGET"); } } }), /UNVERIFIED TARGET/);
  const unitOfWork = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null, seasonCapability: { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, driver); } } });
  const service = createProductMaintenanceService({ unitOfWork, now: () => "unused", newId: () => "unused" });
  await assert.rejects(service.detailV2(actor, { productId: id(1) }), { code: "INVALID_DATABASE_VALUE" });
});
