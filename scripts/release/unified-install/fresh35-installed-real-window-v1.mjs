import {isDeepStrictEqual} from 'node:util';
/** Independent finite REAL window on a retained, verified installation.
 * No PG client, SQL execution, credentials, record rewrite or caller-issued token. */
import {open,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {combinedSha256 as hash,describeFresh35CombinedSource} from './fresh35-combined-source-v1.mjs';
const tokens=new WeakMap(),need=(ok,code)=>{if(!ok)throw Error('FRESH35_REAL_WINDOW_'+code)};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(o,k);return d?.enumerable&&Object.hasOwn(d,'value')});
const identity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const etc=process.platform==='darwin'?'/private/etc':'/etc';
export const FRESH35_INSTALLED_REAL_WINDOW_PATH=etc+'/naijue-erp/fresh35-installed-real-window-v1.json';
const ownPath='scripts/release/unified-install/fresh35-installed-real-window-v1.mjs',ownHash=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_REAL_BINDING_KEYS=Object.freeze(['format','installationRecordSha256','installProgramSha256','sourceSetSha256','targetSha256','catalogSha256','manifestSha256','planSha256','initializerSha256','stepsSha256','stepCount','sourceNamespace','cutoffAt','baselineBatchId','documentBatchId','initializerOperationId','initializerRequestKey']);
/** Pure metadata consistency, never a capability or proof of actual execution. */
export function validateInstalledRealWindow(value,record,recordSha,currentSourceSetSha,service,now=Date.now()){
 need(exact(value,['format','installedSourceRoot','currentSourceSetSha256','installation','manifestSha256','startsAt','expiresAt','authorizationExpiresAt','serviceReceipt','controllerLoginValidUntil','adminLoginValidUntil','authorizationReference'])&&value.format==='FRESH35_INSTALLED_REAL_OPERATION_PARAMETERS_V1','EXACT_AUTHORITY_REQUIRED');
 need(record?.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2'&&record.state==='COMMITTED_AND_CATALOG_CHECKED','VERIFIED_V2_INSTALL_REQUIRED');
 need(record.binding?.targetSha256===hash(JSON.stringify(record.target)),'ACTUAL_RECORD_TARGET_DIFFERS');
 const b=value.installation;need(exact(b,['installationRecordSha256','installProgramSha256','sourceSetSha256','targetSha256','catalogSha256']),'EXACT_INSTALLATION_BINDING_REQUIRED');
 need(b.installationRecordSha256===recordSha&&b.installProgramSha256===record.programSha256&&b.sourceSetSha256===record.binding.sourceSetSha256&&b.targetSha256===record.binding.targetSha256&&b.catalogSha256===record.catalogSha256,'INSTALLED_PROVENANCE_DIFFERS');
 need(Object.values(b).every(hex)&&hex(value.manifestSha256),'REAL_MANIFEST_REQUIRED');
 need(hex(value.currentSourceSetSha256)&&value.currentSourceSetSha256===currentSourceSetSha&&currentSourceSetSha!==b.sourceSetSha256&&typeof value.installedSourceRoot==='string'&&resolve(value.installedSourceRoot)===value.installedSourceRoot,'DISTINCT_RUNNING_SOURCE_REQUIRED');
 need(service?.state==='DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE'&&service.recordSha256===recordSha&&service.sourceSetSha256===b.sourceSetSha256&&isDeepStrictEqual(service.target,Object.fromEntries(Object.entries(record.target).filter(([k])=>!['format','authority'].includes(k))))&&service.hostEnabled===false&&service.businessVerified===false&&service.serviceLease?.onSuccess==='RETAIN_EXACT_TARGET_UNTIL_SERVICE_DEADLINE'&&service.serviceLease?.onFailure==='STOP_EXACT_TARGET_PRESERVE_DATA','ACTUAL_RETAINED_SERVICE_REQUIRED');
 need([value.startsAt,value.expiresAt,value.authorizationExpiresAt,now,service.serviceLease.expiresAt].every(Number.isSafeInteger)&&value.startsAt>=record.target.startsAt&&value.startsAt<=now&&now<value.expiresAt&&value.expiresAt-value.startsAt<=5400000&&value.expiresAt<=value.authorizationExpiresAt&&value.expiresAt<=service.serviceLease.expiresAt,'FINITE_OPERATION_WINDOW_REQUIRED');
 need(typeof value.controllerLoginValidUntil==='string'&&Date.parse(value.controllerLoginValidUntil)===value.expiresAt&&typeof value.adminLoginValidUntil==='string'&&Date.parse(value.adminLoginValidUntil)>=value.expiresAt&&Date.parse(value.adminLoginValidUntil)<=service.serviceLease.expiresAt,'EXACT_ROLE_LIFETIME_REQUIRED');
 const runtimeUntil=record.target.ordinary.runtimeLoginValidUntil;need(runtimeUntil===null||Date.parse(runtimeUntil)>=value.expiresAt,'RUNTIME_LIFETIME_REQUIRED');
 need(typeof value.authorizationReference==='string'&&value.authorizationReference.trim().length>0&&value.authorizationReference.length<=512,'AUTHORIZATION_REFERENCE_REQUIRED');
 need(exact(value.serviceReceipt,['path','sha256'])&&value.serviceReceipt.path===etc+'/naijue-erp/fresh35-retained-service-v1.json'&&hex(value.serviceReceipt.sha256),'EXACT_SERVICE_RECEIPT_REQUIRED');return true;
}
async function protectedFile(path,max=65536){
 await assertTrustedRootPath(path);const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const a=await f.stat({bigint:true});need(a.isFile()&&a.uid===0n&&a.nlink===1n&&(a.mode&0o022n)===0n&&a.size>0n&&a.size<=BigInt(max),'PROTECTED_AUTHORITY_REQUIRED');const bytes=await f.readFile(),b=await f.stat({bigint:true}),c=await lstat(path,{bigint:true});need(BigInt(bytes.length)===a.size&&identity(a)===identity(b)&&identity(a)===identity(c),'AUTHORITY_CHANGED');return{bytes,identity:identity(a),value:parseStrictJson(bytes.toString('utf8'))}}finally{await f.close()}
}
export async function loadInstalledRealWindow(envelope,recordSha,source,referenceDirectory,currentRoot){
 const loaded=await protectedFile(FRESH35_INSTALLED_REAL_WINDOW_PATH),a=loaded.value,s=describeFresh35CombinedSource(source);
 need(s.currentSourcePins.some(p=>p.path===ownPath&&p.sha256===ownHash),'LOADED_WINDOW_SOURCE_DIFFERS');
 const service=await protectedFile(a?.serviceReceipt?.path);need(hash(service.bytes)===a.serviceReceipt.sha256,'SERVICE_RECEIPT_CHANGED');
 validateInstalledRealWindow(a,envelope,recordSha,s.sourceSetSha256,service.value);
 need(a.installedSourceRoot!==currentRoot,'INDEPENDENT_INSTALLED_SOURCE_REQUIRED');await assertTrustedRootTree(a.installedSourceRoot);
 const oldModule=async name=>import(pathToFileURL(resolve(a.installedSourceRoot,'scripts/release/unified-install/'+name)).href);
 const sm=await oldModule('fresh35-combined-source-v1.mjs'),tm=await oldModule('fresh35-combined-target-v1.mjs'),cm=await oldModule('fresh35-combined-catalog-v1.mjs'),lm=await oldModule('fresh35-combined-lifecycle-v1.mjs'),rm=await oldModule('fresh35-combined-record-v1.mjs');
 const historicalEnvelope=await rm.loadFresh35CombinedRecordEnvelope(),snap=rm.describeFresh35ProtectedRecordSnapshot(historicalEnvelope);need(snap.sha256===recordSha,'INSTALLED_RECORD_GENERATION_DIFFERS');
 const paths=await sm.resolveFresh35ReferenceInputPaths(referenceDirectory),oldSource=await sm.loadFresh35CombinedSource(a.installedSourceRoot,paths),target=await tm.reconstructFresh35InstalledProductionTargetV2(historicalEnvelope),catalog=await cm.buildFresh35CombinedCatalog(oldSource,target,paths),program=await lm.compileFresh35CombinedProgram({source:oldSource,target,catalog});
 const record=rm.validateFresh35CombinedRecord(historicalEnvelope,program);need(sm.describeFresh35CombinedSource(oldSource).sourceSetSha256===a.installation.sourceSetSha256,'ACTUAL_INSTALLED_SOURCE_DIFFERS');
 const token=Object.freeze({profile:'FRESH35_INSTALLED_REAL_WINDOW_V1'});
 const current=async()=>{need(Date.now()>=a.startsAt&&Date.now()<a.expiresAt,'OPERATION_WINDOW_EXPIRED');need(identity(await lstat(FRESH35_INSTALLED_REAL_WINDOW_PATH,{bigint:true}))===loaded.identity&&identity(await lstat(a.serviceReceipt.path,{bigint:true}))===service.identity,'AUTHORITY_CHANGED');await sm.assertFresh35CombinedSourcesCurrent(oldSource);await cm.assertFresh35CombinedCatalogCurrent(catalog);await rm.assertFresh35ProtectedRecordSnapshotCurrent(historicalEnvelope);};
 tokens.set(token,Object.freeze({value:freeze(structuredClone(a)),program,record,validateRecord:rm.validateFresh35CombinedRecord,modelSha256:cm.describeFresh35CombinedCatalog(catalog).modelSha256,parametersSha256:hash(loaded.bytes),current}));await current();return token;
}
export function installedRealWindowData(token,target){const s=tokens.get(token);need(s,'GENUINE_WINDOW_REQUIRED');if(target)need(hash(JSON.stringify(target))===s.value.installation.targetSha256,'EXACT_INSTALLED_TARGET_REQUIRED');return s;}
export async function assertInstalledRealWindowCurrent(token){await installedRealWindowData(token).current()}
export function assertInstalledRealBinding(token,binding){const a=installedRealWindowData(token).value;need(exact(binding,FRESH35_REAL_BINDING_KEYS)&&binding.format==='FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1'&&Object.keys(a.installation).every(k=>binding[k]===a.installation[k])&&binding.manifestSha256===a.manifestSha256,'EXACT_REAL_BINDING_DIFFERS')}
