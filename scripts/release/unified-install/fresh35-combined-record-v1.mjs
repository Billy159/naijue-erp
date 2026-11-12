/** Distinct fixed record for the combined 35-table installation. An ordinary
 * JSON receipt cannot mint this completion, publish a record, or open a host. */
import {open,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {publishInstallationRecord} from './publish-installation-record.mjs';
import {describeFresh35CombinedCompletion,describeFresh35CombinedProgram} from './fresh35-combined-lifecycle-v1.mjs';
import {combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {isFresh35RestorationProgram,describeFresh35RestorationProgram,validateFresh35RestoredRecord,validateFresh35RestoredRecordShape,isFresh35RestorationCompletion,describeFresh35RestorationCompletion,assertFresh35RestorationCompletionCurrent} from './fresh35-restoration-v1.mjs';
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_RECORD_'+code)};
const etc=process.platform==='darwin'?'/private/etc':'/etc';
export const FRESH35_COMBINED_RECORD_PATH=etc+'/naijue-erp/fresh35-combined-installation-v1.json';
const issued=new WeakSet(),protectedEnvelopes=new WeakMap();
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_COMBINED_RECORD_MODULE_SHA256=loadedModuleSha256;
function closed(object,keys){need(object&&Object.getPrototypeOf(object)===Object.prototype,'CLOSED_DATA_REQUIRED');const d=Object.getOwnPropertyDescriptors(object);need(Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')),'CLOSED_DATA_REQUIRED')}
export function validateFresh35CombinedRecord(value,program){
 if(value?.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1')return validateFresh35RestoredRecord(value,program);
 const expected=describeFresh35CombinedProgram(program);
 closed(value,['format','installedAt','binding','target','transactionReceipt','programSha256','catalogSpecSha256','catalogSha256','authorizationSha256','state']);
 need((value.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1'&&value.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V1'||value.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2'&&value.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V2'&&value.target?.purpose==='PRODUCTION_NEW_EMPTY_EXACT35')&&value.state==='COMMITTED_AND_CATALOG_CHECKED'&&typeof value.installedAt==='string'&&Number.isFinite(Date.parse(value.installedAt)),'FORMAT_REQUIRED');
 closed(value.binding,['sourceSetSha256','targetSha256']);
 need(value.binding.sourceSetSha256===expected.sourceSetSha256&&value.binding.targetSha256===expected.targetSha256&&value.programSha256===expected.programSha256&&value.catalogSpecSha256===expected.catalogSha256,'EXACT_PROGRAM_BINDING_REQUIRED');
 need(hash(JSON.stringify(value.target))===expected.targetSha256,'PHYSICAL_TARGET_BINDING_REQUIRED');
 closed(value.transactionReceipt,['nonce','database','actor','transactionId','backendPid']);
 need(/^[a-f0-9]{48}$/.test(value.transactionReceipt.nonce)&&value.transactionReceipt.database===value.target.proposal.database&&value.transactionReceipt.actor===value.target.proposal.owner&&/^[1-9][0-9]*$/.test(value.transactionReceipt.transactionId)&&Number.isSafeInteger(value.transactionReceipt.backendPid)&&value.transactionReceipt.backendPid>0,'SAME_TRANSACTION_RECEIPT_REQUIRED');
 need(['catalogSha256','authorizationSha256'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k])),'CATALOG_AND_AUTHORIZATION_DIGEST_REQUIRED');
 return Object.freeze({...value,binding:Object.freeze({...value.binding})});
}
/** Durable publication is separate from SQL COMMIT. On failure never claim SQL
 * rollback, overwrite an existing record, or replay the consumed installation. */
export async function publishFresh35CombinedRecord(completion){
 const restored=isFresh35RestorationCompletion(completion),c=restored?describeFresh35RestorationCompletion(completion):describeFresh35CombinedCompletion(completion);need(!issued.has(completion),'COMPLETION_ALREADY_CONSUMED');
 if(restored)await assertFresh35RestorationCompletionCurrent(completion);
 need(c.recordModuleSha256===loadedModuleSha256,'LOADED_PUBLISHER_SOURCE_DIFFERS');
 need(process.getuid?.()===0&&process.geteuid?.()===0,'TRUSTED_PUBLISHER_REQUIRED');
 await assertTrustedRootPath(process.execPath);await assertTrustedRootTree(c.sourceRoot);await assertTrustedRootPath(etc+'/naijue-erp');
 try{await lstat(FRESH35_COMBINED_RECORD_PATH);throw Error('FRESH35_COMBINED_RECORD_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}
 const record=restored?c.record:{format:c.target.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'?'FRESH35_COMBINED_INSTALLATION_RECORD_V2':'FRESH35_COMBINED_INSTALLATION_RECORD_V1',installedAt:c.installedAt,binding:{sourceSetSha256:c.program.sourceSetSha256,targetSha256:c.program.targetSha256},target:c.target,transactionReceipt:c.transactionReceipt,programSha256:c.program.programSha256,catalogSpecSha256:c.program.catalogSha256,catalogSha256:c.catalogSha256,authorizationSha256:c.authorizationSha256,state:'COMMITTED_AND_CATALOG_CHECKED'};
 issued.add(completion);const bytes=JSON.stringify(record)+'\n';
 try{await publishInstallationRecord(FRESH35_COMBINED_RECORD_PATH,bytes)}catch(error){error.installState=error.message==='INSTALL_RECORD_PUBLISHED_DURABILITY_UNKNOWN'?'PUBLISHED_DURABILITY_UNKNOWN':'COMMITTED_UNPUBLISHED';throw error}
 return Object.freeze({format:'FRESH35_COMBINED_PUBLICATION_RECEIPT_V1',state:'RECORD_DURABLY_PUBLISHED',recordPath:FRESH35_COMBINED_RECORD_PATH,recordSha256:hash(bytes),programSha256:restored?c.record.programSha256:c.program.programSha256,credentialsRevoked:restored?false:c.credentialsRevoked,clusterStopped:restored?false:c.clusterStopped,hostEnabled:false,businessImportVerified:false});
}
/** Read-only fixed-path loading. Source/current-client verification and a distinct
 * runtime capability remain mandatory before any future import-host admission. */
export async function loadFresh35CombinedRecordEnvelope(){
 need(Number.isInteger(process.getuid?.())&&process.getuid()!==0&&process.geteuid?.()!==0,'ORDINARY_RUNTIME_REQUIRED');
 try{await assertTrustedRootPath(FRESH35_COMBINED_RECORD_PATH)}catch{throw Error('FRESH35_PROTECTED_RECORD_REQUIRED')}
 const f=await open(FRESH35_COMBINED_RECORD_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await f.stat({bigint:true});
  need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o022n)===0n&&before.size>0n&&before.size<=65536n,'OS_PROTECTED_RECORD_REQUIRED');
  const bytes=await f.readFile(),after=await f.stat({bigint:true}),pathStat=await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true});
  need(BigInt(bytes.length)===before.size&&recordIdentity(after)===recordIdentity(before)&&recordIdentity(pathStat)===recordIdentity(before),'RECORD_CHANGED');
  const value=parseStrictJson(bytes.toString('utf8'));
  if(value.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'){validateFresh35RestoredRecordShape(value)}else{
  closed(value,['format','installedAt','binding','target','transactionReceipt','programSha256','catalogSpecSha256','catalogSha256','authorizationSha256','state']);
  need((value.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1'&&value.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V1'||value.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2'&&value.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V2'&&value.target?.purpose==='PRODUCTION_NEW_EMPTY_EXACT35')&&value.state==='COMMITTED_AND_CATALOG_CHECKED','FORMAT_REQUIRED');
  }
  // This protected envelope is only input to exact program reconstruction.
  // No execution capability is issued by loading or validating JSON.
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
  protectedEnvelopes.set(value,Object.freeze({sha256:hash(bytes),identity:recordIdentity(before)}));return freeze(value);
 }finally{await f.close()}
}
export async function loadFresh35CombinedRecord(program){
 if(isFresh35RestorationProgram(program))describeFresh35RestorationProgram(program);else describeFresh35CombinedProgram(program);
 return validateFresh35CombinedRecord(await loadFresh35CombinedRecordEnvelope(),program);
}

export function assertFresh35ProtectedRecordEnvelope(value){need(protectedEnvelopes.has(value),'FIXED_PROTECTED_ENVELOPE_REQUIRED');return value;}

function recordIdentity(stat){return [stat.dev,stat.ino,stat.uid,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs].map(String).join(':')}
export function describeFresh35ProtectedRecordSnapshot(envelope){assertFresh35ProtectedRecordEnvelope(envelope);return protectedEnvelopes.get(envelope)}
/** Startup may recheck bytes once; normal use only checks this loader's exact
 * nanosecond file identity. A later file can never supply a new baseline. */
export async function assertFresh35ProtectedRecordSnapshotCurrent(envelope,checkBytes=false){
 const snapshot=describeFresh35ProtectedRecordSnapshot(envelope);
 const before=await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true});
 need(before.isFile()&&!before.isSymbolicLink()&&recordIdentity(before)===snapshot.identity,'PROTECTED_RECORD_GENERATION_CHANGED');
 if(checkBytes){const bytes=await readFile(FRESH35_COMBINED_RECORD_PATH),after=await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true});need(recordIdentity(after)===snapshot.identity&&hash(bytes)===snapshot.sha256,'PROTECTED_RECORD_BYTES_CHANGED');}
 return snapshot;
}
