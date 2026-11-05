/** SYNTHETIC unit/scripted pg protocol only. No database, host, publisher or real readiness assertion. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import { PostgresNativeSalesFacts } from "../adapters/postgres/src/sales-native-facts.ts";
import type { NativeCatalogueCompletenessVerifier, NativeSalesFactQuery } from "../adapters/postgres/src/sales-native-facts.ts";
import type { SalesTransaction } from "../packages/application/src/ports.ts";
import type { SalesDraft } from "../packages/domain/src/documents.ts";
import { minorAmount, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot, syntheticDraft } from "./support/synthetic-fixtures.ts";
const product = sid("product", 12), color = sid("color", 13), fit = sid("fit", 11), size = sid("size", 14), group = sid("sizeGroup", 30), method = sid("paymentMethod", 31);
function liveDraft(): SalesDraft {
  const draft = syntheticDraft(); return { ...draft, header: { ...draft.header, salespersonId: sid("staff", 103) } };
}
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
  return { tables, reader: factReader, draft: { ...draft, lines }, calls, completeCalls: () => completeCalls, close() { active = false; }, query };
}
import { checkedNativeSalesFactInput } from '../adapters/postgres/src/sales-native-facts.ts';
import { SALES_NATIVE_FACT_MAX_LINES } from '../packages/application/src/sales-native-facts.ts';
function retained(count:number):SalesDraft {
 const draft=liveDraft();return {...draft,settlements:Array.from({length:count},(_,i)=>({...draft.settlements[0]!,id:sid('settlement',20000+i),lineNo:i+1,
   amount:minorAmount(i===0?'250':'0'),paymentMethodId:i%2===0?method:null}))};
}
for(const count of [16,17,SALES_NATIVE_FACT_MAX_LINES])test(`retained settlement facts admit bounded ${count} occurrences without normalization`,()=>{
 const draft=retained(count);const before=structuredClone(draft);const checked=checkedNativeSalesFactInput(draft);
 assert.deepEqual(checked.document,before);assert.notEqual(checked.document,draft);assert.equal(checked.document.settlements.length,count);
 assert.deepEqual(draft,before);assert.equal(checked.document.settlements[1]!.paymentMethodId,null);
});
test('settlement technical upper bound remains enforced before SQL',async()=>{
 const f=pgFixture();await assert.rejects(f.reader.load(retained(SALES_NATIVE_FACT_MAX_LINES+1)),{code:'NATIVE_SALES_FACTS_TOO_LARGE'});assert.equal(f.calls.length,0);
});
for(const defect of ['duplicate-id','foreign-owner'])test(`retained settlement ${defect} still rejected`,()=>{
 const draft=retained(17),rows=[...draft.settlements];rows[16]={...rows[16]!,...(defect==='duplicate-id'?{id:rows[0]!.id}:{salesId:sid('sales',999)})};
 assert.throws(()=>checkedNativeSalesFactInput({...draft,settlements:rows}),{code:'TRANSACTION_SCOPE'});
});
test('16 retained occurrences hydrate exact deduplicated locked payment facts and ordinary SAVE/approval rules',async()=>{
 const f=pgFixture(),draft=retained(16);const facts=await f.reader.load(draft);
 assert.equal(facts.paymentAccounts.length,1);assert.equal(f.calls.filter(x=>x.sql.includes('native-sales-facts:payment_account')).length,1);
 assert.equal(f.calls.filter(x=>x.sql.includes('native-sales-facts:payment_method')).length,1);
 assert.ok(f.calls.filter(x=>/native-sales-facts:payment_/.test(x.sql)).every(x=>x.sql.includes('FOR SHARE')));
 const tx={async getCurrentSalesReferenceFacts(input:SalesDraft){return f.reader.load(input);}} as unknown as SalesTransaction;
 const rules=createNativeTransactionSalesBusinessRules();
 // Preserve original unknown methods, rather than inventing them; ordinary rules
 // retain unchanged observations only with their original document context.
 const document={...draft,header:{...draft.header,responsibleStaffId:null,status:'DRAFT' as const,version:version(1),createdByAccountId:actor.accountId,createdHallId:ids.hall,createdAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-02T00:00:00Z',approvedByAccountId:null,approvedAt:null}};
 await rules.assertDraftChange(document,{...draft,header:{...draft.header,note:'only memo'}},tx);
 const known={...document,settlements:document.settlements.map(row=>({...row,paymentMethodId:method}))};
 await rules.assertReferencesAndEconomics(known,tx);
 assert.deepEqual(draft.settlements,retained(16).settlements);
});
test('large exact money and nullable original method are not coerced in input snapshot',()=>{
 const draft=retained(16),rows=[...draft.settlements];rows[0]={...rows[0]!,amount:minorAmount('900719925474099301'),paymentMethodId:null};
 const result=checkedNativeSalesFactInput({...draft,settlements:rows}).document;
 assert.equal(result.settlements[0]!.amount,900719925474099301n);assert.equal(result.settlements[0]!.paymentMethodId,null);
});
test('201 distinct settlement accounts and methods stay within existing200-target row-lock batches',async()=>{
 const f=pgFixture(),draft=retained(201);const settlements=draft.settlements.map((row,i)=>({...row,paymentAccountId:sid('paymentAccount',30000+i),paymentMethodId:sid('paymentMethod',40000+i)}));
 f.tables.payment_account=settlements.map(row=>({id:row.paymentAccountId,payment_method_id:row.paymentMethodId,enabled:true}));
 f.tables.payment_method=settlements.map(row=>({id:row.paymentMethodId,enabled:true}));
 const facts=await f.reader.load({...draft,settlements});assert.equal(facts.paymentAccounts.length,201);
 for(const table of ['payment_account','payment_method']){
  const calls=f.calls.filter(x=>x.sql.includes(`native-sales-facts:${table}`));assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>(x.values[0] as string[]).length),[200,1]);assert.ok(calls.every(x=>x.sql.includes('FOR SHARE')));
 }
});
