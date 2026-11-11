/** Offline wire/authority model only. No pg client, database or publisher. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateFresh35Admin154Record,ADMIN154_PREDECESSOR_RECORD_SHA256,ADMIN154_PREDECESSOR_SOURCE_SHA256,ADMIN154_PATCH_SHA256} from '../scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
const text=await readFile(new URL('../tools/unified-import/fresh35-baseline-scope-upgrade.mjs',import.meta.url),'utf8');
// Private copy of the real driver, without exporting a model seam in production.
const model=await import('data:text/javascript;base64,'+Buffer.from(text+'\nexport {driveUpgrade,patchBody,physicalSql,receiptSql,provisionSql,assertSameMaintenanceParentEpoch};').toString('base64'));
const sql=await readFile(new URL('../adapters/postgres/patches/0036_admin_provision_only_successor.sql',import.meta.url),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('upgrade production module exposes only its fixed entry and refuses missing operator seams before any connection work',async()=>{
 const actual=await import('../tools/unified-import/fresh35-baseline-scope-upgrade.mjs');assert.deepEqual(Object.keys(actual),['describeFresh35BaselineScopeUpgrade','runFresh35BaselineScopeUpgrade']);
 await assert.rejects(actual.runFresh35BaselineScopeUpgrade({}),/EXACT_PHASE_REQUIRED/);
});
test('SQL38 same maintenance parent epoch accepts trailing zeros but rejects a different PostgreSQL microsecond or old epoch',()=>{
 const check=model.assertSameMaintenanceParentEpoch,stamp=f=>'2026-11-11 01:00:00'+f+'+00';
 for(const [parent,current] of [['.123450','.12345'],['.12345','.123450'],['','.000000'],['.1','.100000'],['.123456','.123456']])assert.doesNotThrow(()=>check(stamp(parent),stamp(current)));
 for(const [parent,current] of [['.123449','.12345'],['.123451','.12345'],['.000001',''],['.1234500','.12345'],['.12345','.1234500']])assert.throws(()=>check(stamp(parent),stamp(current)),/SAME_MAINTENANCE_PARENT_EPOCH_REQUIRED/);
 assert.throws(()=>check('2026-11-10 01:00:00.123450+00',stamp('.12345')),/SAME_MAINTENANCE_PARENT_EPOCH_REQUIRED/);
});
function fixture(fault){
 const expected={predecessor:{recordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)},
  successor:{patchSqlSha256:ADMIN154_PATCH_SHA256,sourceSetSha256:'4'.repeat(64),catalogSpecSha256:'5'.repeat(64),modelSha256:'6'.repeat(64)},
  physical:{systemIdentifier:'7703999999999999999',databaseOid:'42',database:'SYNTHETIC_MODEL_ONLY',serverVersionNum:'170011',postmasterStart:'2026-11-11 01:00:00.123456+00'},owner:'SYNTHETIC_OWNER'};
 const t={proposal:{host:'127.0.0.1',port:57639,database:expected.physical.database}},binding={authorizationSha256:'7'.repeat(64),expiresAt:Date.now()+120000},calls=[],events=[],closed=[];
 const ddl={id:'DDL'},reader={id:'READBACK'};let opened=0,committed=false,authorityCalls=0;
 const p={phase:'SQL36',recordFormat:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',t,expected,binding,body:model.patchBody(sql,'SQL36'),parse:JSON.parse,predecessorSql:{guardSql:'SYNTHETIC152_GUARD'},successorSql:{guardSql:'SYNTHETIC154_GUARD',observationSql:'SYNTHETIC_OBSERVE'},
  validateRecord:r=>validateFresh35Admin154Record(r,expected),validateCatalog:raw=>{assert.equal(JSON.parse(raw).catalog,'SYNTHETIC154');},
  async current(){authorityCalls++;if(fault==='authority')throw Error('BASELINE_UPGRADE_EXACT_AUTHORITY_CHANGED');}};
 const io={client:ddl,nonce:()=> '8'.repeat(48),now:()=> '2026-11-11T01:00:02.000001Z',
  async emit(e){events.push(e);if(fault==='postcommitJournal'&&e.state==='COMMITTED_UNPUBLISHED')throw Error('SYNTHETIC JOURNAL FAILURE');},
  async close(c){closed.push(c.id);if(fault===c.id+'Close')throw Error('SYNTHETIC CLOSE FAILURE');},
  async openReadback(){assert.deepEqual(closed,['DDL'],'original connection closes before new connection');opened++;if(fault==='connect')throw Error('SYNTHETIC CONNECT UNKNOWN');return reader;},
  async rollbackReady(c){calls.push([c.id,'READY_FOR_ROLLBACK']);},
  async query(c,q,values){calls.push([c.id,q]);
   if(q.startsWith('BEGIN'))return {command:'BEGIN'};
   if(q===model.physicalSql){const packet={...expected.physical,actor:expected.owner,currentUser:expected.owner,host:t.proposal.host,port:t.proposal.port,backendPid:c===ddl?101:202,sameEpoch:fault!=='epoch',safeOwner:true,origin:true,recovery:false,readOnly:c===reader?'on':'off',isolation:c===reader?'repeatable read':'read committed'};if(fault==='owner')packet.actor='SYNTHETIC_OTHER';return {command:'SELECT',rows:[{physical_json:JSON.stringify(packet)}]};}
   if(q==='SYNTHETIC152_GUARD'){if(fault==='predecessor')throw Error('SYNTHETIC152 MISMATCH');return {command:'DO'};}
   if(q===p.body){if(['sql36','rollback'].includes(fault))throw Error('SYNTHETIC DDL ERROR');return [{command:'SET'},{command:'DO'}];}
   if(q==='SYNTHETIC154_GUARD'){if((fault==='readback'&&c===reader)||(fault==='precommit'&&c===ddl))throw Error('SYNTHETIC154 MISMATCH');return {command:'DO'};}
   if(q==='SYNTHETIC_OBSERVE')return {command:'SELECT',rows:[{catalog_json:JSON.stringify({catalog:'SYNTHETIC154',connection:c.id})}]};
   if(q===model.receiptSql)return {command:'SELECT',rows:[{upgrade_receipt:JSON.stringify({nonce:values[0],database:expected.physical.database,actor:expected.owner,transactionId:'913',backendPid:fault==='receipt'?999:101})}]};
   if(q==='COMMIT'){committed=true;if(fault==='commit')throw Error('SYNTHETIC COMMIT ACK LOST');return {command:'COMMIT'};}
   if(q==='ROLLBACK'){if(fault==='rollback')throw Error('SYNTHETIC ROLLBACK ACK LOST');return {command:'ROLLBACK'};}
   throw Error('UNEXPECTED MODEL SQL');
  }};
 return {p,io,calls,closed,events,get opened(){return opened},get committed(){return committed},get authorityCalls(){return authorityCalls}};
}
test('upgrade exactSQL36 split retains every byte except its outer transaction and refuses mutation',()=>{
 const body=model.patchBody(sql,'SQL36');assert.equal(hash(sql),ADMIN154_PATCH_SHA256);assert.equal(body,sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length));
 assert.throws(()=>model.patchBody(sql+' ','SQL36'),/EXACT_SQL_REQUIRED/);
 assert.throws(()=>model.patchBody(sql.replace('BEGIN;','BEGIN;\nCOMMIT;'),'SQL36'),/EXACT_SQL_REQUIRED/);
});
test('upgrade success captures the sameDDL receipt and returns a real-validator record only after separate new connection readback and both closes',async()=>{
 const f=fixture(),r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'COMMITTED_UNPUBLISHED');assert.equal(r.catalogReadback,'VERIFIED');assert.equal(r.recordPublished,false);
 assert.deepEqual(f.closed,['DDL','READBACK']);assert.equal(f.opened,1);assert.equal(r.record.transactionReceipt.backendPid,101);assert.equal(r.record.transactionReceipt.transactionId,'913');
 assert.equal(r.record.successor.catalogSha256,hash(JSON.stringify({catalog:'SYNTHETIC154',connection:'READBACK'})));assert.equal(r.recordSha256,hash(r.recordJson));assert.deepEqual(JSON.parse(r.recordJson),r.record);
 assert.equal(f.calls.filter(x=>x[1]==='COMMIT').length,1);assert.equal(f.calls.filter(x=>x[0]==='READBACK'&&x[1]==='ROLLBACK').length,1);assert(f.authorityCalls>=5);
 assert(f.events.findIndex(e=>e.state==='PRECOMMIT_CATALOG_CHECKED')<f.events.findIndex(e=>e.state==='COMMIT_PENDING'));
 assert.throws(()=>validateFresh35Admin154Record({...r.record,transactionReceipt:{...r.record.transactionReceipt,actor:'OTHER'}},f.p.expected),/NATIVE_RECEIPT_REQUIRED/);
});
test('upgrade refuses authority, physical/owner, predecessor, DDL, catalog and receipt faults before COMMIT and releases its only connection',async()=>{
 for(const fault of ['authority','epoch','owner','predecessor','sql36','precommit','receipt']){
  const f=fixture(fault),r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,fault==='authority'?'NOT_STARTED':'ROLLED_BACK',fault);assert.equal(r.record,undefined);assert.equal(f.opened,0);assert.deepEqual(f.closed,['DDL']);assert.equal(f.committed,false);assert.equal(r.automaticRetry,false);
 }
});
test('upgrade lostCOMMIT confirmation never rolls back, replays DDL, opens a readback or returns a publishable record',async()=>{
 const f=fixture('commit'),r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'COMMIT_OUTCOME_UNKNOWN');assert.equal(r.record,undefined);assert.equal(f.opened,0);assert.deepEqual(f.closed,['DDL']);
 assert.equal(f.calls.filter(x=>x[1]===f.p.body).length,1);assert.equal(f.calls.filter(x=>x[1]==='ROLLBACK').length,0);
});
test('upgrade failedROLLBACK acknowledgement is never reported as an acknowledged rollback',async()=>{
 const f=fixture('rollback'),r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'ROLLBACK_UNCONFIRMED');assert.equal(r.record,undefined);assert.equal(f.committed,false);assert.equal(f.opened,0);assert.deepEqual(f.closed,['DDL']);assert.equal(f.calls.filter(x=>x[1]==='ROLLBACK').length,1);
});
test('upgrade postCOMMIT journal/readback/connect/close failures remain committed-unpublished and never return a record',async()=>{
 for(const fault of ['postcommitJournal','readback','connect','DDLClose','READBACKClose']){
  const f=fixture(fault),r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'COMMITTED_UNPUBLISHED',fault);assert.equal(r.record,undefined);assert.equal(f.committed,true);assert.equal(f.calls.filter(x=>x[0]==='DDL'&&x[1]==='ROLLBACK').length,0);
  assert.equal(f.closed.filter(x=>x==='DDL').length,1);assert.equal(f.closed.filter(x=>x==='READBACK').length,fault==='readback'||fault==='READBACKClose'?1:0);
  assert.equal(r.connectionCleanup,['connect','DDLClose','READBACKClose'].includes(fault)?'UNKNOWN':'CLOSED');
 }
});


test('SQL38 raw patch is exact, A committed origin is checked before DDL and a mismatch rolls back without a candidate',async()=>{
 const patch=await readFile(new URL('../adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql',import.meta.url),'utf8');assert.ok(model.patchBody(patch,'SQL38'));assert.throws(()=>model.patchBody(patch,'SQL36'),/EXACT_SQL_REQUIRED/);
 const f=fixture();f.p.phase='SQL38';f.p.body=model.patchBody(patch,'SQL38');f.p.provisionOrigin={operation_id:'11000000-0000-0000-0000-000000000001',request_sha256:'a'.repeat(64)};f.p.provisionValues=['actual-origin','actual-hash','{}'];const query=f.io.query;f.io.query=async(c,q,v)=>q===model.provisionSql?{command:'SELECT',rows:[{provision_origin:JSON.stringify({...f.p.provisionOrigin,request_sha256:'b'.repeat(64)})}]}:query(c,q,v);
 const r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'ROLLED_BACK');assert.equal(r.record,undefined);assert.equal(f.committed,false);assert.ok(!f.calls.some(c=>c[1]===f.p.body));assert.deepEqual(f.closed,['DDL']);
});

test('SQL38 matching committed A proceeds to real successor validation only after independent readback; re-used backend is rejected',async()=>{
 const {validateFresh35CompactZeroRecord}=await import('../scripts/release/unified-install/fresh35-admin154-record-v1.mjs');
 for(const reused of [false,true]){const f=fixture();f.p.phase='SQL38';f.p.body=model.patchBody(await readFile(new URL('../adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql',import.meta.url),'utf8'),'SQL38');f.p.recordFormat='FRESH35_COMPACT_ZERO_SUCCESSOR_RECORD_V2';f.p.expected.predecessor=Object.fromEntries(['recordSha256','sourceSetSha256','catalogSpecSha256','modelSha256','catalogSha256'].map(k=>[k,'1'.repeat(64)]));f.p.validateRecord=r=>validateFresh35CompactZeroRecord(r,f.p.expected);f.p.provisionOrigin={operation_id:'11000000-0000-0000-0000-000000000001',request_sha256:'a'.repeat(64)};f.p.provisionValues=['actual-op','actual-request','{}'];const query=f.io.query;f.io.query=async(c,q,v)=>{if(q===model.provisionSql)return{command:'SELECT',rows:[{provision_origin:JSON.stringify(f.p.provisionOrigin)}]};const r=await query(c,q,v);if(reused&&c.id==='READBACK'&&q===model.physicalSql){const x=JSON.parse(r.rows[0].physical_json);x.backendPid=101;r.rows[0].physical_json=JSON.stringify(x);}return r;};
 const r=await model.driveUpgrade(f.p,f.io);assert.equal(r.state,'COMMITTED_UNPUBLISHED');assert.equal(Boolean(r.record),!reused);assert.equal(r.catalogReadback,reused?'NOT_VERIFIED':'VERIFIED');assert.deepEqual(f.closed,['DDL','READBACK']);assert.equal(f.calls.filter(c=>c[1]==='COMMIT').length,1);
 }
});

test('complete SQL36/38 public entry retains actual preparation and record validators with explicit source/filesystem/pg models',async()=>{
 const contract=await import('../packages/application/src/unified-import-contract.ts'),records=await import('../scripts/release/unified-install/fresh35-admin154-record-v1.mjs');
 let source=text.replace(/const moduleAt=.*?;\n/,'const moduleAt=async(root,name)=>selected.modules[(root===oldRoot?"old:":"")+name];\n');
 source=source.replace("await import(pathToFileURL(join(o.sourceRoot,'packages/application/src/unified-import-contract.ts')).href)",'selected.contract').replace("await import(pathToFileURL(join(o.sourceRoot,'packages/application/src/request-hash.ts')).href)",'({requestHash:()=>"a".repeat(64)})');
 source=source.replace("const require=createRequire(pathToFileURL(join(o.sourceRoot,'package.json'))),{Client}=require('pg');","const require=n=>n==='pg'?{Client:ModelClient}:{version:'8.23.1'},{Client}=require('pg');");
 source=source.replace("const {closePhysical}=await import(pathToFileURL(join(o.sourceRoot,'tools/unified-import/whole-host-session.mjs')).href);","const closePhysical=c=>c.end();");
 source+=`\nlet selected;class ModelClient{on(){}async end(){return selected.io.close(this)}async query({text,values}){const r=await selected.io.query(this,text,values);this._txStatus=text==='COMMIT'||text==='ROLLBACK'?'I':'T';return r;}}
 export function seed(f){selected=f;return async()=>{const c=++f.opens===1?f.io.client:await f.io.openReadback();Object.setPrototypeOf(c,ModelClient.prototype);Object.assign(c,{_connected:true,pipeline:false,readyForQuery:!(f.badReadWire&&f.opens===2),_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],_queryable:true,_ending:false,_ended:false,_txStatus:'I',connectionParameters:{host:f.p.t.proposal.host,port:f.p.t.proposal.port,database:f.p.expected.physical.database,user:f.p.expected.owner,ssl:false}});return c;};}`;
 const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const adminSourceSha='0ba2beef0446879f02dc8a75678a9a2bbb241d6be5bc501fc25057443c1d8c32',appSha='4475fde653955a458420e90e53e57a82a21001e2581db0072f742f9d22d472ad';
 const ad={sourceSetSha256:adminSourceSha,patchSqlSha256:ADMIN154_PATCH_SHA256,catalogSpecSha256:'8f03acec34ddbc2c5c58b3b177d264932c248d5f193da39ba60ae580b95706cd',modelSha256:'6'.repeat(64),predecessorModelSha256:'b'.repeat(64)};
 const d={sourceSetSha256:appSha,patchSqlSha256:'d296a2a2fc180f79ff3991e0c52b61d826569711415131680294aa2a65623310',catalogSpecSha256:'c8c7148c94f746944a166f7623abc93347b05594285318faba5d1eb42002bcee',modelSha256:'9'.repeat(64)};
 const patch38=await readFile(new URL('../adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql',import.meta.url),'utf8');
 for(const phase of ['SQL36','SQL38'])for(const fault of ['none','authority','badReader','commit','postcommitJournal','parentEpoch','aProof','priorArtifact']){
  if(phase==='SQL36'&&['parentEpoch','aProof'].includes(fault))continue;
  const f=fixture(['authority','commit','postcommitJournal'].includes(fault)?fault:undefined);f.contract=contract;f.opens=0;f.badReadWire=fault==='badReader';f.p.t.purpose='PRODUCTION_NEW_EMPTY_EXACT35';f.p.t.proposal.owner=f.p.expected.owner;f.p.t.proposal.database='erp_fresh35_20261110_r3';f.p.expected.physical.database=f.p.t.proposal.database;f.p.t.physical=f.p.expected.physical;f.p.t.ordinary={referenceDirectory:'/SYNTHETIC'};
  const oldRecord={binding:{sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,targetSha256:'3'.repeat(64)},programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64)},envelope={binding:{sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256}};
  const no=async()=>{},parentSha='c'.repeat(64),adminExpected={...f.p.expected,successor:{patchSqlSha256:ad.patchSqlSha256,sourceSetSha256:ad.sourceSetSha256,catalogSpecSha256:ad.catalogSpecSha256,modelSha256:ad.modelSha256}};
  const parent={format:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',predecessor:adminExpected.predecessor,successor:{...adminExpected.successor,catalogSha256:'2'.repeat(64)},physical:{...adminExpected.physical,...(fault==='parentEpoch'?{postmasterStart:'2026-11-10 01:00:00.123456+00'}:{})},appliedAt:'2026-11-11T01:00:02Z',authorizationSha256:'a'.repeat(64),transactionReceipt:{nonce:'8'.repeat(48),database:f.p.expected.physical.database,actor:f.p.expected.owner,backendPid:101,transactionId:'913'}};
  const origin={operation_id:'11000000-0000-0000-0000-000000000001',request_sha256:'a'.repeat(64)},query=f.io.query;
  f.io.query=async(c,q,v)=>q===model.provisionSql?{command:'SELECT',rows:[{provision_origin:JSON.stringify({...origin,...(fault==='aProof'?{request_sha256:'0'.repeat(64)}:{})})}]}:query(c,q,v);
  if(phase==='SQL38'){f.p.body=model.patchBody(patch38,phase);f.p.expected.successor={patchSqlSha256:d.patchSqlSha256,sourceSetSha256:d.sourceSetSha256,catalogSpecSha256:d.catalogSpecSha256,modelSha256:d.modelSha256};}
  const catalogs={buildFresh35CompactZeroCatalog:async()=> 'final',fresh35CompactZeroParentCatalog:()=> 'admin',describeFresh35CombinedCatalog:x=>x==='final'?d:ad,fresh35Admin154PredecessorCatalogSql:()=>f.p.predecessorSql,fresh35CombinedCatalogSql:x=>phase==='SQL38'&&x==='admin'?f.p.predecessorSql:f.p.successorSql,validateFresh35CombinedCatalogObservation:raw=>f.p.validateCatalog(raw),assertFresh35CombinedCatalogCurrent:no};
  const recordModules={loadFresh35CombinedRecordEnvelope:async()=>envelope,describeFresh35ProtectedRecordSnapshot:()=>({sha256:ADMIN154_PREDECESSOR_RECORD_SHA256}),assertFresh35ProtectedRecordSnapshotCurrent:no};
  f.modules={'trusted-install-path':{assertTrustedRootTree:no,assertTrustedRootPath:no},'fresh35-combined-source-v1':{resolveFresh35ReferenceInputPaths:async()=>({}),loadFresh35CompactZeroSource:async()=> 'final',describeFresh35CombinedSource:x=>({sourceSetSha256:x==='final'?(fault==='priorArtifact'?'9a58f932aaa462b7646dff472c2b24e88b0690d84cea1f0d7f846ef93036c781':appSha):x==='admin'?adminSourceSha:'35d6ffc35ea9171a8c13a81539ecf7fbec40f441322d4dfdee612b6486b82471',currentSourcePins:Array(x==='final'?(fault==='priorArtifact'?222:223):x==='admin'?220:219)}),fresh35CompactZeroSourceData:()=>({base:'admin',candidate:{patchSql:patch38}}),fresh35Admin154SourceData:()=>({base:'base',candidate:{patchSql:sql}}),assertFresh35CombinedSourcesCurrent:no},'fresh35-combined-target-v1':{reconstructFresh35InstalledProductionTargetV2:async()=>({}),describeFresh35CombinedTarget:()=>f.p.t},'fresh35-combined-catalog-v1':catalogs,'fresh35-combined-record-v1':recordModules,'fresh35-admin154-record-v1':{...records,loadFresh35Admin154Record:async(expected,sha)=>{assert.equal(sha,parentSha);records.validateFresh35Admin154Record(parent,expected);return parent;},describeFresh35Admin154Record:value=>({value,sha256:parentSha}),assertFresh35Admin154RecordCurrent:no},'old:fresh35-combined-source-v1':{resolveFresh35ReferenceInputPaths:async()=>({}),loadFresh35CombinedSource:async()=>({}),assertFresh35CombinedSourcesCurrent:no},'old:fresh35-combined-target-v1':{reconstructFresh35InstalledProductionTargetV2:async()=>({})},'old:fresh35-combined-catalog-v1':{buildFresh35CombinedCatalog:async()=>({}),describeFresh35CombinedCatalog:()=>({modelSha256:ad.predecessorModelSha256}),assertFresh35CombinedCatalogCurrent:no},'old:fresh35-combined-lifecycle-v1':{compileFresh35CombinedProgram:async()=>({})},'old:fresh35-combined-record-v1':{...recordModules,validateFresh35CombinedRecord:()=>oldRecord}};
  let authority=0;const options={phase,sourceRoot:'/',referenceDirectory:'/SYNTHETIC',postmasterStart:f.p.expected.physical.postmasterStart,startsAt:Date.now()-1000,expiresAt:Date.now()+2400000,authorizationSha256:'a'.repeat(64),assertAuthorized:async binding=>{authority++;assert.equal(binding.phase,phase);if(fault==='authority')throw Error('MODEL_AUTHORITY_REFUSED');},emit:f.io.emit,openClient:api.seed(f),...(phase==='SQL38'?{parentRecordSha256:parentSha,provisionOrigin:origin,admin:{account_id:'11000000-0000-0000-0000-000000000002',staff_id:'11000000-0000-0000-0000-000000000003',login_name:'admin',staff_name:'系统管理员'}}:{})};
  const r=await api.runFresh35BaselineScopeUpgrade(options),label=phase+'/'+fault;
  if(['authority','parentEpoch','priorArtifact'].includes(fault)){assert.equal(r.state,'NOT_STARTED',label);assert.equal(f.opens,0,label);}
  else if(fault==='aProof'){assert.equal(r.state,'ROLLED_BACK',label);assert.equal(f.opens,1,label);}
  else if(fault==='commit'){assert.equal(r.state,'COMMIT_OUTCOME_UNKNOWN',label);assert.equal(f.opens,1,label);}
  else{assert.equal(r.state,'COMMITTED_UNPUBLISHED',label);assert.equal(Boolean(r.record),fault==='none',label);if(fault!=='postcommitJournal')assert.deepEqual(f.closed,['DDL','READBACK'],label);}
  if(fault==='none')assert(authority>=1,label);
  assert.equal(f.closed.length,f.opens,label);
 }
});
