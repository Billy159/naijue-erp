/** SYNTHETIC only: no database execution or real catalogue publication. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeSalesPreparation, createNativeManualSalesBusinessRules, createNativeSalesExistingPreparation } from "../packages/application/src/native-sales-preparation.ts";
import type { NativeSalesCreateProposal } from "../packages/application/src/native-sales-preparation.ts";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import { salesPreparedDraftFitsSaveBudget } from "../packages/application/src/sales-payload-budget.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import type { SalesDependencies } from "../packages/application/src/ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { minorAmount, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
const product = sid("product", 100), method = sid("paymentMethod", 101);
const proposal = (): NativeSalesCreateProposal => ({ businessType: "SALE", businessDate: "2026-10-21", note: null,
  hallId: ids.hall, warehouseId: ids.warehouse, customerId: ids.customer, salespersonId: null, orderDiscount: "0.00",
  lines: [{ skuId: ids.sku, quantity: "2", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
  settlements: [{ paymentAccountId: ids.payment, paymentMethodId: method, direction: "RECEIVE", amount: "2.50" }] });
function setup() {
  const store = new SyntheticStore(); let sequence = 1000, allowed = true, complete = true, minimum = null as ReturnType<typeof minorAmount> | null;
  let label = snapshot.productName, lookups = 0;
  const dependencies: SalesDependencies = { now: () => "2026-10-21T12:00:00Z", newId: kind => sid(kind, sequence++),
    rules: createNativeManualSalesBusinessRules(), authorization: { async assertAllowed() {
      if (!allowed) throw new DomainError("FORBIDDEN", "SYNTHETIC denied");
    } }, unitOfWork: { transaction(work) { return store.transaction(tx => work({ ...tx,
      async getCurrentSalesSnapshots(skuIds) { lookups++; return new Map(skuIds.map(id => [id, { ...snapshot, productName: label, barcode: "000123" }])); },
      async getCurrentSalesReferenceFacts(draft) {
        lookups++; if (!complete) throw new DomainError("NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "SYNTHETIC missing proof");
        return { salesId: draft.header.id, hall: { id: ids.hall, enabled: true }, customer: { id: ids.customer, enabled: true },
          warehouse: { id: ids.warehouse, hallId: ids.hall, enabled: true }, salesperson: null,
          skus: [...new Set(draft.lines.map(row => row.skuId))].map(id => ({ id, productId: product, enabled: true, snapshot: { ...snapshot, productName: label } })),
          products: [{ id: product, enabled: true, referencePrice: minorAmount("125"), minimumPrice: minimum }],
          paymentAccounts: [{ id: ids.payment, methodId: method, enabled: true, methodEnabled: true }],
          barcodes: draft.lines.map(row => ({ raw: "000123", skuId: row.skuId, enabled: true })), retainedLines: [] };
      }
    })); } } };
  return { store, dependencies, prepare: createNativeSalesPreparation(dependencies), revoke: () => { allowed = false; },
    unprove: () => { complete = false; }, minimum: (value: string) => { minimum = minorAmount(value); },
    label: (value: string) => { label = value; }, lookups: () => lookups };
}
test("SYNTHETIC native SALES prepare is read-only; existing SAVE persists native draft and receipt exactly once", async () => {
  const h = setup(), before = h.store.snapshot(); const draft = await h.prepare.prepareCreate(actor, proposal());
  assert.deepEqual(h.store.snapshot(), before); assert.equal(draft.header.grossAmount, 250n); assert.equal(draft.lines[0]!.referencePrice, 125n);
  assert.equal(draft.lines[0]!.snapshot.barcode, "000123"); assert.match(draft.header.number, /^V2-XS-/);
  const command = { action: "SAVE" as const, actor, expectedVersion: null, requestKey: "native-save", draft };
  const service = createSalesService(h.dependencies); const result = await service.execute(command);
  assert.deepEqual(await service.execute(command), result); assert.equal(h.store.snapshot().headers.size, 1);
  assert.equal(h.store.snapshot().receipts.size, 1); assert.equal(h.store.snapshot().ledger.length, 0);
});
test("SYNTHETIC authorization precedes sensitive preparation facts; missing persisted proof fails closed", async () => {
  const h = setup(); h.revoke(); await assert.rejects(h.prepare.prepareCreate(actor, proposal()), { code: "FORBIDDEN" }); assert.equal(h.lookups(), 0);
  const missing = setup(); missing.unprove(); await assert.rejects(missing.prepare.prepareCreate(actor, proposal()), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  assert.equal(missing.store.snapshot().headers.size, 0); assert.equal(missing.store.snapshot().receipts.size, 0);
});
test("SYNTHETIC revoked proof, scope, changed label and minimum between preparation/SAVE are revalidated with no writes", async () => {
  for (const change of [(h: ReturnType<typeof setup>) => h.revoke(), (h: ReturnType<typeof setup>) => h.unprove(),
    (h: ReturnType<typeof setup>) => h.minimum("126"), (h: ReturnType<typeof setup>) => h.label("SYNTHETIC renamed")]) {
    const h = setup(), draft = await h.prepare.prepareCreate(actor, proposal()), before = h.store.snapshot(); change(h);
    await assert.rejects(createSalesService(h.dependencies).execute({ action: "SAVE", actor, expectedVersion: null, requestKey: "stale", draft }));
    assert.deepEqual(h.store.snapshot(), before);
  }
});
test("SYNTHETIC discount uses current product reference, exact half-up arithmetic and deterministic allocation", async () => {
  const h = setup(), input = proposal(); const draft = await h.prepare.prepareCreate(actor, { ...input, orderDiscount: "0.01",
    lines: [{ ...input.lines[0]!, dealPrice: null, pricingRule: "DISCOUNT", discountTenths: 50 }, { ...input.lines[0]!, quantity: "1" }] });
  assert.equal(draft.lines[0]!.dealPrice, 63n); assert.equal(draft.header.grossAmount, 251n); assert.equal(draft.header.netDue, 250n);
  assert.deepEqual(draft.lines.map(row => row.allocatedDiscount), [1n, 0n]);
});
test("SYNTHETIC 200 lines, Chinese native labels and 10k escaped note fit SAVE; oversized native label explicitly rejects", async () => {
  const h = setup(), input = proposal(); h.label("中文商品标签");
  const draft = await h.prepare.prepareCreate(actor, { ...input, note: "\u0001".repeat(10000), lines: Array.from({ length: 200 }, () => input.lines[0]!) });
  assert.equal(draft.lines.length, 200); assert.ok(salesPreparedDraftFitsSaveBudget(draft));
  h.label("很长".repeat(200000)); await assert.rejects(h.prepare.prepareCreate(actor, input), { code: "SALES_PAYLOAD_TOO_LARGE" });
  assert.equal(h.store.snapshot().headers.size, 0);
});
test("SYNTHETIC invalid signed SALE, ambiguous pricing, unconfirmed zero, wrong selected method reject", async () => {
  const input = proposal();
  for (const changed of [{ ...input, lines: [{ ...input.lines[0]!, quantity: "-1" }] },
    { ...input, lines: [{ ...input.lines[0]!, discountTenths: 50 }] },
    { ...input, lines: [{ ...input.lines[0]!, dealPrice: "0.00" }] },
    { ...input, settlements: [{ ...input.settlements[0]!, paymentMethodId: sid("paymentMethod", 999) }] }]) {
    const h = setup(); await assert.rejects(h.prepare.prepareCreate(actor, changed)); assert.equal(h.store.snapshot().headers.size, 0);
  }
});
test("SYNTHETIC manual SAVE cannot replace prepared MAIN with null or forge a new reference snapshot", async () => {
  for (const change of ["barcode", "reference"] as const) {
    const h = setup(), prepared = await h.prepare.prepareCreate(actor, proposal());
    const draft = { ...prepared, lines: prepared.lines.map(row => change === "barcode"
      ? { ...row, snapshot: { ...row.snapshot, barcode: null } } : { ...row, referencePrice: minorAmount("999") }) };
    await assert.rejects(createSalesService(h.dependencies).execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "forged", draft }), { code: "SALES_SNAPSHOT_MISMATCH" });
    assert.equal(h.store.snapshot().headers.size, 0);
  }
});
test("SYNTHETIC preparation rejects calculated SQL monetary overflow rather than handing off an unsavable draft", async () => {
  const h = setup(), input = proposal();
  await assert.rejects(h.prepare.prepareCreate(actor, { ...input, lines: [{ ...input.lines[0]!, dealPrice: "9999999999999999.99", quantity: "2" }] }), { code: "MONEY_STORAGE_OVERFLOW" });
  assert.equal(h.store.snapshot().headers.size, 0);
});

async function existingSetup() {
  const h = setup(), initial = await h.prepare.prepareCreate(actor, proposal());
  await createSalesService(h.dependencies).execute({ action: "SAVE", actor, expectedVersion: null, requestKey: "existing-seed", draft: initial });
  let loaded: Awaited<ReturnType<import("../packages/application/src/ports.ts").SalesTransaction["getSales"]>>;
  let reference = minorAmount("125"), inspect: import("../packages/application/src/ports.ts").SalesTransaction | undefined;
  const trace: string[] = [], allocated: string[] = [];
  const payment2 = sid("paymentAccount", 120), method2 = sid("paymentMethod", 121);
  const deps: SalesDependencies = { ...h.dependencies, newId: kind => { allocated.push(kind); return h.dependencies.newId(kind); }, unitOfWork: { transaction(work) {
    return h.dependencies.unitOfWork.transaction(original => {
      const tx: import("../packages/application/src/ports.ts").SalesTransaction = { ...original,
        async getSales(id) { trace.push("getSales"); loaded = await original.getSales(id); return loaded; },
        async getCurrentSalesSnapshots(ids) { trace.push("snapshots"); return original.getCurrentSalesSnapshots!(ids); },
        async getCurrentSalesReferenceFacts(draft) { trace.push("facts"); const facts = await original.getCurrentSalesReferenceFacts!(draft);
          return { ...facts, products: facts.products.map(p => ({ ...p, referencePrice: reference })),
            retainedLines: (loaded?.document.lines ?? []).filter(l => l.isCurrent).map(l => ({ id: l.id, skuId: l.skuId, snapshot: l.snapshot })),
            paymentAccounts: [...facts.paymentAccounts, { id: payment2, methodId: method2, enabled: true, methodEnabled: true }] };
        },
        async putRuntimeSales(d) { trace.push("WRITE:document"); return original.putRuntimeSales(d); },
        async insertReceipt(r) { trace.push("WRITE:receipt"); return original.insertReceipt(r); },
        async appendAudit(a) { trace.push("WRITE:audit"); return original.appendAudit(a); },
        async appendLedger(l) { trace.push("WRITE:ledger"); return original.appendLedger(l); },
        async putBalance(b) { trace.push("WRITE:balance"); return original.putBalance(b); },
        async reserveRuntimeDocumentNumber() { trace.push("WRITE:number"); throw Error("MUST_NOT_RESERVE"); }
      }; return work(tx);
    });
  } }, authorization: { async assertAllowed(a, action, document, tx) {
    trace.push("authorize"); inspect = tx; await h.dependencies.authorization.assertAllowed(a, action, document, tx);
    if (document.header.hallId !== ids.hall) throw new DomainError("FORBIDDEN", "SYNTHETIC proposed scope denied");
  } } };
  const input = (): import("../packages/application/src/native-sales-preparation.ts").NativeSalesExistingProposal => ({ ...proposal(), salesId: initial.header.id, expectedVersion: 1,
    lines: proposal().lines.map(l => ({ ...l, existingLineId: initial.lines[0]!.id })), settlements: proposal().settlements.map(s => ({ ...s, existingSettlementId: initial.settlements[0]!.id })) });
  return { ...h, deps, initial, input, trace, allocated, payment2, method2,
    existing: createNativeSalesExistingPreparation(deps), reference: (s: string) => { reference = minorAmount(s); }, inspect: () => inspect,
    async changeDocument(change: (d: import("../packages/domain/src/documents.ts").SalesDocument) => import("../packages/domain/src/documents.ts").SalesDocument) {
      await h.store.transaction(async tx => { const stored = await tx.getSales(initial.header.id); await tx.putRuntimeSales(change(stored!.document)); });
    } };
}
test("SYNTHETIC existing prepare preserves actual id/number/old snapshot/reference, rechecks economics and has zero business writes", async () => {
  const h = await existingSetup(), before = h.store.snapshot(); h.label("SYNTHETIC current renamed"); h.reference("999");
  const original = h.input(), input = { ...original, lines: [{ ...original.lines[0]!, dealPrice: null, pricingRule: "DISCOUNT" as const, discountTenths: 50 }] };
  const prepared = await h.existing.prepareExisting(actor, input);
  assert.deepEqual(h.store.snapshot(), before); assert.deepEqual(Object.keys(prepared).sort(), ["draft", "expectedVersion"]);
  assert.equal(prepared.expectedVersion, 1); assert.equal(prepared.draft.header.id, h.initial.header.id); assert.equal(prepared.draft.header.number, h.initial.header.number);
  assert.equal(prepared.draft.lines[0]!.id, h.initial.lines[0]!.id); assert.deepEqual(prepared.draft.lines[0]!.snapshot, h.initial.lines[0]!.snapshot);
  assert.equal(prepared.draft.lines[0]!.referencePrice, 125n); assert.equal(prepared.draft.lines[0]!.dealPrice, 63n);
  assert.equal(prepared.draft.settlements[0]!.id, h.initial.settlements[0]!.id);
  assert.deepEqual(h.allocated, ["operation"]); assert.ok(!h.trace.some(v => v.startsWith("WRITE:"))); assert.ok(!h.trace.includes("snapshots"));
  assert.equal(h.trace.filter(v => v === "authorize").length, 2);
  assert.throws(() => h.inspect()!.getSales(h.initial.header.id), { code: "TRANSACTION_CLOSED" });
});
test("SYNTHETIC existing prepare new/replaced SKU ids are server assigned, original rows remain retained on actual SAVE", async () => {
  const h = await existingSetup(), input = h.input(), before = h.store.snapshot();
  const changed = { ...input, lines: [{ ...input.lines[0]!, skuId: ids.sku2 }, { ...input.lines[0]!, existingLineId: null, quantity: "1" }],
    settlements: [{ ...input.settlements[0]!, paymentAccountId: h.payment2, paymentMethodId: h.method2 }] };
  const p = await h.existing.prepareExisting(actor, changed); assert.deepEqual(h.store.snapshot(), before);
  assert.deepEqual(p.draft.lines.map(l => l.skuId), [ids.sku2, ids.sku]); assert.deepEqual(p.draft.lines.map(l => l.lineNo), [1, 2]);
  assert.ok(p.draft.lines.every(l => l.id !== h.initial.lines[0]!.id)); assert.notEqual(p.draft.lines[0]!.id, p.draft.lines[1]!.id);
  assert.notEqual(p.draft.settlements[0]!.id, h.initial.settlements[0]!.id); assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
  await createSalesService(h.deps).execute({ action: "SAVE", actor, expectedVersion: version(p.expectedVersion), requestKey: "save-existing", draft: p.draft });
  const saved = h.store.snapshot(), retained = saved.lines.get(h.initial.lines[0]!.id)!;
  assert.equal(retained.isCurrent, false); assert.deepEqual(retained.snapshot, h.initial.lines[0]!.snapshot); assert.equal(retained.skuId, ids.sku);
});
test("SYNTHETIC existing prepare rejects foreign, duplicate and noncurrent pointers plus unknown same-account method without mutations", async () => {
  const h = await existingSetup(), input = h.input();
  for (const change of [
    { ...input, lines: [{ ...input.lines[0]!, existingLineId: sid("salesLine", 999) }] },
    { ...input, lines: [input.lines[0]!, input.lines[0]!] },
    { ...input, settlements: [{ ...input.settlements[0]!, existingSettlementId: sid("settlement", 999) }] },
    { ...input, settlements: [input.settlements[0]!, input.settlements[0]!] }
  ]) { const before = h.store.snapshot(); await assert.rejects(h.existing.prepareExisting(actor, change), { code: "INVALID_HTTP_INPUT" }); assert.deepEqual(h.store.snapshot(), before); }
  await h.changeDocument(d => ({ ...d, lines: d.lines.map(l => ({ ...l, isCurrent: false })) }));
  await assert.rejects(h.existing.prepareExisting(actor, input), { code: "INVALID_HTTP_INPUT" });
  const unknown = await existingSetup(); await unknown.changeDocument(d => ({ ...d, settlements: d.settlements.map(s => ({ ...s, paymentMethodId: null })) }));
  const before = unknown.store.snapshot(); await assert.rejects(unknown.existing.prepareExisting(actor, unknown.input()), { code: "IMMUTABLE_SETTLEMENT_METHOD" }); assert.deepEqual(unknown.store.snapshot(), before);
  assert.ok(!h.trace.some(v => v.startsWith("WRITE:"))); assert.ok(!unknown.trace.some(v => v.startsWith("WRITE:")));
});
test("SYNTHETIC existing prepare gates original and proposed authority, actual version/state and HISTORY before facts", async () => {
  const revoked = await existingSetup(); revoked.revoke(); await assert.rejects(revoked.existing.prepareExisting(actor, revoked.input()), { code: "FORBIDDEN" }); assert.ok(!revoked.trace.includes("facts"));
  const moved = await existingSetup(); await assert.rejects(moved.existing.prepareExisting(actor, { ...moved.input(), hallId: sid("hall", 999) }), { code: "FORBIDDEN" }); assert.ok(!moved.trace.includes("facts"));
  const versioned = await existingSetup(); await assert.rejects(versioned.existing.prepareExisting(actor, { ...versioned.input(), expectedVersion: 2 }), { code: "VERSION_CONFLICT" }); assert.ok(!versioned.trace.includes("facts"));
  const approved = await existingSetup(); await approved.changeDocument(d => ({ ...d, header: { ...d.header, status: "APPROVED" } }));
  await assert.rejects(approved.existing.prepareExisting(actor, approved.input()), { code: "INVALID_STATE" });
  const history = await existingSetup(); const row = await history.store.transaction(tx => tx.getSales(history.initial.header.id)); history.store.seedCutoffHistory(row!.document);
  await assert.rejects(history.existing.prepareExisting(actor, history.input()), { code: "HISTORICAL_POSTING_NOT_IMPLEMENTED" }); assert.ok(!history.trace.includes("facts"));
});
test("SYNTHETIC existing prepare forbids caught policy write/number attempts and preserves the complete original input", async () => {
  const h = await existingSetup(), input = h.input(), beforeInput = structuredClone(input), before = h.store.snapshot();
  const malicious = createNativeSalesExistingPreparation({ ...h.deps, rules: { ...h.deps.rules, async assertDraftChange(_prior, draft, tx) {
    try { await tx!.reserveRuntimeDocumentNumber!({ kind: "SALES", documentId: draft.header.id, actorAccountId: actor.accountId }); } catch { /* A provider cannot hide a forbidden attempt. */ }
  } } });
  await assert.rejects(malicious.prepareExisting(actor, input), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  assert.deepEqual(input, beforeInput); assert.deepEqual(h.store.snapshot(), before); assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
});
test("SYNTHETIC existing prepare keeps independent signed RETURN/EXCHANGE intent, minimum enforcement and original SAVE budget", async () => {
  const h = await existingSetup(), input = h.input();
  for (const businessType of ["RETURN", "EXCHANGE"] as const) {
    const result = await h.existing.prepareExisting(actor, { ...input, businessType, lines: [{ ...input.lines[0]!, quantity: "-2" }] });
    assert.equal(result.draft.header.grossAmount, -250n); assert.equal(result.draft.lines[0]!.allocatedDiscount, 0n);
  }
  h.minimum("126"); await assert.rejects(h.existing.prepareExisting(actor, input), { code: "BELOW_MINIMUM_PRICE" });
  h.minimum("0"); h.label("very long".repeat(100000));
  await assert.rejects(h.existing.prepareExisting(actor, { ...input, lines: [{ ...input.lines[0]!, existingLineId: null }] }), { code: "SALES_PAYLOAD_TOO_LARGE" });
  assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
});

