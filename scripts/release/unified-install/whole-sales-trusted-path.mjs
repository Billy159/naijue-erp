/** Sales-only trusted path checks. macOS mode bits do not represent extended ACLs. */
import {lstat,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,sep} from 'node:path';
import {assertTrustedRootPath} from './trusted-install-path.mjs';
const exec=promisify(execFile);
export function assertMacAclListingSafe(output){
 if(typeof output!=='string'||output.length>65536)throw Error('SALES_INSTALL_EXTENDED_ACL_UNTRUSTED');
 const lines=output.replace(/\n$/,'').split('\n');
 if(lines.length!==1||!/^[d-][rwxstST-]{9}@?\s/.test(lines[0])||lines[0].includes('\r'))throw Error('SALES_INSTALL_EXTENDED_ACL_UNTRUSTED');
}
async function macAcl(path){
 if(/[\r\n]/.test(path))throw Error('SALES_INSTALL_EXTENDED_ACL_UNTRUSTED');
 try{const r=await exec('/bin/ls',['-lde',path],{encoding:'utf8',timeout:5000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});if(r.stderr)throw Error();assertMacAclListingSafe(r.stdout)}catch{throw Error('SALES_INSTALL_EXTENDED_ACL_UNTRUSTED')}
}
async function check(path,seen){
 await assertTrustedRootPath(path);
 if(process.platform==='darwin'){let current=sep;for(const part of ['',...path.split(sep).filter(Boolean)]){if(part)current=join(current,part);if(!seen.has(current)){await macAcl(current);seen.add(current)}}}
}
export async function assertTrustedSalesPath(path){await check(path,new Set())}
export async function assertTrustedSalesTree(root){const seen=new Set();const visit=async path=>{await check(path,seen);if((await lstat(path)).isDirectory())for(const name of await readdir(path))await visit(join(path,name))};await visit(root)}
