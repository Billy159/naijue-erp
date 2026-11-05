import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
test('standalone stream-preflight validates pinned explicit-zero evidence without connection inputs',async()=>{
 const d=await mkdtemp(join(tmpdir(),'zero-offline-cli-'));try{
  const p=await writeExplicitZeroStreamPackage(join(d,'input'),3);
  const args=report=>['tools/unified-import/cli.mjs','stream-preflight','--package',join(d,'input'),'--report',join(d,report),'--manifest-sha256',p.manifestSha256,'--explicit-zero-approval',p.approvalPath,'--explicit-zero-approval-sha256',p.approvalSha256,'--allow-synthetic'];
  const r=spawnSync(process.execPath,args('green'),{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.checks_passed,true);assert.equal(result.counts.inventory_baseline,5);assert.equal(result.import_eligible,false);
  assert.doesNotMatch(r.stdout,/CONFIRMED_ABSENT_IS_ZERO|approval_line|synthetic-zero:1/);
  const bad=args('bad');bad[bad.indexOf(p.approvalSha256)]='f'.repeat(64);const denied=spawnSync(process.execPath,bad,{encoding:'utf8'});assert.equal(denied.status,1);assert.doesNotMatch(denied.stdout,/CONFIRMED_ABSENT_IS_ZERO|approval_line/);
  const incomplete=args('incomplete');incomplete.splice(incomplete.indexOf('--explicit-zero-approval-sha256'),2);assert.equal(spawnSync(process.execPath,incomplete,{encoding:'utf8'}).status,1);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('offline preflight accepts both independent staff-hall and zero approvals without printing staff facts',async()=>{
 const {readFile,writeFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto'),hash=b=>createHash('sha256').update(b).digest('hex');
 const d=await mkdtemp(join(tmpdir(),'zero-staff-offline-'));try{
  const p=await writeExplicitZeroStreamPackage(join(d,'input'),3),file=join(d,'input/staff.jsonl'),rows=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse),r=rows[0];r.fields.employment_status='离职';r.fields.hall_id=null;
  const bytes=Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');await writeFile(file,bytes);const manifest=JSON.parse(p.manifest);Object.assign(manifest.files.find(f=>f.table==='staff'),{bytes:bytes.length,sha256:hash(bytes)});const mb=Buffer.from(JSON.stringify(manifest)+'\n');await writeFile(join(d,'input/manifest.json'),mb);
  const staff=Buffer.from(JSON.stringify({format_version:'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1',source_namespace:manifest.source_namespace,evidence_sha256:r.source_refs[0].file_sha256,staff:[{source_key:r.source_key,target_id:r.fields.id,source_refs:r.source_refs}]})),staffPath=join(d,'staff-approved.json');await writeFile(staffPath,staff,{mode:0o600});
  const args=['tools/unified-import/cli.mjs','stream-preflight','--package',join(d,'input'),'--report',join(d,'report'),'--manifest-sha256',hash(mb),'--explicit-zero-approval',p.approvalPath,'--explicit-zero-approval-sha256',p.approvalSha256,'--staff-hall-approval',staffPath,'--staff-hall-approval-sha256',hash(staff),'--allow-synthetic'];
  const child=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(child.status,0,child.stdout+child.stderr);const result=JSON.parse(child.stdout);assert.equal(result.checks_passed,true);assert.equal(result.historical_staff_hall_approval.sha256,hash(staff));assert.equal(result.historical_staff_hall_approval.record_count,1);assert.equal(result.historical_staff_hall_approval.utf8,undefined);assert.doesNotMatch(child.stdout,/staff:01|CONFIRMED_ABSENT_IS_ZERO/);
 }finally{await rm(d,{recursive:true,force:true})}
});
