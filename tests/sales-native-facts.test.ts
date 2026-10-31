/** SYNTHETIC unit/scripted pg protocol only. No database, host, publisher or real readiness assertion. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import type { NativeSalesReferenceFacts } from "../packages/application/src/sales-native-facts.ts";
import { PostgresNativeSalesFacts } from "../adapters/postgres/src/sales-native-facts.ts";
import type { NativeCatalogueCompletenessVerifier, NativeSalesFactQuery } from "../adapters/postgres/src/sales-native-facts.ts";
import { PostgresSalesUnitOfWork } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import type { SalesDependencies, SalesTransaction } from "../packages/application/src/ports.ts";
import type { SalesDraft } from "../packages/domain/src/documents.ts";
import { minorAmount, quantity, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot, syntheticDraft, syntheticSalesIdentity, SYNTHETIC_RULES } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
const product = sid("product", 12), color = sid("color", 13), fit = sid("fit", 11), size = sid("size", 14), group = sid("sizeGroup", 30), method = sid("paymentMethod", 31);
function liveDraft(): SalesDraft {
  const draft = syntheticDraft(); return { ...draft, header: { ...draft.header, salespersonId: sid("staff", 103) } };
}
function nativeFacts(draft = liveDraft()): NativeSalesReferenceFacts {
  return { salesId: draft.header.id, hall: { id: ids.hall, enabled: true }, warehouse: { id: ids.warehouse, hallId: ids.hall, enabled: true }, customer: { id: ids.customer, enabled: true }, salesperson: draft.header.salespersonId === null ? null : { id: draft.header.salespersonId, employmentStatus: "在职" },
    paymentAccounts: [{ id: ids.payment, enabled: true, methodId: method, methodEnabled: true }],
    skus: [...new Set(draft.lines.map(row => row.skuId))].map(id => ({ id, productId: product, enabled: true, snapshot: { productCode: snapshot.productCode, productName: snapshot.productName, colorName: snapshot.colorName, fitName: snapshot.fitName, sizeName: snapshot.sizeName } })),
    products: [{ id: product, enabled: true, referencePrice: minorAmount("125"), minimumPrice: null }], barcodes: [], retainedLines: [] };
}
const unused = async (): Promise<never> => { throw new Error("SYNTHETIC unexpected transaction operation"); };
const txFacts = (value: NativeSalesReferenceFacts): SalesTransaction => ({
  async getCurrentSalesReferenceFacts() { return value; }, getCurrentSalesIdentity: unused, getSales: unused, putRuntimeSales: unused,
  getReceipt: unused, insertReceipt: unused, getBalance: unused, putBalance: unused, listSalesLedger: unused, appendLedger: unused, appendAudit: unused
});
const rules = createNativeTransactionSalesBusinessRules();

test("native sales rules: original transaction capability is mandatory, never use request/form fallback facts", async () => {
  await assert.rejects(async () => rules.assertDraftChange(undefined, liveDraft()), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  const { getCurrentSalesReferenceFacts: _capability, ...withoutCapability } = txFacts(nativeFacts());
  await assert.rejects(async () => rules.assertDraftChange(undefined, liveDraft(), withoutCapability), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  await rules.assertDraftChange(undefined, liveDraft(), txFacts(nativeFacts()));
});
test("native sales rules: unknown minimum is not known absent; exact minimum remains authoritative", async () => {
  const draft = liveDraft(); const facts = nativeFacts();
  await assert.rejects(async () => rules.assertDraftChange(undefined, draft, txFacts({ ...facts, products: [{ ...facts.products[0]!, minimumPrice: undefined } as never] })), { code: "PRODUCT_PRICING_UNAVAILABLE" });
  await assert.rejects(async () => rules.assertDraftChange(undefined, draft, txFacts({ ...facts, products: [{ ...facts.products[0]!, minimumPrice: minorAmount("126") }] })), { code: "BELOW_MINIMUM_PRICE" });
  await rules.assertDraftChange(undefined, draft, txFacts(facts));
});
test("native sales rules: enabled same-hall refs and actual method are required; staff role/hall and account hall are not invented", async () => {
  const draft = liveDraft(); const base = nativeFacts();
  for (const facts of [{ ...base, hall: { ...base.hall, enabled: false } }, { ...base, warehouse: { ...base.warehouse, hallId: sid("hall", 99) } },
    { ...base, customer: { ...base.customer, enabled: false } }, { ...base, paymentAccounts: [{ ...base.paymentAccounts[0]!, methodEnabled: false }] }])
    await assert.rejects(async () => rules.assertDraftChange(undefined, draft, txFacts(facts)), { code: "SALES_REFERENCE_UNAVAILABLE" });
  const staff = sid("staff", 100); const staffed = { ...draft, header: { ...draft.header, salespersonId: staff } };
  await rules.assertDraftChange(undefined, staffed, txFacts({ ...base, salesperson: { id: staff, employmentStatus: "在职" } }));
  await assert.rejects(async () => rules.assertDraftChange(undefined, staffed, txFacts({ ...base, salesperson: { id: staff, employmentStatus: "离职" } })), { code: "SALES_REFERENCE_UNAVAILABLE" });
});
test("native sales rules: new/replaced snapshots require current labels; unchanged stored observations survive rename/disabled old barcode", async () => {
  const draft = liveDraft(); const changed = { ...draft, lines: [{ ...draft.lines[0]!, snapshot: { ...snapshot, productName: "FORGED" } }] };
  await assert.rejects(async () => rules.assertDraftChange(undefined, changed, txFacts(nativeFacts())), { code: "SALES_SNAPSHOT_MISMATCH" });
  const oldLine = { ...draft.lines[0]!, snapshot: { ...snapshot, productName: "SYNTHETIC OLD NAME", barcode: "0000123400" } };
  const kept = { ...draft, lines: [oldLine] }; const facts = { ...nativeFacts(), retainedLines: [{ id: oldLine.id, skuId: oldLine.skuId, snapshot: oldLine.snapshot }] };
  await rules.assertDraftChange(undefined, kept, txFacts(facts));
  await assert.rejects(async () => rules.assertDraftChange(undefined, { ...kept, lines: [{ ...oldLine, id: sid("salesLine", 101) }] }, txFacts(facts)), { code: "SALES_SNAPSHOT_MISMATCH" });
});
test("native sales rules: raw observations must bind exact enabled SKU; null manual observation is not a fake MAIN barcode", async () => {
  const draft = liveDraft(); const observed = { ...draft, lines: [{ ...draft.lines[0]!, snapshot: { ...snapshot, barcode: "0000123400" } }] };
  await assert.rejects(async () => rules.assertDraftChange(undefined, observed, txFacts(nativeFacts())), { code: "BARCODE_UNAVAILABLE" });
  await rules.assertDraftChange(undefined, observed, txFacts({ ...nativeFacts(), barcodes: [{ raw: "0000123400", skuId: ids.sku, enabled: true }] }));
  for (const binding of [{ raw: "123400", skuId: ids.sku, enabled: true }, { raw: "0000123400", skuId: ids.sku2, enabled: true }, { raw: "0000123400", skuId: ids.sku, enabled: false }])
    await assert.rejects(async () => rules.assertDraftChange(undefined, observed, txFacts({ ...nativeFacts(), barcodes: [binding] })), { code: "BARCODE_UNAVAILABLE" });
});
test("sales service: awaits both async original-tx rules gates before document/effects; rejection rolls back and original key can retry", async () => {
  const store = new SyntheticStore(); store.seedBalance({ warehouseId: ids.warehouse, skuId: ids.sku, quantity: quantity("0"), version: version(1), lastOperationId: null, updatedAt: "2026-10-20T00:00:00Z" });
  let authTx: SalesTransaction | undefined, sequence = 4000, saveEntered!: () => void, releaseSave!: () => void, approveEntered!: () => void, rejectApprove!: (reason: Error) => void;
  const enteredSave = new Promise<void>(resolve => { saveEntered = resolve; }); const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  const enteredApprove = new Promise<void>(resolve => { approveEntered = resolve; }); const approveGate = new Promise<void>((_resolve, reject) => { rejectApprove = reject; });
  let rejectOnce = true;
  const service = createSalesService({ unitOfWork: store, authorization: { async assertAllowed(_actor, _action, _document, tx) { authTx = tx; } },
    rules: { async assertDraftChange(_old, _draft, tx) { assert.equal(tx, authTx); saveEntered(); await saveGate; },
      async assertReferencesAndEconomics(_document, tx) { assert.equal(tx, authTx); approveEntered(); if (rejectOnce) await approveGate; }, inventoryDelta: SYNTHETIC_RULES.inventoryDelta },
    now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++) });
  const saving = service.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC-async-save", expectedVersion: null, draft: liveDraft() });
  await enteredSave; assert.equal(store.snapshot().headers.size, 0); assert.equal(store.snapshot().receipts.size, 0); releaseSave(); await saving;
  const command = { actor, action: "APPROVE" as const, requestKey: "SYNTHETIC-async-approve", expectedVersion: version(1), salesId: ids.sales };
  const approving = service.execute(command); await enteredApprove; assert.equal(store.snapshot().ledger.length, 0); rejectApprove(new Error("SYNTHETIC fact failure"));
  await assert.rejects(() => approving, /SYNTHETIC fact failure/); assert.equal(store.snapshot().headers.get(ids.sales)!.status, "DRAFT"); assert.equal(store.snapshot().ledger.length, 0);
  rejectOnce = false; const result = await service.execute(command); assert.equal(result.status, "APPROVED"); assert.equal(store.snapshot().ledger.length, 1);
  assert.deepEqual(await service.execute(command), result); assert.equal(store.snapshot().ledger.length, 1);
});

function pgFixture(options: { count?: number; priceChange?: Record<string, unknown>; schema?: boolean; barcode?: string; verifier?: NativeCatalogueCompletenessVerifier } = {}) {
  const count = options.count ?? 1; const draft = liveDraft();
  const skuIds = Array.from({ length: count }, (_, index) => index === 0 ? ids.sku : sid("sku", 5000 + index));
  const sizeIds = Array.from({ length: count }, (_, index) => index === 0 ? size : sid("size", 6000 + index));
  const productRow = { id: product, product_code: snapshot.productCode, name: snapshot.productName, size_group_id: group, enabled: true,
    purchase_price: null, retail_price: "1.25", wholesale5_price: null, wholesale6_price: null, wholesale7_price: null, wholesale8_price: null, wholesale9_price: null, wholesale10_price: null, minimum_price: null, ...options.priceChange };
  const tables: Record<string, Record<string, unknown>[]> = { payment_account: [{ id: ids.payment, payment_method_id: method, enabled: true }], payment_method: [{ id: method, enabled: true }],
    sku: skuIds.map((id, index) => ({ id, product_id: product, color_id: color, fit_id: fit, size_id: sizeIds[index], enabled: true })), product: [productRow], color: [{ id: color, name: snapshot.colorName, enabled: true }],
    fit: [{ id: fit, name: snapshot.fitName, enabled: true }], size: sizeIds.map(id => ({ id, name: snapshot.sizeName })) };
  const calls: { sql: string; values: unknown[] }[] = []; let completeCalls = 0; let active = true;
  const query: NativeSalesFactQuery = async (sql, values = []) => {
    assert.equal(active, true); calls.push({ sql, values: structuredClone(values) }); assert.ok(!/BEGIN|COMMIT|ROLLBACK|password|token|session|INSERT|UPDATE|DELETE/.test(sql));
    let rows: Record<string, unknown>[];
    if (sql.includes("native-sales-facts:schema")) rows = [{ installed: options.schema !== false }];
    else if (sql.includes("native-sales-facts:hall")) rows = [{ id: ids.hall, enabled: true }];
    else if (sql.includes("native-sales-facts:warehouse")) rows = [{ id: ids.warehouse, hall_id: ids.hall, enabled: true }];
    else if (sql.includes("native-sales-facts:staff")) rows = [{ id: draft.header.salespersonId, employment_status: "在职" }];
    else if (sql.includes("native-sales-facts:customer")) rows = [{ id: ids.customer, enabled: true }];
    else if (sql.includes("native-sales-facts:membership")) rows = (values[0] as string[]).map((group, index) => ({ size_group_id: group, size_id: (values[1] as string[])[index] }));
    else if (sql.includes("native-sales-facts:barcodes")) rows = options.barcode ? [{ barcode: options.barcode, sku_id: ids.sku, enabled: true }] : [];
    else if (sql.includes("native-sales-facts:sku-products")) { assert.ok(!sql.includes("FOR SHARE")); const wanted=values[0] as string[]; assert.ok(wanted.length<=200); rows=tables.sku!.filter(row=>wanted.includes(row.id as string)); }
    else if (sql.includes("SYNTHETIC-persisted-completeness")) rows = [{ complete: true }];
    else { const table = /native-sales-facts:([a-z_]+)/.exec(sql)?.[1]; assert.ok(table && tables[table], sql); assert.match(sql, /WHERE id = ANY\(\$1::uuid\[\]\) ORDER BY id FOR SHARE/);
      const wanted = values[0] as string[]; assert.ok(wanted.length <= 200); rows = tables[table].filter(row => wanted.includes(row.id as string)); }
    return { rows: structuredClone(rows), rowCount: rows.length };
  };
  const verifier: NativeCatalogueCompletenessVerifier = options.verifier ?? { async assertComplete(context) {
    completeCalls++; assert.equal(context.query, query); assert.deepEqual(context.productIds, [product]); assert.ok(Object.isFrozen(context.productIds));
    await context.query("/* SYNTHETIC-persisted-completeness */ SELECT true AS complete");
  } };
  const factReader = new PostgresNativeSalesFacts(query, target => { assert.equal(active, true); assert.equal(target, ids.sales); }, () => [], verifier);
  const lines = skuIds.map((skuId, index) => ({ ...draft.lines[0]!, id: sid("salesLine", 7000 + index), skuId, lineNo: index + 1, ...(options.barcode && index === 0 ? { snapshot: { ...snapshot, barcode: options.barcode } } : {}) }));
  return { reader: factReader, draft: { ...draft, lines }, calls, completeCalls: () => completeCalls, close() { active = false; }, query };
}
test("native sales pg facts: original-query bounded target locks, actual member pairs, product prices read once and verifier uses same transaction", async () => {
  const f = pgFixture({ count: 201 }); const result = await f.reader.load(f.draft);
  assert.equal(result.skus.length, 201); assert.equal(result.products.length, 1); assert.equal(result.products[0]!.referencePrice, 125n); assert.equal(result.products[0]!.minimumPrice, null);
  assert.equal(f.completeCalls(), 1);
  assert.equal(f.calls.filter(row => /native-sales-facts:sku \*\//.test(row.sql)).length, 2);
  assert.equal(f.calls.filter(row => /native-sales-facts:product \*\//.test(row.sql)).length, 1);
  assert.equal(f.calls.filter(row => row.sql.includes("native-sales-facts:membership")).length, 2);
  assert.ok(f.calls.filter(row => row.sql.includes("native-sales-facts:") && !row.sql.includes(":schema") && !row.sql.includes(":sku-products")).every(row => /FOR SHARE/.test(row.sql)));
});
test("native sales pg facts: missing real verifier, schema10 and incomplete/invalid nine-price facts fail closed", async () => {
  let queried = false; const missing = new PostgresNativeSalesFacts(async () => { queried = true; return { rows: [], rowCount: 0 }; }, () => {}, () => []);
  await assert.rejects(() => missing.load(liveDraft()), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" }); assert.equal(queried, false);
  const old = pgFixture({ schema: false }); await assert.rejects(() => old.reader.load(old.draft), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" }); assert.equal(old.calls.length, 1); assert.equal(old.completeCalls(), 0);
  for (const priceChange of [{ minimum_price: undefined }, { purchase_price: undefined }, { wholesale10_price: "-1.00" }, { retail_price: "1.234" }]) {
    const f = pgFixture({ priceChange }); await assert.rejects(() => f.reader.load(f.draft), { code: "retail_price" in priceChange ? "MONEY_PRECISION" : "INVALID_DATABASE_VALUE" });
  }
  const denied = pgFixture({ verifier: { async assertComplete() { throw Object.assign(new Error("SYNTHETIC unpublished prices"), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" }); } } });
  await assert.rejects(() => denied.reader.load(denied.draft), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
});
test("native sales pg facts: original raw barcode targets preserve leading zero and do not load every alias/MAIN or document history", async () => {
  const f = pgFixture({ barcode: "0000123400" }); const result = await f.reader.load(f.draft);
  assert.equal(result.barcodes[0]!.raw, "0000123400"); const calls = f.calls.filter(row => row.sql.includes("native-sales-facts:barcodes"));
  assert.equal(calls.length, 1); assert.deepEqual(calls[0]!.values, [["0000123400"]]); assert.match(calls[0]!.sql, /WHERE barcode = ANY\(\$1::text\[\]\)/);
  assert.ok(f.calls.every(row => !/sales_line|transfer_line|MAIN|CONFIRMED_OLD|generate/.test(row.sql))); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.products));
});
test("native sales pg facts: captured document cannot be redirected during async completeness and a closed scope cannot return facts", async () => {
  let f: ReturnType<typeof pgFixture>; const input = liveDraft();
  f = pgFixture({ verifier: { async assertComplete() { Object.assign(input.header, { id: sid("sales", 8001) }); } } });
  const original = input.header.id; const result = await f.reader.load(input); assert.equal(result.salesId, original);
  const closed = pgFixture({ verifier: { async assertComplete() { closed.close(); } } }); await assert.rejects(() => closed.reader.load(closed.draft), /false !== true/);
});
test("native sales UoW: missing verifier fails native capability on original bound actor/target and an escaped transaction stays closed", async () => {
  const calls: string[] = []; let connections = 0, released = 0, escaped: SalesTransaction | undefined;
  const client: PgSalesClient = { async query(sql) { calls.push(sql); let rows: Record<string, unknown>[] = [];
    if (sql.includes("sales:current-schema")) rows = [{ current_sales_schema_ready: true }];
    if (sql.includes("sales-authorization:identity")) rows = [{ account_id: actor.accountId, staff_id: syntheticSalesIdentity().staffId, login_enabled: true, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }];
    if (sql.includes("sales-authorization:hall")) rows = [{ id: ids.hall, enabled: true }];
    return { rows, rowCount: rows.length }; }, release() { released++; } };
  const uow = new PostgresSalesUnitOfWork({ async connect() { connections++; return client; } });
  await uow.transaction(async tx => { escaped = tx; await assert.rejects(() => tx.getCurrentSalesReferenceFacts!(liveDraft()), { code: "TRANSACTION_SCOPE" });
    await tx.getReceipt(actor.accountId, "SYNTHETIC-bound"); await tx.getSales(ids.sales);
    await assert.rejects(() => tx.getCurrentSalesReferenceFacts!(liveDraft()), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" }); });
  assert.equal(connections, 1); assert.equal(released, 1); assert.equal(calls.filter(sql => /BEGIN/.test(sql)).length, 1); assert.equal(calls.filter(sql => sql === "COMMIT").length, 1);
  await assert.rejects(() => escaped!.getCurrentSalesReferenceFacts!(liveDraft()), { code: "TRANSACTION_SCOPE" }); assert.ok(!calls.some(sql => sql.includes("native-sales-facts:")));
});

test("native sales UoW/service: real seam uses one original scripted client through locks, explicit completeness, SAVE/audit/receipt and commit", async () => {
  const f = pgFixture(); const calls: string[] = []; let connections = 0, released = 0, completeCalls = 0, sequence = 9000;
  let escapedQuery: NativeSalesFactQuery | undefined;
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push(sql);
    if (sql.includes("document-number:validate")) return { rows: [{ number: "V2-XS-000000000001", actor_account_id: actor.accountId }], rowCount: 1 };
    if (sql.includes("native-sales-facts:customer")) assert.match(sql, /NOT naijue_erp\.is_exact_historical_customer_only\(customer\.id\)/);
    if (sql.includes("sales:current-schema")) return { rows: [{ current_sales_schema_ready: true }], rowCount: 1 };
    if (sql.includes("native-sales-facts:") || sql.includes("SYNTHETIC-persisted-completeness")) return f.query(sql, values);
    if (sql.includes("sales-authorization:identity")) return { rows: [{ account_id: actor.accountId, staff_id: syntheticSalesIdentity().staffId, login_enabled: true, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }], rowCount: 1 };
    if (sql.includes("sales-authorization:hall")) return { rows: [{ id: ids.hall, enabled: true }], rowCount: 1 };
    return { rows: [], rowCount: /^INSERT INTO/.test(sql) ? 1 : 0 };
  }, release() { released++; } };
  const pool = { async connect() { connections++; return client; } };
  const uow = new PostgresSalesUnitOfWork(pool, { historicalCustomerExclusion: { profile: "historical-customer-exact2-v26", assertVerified(target) { assert.equal(target, pool); } }, catalogueCompleteness: { async assertComplete(context) {
    completeCalls++; escapedQuery = context.query; assert.ok(calls.every(sql => !/^INSERT INTO/.test(sql))); assert.deepEqual(context.productIds, [product]);
    await context.query("/* SYNTHETIC-persisted-completeness */ SELECT true AS complete");
  } } });
  const service = createSalesService({ unitOfWork: uow, rules, authorization: { async assertAllowed(context, _action, doc, tx) {
    assert.equal(context.accountId, actor.accountId); assert.equal(doc.header.hallId, ids.hall); const identity = await tx!.getCurrentSalesIdentity(context.accountId); assert.equal(identity?.loginEnabled, true);
  } }, now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++) });
  const result = await service.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC-native-original-client", expectedVersion: null, draft: { ...liveDraft(), header: { ...liveDraft().header, number: "V2-XS-000000000001" } } });
  assert.equal(result.status, "DRAFT"); assert.equal(connections, 1); assert.equal(released, 1); assert.equal(completeCalls, 1);
  assert.equal(calls[0], "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.equal(calls.at(-1), "COMMIT");
  assert.equal(calls.filter(sql => sql.includes("sales-authorization:identity")).length, 1);
  assert.equal(calls.filter(sql => /^INSERT INTO naijue_erp.sales_header/.test(sql)).length, 1);
  assert.equal(calls.filter(sql => /^INSERT INTO naijue_erp.audit_change/.test(sql)).length, 1);
  assert.equal(calls.filter(sql => /^INSERT INTO naijue_erp.operation_receipt/.test(sql)).length, 1);
  assert.ok(!calls.some(sql => /INSERT INTO naijue_erp.inventory_balance|inventory_ledger/.test(sql)));
  await assert.rejects(async () => escapedQuery!("SELECT 1"), { code: "TRANSACTION_CLOSED" });
});
test("native sales UoW/service: unproven complete prices reject before native writes and roll back the same client", async () => {
  const f = pgFixture(); const calls: string[] = []; let releases = 0, sequence = 9500;
  const client: PgSalesClient = { async query(sql, values = []) { calls.push(sql);
    if (sql.includes("sales:current-schema")) return { rows: [{ current_sales_schema_ready: true }], rowCount: 1 };
    if (sql.includes("native-sales-facts:")) return f.query(sql, values);
    if (sql.includes("sales-authorization:identity")) return { rows: [{ account_id: actor.accountId, staff_id: syntheticSalesIdentity().staffId, login_enabled: true, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }], rowCount: 1 };
    if (sql.includes("sales-authorization:hall")) return { rows: [{ id: ids.hall, enabled: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release() { releases++; } };
  const uow = new PostgresSalesUnitOfWork({ async connect() { return client; } }, { catalogueCompleteness: { async assertComplete() { throw Object.assign(new Error("SYNTHETIC unpublished catalogue"), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" }); } } });
  const service = createSalesService({ unitOfWork: uow, rules, authorization: { async assertAllowed() {} }, now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++) });
  await assert.rejects(() => service.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC-unpublished-catalogue", expectedVersion: null, draft: liveDraft() }), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  assert.equal(calls.at(-1), "ROLLBACK"); assert.ok(!calls.some(sql => /^INSERT|^UPDATE/.test(sql))); assert.equal(releases, 1);
});

test("native method intent: runtime SAVE unchanged/amount and APPROVE reject account reassignment without effects; same method rename is identity-stable", async () => {
  const store = new SyntheticStore(); let currentMethod = method, sequence = 11000;
  const uow = { transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> { return store.transaction(tx => work({ ...tx,
    async getCurrentSalesReferenceFacts(document) { const value = nativeFacts(document); return { ...value, paymentAccounts: value.paymentAccounts.map(account => ({ ...account, methodId: currentMethod })) }; }
  })); } };
  const service = createSalesService({ unitOfWork: uow, rules, authorization: { async assertAllowed() {} }, now: () => "2026-10-21T08:00:00Z", newId: kind => sid(kind, sequence++) });
  const draft = liveDraft(); await service.execute({ action: "SAVE", actor, draft, expectedVersion: null, requestKey: "known-method" });
  // A renamed method retains this same identity; no method labels participate in validation.
  await rules.assertDraftChange(undefined, draft, txFacts(nativeFacts()));
  currentMethod = sid("paymentMethod", 11001); const before = store.snapshot();
  for (const amount of [draft.settlements[0]!.amount, minorAmount("99")]) await assert.rejects(() => service.execute({ action: "SAVE", actor,
    draft: { ...draft, settlements: draft.settlements.map(row => ({ ...row, amount })) }, expectedVersion: version(1), requestKey: `method-save-${amount}` }), { code: "SETTLEMENT_METHOD_MISMATCH" });
  await assert.rejects(() => service.execute({ action: "APPROVE", actor, salesId: ids.sales, expectedVersion: version(1), requestKey: "method-approve" }), { code: "SETTLEMENT_METHOD_MISMATCH" });
  assert.deepEqual(store.snapshot(), before);
  const unknown = { ...draft, settlements: draft.settlements.map(row => ({ ...row, paymentMethodId: null })) };
  await assert.rejects(() => service.execute({ action: "SAVE", actor, draft: unknown, expectedVersion: version(1), requestKey: "unknown-runtime" }), { code: "INVALID_SETTLEMENT" });
  await assert.rejects(async () => rules.assertDraftChange(undefined, unknown, txFacts(nativeFacts())), { code: "SETTLEMENT_METHOD_MISMATCH" });
});
test("native method intent: first SAVE retains selected M1 intent and rejects actual M2 before any document/receipt/effect", async () => {
  const store = new SyntheticStore(); const before = store.snapshot(); let sequence = 12000;
  const service = createSalesService({ unitOfWork: { transaction<T>(work: (tx: SalesTransaction) => Promise<T>) { return store.transaction(tx => work({ ...tx,
    async getCurrentSalesReferenceFacts(document) { const value = nativeFacts(document); return { ...value,
      paymentAccounts: value.paymentAccounts.map(account => ({ ...account, methodId: sid("paymentMethod", 12001) })) }; }
  })); } }, rules, authorization: { async assertAllowed() {} }, now: () => "2026-10-21T08:03:00Z", newId: kind => sid(kind, sequence++) });
  await assert.rejects(() => service.execute({ action: "SAVE", actor, draft: liveDraft(), expectedVersion: null, requestKey: "new-selected-method-race" }), { code: "SETTLEMENT_METHOD_MISMATCH" });
  assert.deepEqual(store.snapshot(), before);
});

test("exact2 native sales facts: original object proof selects same-client predicate and propagates missing source/function", async () => {
  const target = {}, fixture = pgFixture(); let verified = 0;
  const capability = { profile: "historical-customer-exact2-v26" as const, assertVerified(actual: object) { assert.equal(actual, target); verified++; } };
  for (const failure of [undefined, "absent", "function"] as const) {
    let called = false;
    const query: NativeSalesFactQuery = async (sql, values) => {
      if (sql.includes("native-sales-facts:customer")) {
        called = true; assert.match(sql, /AND NOT naijue_erp\.is_exact_historical_customer_only\(customer\.id\) FOR SHARE$/);
        if (failure === "absent") return { rows: [], rowCount: 0 };
        if (failure === "function") throw Object.assign(Error("SYNTHETIC unavailable predicate"), { code: "42883" });
      }
      return fixture.query(sql, values);
    };
    const reader = new PostgresNativeSalesFacts(query, () => {}, () => [], { async assertComplete() {} }, { target, capability });
    if (failure) await assert.rejects(reader.load(fixture.draft), { code: failure === "absent" ? "SALES_REFERENCE_UNAVAILABLE" : "42883" });
    else assert.equal((await reader.load(fixture.draft)).customer.id, ids.customer);
    assert.equal(called, true);
  }
  assert.equal(verified, 3);
  assert.throws(() => new PostgresNativeSalesFacts(fixture.query, () => {}, () => [], undefined, { target: {}, capability }), /same reference|reference-equal|strictly equal|Values have same structure/);
});
test("exact2 sales UoW: renewed object proof failure releases borrowed client before any SQL or callback", async () => {
  let verified = 0, connects = 0, released = 0, queried = 0, entered = false; const failure = Error("SYNTHETIC proof revoked");
  const pool = { async connect() { connects++; return { async query() { queried++; return { rows: [], rowCount: 0 }; }, release(error?: Error | boolean) { released++; assert.equal(error, failure); } }; } };
  const uow = new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: { async assertComplete() {} }, historicalCustomerExclusion: {
    profile: "historical-customer-exact2-v26", assertVerified(target) { assert.equal(target, pool); if (++verified > 1) throw failure; }
  } });
  await assert.rejects(uow.transaction(async () => { entered = true; }), error => error === failure);
  assert.equal(connects, 1); assert.equal(released, 1); assert.equal(queried, 0); assert.equal(entered, false);
});

test("approved LIVE SAVE requires actual in-job salesperson; legacy NULL approval and committed-key recovery stay separate", async () => {
  const legacy = syntheticDraft(), current = nativeFacts(legacy);
  await assert.rejects(async () => rules.assertDraftChange(undefined, legacy, txFacts(current)), { code: "SALES_REFERENCE_UNAVAILABLE" });
  await assert.rejects(async () => rules.assertDraftChange({ ...legacy, header: { ...legacy.header, status: "DRAFT", responsibleStaffId: null, version: version(1), createdByAccountId: actor.accountId, createdHallId: actor.hallId, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", approvedByAccountId: null, approvedAt: null } }, legacy, txFacts(current)), { code: "SALES_REFERENCE_UNAVAILABLE" });
  // Original APPROVE reference/economics policy remains nullable, no new action restriction.
  await rules.assertReferencesAndEconomics({ ...legacy, header: { ...legacy.header, status: "DRAFT", responsibleStaffId: null, version: version(1), createdByAccountId: actor.accountId, createdHallId: actor.hallId, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", approvedByAccountId: null, approvedAt: null } }, txFacts(current));
  const store = new SyntheticStore(); let sequence = 15000, authorized = true;
  const base: SalesDependencies = { unitOfWork: store, rules: SYNTHETIC_RULES, authorization: { async assertAllowed() { if (!authorized) throw Object.assign(new Error('revoked'), {code:'FORBIDDEN'}); } }, now: () => "2026-10-21T00:00:00Z", newId: kind => sid(kind, sequence++) };
  const command = { action: "SAVE" as const, actor, requestKey: "legacy-null-committed", expectedVersion: null, draft: legacy };
  const prior = await createSalesService(base).execute(command), before = store.snapshot();
  const upgraded = createSalesService({ ...base, rules, unitOfWork: { transaction<T>(work: (tx: SalesTransaction) => Promise<T>) {
    return store.transaction(tx => work({ ...tx, async getCurrentSalesReferenceFacts(document) { return nativeFacts(document); } }));
  } } });
  await assert.rejects(() => upgraded.execute({ ...command, requestKey: "new-null-create", draft: { ...legacy, header: { ...legacy.header, id: sid("sales", 16000) }, lines: legacy.lines.map(line => ({ ...line, salesId: sid("sales", 16000) })), settlements: legacy.settlements.map(row => ({ ...row, salesId: sid("sales", 16000) })) } }), { code: "SALES_REFERENCE_UNAVAILABLE" });
  await assert.rejects(() => upgraded.execute({ ...command, requestKey: "new-null-edit", expectedVersion: version(1) }), { code: "SALES_REFERENCE_UNAVAILABLE" });
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(await upgraded.execute(command), prior); assert.deepEqual(store.snapshot(), before);
  authorized = false; await assert.rejects(() => upgraded.execute(command), {code:'FORBIDDEN'}); assert.deepEqual(store.snapshot(), before);
});

// Regression: product maintenance locks product before SKU; sales must agree.
test("native sales catalogue locks are product then SKU after nonlocking discovery", async () => {
 const f=pgFixture({count:201});
 await f.reader.load(f.draft);
 const productAt=f.calls.findIndex(row=>row.sql.includes('native-sales-facts:product */'));
 const skuAt=f.calls.findIndex(row=>row.sql.includes('native-sales-facts:sku */'));
 assert.ok(productAt>=0 && productAt<skuAt, 'all product locks must precede first SKU lock');
 const discovered=f.calls.filter(row=>row.sql.includes('native-sales-facts:sku-products'));
 assert.equal(discovered.length,2);assert.ok(discovered.every(row=>!row.sql.includes('FOR SHARE')));
});

test("native sales association changed between discovery and locking fails closed", async () => {
 const f=pgFixture();
 const query:NativeSalesFactQuery=async(sql,values)=>{
  const result=await f.query(sql,values);
  return sql.includes('native-sales-facts:sku */')?{...result,rows:result.rows.map(row=>({...row,product_id:sid('product',999)}))}:result;
 };
 const reader=new PostgresNativeSalesFacts(query,()=>{},()=>[],{async assertComplete(){throw Error('must reject before completeness');}});
 await assert.rejects(()=>reader.load(f.draft),{code:'SALES_REFERENCE_UNAVAILABLE'});
});
