/** SYNTHETIC only: no database execution or real catalogue publication. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeSalesPreparation, createNativeManualSalesBusinessRules, createNativeSalesExistingPreparation, prepareNativeSalesOnTransaction } from "../packages/application/src/native-sales-preparation.ts";
import type { NativeSalesCreateProposal } from "../packages/application/src/native-sales-preparation.ts";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import { salesPreparedDraftFitsSaveBudget } from "../packages/application/src/sales-payload-budget.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import type { SalesDependencies } from "../packages/application/src/ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { minorAmount, version, quantity } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
const product = sid("product", 100), method = sid("paymentMethod", 101);
const proposal = (): NativeSalesCreateProposal => ({ businessType: "SALE", businessDate: "2026-10-21", note: null,
  hallId: ids.hall, warehouseId: ids.warehouse, customerId: ids.customer, salespersonId: sid("staff", 102), orderDiscount: "0.00",
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
          warehouse: { id: ids.warehouse, hallId: ids.hall, enabled: true }, salesperson: draft.header.salespersonId === null ? null : { id: draft.header.salespersonId, employmentStatus: "在职" },
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
test("SYNTHETIC existing prepare gates original and proposed authority, actual version/state before facts; imported drafts share ordinary preparation", async () => {
  const revoked = await existingSetup(); revoked.revoke(); await assert.rejects(revoked.existing.prepareExisting(actor, revoked.input()), { code: "FORBIDDEN" }); assert.ok(!revoked.trace.includes("facts"));
  const moved = await existingSetup(); await assert.rejects(moved.existing.prepareExisting(actor, { ...moved.input(), hallId: sid("hall", 999) }), { code: "FORBIDDEN" }); assert.ok(!moved.trace.includes("facts"));
  const versioned = await existingSetup(); await assert.rejects(versioned.existing.prepareExisting(actor, { ...versioned.input(), expectedVersion: 2 }), { code: "VERSION_CONFLICT" }); assert.ok(!versioned.trace.includes("facts"));
  const approved = await existingSetup(); await approved.changeDocument(d => ({ ...d, header: { ...d.header, status: "APPROVED" } }));
  await assert.rejects(approved.existing.prepareExisting(actor, approved.input()), { code: "INVALID_STATE" });
  const history = await existingSetup(); const row = await history.store.transaction(tx => tx.getSales(history.initial.header.id)); history.store.seedCutoffHistory(row!.document);
  const importedPrepared = await history.existing.prepareExisting(actor, history.input());
  assert.equal(importedPrepared.draft.header.id, history.initial.header.id); assert.ok(history.trace.includes("facts")); assert.ok(!history.trace.some(v => v.startsWith("WRITE:")));
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
 const creatorJoin=calls.find(sql=>sql.includes('creator_account.id=h.created_by_account_id'));
 assert.ok(creatorJoin);assert.ok(creatorJoin.includes("creator.id=CASE WHEN to_jsonb(h) ? 'created_by_staff_id' THEN (to_jsonb(h)->>'created_by_staff_id')::uuid ELSE creator_account.staff_id END"));
 // Column presence selects stored historical staff even when that value is NULL.
 // Legacy account.staff_id fallback is allowed only when the column is absent;
 // COALESCE on a present-but-unknown staff field would fabricate original identity.
 assert.ok(!/COALESCE\s*\([^)]*created_by_staff_id/i.test(creatorJoin));assert.equal(releases,1);
});

import {parseNativeSalesSaveProposal} from '../packages/application/src/native-sales-preparation.ts';
import {parseSalesCommand} from '../apps/api/src/input.ts';
test('T02 atomic SAVE parser preserves legacy null and exact discount quote without new fields',()=>{
 const p=proposal(),base={...p,salesId:null,lines:p.lines.map(row=>({...row,existingLineId:null,pricingRule:'DISCOUNT',discountTenths:80,dealPrice:null})),settlements:[]};
 const legacy=parseNativeSalesSaveProposal(base);assert.equal(legacy.lines[0]!.dealPrice,null);
 const quoted={...base,lines:[{...base.lines[0]!,dealPrice:'1.00'}]},parsed=parseNativeSalesSaveProposal(quoted);
 assert.equal(parsed.lines[0]!.dealPrice,'1.00');assert.deepEqual(Object.keys(parsed.lines[0]!).sort(),Object.keys(quoted.lines[0]!).sort());
 assert.equal(parseNativeSalesSaveProposal({...base,lines:[{...base.lines[0]!,dealPrice:'1'}]}).lines[0]!.dealPrice,'1'); // Existing exact money syntax remains unchanged.
 for(const dealPrice of ['1.001',1,false])assert.throws(()=>parseNativeSalesSaveProposal({...base,lines:[{...base.lines[0]!,dealPrice}]}));
 assert.throws(()=>parseNativeSalesSaveProposal({...base,lines:[{...base.lines[0]!,expectedReferencePrice:'1.25'}]}));
});
test('sales public proposals reject independent responsible input and keep salesperson/creator contracts',()=>{
 const p=proposal(),body={...p,salesId:null,lines:p.lines.map(row=>({...row,existingLineId:null})),settlements:p.settlements.map(row=>({...row,existingSettlementId:null}))};
 const parsed=parseNativeSalesSaveProposal(body);assert.equal(parsed.salespersonId,p.salespersonId);
 assert.throws(()=>parseNativeSalesSaveProposal({...body,responsibleStaffId:sid('staff',7001)}));
 assert.throws(()=>parseNativeSalesSaveProposal({...body,createdByAccountId:actor.accountId}));
 const d=v16SalesDraft(),wire=JSON.parse(JSON.stringify(d,(_k,v)=>typeof v==='bigint'?v.toString():v));
 assert.throws(()=>parseSalesCommand({action:'SAVE',requestKey:'sales-old-header',expectedVersion:null,draft:{...wire,header:{...wire.header,responsibleStaffId:sid('staff',7001)}}},actor));
});

test('approved new/live-existing prepare rejects NULL salesperson before any number reservation or business save', async () => {
  const fresh = setup(), before = fresh.store.snapshot(); let reserved = 0;
  const deps: SalesDependencies = { ...fresh.dependencies, unitOfWork: { transaction(work) { return fresh.dependencies.unitOfWork.transaction(tx => work({ ...tx, async reserveRuntimeDocumentNumber() { reserved++; throw Error('Must not reserve'); } })); } } };
  await assert.rejects(() => createNativeSalesPreparation(deps).prepareCreate(actor, { ...proposal(), salespersonId: null }), {code:'SALES_REFERENCE_UNAVAILABLE'});
  assert.equal(reserved,0); assert.deepEqual(fresh.store.snapshot(),before);
  const existing = await existingSetup();
  const state = existing.store.snapshot();
  await assert.rejects(() => existing.existing.prepareExisting(actor, { ...existing.input(), salespersonId: null }), {code:'SALES_REFERENCE_UNAVAILABLE'});
  assert.deepEqual(existing.store.snapshot(),state);
});

test('SYNTHETIC historical signed SALE metadata prepare/save keeps exact refund and historical identity',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),netDue:minorAmount('-250')},lines:h.initial.lines.map(l=>({...l,quantity:quantity((-l.quantity).toString()),lineAmount:minorAmount((-l.lineAmount).toString())})),settlements:h.initial.settlements.map(s=>({...s,direction:'REFUND' as const}))};
 h.store.seedCutoffHistory(old);const input={...h.input(),note:'retained history',lines:h.input().lines.map(l=>({...l,quantity:'-2'})),settlements:h.input().settlements.map(s=>({...s,direction:'REFUND' as const}))};
 const {expectedVersion:ignored,...rawProposal}=input;
 const nativeProposal=parseNativeSalesSaveProposal(rawProposal);
 const nativeDraft=await h.deps.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'synthetic-readonly-prepare-bind');return prepareNativeSalesOnTransaction(h.deps,tx,actor,nativeProposal,old.header.id,await tx.getSales(old.header.id),[ids.sku]);});
 assert.deepEqual(nativeDraft.lines,old.lines);assert.deepEqual(nativeDraft.settlements,old.settlements);
 const p=await h.existing.prepareExisting(actor,input);assert.deepEqual(p.draft.lines,old.lines);assert.deepEqual(p.draft.settlements,old.settlements);
 await createSalesService(h.deps).execute({action:'SAVE',actor,requestKey:'historical-note',expectedVersion:version(1),draft:p.draft});
 const saved=h.store.snapshot();assert.equal(saved.stockBasis.get(old.header.id),'CUTOFF_HISTORY');assert.equal(saved.headers.get(old.header.id)!.netDue,-250n);assert.deepEqual([...saved.settlements.values()],old.settlements);
 // Superseded preservation-only restriction: latest user permits complete economic edits.
 const changed=await h.existing.prepareExisting(actor,{...input,expectedVersion:2,lines:input.lines.map(l=>({...l,quantity:'-3'}))});assert.equal(changed.draft.header.netDue,-375n);assert.equal(changed.draft.header.businessType,'SALE');
});

test('historical signed SALE approve/refund and runtime reversal use preserved signs',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),netDue:minorAmount('-250')},lines:actual.lines.map(l=>({...l,quantity:quantity((-l.quantity).toString()),lineAmount:minorAmount((-l.lineAmount).toString())})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const}))};h.store.seedCutoffHistory(old);
 h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity("0"),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
 const service=createSalesService(h.deps);
 await service.execute({action:'APPROVE',actor,salesId:old.header.id,expectedVersion:version(1),requestKey:'history-approve'});
 assert.equal(h.store.snapshot().ledger[0]!.quantityDelta,2n);
 await service.execute({action:'UNAPPROVE',actor,salesId:old.header.id,expectedVersion:version(2),requestKey:'history-unapprove'});
 assert.equal(h.store.snapshot().ledger[1]!.quantityDelta,-2n);
 await service.execute({action:'APPROVE',actor,salesId:old.header.id,expectedVersion:version(3),requestKey:'history-reapprove'});
 assert.equal(h.store.snapshot().ledger[2]!.quantityDelta,2n);assert.deepEqual([...h.store.snapshot().settlements.values()],old.settlements);
});

test('historical metadata proposal preserves factual NULL pricing instead of inventing values',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),netDue:minorAmount('-250')},lines:actual.lines.map(l=>({...l,quantity:quantity((-l.quantity).toString()),lineAmount:minorAmount((-l.lineAmount).toString()),pricingRule:null,zeroConfirmed:null,isGift:null,allocatedDiscount:null})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),note:'retain unknowns',lines:h.input().lines.map(l=>({...l,quantity:'-2',pricingRule:null,zeroConfirmed:null,isGift:null})),settlements:h.input().settlements.map(s=>({...s,direction:'REFUND' as const}))};
 const p=await h.existing.prepareExisting(actor,input);assert.deepEqual(p.draft.lines,old.lines);
 const {expectedVersion:ignored,...raw}=input;const proposal=parseNativeSalesSaveProposal(raw);
 const d=await h.deps.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'synthetic-readonly-prepare-bind');return prepareNativeSalesOnTransaction(h.deps,tx,actor,proposal,old.header.id,await tx.getSales(old.header.id),[ids.sku]);});assert.deepEqual(d.lines,old.lines);
 // Latest instruction supersedes SAVE rejection: preserve NULLs in an incomplete draft, gate approval separately.
 const incomplete=await h.existing.prepareExisting(actor,{...input,lines:input.lines.map(l=>({...l,dealPrice:'2.00'}))});assert.equal(incomplete.draft.lines[0]!.pricingRule,null);assert.equal(incomplete.draft.header.netDue,-400n);
});

test('signed-sales successor: historical SALE quantity edit saves unbalanced draft then rejects approval with exact difference',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),netDue:minorAmount('-250')},lines:actual.lines.map(l=>({...l,quantity:quantity('-2'),lineAmount:minorAmount('-250')})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),lines:h.input().lines.map(l=>({...l,quantity:'-3'})),settlements:h.input().settlements.map(s=>({...s,direction:'REFUND' as const}))};
 const result=await h.existing.prepareExisting(actor,input);assert.equal(result.draft.header.businessType,'SALE');assert.equal(result.draft.header.netDue,-375n);assert.equal(result.draft.lines[0]!.id,old.lines[0]!.id);
 const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'signed-edit',expectedVersion:version(1),draft:result.draft});
 await assert.rejects(service.execute({action:'APPROVE',actor,requestKey:'signed-edit-unbalanced',expectedVersion:version(2),salesId:old.header.id}),{code:'SETTLEMENT_MISMATCH'});
 assert.equal(h.store.snapshot().ledger.length,0);
});

test('signed-sales successor: untouched unknown historical sibling survives another line price change and approval',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const unknown={...actual.lines[0]!,pricingRule:null,isGift:null,zeroConfirmed:null,allocatedDiscount:null};
 const returned={...actual.lines[0]!,id:sid('salesLine',9876),lineNo:2,quantity:quantity('-1'),lineAmount:minorAmount('-125')};
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('125'),netDue:minorAmount('125')},lines:[unknown,returned],settlements:actual.settlements.map(s=>({...s,amount:minorAmount('125')}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),lines:[{...h.input().lines[0]!,pricingRule:null,isGift:null,zeroConfirmed:null},{...h.input().lines[0]!,existingLineId:returned.id,quantity:'-1',dealPrice:'1.00'}],settlements:h.input().settlements.map(s=>({...s,amount:'1.50'}))};
 const result=await h.existing.prepareExisting(actor,input);assert.deepEqual(result.draft.lines[0],unknown);assert.equal(result.draft.header.netDue,150n);
 const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'unknown-sibling-edit',expectedVersion:version(1),draft:result.draft});
 h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('10'),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
 await service.execute({action:'APPROVE',actor,requestKey:'unknown-sibling-approve',expectedVersion:version(2),salesId:old.header.id});
 assert.deepEqual(h.store.snapshot().lines.get(unknown.id),unknown);
 assert.deepEqual(h.store.snapshot().ledger.map(l=>l.quantityDelta),[-2n,1n]);
});

test('signed-sales successor: missing historical settlements cannot become known zero on changed zero-net approval',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('0'),netDue:minorAmount('0')},lines:[actual.lines[0]!,{...actual.lines[0]!,id:sid('salesLine',9877),lineNo:2,quantity:quantity('-2'),lineAmount:minorAmount('-250')}],settlements:[]};await h.changeDocument(()=>old);h.store.seedCutoffHistory(old);
 const before=h.store.snapshot();await assert.rejects(createSalesService(h.deps).execute({action:'APPROVE',actor,requestKey:'unknown-not-zero',expectedVersion:version(1),salesId:old.header.id}),{code:'HISTORICAL_SETTLEMENT_FACTS_MISSING'});assert.deepEqual(h.store.snapshot(),before);
});

test('signed-sales successor: original historical whole discount remains exact after quantity edit without allocation',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),orderDiscount:minorAmount('25'),netDue:minorAmount('-275')},lines:actual.lines.map(l=>({...l,quantity:quantity('-2'),lineAmount:minorAmount('-250'),allocatedDiscount:null})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const,amount:minorAmount('275')}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),orderDiscount:'0.25',lines:h.input().lines.map(l=>({...l,quantity:'-3'})),settlements:h.input().settlements.map(s=>({...s,direction:'REFUND' as const,amount:'2.75'}))};
 const result=await h.existing.prepareExisting(actor,input);assert.equal(result.draft.header.orderDiscount,25n);assert.equal(result.draft.header.netDue,-400n);assert.equal(result.draft.lines[0]!.allocatedDiscount,null);assert.deepEqual(result.draft.settlements,old.settlements);
 const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'discount-edit',expectedVersion:version(1),draft:result.draft});
 await assert.rejects(service.execute({action:'APPROVE',actor,requestKey:'discount-unbalanced',expectedVersion:version(2),salesId:old.header.id}),{code:'SETTLEMENT_MISMATCH'});
 await assert.rejects(h.existing.prepareExisting(actor,{...input,expectedVersion:2,orderDiscount:'0.00'}),{code:'HISTORICAL_DISCOUNT_CHANGED'});
});

test('signed-sales successor: retained unknown payment method is not reconstructed when editing a different field',async()=>{
 const h=await existingSetup();await h.changeDocument(d=>({...d,settlements:d.settlements.map(s=>({...s,paymentMethodId:null}))}));
 const input={...h.input(),note:'retain original method unknown',settlements:h.input().settlements.map(s=>({...s,paymentMethodId:null}))};
 const result=await h.existing.prepareExisting(actor,input);assert.equal(result.draft.settlements[0]!.paymentMethodId,null);
 await assert.rejects(h.existing.prepareExisting(actor,{...input,settlements:input.settlements.map(s=>({...s,amount:'3.00'}))}),{code:'UNKNOWN_SETTLEMENT_FACTS'});
});

test('signed-sales successor: changed incomplete historical row saves draft but cannot launder NULL pricing through a later SAVE',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),netDue:minorAmount('-250')},lines:actual.lines.map(l=>({...l,quantity:quantity('-2'),lineAmount:minorAmount('-250'),pricingRule:null,isGift:null,zeroConfirmed:null,allocatedDiscount:null})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),lines:h.input().lines.map(l=>({...l,quantity:'-3',pricingRule:null,isGift:null,zeroConfirmed:null})),settlements:h.input().settlements.map(s=>({...s,direction:'REFUND' as const,amount:'3.75'}))};
 const result=await h.existing.prepareExisting(actor,input);assert.equal(result.draft.header.netDue,-375n);assert.equal(result.draft.lines[0]!.pricingRule,null);
 const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'incomplete-history-save',expectedVersion:version(1),draft:result.draft});
 await service.execute({action:'SAVE',actor,requestKey:'incomplete-history-note',expectedVersion:version(2),draft:{...result.draft,header:{...result.draft.header,note:'still incomplete'}}});
 const before=h.store.snapshot();await assert.rejects(service.execute({action:'APPROVE',actor,requestKey:'incomplete-history-approve',expectedVersion:version(3),salesId:old.header.id}),e=>e instanceof DomainError&&e.code==='UNKNOWN_PRICING_FACTS'&&e.message.includes(old.lines[0]!.id)&&e.message.includes('pricingRule'));assert.deepEqual(h.store.snapshot(),before);
});

test('signed-sales successor: native atomic proposal can save a new incomplete RETURN line and approval identifies missing pricing',async()=>{
 const h=setup(),p=proposal();const input={...p,salesId:null,businessType:'RETURN',lines:p.lines.map(l=>({...l,existingLineId:null,pricingRule:null,isGift:null,zeroConfirmed:null})),settlements:p.settlements.map(s=>({...s,existingSettlementId:null}))};
 const parsed=parseNativeSalesSaveProposal(input);assert.equal(parsed.lines[0]!.pricingRule,null);
 const deps:SalesDependencies={...h.dependencies,unitOfWork:{transaction(work){return h.dependencies.unitOfWork.transaction(tx=>work({...tx,async resolveDocumentSkus(input){assert.ok(input.selections.every(s=>'skuId' in s && s.skuId===ids.sku));return input.selections.map(()=>ids.sku);}}));}}};
 const saved=await createSalesService(deps).execute({action:'SAVE',actor,requestKey:'new-incomplete-save',expectedVersion:null,proposal:parsed});
 const before=h.store.snapshot();await assert.rejects(createSalesService(h.dependencies).execute({action:'APPROVE',actor,requestKey:'new-incomplete-approve',expectedVersion:saved.version,salesId:saved.salesId}),{code:'UNKNOWN_PRICING_FACTS'});assert.deepEqual(h.store.snapshot(),before);
});

test('signed-sales successor: original mixed discount survives last negative becoming positive and subsequent SAVE',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('-250'),orderDiscount:minorAmount('25'),netDue:minorAmount('-275')},lines:actual.lines.map(l=>({...l,quantity:quantity('-2'),lineAmount:minorAmount('-250'),allocatedDiscount:null})),settlements:actual.settlements.map(s=>({...s,direction:'REFUND' as const,amount:minorAmount('275')}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),orderDiscount:'0.25',lines:h.input().lines.map(l=>({...l,quantity:'2'})),settlements:h.input().settlements.map(s=>({...s,amount:'2.25'}))};
 const prepared=await h.existing.prepareExisting(actor,input);const service=createSalesService(h.deps);
 await service.execute({action:'SAVE',actor,requestKey:'last-negative-positive',expectedVersion:version(1),draft:prepared.draft});
 h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('10'),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
 await service.execute({action:'APPROVE',actor,requestKey:'last-negative-approve',expectedVersion:version(2),salesId:old.header.id});
 await service.execute({action:'UNAPPROVE',actor,requestKey:'last-negative-unapprove',expectedVersion:version(3),salesId:old.header.id});
 const again=await h.existing.prepareExisting(actor,{...input,expectedVersion:4,lines:input.lines.map(l=>({...l,quantity:'3'}))});
 assert.equal(again.draft.header.orderDiscount,25n);assert.equal(again.draft.header.netDue,350n);assert.equal(again.draft.lines[0]!.allocatedDiscount,null);
 await assert.rejects(h.existing.prepareExisting(actor,{...input,expectedVersion:4,orderDiscount:'0.00'}),{code:'HISTORICAL_DISCOUNT_CHANGED'});
});

test('signed-sales successor: removing last negative row retains origin discount and inactive row identity',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const sale={...actual.lines[0]!,allocatedDiscount:null};const returned={...sale,id:sid('salesLine',9981),lineNo:2,quantity:quantity('-1'),lineAmount:minorAmount('-125')};
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('125'),orderDiscount:minorAmount('25'),netDue:minorAmount('100')},lines:[sale,returned],settlements:actual.settlements.map(s=>({...s,amount:minorAmount('100')}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),orderDiscount:'0.25',settlements:h.input().settlements.map(s=>({...s,amount:'2.25'}))};
 const result=await h.existing.prepareExisting(actor,input);const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'remove-last-negative',expectedVersion:version(1),draft:result.draft});
 const removed=h.store.snapshot().lines.get(returned.id)!;assert.equal(removed.isCurrent,false);assert.equal(removed.quantity,-1n);
 h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('10'),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
 await service.execute({action:'APPROVE',actor,requestKey:'removed-negative-approve',expectedVersion:version(2),salesId:old.header.id});
 assert.equal(h.store.snapshot().headers.get(old.header.id)!.netDue,225n);assert.equal(h.store.snapshot().lines.get(sale.id)!.allocatedDiscount,null);
});

test('signed-sales successor: unchanged unknown payment method survives economic edit with exact same real net settlement',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
 const sale=actual.lines[0]!,returned={...sale,id:sid('salesLine',9982),lineNo:2,quantity:quantity('-1'),lineAmount:minorAmount('-125')};
 const old={...actual,header:{...actual.header,grossAmount:minorAmount('125'),netDue:minorAmount('125')},lines:[sale,returned],settlements:actual.settlements.map(s=>({...s,amount:minorAmount('125'),paymentMethodId:null}))};h.store.seedCutoffHistory(old);
 const input={...h.input(),lines:[{...h.input().lines[0]!,quantity:'3'},{...h.input().lines[0]!,existingLineId:returned.id,quantity:'-2'}],settlements:h.input().settlements.map(s=>({...s,amount:'1.25',paymentMethodId:null}))};
 const result=await h.existing.prepareExisting(actor,input);assert.deepEqual(result.draft.settlements,old.settlements);
 const service=createSalesService(h.deps);await service.execute({action:'SAVE',actor,requestKey:'same-net-unknown-method',expectedVersion:version(1),draft:result.draft});
 h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('10'),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
 await service.execute({action:'APPROVE',actor,requestKey:'same-net-unknown-method-approve',expectedVersion:version(2),salesId:old.header.id});
 assert.deepEqual([...h.store.snapshot().settlements.values()],old.settlements);
});

test('signed-sales successor: rejected authorization cannot trigger historical provenance reads',async()=>{
 const h=await existingSetup();const actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);h.store.seedCutoffHistory(actual);
 let historyReads=0;const deps:SalesDependencies={...h.deps,authorization:{async assertAllowed(){throw new DomainError('FORBIDDEN','synthetic deny');}},unitOfWork:{transaction(work){return h.deps.unitOfWork.transaction(tx=>work({...tx,async getRetainedSalesApprovalHistory(id,v){historyReads++;return tx.getRetainedSalesApprovalHistory!(id,v);}}));}}};
 await assert.rejects(createSalesService(deps).execute({action:'APPROVE',actor,requestKey:'denied-history-read',expectedVersion:version(1),salesId:actual.header.id}),{code:'FORBIDDEN'});assert.equal(historyReads,0);
});

test('new mixed SALE preparation preserves same-SKU positive/negative rows and exact net without whole discount',async()=>{
 for(const q of ['-1','-2','-3']){
  const h=setup(),p=proposal(),input={...p,lines:[p.lines[0]!,{...p.lines[0]!,quantity:q}],settlements:[]};
  const result=await h.prepare.prepareCreate(actor,input);
  assert.equal(result.header.businessType,'SALE');assert.equal(result.lines.length,2);
  assert.deepEqual(result.lines.map(l=>l.quantity),[2n,BigInt(q)]);
  assert.deepEqual(result.lines.map(l=>l.allocatedDiscount),[0n,0n]);
  assert.equal(result.header.netDue,125n*(2n+BigInt(q)));
  await assert.rejects(h.prepare.prepareCreate(actor,{...input,orderDiscount:'0.01'}),{code:'MIXED_SALES_ORDER_DISCOUNT'});
 }
});

test('new mixed SALE atomic SAVE parser and transaction preparation retain one document and reject discount before writes',async()=>{
 const h=setup(),p=proposal(),raw={...p,salesId:null,lines:[{...p.lines[0]!,existingLineId:null},{...p.lines[0]!,quantity:'-1',existingLineId:null}],settlements:[]};
 const parsed=parseNativeSalesSaveProposal(raw),before=h.store.snapshot();
 const run=(input:typeof parsed)=>h.dependencies.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'mixed-atomic');return prepareNativeSalesOnTransaction(h.dependencies,tx,actor,input,ids.sales,undefined,[ids.sku,ids.sku]);});
 const draft=await run(parsed);assert.deepEqual(h.store.snapshot(),before);assert.equal(draft.header.netDue,125n);assert.equal(draft.lines.length,2);
 await assert.rejects(run(parseNativeSalesSaveProposal({...raw,orderDiscount:'0.01'})),{code:'MIXED_SALES_ORDER_DISCOUNT'});
 assert.deepEqual(h.store.snapshot(),before);
 const save={action:'SAVE' as const,actor,expectedVersion:null,requestKey:'mixed-atomic-save',draft},service=createSalesService(h.dependencies);
 const receipt=await service.execute(save);assert.deepEqual(await service.execute(save),receipt);
 assert.equal(h.store.snapshot().headers.size,1);assert.equal(h.store.snapshot().receipts.size,1);
 for(const businessType of ['MIXED','SALE_RETURN'])assert.throws(()=>parseNativeSalesSaveProposal({...raw,businessType}));
});

test('live existing SALE can become mixed without split and cannot introduce a whole discount',async()=>{
 const h=await existingSetup(),p=h.input(),input={...p,lines:[...p.lines,{...p.lines[0]!,existingLineId:null,quantity:'-1'}]};
 const prepared=await h.existing.prepareExisting(actor,input);assert.equal(prepared.draft.header.id,h.initial.header.id);
 assert.equal(prepared.draft.lines[0]!.id,h.initial.lines[0]!.id);assert.equal(prepared.draft.lines.length,2);
 assert.equal(prepared.draft.header.netDue,125n);assert.deepEqual(prepared.draft.lines.map(l=>l.allocatedDiscount),[0n,0n]);
 await assert.rejects(h.existing.prepareExisting(actor,{...input,orderDiscount:'0.01'}),{code:'MIXED_SALES_ORDER_DISCOUNT'});
 const {expectedVersion:_expectedVersion,...wire}=input;
 const raw=parseNativeSalesSaveProposal(wire);
 const atomic=await h.deps.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'mixed-existing-atomic');const stored=await tx.getSales(h.initial.header.id);return prepareNativeSalesOnTransaction(h.deps,tx,actor,raw,h.initial.header.id,stored,[ids.sku,ids.sku]);});
 assert.equal(atomic.header.netDue,125n);assert.equal(atomic.lines.length,2);
});

test('mixed SALE deleting first row and appending/reordering preserves distinct positions and historical unknown economics',async()=>{
 for(const historical of [false,true]) for(const edit of ['replace-first','reorder']){
  const h=await existingSetup(),actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
  const negative={...actual.lines[0]!,id:sid('salesLine',8111),lineNo:2,quantity:quantity('-1'),lineAmount:minorAmount('-125'),...(historical?{pricingRule:null,zeroConfirmed:null,isGift:null,allocatedDiscount:null}:{})};
  const old={...actual,header:{...actual.header,grossAmount:minorAmount('125'),orderDiscount:minorAmount(historical?'25':'0'),netDue:minorAmount(historical?'100':'125')},lines:[actual.lines[0]!,negative]};
  if(historical)h.store.seedCutoffHistory(old);else await h.changeDocument(()=>old);
  const negativeInput={...h.input().lines[0]!,existingLineId:negative.id,quantity:'-1',pricingRule:negative.pricingRule,zeroConfirmed:negative.zeroConfirmed,isGift:negative.isGift};
  const positiveInput={...h.input().lines[0]!,existingLineId:edit==='reorder'?old.lines[0]!.id:null};
  const input={...h.input(),orderDiscount:historical?'0.25':'0.00',lines:[negativeInput,positiveInput]};
  const prepared=await h.existing.prepareExisting(actor,input);
  const {expectedVersion:_v,...wire}=input,parsed=parseNativeSalesSaveProposal(wire);
  const atomic=await h.deps.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'mixed-position');return prepareNativeSalesOnTransaction(h.deps,tx,actor,parsed,old.header.id,await tx.getSales(old.header.id),[ids.sku,ids.sku]);});
  for(const result of [prepared.draft,atomic]){
   assert.deepEqual(result.lines.map(l=>l.lineNo),[1,2]);assert.equal(result.lines[0]!.id,negative.id);
   assert.deepEqual(result.lines.map(l=>l.quantity),[-1n,2n]);assert.equal(result.header.netDue,historical?100n:125n);
   if(historical)for(const key of ['pricingRule','zeroConfirmed','isGift','allocatedDiscount'] as const)assert.equal(result.lines[0]![key],null,key);
  }
  await createSalesService(h.deps).execute({action:'SAVE',actor,requestKey:'mixed-reposition',expectedVersion:version(1),draft:prepared.draft});
 }
});

test('retained unknown settlement can be repositioned without inventing method or losing audit provenance',async()=>{
 for(const mode of ['existing','atomic'])for(const edit of ['remove-add','reorder']){
  const h=await existingSetup(),p=h.input(),actual=await h.store.transaction(async tx=>(await tx.getSales(h.initial.header.id))!.document);
  const negative={...actual.lines[0]!,id:sid('salesLine',88001),lineNo:2,quantity:quantity('-1'),lineAmount:minorAmount('-125')};
  const unknown={...actual.settlements[0]!,id:sid('settlement',88002),lineNo:2,direction:'REFUND' as const,amount:minorAmount('125'),paymentMethodId:null};
  const old={...actual,header:{...actual.header,grossAmount:minorAmount('125'),netDue:minorAmount('125')},lines:[...actual.lines,negative],settlements:[...actual.settlements,unknown]};h.store.seedCutoffHistory(old);
  const input={...p,lines:[p.lines[0]!,{...p.lines[0]!,existingLineId:negative.id,quantity:'-1'}],settlements:[{...p.settlements[0]!,existingSettlementId:unknown.id,paymentMethodId:null,direction:'REFUND' as const,amount:'1.25'},{...p.settlements[0]!,existingSettlementId:edit==='reorder'?old.settlements[0]!.id:null}]};
  const {expectedVersion:_v,...wire}=input,raw=parseNativeSalesSaveProposal(wire);
  const prepared=mode==='existing'?(await h.existing.prepareExisting(actor,input)).draft:await h.deps.unitOfWork.transaction(async tx=>{await tx.getReceipt(actor.accountId,'settlement-position');return prepareNativeSalesOnTransaction(h.deps,tx,actor,raw,old.header.id,await tx.getSales(old.header.id),[ids.sku,ids.sku]);});
  assert.deepEqual(prepared.settlements.map(s=>s.lineNo),[1,2]);assert.deepEqual(prepared.settlements[0],{...unknown,lineNo:1});
  const service=createSalesService(h.deps),saved={action:'SAVE' as const,actor,requestKey:'settlement-reposition',expectedVersion:version(1),draft:prepared};
  await service.execute(saved);assert.deepEqual(await service.execute(saved),await service.execute(saved));
  h.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('10'),version:version(1),lastOperationId:null,updatedAt:'2026-10-20T00:00:00Z'});
  await service.execute({action:'APPROVE',actor,requestKey:'settlement-approve',expectedVersion:version(2),salesId:old.header.id});
  await service.execute({action:'UNAPPROVE',actor,requestKey:'settlement-unapprove',expectedVersion:version(3),salesId:old.header.id});
  assert.deepEqual(h.store.snapshot().settlements.get(unknown.id),{...unknown,lineNo:1});
  const audit=h.store.snapshot().audit.find(a=>a.action==='SAVE' && a.before?.header.version===1);
  assert.ok(audit);assert.equal(audit.before!.settlements.find(s=>s.id===unknown.id)!.lineNo,2);
  assert.equal(audit.after.settlements.find(s=>s.id===unknown.id)!.lineNo,1);
  for(const change of [{amount:minorAmount('126')},{direction:'RECEIVE' as const},{paymentAccountId:h.payment2},{id:sid('settlement',88999)}]){
   const bad={...prepared,settlements:[{...prepared.settlements[0]!,...change},prepared.settlements[1]!]};
   const before=h.store.snapshot();
   await assert.rejects(service.execute({action:'SAVE',actor,requestKey:'reject-unknown-change-'+Object.keys(change)[0],expectedVersion:version(4),draft:bad}),{code:'INVALID_SETTLEMENT'});
   assert.deepEqual(h.store.snapshot(),before);
  }
  for(const change of [{amount:'1.26'},{direction:'RECEIVE' as const},{paymentAccountId:h.payment2}]){
   await assert.rejects(h.existing.prepareExisting(actor,{...input,expectedVersion:4,settlements:[{...input.settlements[0]!,...change},input.settlements[1]!]}));
  }
 }
});
