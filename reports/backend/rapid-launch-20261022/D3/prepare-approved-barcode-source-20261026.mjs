// Actual approved scheme + old/canonical SKU identity wiring for original BARCODE
// preparation. No source IO, UUID allocation, target write or execution authority.
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export function createApprovedBarcodeBindingPreparer26({original,binding,selection,schemes,skuBindings,nativeBarcodeIdentities,mainDemotions,expectedRows=15018,expectedDemotions=21,current}){
 need(skuBindings instanceof Map&&nativeBarcodeIdentities instanceof Map&&typeof current==='function'&&Number.isSafeInteger(expectedRows)&&expectedRows>0&&expectedRows<=15018&&Number.isSafeInteger(expectedDemotions)&&expectedDemotions>=0&&expectedDemotions<=21,'APPROVED_BARCODE_PREPARATION_SCOPE');
 const b=structuredClone(binding),sel=structuredClone(selection),aliases=structuredClone(skuBindings),identities=structuredClone(nativeBarcodeIdentities);
 need(identities.size===expectedRows&&sel.entity==='BARCODE'&&sel.source==='V3_BARCODE_REPLACEMENT'&&sel.selectionSha256===b.selectionSha256,'APPROVED_BARCODE_COMPLETE_IDENTITIES');
 const allocated=new Set(),canonical=new Map(),aliasIds=new Set();
 for(const[k,v]of identities){need(typeof k==='string'&&v?.entity==='BARCODE'&&v.sourceKey===k&&uuid(v.nativeId)&&v.nativeId!==k&&!allocated.has(v.nativeId)&&/^[a-f0-9]{64}$/.test(v.normalizedHash??''),'APPROVED_BARCODE_IDENTITY');allocated.add(v.nativeId);}
 for(const[k,v]of aliases){need(v?.oldSourceSkuKey===k&&typeof v.canonicalSourceKey==='string'&&uuid(v.nativeId)&&uuid(v.aliasSourceRowId)&&uuid(v.importRecordId)&&!aliasIds.has(v.aliasSourceRowId),'APPROVED_BARCODE_ALIAS');
  need(!canonical.has(v.canonicalSourceKey)||canonical.get(v.canonicalSourceKey)===v.nativeId,'APPROVED_BARCODE_CANONICAL_CONFLICT');canonical.set(v.canonicalSourceKey,v.nativeId);aliasIds.add(v.aliasSourceRowId);}
 let closed=false,finished=false,rows=0,demotions=0,main=0,compatible=0;const sourceKeys=new Set(),sourceIds=new Set(),rawCodes=new Set(),positions=new Set(),mains=new Set();
 const active=()=>{need(!closed&&!finished,'APPROVED_BARCODE_PREPARER_CLOSED');current();};
 return{async prepare(source){active();const before=original.historySettlementRequestHash(source),s=structuredClone(source),n=s.normalizedFields,identity=identities.get(s.sourceKey),alias=aliases.get(n?.['合并前SKU来源编号']);
   need(s.batchId===b.batchId&&s.entityType==='BARCODE'&&identity&&identity.normalizedHash===original.requestHash(n)&&alias&&alias.canonicalSourceKey===n['SKU来源编号']&&alias.oldSourceSkuKey===s.rawFields['SKU来源编号'],'APPROVED_BARCODE_ORIGINAL_BINDING');
   const sku={oldSourceSkuKey:alias.oldSourceSkuKey,canonicalSourceKey:alias.canonicalSourceKey,nativeId:alias.nativeId},scheme=schemes.resolveScheme(n['原条码方案']);
   const input={batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:structuredClone(sel),source:s,nativeBarcodeId:identity.nativeId,sku,scheme};
   const isDemotion=s.rawFields['条码性质']==='主码'&&n['条码性质']==='已确认旧码';
   if(isDemotion){need(typeof mainDemotions?.proofFor==='function','APPROVED_BARCODE_ORIGINAL_DEMOTION_PROOF');input.mainDemotion=await mainDemotions.proofFor(s,sku);active();}
   need(original.historySettlementRequestHash(s)===before&&original.requestHash(sku)===original.requestHash({oldSourceSkuKey:alias.oldSourceSkuKey,canonicalSourceKey:alias.canonicalSourceKey,nativeId:alias.nativeId}),'APPROVED_BARCODE_PROOF_MUTATED');
   const prepared=original.prepareNativeBarcode(input);schemes.verifyPreparedScheme(prepared);const preparedHash=original.historySettlementRequestHash(prepared);
   if(isDemotion){need(typeof mainDemotions.authorizeProof==='function','APPROVED_BARCODE_ORIGINAL_DEMOTION_PROOF');need(await mainDemotions.authorizeProof(prepared)===undefined,'APPROVED_BARCODE_DEMOTION_RESULT');active();}
   need(original.historySettlementRequestHash(source)===before&&original.historySettlementRequestHash(prepared)===preparedHash,'APPROVED_BARCODE_INPUT_MUTATED');
   const position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);need(!sourceKeys.has(s.sourceKey)&&!sourceIds.has(s.id)&&!rawCodes.has(n['条码'])&&!positions.has(position)&&rows<expectedRows,'APPROVED_BARCODE_DUPLICATE_SOURCE');
   const k=prepared.nativeBarcode;need(!k.enabled||k.barcode_kind!=='MAIN'||!mains.has(k.sku_id),'APPROVED_BARCODE_DUPLICATE_MAIN');
   sourceKeys.add(s.sourceKey);sourceIds.add(s.id);rawCodes.add(n['条码']);positions.add(position);if(k.enabled&&k.barcode_kind==='MAIN')mains.add(k.sku_id);
   rows++;if(isDemotion)demotions++;if(k.barcode_kind==='MAIN')main++;else compatible++;
   return prepared;
  },
  finish(){active();need(rows===expectedRows&&sourceKeys.size===identities.size&&demotions===expectedDemotions,'APPROVED_BARCODE_INCOMPLETE');finished=true;return{rows,main,compatible,approvedMainDemotions:demotions,nativeIDsReusedFromFrozenInput:true,newSchemeIDs:0,rawCodesRewritten:0,sourceOnly:true,executionAuthorized:false};},
  close(){closed=true;aliases.clear();identities.clear();canonical.clear();aliasIds.clear();allocated.clear();sourceKeys.clear();sourceIds.clear();rawCodes.clear();positions.clear();mains.clear();}};
}
