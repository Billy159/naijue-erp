/** SOURCE ONLY. A finite new synthetic legacy-cutoff input, never a publication receipt. */
import {createHash} from 'node:crypto';
import {buildFixture as referenceFixture,SETUP_COLUMNS,setupInsert} from '../../opt00/pg-component/contract.mjs';
import {seedCommands} from '../../opt00/pg-component/seed.mjs';
import {stableImportId,validateCutoffImportCommand} from '../../../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
export const CASE_ID='c20261101b001';
export const SCOPE='SOURCE_ONLY_LEGACY_CUTOFF_COMPONENT_NOT_V2_HISTORY_RUNTIME_OR_PERFORMANCE';
export const SHA=value=>createHash('sha256').update(value).digest('hex');
export function need(condition,code){if(!condition)throw Object.assign(new Error(code),{code});}
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const uuid=label=>{const h=SHA('synthetic:opt02:legacy-cutoff:'+CASE_ID+':'+label);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
const file=(name,utf8)=>freeze({path:'synthetic:opt02:'+CASE_ID+'/'+name,utf8,bytes:Buffer.byteLength(utf8),sha256:SHA(utf8)});
export function buildLegacyCutoffFixture(){
 const reference=referenceFixture({id:CASE_ID});
 const warehouses=[0,1].map(i=>({id:uuid('warehouse:'+i),hall_id:reference.hallId,name:'SYNTHETIC OPT02 WAREHOUSE '+i,enabled:true,version:1,created_operation_id:null}));
 const productId=uuid('alternate-product'),skuId=uuid('alternate-sku');
 const alternateProduct={id:productId,code:'PGOPT02-'+CASE_ID+'-ALT',name:'SYNTHETIC OPT02 ALTERNATE PRODUCT',retailPrice:'2.50',groupId:reference.targetGroupId};
 const skus=[...reference.skuIds.map((id,i)=>({id,product_id:reference.productId,color_id:reference.colorId,fit_id:reference.fitId,size_id:reference.sizes[i===0?0:22].id,sku_code:'SYNTHETIC-SKU-'+CASE_ID+'-'+i,enabled:true,version:1,created_operation_id:null})),{id:skuId,product_id:productId,color_id:reference.colorId,fit_id:reference.fitId,size_id:reference.sizes[0].id,sku_code:'SYNTHETIC-OPT02-SKU-'+CASE_ID,enabled:true,version:1,created_operation_id:null}];
 const baselines=[{warehouseId:warehouses[0].id,skuId:skus[0].id,quantity:'7'},{warehouseId:warehouses[0].id,skuId:skus[1].id,quantity:'-2'},{warehouseId:warehouses[1].id,skuId:skus[0].id,quantity:'11'},{warehouseId:warehouses[1].id,skuId:skus[2].id,quantity:'5'}].map((r,i)=>({...r,sourceKey:'BASELINE-'+i,businessDate:'2026-11-01'}));
 const zeroPairs=warehouses.flatMap(w=>skus.filter(s=>!baselines.some(b=>b.warehouseId===w.id&&b.skuId===s.id)).map(s=>({warehouseId:w.id,skuId:s.id,quantity:'0',basis:'FINITE_COMPLETE_SOURCE_EXPLICIT_ABSENCE'})));
 const references=file('references.json',JSON.stringify({format:'LITERAL_SYNTHETIC_PRE_CUTOFF_REFERENCE_PLAN_V1',reference,warehouses,alternateProduct,skus,credentials:'RANDOM_MEMORY_ONLY_APPLICATION_SCRYPT_AND_DATABASE_PASSWORDS_NOT_SOURCE_ARTIFACTS'},null,2)+'\n');
 const originals=[...warehouses.map(w=>({entity:'WAREHOUSE',sourceKey:'WAREHOUSE-'+warehouses.indexOf(w),native:w})),...skus.map(s=>({entity:'SKU',sourceKey:'SKU-'+skus.indexOf(s),native:s})),...baselines.map(b=>({entity:'INVENTORY_BASELINE',sourceKey:b.sourceKey,warehouseId:b.warehouseId,skuId:b.skuId,signedQuantity:b.quantity,businessDate:b.businessDate}))];
 const lines=originals.map(row=>JSON.stringify(row)),source=file('source.ndjson',lines.join('\n')+'\n');
 const expected={WAREHOUSE:2,SKU:3,INVENTORY_LEDGER:4,IMPORT_BATCH:1},namespace='synthetic.opt02.legacy-cutoff.'+CASE_ID,batchId=stableImportId('batch',namespace,'FINITE_COMPLETE_SOURCE_V1'),cutoffAt='2026-11-01T00:00:00.000Z';
 const manifest=file('manifest.json',JSON.stringify({format:'FINITE_SYNTHETIC_LEGACY_CUTOFF_SOURCE_MANIFEST_V1',scope:SCOPE,caseId:CASE_ID,namespace,batchId,cutoffAt,mappingVersion:'synthetic-legacy-cutoff-v1',files:[references,source].map(({utf8,...d})=>d),expected,allNativeWarehouseIds:warehouses.map(w=>w.id),allNativeSkuIds:skus.map(s=>s.id),nonzeroBaselines:baselines,explicitZeroPairs:zeroPairs,finalDelta:{rows:[],reason:'CLOSED_SYNTHETIC_INPUT_HAS_NO_EXTERNAL_FEED_OR_UNRESOLVED_CHANGE'},noHistorySourceRows:true,noProductSourceRows:true},null,2)+'\n');
 const sourceItems=originals.map((row,i)=>({sourceEntityType:row.entity,sourceKey:row.sourceKey,sourceRecordHash:SHA(lines[i]),sourceFileRef:source.path,...(row.entity==='INVENTORY_BASELINE'?{targetType:'INVENTORY_LEDGER',warehouseId:row.warehouseId,skuId:row.skuId,quantity:BigInt(row.signedQuantity),businessDate:row.businessDate}:{targetType:row.entity,targetId:row.native.id})}));
 const envelope={actorAccountId:reference.actor.accountId,batchId};
 const commands=[{...envelope,action:'IMPORT_STAGE',requestKey:CASE_ID+':STAGE',sourceName:namespace,sourceHash:manifest.sha256,sourceManifestRef:manifest.path,cutoffAt,mappingVersion:'synthetic-legacy-cutoff-v1',expected},{...envelope,action:'IMPORT_CHUNK',requestKey:CASE_ID+':MEMBERS',expectedSequence:0,expectedCursor:0,items:sourceItems.filter(i=>i.targetType!=='INVENTORY_LEDGER')},{...envelope,action:'IMPORT_CHUNK',requestKey:CASE_ID+':BASELINES',expectedSequence:1,expectedCursor:5,items:sourceItems.filter(i=>i.targetType==='INVENTORY_LEDGER')},{...envelope,action:'IMPORT_PUBLISH',requestKey:CASE_ID+':PUBLISH',expectedSequence:2,expectedCursor:9,approval:{completeScope:true,absentMeansZero:true,allFilesVerified:true,finalDeltaVerified:true,noUnresolvedExceptions:true,sourceHash:manifest.sha256,sourceManifestRef:manifest.path}}];
 commands.forEach(validateCutoffImportCommand);
 const zero={WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},memberCounts={...zero,WAREHOUSE:2,SKU:3};
 const checkpoints=[{sequence:0,cursor:0,counts:zero,expected},{sequence:1,cursor:5,counts:memberCounts,expected},{sequence:2,cursor:9,counts:{...memberCounts,INVENTORY_LEDGER:4},expected},{sequence:3,cursor:10,counts:expected,expected}];
 const expectedResults=commands.map((c,i)=>({operationId:stableImportId('operation',c.actorAccountId,c.requestKey),batchId,sequence:checkpoints[i].sequence,cursor:checkpoints[i].cursor,status:i===0?'STAGED':i===3?'IMPORTED':'VALIDATING',ledgerEntryIds:i===2?c.items.map(item=>stableImportId('baseline',namespace,item.sourceEntityType,item.sourceKey)).sort():[]}));
 return freeze({scope:SCOPE,caseId:CASE_ID,reference,warehouses,alternateProduct,skus,baselines,zeroPairs,expected,namespace,batchId,cutoffAt,artifacts:[references,source,manifest],commands,commandHashes:commands.map(requestHash),checkpoints,expectedResults,referenceRowCount:103,originalReferenceRowCount:99,extraReferenceRows:4,expectedProductStocks:[{id:reference.productId,quantity:'16'},{id:reference.disabledProductId,quantity:'0'},{id:productId,quantity:'5'}],nativeWarehouseCreateEnabled:false,sourceOnly:true,executionApproved:false});
}
/** Pre-cutoff setup only; reuse the reviewed99-row writer before this exact additive4. */
export function extraReferenceCommands(passwordHash){
 const f=buildLegacyCutoffFixture(),original=seedCommands(f.reference,passwordHash),template=original.find(r=>r.table==='product'&&r.values[0]===f.reference.productId);need(template,'ORIGINAL_REFERENCE_PRODUCT_REQUIRED');
 const values=[...template.values];for(const [key,value] of Object.entries({id:f.alternateProduct.id,product_code:f.alternateProduct.code,name:f.alternateProduct.name,retail_price:f.alternateProduct.retailPrice,system_item_code:'OPT02-ALT'}))values[SETUP_COLUMNS.product.indexOf(key)]=value;
 return freeze([...f.warehouses.map(w=>({table:'warehouse',text:'INSERT INTO naijue_erp.warehouse (id,hall_id,name,enabled,version,created_operation_id) VALUES ($1,$2,$3,$4,$5,$6)',values:[w.id,w.hall_id,w.name,w.enabled,w.version,null]})),{table:'product',...setupInsert('product',values)},{table:'sku',...setupInsert('sku',Object.values(f.skus[2]))}]);
}
