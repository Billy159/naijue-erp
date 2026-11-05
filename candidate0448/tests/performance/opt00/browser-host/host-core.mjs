import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkedLoopback(headers,port){
  const origin=`http://127.0.0.1:${port}`;
  if(headers.host!==`127.0.0.1:${port}`||headers.origin!==undefined&&headers.origin!==origin)return false;
  return !headers['sec-fetch-site']||['same-origin','none'].includes(headers['sec-fetch-site']);
}
export function safeAsset(root,pathname){
  if(!/^\/assets\/[A-Za-z0-9_./-]+$/.test(pathname)||pathname.includes('..')||pathname.includes('//'))throw new TypeError('Closed explicit asset path');
  const target=path.resolve(root,pathname.slice('/assets/'.length));
  if(!target.startsWith(path.resolve(root)+path.sep))throw new TypeError('Asset escaped build');
  return target;
}
export async function verifiedFile(root,entry){
  if(!entry||typeof entry.path!=='string'||path.isAbsolute(entry.path)||entry.path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..')||!Number.isInteger(entry.bytes)&&entry.bytes!==undefined||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new TypeError('Explicit relative file hash required');
  const file=path.join(root,entry.path),resolvedRoot=await realpath(root);let cursor=path.resolve(root);
  for(const part of entry.path.split('/')){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw new TypeError('Symlink is not a frozen source');}
  if(!(await realpath(file)).startsWith(resolvedRoot+path.sep))throw new TypeError('Source escaped root');
  const bytes=await readFile(file);assert.equal(sha256(bytes),entry.sha256,'Frozen file drift');if(entry.bytes!==undefined)assert.equal(bytes.length,entry.bytes);return bytes;
}
export function freezeData(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freezeData(child);Object.freeze(value);}return value;}
/** Node test-server imports must use the selected Git runtime, not active WIP.
 * Only repo apps/packages are redirected; frozen test helpers stay separate. */
export function pinnedRuntimeImport(sourceRoot,runtimeRepo,importer,specifier){
  if(!specifier.startsWith('.')&&!path.isAbsolute(specifier))return null;
  const absolute=path.resolve(path.dirname(importer),specifier),relative=path.relative(sourceRoot,absolute);
  return /^(apps|packages)\//.test(relative)?path.join(runtimeRepo,relative):null;
}
export function frozenServerRelative(sourceRoot,runtimeRepo,absolute){
  const candidate=path.relative(runtimeRepo,absolute);
  if(!candidate.startsWith('..')&&!path.isAbsolute(candidate))return candidate;
  const helper=path.relative(sourceRoot,absolute);
  if(helper.startsWith('tests/performance/opt00/'))return helper;
  throw new TypeError('Node source is neither pinned runtime nor frozen test helper');
}
export function redactRequestBody(value,depth=0){if(depth>20)return '[REDACTED_DEPTH]';if(Array.isArray(value))return value.map(child=>redactRequestBody(child,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,/password|secret|token|credential|authorization|cookie/i.test(key)?'[REDACTED]':redactRequestBody(child,depth+1)]));return value;}
