import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function loadPgDriver(){
 const root='/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules';
 const need=(ok)=>{if(!ok)throw Error('R3_RETAINED_LINUX_DRIVER_DIFFERS')};
 const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.nlink,s.mode,s.size,s.mtimeNs,s.ctimeNs].join(':');
 for(const [leaf,pin,bytes,inode]of [
  ['.package-lock.json','7e2bc5e96f2b95c7404479d2785372696323d8ec9b49ce6e642de2bedf120f7d',49967,13504782n],
  ['pg/esm/index.mjs','5ef4d06556eeb775987759c2c09229dca2139421ee40e819b566612db2b4a8dc',579,13506784n],
 ]){
  const path=root+'/'+leaf;need(await realpath(path)===path);
  for(let directory=dirname(path);;directory=dirname(directory)){
   const s=await lstat(directory),inDeps=directory===root||directory.startsWith(root+'/');
   need(s.isDirectory()&&s.uid===(inDeps?1000:0)&&!(s.mode&0o022)
    &&(directory!==root||(s.dev===66304&&s.ino===13504771&&s.gid===1000&&(s.mode&0o777)===0o755)));
   if(directory==='/')break;
  }
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const before=await file.stat({bigint:true});
   need(before.isFile()&&before.dev===66304n&&before.ino===inode&&before.uid===1000n&&before.gid===1000n
    &&before.nlink===1n&&(before.mode&0o777n)===0o644n&&before.size===BigInt(bytes));
   const buffer=Buffer.alloc(bytes+1);let used=0;
   while(used<buffer.length){const r=await file.read(buffer,used,buffer.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead}
   need(used===bytes&&identity(before)===identity(await file.stat({bigint:true}))
    &&identity(before)===identity(await lstat(path,{bigint:true}))
    &&createHash('sha256').update(buffer.subarray(0,used)).digest('hex')===pin);
  }finally{await file.close()}
 }
 return import(pathToFileURL(root+'/pg/esm/index.mjs').href);
}
