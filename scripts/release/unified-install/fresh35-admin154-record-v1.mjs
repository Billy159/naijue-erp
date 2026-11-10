/** Fixed a53 successor evidence. This never overwrites/relabels the original
 * installation record and never issues authority from caller-supplied JSON. */
import {open,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {parseStrictJson,validateOffsetInstant} from '../../../packages/application/src/unified-import-contract.ts';
import {requestHash} from '../../../packages/application/src/request-hash.ts';
import {combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {assertTrustedRootPath} from './trusted-install-path.mjs';
const etc=process.platform==='darwin'?'/private/etc':'/etc';
export const ADMIN154_RECORD_PATH=etc+'/naijue-erp/fresh35-admin154-successor-v1.json';
export const ADMIN154_AUTHORIZATION_PATH=etc+'/naijue-erp/fresh35-admin154-execution-v1.json';
export const ADMIN154_PREDECESSOR_RECORD_SHA256='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e';
export const ADMIN154_PREDECESSOR_SOURCE_SHA256='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16';
export const ADMIN154_PATCH_SHA256='6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b';
const records=new WeakMap(),authorities=new WeakMap();
const need=(v,code)=>{if(!v)throw Error('FRESH35_ADMIN154_'+code);};
const closed=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===keys;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function pgMicros(value){
 need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(value),'POSTMASTER_UTC_REQUIRED');
 const iso=value.replace(' ','T').replace(/\+00$/,'Z');need(validateOffsetInstant(iso),'POSTMASTER_UTC_REQUIRED');
 const [whole,fraction='']=iso.slice(0,-1).split('.');return BigInt(Date.parse(whole+'Z'))*1000n+BigInt(fraction.padEnd(6,'0'));
}
const identity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
async function protectedJson(path){
 await assertTrustedRootPath(path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await file.stat({bigint:true});need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o022n)===0n&&before.size>0n&&before.size<=65536n,'PROTECTED_EVIDENCE_REQUIRED');
  const bytes=await file.readFile(),after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});
  need(BigInt(bytes.length)===before.size&&identity(before)===identity(after)&&identity(before)===identity(current),'EVIDENCE_CHANGED');
  return {path,value:freeze(parseStrictJson(bytes.toString('utf8'))),sha256:hash(bytes),identity:identity(before)};
 }finally{await file.close();}
}
/** Pure structural comparison is not an execution capability. */
export function validateFresh35Admin154Record(value,expected){
 need(closed(value,'appliedAt,authorizationSha256,format,physical,predecessor,successor,transactionReceipt')&&value.format==='FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1','RECORD_FORMAT_REQUIRED');
 need(closed(value.predecessor,'catalogSha256,programSha256,recordSha256,sourceSetSha256,targetSha256')
  &&value.predecessor.recordSha256===ADMIN154_PREDECESSOR_RECORD_SHA256&&value.predecessor.sourceSetSha256===ADMIN154_PREDECESSOR_SOURCE_SHA256
  &&isDeepStrictEqual(value.predecessor,expected.predecessor),'PREDECESSOR_DIFFERS');
 need(closed(value.successor,'catalogSha256,catalogSpecSha256,modelSha256,patchSqlSha256,sourceSetSha256')
  &&value.successor.patchSqlSha256===ADMIN154_PATCH_SHA256&&Object.values(value.successor).every(digest)
  &&Object.entries(expected.successor).every(([k,v])=>value.successor[k]===v),'SUCCESSOR_SOURCE_OR_CATALOG_DIFFERS');
 // Preserve the actual DDL epoch as history. Live host/service/authorization
 // separately bind the current epoch; a restart cannot relabel this receipt.
 need(closed(value.physical,'database,databaseOid,postmasterStart,serverVersionNum,systemIdentifier')
  &&['database','databaseOid','serverVersionNum','systemIdentifier'].every(k=>value.physical[k]===expected.physical[k])
  &&pgMicros(value.physical.postmasterStart)<=pgMicros(expected.physical.postmasterStart),'PHYSICAL_EPOCH_DIFFERS');
 const r=value.transactionReceipt;
 need(closed(r,'actor,backendPid,database,nonce,transactionId')&&typeof r.nonce==='string'&&/^[a-f0-9]{48}$/.test(r.nonce)
  &&r.actor===expected.owner&&r.database===value.physical.database&&typeof r.transactionId==='string'&&/^[1-9][0-9]*$/.test(r.transactionId)
  &&Number.isSafeInteger(r.backendPid)&&r.backendPid>0&&validateOffsetInstant(value.appliedAt)&&digest(value.authorizationSha256),'NATIVE_RECEIPT_REQUIRED');
 return freeze(structuredClone(value));
}
export async function loadFresh35Admin154Record(expected,expectedSha256){
 need(digest(expectedSha256),'RECORD_SHA_REQUIRED');const captured=await protectedJson(ADMIN154_RECORD_PATH);
 need(captured.sha256===expectedSha256,'RECORD_SHA_DIFFERS');
 const value=validateFresh35Admin154Record(captured.value,expected),token=Object.freeze({profile:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1'});
 records.set(token,{...captured,value});return token;
}
export function describeFresh35Admin154Record(token){const r=records.get(token);need(r,'PROTECTED_RECORD_REQUIRED');return Object.freeze({value:r.value,sha256:r.sha256,path:r.path});}
async function assertCurrent(captured,checkBytes){
 const before=await lstat(captured.path,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&identity(before)===captured.identity,'EVIDENCE_CHANGED');
 if(checkBytes){const bytes=await readFile(captured.path),after=await lstat(captured.path,{bigint:true});need(identity(after)===captured.identity&&hash(bytes)===captured.sha256,'EVIDENCE_BYTES_CHANGED');}
}
export async function assertFresh35Admin154RecordCurrent(token,checkBytes=false){const r=records.get(token);need(r,'PROTECTED_RECORD_REQUIRED');await assertCurrent(r,checkBytes);}
export async function loadFresh35Admin154Authorization(binding,purpose,deadline){
 need(['ADMIN_PROVISION_ONLY','FIRST_REAL_BUSINESS_IMPORT'].includes(purpose)&&Number.isSafeInteger(deadline)&&deadline>Date.now(),'EXACT_PURPOSE_REQUIRED');
 const captured=await protectedJson(ADMIN154_AUTHORIZATION_PATH),a=captured.value;
 const decision=purpose==='ADMIN_PROVISION_ONLY'?'AUTHORIZE_EXACT_ADMIN_PROVISION_ONLY':'AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK';
 need(closed(a,'authorizationReference,binding,decision,expiresAt,format,independentSafetyReviewSha256,startsAt')
  &&a.format==='FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1'&&a.decision===decision&&requestHash(a.binding)===requestHash(binding),'EXACT_OPERATION_AUTHORIZATION_REQUIRED');
 need(Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)&&a.startsAt<a.expiresAt&&a.expiresAt<=deadline&&Date.now()>=a.startsAt&&Date.now()<a.expiresAt
  &&digest(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.trim().length>0,'AUTHORIZATION_WINDOW_OR_REFERENCE_REQUIRED');
 const token=Object.freeze({profile:'FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1'});authorities.set(token,captured);return token;
}
export async function assertFresh35Admin154AuthorizationCurrent(token){const a=authorities.get(token);need(a,'PROTECTED_AUTHORIZATION_REQUIRED');need(Date.now()>=a.value.startsAt&&Date.now()<a.value.expiresAt,'AUTHORIZATION_EXPIRED');await assertCurrent(a,false);return Object.freeze({sha256:a.sha256,startsAt:a.value.startsAt,expiresAt:a.value.expiresAt});}
