/** Public resource/lifecycle ports only. No driver construction or DB access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import type {Pool, PoolClient} from 'pg';
import type {PgSalesPool, PgSalesClient} from '../adapters/postgres/src/sales-unit-of-work.ts';
import type {BoundedPostgresConfig, BoundedPostgresPool} from '../adapters/postgres/src/bounded-pool.ts';
import type {RuntimeDatabaseReadPool, RuntimeDatabaseReadClient, RuntimeDatabaseReadQuery, RuntimeDatabaseTargetIdentity} from '../apps/api/src/runtime-database-read-ports.ts';
import {awaitRead, acquireReadClient} from '../packages/application/src/read-resource.ts';
import {awaitRead as compatibilityAwaitRead, acquireReadClient as compatibilityAcquire} from '../adapters/postgres/src/cancellable-read.ts';

test('public host ports remain structurally compatible with real pg and original bounded resources without exposing credentials',()=>{
 const compatible: [
  Pool extends RuntimeDatabaseReadPool ? true : false,
  PoolClient extends RuntimeDatabaseReadClient ? true : false,
  PgSalesPool extends RuntimeDatabaseReadPool ? true : false,
  PgSalesClient extends RuntimeDatabaseReadQuery ? true : false,
  BoundedPostgresPool extends RuntimeDatabaseReadPool ? true : false,
  BoundedPostgresConfig['target'] extends RuntimeDatabaseTargetIdentity ? true : false,
  'password' extends keyof RuntimeDatabaseTargetIdentity ? false : true
 ]=[true,true,true,true,true,true,true];
 assert.ok(compatible.every(Boolean));
});

test('old adapter export is the exact public lifecycle implementation, not a second owner',()=>{
 assert.equal(compatibilityAwaitRead,awaitRead);
 assert.equal(compatibilityAcquire,acquireReadClient);
});

test('public read resource rejects an already-aborted lease before acquisition',async()=>{
 const controller=new AbortController();controller.abort();let connects=0;
 await assert.rejects(acquireReadClient({async connect(){connects++;return {release(){assert.fail('No acquired lease');}};}},controller.signal,()=>Error('READ_CANCELLED')),/READ_CANCELLED/);
 assert.equal(connects,0);
});

test('public read resource does not dispose pending issuer work and releases its late result exactly once',async()=>{
 const controller=new AbortController();let resolve!: (client:{release(error?:Error|boolean):void})=>void;
 let releases=0;const reason=Error('READ_CANCELLED'),pending=new Promise<{release(error?:Error|boolean):void}>(done=>{resolve=done;});
 const read=acquireReadClient({connect:()=>pending},controller.signal,()=>reason);
 const rejected=assert.rejects(read,error=>error===reason);controller.abort();await rejected;
 assert.equal(releases,0,'Unsettled issuer/acquisition work remains owned');
 resolve({release(error){assert.equal(error,reason);releases++;}});await tick();controller.abort();await tick();
 assert.equal(releases,1);
});

test('public read resource observes late rejection after cancellation without another cleanup',async()=>{
 const controller=new AbortController();let fail!: (error:Error)=>void,cleanups=0;
 const pending=new Promise<never>((_resolve,reject)=>{fail=reject;});
 const read=awaitRead(pending,controller.signal,()=>Error('READ_CANCELLED'),()=>{cleanups++;});
 const rejected=assert.rejects(read,/READ_CANCELLED/);controller.abort();await rejected;
 fail(Error('LATE_READ_FAILURE'));await tick();assert.equal(cleanups,1);
});
