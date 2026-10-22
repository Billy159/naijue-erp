import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { prepareHistorySalesDetailChunk, stageHistorySalesDetailChunk, validatePreparedHistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import type { HistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import { v2MoneyApprovalSet } from "../packages/application/src/import-v2.ts";
import { syntheticSalesDetailChunk, salesDetailId } from "./support/synthetic-sales-detail-fixtures.ts";

test("sales-detail actual mapper: DRY_RUN default never authorizes/connects/publishes; signed source amounts and NULL/false preserved",async()=>{
 const input=syntheticSalesDetailChunk(),before=structuredClone(input);let called=0;
 const r=await stageHistorySalesDetailChunk(input,{authorize:async()=>{called++;},store:{async stage(){called++;return {inserted:1,replayed:0};}}});
 assert.deepEqual(r,{mode:"DRY_RUN",rows:1,inserted:0,replayed:0,published:false,importReady:false});assert.equal(called,0);assert.deepEqual(input,before);
 const p=prepareHistorySalesDetailChunk(input),l=p.rows[0]!.line;
 assert.equal(l.quantity,"-2");assert.equal(l.deal_price,"0.03");assert.equal(l.line_amount,"-0.12","synthetic true mismatch must not become -0.06");
 assert.equal(l.reference_price,null);assert.equal(l.allocated_discount,null);assert.equal(l.is_gift,false);assert.equal(l.ordinary_zero_confirmed,null);assert.equal(l.pricing_method_source,null);
 assert.equal(l.barcode_snapshot,"0000123");assert.equal(l.product_code_snapshot,"0007");assert.equal(l.product_name_snapshot,null);
 assert.equal(p.rows[0]!.source.rawFields["SKU来源编号"],"SYNTHETIC-OLD-SKU");assert.equal(p.rows[0]!.source.normalizedFields["SKU来源编号"],"SYNTHETIC-CANONICAL-SKU");
});
test("sales-detail actual mapper: STAGE independent authorization is mandatory and mutation cannot change prepared/store inputs",async()=>{
 const input=syntheticSalesDetailChunk();let writes=0;
 const store={async stage(p:ReturnType<typeof prepareHistorySalesDetailChunk>){writes++;assert.equal(p.rows[0]!.line.quantity,"-2");return {inserted:1,replayed:0};}};
 await assert.rejects(stageHistorySalesDetailChunk(input,{mode:"STAGE",store}),{code:"HISTORY_SALES_DETAIL_AUTHORIZATION"});assert.equal(writes,0);
 await assert.rejects(stageHistorySalesDetailChunk(input,{mode:"STAGE",store,authorize:async()=>{throw Error("not authorized");}}));assert.equal(writes,0);
 const r=await stageHistorySalesDetailChunk(input,{mode:"STAGE",store,authorize:async c=>{c.rows[0]!.line.quantity="99";}});assert.equal(r.inserted,1);assert.equal(r.importReady,false);
});
test("sales-detail actual mapper: only full exact authorized source-cell identity permits greater-scale money correction",()=>{
 const input=syntheticSalesDetailChunk(),s=input.rows[0]!.source,raw="0.030000000000001";
 s.rawFields["原成交单价"]=raw;(s.fieldProvenance.fields as Record<string,{raw:string}>)["原成交单价"]!.raw=raw;
 const values=[...input.moneyApprovals.values()];values[0]={fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field:"原成交单价",rawValue:raw,exactCentValue:"0.03"};
 const approved={...input,moneyApprovals:v2MoneyApprovalSet(values,values)};const p=prepareHistorySalesDetailChunk(approved);assert.equal(p.rows[0]!.line.deal_price,"0.03");
 const field=(p.rows[0]!.fieldProvenance.fields as Record<string,{origin:string;raw:string;parsed:string}>)["原成交单价"]!;
 assert.equal(field.origin,"MIGRATION_DERIVED");assert.equal(field.raw,raw);assert.equal(field.parsed,"0.03");
 for(const mutate of [(c:HistorySalesDetailChunk)=>{c.rows[0]!.source.rowNo="99";},(c:HistorySalesDetailChunk)=>{c.rows[0]!.source.sourceFileSha256="b".repeat(64);},(c:HistorySalesDetailChunk)=>{c.rows[0]!.source.normalizedFields["原成交单价"]="0.04";}]){
  const bad=structuredClone(approved);mutate(bad);assert.throws(()=>prepareHistorySalesDetailChunk(bad));
 }
});
test("sales-detail actual mapper: identity/schema/enum/binding/range/precision/provenance/size/partial inputs fail before SQL",()=>{
 const edits:Array<(c:HistorySalesDetailChunk)=>void>=[c=>{Reflect.set(c.selection,"entity","SETTLEMENT");},c=>{delete c.rows[0]!.source.normalizedFields["原品名"];},c=>{c.rows[0]!.source.rawFields["原品名"]="not normalized";},
  c=>{c.rows[0]!.source.normalizedFields["原成交单价"]="0.001";},c=>{c.rows[0]!.source.normalizedFields["原数量"]="0";c.rows[0]!.source.rawFields["原数量"]="0";},
  c=>{Reflect.set(c.rows[0]!.header,"sourceKey","other");},c=>{Reflect.set(c.rows[0]!.sku,"oldSourceSkuKey","other");},c=>{Reflect.set(c.rows[0]!.sku,"nativeId","not UUID");},
  c=>{c.rows[0]!.source.fieldProvenance.fields={};},c=>{c.rows[0]!.source.normalizedFields.extra="x";},c=>{Reflect.set(c,"rows",[c.rows[0]!,c.rows[0]!]);},c=>{Reflect.set(c,"rows",Array(101).fill(c.rows[0]));},c=>{c.rows[0]!.source.rawFields.extra="汉".repeat(1_500_000);}];
 for(const edit of edits){const c=syntheticSalesDetailChunk();edit(c);assert.throws(()=>prepareHistorySalesDetailChunk(c));}
 const boolean=syntheticSalesDetailChunk();for(const field of ["原赠品标记","原普通零价确认"]){boolean.rows[0]!.source.rawFields[field]="是";boolean.rows[0]!.source.normalizedFields[field]="是";(boolean.rows[0]!.source.fieldProvenance.fields as Record<string,{raw:string}>)[field]!.raw="是";}
 const p=prepareHistorySalesDetailChunk(boolean);assert.equal(p.rows[0]!.line.is_gift,true);assert.equal(p.rows[0]!.line.ordinary_zero_confirmed,true);
});
test("sales-detail actual mapper: whole prepared source/typed/provenance/unused approvals are rederived at SQL boundary",()=>{
 const p=prepareHistorySalesDetailChunk(syntheticSalesDetailChunk());validatePreparedHistorySalesDetailChunk(p);
 for(const edit of [(c:typeof p)=>{c.rows[0]!.line.sku_id=salesDetailId(99);},(c:typeof p)=>{c.rows[0]!.fieldProvenance.extra="x";},(c:typeof p)=>{Reflect.set(c.rows[0]!,"fingerprint","b".repeat(64));},(c:typeof p)=>{[...c.input.moneyApprovals.values()][31]!.exactCentValue="2.00";}]){
  const changed=structuredClone(p);edit(changed);assert.throws(()=>validatePreparedHistorySalesDetailChunk(changed));
 }
});
test("sales-detail durable proof hash uses ordinal approval ordering, independent of host locale",()=>{
 const mapper=new URL("../packages/application/src/import-v3-history-sales-detail.ts",import.meta.url).href;
 const fixture=new URL("./support/synthetic-sales-detail-fixtures.ts",import.meta.url).href;
 const money=new URL("../packages/application/src/import-v2.ts",import.meta.url).href;
 const source=`import {prepareHistorySalesDetailChunk} from ${JSON.stringify(mapper)};import {syntheticSalesDetailChunk} from ${JSON.stringify(fixture)};import {v2MoneyApprovalSet} from ${JSON.stringify(money)};
 const c=syntheticSalesDetailChunk(),v=[...c.moneyApprovals.values()].map((x,i)=>({...x,sheet:i%2?'ä':'z'}));
 process.stdout.write(prepareHistorySalesDetailChunk({...c,moneyApprovals:v2MoneyApprovalSet(v,v)}).rows[0].fingerprint);`;
 const hashes=["en_US.UTF-8","sv_SE.UTF-8"].map(locale=>execFileSync(process.execPath,["--input-type=module","-e",source],{encoding:"utf8",env:{...process.env,LANG:locale,LC_ALL:locale}}));
 assert.match(hashes[0]!,/^[a-f0-9]{64}$/);assert.equal(hashes[0],hashes[1]);
});