import {fixture as v16SalesFixture, syntheticDraft as v16SalesDraft, actor as v16SalesActor, ids as v16SalesIds, sid as v16SalesId} from './support/synthetic-fixtures.ts';

test("sales ignores independent responsible intent while preserving stored legacy facts and true creator",async()=>{
 const f=v16SalesFixture(),d=v16SalesDraft(),legacy=v16SalesId('staff',7001),other=v16SalesId('staff',7002);
 await f.service.execute({action:'SAVE',actor:v16SalesActor,requestKey:'sales-original',expectedVersion:null,draft:d});
 assert.equal(f.document().header.responsibleStaffId,null);
 // Synthetic setup represents a previously stored v16 value; no new sales command assigns it.
 const old=f.document();await f.store.transaction(tx=>tx.putRuntimeSales({...old,header:{...old.header,responsibleStaffId:legacy}}));
 const q={action:'SAVE' as const,actor:v16SalesActor,requestKey:'sales-legacy-payload',expectedVersion:version(1),draft:{...d,header:{...d.header,responsibleStaffId:other}}};
 const r=await f.service.execute(q);assert.deepEqual(await f.service.execute(q),r);
 assert.equal(f.document().header.responsibleStaffId,legacy);assert.equal(f.document().header.createdByAccountId,v16SalesActor.accountId);
 assert.equal(f.document().header.salespersonId,d.header.salespersonId);assert.equal(f.document().header.netDue,d.header.netDue);assert.equal(f.store.snapshot().ledger.length,0);
 await f.service.execute({action:'SAVE',actor:v16SalesActor,requestKey:'sales-omit',expectedVersion:version(2),draft:d});
 assert.equal(f.document().header.responsibleStaffId,legacy);const audit=f.store.snapshot().audit.at(-2)!;
 assert.equal(audit.before!.header.responsibleStaffId,undefined);assert.equal(audit.after.header.responsibleStaffId,undefined); // compact audit emits no unchanged legacy responsibility delta
 assert.equal(v16SalesIds.sales,f.document().header.id);
});

