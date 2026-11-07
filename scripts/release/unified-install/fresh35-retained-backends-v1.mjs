/** Root-captured native auxiliary processes for a single retained REAL worker.
 * No connection, process creation, observation authority, or role change here. */
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fstatSync,readSync} from 'node:fs';
import {decodeUtf8,parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';

export const FRESH35_RETAINED_BACKENDS_PATH='scripts/release/unified-install/fresh35-retained-backends-v1.mjs';
export const FRESH35_RETAINED_BACKENDS_MODULE_SHA256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
export const FRESH35_EXCLUSIVE_BACKENDS_FAILURE='FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS';
const need=(condition,code)=>{if(!condition)throw Error('FRESH35_RETAINED_BACKENDS_'+code);};
const exact=(object,keys)=>object&&Object.getPrototypeOf(object)===Object.prototype&&Reflect.ownKeys(object).length===keys.length&&keys.every(key=>{
 const descriptor=Object.getOwnPropertyDescriptor(object,key);return descriptor?.enumerable&&Object.hasOwn(descriptor,'value');
});
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const bootId=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const integer=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value);
const processKeys=['pid','fd','device','inode','startTicks'];
const nativeAuxiliaries=new Set(['checkpointer','background writer','walwriter','autovacuum launcher']);
const logicalLauncher='logical replication launcher';
const proofMaxBytes=8192;
export const retainedBackendRequestKey=value=>typeof value==='string'&&/^t45-r4-real-(?:prepare|execute|inspect)-[0-9]{8}-[0-9]{2}$/.test(value);
const processIdentity=value=>integer(value.pid)&&integer(value.fd)&&value.fd>=3&&decimal(value.device)&&decimal(value.inode)&&value.inode!=='0'
 &&decimal(value.startTicks)&&value.startTicks!=='0';
const permittedBackend=value=>value.datid===null&&(
 nativeAuxiliaries.has(value.backendType)&&value.usesysid===null||value.backendType===logicalLauncher&&value.usesysid===10
);

/** Metadata shape and provenance only. A trusted protected file and live kernel
 * handles are still required by the installed window. */
export function validateRetainedBackendProof(proof,binding,now=Date.now()){
 need(exact(proof,['format','requestKey','currentSourceSetSha256','operationParametersSha256','installationRecordSha256','restartReceiptSha256','bootId','pidNamespace',
  'capturedAt','expiresAt','guardian','postmaster','backends'])&&proof.format==='FRESH35_RETAINED_BACKENDS_V1','EXACT_PROOF_REQUIRED');
 need(retainedBackendRequestKey(proof.requestKey)&&proof.requestKey===binding.requestKey,'WRONG_REQUEST_KEY');
 for(const key of ['operationParametersSha256','installationRecordSha256','restartReceiptSha256','currentSourceSetSha256']){
  need(digest(proof[key])&&proof[key]===binding[key],'WRONG_PROVENANCE');
 }
 need(bootId(proof.bootId)&&exact(proof.pidNamespace,['device','inode'])&&decimal(proof.pidNamespace.device)
  &&decimal(proof.pidNamespace.inode)&&proof.pidNamespace.inode!=='0','NAMESPACE_REQUIRED');
 need([proof.capturedAt,proof.expiresAt,binding.startsAt,binding.expiresAt,now].every(Number.isSafeInteger)
  &&binding.startsAt<=proof.capturedAt&&proof.capturedAt<=now&&now<proof.expiresAt&&proof.expiresAt<=binding.expiresAt,'FINITE_WINDOW_REQUIRED');
 need(exact(proof.guardian,processKeys)&&processIdentity(proof.guardian)&&exact(proof.postmaster,processKeys)
  &&processIdentity(proof.postmaster)&&Array.isArray(proof.backends)
  &&proof.backends.every(row=>exact(row,[...processKeys,'backendType','datid','usesysid'])&&processIdentity(row)&&permittedBackend(row)),'EXACT_PROCESS_SET_REQUIRED');
 const processes=[proof.guardian,proof.postmaster,...proof.backends];
 need(new Set(processes.map(p=>p.pid)).size===processes.length&&new Set(processes.map(p=>p.fd)).size===processes.length,'DUPLICATE_PROCESS');
 return true;
}

/** Linux /proc stat fields following comm: state, ppid, ... starttime. */
export function retainedProcStatMatches(raw,pid,startTicks,parentPid){
 if(typeof raw!=='string')return false;
 const end=raw.lastIndexOf(')');
 if(end<0||!raw.startsWith(pid+' (')||raw[end+1]!==' ')return false;
 const fields=raw.slice(end+2).trim().split(/\s+/);
 return /^[A-Z]$/.test(fields[0]??'')&&!['Z','X'].includes(fields[0])
  &&fields[19]===startTicks&&(parentPid===undefined||fields[1]===String(parentPid));
}

/** Read the original directory descriptor inherited from root, never re-open
 * /proc/<pid> by number. A dead original handle does not follow a recycled PID. */
