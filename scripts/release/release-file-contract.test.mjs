import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {runtimeSqlPatches, releaseContract, releaseContractSource} from './manifest.mjs';
import {contractBlock, generateReleaseContract} from './generate-release-contract.mjs';
test('shared release facts generate the standalone Python consumer without drift', async () => {
 await generateReleaseContract(true);
 const code=`import runpy,json,sys
m=runpy.run_path('scripts/release/deploy-candidate.py'); payload=json.loads(sys.stdin.read());expected=payload['contract']
assert m['RELEASE_CONTRACT']==expected
assert m['RELEASE_CONTRACT_SOURCE']==payload['source']
assert m['RELEASE_CONTRACT']['entrypoints']==expected['entrypoints']
assert list(m['APPROVED_SQL_PATCHES'].items())==[(r['source'],r['member']) for r in expected['runtimeSqlPatches']]
assert m['FULL_PROFILE']==expected['full']['profile'] and m['FULL_PATCH']==expected['full']['patchLevel']
config=m['nginx_configuration']('naijue-rewrite-tool-only-app').decode('utf-8')
for row in expected['requestBodyBudgets']:
 section=config.split('location = '+row['path']+' {',1)[1].split('}',1)[0]
 assert 'client_max_body_size '+str(row['bytes'])+';' in section
`;
 const r=spawnSync('python3',['-c',code],{input:JSON.stringify({contract:releaseContract,source:releaseContractSource}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('release generator rejects duplicate SQL, unsafe members and ambiguous route budgets', () => {
 for (const change of [
  c=>c.runtimeSqlPatches.push({...c.runtimeSqlPatches[0]}),
  c=>{c.runtimeSqlPatches[0].member='../escape.sql';},
  c=>c.requestBodyBudgets.push({...c.requestBodyBudgets[0]}),
  c=>{c.requestBodyBudgets[0].bytes=0;},
  c=>{c.extra=true;},
  c=>{c.entrypoints.backend.member='../production-main.js';},
  c=>{c.entrypoints.backend.extra=true;},
  c=>{c.entrypoints.frontend.source='apps/web/src/old.ts';},
 ]) {
  const c=structuredClone(releaseContract);change(c);
  assert.throws(()=>contractBlock(c),/INVALID_RELEASE/);
 }
});
test('release generator refuses unknown nested facts instead of emitting unversioned mechanical fields', () => {
 for (const change of [
  c=>{c.fontLicense.extra='unregistered';},
  c=>{c.fontLicense.source='apps/web/other/LICENSE.txt';},
  c=>{c.full.extra='unregistered';},
  c=>{c.full.profile='unknown-selector';},
  c=>{c.full.patchLevel=null;},
  c=>{c.runtimeSqlPatches[0].extra='unregistered';},
  c=>{c.requestBodyBudgets[0].extra='unregistered';},
  c=>{c.runtimeSqlPatches[0]=null;},
  c=>{c.requestBodyBudgets[0]=null;},
 ]) {
  const c=structuredClone(releaseContract);change(c);
  assert.throws(()=>contractBlock(c),/INVALID_RELEASE/);
 }
});
test('Python exact license and approved SQL grouping agree with JS baseline; successor map remains finite',()=>{
 const code=`import runpy,json,sys,copy
m=runpy.run_path('scripts/release/deploy-candidate.py');patches=json.loads(sys.stdin.read());assert patches==m['APPROVED_SQL_PATCHES']
for count in [len(patches),len(patches)+1]:
 approved=dict(patches)
 if count==len(patches)+1:approved['adapters/postgres/patches/0026-approved-successor.sql']='patches/0026-approved-successor.sql'
 source={'files':[]};manifest={'members':[]}
 names={**{'adapters/postgres/migrations/%04d_example.sql'%i:'migrations/%04d_example.sql'%i for i in range(1,27)},**approved}
 for name,member in names.items():
  row={'path':name,'bytes':12,'sha256':'a'*64};source['files'].append(row);manifest['members'].append({**row,'path':member,'sourcePath':name,'role':'migration'})
 assert m['validate_sql_members'](manifest,source,approved)=={'migrationCount':26,'patchCount':count}
 for field,value in [('sourcePath','adapters/postgres/unknown.sql'),('bytes',13),('sha256','b'*64),('role','frontend')]:
  bad=copy.deepcopy(manifest);bad['members'][0][field]=value
  try:m['validate_sql_members'](bad,source,approved)
  except m['Refused']:pass
  else:raise AssertionError(field)
 for rows in [manifest['members'][:-1],manifest['members']+[manifest['members'][0]]]:
  try:m['validate_sql_members']({'members':rows},source,approved)
  except m['Refused']:pass
  else:raise AssertionError('set')
m['member_allowed']('web/source-styles/assets/fonts/LICENSE.txt')
for member in patches.values():m['member_allowed'](member)
for member in ['web/LICENSE.txt','patches/unknown.sql','../escape.sql','web/secret.js']:
 try:m['member_allowed'](member)
 except m['Refused']:pass
 else:raise AssertionError(member)
`;
 const r=spawnSync('python3',['-c',code],{input:JSON.stringify(Object.fromEntries(runtimeSqlPatches)),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});

test('generated facts alone match exactly while separate full generator check remains required', async () => {
 const source=await readFile(new URL('../../config/release-contract.json',import.meta.url));
 const deploy=await readFile(new URL('./deploy-candidate.py',import.meta.url),'utf8');
 const actual=deploy.match(/# BEGIN GENERATED RELEASE CONTRACT[\s\S]*?# END GENERATED RELEASE CONTRACT/);
 assert.ok(actual,'RELEASE_CONTRACT_MARKERS_MISSING');
 assert.equal(actual[0],contractBlock(JSON.parse(source),source),'RELEASE_CONTRACT_GENERATED_OUTPUT_STALE');
});
