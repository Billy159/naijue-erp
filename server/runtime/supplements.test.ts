import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {generateHistoricalBarcodes,generateC9HistoricalBarcodes} from './barcodes.ts';
import {transaction} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {approvedExcelManifest} from './excel-barcode-authority.ts';
import {approvedSchemeSupplement} from './barcode-scheme-supplement.ts';
const json=async(p:string)=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const mapping=await json('../../data-cleaning/size-mapping/user-size-audit.json');
assert.equal(mapping.matches.length,14864);assert.equal(new Set(mapping.matches.map((x:any)=>x.sku)).size,14864);
assert(mapping.matches.every((x:any)=>x.target.length===4&&x.workbookRows.length));
const halls=await json('./hall-config.json');assert.equal(halls.stores.length,40);
assert.equal(new Set(halls.stores.flatMap((x:any)=>x.sourceIds)).size,47);
assert(halls.stores.every((x:any)=>x.warehouseIds.includes(x.defaultWarehouseId)));
assert(halls.stores.some((x:any)=>x.name==='舟山银泰外场特卖'&&x.sourceIds.length===1));
assert.equal((await json('./product-color-split.json')).enabled,false);
const c8=await json('./c8-barcode-targets.json');assert.equal(c8.count,163);
const c8SkuIds=new Set(c8.records.map((x:any)=>x.skuId));assert.equal(c8SkuIds.size,163);
await assert.rejects(()=>generateHistoricalBarcodes(),/基本数据对照表.xls冻结/);
const c9=await json('./c9-barcode-targets.json');assert.equal(c9.count,531);
const c9SkuIds=new Set(c9.records.map((x:any)=>x.skuId));assert.equal(c9SkuIds.size,531);assert([...c9SkuIds].every(id=>!c8SkuIds.has(id)));
await assert.rejects(()=>generateC9HistoricalBarcodes(),/基本数据对照表.xls冻结/);
const manifest=approvedExcelManifest(),active=manifest.records.filter((r:any)=>r.status==='ACTIVE');
const expected=new Map(active.map((r:any)=>[r.skuId,r]));
const supplement=approvedSchemeSupplement(manifest);
const generated=new Map(supplement.records.filter((r:any)=>r.status==='ACTIVE').map((r:any)=>[r.skuId,r]));
const result=await transaction(RUNTIME,async tx=>{
 await tx.execute('SET TRANSACTION READ ONLY');
 return {
  policy:(await tx.query('SELECT revision,source_sha256,body FROM barcode_authority_policy WHERE singleton')).rows[0],
  bindings:(await tx.query('SELECT g.* FROM generated_barcode g JOIN barcode_authority_product p ON p.product_id=g.product_id')).rows,
  duplicateRecords:(await tx.query("SELECT sku_id,record FROM barcode_authority_record WHERE status='DUPLICATE_REMOVED'")).rows,
  supplementRecords:(await tx.query('SELECT * FROM barcode_scheme_supplement')).rows,
  aliases:(await tx.query('SELECT count(*)::int n FROM product_barcode_alias a JOIN barcode_authority_product p ON p.product_id=a.product_id')).rows[0].n,
  withoutBarcode:(await tx.query("SELECT count(*)::int n FROM tplus_demo_20260922_a2.variant v WHERE NOT EXISTS(SELECT 1 FROM generated_barcode b WHERE b.sku_id=v.id)")).rows[0].n,
  pending:(await tx.query("SELECT count(*)::int n FROM tplus_demo_20260922_a2.variant v WHERE NOT EXISTS(SELECT 1 FROM generated_barcode b WHERE b.sku_id=v.id) AND NOT EXISTS(SELECT 1 FROM barcode_scheme_supplement n WHERE n.sku_id=v.id AND n.status='NOT_REQUIRED')")).rows[0].n
 };
});
assert.equal(result.policy.revision,manifest.revision);assert.equal(result.policy.source_sha256,manifest.sourceSha256);
assert.equal(result.bindings.length,14960);assert.equal(new Set(result.bindings.map((b:any)=>b.barcode)).size,14960);
for(const b of result.bindings){const r:any=expected.get(b.sku_id)||generated.get(b.sku_id);assert(r);assert.equal(b.product_id,r.productId);assert.equal(b.barcode,r.barcode);if(expected.has(b.sku_id)){assert.equal(b.evidence.originalBarcode,r.barcode);assert.equal(b.evidence.sourceSha256,manifest.sourceSha256);}else{assert.equal(b.evidence.rule,supplement.revision);assert.equal(b.evidence.goods,r.defaultBarcode);}}
assert.equal(result.duplicateRecords.length,2);assert.equal(result.supplementRecords.length,4288);assert.equal(result.aliases,0);assert.equal(result.withoutBarcode,10);assert.equal(result.pending,0);
assert.equal(result.supplementRecords.filter((r:any)=>r.status==='NOT_REQUIRED'&&r.barcode===null).length,10);assert.equal(result.supplementRecords.filter((r:any)=>r.status==='EXCEPTION').length,0);
assert.equal(result.policy.body.historyFinalized.revision,'history-barcode-final-20260930-v1');assert.equal(result.policy.body.automaticHistoricalProcessing,false);
for(const d of result.duplicateRecords){assert(!expected.has(d.sku_id));assert(expected.has(d.record.duplicateOfSkuId));}
await writeFile(new URL('../supplements-results.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),status:'PASS',sizeMappings:14864,halls:40,sourceHalls:47,barcodeAuthority:{revision:manifest.revision,sourceFile:manifest.sourceFile,sourceSha256:manifest.sourceSha256,rawRows:15097,distinctSpecs:10684,schemeSupplementRevision:supplement.revision,historyFinalized:true,finalDecisionRevision:supplement.finalDecisionRevision},stored:{count:14960,unique_count:14960,excelOriginal:10682,schemeSupplement:4278,aliases:0},duplicateBindingsRemoved:2,pendingSourceSkus:0,noBarcodeRequiredSkus:10,newProducts:14,newSpecs:106,newProductClassificationPending:14,c8:{historicalReviewSize:163,status:'SUPERSEDED_BY_APPROVED_EXCEL'},c9:{historicalReviewSize:531,status:'SUPERSEDED_BY_APPROVED_EXCEL'}},null,2)+'\n');
console.log('PASS 历史数据已定稿；14,960条唯一主码，10条无需条码，待处理0条');