export async function assertRetainedBackendProcesses(proof,io={readFile,stat}){
 try{
  const namespace=await io.stat('/proc/self/ns/pid',{bigint:true});
  need(String(namespace.dev)===proof.pidNamespace.device&&String(namespace.ino)===proof.pidNamespace.inode
   &&(await io.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim()===proof.bootId,'LINUX_NAMESPACE_CHANGED');
  const check=async(process,parent)=>{
   const dir='/proc/self/fd/'+process.fd;
   const matches=info=>info.isDirectory()&&String(info.dev)===process.device&&String(info.ino)===process.inode;
   need(matches(await io.stat(dir,{bigint:true})),'PROC_HANDLE_CHANGED');
   const raw=await io.readFile(dir+'/stat','utf8');
   need(retainedProcStatMatches(raw,process.pid,process.startTicks,parent)&&matches(await io.stat(dir,{bigint:true})),'PROC_IDENTITY_CHANGED');
  };
  await check(proof.guardian);
  await check(proof.postmaster,proof.guardian.pid);
  for(const process of proof.backends)await check(process,proof.postmaster.pid);
 }catch(error){
  if(error instanceof Error&&/^FRESH35_RETAINED_BACKENDS_(LINUX_NAMESPACE_CHANGED|PROC_HANDLE_CHANGED|PROC_IDENTITY_CHANGED)$/.test(error.message))throw error;
  throw Error('FRESH35_RETAINED_BACKENDS_PROC_UNAVAILABLE');
 }
 return true;
}

const fdIdentity=info=>[info.dev,info.ino,info.uid,info.gid,info.mode,info.nlink,info.size,info.mtimeNs,info.ctimeNs].map(String).join(':');
const fdIo={fstatSync,readSync,readFile,stat};
async function protectedProofFd(fd,io){
 try{
  const before=io.fstatSync(fd,{bigint:true});
  need(before.isFile()&&before.uid===0n&&before.gid===0n&&(before.mode&0o7777n)===0o400n&&before.nlink===1n
   &&before.size>0n&&before.size<=BigInt(proofMaxBytes),'ROOT_PROOF_REQUIRED');
  const info=await io.readFile('/proc/self/fdinfo/'+fd,'utf8');
  const flags=/^flags:[ \t]+([0-7]+)[ \t]*$/m.exec(info)?.[1];
  need(flags!==undefined&&(BigInt('0o'+flags)&3n)===0n,'READ_ONLY_PROOF_REQUIRED');
  const bytes=Buffer.alloc(Number(before.size));
  let offset=0;
  while(offset<bytes.length){
   const length=io.readSync(fd,bytes,offset,bytes.length-offset,offset);
   need(length>0,'PROOF_BYTES_CHANGED');offset+=length;
  }
  const identity=fdIdentity(before);
  need(identity===fdIdentity(io.fstatSync(fd,{bigint:true})),'PROOF_FD_CHANGED');
  return {identity,bytes};
 }catch(error){
  if(error instanceof Error&&/^FRESH35_RETAINED_BACKENDS_(ROOT_PROOF_REQUIRED|READ_ONLY_PROOF_REQUIRED|PROOF_BYTES_CHANGED|PROOF_FD_CHANGED)$/.test(error.message))throw error;
  throw Error('FRESH35_RETAINED_BACKENDS_PROOF_UNAVAILABLE');
 }
}

/** The inherited descriptor is a locator. Its protected origin, exact bound
 * contents and inherited proc handles are checked on each physical host open. */
export async function loadRetainedBackendProof(binding,locator=process.env.FRESH35_RETAINED_BACKENDS_FD,io=fdIo,now=Date.now){
 need(typeof locator==='string'&&/^[1-9][0-9]{0,9}$/.test(locator)&&integer(Number(locator))&&Number(locator)>=3,'PROOF_FD_REQUIRED');
 const fd=Number(locator);
 const loaded=await protectedProofFd(fd,io);
 const proof=parseStrictJson(decodeUtf8(loaded.bytes));
 validateRetainedBackendProof(proof,binding,now());
 need(![proof.guardian,proof.postmaster,...proof.backends].some(process=>process.fd===fd),'DUPLICATE_PROCESS');
 const current=async()=>{
  const observed=await protectedProofFd(fd,io);
  need(observed.identity===loaded.identity&&observed.bytes.equals(loaded.bytes),'PROOF_FD_CHANGED');
  validateRetainedBackendProof(proof,binding,now());
  await assertRetainedBackendProcesses(proof,io);
  validateRetainedBackendProof(proof,binding,now());
 };
 const backends=Object.freeze(proof.backends.map(row=>Object.freeze({
  pid:row.pid,datid:row.datid,usesysid:row.usesysid,backendType:row.backendType
 })));
 await current();
 return Object.freeze({backends,current});
}

/** Use the columns visible to the original controller. Check both directions
 * with multiplicity and SQL NULL equality. The own caller is the sole exclusion. */
export function retainedBackendSetPredicate(backends){
 need(Array.isArray(backends)&&backends.every(permittedBackend)
  &&backends.every(row=>integer(row.pid))&&new Set(backends.map(row=>row.pid)).size===backends.length,'EXACT_SQL_SET_REQUIRED');
 const expected=backends.length
  ? 'VALUES '+backends.map(row=>'('+row.pid+'::integer,NULL::oid,'+(row.usesysid===null?'NULL':10)+'::oid)').join(',')
  : 'SELECT NULL::integer,NULL::oid,NULL::oid WHERE false';
 return `NOT EXISTS(WITH expected(pid,datid,usesysid) AS (${expected}),
 observed AS MATERIALIZED (SELECT a.pid,a.datid,a.usesysid FROM pg_catalog.pg_stat_activity a
 WHERE a.pid IS DISTINCT FROM pg_catalog.pg_backend_pid()),
 extra AS (SELECT * FROM observed EXCEPT ALL SELECT * FROM expected),
 missing AS (SELECT * FROM expected EXCEPT ALL SELECT * FROM observed)
 SELECT * FROM extra UNION ALL SELECT * FROM missing)`;
}

export function retainedBackendSafeFailure(error){
 return error?.code==='55000'&&error.message===FRESH35_EXCLUSIVE_BACKENDS_FAILURE?FRESH35_EXCLUSIVE_BACKENDS_FAILURE:null;
}
