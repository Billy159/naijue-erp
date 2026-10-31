// Pure offline tests. Run from reviewed source root with Node 24; no driver/DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderReadOnlyCheck} from './render-runtime26-readonly-check.mjs';
const relative='adapters/postgres/src/native-import-accounting-capability.ts';
const hash=createHash('sha256').update(readFileSync(resolve(relative))).digest('hex');
const plan=()=>({format:'RUNTIME26_READONLY_METADATA_PLAN_V1',scope:'EXACT_TARGET_METADATA_ONLY_NO_UPGRADE',sourceFile:relative,sourceSha256:hash,sourceCommit:'c'.repeat(40),profile:'V6',target:{database:'synthetic',databaseOid:'1',runtimeRole:'runtime',sessionUser:'runtime',serverAddress:null,serverPort:null,postmasterStart:'2026-01-01 00:00:00+00',serverVersionNum:'180000'}});
const original=await import(pathToFileURL(resolve(relative)).href);
const anchor="SELECT manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,";
const replacement="SELECT ((manifest - 'routines') || pg_catalog.jsonb_build_object('routines',(SELECT pg_catalog.jsonb_agg(r - 'source') FROM pg_catalog.jsonb_array_elements(manifest->'routines') r))) AS manifest, manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,";
test('V6 and V7 original probe preserved except final safe manifest projection',async()=>{
 for(const profile of ['V6','V7']){
  const p=plan();p.profile=profile;const sql=await renderReadOnlyCheck(p);
  const key=profile==='V6'?'NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE':'NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE';
  assert.ok(sql.includes(original[key].replace(anchor,replacement)+';'));
  assert.ok(sql.includes('AS source_routines_match'));assert.ok(sql.includes(`jsonb_array_length(manifest->'routines')=${profile==='V6'?135:137}`));
  assert.ok(sql.includes('ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.ok(sql.endsWith('ROLLBACK;\n'));assert.ok(sql.includes('\\set ON_ERROR_STOP on'));
  assert.equal((sql.match(/AS exact_target_required/g)||[]).length,2);
  assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:TABLE|ROLE|SCHEMA|FUNCTION|INTO|ON|FROM)\b/i);
 }
});
test('closed plan rejects additions and missing source or target before module load',async()=>{
 for(const mutate of [p=>p.extra=true,p=>delete p.sourceCommit,p=>delete p.target,p=>p.target.extra=true,p=>delete p.target.databaseOid,p=>p.target.sessionUser='administrator',p=>p.target.serverAddress=123,p=>p.sourceFile='../other.ts',p=>p.scope='PRODUCTION_UPGRADE',p=>p.profile='V1',p=>p.sourceSha256='0'.repeat(64)]){
  const p=plan();mutate(p);let loaded=false;await assert.rejects(renderReadOnlyCheck(p,async()=>{loaded=true;return original;}));assert.equal(loaded,false);
 }
});
test('transport is explicit and no default target or credential field is accepted',async()=>{
 for(const mutate of [p=>p.target.serverPort=5432,p=>delete p.target.serverAddress,p=>p.password='secret',p=>p.target.password='secret',p=>p.target.database='',p=>p.target.postmasterStart='']){
  const p=plan();mutate(p);await assert.rejects(renderReadOnlyCheck(p));
 }
 const p=plan();p.target.serverAddress='127.0.0.1/32';p.target.serverPort=5432;assert.ok((await renderReadOnlyCheck(p)).includes("'127.0.0.1/32'"));
});
test('bad or duplicate original probe anchor fails closed',async()=>{
 for(const probe of ['SELECT 1',anchor+anchor])await assert.rejects(renderReadOnlyCheck(plan(),async()=>({NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE:probe})));
});
test('renderer contains no driver/network/process execution import or production default',()=>{
 const src=readFileSync(new URL('./render-runtime26-readonly-check.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/from ['"](?:pg|node:net|node:http|node:https|node:child_process)['"]|\b(?:fetch|connect|execFile|spawn)\s*\(/);
 assert.doesNotMatch(src,/postgres(?:ql)?:\/\//);
});

test('V8 observes25 system cells and exact three DELETE without borrowing old xmin proof',async()=>{
 const p=plan();p.profile='V8';const sql=await renderReadOnlyCheck(p);
 assert.ok(sql.includes(original.NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE.replace(anchor,replacement)+';'));
 assert.ok(sql.includes('AS complete_write_system_acl_match_v8'));assert.ok(sql.includes('AS normal_delete_acl_match_v8'));
 assert.ok(sql.includes('AS recorded_live_balance_contract_match'));assert.ok(!sql.includes('AS complete_write_xmin_acl_match'));
 assert.ok(sql.endsWith('ROLLBACK;\n'));assert.ok(sql.includes('a.attnum<0'));
});

test('PREPARATION13 renderer selects exact source135 preparation13 and fixed direct LOGIN',async()=>{
 const p=plan();p.profile='PREPARATION13_V1';Object.assign(p.target,{database:'demo_8877_v7_r1_rehearsal_20261031_01',runtimeRole:'v7_r1_prepare_20261031_01',sessionUser:'v7_r1_prepare_20261031_01'});
 const sql=await renderReadOnlyCheck(p);assert.ok(sql.includes(original.NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION13_XMIN_FROM_V22_METADATA_PROBE.replace(anchor,replacement)+';'));assert.ok(sql.includes('AS preparation13_xmin_acl_match'));assert.ok(sql.includes("jsonb_array_length(manifest->'routines')=135"));assert.ok(sql.endsWith('ROLLBACK;\n'));
 for(const change of [{database:'production'},{runtimeRole:'v7_r1_runtime_20261031_01',sessionUser:'v7_r1_runtime_20261031_01'},{sessionUser:'administrator'}])await assert.rejects(renderReadOnlyCheck({...p,target:{...p.target,...change}}));
});
test('PREPARATION13 extension retains original V4/V6/V7/V8 probe and V6/V7/V8 renderer bytes',async()=>{
 const keys=['NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION_XMIN_FROM_V22_METADATA_PROBE','NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE','NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE','NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE'];
 const expected=['dd659e59cc45b63a6af8828b72c4c57f50170559622988fc1e6459171e9f3674','2623a9972e326d304dace759badfcabc7e99775d19cc805a6af3bcccbbc4bc2d','e0ec5a9d40f3993e9495a819c6e3ee2e78217f606511220679551d98006bc2fe','2c41f71e48fbf78105a22ba84120295b46b919768da83a421cfa9af92836845d'];
 const digest=s=>createHash('sha256').update(s).digest('hex');for(let i=0;i<keys.length;i++)assert.equal(digest(original[keys[i]]),expected[i]);
 const outputs={V6:'06dca8e1104936da1f6bab9093be9a532a6637a06450cc404c741dde6e6ef23e',V7:'ebadb239a8518b4d9a22fde945ff4d9c0c40b7c85c26752858a932b12b0d69f1',V8:'98d179b0f2ee12c87f999d17aa95185782877ab9fa7c50b3ecd8b18d69a7c34d'};for(const profile of Object.keys(outputs))assert.equal(digest(await renderReadOnlyCheck({...plan(),profile})),outputs[profile]);
});
