import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sealedHistory17Fixture, B07_SYN_APPROVED_PROFILE, sha } from "./integration/sealed-history17-fixture.ts";

test("new SYN APPROVED source is generated before sealing with exact payments and per-warehouse derived opening", async t => {
 const f = await sealedHistory17Fixture(t, B07_SYN_APPROVED_PROFILE);
 assert.equal(f.options.fixedSourceNamespace, "synthetic.b07.approved.v1");
 const raw = (await readFile(join(f.options.base,"snapshots/all-business-source-rows.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 const sales = raw.filter(r=>r.entity==="SALES_HEADER");
 assert.equal(sales.length,2);
 const sale=sales.find(r=>r.sourceId==="header-SALE").data;
 assert.equal(sale.原审核状态,"已审核"); assert.equal(sale.应结金额,"32.00"); assert.equal(sale.整单优惠,"0.00");
 assert.equal(sales.find(r=>r.sourceId==="header-RETURN").data.原审核状态,"未审核");
 const transfer=raw.find(r=>r.entity==="TRANSFER_HEADER").data;
 assert.equal(transfer.原审核状态,"已审核"); assert.equal(transfer.调出仓来源编号,"WH-1");assert.equal(transfer.调入仓来源编号,"WH-2");
 for(const h of [sale,transfer]){assert.equal(h.业务日期,"45614");for(const k of ["原创建时间","原修改时间","原审核时间"])assert.equal(h[k],"");assert.match(h.原单号,/^B07-SYN-APPROVED-V1-/);}
 const lines=raw.filter(r=>r.entity==="SALES_LINE"&&r.data.单据来源编号==="header-SALE");
 assert.equal(lines.length,16);assert.equal(lines.reduce((n,r)=>n+BigInt(r.data.原数量),0n),32n);
 for(const l of lines) assert.equal(l.data.原行金额,"2.00");
 assert.equal(raw.find(r=>r.entity==="SETTLEMENT"&&r.data.单据来源编号==="header-SALE").data.金额,"32.00");
 assert.equal(raw.find(r=>r.entity==="TRANSFER_LINE").data.原数量,"3");
 const plan=f.approvedInventoryPlan!;
 assert.equal(plan.sourceKind,"SYNTHETIC_ONLY");assert.equal(plan.openingMethod,"DERIVED_FROM_TARGET_INVENTORY");assert.equal(plan.postDerivedOpeningAgain,false);
 for(const w of plan.warehouses)assert.equal(BigInt(w.derivedOpening)+BigInt(w.approvedSalesNet)+BigInt(w.approvedTransferNet),BigInt(w.target));
 assert.equal(plan.warehouses.reduce((n,w)=>n+BigInt(w.approvedTransferNet),0n),0n);
 const manifest=JSON.parse(await readFile(join(f.options.base,"manifest.json"),"utf8"));
 for(const entry of manifest.payloadFiles){const bytes=await readFile(join(f.options.base,entry.file));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
 const selection=JSON.parse(await readFile(join(f.options.v3Amendment,"effective-import-selection.json"),"utf8"));
 assert.equal(selection.excludedCount,2958);assert.equal(selection.effectiveCount,15018);
 const excluded=JSON.parse(await readFile(join(f.options.v3Amendment,selection.excludedSourceIdsFile),"utf8"));
 assert.equal(excluded.length,2958);assert.equal(new Set(excluded).size,2958);
 const effective=await readFile(join(f.options.v3Amendment,selection.effectiveBarcodeCsv.path),"utf8");
 assert.equal(sha(effective),selection.effectiveBarcodeCsv.sha256);
 assert.equal(effective.includes('"PRODUCT"'),false);
});

test("original sealed17 default remains DRAFT with original quantity/payment and namespace",async t=>{
 const f=await sealedHistory17Fixture(t);assert.equal(f.profile,null);assert.equal(f.approvedInventoryPlan,null);
 assert.equal(f.options.fixedSourceNamespace,"synthetic.sealed-history17");
 const raw=(await readFile(join(f.options.base,"snapshots/all-business-source-rows.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 assert.ok(raw.filter(r=>r.entity.endsWith("_HEADER")).every(r=>r.data.原审核状态==="未审核"));
 assert.equal(raw.find(r=>r.entity==="TRANSFER_LINE").data.原数量,"-3");
 assert.equal(raw.find(r=>r.entity==="SETTLEMENT"&&r.data.单据来源编号==="header-SALE").data.金额,"0.00");
});

test("original authorized header reader prepares APPROVED from the new sealed raw cells, retaining NULL historical people/time",async t=>{
 const {openAuthorizedV3HeaderReader}=await import('../scripts/import-v2/authorized-header-reader.mjs');
 const {prepareV3HistoryHeaderChunk}=await import('../packages/application/src/import-v3-history-header-staging.ts');
 const {id}=await import('./integration/native-import-accounting-fixture.ts');
 const f=await sealedHistory17Fixture(t,B07_SYN_APPROVED_PROFILE);
 const resolveNativeBinding=async(q:{entity:string;normalizedFields:Record<string,unknown>})=>{
  const fields=q.entity==='SALES_HEADER'?['所属厅来源编号','客户来源编号','仓库来源编号']:['调出仓来源编号','调入仓来源编号'];
  const ids:Record<string,string>={'HALL-1':id(10),'CUSTOMER-1':id(70),'WH-1':id(40),'WH-2':id(41)};
  return Object.fromEntries(fields.map(field=>{const sourceKey=q.normalizedFields[field] as string;assert.ok(ids[sourceKey]);return [field,{sourceKey,nativeId:ids[sourceKey]!}];}));
 };
 const reader=await openAuthorizedV3HeaderReader({...f.options,resolveNativeBinding});
 try{let approved=0,draft=0;
  for await(const record of reader.rows()){
   const bindings=await resolveNativeBinding({entity:record.source.entityType,normalizedFields:record.source.normalizedFields});
   const prepared=prepareV3HistoryHeaderChunk([{batchId:f.options.batchId,fixedSourceNamespace:f.options.fixedSourceNamespace,...record,bindings}]);
   await reader.authorize(prepared);
   for(const row of prepared.rows){const h=row.prepared.header;assert.equal(h.businessDate,'2024-11-18');assert.equal(h.createdLocalAt,null);assert.equal(h.approvedLocalAt,null);if(h.sourceStatus==='APPROVED')approved++;else {assert.equal(h.sourceStatus,'DRAFT');draft++;}}
  }
  assert.equal(approved,2);assert.equal(draft,1);
 }finally{await reader.close();}
});
