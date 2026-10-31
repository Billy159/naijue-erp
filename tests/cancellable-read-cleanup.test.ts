import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Run cleanup fault injection in a child so an uncaught AbortSignal exception
// cannot kill the test runner or conceal which lifecycle failed.
for (const scenario of ['abort-cleanup', 'late-lease']) {
 test(`read cancellation settles when cleanup throws: ${scenario}`,()=>{
  const child=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',`
   import assert from 'node:assert/strict';
   import {awaitRead,acquireReadClient} from './adapters/postgres/src/cancellable-read.ts';
   const controller=new AbortController(); let releases=0;
   const release=()=>{releases++;throw new Error('PG_RELEASE_FAILED');};
   const cancelled=()=>new Error('READ_TIMEOUT');
   let finish; const pending=new Promise(resolve=>{finish=resolve;});
   const result=${JSON.stringify(scenario)}==='abort-cleanup'
    ?awaitRead(pending,controller.signal,cancelled,release)
    :acquireReadClient({connect:()=>pending},controller.signal,cancelled);
   const rejected=assert.rejects(result,/READ_TIMEOUT/);
   controller.abort();
   await rejected;
   finish({release});
   await new Promise(resolve=>setTimeout(resolve,20));
   assert.equal(releases,1); console.log('SETTLED_ONCE');
  `],{encoding:'utf8',timeout:3000});
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/SETTLED_ONCE/);
 });
}
