// Private implementation shared only by the two independently scoped payment readers.
// Full sealed preflight + original JSONL evidence; no SQL, bindings, staging or publish.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,mkdtemp,chmod,open,rm,readFile} from 'node:fs/promises';
import {resolve,join,dirname,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflightV2} from './run.mjs';
import {openReviewedMaterializedSource} from '../import-v3/verified-offset-source.mjs';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {v2MoneyApprovalSet,v2ApprovedCents,v2Cents} from '../../packages/application/src/import-v2.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';

const fail=code=>{throw Error('PAYMENT_SOURCE_'+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0');
const MONEY='provenance/approved-money-tail-overlay.csv';
const MONEY_COLUMNS=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
const MAX_SPOOL=512*1024*1024,MAX_INDEX=256*1024*1024;
const within=(path,root)=>path===root||path.startsWith(root+'/');
async function safeAncestors(input){
 if(typeof input!=='string'||!input||input.includes('\0'))fail('PATH');
 const path=resolve(input),parts=path.slice(parse(path).root.length).split('/');let current=parse(path).root;
 for(const part of parts){
  current=join(current,part);const stat=await lstat(current);if(stat.isSymbolicLink())fail('SYMLINK');
  if(part==='.git')fail('GIT_ANCESTOR');
  if(stat.isDirectory())try{await lstat(join(current,'.git'));fail('GIT_ANCESTOR');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 if(await realpath(path)!==path)fail('SYMLINK');return path;
}
function capturedOptions(options,mode){
 const required=['base','v3Amendment','v3Approval','trustedApprovalSha256','approvedMoneyOverlaySha256','spoolParent','batchId','fixedSourceNamespace'];
 if(!options||Object.getPrototypeOf(options)!==Object.prototype)fail('OPTIONS');
 const result={};
 for(const key of Reflect.ownKeys(options)){
  const d=Object.getOwnPropertyDescriptor(options,key);
  if(typeof key!=='string'||![...required,'resolveNativeBinding','maxSpoolBytes',...(mode==='SETTLEMENT'?['materializedSource']:[])].includes(key)||!d.enumerable||!('value'in d))fail('OPTIONS');result[key]=d.value;
 }
 if(required.some(k=>!Object.hasOwn(result,k)))fail('PINS_REQUIRED');
 if(!hash(result.trustedApprovalSha256)||!hash(result.approvedMoneyOverlaySha256))fail('PINS_REQUIRED');
 if(!uuid(result.batchId)||typeof result.fixedSourceNamespace!=='string'||!/^[a-z][a-z0-9_.:-]{0,127}$/.test(result.fixedSourceNamespace))fail('BATCH');
 if(Object.hasOwn(result,'resolveNativeBinding')&&typeof result.resolveNativeBinding!=='function')fail('RESOLVER_REQUIRED');
 if(Object.hasOwn(result,'maxSpoolBytes')&&(!Number.isSafeInteger(result.maxSpoolBytes)||result.maxSpoolBytes<=0||result.maxSpoolBytes>MAX_SPOOL))fail('SPOOL_BOUND');
 result.maxSpoolBytes??=MAX_SPOOL;
 return Object.freeze(result);
}
async function* lines(chunks){
 let pending='',rows=0;
 for await(const chunk of chunks){let at=0;for(;;){const i=chunk.indexOf('\n',at),part=chunk.slice(at,i<0?undefined:i);if(pending.length+part.length>4*1024*1024)fail('LINE_LIMIT');pending+=part;
  if(i<0)break;if(!pending||++rows>1_000_000)fail('LINE_COUNT');yield pending;pending='';at=i+1;}}
 if(pending){if(++rows>1_000_000)fail('LINE_COUNT');yield pending;}
}
async function pinnedApproval(path,pin){
 await safeAncestors(path);const stat=await lstat(path);
 if(!stat.isFile()||stat.size>4*1024*1024)fail('APPROVAL_PIN');const bytes=await readFile(path);
 if(sha(bytes)!==pin)fail('APPROVAL_PIN');return bytes;
}
export async function openSealedPaymentSource(options,mode){
 const config=capturedOptions(options,mode),entities=mode==='PAYMENT'?['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL']:mode==='SETTLEMENT'?['SETTLEMENT']:fail('MODE');
 const approval=await safeAncestors(config.v3Approval),base=await safeAncestors(config.base),amendment=await safeAncestors(config.v3Amendment),parent=await safeAncestors(config.spoolParent);
 await pinnedApproval(approval,config.trustedApprovalSha256);
 if(within(approval,base)||within(approval,amendment))fail('EXTERNAL_APPROVAL_REQUIRED');
 const repo=await realpath(fileURLToPath(new URL('../../',import.meta.url))),parentStat=await lstat(parent);
 if(!parentStat.isDirectory()||(parentStat.mode&0o077)!==0||[base,amendment,repo].some(r=>within(parent,r)))fail('PRIVATE_SPOOL_OUTSIDE_INPUT_REPO');
 const directory=await mkdtemp(join(parent,'payment-source-'));await chmod(directory,0o700);const directoryStat=await lstat(directory),path=join(directory,'selected.jsonl');
 const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
 let output,materialized,materializedReport,closed=false,spoolBytes=0,spoolRows=0,spoolSha256,spoolStat,rawRows=0,preflight=null,approvedSet;
 const selections=new Map(),sourceHashes=new Map(),counts=Object.fromEntries(entities.map(e=>[e,0]));
 const assertOpen=()=>{if(closed)fail('CLOSED');};
 const close=async()=>{
  if(closed)return;closed=true;sourceHashes.clear();selections.clear();
  if(materialized){await materialized.close();materialized=undefined;}
  if(output){const h=output;output=undefined;await h.close();}
  let stat;try{stat=await lstat(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(!same(stat,directoryStat)||stat.isSymbolicLink())fail('SPOOL_CHANGED');await rm(directory,{recursive:true,force:false});
 };
 try{
  output=await open(path,'wx',0o600);const digest=createHash('sha256');
  const collect=async({records,rawLines,manifest,verified})=>{
   const normalized=new Map(),positions=new Set();let indexBytes=0;
   const index=s=>{indexBytes+=Buffer.byteLength(s);if(indexBytes>MAX_INDEX)fail('INDEX_LIMIT');};
   const key=(entity,sourceKey)=>JSON.stringify([entity,sourceKey]);
   for(const entity of entities){
    const table=IMPORT_V2_TABLES.find(t=>t.entity===entity),selected=verified.selection.importFiles.find(f=>f.entity===entity);
    if(selected?.source!=='BASE_V2'||selected.path!==table.file||!hash(selected.sha256))fail('SELECTION');
    selections.set(entity,{entity,source:'BASE_V2',path:table.file,baseManifestSha256:verified.selection.baseManifestSha256,selectionSha256:verified.selectionSha256,approvalSha256:config.trustedApprovalSha256,csvSha256:selected.sha256,...(mode==='SETTLEMENT'?{moneyApprovalSha256:config.approvedMoneyOverlaySha256}:{})});
    let count=0;
    for await(const row of records(table.file,table.columns.map(c=>c.name))){
     const sourceKey=entity==='PAYMENT_ACCOUNT_HALL'?JSON.stringify([row.账户来源编号,row.厅来源编号]):row.来源编号,k=key(entity,sourceKey),packed=JSON.stringify(row);
     if(!text(sourceKey)||normalized.has(k))fail('DUPLICATE_NORMALIZED');index(k+packed);normalized.set(k,packed);count++;
    }
    if(count!==selected.count)fail('SELECTED_COUNT');
   }
   const approvals=[];for await(const row of records(MONEY,MONEY_COLUMNS))approvals.push({fileSha256:row.sourceFileSha256,sheet:row.sheet,row:row.row,sourceId:row.sourceId,field:row.field,rawValue:row.rawValue,exactCentValue:row.candidateExactCentValue});
   approvedSet=v2MoneyApprovalSet(approvals,approvals);
   let buffer='';const flush=async()=>{if(!buffer)return;const bytes=Buffer.from(buffer);spoolBytes+=bytes.length;if(spoolBytes>config.maxSpoolBytes)fail('SPOOL_LIMIT');digest.update(bytes);await output.writeFile(bytes);buffer='';};
   for await(const line of rawLines){
    rawRows++;const raw=JSON.parse(line);if(!entities.includes(raw?.entity))continue;
    const table=IMPORT_V2_TABLES.find(t=>t.entity===raw.entity),data=raw.data;
    if(!text(raw.file)||!text(raw.sheet)||!Number.isSafeInteger(raw.row)||raw.row<1||!hash(raw.sourceSha256)||!Object.hasOwn(manifest.sourceInputSha256??{},raw.file)||manifest.sourceInputSha256[raw.file]!==raw.sourceSha256||!data||typeof data!=='object'||Array.isArray(data))fail('SOURCE_PROVENANCE');
    const relation=raw.entity==='PAYMENT_ACCOUNT_HALL',sourceKey=relation?JSON.stringify([data.账户来源编号,data.厅来源编号]):raw.sourceId;
    // The original two-column recommendation has no source-id cell. Its generic
    // JSONL envelope may retain an empty placeholder; a nonempty id must still
    // equal the explicit original pair. Never add a fabricated raw source cell.
    if(!text(sourceKey)||(!relation&&data.来源编号!==sourceKey)||(relation&&Object.hasOwn(raw,'sourceId')&&raw.sourceId!==''&&raw.sourceId!==sourceKey))fail('SOURCE_PROVENANCE');
    const k=key(raw.entity,sourceKey),packed=normalized.get(k);if(packed===undefined)fail('MISSING_DUPLICATE_SOURCE');normalized.delete(k);const canonical=JSON.parse(packed);
    const optional='原收款方式来源编号';
    // The reviewed normalized template contains its optional ninth column. When
    // the original snapshot lacks it and that normalized value is empty, retain
    // the original absence in both projections rather than fabricate a source cell.
    if(raw.entity==='SETTLEMENT'&&!Object.hasOwn(data,optional)){if(canonical[optional]!=='')fail('NONMONEY_REWRITE');delete canonical[optional];}
    const columns=table.columns.filter(c=>c.name!==optional||Object.hasOwn(data,optional));
    if(Object.keys(data).length!==columns.length||Object.keys(canonical).length!==columns.length||columns.some(c=>!Object.hasOwn(data,c.name)||typeof data[c.name]!=='string'||typeof canonical[c.name]!=='string'||data[c.name].length>65536||data[c.name].includes('\0')||c.logicalType!=='MONEY'&&data[c.name]!==canonical[c.name]))fail('NONMONEY_REWRITE');
    if(materializedReport)for(const {name:field}of columns.filter(c=>c.logicalType==='MONEY')){
     if(data[field]!==canonical[field])v2ApprovedCents({fileSha256:raw.sourceSha256,sheet:raw.sheet,row:String(raw.row),sourceId:raw.sourceId,field,rawValue:data[field],exactCentValue:canonical[field]},approvedSet);
     else if(data[field]!=='')v2Cents(data[field]);
    }
    const position=JSON.stringify([raw.sourceSha256,raw.sheet,raw.row]);if(positions.has(position))fail('DUPLICATE_POSITION');positions.add(position);
    const fields=Object.fromEntries(Object.entries(data).map(([field,value])=>[field,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value}]));
    const source={id:stableImportId('source-row',config.fixedSourceNamespace,raw.entity,sourceKey),batchId:config.batchId,entityType:raw.entity,sourceKey,fileRef:raw.file,sheet:raw.sheet,rowNo:String(raw.row),sourceFileSha256:raw.sourceSha256,rowSha256:sha(Buffer.from(line,'utf8')),rawFields:data,normalizedFields:canonical,fieldProvenance:{schema_version:1,fields}};
    const record={source,selection:selections.get(raw.entity)};index(k+position+'x'.repeat(64));sourceHashes.set(k,requestHash(record));buffer+=JSON.stringify(record)+'\n';spoolRows++;counts[raw.entity]++;if(buffer.length>=65536)await flush();
   }
   if(normalized.size||entities.some(e=>counts[e]!==verified.selection.importFiles.find(f=>f.entity===e).count))fail('SOURCE_COVERAGE');await flush();
  };
  if(config.materializedSource!==undefined){
   materialized=await openReviewedMaterializedSource(config.materializedSource);materializedReport=materialized.report;
   const decision=JSON.parse(await pinnedApproval(approval,config.trustedApprovalSha256)),b=materializedReport.binding,selectionPath=join(amendment,'effective-import-selection.json');await safeAncestors(selectionPath);const s=await lstat(selectionPath);
   if(!s.isFile()||s.size>4*1024*1024)fail('SELECTION');
   const bytes=await readFile(selectionPath),effective=JSON.parse(bytes),selected=effective.importFiles?.find(f=>f.entity==='SETTLEMENT'),manifest=materialized.manifest;
   if(base!==materializedReport.baseDirectory||b.batchId!==config.batchId||b.fixedSourceNamespace!==config.fixedSourceNamespace||materializedReport.entities.length!==1||materializedReport.entities[0]!=='SETTLEMENT'
    ||sha(bytes)!==b.selectionSha256||decision.selectionSha256!==b.selectionSha256||effective.baseManifestSha256!==materializedReport.baseManifestSha256||decision.baseManifestSha256!==materializedReport.baseManifestSha256
    ||selected?.count!==materializedReport.rows||selected.sha256!==manifest.payloadFiles.find(f=>f.file===selected.path)?.sha256||manifest.payloadFiles.find(f=>f.file===MONEY)?.sha256!==config.approvedMoneyOverlaySha256)fail('SELECTION');
   async function* rawLines(){for await(const chunk of materialized.chunks('SETTLEMENT'))for(const row of chunk)yield row.rawLine;}
   await collect({records:materialized.records,rawLines:rawLines(),manifest,verified:{selection:effective,selectionSha256:b.selectionSha256}});
   await materialized.verify();await materialized.close();materialized=undefined;
  }else preflight=await preflightV2(base,{v3Amendment:amendment,v3Approval:approval,approvedMoneyOverlaySha256:config.approvedMoneyOverlaySha256,onVerifiedV3:async({records,strings,manifest,verified,report})=>{
   if(verified.approvalSha256!==config.trustedApprovalSha256||!report.wireRequiredFieldsValid||!report.referenceTargetsValid||report.originalSourceMoneyVerification?.approvedCellsMatched!==32)fail('PREFLIGHT');
   await collect({records,rawLines:lines(strings('snapshots/all-business-source-rows.jsonl')),manifest,verified});
  }});
  await pinnedApproval(approval,config.trustedApprovalSha256);await output.sync();spoolStat=await output.stat();await output.close();output=undefined;spoolSha256=digest.digest('hex');
 }catch(error){await close();throw error;}
 const handle=async()=>{
  assertOpen();await safeAncestors(path);const dir=await lstat(directory);
  if(!same(dir,directoryStat)||(dir.mode&0o777)!==0o700)fail('SPOOL_CHANGED');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const stat=await fd.stat();if(!stat.isFile()||!same(stat,spoolStat)||stat.size!==spoolBytes||(stat.mode&0o777)!==0o600)fail('SPOOL_CHANGED');
   const digest=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
   for(;;){const {bytesRead}=await fd.read(buffer,0,buffer.length,position);if(!bytesRead)break;position+=bytesRead;if(position>spoolBytes)fail('SPOOL_CHANGED');digest.update(buffer.subarray(0,bytesRead));}
   if(position!==spoolBytes||digest.digest('hex')!==spoolSha256)fail('SPOOL_CHANGED');assertOpen();return fd;
  }catch(error){await fd.close();throw error;}
 };
 const verify=async()=>{assertOpen();await pinnedApproval(approval,config.trustedApprovalSha256);const fd=await handle();await fd.close();assertOpen();};
 const check=record=>{assertOpen();const source=record.source;if(sourceHashes.get(JSON.stringify([source?.entityType,source?.sourceKey]))!==requestHash(record))fail('SOURCE_NOT_AUTHORIZED');};
 async function* spoolText(fd){
  const decoder=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}),buffer=Buffer.alloc(65536),digest=createHash('sha256');let position=0;
  for(;;){const {bytesRead}=await fd.read(buffer,0,buffer.length,position);if(!bytesRead)break;position+=bytesRead;if(position>spoolBytes)fail('SPOOL_CHANGED');digest.update(buffer.subarray(0,bytesRead));yield decoder.decode(buffer.subarray(0,bytesRead),{stream:true});}yield decoder.decode();
  if(position!==spoolBytes||digest.digest('hex')!==spoolSha256)fail('SPOOL_CHANGED');
 }
 return {config,assertOpen,verify,check,selection:entity=>structuredClone(selections.get(entity)),moneyApprovals:()=>structuredClone(approvedSet),close,
  report:{kind:mode==='PAYMENT'?'NATIVE_PAYMENT_SOURCE_READER':'HISTORY_SETTLEMENT_SOURCE_READER',importReady:false,noSql:true,preflight,...(materializedReport?{materializedSource:materializedReport}:{}),rawRowsScanned:rawRows,selectedRows:spoolRows,counts:{...counts},spoolBytes,spoolSha256,rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',originalWorkbooksReparsed:false,nativeBindingsVerified:false},
  async *rows(entity){
   assertOpen();if(entity!==undefined&&!entities.includes(entity))fail('ENTITY_NOT_SUPPORTED');await pinnedApproval(approval,config.trustedApprovalSha256);const fd=await handle();
   try{for await(const line of lines(spoolText(fd))){assertOpen();const record=JSON.parse(line);check(record);if(entity===undefined||record.source.entityType===entity)yield {...record,...(mode==='SETTLEMENT'?{moneyApprovals:structuredClone(approvedSet)}:{})};}}
   finally{await fd.close();}
  }
 };
}
