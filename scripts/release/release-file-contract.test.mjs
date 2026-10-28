import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runtimeSqlPatches} from './manifest.mjs';
test('Python exact license and approved SQL grouping agree with JS baseline; successor map remains finite',()=>{
 const code=`import runpy,json,sys,copy
m=runpy.run_path('scripts/release/deploy-candidate.py');patches=json.loads(sys.stdin.read());assert patches==m['APPROVED_SQL_PATCHES']
for count in [4,5]:
 approved=dict(patches)
 if count==5:approved['adapters/postgres/patches/0026-approved-successor.sql']='patches/0026-approved-successor.sql'
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
