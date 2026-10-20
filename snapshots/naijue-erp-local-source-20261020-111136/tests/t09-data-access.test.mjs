import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,chmodSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {PgDataAccess} from '../dist/server/database/access.js';
import {accessOptions} from '../dist/server/database/access-options.js';
import {passwordProvider} from '../dist/server/database/credentials.js';

const fixture={APP_ENV:'qa',POSTGRES_HOST:'/private/t09-unit-socket',POSTGRES_PORT:'55489',POSTGRES_DB:'demo_8877_t09_unit',POSTGRES_ROLE_PREFIX:'t09_unit',POSTGRES_USER:'t09_unit_app',
  POSTGRES_SOURCE_SCHEMA:'t09_source',POSTGRES_RUNTIME_SCHEMA:'t09_runtime',POSTGRES_AUTH_SCHEMA:'t09_auth',POSTGRES_CONTROL_SCHEMA:'t09_control',
  POSTGRES_INSTANCE_ID:'34f8764a-782b-4454-8375-b647e194983e',POSTGRES_CLUSTER_ID:'7691754635362465003'};
test('data access refuses unsafe targets synchronously and remains lazy on valid construction',async()=>{
  for(const extra of [{APP_ENV:'production'},{POSTGRES_DB:'business_management'},{POSTGRES_DB:'postgres'}]) assert.throws(()=>new PgDataAccess(readDatabaseConfig({...fixture,...extra})),/ISOLATED_DATABASE_REQUIRED/);
  const data=new PgDataAccess(readDatabaseConfig(fixture));assert.equal(data.statistics().total,0);await data.close();await data.close();
  await assert.rejects(data.read(async()=>{}),e=>e.code==='DATA_ACCESS_CLOSED');
});
test('pool and timeout bounds reject disabling, overflow, fractional and inconsistent settings',()=>{
  for(const [key,value] of [['maxConnections',0],['maxConnections',33],['actionTimeoutMs',NaN],['statementTimeoutMs',Infinity],['connectionTimeoutMs',0],['idleTimeoutMs',0],['lockTimeoutMs',1.5],['idleTransactionTimeoutMs',300001]]) assert.throws(()=>accessOptions({[key]:value}));
  assert.throws(()=>accessOptions({lockTimeoutMs:15001}));assert.throws(()=>accessOptions({actionTimeoutMs:14000}));
});
test('explicit passfile parser enforces matching, escapes, first-match order, permissions and symlink refusal',async()=>{
  const base=resolve('logs/T09');mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,'passfile-unit-')), file=join(dir,'synthetic.pgpass');
  const c=readDatabaseConfig({...fixture,POSTGRES_PASSFILE:file});
  const line=(password)=>[c.host,c.port,c.database,c.user,password].join(':')+'\n';
  writeFileSync(file,'# synthetic test fixture only\n'+line('colon\\:and\\\\backslash')+line('second-unused'),{mode:0o600});
  assert.equal(await passwordProvider(c)(),'colon:and\\backslash');
  writeFileSync(file,'*:*:*:*:wildcard-first\n'+line('exact-second'));assert.equal(await passwordProvider(c)(),'wildcard-first');
  writeFileSync(file,'host:port:other:role:synthetic\n');await assert.rejects(passwordProvider(c)(),/PASSFILE_MATCH_REQUIRED/);
  writeFileSync(file,line('synthetic'));chmodSync(file,0o644);await assert.rejects(passwordProvider(c)(),/PASSFILE_MUST_BE_PRIVATE/);chmodSync(file,0o600);
  symlinkSync(file,join(dir,'link'));await assert.rejects(passwordProvider({...c,passfile:join(dir,'link')})(),/PASSFILE_UNAVAILABLE/);
  await assert.rejects(passwordProvider({...c,passfile:undefined})(),/EXPLICIT_PASSFILE_REQUIRED/);
});
test('HTTP data-access import graph cannot reach maintenance or legacy process SQL',()=>{
  const seen=new Set();function visit(file){if(seen.has(file))return;seen.add(file);const code=readFileSync(file,'utf8');assert.doesNotMatch(code,/node:child_process|\.\/migrations\.js|\.\/bootstrap\.js|\.\/psql\.js|references\/frozen-baseline/);
    for(const m of code.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+)['"]/g))visit(resolve(file,'..',m[1]));}
  visit(resolve('dist/server/app.js'));assert.ok(seen.has(resolve('dist/server/database/access.js')));
});
