/** Local parameter/ACL/disabled-carrier checks only. No runtime gate activation, pool or database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateEnabledInput, originalCommand, executeOriginalSingleMain, approvalPins } from './run-six-schemes.mjs';
import { compileMinimumAclDelta, schemeColumns } from './acl-delta.mjs';
const sourceRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022';
const input=JSON.parse(await readFile(new URL('./INPUT.disabled.json',import.meta.url),'utf8'));
const approved=JSON.parse(await readFile(new URL('./approved/BARCODE-SCHEME-INITIALIZATION-APPROVAL-v1.json',import.meta.url),'utf8'));
const freshSynthetic=()=>({...structuredClone(input),executionEnabled:true,sourceSnapshot:{root:sourceRoot,sourceRef:'a'.repeat(40),independentReviewFile:'/synthetic/source-review.json',independentReviewSha256:'b'.repeat(64)},
 runtime26Review:{reviewFile:'/synthetic/runtime-review.json',trustedReviewSha256:'c'.repeat(64)},requestKey:'SYNTHETIC_PARAMETER_CHECK_ONLY',expectedSequence:1,expectedCursor:22,
 cutoffAt:'2026-01-01T00:00:00.000000Z',target:{...input.target,postmasterStartedAt:'SYNTHETIC_PROCESS_ONLY'},
 targetIdentityEvidence:{...input.targetIdentityEvidence,freshReadbackFile:'/synthetic/readback.json',freshReadbackSha256:'d'.repeat(64)}});
test('prepared disabled carrier refuses before original gate access and direct CLI remains an inert notice',async()=>{
 let ready=0;await assert.rejects(executeOriginalSingleMain(input,{runtimeGate:{capability:{ready(){ready++;throw Error('MUST_NOT_TOUCH');}}},signal:new AbortController().signal,now:()=>{throw Error('MUST_NOT_CLOCK');},append(){},retainRequest(){}}),{code:'SIX_SCHEME_EXECUTION_DISABLED'});
 assert.equal(ready,0);const child=spawnSync(process.execPath,[fileURLToPath(new URL('./run-six-schemes.mjs',import.meta.url))],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).executionEnabled,false);assert.equal(JSON.parse(child.stdout).DB,false);
});
test('prepared command uses original exact6/3pin validator and leaves all dynamic facts required',async()=>{
 const original=await import(pathToFileURL(`${sourceRoot}/packages/application/src/inventory-cutoff-import.ts`).href);
 const rows=approved.approvedInitializationRows,c=originalCommand(freshSynthetic(),rows);original.validateBarcodeSchemeInitializationCommand(c);
 assert.deepEqual(c.schemeInitialization.schemes,rows);assert.deepEqual(c.schemeInitialization.approvalPins,approvalPins);assert.equal(Object.keys(c).length,7);
 assert.equal(Object.hasOwn(c,'authorizedPayloadHash'),false);assert.equal(Object.hasOwn(c,'items'),false);
 for(const mutate of [v=>{v.requestKey=null;},v=>{v.expectedSequence=null;},v=>{v.target.postmasterStartedAt=null;},v=>{v.runtime26Review.trustedReviewSha256=null;},v=>{v.identity.coreReceiptId='00000000-0000-4000-8000-000000000000';},v=>{v.sourceSnapshot.root=null;}]){const bad=freshSynthetic();mutate(bad);assert.throws(()=>validateEnabledInput(bad));}
 assert.equal(input.requestKey,null);assert.equal(input.expectedSequence,null);assert.equal(input.sourceSnapshot.root,null);assert.equal(input.runtime26Review.trustedReviewSha256,null);
});
test('ACL draft grants and rolls back only missing fixed-role column/function privileges, never old rights',()=>{
 const baseline={database:'erp_rewrite_20261022_r1',databaseOid:'1027659',role:'erp_rewrite_runtime_20261022',observedAtUtc:'2026-01-01T00:00:00.000Z',columnInsert:Object.fromEntries(schemeColumns.map(c=>[c,false])),idUpdate:false,helperExecute:false,tableMaintain:false,tableUpdate:false,tableDelete:false,tableTruncate:false};
 const full=compileMinimumAclDelta(baseline);assert.equal(full.grantSql.split('\n').length,3);assert.equal(full.rollbackSql.split('\n').length,3);
 assert.ok(full.grantSql.includes('GRANT UPDATE (id)'));assert.ok(!/MAINTAIN|GRANT UPDATE ON|GRANT ALL|PUBLIC|GRANT OPTION/.test(full.grantSql));
 const partial=compileMinimumAclDelta({...baseline,columnInsert:{...baseline.columnInsert,id:true},idUpdate:true,helperExecute:true});
 assert.deepEqual(partial.addedInsertColumns,schemeColumns.filter(c=>c!=='id'));assert.equal(partial.grantSql.split('\n').length,1);assert.ok(!partial.rollbackSql.includes('REVOKE UPDATE')&&!partial.rollbackSql.includes('REVOKE EXECUTE'));
 const noChange=compileMinimumAclDelta({...baseline,columnInsert:Object.fromEntries(schemeColumns.map(c=>[c,true])),idUpdate:true,helperExecute:true});assert.equal(noChange.grantSql,'');assert.equal(noChange.rollbackSql,'');
 assert.throws(()=>compileMinimumAclDelta({...baseline,tableMaintain:true}));assert.throws(()=>compileMinimumAclDelta({...baseline,role:'owner'}));assert.throws(()=>compileMinimumAclDelta({...baseline,columnInsert:{}}));
});
