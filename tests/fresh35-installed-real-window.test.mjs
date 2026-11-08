import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let serial=0;
// Run the actual loader/current closure with modeled protected OS files and
// historical installation modules. Native root FD/process proof behavior is
// tested separately in fresh35-retained-backends; this model grants no authority.
async function model(previousStopReceiptSha256,delayedOperation=false){
 const original=await readFile(new URL('../scripts/release/unified-install/fresh35-installed-real-window-v1.mjs',import.meta.url),'utf8');
 const now=Date.now(),etc=process.platform==='darwin'?'/private/etc':'/etc',base=etc+'/naijue-erp/',recordSha='a7d12f1f21f730c0e0c19dd6136c501c74d43e0e866e62d2f51aa908ea4f970f';
 const stamp=n=>new Date(n).toISOString().replace('T',' ').replace('Z','+00');
 const physical={systemIdentifier:'123456789',databaseOid:'42',serverVersionNum:'170011',postmasterStart:stamp(now-600000)};
 const target={startsAt:now-700000,physical,proposal:{workspaceDirectory:'/model/installed'},ordinary:{runtimeLoginValidUntil:null}};
 const record={format:'FRESH35_COMBINED_INSTALLATION_RECORD_V2',state:'COMMITTED_AND_CATALOG_CHECKED',target,programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),binding:{sourceSetSha256:'3'.repeat(64),targetSha256:hash(JSON.stringify(target))}};
 const data={device:1,inode:2,uid:61035,gid:61035,mode:0o700};
 const restart={format:'FRESH35_RETAINED_RESTART_OBSERVATION_V1',state:'SAME_DATA_RESTART_OBSERVED_NOT_BUSINESS_VERIFIED',installationRecordSha256:recordSha,...record.binding,oldPhysical:physical,newPhysical:{...physical,postmasterStart:stamp(now-(delayedOperation?246741:1000))},dataDirectory:'/model/installed/data',dataDirectoryBefore:data,dataDirectoryAfter:{...data},previousStopReceiptSha256,restartAuthorizationSha256:'4'.repeat(64),authorizationReference:'MODEL CURRENT OPERATION',checkedAt:now-(delayedOperation?245741:500),serviceLeaseExpiresAt:now+120000};
 const service={state:'DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE',recordSha256:recordSha,sourceSetSha256:record.binding.sourceSetSha256,target,hostEnabled:false,businessVerified:false,serviceLease:{expiresAt:restart.serviceLeaseExpiresAt,onSuccess:'RETAIN_EXACT_TARGET_UNTIL_SERVICE_DEADLINE',onFailure:'STOP_EXACT_TARGET_PRESERVE_DATA'}};
 const operation={format:'FRESH35_INSTALLED_REAL_OPERATION_PARAMETERS_V1',installedSourceRoot:'/model/installed',currentSourceSetSha256:'5'.repeat(64),installation:{installationRecordSha256:recordSha,installProgramSha256:record.programSha256,sourceSetSha256:record.binding.sourceSetSha256,targetSha256:record.binding.targetSha256,catalogSha256:record.catalogSha256},manifestSha256:'6'.repeat(64),startsAt:now-2000,expiresAt:now+60000,authorizationExpiresAt:now+90000,serviceReceipt:{path:base+'fresh35-retained-service-v1.json',sha256:hash(JSON.stringify(service))},controllerLoginValidUntil:new Date(now+60000).toISOString(),adminLoginValidUntil:new Date(now+90000).toISOString(),authorizationReference:restart.authorizationReference,restartReceipt:{path:base+'fresh35-retained-restart-v1.json',sha256:hash(JSON.stringify(restart))}};
 const initial={serial:++serial,original,record,recordSha,operation,service,restart,base,ownHash:hash(original)};
 const stateURL=stub(`import {createHash} from 'node:crypto';export const state=${JSON.stringify(initial)};
 export const combinedSha256=b=>createHash('sha256').update(b).digest('hex');
 export const files=new Map();let version=0;export const counters={fd:0,current:0};
 export function put(path,bytes){files.set(path,{bytes:Buffer.from(bytes),version:++version,uid:0n})}
 export function refresh(){put(state.base+'fresh35-retained-service-v1.json',JSON.stringify(state.service));put(state.base+'fresh35-retained-restart-v1.json',JSON.stringify(state.restart));state.operation.serviceReceipt.sha256=combinedSha256(files.get(state.operation.serviceReceipt.path).bytes);state.operation.restartReceipt.sha256=combinedSha256(files.get(state.operation.restartReceipt.path).bytes);put(state.base+'fresh35-installed-real-window-v1.json',JSON.stringify(state.operation));state.expectedFD={operationParametersSha256:combinedSha256(files.get(state.base+'fresh35-installed-real-window-v1.json').bytes),restartReceiptSha256:state.operation.restartReceipt.sha256};}refresh();
 const stat=e=>({isFile:()=>true,uid:e.uid,dev:1n,ino:BigInt(e.version),mode:0o100644n,nlink:1n,size:BigInt(e.bytes.length),mtimeNs:BigInt(e.version),ctimeNs:BigInt(e.version)});
 export async function lstat(path){if(!files.has(path))throw Error('MODEL_MISSING_FILE');return stat(files.get(path))}
 export async function open(path){const e=files.get(path);if(!e)throw Error('MODEL_MISSING_FILE');return{stat:async()=>stat(e),readFile:async()=>Buffer.from(e.bytes),close:async()=>{}}}
 export async function readFile(){return Buffer.from(state.original)}
 export async function assertTrustedRootPath(path){if(path!==state.operation.installedSourceRoot&&!files.has(path))throw Error('MODEL_UNTRUSTED_PATH')}
 export async function assertTrustedRootTree(path){if(path!==state.operation.installedSourceRoot)throw Error('MODEL_UNTRUSTED_TREE')}
 export function describeFresh35CombinedSource(s){return{sourceSetSha256:s.old?state.record.binding.sourceSetSha256:state.operation.currentSourceSetSha256,currentSourcePins:[{path:'scripts/release/unified-install/fresh35-installed-real-window-v1.mjs',sha256:state.ownHash},{path:FRESH35_RETAINED_BACKENDS_PATH,sha256:FRESH35_RETAINED_BACKENDS_MODULE_SHA256}]}}
 export const FRESH35_RETAINED_BACKENDS_PATH='scripts/release/unified-install/fresh35-retained-backends-v1.mjs',FRESH35_RETAINED_BACKENDS_MODULE_SHA256='e'.repeat(64);
 export async function loadRetainedBackendProof(b){counters.fd++;if(b.operationParametersSha256!==state.expectedFD.operationParametersSha256||b.restartReceiptSha256!==state.expectedFD.restartReceiptSha256||b.installationRecordSha256!==state.recordSha||b.currentSourceSetSha256!==state.operation.currentSourceSetSha256)throw Error('MODEL_FD_WRONG_PROVENANCE');return{backends:[],async current(){counters.current++;if(state.fdRevoked)throw Error('MODEL_FD_REVOKED')}}}
 const current=async()=>{if(state.oldChanged)throw Error('MODEL_OLD_INSTALLATION_CHANGED')};
 export async function modelOldModule(name){return{
 'fresh35-combined-source-v1.mjs':{resolveFresh35ReferenceInputPaths:async()=>({}),loadFresh35CombinedSource:async()=>({old:true}),describeFresh35CombinedSource,assertFresh35CombinedSourcesCurrent:current},
 'fresh35-combined-target-v1.mjs':{reconstructFresh35InstalledProductionTargetV2:async()=>state.record.target},
 'fresh35-combined-catalog-v1.mjs':{buildFresh35CombinedCatalog:async()=>({}),assertFresh35CombinedCatalogCurrent:current,describeFresh35CombinedCatalog:()=>({modelSha256:'7'.repeat(64)})},
 'fresh35-combined-lifecycle-v1.mjs':{compileFresh35CombinedProgram:async()=>({})},
 'fresh35-combined-record-v1.mjs':{loadFresh35CombinedRecordEnvelope:async()=>state.record,describeFresh35ProtectedRecordSnapshot:()=>({sha256:state.recordSha}),validateFresh35CombinedRecord:()=>state.record,assertFresh35ProtectedRecordSnapshotCurrent:current}
 }[name]}
 `);
 const m=await import(stateURL);let source=original;
 for(const path of ['node:fs/promises','./trusted-install-path.mjs','./fresh35-combined-source-v1.mjs','./fresh35-retained-backends-v1.mjs'])source=source.replaceAll(`from '${path}'`,`from '${stateURL}'`);
 source=source.replace("const oldModule=async name=>import(pathToFileURL(resolve(a.installedSourceRoot,'scripts/release/unified-install/'+name)).href);",'const oldModule=modelOldModule;');
 source=`import {modelOldModule} from '${stateURL}';\n`+source;
 source=source.replace(/from '([.][^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL(path,new URL('../scripts/release/unified-install/fresh35-installed-real-window-v1.mjs',import.meta.url)).href));
 const api=await import(stub(source));
 return{...m,api,load:()=>api.loadInstalledRealWindow(m.state.record,m.state.recordSha,{},'/model/references','/model/current','t45-r4-real-inspect-20261108-01')};
}
const currentStop='f2c89b10927ae1a013c370c96415212bc65eebfcceb772e8d109cf2efc128001';
test('current and next synthetic predecessor pass only through their exact protected operation/receipt binding (OS model)',async()=>{
 for(const digest of [currentStop,'9'.repeat(64)]){const m=await model(digest),token=await m.load();assert.equal(m.api.installedRealWindowData(token).currentPostmasterStart,m.state.restart.newPhysical.postmasterStart);assert.equal(m.counters.fd,1);await m.api.assertInstalledRealWindowCurrent(token);assert(m.counters.current>=2);}
});
test('changed predecessor or raw restart bytes cannot reuse the original operation pin (OS model)',async()=>{
 for(const mutate of [m=>JSON.stringify({...m.state.restart,previousStopReceiptSha256:'8'.repeat(64)}),m=>JSON.stringify(m.state.restart)+'\n']){const m=await model(currentStop);m.put(m.state.operation.restartReceipt.path,mutate(m));await assert.rejects(m.load(),/RESTART_RECEIPT_CHANGED/);assert.equal(m.counters.fd,0);}
});
test('even exactly pinned restart rejects wrong record, target, source, PGDATA, epoch, reference or lifetime (OS model)',async()=>{
 for(const mutate of [s=>s.restart.installationRecordSha256='0'.repeat(64),s=>s.restart.targetSha256='0'.repeat(64),s=>s.restart.sourceSetSha256='0'.repeat(64),s=>s.restart.dataDirectoryAfter.inode++,s=>s.restart.newPhysical.databaseOid='99',s=>s.restart.newPhysical.postmasterStart=s.restart.oldPhysical.postmasterStart,s=>s.restart.authorizationReference='WRONG',s=>s.restart.checkedAt=Date.now()+60000,s=>s.restart.serviceLeaseExpiresAt--,s=>s.operation.expiresAt=Date.now()-1]){const m=await model(currentStop);mutate(m.state);m.refresh();await assert.rejects(m.load());assert.equal(m.counters.fd,0);}
});
test('current window rejects late receipt/operation/service replacements and revoked FD proof (OS model)',async()=>{
 for(const leaf of ['fresh35-retained-restart-v1.json','fresh35-installed-real-window-v1.json','fresh35-retained-service-v1.json']){const m=await model(currentStop),token=await m.load(),path=m.state.base+leaf;m.put(path,m.files.get(path).bytes);await assert.rejects(m.api.assertInstalledRealWindowCurrent(token),/RESTART_RECEIPT_CHANGED|AUTHORITY_CHANGED/);}
 const m=await model(currentStop),token=await m.load();m.state.fdRevoked=true;await assert.rejects(m.api.assertInstalledRealWindowCurrent(token),/MODEL_FD_REVOKED/);
});

test('independent current operation can start after its exactly pinned retained restart (OS model)',async()=>{
 const m=await model(currentStop,true);assert.equal(m.state.operation.startsAt-m.state.restart.checkedAt,243741);
 const token=await m.load();assert.equal(m.api.installedRealWindowData(token).currentPostmasterStart,m.state.restart.newPhysical.postmasterStart);await m.api.assertInstalledRealWindowCurrent(token);assert.equal(m.counters.fd,1);
 // A later operation still requires the exact original root-proof binding.
 m.state.expectedFD.operationParametersSha256='0'.repeat(64);await assert.rejects(m.load(),/MODEL_FD_WRONG_PROVENANCE/);
});
