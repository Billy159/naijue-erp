/** Independent synthetic review only. No connect on a real driver, server, listener, install, or network. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import test from 'node:test';
import { Client as PinnedPgClient } from 'pg';
import { BoundedPostgresPool, PostgresQueryError } from '../adapters/postgres/src/bounded-pool.ts';
import { PostgresSalesUnitOfWork } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { PostgresTransferUnitOfWork } from '../adapters/postgres/src/transfer-unit-of-work.ts';
import { PostgresAuthenticationStore } from '../adapters/postgres/src/auth-store.ts';
import { PostgresPartyUnitOfWork } from '../adapters/postgres/src/party-maintenance-store.ts';
import { PostgresProductQueryReader } from '../adapters/postgres/src/product-query-reader.ts';
import { PostgresSalesQueryReader } from '../adapters/postgres/src/sales-query-reader.ts';
import { PostgresTransferQueryReader } from '../adapters/postgres/src/transfer-query-reader.ts';
import { PostgresCutoffImportStore } from '../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { PostgresCutoffScopeReader } from '../adapters/postgres/src/inventory-cutoff-scope-reader.ts';
import { cutoffStage, cutoffTime } from '../tests/support/synthetic-cutoff-fixtures.ts';
import { assertDeferredBalanceFailure } from '../tests/integration/proof.ts';
const config = () => ({ target: { host:'synthetic.invalid', port:55432, database:'synthetic', user:'synthetic', password:'SYNTHETIC-NOT-SECRET', ssl:false }, max:1, maxPendingAcquisitions:2, connectionTimeoutMillis:100, acquisitionTimeoutMillis:80, queryTimeoutMillis:200, statementTimeoutMillis:100, lockTimeoutMillis:30, idleInTransactionTimeoutMillis:300, idlePoolTimeoutMillis:100, disposeGraceMillis:10, disposeTimeoutMillis:50 });
const empty = () => ({rows:[],rowCount:1});
const flush = async () => { for(let i=0;i<16;i++) await Promise.resolve(); };
function deferred(){let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};}
const rawError = (code='23514', constraint='private_constraint') => Object.assign(new Error('PRIVATE-REVIEW-MARKER private_sql'),{code,constraint,where:'PRIVATE-REVIEW-MARKER', detail:'PRIVATE-REVIEW-MARKER',cause:new Error('PRIVATE-REVIEW-MARKER')});
function safe(error){for(const rendered of [String(error),inspect(error,{depth:20}),JSON.stringify(error)]) assert.doesNotMatch(rendered,/PRIVATE-REVIEW-MARKER|private_sql|private_constraint/);}
class Client extends EventEmitter {
 queries=[]; releases=[]; respond=()=>empty(); onRelease;
 query(sql,values){this.queries.push(sql);return this.respond(sql,values);}
 release(error){this.releases.push(error);this.onRelease?.();}
}
class Driver extends EventEmitter {
 connectCalls=0;endCalls=0;clients=[];steps=[];
 async connect(){this.connectCalls++;const client=await(this.steps.shift()?.()??new Client());this.clients.push(client);return client;}
 async end(){this.endCalls++;}
}
function fixture(settings=config()){const driver=new Driver();let passed;const pool=new BoundedPostgresPool(settings,p=>{passed=p;return driver});return{pool,driver,passed};}
const transactions = [
 ['sales',pool=>new PostgresSalesUnitOfWork(pool)],
 ['transfer',pool=>new PostgresTransferUnitOfWork(pool)],
 ['auth',pool=>new PostgresAuthenticationStore(pool)],
 ['party',pool=>new PostgresPartyUnitOfWork(pool)],
];
for(const [name,make] of transactions){
 test(`independent bounded integration: ${name} SQLSTATE COMMIT failure permits exactly one rollback and discard`,async()=>{
  const f=fixture();const raw=new Client();f.driver.steps.push(()=>raw);raw.respond=sql=>{if(sql==='COMMIT') throw rawError('40001');return empty()};
  await assert.rejects(make(f.pool).transaction(async()=>42),e=>{safe(e);return e instanceof PostgresQueryError&&e.code==='40001'});
  assert.deepEqual(raw.queries,['BEGIN ISOLATION LEVEL READ COMMITTED','COMMIT','ROLLBACK']);assert.deepEqual(raw.releases,[true]);assert.equal(f.driver.connectCalls,1);await f.pool.dispose();
 });
 test(`independent bounded integration: ${name} lost COMMIT acknowledgment is safe unknown outcome with no retry`,async()=>{
  const f=fixture();const raw=new Client();f.driver.steps.push(()=>raw);raw.respond=sql=>{if(sql==='COMMIT') return Promise.reject(rawError('ECONNRESET'));return empty()};
  await assert.rejects(make(f.pool).transaction(async()=>42),e=>{safe(e);assert.ok(e instanceof AggregateError);assert.ok(e.errors[0] instanceof PostgresQueryError);assert.match(e.errors[0].message,/outcome may be unknown/);assert.equal(e.errors[1].code,'PG_CLIENT_CLOSED');return true});
  assert.deepEqual(raw.queries,['BEGIN ISOLATION LEVEL READ COMMITTED','COMMIT']);assert.deepEqual(raw.releases,[true]);assert.equal(f.driver.connectCalls,1);await f.pool.dispose();
 });
}
for(const [name,Kind] of [['product',PostgresProductQueryReader],['sales',PostgresSalesQueryReader],['transfer',PostgresTransferQueryReader]]){
 test(`independent bounded integration: ${name} read snapshot retains rollback after sanitized SQLSTATE`,async()=>{
  const f=fixture();const raw=new Client();f.driver.steps.push(()=>raw);raw.respond=sql=>{if(sql==='SYNTHETIC WORK') throw rawError('57014');return empty()};
  const reader=new Kind(f.pool);await assert.rejects(reader.snapshot(new AbortController().signal,q=>q('SYNTHETIC WORK')),e=>{safe(e);return e.code==='57014'});
  assert.deepEqual(raw.queries,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SYNTHETIC WORK','ROLLBACK']);assert.deepEqual(raw.releases,[true]);await f.pool.dispose();
 });
}
for(const [name,run] of [['cutoff import',pool=>new PostgresCutoffImportStore(pool).execute(cutoffStage,cutoffTime)],['cutoff scope',pool=>new PostgresCutoffScopeReader(pool).read()]]){
 test(`independent bounded integration: ${name} retains SQLSTATE and rollback`,async()=>{
  const f=fixture();const raw=new Client();f.driver.steps.push(()=>raw);raw.respond=sql=>{if(!sql.startsWith('BEGIN')&&sql!=='ROLLBACK') throw rawError('23514');return empty()};
  await assert.rejects(run(f.pool),e=>{safe(e);return e.code==='23514'});assert.equal(raw.queries.at(-1),'ROLLBACK');assert.equal(raw.queries.length,3);assert.deepEqual(raw.releases,[true]);await f.pool.dispose();
 });
}
for(const [kind,method,put,constraint] of [['customer','getCustomer','putCustomer','customer_code_key'],['supplier','getSupplier','putSupplier','supplier_code_key']]){
 test(`independent bounded integration: native ${kind} conflict still maps after sanitization`,async()=>{
  const f=fixture();const raw=new Client();f.driver.steps.push(()=>raw);raw.respond=sql=>{if(sql.startsWith('INSERT INTO naijue_erp.'+kind)) throw rawError('23505',constraint);return empty()};
  const id='00000000-0000-4000-8000-000000000123';await assert.rejects(new PostgresPartyUnitOfWork(f.pool).transaction(async tx=>{await tx[method](id);await tx[put]({id,code:'SYNTHETIC-CODE',name:'SYNTHETIC',enabled:true,version:1,createdAt:null,updatedAt:null})}),{code:'PARTY_CODE_CONFLICT'});
  assert.equal(raw.queries.at(-1),'ROLLBACK');assert.deepEqual(raw.releases,[true]);await f.pool.dispose();
 });
}
test('independent bounded: caller config mutation and unknown driver keys cannot replace explicit TLS/target',async()=>{
 const settings={...config(),target:{...config().target,ssl:{rejectUnauthorized:true,ca:'SYNTHETIC CA'}},connectionString:'postgres://private',Client:()=>{throw Error('must not run')},log:()=>{throw Error('must not run')}};
 const f=fixture(settings);settings.target.ssl.rejectUnauthorized=false;settings.target.host='changed.invalid';settings.max=10;
 assert.deepEqual(f.passed.ssl,{rejectUnauthorized:true,ca:'SYNTHETIC CA'});assert.equal(f.passed.host,'synthetic.invalid');assert.equal(f.passed.max,1);assert.equal(f.passed.Client,undefined);assert.equal(f.passed.connectionString,undefined);assert.equal(f.passed.log,undefined);await f.pool.dispose();
});
test('independent bounded: multi-slot acquisition completion does not bypass older FIFO waiting admission',async()=>{
 const f=fixture({...config(),max:2});const a=deferred(),b=deferred();f.driver.steps.push(()=>a.promise,()=>b.promise);
 const pa=f.pool.connect(),pb=f.pool.connect();const order=[];const pc=f.pool.connect().then(c=>{order.push('c');return c}),pd=f.pool.connect().then(c=>{order.push('d');return c});await flush();assert.equal(f.driver.connectCalls,2);await assert.rejects(f.pool.connect(),{code:'PG_POOL_OVERLOADED'});
 b.resolve(new Client());const cb=await pb;cb.release();const cc=await pc;assert.deepEqual(order,['c']);cc.release();const cd=await pd;assert.deepEqual(order,['c','d']);a.resolve(new Client());const ca=await pa;cd.release();ca.release();await f.pool.dispose();
});
test('independent bounded: reentrant release cannot reuse slot before raw cleanup returns',async()=>{
 const f=fixture({...config(),maxPendingAcquisitions:0});const client=await f.pool.connect();const raw=f.driver.clients[0];let checked;raw.onRelease=()=>{checked=assert.rejects(f.pool.connect(),{code:'PG_POOL_OVERLOADED'})};client.release();await checked;const next=await f.pool.connect();next.release();await f.pool.dispose();
});
test('independent bounded: event before scheduled SQL dispatch closes lease without sending SQL',async()=>{
 const f=fixture();const client=await f.pool.connect();const raw=f.driver.clients[0];const query=client.query('MUST NOT EXECUTE');const rejected=assert.rejects(query,{code:'PG_CLIENT_CLOSED'});raw.emit('error',rawError('57P01'));await rejected;await flush();assert.deepEqual(raw.queries,[]);assert.deepEqual(raw.releases,[true]);assert.equal(f.pool.backgroundFailureCount,1);await f.pool.dispose();
});
test('independent bounded: release uncertainty remains quarantined even if raw side effect finished',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture({...config(),maxPendingAcquisitions:0});const client=await f.pool.connect();const raw=f.driver.clients[0];raw.onRelease=()=>{throw rawError('EPIPE')};assert.throws(()=>client.release(),{code:'PG_RELEASE_FAILED'});client.release();await assert.rejects(f.pool.connect(),{code:'PG_POOL_OVERLOADED'});
 const closed=f.pool.dispose();const rejected=assert.rejects(closed,{code:'PG_DISPOSE_TIMEOUT'});await flush();t.mock.timers.tick(50);await rejected;assert.equal(raw.releases.length,1);assert.equal(f.driver.endCalls,1);
});
test('independent bounded: sanitizer deliberately masks message/where required by deferred real-engine proof',()=>{
 const original=Object.assign(new Error('transfer balance quantity or version is not the exact cumulative operation delta'),{code:'23514',where:'PL/pgSQL function validate_transfer_balance_commit() line 12 at RAISE'});const evidence={sabotageApplied:true,commitAttempted:true};assert.equal(assertDeferredBalanceFailure(original,evidence),true);const masked=new PostgresQueryError(original);assert.equal(masked.code,'23514');assert.equal(masked.where,undefined);assert.throws(()=>assertDeferredBalanceFailure(masked,evidence));
});

class ProtocolConnection extends EventEmitter {
 sent=[];destroyCalls=0;endCalls=0;parsedStatements={};submittedNamedStatements={};_connecting=true;
 stream={destroy:()=>{this.destroyCalls++;queueMicrotask(()=>this.emit('end'));}};
 query(sql){this.sent.push(sql);}
 end(){this.endCalls++;queueMicrotask(()=>this.emit('end'));}
}
function actualPgFixture(){
 const connection=new ProtocolConnection();let raw;const releases=[];const driver=new Driver();
 const pool=new BoundedPostgresPool(config(),options=>{
  raw=new PinnedPgClient({...options,connection});raw._connected=true;raw.readyForQuery=true;raw._attachListeners(connection);
  raw.release=error=>{releases.push(error);void raw.end()};driver.steps.push(()=>raw);return driver;
 });return{pool,driver,raw,connection,releases};
}
test('independent pinned pg protocol: SQLSTATE rollback waits for ReadyForQuery without leaking raw errors',async()=>{
 const f=actualPgFixture();const client=await f.pool.connect();const failed=assert.rejects(client.query('COMMIT'),e=>{safe(e);return e.code==='23514'});await flush();
 f.connection.emit('errorMessage',rawError('23514'));await failed;const rollback=client.query('ROLLBACK');await flush();assert.deepEqual(f.connection.sent,['COMMIT']);assert.equal(f.raw._queryQueue.length,1);
 f.connection.emit('readyForQuery',{status:'E'});assert.deepEqual(f.connection.sent,['COMMIT','ROLLBACK']);f.connection.emit('commandComplete',{text:'ROLLBACK'});f.connection.emit('readyForQuery',{status:'I'});await rollback;
 client.release();assert.deepEqual(f.releases,[true]);assert.equal(f.connection.endCalls,1);assert.equal(f.connection.destroyCalls,0);await f.pool.dispose();
});
test('independent pinned pg protocol: local query read timeout forces real Client.end active-query stream retirement, not SQL cancel',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=actualPgFixture();const client=await f.pool.connect();const query=client.query('COMMIT');const rejected=assert.rejects(query,e=>{safe(e);assert.ok(e instanceof PostgresQueryError);assert.equal(e.code,undefined);return true});await flush();t.mock.timers.tick(200);await rejected;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.connection.sent,['COMMIT']);assert.deepEqual(f.releases,[true]);assert.equal(f.connection.destroyCalls,1);assert.equal(f.connection.endCalls,0);await assert.rejects(client.query('ROLLBACK'),{code:'PG_CLIENT_CLOSED'});await f.pool.dispose();
});
