/** Pure header/native-reference join under the existing mapper identity rule.
 * Trusted source/ref/money artifacts must be authenticated by the caller. */
import {createHash} from 'node:crypto';
import {prepareV3HistoryHeader} from '../../packages/application/src/import-v3-history-header.ts';
import {v2MoneyApprovalSet} from '../../packages/application/src/import-v2.ts';
import {historySettlementRequestHash as checkedHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});},text=v=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0'),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nativeColumns={HALL:['id','name','version','default_customer_id','default_sales_warehouse_id','enabled'],WAREHOUSE:['id','name','version','hall_id','enabled','created_operation_id'],STAFF:['id','name','version','hall_id','role','contact','employment_status'],CUSTOMER:['id','name','version','code','enabled','created_at','updated_at']};
/** Source-backed identity candidate only. No full header/hall/native-reference
 * preparation, allocation-registry UUID, SQL state or import authority. */
export function prepareSalesHeaderSourceIdentity26(binding,record){
 must(exact(binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(binding.batchId)&&text(binding.fixedSourceNamespace)&&hash(binding.selectionSha256),'HEADER26_BINDING_SCOPE');
 const s=record.source,sel=record.selection;must(s?.entityType==='SALES_HEADER'&&s.batchId===binding.batchId&&sel?.entity==='SALES_HEADER'&&sel.source==='BASE_V2'&&sel.selectionSha256===binding.selectionSha256,'HEADER26_SALES_IDENTITY_SCOPE');
 must(uuid(s.id)&&text(s.sourceKey)&&hash(s.sourceFileSha256)&&hash(s.rowSha256)&&s.rawFields?.来源编号===s.sourceKey&&s.normalizedFields?.来源编号===s.sourceKey,'HEADER26_SALES_IDENTITY_SOURCE');
 return {sourceKey:s.sourceKey,nativeId:stableImportId('history-sales-header',binding.fixedSourceNamespace,s.sourceKey),sourceRowId:s.id,sourceFileSha256:s.sourceFileSha256,rowSha256:s.rowSha256,version:1};
}
export function createNativeHeader26BindingPreparer(options){
 must(exact(options,['binding','parties','historicalCustomers','moneyApprovals','expected']),'HEADER26_BINDING_OPTIONS');checkedHash(options);const o=structuredClone(options),b=o.binding;
 must(exact(b,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(b.batchId)&&text(b.fixedSourceNamespace)&&text(b.cutoffAt)&&hash(b.selectionSha256),'HEADER26_BINDING_SCOPE');
 must(Array.isArray(o.parties)&&o.parties.length>0&&o.parties.length<=10000&&Array.isArray(o.historicalCustomers)&&o.historicalCustomers.length<=2&&Array.isArray(o.moneyApprovals),'HEADER26_BINDING_REFERENCES');
 must(exact(o.expected,['SALES_HEADER','TRANSFER_HEADER','historicalReferences'])&&Object.values(o.expected).every(n=>Number.isSafeInteger(n)&&n>=0)&&o.expected.SALES_HEADER+o.expected.TRANSFER_HEADER>0&&o.expected.SALES_HEADER+o.expected.TRANSFER_HEADER<=100000,'HEADER26_BINDING_EXPECTED');
 const index=new Map(),historical=new Map(),nativeIds=new Set();
 function add(entity,sourceKey,native){must(Object.hasOwn(nativeColumns,entity)&&text(sourceKey)&&exact(native,nativeColumns[entity])&&uuid(native.id)&&native.version===1&&text(native.name)&&!nativeIds.has(native.id)&&!index.has(JSON.stringify([entity,sourceKey])),'HEADER26_BINDING_REFERENCE');if(entity==='WAREHOUSE')must(native.created_operation_id===null,'HEADER26_BINDING_WAREHOUSE_METADATA');index.set(JSON.stringify([entity,sourceKey]),{entity,sourceKey,nativeSnapshot:native});nativeIds.add(native.id);}
 for(const p of o.parties){must(exact(p,['entity','sourceKey','nativeSnapshot']),'HEADER26_BINDING_PARTY');add(p.entity,p.sourceKey,p.nativeSnapshot);}
 for(const p of o.historicalCustomers){must(exact(p,['sourceKey','originalPartyIdentity','sourceDocumentNumber','nativeSnapshot'])&&uuid(p.originalPartyIdentity)&&p.sourceKey==='HIST-CUSTOMER:'+p.originalPartyIdentity&&text(p.sourceDocumentNumber)&&p.nativeSnapshot?.enabled===false&&p.nativeSnapshot.created_at===null&&p.nativeSnapshot.updated_at===null&&!historical.has(p.sourceKey),'HEADER26_BINDING_HISTORICAL');add('CUSTOMER',p.sourceKey,p.nativeSnapshot);historical.set(p.sourceKey,p);}
 const approvals=v2MoneyApprovalSet(o.moneyApprovals,o.moneyApprovals),seen=new Set(),sourceIds=new Set(),positions=new Set(),historyIds=new Set(),counts={SALES_HEADER:0,TRANSFER_HEADER:0},stream=createHash('sha256');let historicalReferences=0,closed=false,poisoned=false;
 const active=()=>must(!closed&&!poisoned,'HEADER26_BINDING_CLOSED');
 function close(){closed=true;for(const m of [index,historical,nativeIds,seen,sourceIds,positions,historyIds])m.clear();o.parties.length=0;o.historicalCustomers.length=0;o.moneyApprovals.length=0;approvals.clear();}
 return {
  prepare(record){active();try{
   must(exact(record,['source','selection','creatorHallOverlay','temporalEvidence']),'HEADER26_BINDING_RECORD');checkedHash(record);const r=structuredClone(record),s=r.source,n=s.normalizedFields,entity=s.entityType;
   must(Object.hasOwn(counts,entity)&&s.batchId===b.batchId&&r.selection.entity===entity&&r.selection.selectionSha256===b.selectionSha256&&counts[entity]<o.expected[entity],'HEADER26_BINDING_SOURCE_SCOPE');
   const identity=JSON.stringify([entity,s.sourceKey]),position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);must(!seen.has(identity)&&!sourceIds.has(s.id)&&!positions.has(position),'HEADER26_BINDING_DUPLICATE');const bindings={},references=[];let matchedHistorical=null;
   function reference(field,target,optional=false){const key=n[field];if(optional&&key==='')return;must(text(key),'HEADER26_BINDING_REFERENCE_REQUIRED');const party=index.get(JSON.stringify([target,key]));must(party,'HEADER26_BINDING_REFERENCE_MISSING');
    if(target==='CUSTOMER'&&historical.has(key)){const h=historical.get(key);must(entity==='SALES_HEADER'&&n.原单号===h.sourceDocumentNumber&&key==='HIST-CUSTOMER:'+h.originalPartyIdentity,'HEADER26_BINDING_HISTORICAL_INVOICE');matchedHistorical={sourceKey:key,originalPartyIdentity:h.originalPartyIdentity,sourceDocumentNumber:h.sourceDocumentNumber,nativeCustomerId:h.nativeSnapshot.id};}
    bindings[field]={sourceKey:key,nativeId:party.nativeSnapshot.id};references.push({field,entity:target,sourceKey:key,nativeId:party.nativeSnapshot.id,nativeSnapshotHash:requestHash(party.nativeSnapshot)});
   }
   if(entity==='SALES_HEADER'){reference('所属厅来源编号','HALL');reference('客户来源编号','CUSTOMER');reference('仓库来源编号','WAREHOUSE');reference('营业员来源编号','STAFF',true);}else{reference('调出仓来源编号','WAREHOUSE');reference('调入仓来源编号','WAREHOUSE');}reference('原创建厅编号','HALL',true);
   const input={batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,...r,bindings,moneyApprovals:structuredClone(approvals)},prepared=prepareV3HistoryHeader(input);
   must(!historyIds.has(prepared.header.id),'HEADER26_BINDING_DUPLICATE_HISTORY_ID');seen.add(identity);sourceIds.add(s.id);positions.add(position);historyIds.add(prepared.header.id);counts[entity]++;if(matchedHistorical)historicalReferences++;stream.update(prepared.fingerprint+'\n');
   const decision={entity,sourceKey:s.sourceKey,sourceRowId:s.id,sourceContextHash:requestHash(r),normalizedRowHash:requestHash(n),historyId:prepared.header.id,historyIdRule:'EXISTING_MAPPER_STABLE_IMPORT_ID',bindings,references,historicalCustomerBinding:matchedHistorical,header:structuredClone(prepared.header),preparedFingerprint:prepared.fingerprint,fieldProvenanceHash:requestHash(prepared.fieldProvenance),temporalHash:requestHash(prepared.temporal)};
   return {input,prepared,decision};
  }catch(error){poisoned=true;throw error;}},
  finish(){active();try{must(counts.SALES_HEADER===o.expected.SALES_HEADER&&counts.TRANSFER_HEADER===o.expected.TRANSFER_HEADER&&historicalReferences===o.expected.historicalReferences,'HEADER26_BINDING_INCOMPLETE');const result=Object.freeze({kind:'NATIVE_HEADER26_BINDING_PREPARATION_ONLY_V1',counts:Object.freeze({...counts}),rows:counts.SALES_HEADER+counts.TRANSFER_HEADER,historicalReferences,preparedFingerprintStreamSha256:stream.digest('hex'),historyIdentityRule:'EXISTING_MAPPER_STABLE_IMPORT_ID',newNativeUUIDs:0,noSql:true,executionAuthorized:false});close();return result;}catch(error){poisoned=true;throw error;}},close
 };
}
