import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeStock26BindingPreparer} from './prepare-native-stock26-bindings.mjs';
const H='a'.repeat(64),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
 const binding={batchId:id(1),fixedSourceNamespace:'SYNTHETIC-STOCK26',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:H};
 const options={binding,selection:{entity:'INVENTORY_BASELINE',source:'BASE_V2',path:'business/12切换库存.csv',baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H,lineageCsvSha256:H},warehouses:[{sourceKey:'WH1',nativeId:id(20)},{sourceKey:'WH2',nativeId:id(21)}],skus:[{canonicalSourceKey:'CAN1',nativeId:id(30),productSourceKey:'P1',oldSourceKeys:['OLD1','OLD2']}],expected:{groups:1,contributors:2,signedTotal:'-3'}};
 const contributors=[-5,2].map((n,i)=>{const raw={来源编号:'OLD-STOCK-'+i,SKU来源编号:'OLD'+(i+1),仓库来源编号:'WH1',核准库存数量:String(n)};
  const source={id:id(100+i),batchId:binding.batchId,entityType:'INVENTORY_BASELINE',sourceKey:raw.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'STOCK',rowNo:String(i+2),sourceFileSha256:H,rowSha256:H,rawFields:raw,normalizedFields:{...raw},fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC_ORIGINAL',raw:v}]))}};
  return {source,lineage:{validator_version:'STOCK_CONTRIBUTOR_LINEAGE_V1',oldStockSourceId:raw.来源编号,canonicalStockRowSourceId:'GROUP1',warehouseSourceId:'WH1',oldSkuSourceId:raw.SKU来源编号,canonicalSkuSourceId:'CAN1',productSourceId:'P1',signedQuantity:String(n),sourceUnit:'件',sourceFile:source.fileRef,sourceSheet:source.sheet,sourceRow:source.rowNo,sourceSha256:H}};
 });
 return {options,input:{canonicalStock:{来源编号:'GROUP1',仓库来源编号:'WH1',SKU来源编号:'CAN1',核准库存数量:'-3',核准依据:'SYNTHETIC signed original sum',合并输入库存行数:'2',来源单位集合快照:'["件"]',库存行来源编号语义:'SYNTHETIC canonical identity'},contributors}};
}
test('stock26 joint preparer binds complete old aliases to explicit native refs and preserves signed originals without making absent scope zero',()=>{
 const f=fixture(),before=structuredClone(f),p=createNativeStock26BindingPreparer(f.options),prepared=p.prepare(f.input);
 assert.equal(prepared.warehouse.nativeId,id(20));assert.equal(prepared.sku.nativeId,id(30));assert.equal(prepared.signedQuantity,'-3');assert.deepEqual(f,before);assert.equal(prepared.contributors[0].lineage.oldSkuSourceId,'OLD1');
 const report=p.finish();assert.equal(report.groups,1);assert.equal(report.contributors,2);assert.equal(report.signedTotal,'-3');assert.equal(report.negativeOriginal,1);assert.equal(report.unrepresentedWarehouseScopes,1);assert.equal(Object.hasOwn(report,'zeroWarehouses'),false);assert.equal(report.executionAuthorized,false);assert.equal(report.baselinePosted,false);assert.throws(()=>p.prepare(f.input),/CLOSED/);
});
test('stock26 join denies wrong product, missing alias, wrong canonical target or namespace without selecting another candidate',()=>{
 for(const mutate of [x=>{x.contributors[0].lineage.productSourceId='OTHER';},x=>{x.contributors[0].lineage.oldSkuSourceId='UNREVIEWED';},x=>{x.canonicalStock.SKU来源编号='MISSING';},x=>{x.contributors[0].source.batchId=id(999);},x=>{x.contributors[0].lineage.warehouseSourceId='WH2';}]){
  const f=fixture(),p=createNativeStock26BindingPreparer(f.options);mutate(f.input);assert.throws(()=>p.prepare(f.input));assert.throws(()=>p.finish(),/CLOSED/);
 }
 const f=fixture();f.options.skus.push({...f.options.skus[0],canonicalSourceKey:'CAN2',nativeId:id(31)});assert.throws(()=>createNativeStock26BindingPreparer(f.options),/ALIAS/);
});
test('stock26 global coverage rejects a repeated physical occurrence across otherwise distinct groups and missing complete coverage',()=>{
 const f=fixture();f.options.expected={groups:2,contributors:4,signedTotal:'-6'};const p=createNativeStock26BindingPreparer(f.options);p.prepare(f.input);const second=structuredClone(f.input);second.canonicalStock.来源编号='GROUP2';second.canonicalStock.仓库来源编号='WH2';
 for(const [i,c]of second.contributors.entries()){c.source.id=id(200+i);c.source.sourceKey='SECOND-STOCK-'+i;c.source.rawFields.来源编号=c.source.sourceKey;c.source.normalizedFields.来源编号=c.source.sourceKey;c.source.rawFields.仓库来源编号=c.source.normalizedFields.仓库来源编号='WH2';for(const [k,v]of Object.entries(c.source.rawFields))c.source.fieldProvenance.fields[k].raw=v;c.lineage.oldStockSourceId=c.source.sourceKey;c.lineage.canonicalStockRowSourceId='GROUP2';c.lineage.warehouseSourceId='WH2';}
 assert.throws(()=>p.prepare(second),/DUPLICATE_CONTRIBUTOR/);
 const g=fixture();g.options.expected={groups:2,contributors:4,signedTotal:'-6'};const missing=createNativeStock26BindingPreparer(g.options);missing.prepare(g.input);assert.throws(()=>missing.finish(),/INCOMPLETE/);assert.throws(()=>missing.prepare(g.input),/CLOSED/);
});
test('stock26 preparer captures plain exact options, rejects source extras/getters, and does not treat claimed count or total as validation',()=>{
 const f=fixture();let gets=0;const accessor={...f.options};Object.defineProperty(accessor,'warehouses',{enumerable:true,get(){gets++;return f.options.warehouses;}});assert.throws(()=>createNativeStock26BindingPreparer(accessor),/OPTIONS/);assert.equal(gets,0);
 const p=createNativeStock26BindingPreparer(f.options);f.options.warehouses[0].nativeId=id(999);assert.equal(p.prepare(f.input).warehouse.nativeId,id(20));p.finish();
 const g=fixture(),q=createNativeStock26BindingPreparer(g.options);assert.throws(()=>q.prepare({...g.input,warehouse:{sourceKey:'WH1',nativeId:id(999)}}),/GROUP_OPTIONS/);
 const h=fixture();h.options.expected.signedTotal='3';const total=createNativeStock26BindingPreparer(h.options);total.prepare(h.input);assert.throws(()=>total.finish(),/INCOMPLETE/);
});
