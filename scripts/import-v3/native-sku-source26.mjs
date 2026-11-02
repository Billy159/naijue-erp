/** Genuine source/reference reconstruction from C-adopted canonical SKU decisions.
 * Reuses original byte-offset rows, complete alias mappings and existing native
 * reference snapshots. No SQL, original full scan, source grant or UUID allocator. */
import {createHash} from 'node:crypto';import {constants} from 'node:fs';import {open,lstat} from 'node:fs/promises';import {resolve,dirname,isAbsolute,join} from 'node:path';
import {openReviewedMaterializedSource} from './verified-offset-source.mjs';import {openReviewedCatalogueSource26} from './native-source-authorizers.mjs';import {sourceEvidence} from './prepare-native-bindings.mjs';
import {parseV2Csv} from '../../packages/application/src/import-v2.ts';import {requestHash} from '../../packages/application/src/request-hash.ts';import {historySettlementRequestHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {prepareNativeSkuImport26,validatePreparedNativeSkuImport26,nativeSkuAliasEvidence26,NATIVE_SKU_IMPORT_VERSION_26} from '../../packages/application/src/native-sku-import.ts';import {historyClosureProjectionRow26} from '../../packages/application/src/history-typed-closure.ts';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});},hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),digest=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>['dev','ino','mode','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const mappingKeys=['oldSourceSkuId','canonicalSourceSkuId','isRepresentative','canonicalMemberCount','productSourceId','newSizeDictionaryId','newSizeGroupId','newSizeGroupName','newSizeCode','newSizeName','colorCodeIdentity','fitCode','canonicalState','oldSkuCode','oldState','sourceFile','sourceSheet','sourceRow','sourceSha256','mappingBasis'];
/** A blank stock fit can only yield a candidate when the exact original
 * product, color and size observations identify one canonical SKU and fit. */
export function resolveTPlusStockFitCandidates26({stockRows,skuFacts}){
 must(Array.isArray(stockRows)&&Array.isArray(skuFacts),'TPLUS_STOCK_FIT26_INPUT');
 const index=new Map(),key=(product,color,size)=>JSON.stringify([product,color,size]);
 for(const fact of skuFacts){
  must(fact&&['productCode','colorName','sourceSize','canonicalSkuId','sourceSkuId','fitCode','observedFitCode','evidenceRef'].every(k=>typeof fact[k]==='string'&&fact[k])
    &&fact.observedFitCode===fact.fitCode,'TPLUS_STOCK_FIT26_FACT');
  const k=key(fact.productCode,fact.colorName,fact.sourceSize),group=index.get(k)??[];group.push(fact);index.set(k,group);
 }
 return stockRows.map(row=>{
  must(row?.event==='row'&&Number.isSafeInteger(row.excelRow)&&row.dimensions&&Array.isArray(row.values),'TPLUS_STOCK_FIT26_ROW');
  const d=row.dimensions,fit=d.fit,blank=fit?.kind==='blank'&&fit.raw===null||fit?.kind==='text'&&fit.raw==='';
  return row.values.map(v=>{
   const base={excelRow:row.excelRow,column:v.column,sourceFit:structuredClone(fit),candidateFit:null,canonicalSkuId:null,sourceSkuIds:[],evidenceRefs:[],status:'UNKNOWN'};
   if(!blank)return {...base,status:'SOURCE_FIT_PRESENT'};
   if(d.productCode?.kind!=='text'||!d.productCode.raw||d.color?.kind!=='text'||!d.color.raw||typeof v.sourceSize!=='string'||!v.sourceSize)return base;
   const facts=index.get(key(d.productCode.raw,d.color.raw,v.sourceSize))??[],unique=new Map();
   for(const f of facts){const k=JSON.stringify([f.canonicalSkuId,f.fitCode]),g=unique.get(k)??new Set();g.add(f.sourceSkuId);unique.set(k,g);}
   if(unique.size!==1)return {...base,status:unique.size?'CONFLICT':'UNKNOWN'};
   const [[identity,sourceIds]]=unique,[canonicalSkuId,candidateFit]=JSON.parse(identity);
   return {...base,canonicalSkuId,candidateFit,sourceSkuIds:[...sourceIds].sort(),evidenceRefs:[...new Set(facts.map(f=>f.evidenceRef))].sort(),status:'EXACT_SKU_FIT_CANDIDATE'};
  });
 }).flat();
}
/** Construct fit candidates from pinned source observations and existing SKU
 * alias/snapshot evidence. A historically blank fit is never promoted. */
export async function prepareTPlusStockFitCandidates26({stockBytes,aliasBytes,snapshotBytes,pins}){
 for(const [key,b]of Object.entries({stock:stockBytes,aliases:aliasBytes,snapshots:snapshotBytes}))must(Buffer.isBuffer(b)&&digest(b)===pins?.[key],'TPLUS_STOCK_FIT26_PIN');
 const text=b=>new TextDecoder('utf8',{fatal:true}).decode(b),originals=new Map(),facts=[],stockRows=[];
 for(const line of text(snapshotBytes).split('\n')){if(!line)continue;const original=JSON.parse(line),id=original.data?.['原SKU来源编号'];
  must(typeof id==='string'&&id&&!originals.has(id),'TPLUS_STOCK_FIT26_ORIGINAL');originals.set(id,original);}
 let header;for await(const cells of parseV2Csv((async function*(){yield text(aliasBytes).replace(/^\uFEFF/,'');})())){
  if(!header){header=cells;must(mappingKeys.every(k=>header.includes(k)),'TPLUS_STOCK_FIT26_HEADER');continue;}
  must(cells.length===header.length,'TPLUS_STOCK_FIT26_ROW');const m=Object.fromEntries(header.map((k,i)=>[k,cells[i]]));
  if(!m.oldFitRaw||m.oldFitRaw!==m.fitCode)continue;
  const original=originals.get(m.oldSourceSkuId),d=original?.data;
  must(d&&d['原SKU来源编号']===m.oldSourceSkuId&&d['原颜色编码']===m.colorCodeIdentity&&d['旧尺码组']===m.oldSizeGroup
   &&d['旧尺码编码']===m.oldSizeCode&&d['旧尺码名称']===m.oldSizeName&&d['旧版型原值']===m.oldFitRaw
   &&typeof original.file==='string'&&typeof original.sheet==='string'&&Number.isSafeInteger(original.row)&&hash(original.sourceSha256),'TPLUS_STOCK_FIT26_ORIGINAL');
  facts.push({productCode:d['款号'],colorName:d['原颜色名称'],sourceSize:d['旧尺码名称'],canonicalSkuId:m.canonicalSourceSkuId,sourceSkuId:m.oldSourceSkuId,
   fitCode:m.fitCode,observedFitCode:m.oldFitRaw,evidenceRef:`${original.file}#${original.sheet}:${original.row}@${original.sourceSha256}`});
 }
 must(header,'TPLUS_STOCK_FIT26_HEADER');for(const line of text(stockBytes).split('\n')){if(!line)continue;const row=JSON.parse(line);if(row.event==='row')stockRows.push(row);}
 const rows=resolveTPlusStockFitCandidates26({stockRows,skuFacts:facts}),counts={};for(const row of rows)counts[row.status]=(counts[row.status]??0)+1;
 return {version:'TPLUS_STOCK_FIT_SOURCE_CANDIDATES_V1',scope:'OBSERVED_FIT_ONLY_NO_BLANK_TO_A_NO_IMPORT',inputPins:structuredClone(pins),
  explicitObservedSkuFacts:facts.length,counts,rows,importAuthorized:false};
}
async function regular(path){must(typeof path==='string'&&isAbsolute(path),'SKU_SOURCE26_PATH');let p=resolve(path),first=true;for(;;){const s=await lstat(p);must(!s.isSymbolicLink()&&(first?s.isFile():s.isDirectory()),'SKU_SOURCE26_REGULAR');first=false;const parent=dirname(p);if(parent===p)return;p=parent;}}
const order=(a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key));
export async function openReviewedSkuSource26(options){
 must(exact(options,['reviewFile','trustedReviewSha256','binding','authorizedPayloadHash','baseDirectory','productSnapshotFile','catalogue']),'SKU_SOURCE26_OPTIONS');const o={...options};
 must(hash(o.trustedReviewSha256),'SKU_SOURCE26_OUTSIDE_PIN');historySettlementRequestHash(o.binding);const binding=structuredClone(o.binding);
 must(exact(binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&hash(binding.selectionSha256)&&(o.authorizedPayloadHash===null||hash(o.authorizedPayloadHash))
  &&typeof o.baseDirectory==='string'&&isAbsolute(o.baseDirectory)&&typeof o.productSnapshotFile==='string'&&isAbsolute(o.productSnapshotFile),'SKU_SOURCE26_BINDING');
 must(exact(o.catalogue,['mappingFile','trustedMappingSha256','reviewApprovalFile','trustedReviewApprovalSha256']),'SKU_SOURCE26_CATALOGUE_OPTIONS');const catalogueOptions={...o.catalogue};
 const files=[],decisions=new Map(),originals=new Map(),canonical=new Map(),aliases=new Map(),products=new Map(),dictionary=new Map(),members=new Set();let originalSource,catalogueSource,closed=false;
 const active=()=>must(!closed,'SKU_SOURCE26_CLOSED');
 async function close(){closed=true;if(catalogueSource)await catalogueSource.close();if(originalSource)await originalSource.close();for(const f of files)try{await f.fd.close();}catch{}files.length=0;for(const map of [decisions,originals,canonical,aliases,products,dictionary])map.clear();members.clear();}
 async function bytes(path,pin,expected,max){must(hash(pin),'SKU_SOURCE26_OUTSIDE_PIN');await regular(path);const s=await lstat(path);must(s.size>0&&s.size<=max&&(expected===null||s.size===expected),'SKU_SOURCE26_FILE_BOUND');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),f={path,stat:s,fd};files.push(f);const b=await fd.readFile();must(b.length===s.size&&digest(b)===pin&&same(s,await fd.stat())&&same(s,await lstat(path)),'SKU_SOURCE26_FILE_CHANGED');return b;}
 const json=async(path,pin,expected,max)=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bytes(path,pin,expected,max)));
 async function verify(){active();for(const f of files){await regular(f.path);must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'SKU_SOURCE26_FILE_CHANGED');}if(originalSource)await originalSource.verify();active();}
 const bound=v=>exact(v,Object.keys(binding))&&Object.keys(binding).every(k=>v[k]===binding[k]);
 async function csv(path,pin,expected){const text=new TextDecoder('utf8',{fatal:true}).decode(await bytes(path,pin,expected,16777216));let header;const out=[];for await(const cells of parseV2Csv((async function*(){yield text;})())){if(!header){header=cells;must(new Set(header).size===header.length,'SKU_SOURCE26_CSV_HEADER');continue;}must(cells.length===header.length,'SKU_SOURCE26_CSV_WIDTH');out.push(Object.fromEntries(header.map((h,i)=>[h,cells[i]])));}return out;}
 try{
  const a=await json(o.reviewFile,o.trustedReviewSha256,null,4194304);
  must(exact(a,['version','decision','binding','manifest','decisions','scope','independentReview','realImportExecutionAuthorized'])&&a.version==='C_NATIVE_SKU26_REFERENCE_REVIEW_V1'
   &&a.decision==='ACCEPT_EXACT_PREPARED_SKU26_REFERENCE_BINDINGS'&&bound(a.binding)&&a.scope==='SKU_REFERENCE_DECISIONS_ONLY'&&a.realImportExecutionAuthorized===false,'SKU_SOURCE26_REVIEW');
  must(exact(a.manifest,['path','sha256','bytes','rows','oldAliases'])&&exact(a.decisions,['path','sha256','bytes','rows'])&&exact(a.independentReview,['path','sha256','result'])
   &&a.independentReview.result==='PASS'&&Number.isSafeInteger(a.manifest.rows)&&a.manifest.rows>0&&a.manifest.rows<=50000&&a.decisions.rows===a.manifest.rows
   &&Number.isSafeInteger(a.manifest.oldAliases)&&a.manifest.oldAliases>=a.manifest.rows&&a.manifest.oldAliases<=100000,'SKU_SOURCE26_REVIEW_COMPONENT');
  const qb=await json(a.independentReview.path,a.independentReview.sha256,null,4194304);must(qb?.result==='PASS','SKU_SOURCE26_QB_RESULT');
  const m=await json(a.manifest.path,a.manifest.sha256,a.manifest.bytes,4194304);
  must(m.version==='NATIVE_SKU26_SOURCE_REFERENCE_CANDIDATE_V1'&&Object.keys(binding).every(k=>m[k]===binding[k])&&m.rows===a.manifest.rows&&m.oldAliases===a.manifest.oldAliases
   &&m.artifact?.path===a.decisions.path&&m.artifact.bytes===a.decisions.bytes&&m.artifact.sha256===a.decisions.sha256&&m.artifact.rows===a.decisions.rows
   &&m.nativeReferenceApproved===false&&m.importAuthorized===false&&hash(m.allPreparedSha256),'SKU_SOURCE26_MANIFEST');
  const raw=await bytes(a.decisions.path,a.decisions.sha256,a.decisions.bytes,134217728);let start=0,decisionAliases=0;const nativeIds=new Set(),recordIds=new Set(),oldKeys=new Set();
  while(start<raw.length){const end=raw.indexOf(10,start);must(end>start&&end-start<=4194304,'SKU_SOURCE26_DECISION_LINE');const d=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw.subarray(start,end)));start=end+1;
   must(exact(d,['canonicalSourceKey','nativeSkuId','canonicalSourceEvidenceHash','canonicalCsvRowHash','allocationNormalizedHash','references','aliases','importRecord','nativeSku','preparedFingerprint'])
    &&typeof d.canonicalSourceKey==='string'&&!decisions.has(d.canonicalSourceKey)&&!nativeIds.has(d.nativeSkuId)&&exact(d.references,['product','color','fit','size','sizeGroup'])
    &&Object.values(d.references).every(r=>exact(r,['sourceKey','nativeId','nativeSnapshotHash'])&&hash(r.nativeSnapshotHash))&&Array.isArray(d.aliases)&&d.aliases.length>0&&d.aliases.length<=200
    &&exact(d.importRecord,['id','reviewedAt','decisionReason'])&&!recordIds.has(d.importRecord.id)&&[d.canonicalSourceEvidenceHash,d.canonicalCsvRowHash,d.allocationNormalizedHash,d.preparedFingerprint].every(hash),'SKU_SOURCE26_DECISION');
   for(const alias of d.aliases){must(exact(alias,['sourceKey','sourceEvidenceHash','rawLineSha256','completeAliasCsvRowHash','consumedMappingHash'])&&typeof alias.sourceKey==='string'&&!oldKeys.has(alias.sourceKey)
     &&[alias.sourceEvidenceHash,alias.rawLineSha256,alias.completeAliasCsvRowHash,alias.consumedMappingHash].every(hash),'SKU_SOURCE26_ALIAS_DECISION');oldKeys.add(alias.sourceKey);decisionAliases++;}
   decisions.set(d.canonicalSourceKey,d);nativeIds.add(d.nativeSkuId);recordIds.add(d.importRecord.id);
  }
  must(decisions.size===m.rows&&decisionAliases===m.oldAliases,'SKU_SOURCE26_COVERAGE');
  const sourceReview=await json(m.outsideSourceReview.path,m.outsideSourceReview.sha256,null,4194304);must(sourceReview.indexManifest?.sha256===m.sourceIndexManifestSha256,'SKU_SOURCE26_ORIGINAL_INDEX');
  originalSource=await openReviewedMaterializedSource({indexManifestFile:sourceReview.indexManifest.path,trustedIndexManifestSha256:m.sourceIndexManifestSha256,
   reviewFile:m.outsideSourceReview.path,trustedReviewSha256:m.outsideSourceReview.sha256,binding,entities:['SKU']});
  must(originalSource.report.rows===m.oldAliases,'SKU_SOURCE26_ORIGINAL_COVERAGE');
  for await(const chunk of originalSource.chunks('SKU',100))for(const row of chunk){must(oldKeys.has(row.raw.sourceId)&&!originals.has(row.raw.sourceId),'SKU_SOURCE26_ORIGINAL_IDENTITY');originals.set(row.raw.sourceId,row);}
  must(originals.size===m.oldAliases,'SKU_SOURCE26_ORIGINAL_COVERAGE');
  const base=await json(join(o.baseDirectory,'manifest.json'),m.selection.baseManifestSha256,null,4194304);
  must(Array.isArray(base.payloadFiles)&&m.selection.source==='BASE_V2'&&m.selection.entity==='SKU'&&m.selection.path==='business/02合法SKU.csv'&&m.selection.selectionSha256===binding.selectionSha256,'SKU_SOURCE26_SELECTION');
  const sf=base.payloadFiles.filter(f=>f.file===m.selection.path),af=base.payloadFiles.filter(f=>f.file==='mappings/old-to-canonical-sku-15121.csv');
  must(sf.length===1&&af.length===1&&sf[0].sha256===m.selection.csvSha256&&af[0].sha256===m.selection.aliasCsvSha256,'SKU_SOURCE26_SELECTION');
  const canonicalRows=await csv(join(o.baseDirectory,sf[0].file),sf[0].sha256,sf[0].bytes),aliasRows=await csv(join(o.baseDirectory,af[0].file),af[0].sha256,af[0].bytes);
  must(canonicalRows.length===m.rows&&aliasRows.length===m.oldAliases,'SKU_SOURCE26_COVERAGE');
  for(const n of canonicalRows){must(decisions.has(n.来源编号)&&!canonical.has(n.来源编号),'SKU_SOURCE26_CANONICAL_IDENTITY');canonical.set(n.来源编号,n);}
  const aliasKeys=new Set();for(const row of aliasRows){must(canonical.has(row.canonicalSourceSkuId)&&oldKeys.has(row.oldSourceSkuId)&&!aliasKeys.has(row.oldSourceSkuId)&&mappingKeys.every(k=>Object.hasOwn(row,k)),'SKU_SOURCE26_ALIAS_MAPPING');aliasKeys.add(row.oldSourceSkuId);const group=aliases.get(row.canonicalSourceSkuId)??[];group.push(row);aliases.set(row.canonicalSourceSkuId,group);}
  must(aliases.size===m.rows&&aliasKeys.size===m.oldAliases,'SKU_SOURCE26_COVERAGE');
  const snapshots=await json(o.productSnapshotFile,m.productSnapshotSha256,null,33554432);must(Array.isArray(snapshots.rows),'SKU_SOURCE26_PRODUCT_FACTS');
  for(const row of snapshots.rows){must(typeof row.sourceKey==='string'&&!products.has(row.sourceKey)&&row.native?.id,'SKU_SOURCE26_PRODUCT_FACTS');products.set(row.sourceKey,{sourceKey:row.sourceKey,nativeId:row.native.id,nativeSnapshot:row.native});}
  must(catalogueOptions.trustedMappingSha256===m.catalogueMappingSha256&&catalogueOptions.trustedReviewApprovalSha256===m.catalogueReviewSha256,'SKU_SOURCE26_CATALOGUE_BINDING');
  // Retain own file lifetime pins after the already reviewed catalogue module
  // verifies/constructs its immutable facts; do not rehash its whole344 map perSKU.
  await bytes(catalogueOptions.mappingFile,m.catalogueMappingSha256,null,16777216);await bytes(catalogueOptions.reviewApprovalFile,m.catalogueReviewSha256,null,4194304);
  catalogueSource=await openReviewedCatalogueSource26({...catalogueOptions,binding});
  for await(const chunk of catalogueSource.chunks()){await catalogueSource.authorize(chunk);for(const row of chunk.rows){if(row.entity==='SIZE_GROUP_MEMBER')members.add(row.nativeSnapshot.size_group_id+'\0'+row.nativeSnapshot.size_id);if(['COLOR','FIT','SIZE','SIZE_GROUP'].includes(row.entity)){const key=row.entity+'\0'+row.source.sourceKey;must(!dictionary.has(key),'SKU_SOURCE26_DICTIONARY_FACTS');dictionary.set(key,{sourceKey:row.source.sourceKey,nativeId:row.nativeSnapshot.id,nativeSnapshot:row.nativeSnapshot});}}}
  await catalogueSource.close();catalogueSource=undefined;
  const reference=(kind,key)=>{const result=kind==='PRODUCT'?products.get(key):dictionary.get(kind+'\0'+key);must(result,'SKU_SOURCE26_REFERENCE');return result;};
  function prepared(key){const n=canonical.get(key),d=decisions.get(key),group=aliases.get(key);must(n&&d&&group&&group.length===d.aliases.length&&group.length===Number(n.合并来源SKU数)
    &&requestHash(n)===d.canonicalCsvRowHash&&d.allocationNormalizedHash===d.canonicalCsvRowHash,'SKU_SOURCE26_CANONICAL_CHANGED');const representative=group.filter(g=>g.isRepresentative==='true');must(representative.length===1&&representative[0].oldSourceSkuId===key,'SKU_SOURCE26_REPRESENTATIVE');
   const orig=originals.get(key);must(orig,'SKU_SOURCE26_REPRESENTATIVE');const source=sourceEvidence(orig.raw,orig.rawLine,n,binding);
   for(const [field,value]of Object.entries(source.rawFields))if(Object.hasOwn(n,field)&&n[field]!==value)source.fieldProvenance.fields[field]={origin:'MIGRATION_DERIVED',reason:'EXACT_ACCEPTED_CANONICAL_SKU_VALUE_PRESERVING_ORIGINAL_CELL',raw:value,evidence_ref:af[0].file+'@'+af[0].sha256};
   must(requestHash(source)===d.canonicalSourceEvidenceHash,'SKU_SOURCE26_ORIGINAL_CHANGED');
   const old=group.map((mapping,i)=>{const original=originals.get(mapping.oldSourceSkuId),decision=d.aliases[i];must(original&&decision.sourceKey===mapping.oldSourceSkuId&&original.index.sha256===decision.rawLineSha256
     &&requestHash(mapping)===decision.completeAliasCsvRowHash,'SKU_SOURCE26_ALIAS_CHANGED');const alias={source:mapping.isRepresentative==='true'?source:sourceEvidence(original.raw,original.rawLine,original.raw.data,binding),mapping:Object.fromEntries(mappingKeys.map(k=>[k,mapping[k]]))};
    must(requestHash(alias.source)===decision.sourceEvidenceHash&&requestHash(alias.mapping)===decision.consumedMappingHash,'SKU_SOURCE26_ALIAS_CHANGED');return alias;});
   const references={product:reference('PRODUCT',n.商品来源编号),color:reference('COLOR',n.颜色编码),fit:reference('FIT',n.版型编码),size:reference('SIZE',n.新尺码字典ID),sizeGroup:reference('SIZE_GROUP',n.新尺码组ID)};
   must(members.has(references.sizeGroup.nativeId+'\0'+references.size.nativeId),'SKU_SOURCE26_SIZE_MEMBERSHIP');
   for(const [kind,r]of Object.entries(references)){const expected=d.references[kind];must(expected.sourceKey===r.sourceKey&&expected.nativeId===r.nativeId&&expected.nativeSnapshotHash===requestHash(r.nativeSnapshot),'SKU_SOURCE26_REFERENCE_CHANGED');}
   const result=prepareNativeSkuImport26({schemaProfile:'EXACT26',validatorVersion:NATIVE_SKU_IMPORT_VERSION_26,batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:m.selection,
    canonicalSource:source,nativeSkuId:d.nativeSkuId,references,aliases:old,importRecord:d.importRecord});validatePreparedNativeSkuImport26(result);
   must(result.fingerprint===d.preparedFingerprint&&requestHash(result.nativeSku)===requestHash(d.nativeSku),'SKU_SOURCE26_PREPARED_CHANGED');return result;
  }
  const all=createHash('sha256');let groups=0,collisionGroups=0,collisionMembers=0;const positions=new Set(),ids=new Set();
  for(const key of canonical.keys()){const row=prepared(key);all.update(requestHash(row)+'\n');groups++;if(row.aliases.length>1){collisionGroups++;collisionMembers+=row.aliases.length;}for(const alias of row.aliases){const s=alias.source,p=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);must(!positions.has(p)&&!ids.has(s.id),'SKU_SOURCE26_DUPLICATE_ORIGINAL');positions.add(p);ids.add(s.id);}}
  must(groups===m.rows&&positions.size===m.oldAliases&&all.digest('hex')===m.allPreparedSha256&&collisionGroups===m.collisionGroups&&collisionMembers===m.collisionMembers,'SKU_SOURCE26_FULL_FOLD');await verify();
  return {report:Object.freeze({kind:'REVIEWED_SKU26_ORIGINAL_SOURCE_REFERENCE_ONLY_V1',rows:m.rows,oldAliases:m.oldAliases,collisionGroups,collisionMembers,referenceDecisionsAuthorized:true,executionAuthorized:false,newNativeUUIDs:0,noSql:true}),verify,
   async *rows(){await verify();for(const key of canonical.keys()){active();yield prepared(key);}await verify();},
   async authorize(input){active();const before=historySettlementRequestHash(input),row=structuredClone(input);validatePreparedNativeSkuImport26(row);await verify();const d=decisions.get(row.canonicalSource.sourceKey);must(d&&row.fingerprint===d.preparedFingerprint,'SKU_SOURCE26_NOT_AUTHORIZED');must(historySettlementRequestHash(input)===before,'SKU_SOURCE26_INPUT_CHANGED');},
   async openClosure(scope,context){await verify();historySettlementRequestHash(scope);must(context?.group==='SKUS'&&!context.signal?.aborted&&scope.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace
     &&scope.selectionSha256===binding.selectionSha256&&hash(o.authorizedPayloadHash)&&scope.authorizedPayloadHash===o.authorizedPayloadHash,'SKU_SOURCE26_CLOSURE_SCOPE');let sessionClosed=false;const current=()=>{active();must(!sessionClosed&&!context.signal?.aborted,'SKU_SOURCE26_CLOSED');};
    const sourceRows=[],typedRows=[];for(const key of canonical.keys()){current();const row=prepared(key);typedRows.push(historyClosureProjectionRow26('sku',row.nativeSku));for(const alias of row.aliases){const s=alias.source;sourceRows.push(historyClosureProjectionRow26('import_source_row',nativeSkuAliasEvidence26(row,alias)));typedRows.push(historyClosureProjectionRow26('import_sku_alias',{batch_id:row.batchId,old_source_sku_id:s.sourceKey,canonical_sku_id:row.nativeSku.id,source_row_id:s.id,canonical_source_key:key,mapping_basis:alias.mapping.mappingBasis}));}}sourceRows.sort(order);typedRows.sort(order);
    return {async verify(){current();await verify();current();},async *sourceRows(){for(const row of sourceRows){current();yield structuredClone(row);}},async *typedRows(){for(const row of typedRows){current();yield structuredClone(row);}},async *documents(){current();},async close(){sessionClosed=true;sourceRows.length=0;typedRows.length=0;}};
   },close};
 }catch(error){await close();throw error;}
}
