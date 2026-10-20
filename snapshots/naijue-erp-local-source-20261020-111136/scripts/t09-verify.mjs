import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,chmodSync,cpSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,writeJson} from './files.mjs';

const pg=process.env.T09_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T09_PG_BIN must explicitly select local PostgreSQL 17');
const out=resolve(root,'outputs/T09'), log=resolve(root,'logs/T09');
mkdirSync(out,{recursive:true});mkdirSync(log,{recursive:true});chmodSync(log,0o700);
const suite=mkdtempSync(join(log,'postgres-suite-')), socket=log, port='55489', admin='t09_bootstrap';
// T14 may rebuild shared dist (including intentional compile failures). Compile a private copy.
const runtime=join(suite,'verified-server');
const build=spawnSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'-p',resolve(root,'tsconfig.json'),'--outDir',runtime],{encoding:'utf8'});
writeFileSync(join(suite,'strict-build.log'),build.stdout+build.stderr);assert.equal(build.status,0,'Private strict build failed before any DB connection');
cpSync(resolve(root,'server/database/sql'),join(runtime,'database/sql'),{recursive:true});
const load=name=>import(pathToFileURL(join(runtime,name)).href);
const {PgDataAccess}=await load('database/access.js');
const {readDatabaseConfig,assertIsolatedTarget,databaseIdentifier:ident}=await load('database/config.js');
const {bootstrapAssertionSql}=await load('database/identity.js');
const {sqlLiteral:literal}=await load('database/sql.js');
const {repositories}=await load('database/repositories.js');
const {createApp}=await load('app.js');const {readConfig}=await load('config.js');
// Keep every artifact, including the temporary socket, inside the only writable project root.
assert.ok(Buffer.byteLength(socket+'/.s.PGSQL.'+port)<104,'Project socket path exceeds macOS AF_UNIX limit');
assert.equal(existsSync(join(socket,'.s.PGSQL.'+port)),false,'Existing socket is never reused');
const checks=[], pools=[], result={status:'RUNNING',suite,socket,checks,productionConnections:0,existingBusinessConnections:0,serverOperations:0};
const checked=(name,details={})=>{checks.push({name,status:'PASS',...details});console.log('PASS: '+name);};
function tool(name,args,file) {
  const r=spawnSync(join(pg,name),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null'},maxBuffer:8*1024*1024});
  writeFileSync(join(suite,file),r.stdout+r.stderr);assert.equal(r.status,0,`${name} failed; see ${file}`);return r.stdout.trim();
}
const conn=(database)=>['-h',socket,'-p',port,'-U',admin,'-d',database];
function adminSql(c,statement) {
  assertIsolatedTarget(c);
  const r=spawnSync(join(pg,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(c.database)],{
    input:bootstrapAssertionSql(c,admin)+'\n'+statement,encoding:'utf8',maxBuffer:8*1024*1024,
    env:{PATH:process.env.PATH,PGPASSFILE:'/dev/null',PGOPTIONS:'-c search_path=pg_catalog -c timezone=UTC'}});
  assert.equal(r.status,0,'Isolated fixture SQL failed; row contents suppressed');return r.stdout.trim();
}
const adminValue=(c,sql)=>JSON.parse(adminSql(c,sql));
function cli(env,command,file) {
  const r=spawnSync(process.execPath,[join(runtime,'database/cli-main.js'),command],{encoding:'utf8',env:{PATH:process.env.PATH,...env},maxBuffer:2*1024*1024});
  writeFileSync(join(suite,file),r.stdout+r.stderr);assert.equal(r.status,0,`maintenance ${command} failed`);return JSON.parse(r.stdout);
}
const makePool=(c,extra={})=>{const p=new PgDataAccess(c,{maxConnections:2,connectionTimeoutMs:1500,statementTimeoutMs:1200,lockTimeoutMs:200,idleTransactionTimeoutMs:1500,actionTimeoutMs:4000,...extra});pools.push(p);return p;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scalar=async(tx,sql,params=[]) => (await tx.query(sql,params)).rows[0];
function fingerprints(c) {
  const tables=adminValue(c,`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname) ORDER BY n.nspname,t.relname)
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=ANY(ARRAY[${Object.values(c.schemas).map(literal).join(',')}]) AND t.relkind='r'`);
  return tables.map(t=>adminValue(c,`SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'rows',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),'')))
    FROM (SELECT md5(row_to_json(r)::text) h FROM ${ident(t.schema)}.${ident(t.table)} r)x`));
}
let started=false;
try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',join(suite,'data'),'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C'],'initdb.log');
  tool('pg_ctl',['-D',join(suite,'data'),'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,join(suite,'data'));assert.equal(cluster.listenAddresses,'');result.cluster=cluster;
  checked('Fresh cluster identity verified; TCP disabled; all files/socket inside project');
  function make(label) {
    const suffix=randomUUID().replaceAll('-','').slice(0,8), prefix='t09_'+label+'_'+suffix;
    const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:'demo_8877_t09_'+label+'_'+suffix,
      POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t09_source',POSTGRES_RUNTIME_SCHEMA:'t09_runtime',
      POSTGRES_AUTH_SCHEMA:'t09_auth',POSTGRES_CONTROL_SCHEMA:'t09_control',POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:cluster.clusterId,
      POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql')};
    tool('createdb',[...conn('postgres').slice(0,-2),env.POSTGRES_DB],'create-'+label+'.log');
    cli(env,'bootstrap',label+'-bootstrap.log');cli(env,'migrate',label+'-migrate.log');return {env,config:readDatabaseConfig(env)};
  }
  const left=make('left'),right=make('right');result.targets={left:left.config,right:right.config};
  writeJson(join(out,'verification-targets.json'),{cluster,left:left.env,right:right.env,credentials:'none for main suite; synthetic test-only SCRAM credentials in private retained fixture files',suite,socket});
  const doc='e012f1d6-5d92-4b18-8fde-e3e12e5c21a4', product='08a57b74-beb0-45bd-9d16-1f9bcf6475f2',sku='3b50a0ca-2108-4a55-86db-c32030365d86';
  for(const [item,label] of [[left,'LEFT'],[right,'RIGHT']]) {
    const c=item.config,r=ident(c.schemas.runtime),s=ident(c.schemas.source);
    adminSql(c,`SET ROLE ${ident(c.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision) VALUES(${literal(doc)},'SALE',${literal(label)},'DRAFT',false,false,1);RESET ROLE;`);
    adminSql(c,`SET ROLE ${ident(c.roles.source)};
      INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(product)},'T09','T09','Synthetic category');
      INSERT INTO ${s}.unit(id,code,code_normalized,name) VALUES(${literal(product)},'T09','T09','Synthetic unit');
      INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(product)},'T09-SYNTHETIC','T09-SYNTHETIC','Synthetic fixture',${literal(product)},${literal(product)});
      INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(sku)},${literal(product)},'T09');RESET ROLE;`);
  }
  const before={left:fingerprints(left.config),right:fingerprints(right.config)};writeJson(join(out,'fingerprints-before.json'),before);
  const a=makePool(left.config),b=makePool(right.config),r=ident(left.config.schemas.runtime);
  checked('Two fresh demo_8877 databases migrated; only synthetic source/document fixtures');
  const pids=await a.transaction(async tx=>{
    const first=await scalar(tx,'SELECT pg_backend_pid() pid,current_database() db,current_user usr');
    const repo=repositories(tx,left.config.schemas);
    assert.equal((await repo.documents.findById(doc)).number,'LEFT');assert.equal((await repo.sourceSkus.findById(sku)).product_id,product);
    const last=await scalar(tx,'SELECT pg_backend_pid() pid,current_database() db,current_user usr');assert.deepEqual(last,first);return first;
  });assert.equal(pids.db,left.config.database);assert.equal(pids.usr,left.config.user);
  checked('Identity check, repositories and multiple statements use one actual backend PID',pids);
  const mutable={...left.config,schemas:{...left.config.schemas},roles:{...left.config.roles}};
  const bound=makePool(mutable);mutable.database=right.config.database;mutable.schemas.runtime='wrong_runtime';mutable.roles.app=right.config.user;
  assert.equal((await bound.read(tx=>scalar(tx,'SELECT current_database() db'))).db,left.config.database);
  checked('Pool configuration detached from caller mutation; database/schema/role binding is immutable');
  await a.transaction(async tx=>{await tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,$3)`,['T09-COMMIT','synthetic',new Date('2099-01-01Z')]);});
  assert.equal(adminValue(left.config,`SELECT count(*) FROM ${r}.edit_lease WHERE document_key='T09-COMMIT'`),1);
  await a.transaction(async tx=>{await tx.query(`DELETE FROM ${r}.edit_lease WHERE document_key=$1`,['T09-COMMIT']);});
  checked('Committed write is independently visible; removal commits in separate action');
  await assert.rejects(a.transaction(async tx=>{await tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,now())`,['T09-ROLLBACK','synthetic']);throw new Error('SYNTHETIC_MID_ACTION_FAILURE');}),/SYNTHETIC_MID_ACTION_FAILURE/);
  assert.equal(adminValue(left.config,`SELECT count(*) FROM ${r}.edit_lease`),0);
  checked('Callback exception after a real INSERT rolls back every intermediate write');
  await assert.rejects(a.transaction(async tx=>{await tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,now())`,['T09-CAUGHT','synthetic']);try{await tx.query('SELECT 1/0');}catch{};}),e=>e.code==='DATABASE_OPERATION_FAILED'&&e.sqlState==='22012');
  assert.equal(adminValue(left.config,`SELECT count(*) FROM ${r}.edit_lease`),0);
  checked('Swallowed SQL error still poisons action and prevents partial commit');
  const runs=await Promise.all(Array.from({length:24},(_,i)=>(i%2?a:b).transaction(async tx=>{
    const expected=i%2?left:right;const marker='T09-CONCURRENT-'+i;const schema=ident(expected.config.schemas.runtime);
    const start=await scalar(tx,'SELECT current_database() db,pg_backend_pid() pid');
    await tx.query(`INSERT INTO ${schema}.edit_lease VALUES($1,$2,now())`,[marker,'synthetic']);
    await tx.query('SELECT pg_sleep($1)',[0.005]);
    const repo=repositories(tx,expected.config.schemas);assert.equal((await repo.documents.findById(doc)).number,i%2?'LEFT':'RIGHT');
    const finish=await scalar(tx,'SELECT current_database() db,pg_backend_pid() pid');assert.deepEqual(start,finish);assert.equal(start.db,expected.config.database);return {...start,marker};
  })));
  const keys=c=>adminValue(c,`SELECT jsonb_agg(document_key ORDER BY document_key) FROM ${ident(c.schemas.runtime)}.edit_lease`);
  assert.deepEqual(keys(left.config),runs.filter((_,i)=>i%2).map(x=>x.marker).sort());assert.deepEqual(keys(right.config),runs.filter((_,i)=>!(i%2)).map(x=>x.marker).sort());
  for(const pool of [a,b]) await pool.transaction(tx=>tx.query(`DELETE FROM ${r}.edit_lease WHERE document_key LIKE $1`,['T09-CONCURRENT-%']));
  result.concurrentActions=runs;checked('24 queued/concurrent actions with identical schema/doc IDs never cross databases',{actions:runs.length,connectionsPerPool:2});
  for(const changed of [{instanceId:randomUUID()},{clusterId:'1'},{environment:'stage'},{schemas:{...left.config.schemas,auth:'wrong_auth'}}]) {
    const bad=makePool({...left.config,...changed});let invoked=false;
    await assert.rejects(bad.transaction(async()=>{invoked=true;}));assert.equal(invoked,false);assert.equal(bad.statistics().active,0);await bad.close();
  }
  checked('Wrong instance/cluster/environment/schema rejected before action callback');
  adminSql(left.config,`ALTER TABLE ${ident(left.config.schemas.control)}.schema_version DISABLE TRIGGER USER;
    UPDATE ${ident(left.config.schemas.control)}.schema_version SET checksum=repeat('0',64) WHERE position=2;
    ALTER TABLE ${ident(left.config.schemas.control)}.schema_version ENABLE TRIGGER USER;`);
  let invoked=false;await assert.rejects(a.read(async()=>{invoked=true;}),e=>e.code==='DATABASE_NOT_READY');assert.equal(invoked,false);
  const journal=JSON.parse(readFileSync(join(suite,'left-migrate.log'),'utf8')).versions;
  adminSql(left.config,`ALTER TABLE ${ident(left.config.schemas.control)}.schema_version DISABLE TRIGGER USER;
    UPDATE ${ident(left.config.schemas.control)}.schema_version SET checksum=${literal(journal[1].checksum)} WHERE position=2;
    ALTER TABLE ${ident(left.config.schemas.control)}.schema_version ENABLE TRIGGER USER;`);
  checked('Modified migration journal rejected on reused checkout before repository access');
  adminSql(left.config,`GRANT UPDATE ON ${ident(left.config.schemas.source)}.product TO ${ident(left.config.user)}`);
  await assert.rejects(a.read(async()=>{}),e=>e.code==='DATABASE_NOT_READY');
  adminSql(left.config,`REVOKE UPDATE ON ${ident(left.config.schemas.source)}.product FROM ${ident(left.config.user)}`);
  checked('Source write-privilege drift rejected at checkout');
  await assert.rejects(a.read(tx=>tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,now())`,['T09-READONLY','synthetic'])),e=>e.sqlState==='25006');
  checked('Read action is an actual database READ ONLY transaction');
  const hostile="quote'; DROP TABLE anything; -- \\ newline\n中文 😺";
  const roundtrip=await a.read(tx=>scalar(tx,'SELECT $1::text txt,$2::bigint big,$3::numeric amount,$4::text[] items,$5::text empty,$6::bytea bytes',
    [hostile,9223372036854775807n,'12345678901234.1234',[hostile,null,''],null,Buffer.from([0,1,255])]));
  assert.equal(roundtrip.txt,hostile);assert.equal(roundtrip.big,'9223372036854775807');assert.equal(roundtrip.amount,'12345678901234.1234');assert.deepEqual(roundtrip.items,[hostile,null,'']);assert.equal(roundtrip.empty,null);assert.deepEqual(roundtrip.bytes,Buffer.from([0,1,255]));
  checked('Protocol parameters preserve injection text, Unicode, null, arrays, bytes, bigint and numeric precision');
  for(const value of [undefined,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'nul\0text','a'.repeat(1048577),{},new Date('invalid'),new Array(1)]) await assert.rejects(a.read(tx=>tx.query('SELECT $1::text',[value])),e=>e.code.startsWith('INVALID_SQL_'));
  await assert.rejects(a.read(tx=>tx.query('SELECT $1::text',new Array(1))),e=>e.code==='INVALID_SQL_PARAMETER');
  for(const [sql,args] of [['SELECT $1::int',[]],['SELECT 1',[1]],['SELECT $1::int',['2147483648']],['SELECT 1; SELECT 2',[]],['COMMIT',[]]]) await assert.rejects(a.transaction(tx=>tx.query(sql,args)));
  checked('Invalid value types/size, unsafe numbers, bind counts, SQL type overflow, multi-statements and transaction escape rejected');
  let captured;
  await a.read(async tx=>{captured=tx;});await assert.rejects(captured.query('SELECT 1'),e=>e.code==='ACTION_SESSION_CLOSED');
  await assert.rejects(a.transaction(()=>b.read(async()=>{})),e=>e.code==='NESTED_DATA_ACTION');
  await assert.rejects(a.transaction(async tx=>{await Promise.all([tx.query('SELECT pg_sleep($1)',[0.02]),tx.query('SELECT 1')]);}),e=>e.code==='CONCURRENT_ACTION_QUERY');
  await assert.rejects(a.transaction(async tx=>{void tx.query('SELECT pg_sleep($1)',[0.03]).catch(()=>{});}),e=>e.code==='UNAWAITED_ACTION_QUERY');
  checked('Closed sessions, nested cross-pool actions, concurrent and unawaited session queries rejected');
  const short=makePool(left.config,{statementTimeoutMs:80,lockTimeoutMs:40,actionTimeoutMs:500});
  await assert.rejects(short.transaction(async tx=>{await tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,now())`,['T09-TIMEOUT','synthetic']);await tx.query('SELECT pg_sleep($1)',[0.2]);}),e=>e.sqlState==='57014');
  assert.equal(adminValue(left.config,`SELECT count(*) FROM ${r}.edit_lease`),0);await short.read(tx=>tx.query('SELECT 1'));
  checked('Statement timeout rolls back writes; next action works after release');
  let locked,unblock;const acquired=new Promise(resolve=>{locked=resolve;});const gate=new Promise(resolve=>{unblock=resolve;});
  const blocker=a.transaction(async tx=>{await tx.lock([{scope:'document',key:'held'}]);locked();await gate;});await acquired;
  try{await assert.rejects(short.transaction(tx=>tx.lock([{scope:'document',key:'held'}])),e=>e.sqlState==='55P03');}finally{unblock();await blocker;}
  checked('Real advisory lock wait times out and releases failed connection');
  const order=await Promise.all([['b','a'],['a','b']].map(keys=>a.transaction(async tx=>{
    await tx.lock(keys.map(key=>({scope:'inventory',key})));await tx.query('SELECT pg_sleep($1)',[0.02]);return 'done';
  })));assert.deepEqual(order,['done','done']);
  await assert.rejects(a.transaction(async tx=>{await tx.lock([{scope:'inventory',key:'b'}]);await tx.lock([{scope:'document',key:'a'}]);}),e=>e.code==='DECLARE_ACTION_LOCKS_FIRST');
  await assert.rejects(a.transaction(async tx=>{await tx.query('SELECT 1');await tx.lock([{scope:'inventory',key:'a'}]);}),e=>e.code==='DECLARE_ACTION_LOCKS_FIRST');
  checked('Opposite input lock order serializes without deadlock; later expansion/order inversion rejected');
  const deadline=makePool(left.config,{statementTimeoutMs:80,lockTimeoutMs:40,actionTimeoutMs:150,idleTransactionTimeoutMs:500});
  const t0=Date.now();await assert.rejects(deadline.transaction(async tx=>{await tx.query(`INSERT INTO ${r}.edit_lease VALUES($1,$2,now())`,['T09-DEADLINE','synthetic']);await delay(250);}),e=>e.code==='DATA_ACTION_TIMEOUT');
  assert.ok(Date.now()-t0<450);await delay(30);assert.equal(adminValue(left.config,`SELECT count(*) FROM ${r}.edit_lease`),0);await deadline.read(tx=>tx.query('SELECT 1'));
  checked('Whole action deadline disconnects idle callback and database rolls back before reuse');
  const single=makePool(left.config,{maxConnections:1,connectionTimeoutMs:70});let busy,free;
  const busySignal=new Promise(resolve=>{busy=resolve;}),freeSignal=new Promise(resolve=>{free=resolve;});
  const held=single.read(async()=>{busy();await freeSignal;});await busySignal;
  try{await assert.rejects(single.read(async()=>{}),e=>e.code==='DATABASE_CONNECTION_UNAVAILABLE');assert.equal(single.statistics().waiting,0);}finally{free();await held;}
  await single.read(tx=>tx.query('SELECT 1'));checked('Saturated pool acquisition times out; waiter removed; released connection remains usable');
  const clean=makePool(left.config,{maxConnections:1});await clean.transaction(tx=>tx.query("SELECT set_config('application_name',$1,false)",['T09-SESSION-POISON']));
  const cleanName=await clean.read(tx=>scalar(tx,"SELECT current_setting('application_name') name,current_setting('search_path') path"));assert.notEqual(cleanName.name,'T09-SESSION-POISON');assert.equal(cleanName.path,'pg_catalog');
  checked('Successful connection reuse discards session state and resets private search path');
  const reused1=await clean.read(tx=>scalar(tx,'SELECT pg_backend_pid() pid'));
  const reused2=await clean.read(tx=>scalar(tx,'SELECT pg_backend_pid() pid'));assert.deepEqual(reused1,reused2);assert.equal(clean.statistics().idle,1);
  checked('Successful actions reuse the same idle connection instead of leaking/recreating clients',reused1);
  const drain=makePool(left.config,{maxConnections:1});let entered,finishDrain;
  const enterSignal=new Promise(resolve=>{entered=resolve;}),finishSignal=new Promise(resolve=>{finishDrain=resolve;});
  const current=drain.read(async tx=>{entered();await finishSignal;return scalar(tx,'SELECT 1 value');});await enterSignal;
  const queued=drain.read(tx=>scalar(tx,'SELECT 2 value'));const closing=drain.close();
  await assert.rejects(drain.read(async()=>{}),e=>e.code==='DATA_ACCESS_CLOSED');finishDrain();
  assert.equal((await current).value,1);assert.equal((await queued).value,2);await closing;assert.equal(drain.statistics().waiting,0);assert.equal(drain.statistics().total,0);
  checked('Shutdown drains already admitted active/queued actions, rejects new actions, leaves no clients or waiters');
  const idle=makePool(left.config,{maxConnections:1});const idlePid=await idle.read(tx=>scalar(tx,'SELECT pg_backend_pid() pid'));
  adminSql(left.config,`SELECT pg_terminate_backend(${idlePid.pid})`);await delay(50);assert.ok(idle.statistics().idleErrors>0);await idle.read(tx=>tx.query('SELECT 1'));
  checked('Idle connection failure handled without crash; dead client replaced');
  // Exercise exact passfiles through real SCRAM authentication on the private Unix socket.
  const passwords=[randomUUID()+':\\synthetic',randomUUID()+':\\synthetic'];const authTargets=[];
  for(const [index,item] of [left,right].entries()) {
    adminSql(item.config,`ALTER ROLE ${ident(item.config.user)} PASSWORD ${literal(passwords[index])}`);
    const passfile=join(suite,'synthetic-'+index+'.pgpass');
    const escape=value=>String(value).replaceAll('\\','\\\\').replaceAll(':','\\:');
    writeFileSync(passfile,[socket,port,item.config.database,item.config.user,passwords[index]].map(escape).join(':')+'\n',{mode:0o600});
    authTargets.push({...item.config,passfile});
  }
  const hba=join(suite,'data/pg_hba.conf');const previousHba=readFileSync(hba,'utf8');
  writeFileSync(hba,`local all ${left.config.user},${right.config.user} scram-sha-256\n`+previousHba);
  tool('pg_ctl',['-D',join(suite,'data'),'reload'],'reload.log');await delay(100);
  const authA=makePool(authTargets[0]),authB=makePool(authTargets[1]);
  const pgEnv={PGHOST:process.env.PGHOST,PGDATABASE:process.env.PGDATABASE,PGUSER:process.env.PGUSER,PGPASSWORD:process.env.PGPASSWORD,PGPASSFILE:process.env.PGPASSFILE};
  try {
    Object.assign(process.env,{PGHOST:'do-not-connect.invalid',PGDATABASE:'business_management',PGUSER:'postgres',PGPASSWORD:'decoy',PGPASSFILE:'/missing/never-read'});
    const auth=await Promise.all([authA,authB].map(p=>p.read(tx=>scalar(tx,'SELECT current_database() db,current_user usr'))));
    assert.deepEqual(auth.map(x=>x.db),[left.config.database,right.config.database]);assert.deepEqual(auth.map(x=>x.usr),[left.config.user,right.config.user]);
    await assert.rejects(makePool({...authTargets[0],passfile:authTargets[1].passfile}).read(async()=>{}),e=>e.code==='DATABASE_CONNECTION_UNAVAILABLE');
  } finally {for(const [key,value] of Object.entries(pgEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  checked('Two explicit escaped passfiles authenticate separately via SCRAM; hostile global PG* defaults ignored; wrong file rejected');
  for(const target of [authTargets[0],authTargets[1]]) {
    chmodSync(target.passfile,0o644);await assert.rejects(makePool(target).read(async()=>{}));chmodSync(target.passfile,0o600);
  }
  checked('Non-private credential files rejected before password authentication');
  for(const pool of pools) assert.equal(pool.statistics().active,0);
  result.poolStatistics=pools.map(pool=>pool.statistics());
  checked('Success/failure/guard/timeout paths leave zero checked-out actions',{pools:pools.length});
  const app=createApp(readConfig({...left.env,POSTGRES_PASSFILE:authTargets[0].passfile}));assert.equal((await app.inject('/api/health')).json().businessReady,false);
  assert.equal((await app.inject({method:'POST',url:'/api/command',payload:{actorId:'local-admin'}})).statusCode,404);
  await app.dataAccess.read(tx=>tx.query('SELECT 1'));await app.close();await assert.rejects(app.dataAccess.read(async()=>{}),e=>e.code==='DATA_ACCESS_CLOSED');
  checked('HTTP owns lazy pool and closes it; health remains foundation-only; anonymous business route absent');
  const after={left:fingerprints(left.config),right:fingerprints(right.config)};assert.deepEqual(after,before);writeJson(join(out,'fingerprints-after.json'),after);
  result.fingerprintTables={left:before.left.length,right:before.right.length};result.tableDifferences=0;
  checked('All migrated tables restored to original synthetic fixture fingerprints after probes',result.fingerprintTables);
  result.status='PASS';
} catch(error) {result.status='FAIL';result.error=error instanceof Error?error.message:'unknown';console.error(result.error);process.exitCode=1;}
finally {
  for(const pool of pools) await pool.close();
  if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',join(suite,'data'),'-m','fast','-w','stop'],{encoding:'utf8'});writeFileSync(join(suite,'stop.log'),stop.stdout+stop.stderr);result.clusterStopped=stop.status===0;if(stop.status!==0){result.status='FAIL';process.exitCode=1;}}
  result.closedPools=pools.map(p=>p.statistics());assert.ok(result.closedPools.every(p=>p.total===0&&p.active===0&&p.waiting===0));
  result.retainedFixtures='Only new synthetic fixture databases and test-only credentials; cluster stopped; excluded from releases';
  writeJson(join(out,'database-verification.json'),result);writeJson(join(suite,'result.json'),result);
  console.log(`T09 verification: ${result.status}; ${checks.length} checks; cluster stopped=${result.clusterStopped}`);
}
