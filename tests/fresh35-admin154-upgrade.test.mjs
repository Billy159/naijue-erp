/** Offline wire/authority model only. No pg client, database or publisher. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateFresh35Admin154Record,ADMIN154_PREDECESSOR_RECORD_SHA256,ADMIN154_PREDECESSOR_SOURCE_SHA256,ADMIN154_PATCH_SHA256} from '../scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
const text=await readFile(new URL('../tools/unified-import/fresh35-admin154-upgrade.mjs',import.meta.url),'utf8');
// Private copy of the real driver, without exporting a model seam in production.
const model=await import('data:text/javascript;base64,'+Buffer.from(text+'\nexport {driveUpgrade,sql36Body,physicalSql,receiptSql};').toString('base64'));
const sql=await readFile(new URL('../adapters/postgres/patches/0036_admin_provision_only_successor.sql',import.meta.url),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('upgrade production module exposes only its fixed entry and refuses missing operator seams before any connection work',async()=>{
 const actual=await import('../tools/unified-import/fresh35-admin154-upgrade.mjs');assert.deepEqual(Object.keys(actual),['runFresh35Admin154Upgrade']);
 await assert.rejects(actual.runFresh35Admin154Upgrade({}),/EXACT_OPTIONS_REQUIRED/);
});
function fixture(fault){
 const expected={predecessor:{recordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)},
  successor:{patchSqlSha256:ADMIN154_PATCH_SHA256,sourceSetSha256:'4'.repeat(64),catalogSpecSha256:'5'.repeat(64),modelSha256:'6'.repeat(64)},
  physical:{systemIdentifier:'7703999999999999999',databaseOid:'42',database:'SYNTHETIC_MODEL_ONLY',serverVersionNum:'170011',postmasterStart:'2026-11-11 01:00:00.123456+00'},owner:'SYNTHETIC_OWNER'};
 const t={proposal:{host:'127.0.0.1',port:57639,database:expected.physical.database}},binding={authorizationSha256:'7'.repeat(64),expiresAt:Date.now()+120000},calls=[],events=[],closed=[];
 const ddl={id:'DDL'},reader={id:'READBACK'};let opened=0,committed=false,authorityCalls=0;
 const p={t,expected,binding,body:model.sql36Body(sql),parse:JSON.parse,predecessorSql:{guardSql:'SYNTHETIC152_GUARD'},successorSql:{guardSql:'SYNTHETIC154_GUARD',observationSql:'SYNTHETIC_OBSERVE'},
  validateRecord:r=>validateFresh35Admin154Record(r,expected),validateCatalog:raw=>{assert.equal(JSON.parse(raw).catalog,'SYNTHETIC154');},
  async current(){authorityCalls++;if(fault==='authority')throw Error('ADMIN154_UPGRADE_EXACT_AUTHORITY_CHANGED');}};
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
 const body=model.sql36Body(sql);assert.equal(hash(sql),ADMIN154_PATCH_SHA256);assert.equal(body,sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length));
 assert.throws(()=>model.sql36Body(sql+' '),/EXACT_SQL36_REQUIRED/);
 assert.throws(()=>model.sql36Body(sql.replace('BEGIN;','BEGIN;\nCOMMIT;')),/EXACT_SQL36_REQUIRED/);
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

test('upgrade native entry keeps sequential wire ownership and closes an adopted readback even if its initial wire check fails (explicit OS/pg model)',async()=>{
 let source=text;
 const start=source.indexOf('async function prepareUpgrade('),end=source.indexOf('/** I/O driver is private:',start);
 source=source.slice(0,start)+'async function prepareUpgrade(){return selected.p;}\n'+source.slice(end);
 source=source.replace(/const moduleAt=.*?;\n/,"const moduleAt=async()=>({assertTrustedRootTree:async()=>{},assertTrustedRootPath:async()=>{}});\n");
 source=source.replace(/need\(process.version===.*?'PINNED_CLEAN_RUNTIME_REQUIRED'\);/,"need(true,'EXPLICIT_MODEL_RUNTIME');");
 source=source.replace("const require=createRequire(pathToFileURL(join(o.sourceRoot,'package.json'))),{Client}=require('pg');", "const require=name=>name==='pg'?{Client:ModelClient}:{version:'8.23.1'}, {Client}=require('pg');");
 source=source.replace("const {closePhysical}=await import(pathToFileURL(join(o.sourceRoot,'tools/unified-import/whole-host-session.mjs')).href);", "const closePhysical=c=>c.end();");
 source+=`\nlet selected;class ModelClient{on(){} async end(){return selected.io.close(this)}async query({text,values}){const r=await selected.io.query(this,text,values);this._txStatus=text==='COMMIT'||text==='ROLLBACK'?'I':'T';return r;}}
 export function seed(f){selected=f;const wrap=c=>{Object.setPrototypeOf(c,ModelClient.prototype);Object.assign(c,{_connected:true,pipeline:false,readyForQuery:true,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],_queryable:true,_ending:false,_ended:false,_txStatus:'I',connectionParameters:{host:f.p.t.proposal.host,port:f.p.t.proposal.port,database:f.p.expected.physical.database,user:f.p.expected.owner,ssl:false}});return c;};wrap(f.io.client);const open=f.io.openReadback;return{sourceRoot:'/',referenceDirectory:'/SYNTHETIC',postmasterStart:f.p.expected.physical.postmasterStart,authorizationSha256:'a'.repeat(64),startsAt:Date.now()-1000,expiresAt:Date.now()+120000,client:f.io.client,assertAuthorized:async()=>{},emit:f.io.emit,async openReadback(){const c=wrap(await open());if(f.badReadWire)c.readyForQuery=false;return c;}};}
 `;
 const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 for(const broken of [false,true]){const f=fixture();f.badReadWire=broken;const r=await api.runFresh35Admin154Upgrade(api.seed(f));assert.equal(r.state,'COMMITTED_UNPUBLISHED');assert.deepEqual(f.closed,['DDL','READBACK']);assert.equal(r.catalogReadback,broken?'NOT_VERIFIED':'VERIFIED');assert.equal(Boolean(r.record),!broken);}
});
