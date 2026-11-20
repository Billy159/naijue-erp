import {lstat,readdir} from 'node:fs/promises';import {isAbsolute,resolve,sep,join} from 'node:path';
const check=s=>{if(s.uid!==0||(s.mode&0o022)!==0||s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))throw Error('UNTRUSTED_ROOT_INSTALL_PATH');};
export async function assertTrustedRootPath(path,stat=lstat){if(!isAbsolute(path)||resolve(path)!==path)throw Error('TRUSTED_ABSOLUTE_PATH_REQUIRED');let cursor=sep;check(await stat(cursor));const parts=path.split(sep).filter(Boolean);for(let i=0;i<parts.length;i++){cursor=join(cursor,parts[i]);const s=await stat(cursor);check(s);if(i<parts.length-1&&!s.isDirectory())throw Error('UNTRUSTED_ROOT_INSTALL_PATH');}}
export async function assertTrustedRootTree(root){await assertTrustedRootPath(root);const visit=async path=>{const s=await lstat(path);check(s);if(s.isDirectory())for(const name of await readdir(path))await visit(join(path,name));};await visit(root);}
export const TRUSTED_PSQL_PATH=process.platform==='darwin'?'/Library/PostgreSQL/17/bin/psql':'/usr/lib/postgresql/17/bin/psql';
export function requireFixedPsql(path){if(path!==TRUSTED_PSQL_PATH)throw Error('FIXED_POSTGRES17_PSQL_REQUIRED');}
