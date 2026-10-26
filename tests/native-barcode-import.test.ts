import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { prepareNativeBarcode,stageNativeBarcode,nativeBarcodeSourceEvidence,NATIVE_BARCODE_MAIN_DEMOTION_VERSION } from '../packages/application/src/native-barcode-import.ts';
import type { NativeBarcodeInput } from '../packages/application/src/native-barcode-import.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,pin='a'.repeat(64);
function input():NativeBarcodeInput{
 const n:Record<string,string>=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE')!.columns.map(c=>[c.name,'']));
 Object.assign(n,{'来源编号':'SYNTHETIC:1','条码':'SYNTHETIC_OLD_MAIN','条码性质':'已确认旧码','原始条码性质快照':'主码','绑定范围':'SKU','SKU来源编号':'SYNTHETIC_CANONICAL','合并前SKU来源编号':'SYNTHETIC_ORIGINAL_SKU','状态':'正常','原条码方案':'SYNTHETIC SCHEME'});const raw={...n,'SKU来源编号':'SYNTHETIC_ORIGINAL_SKU','条码性质':'主码'};
 return{batchId:id(1),fixedSourceNamespace:'SYNTHETIC',selection:{source:'V3_BARCODE_REPLACEMENT',entity:'BARCODE',path:'business/03历史条码.csv',baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,csvSha256:pin,excludedSourceIdsSetSha256:pin},
 source:{id:id(2),batchId:id(1),entityType:'BARCODE',sourceKey:n['来源编号']!,fileRef:'synthetic.xlsx',sheet:'SYNTHETIC barcode',rowNo:'2',sourceFileSha256:pin,rowSha256:pin,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC source cell',raw:v}]))}},
 nativeBarcodeId:id(3),sku:{nativeId:id(4),canonicalSourceKey:n['SKU来源编号']!,oldSourceSkuKey:n['合并前SKU来源编号']!},scheme:{id:id(5),snapshot:{id:id(5),name:'SYNTHETIC SCHEME'}},mainDemotion:{version:NATIVE_BARCODE_MAIN_DEMOTION_VERSION,mappingSha256:pin,approvalSha256:pin,entrySha256:pin,sourceKey:n['来源编号']!,originalSourceRowSha256:pin,oldSourceSkuKey:n['合并前SKU来源编号']!,canonicalSourceSkuKey:n['SKU来源编号']!,barcode:n['条码']!,keptMainSourceKey:'SYNTHETIC_KEPT',keptMainBarcode:'SYNTHETIC_KEPT_BARCODE'}};
}
test('exact demotion descriptor preserves original MAIN/raw SKU and existing canonical merge; STAGE still needs external authority',async()=>{
 const x=input(),before=structuredClone(x.source),p=prepareNativeBarcode(x);assert.equal(p.nativeBarcode.barcode_kind,'CONFIRMED_OLD');assert.deepEqual(p.source,before);const evidence=nativeBarcodeSourceEvidence(p);assert.equal((evidence.raw_fields as any)['条码性质'],'主码');assert.deepEqual((evidence.field_provenance as any).native_barcode_import.main_demotion,x.mainDemotion);
 let writes=0;await assert.rejects(stageNativeBarcode(x,{mode:'STAGE',store:{async stage(){writes++;return{inserted:1,replayed:0};}}}),/independent|authority/i);assert.equal(writes,0);
});
test('unbound old MAIN demotion or edited raw/canonical/retained-main evidence remains refused',()=>{
 for(const mutate of [(x:any)=>{delete x.mainDemotion;},(x:any)=>{x.mainDemotion.canonicalSourceSkuKey='OTHER_GROUP';},(x:any)=>{x.mainDemotion.originalSourceRowSha256='b'.repeat(64);},(x:any)=>{x.mainDemotion.keptMainSourceKey=x.source.sourceKey;},(x:any)=>{x.source.rawFields['条码']='CHANGED';},(x:any)=>{x.mainDemotion.approved=true;}]){const x=input();mutate(x);assert.throws(()=>prepareNativeBarcode(x));}
});

// Binding scope is a v3 normalized migration field, absent from original cells.
test('v3 SKU selection accepts missing original migration scope without manufacturing raw cells; explicit non-SKU still refuses',()=>{
 const x=input();delete (x.source.rawFields as any)['绑定范围'];delete (x.source.fieldProvenance.fields as any)['绑定范围'];const before=structuredClone(x.source);
 const p=prepareNativeBarcode(x);assert.deepEqual(p.source,before);assert.equal(Object.hasOwn(p.source.rawFields,'绑定范围'),false);assert.equal(p.nativeBarcode.sku_id,x.sku.nativeId);
 for(const value of ['PRODUCT','',null]){const y=input();(y.source.rawFields as any)['绑定范围']=value;assert.throws(()=>prepareNativeBarcode(y),/Original SKU binding/);}
 const y=input();delete (y.source.rawFields as any)['绑定范围'];(y.source.normalizedFields as any)['绑定范围']='PRODUCT';assert.throws(()=>prepareNativeBarcode(y),/Original SKU binding/);
});
