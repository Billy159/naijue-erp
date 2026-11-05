import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
import {parseStrictJson,decodeUtf8} from '../packages/application/src/unified-import-contract.ts';
import {bindFresh35CombinedProductionTargetV2,bindFresh35CombinedTarget,describeFresh35CombinedTarget} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {productionClientOptions,productionEntryFailure,main as actualMain} from '../scripts/release/unified-install/fresh35-production-entry-v2.mjs';

const entryURL=new URL('../scripts/release/unified-install/fresh35-production-entry-v2.mjs',import.meta.url),source=await readFile(entryURL,'utf8');
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const root='/opt/naijue-erp/fresh35-combined-v1',authority='/etc/naijue-erp/fresh35-production-entry-v2.json';
const prelude=source.split('\n').filter(l=>l.startsWith('const need=')||l.startsWith('const keys=')||l.startsWith('const identity=')).join('\n');
function targetInput(){
 const now=Date.now();
 return {purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{database:'approved_erp',owner:'approved_owner',controller:'approved_controller',runtime:'approved_runtime',admin:'approved_admin',host:'10.0.0.4',port:5432,workspaceDirectory:'/var/lib/naijue-erp/production-new35'},physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011',postmasterStart:new Date(now-500).toISOString().replace('T',' ').replace('Z','+00')},startsAt:now-1000,expiresAt:now+1199000,ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:root+'/reference-inputs'}};
}
const ownerConnection=t=>({host:t.proposal.host,port:t.proposal.port,database:t.proposal.database,user:t.proposal.owner,password:'PRIVATE-FIXTURE-NOT-A-REAL-CREDENTIAL'});

test('production owner client requires genuine V2 exact five-field private connection and retains the original operation reserve',()=>{
 const input=targetInput(),target=bindFresh35CombinedProductionTargetV2(input),config=ownerConnection(input),options=productionClientOptions(target,config);
 assert.equal(options.user,input.proposal.owner);assert.equal(options.host,input.proposal.host);assert.equal(options.ssl,false);assert.equal(options.query_timeout,45000);assert.equal(options.connectionTimeoutMillis,5000);
 assert.equal(productionClientOptions(target,config,input.expiresAt-45001).connectionTimeoutMillis,1);
 for(const mutate of [c=>c.user=input.proposal.runtime,c=>c.host='postgres',c=>c.port=5433,c=>c.database='old_erp',c=>c.password='',c=>c.extra=true]){
  const changed=structuredClone(config);mutate(changed);assert.throws(()=>productionClientOptions(target,changed),/EXACT_PRIVATE_OWNER_CONNECTION/);
 }
 for(const now of [input.startsAt-1,input.expiresAt-45000,input.expiresAt])assert.throws(()=>productionClientOptions(target,config,now),/INSTALL_WINDOW_OR_CLEANUP_RESERVE/);
 assert.throws(()=>productionClientOptions({...target},config),/GENUINE_TARGET/);
 const synthetic={proposal:{...input.proposal,database:'synthetic_fresh35_20261106_r91',host:'127.0.0.1',port:57639,workspaceDirectory:'/tmp/cloud-pg-fresh35-20261106-r91'},physical:input.physical,startsAt:input.startsAt,expiresAt:input.expiresAt};
 for(const key of ['owner','controller','runtime','admin'])synthetic.proposal[key]='fresh35_'+key+'_20261106_r91';
 assert.throws(()=>productionClientOptions(bindFresh35CombinedTarget(synthetic),config),/PRODUCTION_TARGET_REQUIRED/);
 assert.equal(input.ordinary.runtimeLoginValidUntil,null,'service lifetime never replaces the installation window');
});

function privateReaderModel({content='{"fixed":true}',uid=0n,mode=0o100600n,nlink=1n,size,changed=false,grown=false,nonFile=false,readChunk=65537}={}){
 const bytes=Buffer.isBuffer(content)?content:Buffer.from(content),events=[],bound=size??BigInt(bytes.length);let cursor=0,closed=0;
 const stat={dev:1n,ino:2n,uid,mode,nlink,size:bound,mtimeNs:1n,ctimeNs:1n,isFile:()=>!nonFile};
 const body=source.slice(source.indexOf('async function privateText(path){')+'async function privateText(path){'.length,source.indexOf('\n}\n\n/** Connection'));
 const run=new AsyncFunction('path','assertTrustedRootPath','open','lstat','constants','decodeUtf8',prelude+'\n'+body);
 const file={stat:async()=>stat,read:async(buffer,offset,length)=>{
  events.push({offset,length,allocated:buffer.length});const available=grown?Math.max(bytes.length,Number(bound)+100000):bytes.length;
  const count=Math.min(length,readChunk,available-cursor);if(count<=0)return{bytesRead:0};
  buffer.fill(65,offset,offset+count);bytes.copy(buffer,offset,cursor,Math.min(cursor+count,bytes.length));cursor+=count;return{bytesRead:count};
 },close:async()=>closed++};
 return {events,get closed(){return closed},run:()=>run('/fixed/input.json',async p=>events.push(p),async(p,flags)=>{assert.equal(flags,constants.O_RDONLY|constants.O_NOFOLLOW);return file},async()=>changed?{...stat,ino:3n}:stat,constants,decodeUtf8)};
}
test('production protected inputs use root0600 single-link nofollow stable bounded UTF8 reads; growth or replacement never passes',async()=>{
 const good=privateReaderModel({readChunk:2});assert.equal(await good.run(),'{"fixed":true}');assert.equal(good.closed,1);
 for(const options of [{uid:1n},{mode:0o100644n},{nlink:2n},{size:65537n},{size:0n},{nonFile:true},{changed:true},{grown:true},{content:Buffer.from([0xff])}]){
  const m=privateReaderModel(options);await assert.rejects(()=>m.run());assert.equal(m.closed,1);
  assert(m.events.filter(x=>typeof x==='object').every(x=>x.allocated<=65537&&x.length<=65537));
 }
});

async function modeledMain({mode='--execute',mutate,environment={},runtime={},entryPath,extraArg,wrongLoadedModule=false,staleEntry=false,connectFails=false,earlyRunFails=false,installState,publicationFails=false,publicationState='RECORD_DURABLY_PUBLISHED',missingEntryAuthority=false,missingExecutionAuthority=false,changeProof=false,changeSource=false}={}){
 const input=targetInput(),a={format:'FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_V2',decision:'AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_AND_RECORD',sourceSetSha256:'a'.repeat(64),target:input,independentSafetyReviewSha256:'b'.repeat(64),authorizationReference:'MODEL ONLY NOT AN AUTHORIZATION'};
 mutate?.(a);const events=[],output=[];let proofReads=0,clients=0,closed=0;
 const client={_ending:false,_ended:false,connect:async()=>{events.push('connect');if(connectFails)throw Error('PRIVATE CONNECT DETAIL')}};
 const processStub={platform:'linux',getuid:()=>0,geteuid:()=>0,version:'v24.21.0',execPath:'/trusted/node',env:environment,argv:['node',entryPath??root+'/scripts/release/unified-install/fresh35-production-entry-v2.mjs',mode,...(extraArg?['extra']:[])],stdout:{write:v=>output.push(v)},...runtime};
 const program={},completion={};
 const modulePath='scripts/release/unified-install/fresh35-production-entry-v2.mjs';
 const deps={process:processStub,root,modulePath,loadedModuleURL:wrongLoadedModule?'file:///other/entry.mjs':pathToFileURL(join(root,modulePath)).href,loadedEntrySha256:'f'.repeat(64),pathToFileURL,FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH:authority,join,parseStrictJson,
  privateText:async path=>{events.push('read:'+path);if(path===authority){if(missingEntryAuthority)throw Error('EXTERNAL ENTRY AUTHORITY MISSING');proofReads++;return JSON.stringify(changeProof&&proofReads>1?{...a,authorizationReference:'CHANGED'}:a)}assert.equal(path,join(input.proposal.workspaceDirectory,'credentials','owner-connection.json'));return JSON.stringify(ownerConnection(input))},
  assertTrustedRootTree:async p=>events.push('tree:'+p),assertTrustedRootPath:async p=>events.push('path:'+p),
  bindFresh35CombinedProductionTargetV2,describeFresh35CombinedTarget,
  resolveFresh35ReferenceInputPaths:async p=>{events.push('references');return{baselineDirectory:p+'/baseline'}},
  loadFresh35CombinedSource:async()=>{events.push('source');return{}},describeFresh35CombinedSource:()=>({sourceSetSha256:'a'.repeat(64),currentSourcePins:[{path:modulePath,sha256:staleEntry?'0'.repeat(64):'f'.repeat(64)}]}),
  fresh35CombinedBootstrapObserverSql:()=>{events.push('render-bootstrap');return 'BEGIN; SYNTHETIC SQL ONLY; COMMIT;\n'},
  buildFresh35CombinedCatalog:async()=>{events.push('catalog');return{}},compileFresh35CombinedProgram:async()=>{events.push('compile');return program},describeFresh35CombinedProgram:p=>{assert.equal(p,program);return{sourceSetSha256:'a'.repeat(64),targetSha256:'c'.repeat(64),programSha256:'d'.repeat(64)}},
  loadFresh35CombinedAuthorization:async p=>{assert.equal(p,program);events.push('execution-authority');if(missingExecutionAuthority)throw Error('EXTERNAL EXECUTION AUTHORITY MISSING');return{}},
  productionClientOptions,
  assertFresh35CombinedSourcesCurrent:async()=>{events.push('source-current');if(changeSource)throw Error('CURRENT SOURCE CHANGED')},
  loadPgForModel:async()=>({Client:class{constructor(options){clients++;events.push('client');assert.equal(options.user,input.proposal.owner);return client}}}),
  runFresh35CombinedInstall:async args=>{events.push('run');assert.equal(args.client,client);assert.equal(args.program,program);assert.equal(args.journalDirectory,join(input.proposal.workspaceDirectory,'installation-journal'));if(earlyRunFails)throw Error('EARLY NATIVE REFUSAL');client._ending=true;client._ended=true;closed++;if(installState)throw Object.assign(Error('PRIVATE INSTALL DETAIL'),{installState});return completion},
  describeFresh35CombinedCompletion:c=>{assert.equal(c,completion);return{state:'COMMITTED_UNPUBLISHED',program:{sourceSetSha256:'a'.repeat(64),targetSha256:'c'.repeat(64),programSha256:'d'.repeat(64)},catalogSha256:'e'.repeat(64)}},
  publishFresh35CombinedRecord:async c=>{assert.equal(c,completion);assert(client._ended,'original wire must be closed before publication');events.push('publish');if(publicationFails)throw Object.assign(Error('PRIVATE PUBLISH DETAIL'),{installState:'COMMITTED_UNPUBLISHED'});return{state:publicationState,recordSha256:'f'.repeat(64)}},
  closePhysical:async c=>{assert.equal(c,client);events.push('fallback-close');c._ending=true;c._ended=true;closed++}
 };
 const body=source.slice(source.indexOf('export async function main(){')+'export async function main(){'.length,source.indexOf('\n}\n\nexport function productionEntryFailure'))
  .replace("await import('pg')",'await loadPgForModel()');
 const fn=new AsyncFunction(...Object.keys(deps),prelude+'\n'+body);let error;
 try{await fn(...Object.values(deps))}catch(e){error=e}
 return{input,events,output,clients,closed,error};
}

test('production bootstrap/describe are externally bound render-only modes; execution uses original one client/install/publish and never imports or enables business (OS/wire model)',async()=>{
 for(const mode of ['--bootstrap-observer','--describe']){
  const r=await modeledMain({mode});assert.ifError(r.error);assert.equal(r.clients,0);assert.equal(r.output.length,1);assert(!r.events.includes('execution-authority'));assert(!r.events.includes('run'));assert(!r.events.includes('publish'));
  if(mode==='--bootstrap-observer'){assert(!r.events.includes('catalog'));assert.equal(r.output[0],'BEGIN; SYNTHETIC SQL ONLY; COMMIT;\n')}else assert.equal(JSON.parse(r.output[0]).programSha256,'d'.repeat(64));
 }
 const r=await modeledMain();assert.ifError(r.error);assert.equal(r.clients,1);assert.equal(r.closed,1);assert(!r.events.includes('fallback-close'));
 assert(r.events.indexOf('execution-authority')<r.events.indexOf('client'));assert(r.events.indexOf('source-current')<r.events.indexOf('connect'));assert(r.events.indexOf('run')<r.events.indexOf('publish'));
 const receipt=JSON.parse(r.output[0]);assert.equal(receipt.state,'RECORD_DURABLY_PUBLISHED');assert.equal(receipt.recordPublished,true);assert.equal(receipt.hostEnabled,false);assert.equal(receipt.businessVerified,false);assert(!r.output[0].includes('PRIVATE'));
 assert.doesNotMatch(source,/executeWholePackage|streamPreflight|new Pool|createPool|spawn\(|CREATE ROLE|writeFile|writeFileSync/);
});

test('production entry refuses unauthorized format/decision/profile/source, wrong fixed paths/flags/runtime/env and changed evidence before connection (OS model)',async()=>{
 const invalid=[
  {mutate:a=>a.format='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1'},
  {mutate:a=>a.decision='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT'},
  {mutate:a=>a.extra=true},{mutate:a=>a.sourceSetSha256='c'.repeat(64)},
  {mutate:a=>a.target.purpose='SYNTHETIC'},{mutate:a=>a.target.ordinary.referenceDirectory='/other/references'},
  {mutate:a=>a.target.expiresAt=a.target.startsAt+1200001},{mutate:a=>a.target.startsAt-=1200001},
  {mutate:a=>a.independentSafetyReviewSha256='bad'},{mutate:a=>a.authorizationReference=''},
  {entryPath:'/other/entry.mjs'},{mode:'--verify-host'},{extraArg:true},{wrongLoadedModule:true},{staleEntry:true},
  {runtime:{platform:'darwin'}},{runtime:{getuid:()=>1000}},{runtime:{geteuid:()=>1000}},{runtime:{version:'v24.20.0'}},
  {environment:{PGHOST:'elsewhere'}},{environment:{DATABASE_URL:'PRIVATE'}},{environment:{NODE_OPTIONS:'PRIVATE'}},
  {missingEntryAuthority:true},{missingExecutionAuthority:true},{changeProof:true},{changeSource:true}
 ];
 for(const options of invalid){const r=await modeledMain(options);assert(r.error,JSON.stringify(options));assert.equal(r.clients,0);assert.equal(r.output.length,0);assert(!r.events.includes('publish'))}
 for(const mode of ['--bootstrap-observer','--describe']){const r=await modeledMain({mode,changeProof:true});assert(r.error);assert.equal(r.output.length,0);assert.equal(r.clients,0)}
 await assert.rejects(()=>actualMain(),/TRUSTED_ROOT_RUNTIME_REQUIRED|FIXED_ENTRY_REQUIRED/,'real module does not accept the OS/wire model as authority');
});

test('production failure and UNKNOWN never publish or retry and native close has only one owner (OS/wire model)',async()=>{
 for(const options of [{connectFails:true},{earlyRunFails:true},{installState:'ROLLED_BACK'},{installState:'COMMIT_OUTCOME_UNKNOWN'},{installState:'ROLLBACK_UNCONFIRMED'},{publicationFails:true},{publicationState:'PUBLISHED_DURABILITY_UNKNOWN'}]){
  const r=await modeledMain(options);assert(r.error);assert.equal(r.clients,1);assert.equal(r.closed,1);assert.equal(r.output.length,0);assert.equal(r.events.filter(x=>x==='run').length,options.connectFails?0:1);
  if(options.publicationState)assert.equal(productionEntryFailure(r.error).exitCode,2,'a non-durable publication must retain unknown/unpublished exit semantics');
  assert.equal(r.events.filter(x=>x==='fallback-close').length,options.connectFails||options.earlyRunFails?1:0);
  if(!options.publicationFails&&!options.publicationState)assert(!r.events.includes('publish'));
 }
});

test('production diagnostics have only the original finite safe fields and explicit no-retry unknown/unpublished exits',()=>{
 for(const state of ['NOT_STARTED','ROLLED_BACK','COMMIT_OUTCOME_UNKNOWN','ROLLBACK_UNCONFIRMED','COMMITTED_UNPUBLISHED','PUBLISHED_DURABILITY_UNKNOWN']){
  const result=productionEntryFailure(Object.assign(Error('PRIVATE SQL AND CREDENTIAL'),{installState:state,detail:'PRIVATE DETAIL'}));
  assert.equal(result.exitCode,['NOT_STARTED','ROLLED_BACK'].includes(state)?1:2);
  assert.equal(Object.keys(result.receipt).length,12);assert.equal(result.receipt.automaticRetry,false);assert.equal(result.receipt.installState,state);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|DETAIL|message|stack/);
 }
 assert.equal(productionEntryFailure({installState:'PRIVATE',code:'PRIVATE'}).receipt.installState,null);
});

test('production entry is included by the genuine current-source loader with its actual bytes (source only, no target/data/PG)',async()=>{
 const {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource,describeFresh35CombinedSource,combinedSha256}=await import('../scripts/release/unified-install/fresh35-combined-source-v1.mjs');
 const checkout=fileURLToPath(new URL('../',import.meta.url)),paths=await resolveFresh35ReferenceInputPaths(fileURLToPath(new URL('../../reference-inputs',import.meta.url)));
 const descriptor=describeFresh35CombinedSource(await loadFresh35CombinedSource(checkout,{baselineDirectory:paths.baselineDirectory}));
 for(const path of ['scripts/release/unified-install/fresh35-production-entry-v2.mjs','scripts/release/unified-install/fresh35-isolated-entry-v1.mjs','scripts/release/unified-install/fresh35-combined-source-v1.mjs']){
  const pins=descriptor.currentSourcePins.filter(p=>p.path===path);assert.equal(pins.length,1);assert.equal(pins[0].sha256,combinedSha256(await readFile(join(checkout,path))));
 }
});
