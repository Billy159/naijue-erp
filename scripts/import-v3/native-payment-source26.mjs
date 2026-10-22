/** Genuine immutable artifact consumer under C's PAYMENT reference-only review.
 * No SQL, runtime issuer, source execution grant, native identity allocation or
 * original workbook/snapshot rescan. Every actual native step needs other gates. */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {historySettlementRequestHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {validatePreparedNativePaymentImportChunk} from '../../packages/application/src/native-payment-import.ts';
import {nativePaymentSourceEvidence,nativePaymentBindingEvidence} from '../../adapters/postgres/src/native-payment-import.ts';
import {historyClosureProjectionRow26} from '../../packages/application/src/history-typed-closure.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
const kinds=['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'];
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),digest=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>['dev','ino','mode','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
async function regular(path){must(typeof path==='string'&&isAbsolute(path),'PAYMENT_SOURCE26_PATH');let p=resolve(path),first=true;for(;;){const s=await lstat(p);must(!s.isSymbolicLink()&&(first?s.isFile():s.isDirectory()),'PAYMENT_SOURCE26_REGULAR');first=false;const parent=dirname(p);if(parent===p)return;p=parent;}}
const order=(a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key));
export async function openReviewedPaymentSource26(options){
 must(exact(options,['reviewFile','trustedReviewSha256','binding','authorizedPayloadHash']),'PAYMENT_SOURCE26_OPTIONS');
 const o={...options};must(hash(o.trustedReviewSha256),'PAYMENT_SOURCE26_OUTSIDE_PIN');historySettlementRequestHash(o.binding);
 const binding=structuredClone(o.binding);must(exact(binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&hash(binding.selectionSha256)
  &&typeof binding.batchId==='string'&&typeof binding.fixedSourceNamespace==='string'&&typeof binding.cutoffAt==='string'
  &&(o.authorizedPayloadHash===null||hash(o.authorizedPayloadHash)),'PAYMENT_SOURCE26_BINDING');
 const files=[];let closed=false;const chunks=[],fingerprints=new Set();
 const active=()=>must(!closed,'PAYMENT_SOURCE26_CLOSED');
 async function close(){closed=true;chunks.length=0;fingerprints.clear();for(const f of files)try{await f.fd.close();}catch{}files.length=0;}
 async function load(path,pin,expected,max){must(hash(pin),'PAYMENT_SOURCE26_OUTSIDE_PIN');await regular(path);const s=await lstat(path);must(s.size>0&&s.size<=max&&(expected===null||s.size===expected),'PAYMENT_SOURCE26_FILE_BOUND');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),f={path,stat:s,fd};files.push(f);
  const bytes=await fd.readFile();must(bytes.length===s.size&&digest(bytes)===pin&&same(s,await fd.stat())&&same(s,await lstat(path)),'PAYMENT_SOURCE26_FILE_CHANGED');return {value:JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)),bytes:bytes.length};}
 async function verify(){active();for(const f of files){await regular(f.path);must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'PAYMENT_SOURCE26_FILE_CHANGED');}active();}
 const bound=v=>exact(v,Object.keys(binding))&&Object.keys(binding).every(k=>v[k]===binding[k]);
 try{
  const {value:a}=await load(o.reviewFile,o.trustedReviewSha256,null,4194304);
  must(exact(a,['version','decision','binding','manifest','decisions','scope','independentReview','realImportExecutionAuthorized'])
   &&a.version==='C_NATIVE_PAYMENT_REFERENCE_REVIEW_V1'&&a.decision==='ACCEPT_EXACT_PREPARED_PAYMENT_REFERENCE_BINDINGS'&&bound(a.binding)
   &&a.scope==='PAYMENT_REFERENCE_DECISIONS_ONLY'&&a.realImportExecutionAuthorized===false,'PAYMENT_SOURCE26_REVIEW');
  must(exact(a.manifest,['path','sha256','bytes','rows','counts'])&&exact(a.decisions,['path','sha256','bytes','rows'])&&exact(a.independentReview,['path','sha256','result'])
   &&a.independentReview.result==='PASS'&&exact(a.manifest.counts,kinds)&&kinds.every(k=>Number.isSafeInteger(a.manifest.counts[k])&&a.manifest.counts[k]>=0)
   &&Number.isSafeInteger(a.manifest.rows)&&a.manifest.rows>0&&a.manifest.rows<=100000&&Object.values(a.manifest.counts).reduce((s,n)=>s+n,0)===a.manifest.rows&&a.decisions.rows===a.manifest.rows,'PAYMENT_SOURCE26_REVIEW_COMPONENT');
  const {value:qb}=await load(a.independentReview.path,a.independentReview.sha256,null,4194304);must(qb?.result==='PASS','PAYMENT_SOURCE26_QB_RESULT');
  const {value:m}=await load(a.manifest.path,a.manifest.sha256,a.manifest.bytes,4194304),{value:d}=await load(a.decisions.path,a.decisions.sha256,a.decisions.bytes,16777216);
  must(Object.keys(binding).every(k=>m[k]===binding[k]&&d[k]===binding[k])&&m.rows===a.manifest.rows&&requestHash(m.counts)===requestHash(a.manifest.counts)
   &&m.artifact?.path===a.decisions.path&&m.artifact.sha256===a.decisions.sha256&&m.artifact.bytes===a.decisions.bytes&&m.importAuthorized===false&&m.nativeReferenceApproved===false,'PAYMENT_SOURCE26_MANIFEST');
  must(exact(d,['version',...Object.keys(binding),'prepared','sourceLocators','importAuthorized','nativeReferenceApproved'])&&d.version==='NATIVE_PAYMENT_SOURCE_REFERENCE_CANDIDATE_V1'
   &&d.importAuthorized===false&&d.nativeReferenceApproved===false&&Array.isArray(d.prepared)&&d.prepared.length>0&&d.prepared.length<=10000&&d.prepared.length===m.chunks
   &&Array.isArray(d.sourceLocators)&&d.sourceLocators.length===m.rows,'PAYMENT_SOURCE26_CANDIDATE');
  const locators=new Map();for(const l of d.sourceLocators){must(exact(l,['entity','sourceKey','originalSourceId','sourceLocator','rawLineSha256'])&&kinds.includes(l.entity)&&typeof l.sourceKey==='string'
   &&typeof l.originalSourceId==='string'&&hash(l.rawLineSha256)&&exact(l.sourceLocator,['file','sheet','row','sourceSha256']),'PAYMENT_SOURCE26_ORIGINAL_LOCATOR');const key=l.entity+'\0'+l.sourceKey;must(!locators.has(key),'PAYMENT_SOURCE26_DUPLICATE');locators.set(key,l);}
  const counts=Object.fromEntries(kinds.map(k=>[k,0])),sourceIds=new Set(),sourcePositions=new Set(),nativeKeys=new Set(),bySource=new Map(),halls=new Map();
  for(const chunk of d.prepared){validatePreparedNativePaymentImportChunk(chunk);must(chunk.input.batchId===binding.batchId&&chunk.input.fixedSourceNamespace===binding.fixedSourceNamespace
    &&chunk.input.selection.selectionSha256===binding.selectionSha256&&!fingerprints.has(chunk.fingerprint),'PAYMENT_SOURCE26_SCOPE');fingerprints.add(chunk.fingerprint);chunks.push(chunk);
   for(const row of chunk.rows){const s=row.source,key=row.entity+'\0'+s.sourceKey,l=locators.get(key),position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);
    must(l&&!bySource.has(key)&&!sourceIds.has(s.id)&&!sourcePositions.has(position)&&l.sourceLocator.file===s.fileRef&&l.sourceLocator.sheet===s.sheet
     &&String(l.sourceLocator.row)===s.rowNo&&l.sourceLocator.sourceSha256===s.sourceFileSha256&&l.rawLineSha256===s.rowSha256
     &&l.originalSourceId===(row.entity==='PAYMENT_ACCOUNT_HALL'?'':s.sourceKey),'PAYMENT_SOURCE26_ORIGINAL_LOCATOR');
    const n=row.nativeSnapshot,nk=row.entity+'\0'+(n.id??JSON.stringify([n.payment_account_id,n.hall_id]));must(!nativeKeys.has(nk),'PAYMENT_SOURCE26_DUPLICATE');nativeKeys.add(nk);sourceIds.add(s.id);sourcePositions.add(position);bySource.set(key,row);counts[row.entity]++;
   }
  }
  must(requestHash(counts)===requestHash(a.manifest.counts)&&bySource.size===m.rows,'PAYMENT_SOURCE26_COVERAGE');
  for(const row of bySource.values())for(const r of Object.values(row.references)){
   if(r.entity==='HALL'){const old=halls.get(r.sourceKey);must(!old||requestHash(old)===requestHash(r),'PAYMENT_SOURCE26_REFERENCE_CHANGED');halls.set(r.sourceKey,r);}
   else{const expected=bySource.get(r.entity+'\0'+r.sourceKey);must(expected&&expected.nativeSnapshot.id===r.nativeId&&requestHash(expected.nativeSnapshot)===requestHash(r.nativeSnapshot),'PAYMENT_SOURCE26_REFERENCE_CHANGED');}
  }
  await verify();
  return {report:Object.freeze({kind:'REVIEWED_PAYMENT_SOURCE26_REFERENCE_ONLY_V1',rows:m.rows,chunks:chunks.length,counts:Object.freeze(counts),originalBlankRelationIds:counts.PAYMENT_ACCOUNT_HALL,referenceDecisionsAuthorized:true,executionAuthorized:false,noSql:true}),verify,
   async *chunks(){await verify();for(const chunk of chunks){active();yield structuredClone(chunk);}await verify();},
   async authorize(input){active();const before=historySettlementRequestHash(input),copy=structuredClone(input);validatePreparedNativePaymentImportChunk(copy);await verify();must(fingerprints.has(copy.fingerprint),'PAYMENT_SOURCE26_NOT_AUTHORIZED');must(historySettlementRequestHash(input)===before,'PAYMENT_SOURCE26_INPUT_CHANGED');},
   async openClosure(scope,context){await verify();historySettlementRequestHash(scope);must(context?.group==='PAYMENT'&&!context.signal?.aborted&&scope.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace
     &&scope.selectionSha256===binding.selectionSha256&&hash(o.authorizedPayloadHash)&&scope.authorizedPayloadHash===o.authorizedPayloadHash,'PAYMENT_SOURCE26_CLOSURE_SCOPE');let sessionClosed=false;
    const current=()=>{active();must(!sessionClosed&&!context.signal?.aborted,'PAYMENT_SOURCE26_CLOSED');};
    const rows=chunks.flatMap(c=>c.rows),sourceRows=rows.map(r=>historyClosureProjectionRow26('import_source_row',nativePaymentSourceEvidence(r))).sort(order),typedRows=rows.flatMap(r=>[
      historyClosureProjectionRow26('import_native_payment_binding',nativePaymentBindingEvidence(r)),historyClosureProjectionRow26(r.entity==='PAYMENT_METHOD'?'payment_method_identity':r.entity==='PAYMENT_ACCOUNT'?'payment_account_identity':'payment_account_hall',r.entity==='PAYMENT_ACCOUNT_HALL'?r.nativeSnapshot:{id:r.nativeSnapshot.id})]).sort(order);
    return {async verify(){current();await verify();current();},async *sourceRows(){for(const row of sourceRows){current();yield structuredClone(row);}},async *typedRows(){for(const row of typedRows){current();yield structuredClone(row);}},async *documents(){current();},async close(){sessionClosed=true;}};
   },close};
 }catch(error){await close();throw error;}
}
