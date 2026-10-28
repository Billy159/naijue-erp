/** Scripted PG plus disposable synthetic media trees only; no real PG/server/business media inventory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,link,symlink,lstat,opendir,statfs,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Execute the native .mjs CLI module through Node's URL loader; its output is asserted below. No declaration shim or compiler exclusion.
const {inventoryCapacity,observationWindowSessionBound,SESSION_INVENTORY_SQL,STORAGE_INVENTORY_SQL,INDEX_INVENTORY_SQL}=await import(new URL('../scripts/ops/capacity-inventory.mjs',import.meta.url).href);

const expected={database:'SYNTHETIC_ONLY',role:'SYNTHETIC_RUNTIME',databaseOid:'1234',postmasterStart:'2026-10-29 00:00:00+00'};
const options=(mediaRoots:{key:string;path:string}[]=[])=>({postgres:{target:{host:'never-connected.invalid',port:5432,database:expected.database,user:expected.role,password:'SYNTHETIC_NOT_A_SECRET',ssl:false},max:1,maxPendingAcquisitions:1,connectionTimeoutMillis:100,acquisitionTimeoutMillis:100,queryTimeoutMillis:100,statementTimeoutMillis:100,lockTimeoutMillis:100,idleInTransactionTimeoutMillis:100,idlePoolTimeoutMillis:100,disposeGraceMillis:0,disposeTimeoutMillis:100},expected,mediaRoots,limits:{concurrency:2,maxEntries:100,maxDepth:8,maxDurationMillis:10000}});
function pg(failure?:'connect'|'identity'|'sessions'|'storage'|'indexes'|'rollback'|'release'|'inconsistent'){
  const queries:string[]=[],releases:unknown[]=[];let connects=0;
  const client={async query(sql:string){queries.push(sql);
    if(sql.includes('identity'))return{rows:[{...expected,database_oid:expected.databaseOid,postmaster_start:expected.postmasterStart,observed_at:'2026-10-29 01:00:00+00',read_only:failure==='identity'?'off':'on',isolation:'repeatable read'}],rowCount:1};
    if(sql===SESSION_INVENTORY_SQL){if(failure==='sessions')throw Error('PRIVATE PASSWORD token hash details');return{rows:[{total:failure==='inconsistent'?'10':'11',effective:'3',expired:'2',revoked:'5',future_created:'1'}],rowCount:1};}
    if(sql===STORAGE_INVENTORY_SQL){if(failure==='storage')throw Error('PRIVATE DATABASE CONNECTION STRING');return{rows:[{relation_bytes:'8192',index_bytes:'16384',total_relation_bytes:'32768',database_bytes:'9007199254740993'}],rowCount:1};}
    if(sql===INDEX_INVENTORY_SQL){if(failure==='indexes')throw Error('PRIVATE');return{rows:[{name:'auth_session_account',bytes:'8192'}],rowCount:1};}
    if(sql==='ROLLBACK'&&failure==='rollback')throw Error('PRIVATE');
    assert.ok(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK'].includes(sql));return{rows:[],rowCount:0};
  },release(error?:unknown){releases.push(error);if(failure==='release')throw Error('PRIVATE');}};
  return{pool:{async connect(){connects++;if(failure==='connect')throw Error('PRIVATE');return client;}},queries,releases,connects:()=>connects};
}
async function temporary(t:{after:(fn:()=>Promise<void>)=>unknown}){const root=await mkdtemp(path.join(await realpath(tmpdir()),'a02-inventory-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

test('A02 missing targets refuse before any pool allocation; CLI no args exitsUNKNOWN without exposing ambient credentials',async()=>{
  let connects=0;await assert.rejects(inventoryCapacity(undefined,{pool:{async connect(){connects++;throw Error('Must not connect');}}}));assert.equal(connects,0);
  const result=spawnSync(process.execPath,['scripts/ops/capacity-inventory.mjs'],{encoding:'utf8',cwd:fileURLToPath(new URL('../',import.meta.url))});
  assert.equal(result.status,2);assert.equal(result.stdout,'');assert.deepEqual(JSON.parse(result.stderr),{status:'UNKNOWN',reason:'EXPLICIT_PRIVATE_TARGET_CONFIGURATION_OR_INVENTORY_UNAVAILABLE'});
});
test('A02 one exact RR READONLY snapshot counts mutually exclusive sessions and exact size strings, with no sensitive columns or writes',async()=>{
  const f=pg(),result=await inventoryCapacity(options(),{pool:f.pool});assert.equal(result.status,'OBSERVED');assert.equal(f.connects(),1);assert.equal(f.releases.length,1);
  assert.equal(f.queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.queries.at(-1),'ROLLBACK');
  assert.ok(f.queries.slice(1,-1).every(sql=>/^\/\*[^]*?\*\/ SELECT/.test(sql)));
  assert.doesNotMatch(f.queries.join('\n'),/token_hash|password|FOR UPDATE|FOR SHARE|\b(?:DELETE|INSERT|UPDATE|VACUUM|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  assert.deepEqual(result.postgres.sessions,{total:'11',effective:'3',expired:'2',revoked:'5',future_created:'1'});
  assert.equal(result.postgres.bytes.database_bytes,'9007199254740993');assert.equal(result.postgres.pgVolumeFree.status,'UNKNOWN');assert.equal(result.postgres.walVolumeFree.status,'UNKNOWN');
  assert.equal(result.mediaScope,'NOT_REQUESTED');assert.equal(result.mutationsPerformed,false);assert.equal(result.deletionAuthorized,false);
});
for(const failure of ['connect','identity','sessions','storage','indexes','rollback','release','inconsistent']as const)test(`A02 PG ${failure}: UNKNOWN rather than zero; single release/rollback and no private error text`,async()=>{
  const f=pg(failure),result=await inventoryCapacity(options(),{pool:f.pool});assert.equal(result.status,'UNKNOWN');assert.equal(result.postgres.status,'UNKNOWN');assert.equal(result.postgres.sessions,undefined);
  assert.equal(f.releases.length,failure==='connect'?0:1);assert.equal(f.queries.filter(sql=>sql==='ROLLBACK').length,failure==='connect'?0:1);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SYNTHETIC_NOT_A_SECRET|CONNECTION STRING/);
});
test('A02 target drift rejects before reading session counts',async()=>{
  const f=pg(),config=options();config.expected={...expected,databaseOid:'9999'};
  const result=await inventoryCapacity(config,{pool:f.pool});assert.equal(result.status,'UNKNOWN');assert.equal(f.queries.includes(SESSION_INVENTORY_SQL),false);assert.equal(f.releases.length,1);
});
test('A02 synthetic media counts actual allocation, stage/key entries and unique hard links; symlinks never traverse/read contents',async t=>{
  const root=await temporary(t),stage=path.join(root,'stages','synthetic-stage'),keys=path.join(root,'keys');await mkdir(stage,{recursive:true});await mkdir(keys);
  await writeFile(path.join(stage,'manifest.json'),'SYNTHETIC PRIVATE CONTENT MUST NOT BE READ');await writeFile(path.join(stage,'original.bin'),Buffer.alloc(8192));
  await link(path.join(stage,'manifest.json'),path.join(keys,'synthetic-key.json'));
  const outside=await temporary(t);await writeFile(path.join(outside,'unrelated.bin'),Buffer.alloc(4096));await symlink(outside,path.join(root,'do-not-follow'));
  const io={lstat,realpath,statfs,opendir:async(directory:string)=>{assert.notEqual(directory,path.join(root,'do-not-follow'));assert.equal(directory.startsWith(outside),false);return opendir(directory);}};
  const result=await inventoryCapacity(options([{key:'synthetic',path:root}]),{pool:pg().pool,fs:io});assert.equal(result.status,'OBSERVED');const media=result.media[0];
  assert.deepEqual(media.counts,{files:3,directories:3,symbolicLinks:1,specialFiles:0,stageDirectories:1,keyFiles:1});assert.equal(media.uniqueFileInodes,2);
  const manifest=await lstat(path.join(stage,'manifest.json'),{bigint:true}),original=await lstat(path.join(stage,'original.bin'),{bigint:true});let directoryBlocks=0n;for(const directory of [root,path.join(root,'stages'),stage,keys])directoryBlocks+=(await lstat(directory,{bigint:true})).blocks;assert.equal(media.allocatedBytes,((manifest.blocks+original.blocks+directoryBlocks+(await lstat(path.join(root,'do-not-follow'),{bigint:true})).blocks)*512n).toString());
  assert.ok(BigInt(media.volume.availableBytes)>=0n);assert.equal(media.volume.scope,'LOCAL_MEDIA_ROOT_FILESYSTEM_ONLY');assert.equal(result.postgres.pgVolumeFree.status,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC PRIVATE CONTENT|synthetic-key\.json|manifest\.json|unrelated\.bin/);
});
test('A02 traversal has bounded directory concurrency and closes every opened handle',async t=>{
  const root=await temporary(t);for(let n=0;n<6;n++){await mkdir(path.join(root,String(n)));await writeFile(path.join(root,String(n),'item'),'synthetic');}
  let active=0,max=0,opened=0,closed=0;
  const io={lstat,realpath,statfs,async opendir(directory:string){const dir=await opendir(directory);active++;opened++;max=Math.max(max,active);return{async read(){await new Promise(done=>setImmediate(done));return dir.read();},async close(){try{await dir.close();}finally{active--;closed++;}}};}};
  const result=await inventoryCapacity(options([{key:'limited',path:root}]),{pool:pg().pool,fs:io});assert.equal(result.status,'OBSERVED');assert.ok(max<=2);assert.equal(active,0);assert.equal(opened,closed);
});
for(const failure of ['io','space','entries','depth','duration']as const)test(`A02 media ${failure}: no partial zero or reclaim claim; root/volume failures stayUNKNOWN`,async t=>{
  const root=await temporary(t);await mkdir(path.join(root,'child'));await writeFile(path.join(root,'child','item'),'synthetic');
  const config=options([{key:'unknown',path:root}]);let tick=0;
  if(failure==='entries'){config.limits.maxEntries=1;config.limits.concurrency=1;}if(failure==='depth'){await mkdir(path.join(root,'child','nested'));config.limits.maxDepth=1;}
  const io={lstat:failure==='io'?async()=>{throw Object.assign(Error('PRIVATE PATH'),{code:'EACCES'});}:lstat,realpath,opendir,statfs:failure==='space'?async()=>{throw Error('PRIVATE SPACE');}:statfs};
  const result=await inventoryCapacity(config,{pool:pg().pool,fs:io,now:failure==='duration'?()=>{tick+=10001;return tick;}:()=>0});
  assert.equal(result.status,'UNKNOWN');assert.equal(result.media[0].allocatedBytes,null);assert.equal(result.media[0].counts,null);assert.equal(result.media[0].complete,false);assert.equal(result.deletionAuthorized,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('A02 explicit symlink root/ancestor and overlapping roots refuse or reportUNKNOWN without following foreign trees',async t=>{
  const root=await temporary(t),destination=await temporary(t),alias=path.join(root,'alias');await symlink(destination,alias);
  const result=await inventoryCapacity(options([{key:'alias',path:alias}]),{pool:pg().pool});assert.equal(result.status,'UNKNOWN');assert.equal(result.media[0].counts,null);
  await assert.rejects(inventoryCapacity(options([{key:'parent',path:root},{key:'child',path:path.join(root,'nested')}]),{pool:pg().pool}),/OVERLAPPING/);
});
test('A02 root and ordinary ancestor overlap rejects in both orders before any pool or filesystem use',async()=>{
  let connects=0,fsCalls=0;
  const dependencies={pool:{async connect(){connects++;throw Error('Must not connect');}},fs:new Proxy({},{get(){fsCalls++;throw Error('Must not inspect filesystem');}})};
  for(const [parent,child] of [['/','/synthetic-child'],['/synthetic-parent','/synthetic-parent/child']]){
    for(const paths of [[parent,child],[child,parent]])await assert.rejects(inventoryCapacity(options(paths.map((value,index)=>({key:`root${index}`,path:value}))),dependencies),/OVERLAPPING_MEDIA_ROOTS_REFUSED/);
  }
  assert.equal(connects,0);assert.equal(fsCalls,0);
});
test('A02 adjacent independent roots pass configuration and use only their explicit synthetic trees',async t=>{
  const parent=await temporary(t),first=path.join(parent,'media'),second=path.join(parent,'media-extra');
  await mkdir(first);await mkdir(second);
  for(const paths of [[first,second],[second,first]]){
    const f=pg(),result=await inventoryCapacity(options(paths.map((value,index)=>({key:`root${index}`,path:value}))),{pool:f.pool});
    assert.equal(f.connects(),1);assert.equal(result.status,'OBSERVED');assert.equal(result.media.length,2);
  }
});
test('A02 formula is exact ceil(rT)+B(R+1)+inflight with no chosen production window or restart assumption',()=>{
  assert.equal(observationWindowSessionBound({rateTokens:60,rateIntervalMillis:60000,windowMillis:7*24*60*60000,burst:10,restarts:0,inFlight:2}),'604812');
  assert.equal(observationWindowSessionBound({rateTokens:1,rateIntervalMillis:3,windowMillis:10,burst:2,restarts:3,inFlight:1}),'13');
  assert.equal(observationWindowSessionBound({rateTokens:Number.MAX_SAFE_INTEGER,rateIntervalMillis:1,windowMillis:2,burst:0,restarts:0,inFlight:0}),'18014398509481982');
  assert.throws(()=>observationWindowSessionBound({rateTokens:1,rateIntervalMillis:0,windowMillis:1,burst:1,restarts:0,inFlight:0}),/EXPLICIT_WINDOW/);
});