import {PostgresSalesQueryReader as V16SalesReader} from '../adapters/postgres/src/sales-query-reader.ts';
test('v16 LIVE sales read: real creator label and nullable responsible label remain distinct',async()=>{
 const calls:string[]=[];let releases=0;
 const row={id:v16SalesIds.sales,number:'SYNTHETIC',business_type:'SALE',business_date:'2026-10-20',hall_id:v16SalesIds.hall,customer_id:v16SalesIds.customer,salesperson_id:null,warehouse_id:v16SalesIds.warehouse,status:'DRAFT',version:1,gross_amount:'2.50',order_discount:'0.00',net_due:'2.50',updated_at:'2026-10-20T00:00:00Z',hall_name:'H',warehouse_name:'W',customer_name:'C',salesperson_name:null,responsible_staff_id:null,responsible_name:null,created_by_name:'TRUE STORED CREATOR'};
 const reader=new V16SalesReader({async connect(){return{async query(sql:string){calls.push(sql);const rows=sql.startsWith('SELECT COUNT')?[{exact_total:'1'}]:sql.startsWith('SELECT page.id')?[{sales_id:v16SalesIds.sales,quantity:'2',incoming_quantity:'0',outgoing_quantity:'2'}]:sql.startsWith('SELECT h.id')?[row]:[];return{rows,rowCount:rows.length};},release(){releases++;}};}});
 const page=await reader.readList({actor:v16SalesActor,scope:{kind:'all'},signal:new AbortController().signal,parameters:{filter:{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null},page:1,pageSize:20}});
 assert.equal(page.items[0]!.createdByName,'TRUE STORED CREATOR');assert.equal(page.items[0]!.responsibleStaffId,null);assert.equal(page.items[0]!.responsibleName,null);
 assert.ok(calls.some(sql=>sql.includes('creator_account.id=h.created_by_account_id')&&sql.includes('creator.id=creator_account.staff_id')));assert.equal(releases,1);
});

import {parseNativeSalesSaveProposal} from '../packages/application/src/native-sales-preparation.ts';
import {parseSalesCommand} from '../apps/api/src/input.ts';
test('sales public proposals reject independent responsible input and keep salesperson/creator contracts',()=>{
 const p=proposal(),body={...p,salesId:null,lines:p.lines.map(row=>({...row,existingLineId:null})),settlements:p.settlements.map(row=>({...row,existingSettlementId:null}))};
 const parsed=parseNativeSalesSaveProposal(body);assert.equal(parsed.salespersonId,p.salespersonId);
 assert.throws(()=>parseNativeSalesSaveProposal({...body,responsibleStaffId:sid('staff',7001)}));
 assert.throws(()=>parseNativeSalesSaveProposal({...body,createdByAccountId:actor.accountId}));
 const d=v16SalesDraft(),wire=JSON.parse(JSON.stringify(d,(_k,v)=>typeof v==='bigint'?v.toString():v));
 assert.throws(()=>parseSalesCommand({action:'SAVE',requestKey:'sales-old-header',expectedVersion:null,draft:{...wire,header:{...wire.header,responsibleStaffId:sid('staff',7001)}}},actor));
});
