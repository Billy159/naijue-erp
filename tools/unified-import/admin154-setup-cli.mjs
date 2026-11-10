import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStrictJson,decodeUtf8} from '../../packages/application/src/unified-import-contract.ts';
import {isNodeScryptPasswordHash} from '../../packages/authentication/src/passwords.ts';
import {assertPublicValuesExcludePrivateInputs} from './execution-client.ts';
import {runFresh35Admin154Setup} from './fresh35-host-session.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const valueKeys=['--request','--connection','--target','--scrypt-file','--fresh35-reference-inputs','--admin154-successor-sha256','--current-service-sha256','--capacity-expires-at'];
const identity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
async function input(path,max,secret){
 if(typeof path!=='string'||!path.startsWith('/')||resolve(path)!==path||await realpath(path)!==path)throw Error('INPUT_FILE_INVALID');
 const s=await lstat(path,{bigint:true});
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size<=0n||s.size>BigInt(max)||(secret&&(s.mode&0o077n)!==0n))throw Error('INPUT_FILE_INVALID');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await file.stat({bigint:true});if(identity(before)!==identity(s))throw Error('INPUT_FILE_CHANGED');
  let length=0;const chunks=[];
  for(;;){const buffer=Buffer.alloc(Math.min(65536,max+1-length)),r=await file.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;length+=r.bytesRead;if(length>max)throw Error('INPUT_FILE_INVALID');chunks.push(buffer.subarray(0,r.bytesRead));}
  const bytes=Buffer.concat(chunks,length),after=await file.stat({bigint:true}),now=await lstat(path,{bigint:true});
  if(bytes.length>max||BigInt(bytes.length)!==before.size||identity(before)!==identity(after)||identity(before)!==identity(now))throw Error('INPUT_FILE_CHANGED');
  return decodeUtf8(bytes);
 }finally{await file.close();}
}
/** Explicit A operation only. No default administrator or generated identity;
 * the operator supplies the exact request and private encoding out of band. */
export async function runAdmin154Setup(argv){
 if(argv.length===1&&argv[0]==='--help')return {usage:'admin-provision-only --request PRIVATE_JSON --connection PRIVATE_JSON --target JSON --scrypt-file PRIVATE_FILE --fresh35-reference-inputs DIR --admin154-successor-sha256 SHA --current-service-sha256 SHA --capacity-expires-at MS [--prepare-only] --ack-exclusive-ddl-window',request_format:'FIRST_ADMIN_SETUP_V1',purpose:'ADMIN_PROVISION_ONLY',business_import:false,postgresql_acceptance:'NOT_RUN'};
 const values={},flags=new Set();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(['--prepare-only','--ack-exclusive-ddl-window'].includes(k)){if(flags.has(k))throw Error('OPTION_DUPLICATE');flags.add(k);continue;}
  if(!valueKeys.includes(k)||Object.hasOwn(values,k)||i+1>=argv.length||argv[i+1].startsWith('--'))throw Error('OPTION_INVALID');values[k]=argv[++i];
 }
 if(valueKeys.some(k=>!values[k]))throw Error('OPTION_REQUIRED');
 if(!flags.has('--ack-exclusive-ddl-window'))throw Error('EXCLUSIVE_DDL_WINDOW_ACK_REQUIRED');
 if(!['--admin154-successor-sha256','--current-service-sha256'].every(k=>/^[a-f0-9]{64}$/.test(values[k]))
  ||!Number.isSafeInteger(Number(values['--capacity-expires-at']))||Number(values['--capacity-expires-at'])<=Date.now())throw Error('OPTION_INVALID');
 const request=parseStrictJson(await input(values['--request'],65536,true));
 const config=parseStrictJson(await input(values['--connection'],65536,true));
 const target=parseStrictJson(await input(values['--target'],65536,false));
 const encoded=(await input(values['--scrypt-file'],4096,true)).trim();
 if(!isNodeScryptPasswordHash(encoded))throw Error('PRIVATE_CREDENTIAL_FORMAT_INVALID');
 const response=await runFresh35Admin154Setup(config,root,target,request,encoded,{referenceDirectory:resolve(values['--fresh35-reference-inputs']),successorSha256:values['--admin154-successor-sha256'],currentService:{sha256:values['--current-service-sha256'],capacityExpiresAt:Number(values['--capacity-expires-at'])},prepareOnly:flags.has('--prepare-only')});
 const result=response.result;
 const output={...result,...(['COMMITTED','ALREADY_COMMITTED'].includes(result?.state)?{provision_origin:{operation_id:result.receipt.operationId,request_sha256:result.request_sha256}}:{}),connection_cleanup:response.cleanup,host_verification:response.host_verification};
 try{assertPublicValuesExcludePrivateInputs(output,[config.password,encoded]);return output;}
 catch{return {state:['COMMITTED','ALREADY_COMMITTED','ROLLED_BACK'].includes(output.state)?output.state:'UNKNOWN',code:'PUBLIC_OUTPUT_REDACTED',connection_cleanup:response.cleanup};}
}
