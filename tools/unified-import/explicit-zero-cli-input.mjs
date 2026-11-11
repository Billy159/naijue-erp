/** Shared CLI intake. Reads only the explicitly selected bounded approval file;
 * never opens a database, issues admission, or returns raw evidence publicly. */
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';import {relative,sep,dirname} from 'node:path';
import {readExplicitZeroApproval,readExplicitZeroScopeApproval} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {decodeUtf8,parseStrictJson} from '../../packages/application/src/unified-import-contract.ts';
export async function readBoundedCliFile(path,max){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('INPUT_FILE_INVALID');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await f.stat();if(before.dev!==s.dev||before.ino!==s.ino||before.size!==s.size)throw Error('INPUT_FILE_CHANGED');let n=0;const chunks=[];
  for(;;){const b=Buffer.alloc(Math.min(65536,max+1-n)),r=await f.read(b,0,b.length,null);if(!r.bytesRead)break;n+=r.bytesRead;if(n>max)throw Error('INPUT_FILE_TOO_LARGE');chunks.push(b.subarray(0,r.bytesRead))}
  const after=await f.stat(),now=await lstat(path);if(n!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||now.dev!==before.dev||now.ino!==before.ino)throw Error('INPUT_FILE_CHANGED');return Buffer.concat(chunks,n);
 }finally{await f.close()}
}
export async function readExplicitZeroCliApproval(pkg,manifest,path,trustedSha256){
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('EXPLICIT_ZERO_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
 const bytes=await readBoundedCliFile(path,64*1024*1024),first=decodeUtf8(bytes).split('\n',1)[0];
 const input={bytes,trustedSha256,sourceNamespace:manifest.source_namespace,inventoryFileSha256:manifest.inventory_source?.source_file_sha256,cutoffAt:manifest.inventory_source?.cutoff_at};
 if(parseStrictJson(first).format_version==='EXPLICIT_ZERO_SCOPE_APPROVAL_V2')return readExplicitZeroScopeApproval({...input,directory:dirname(await realpath(path))});
 return readExplicitZeroApproval(input);
}
/** Same independent staff approval verifier used by the formal import route. */
export async function readStaffHallCliApproval(pkg,manifest,path,trustedSha256){
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('STAFF_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
 const {readHistoricalStaffHallApproval}=await import('../../packages/application/src/unified-historical-staff-hall-approval.ts');
 return readHistoricalStaffHallApproval({bytes:await readBoundedCliFile(path,1024*1024),trustedSha256,sourceNamespace:manifest.source_namespace,sourceHashes:new Set(manifest.source_files.map(f=>f.sha256))});
}
