/** Pure finite native-reference join. Outside source/reference reviews belong to
 * the caller; this preparer never grants execution or posts a stock baseline. */
import {createHash} from 'node:crypto';
import {prepareNativeStockGroup} from '../../packages/application/src/native-stock-contributor-import.ts';
import {historySettlementRequestHash as checkedHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {isHistoryQuantity} from '../../packages/application/src/history-storage-contract.ts';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});},text=v=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function createNativeStock26BindingPreparer(options){
 must(exact(options,['binding','selection','warehouses','skus','expected']),'STOCK26_BINDING_OPTIONS');checkedHash(options);const o=structuredClone(options);
 must(exact(o.binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(o.binding.batchId)&&text(o.binding.fixedSourceNamespace)&&text(o.binding.cutoffAt)&&hash(o.binding.selectionSha256),'STOCK26_BINDING_SCOPE');
 must(exact(o.selection,['entity','source','path','baseManifestSha256','selectionSha256','approvalSha256','csvSha256','lineageCsvSha256'])&&o.selection.entity==='INVENTORY_BASELINE'&&o.selection.source==='BASE_V2'&&o.selection.path==='business/12切换库存.csv'&&o.selection.selectionSha256===o.binding.selectionSha256&&['baseManifestSha256','selectionSha256','approvalSha256','csvSha256','lineageCsvSha256'].every(k=>hash(o.selection[k])),'STOCK26_BINDING_SELECTION');
 must(exact(o.expected,['groups','contributors','signedTotal'])&&Number.isSafeInteger(o.expected.groups)&&o.expected.groups>0&&o.expected.groups<=300000&&Number.isSafeInteger(o.expected.contributors)&&o.expected.contributors>=o.expected.groups&&o.expected.contributors<=300000&&isHistoryQuantity(o.expected.signedTotal),'STOCK26_BINDING_EXPECTED');
 must(Array.isArray(o.warehouses)&&o.warehouses.length>0&&o.warehouses.length<=10000&&Array.isArray(o.skus)&&o.skus.length>0&&o.skus.length<=100000,'STOCK26_BINDING_REFERENCE_BOUND');
 const warehouses=new Map(),skus=new Map(),aliases=new Map(),nativeIds=new Set();
 for(const w of o.warehouses){must(exact(w,['sourceKey','nativeId'])&&text(w.sourceKey)&&uuid(w.nativeId)&&!warehouses.has(w.sourceKey)&&!nativeIds.has(w.nativeId),'STOCK26_BINDING_WAREHOUSE');warehouses.set(w.sourceKey,w);nativeIds.add(w.nativeId);}
 for(const s of o.skus){must(exact(s,['canonicalSourceKey','nativeId','productSourceKey','oldSourceKeys'])&&text(s.canonicalSourceKey)&&text(s.productSourceKey)&&uuid(s.nativeId)&&!skus.has(s.canonicalSourceKey)&&!nativeIds.has(s.nativeId)&&Array.isArray(s.oldSourceKeys)&&s.oldSourceKeys.length>0&&s.oldSourceKeys.length<=1000,'STOCK26_BINDING_SKU');
  for(const old of s.oldSourceKeys){must(text(old)&&!aliases.has(old),'STOCK26_BINDING_ALIAS');aliases.set(old,s.canonicalSourceKey);}skus.set(s.canonicalSourceKey,s);nativeIds.add(s.nativeId);}
 const groupIds=new Set(),keys=new Set(),sources=new Set(),sourceIds=new Set(),positions=new Set(),usedWarehouses=new Set(),stream=createHash('sha256');let closed=false,poisoned=false,groups=0,contributors=0,total=0n,negativeOriginal=0,negativeGroups=0;
 const active=()=>must(!closed&&!poisoned,'STOCK26_BINDING_CLOSED');
 function close(){closed=true;for(const map of [warehouses,skus,aliases,nativeIds,groupIds,keys,sources,sourceIds,positions,usedWarehouses])map.clear();o.warehouses.length=0;o.skus.length=0;}
 return {
  prepare(input){active();try{
   must(exact(input,['canonicalStock','contributors']),'STOCK26_BINDING_GROUP_OPTIONS');checkedHash(input);const value=structuredClone(input),c=value.canonicalStock;
   const w=warehouses.get(c?.仓库来源编号),s=skus.get(c?.SKU来源编号),key=JSON.stringify([c?.仓库来源编号,c?.SKU来源编号]);
   must(w&&s,'STOCK26_BINDING_REFERENCE_MISSING');must(!groupIds.has(c.来源编号)&&!keys.has(key),'STOCK26_BINDING_DUPLICATE_GROUP');
   must(Array.isArray(value.contributors)&&value.contributors.length>0&&value.contributors.length<=200&&groups<o.expected.groups&&contributors+value.contributors.length<=o.expected.contributors,'STOCK26_BINDING_GROUP_COVERAGE');
   const pendingSources=new Set(),pendingIds=new Set(),pendingPositions=new Set();let negatives=0;
   for(const r of value.contributors){must(exact(r,['source','lineage']),'STOCK26_BINDING_CONTRIBUTOR');const l=r.lineage,source=r.source,position=JSON.stringify([source?.sourceFileSha256,source?.sheet,source?.rowNo]);
    must(l?.warehouseSourceId===w.sourceKey&&l.canonicalSkuSourceId===s.canonicalSourceKey&&l.productSourceId===s.productSourceKey&&aliases.get(l.oldSkuSourceId)===s.canonicalSourceKey,'STOCK26_BINDING_ALIAS_OR_PRODUCT');
    must(!sources.has(source.sourceKey)&&!sourceIds.has(source.id)&&!positions.has(position)&&!pendingSources.has(source.sourceKey)&&!pendingIds.has(source.id)&&!pendingPositions.has(position),'STOCK26_BINDING_DUPLICATE_CONTRIBUTOR');pendingSources.add(source.sourceKey);pendingIds.add(source.id);pendingPositions.add(position);if(isHistoryQuantity(l.signedQuantity)&&BigInt(l.signedQuantity)<0n)negatives++;
   }
   const prepared=prepareNativeStockGroup({batchId:o.binding.batchId,fixedSourceNamespace:o.binding.fixedSourceNamespace,selection:o.selection,canonicalStock:c,warehouse:{sourceKey:w.sourceKey,nativeId:w.nativeId},sku:{canonicalSourceKey:s.canonicalSourceKey,nativeId:s.nativeId},contributors:value.contributors});
   groupIds.add(c.来源编号);keys.add(key);for(const v of pendingSources)sources.add(v);for(const v of pendingIds)sourceIds.add(v);for(const v of pendingPositions)positions.add(v);usedWarehouses.add(w.sourceKey);groups++;contributors+=value.contributors.length;total+=BigInt(prepared.signedQuantity);negativeOriginal+=negatives;if(BigInt(prepared.signedQuantity)<0n)negativeGroups++;stream.update(prepared.fingerprint+'\n');return prepared;
  }catch(error){poisoned=true;throw error;}},
  finish(){active();try{must(groups===o.expected.groups&&contributors===o.expected.contributors&&total.toString()===o.expected.signedTotal,'STOCK26_BINDING_INCOMPLETE');const result=Object.freeze({kind:'NATIVE_STOCK26_BINDING_PREPARATION_ONLY_V1',groups,contributors,signedTotal:total.toString(),negativeOriginal,negativeGroups,warehouseReferenceScope:warehouses.size,representedWarehouses:usedWarehouses.size,unrepresentedWarehouseScopes:warehouses.size-usedWarehouses.size,preparedFingerprintStreamSha256:stream.digest('hex'),newNativeUUIDs:0,baselinePosted:false,noSql:true,executionAuthorized:false});close();return result;}catch(error){poisoned=true;throw error;}},close
 };
}
