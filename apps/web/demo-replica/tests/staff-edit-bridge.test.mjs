import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {qaStaff} from '../frontend/qa-reference-fixtures.mts';
const staff=qaStaff[1],values={name:staff.name+' 已编辑',contact:'合成联系方式',role:staff.role,hallId:null};
const command={action:'EDIT',id:staff.id,expectedVersion:staff.version,requestKey:'qa-basic-edit-1',values,account:null};
function run(requests,enabled=true){
 const child=spawnSync(process.execPath,['--experimental-transform-types',new URL('./production-browser-fixture.mjs',import.meta.url).pathname,...(enabled?['--staff-edit']:[])],{input:requests.map(r=>JSON.stringify({url:'https://synthetic-management.invalid/api'+r.path,method:r.method??'POST',headers:{'content-type':'application/json'},...(r.body?{body:JSON.stringify(r.body)}:{})})).join('\n')+'\n',encoding:'utf8',timeout:10000});
 assert.equal(child.status,0,child.stderr);return child.stdout.trim().split('\n').map(x=>{const r=JSON.parse(x);return {...r,body:JSON.parse(r.body)};});
}
test('explicit staff fixture executes real EDIT, receipt, replay, CAS, and coherent list/detail reads',()=>{
 const responses=run([{path:'/staff/commands',body:command},{path:'/staff/receipts/'+command.requestKey,method:'GET'},
  {path:'/staff/commands',body:command},{path:'/staff/commands',body:{...command,values:{...values,name:'changed payload'}}},
  {path:'/staff/commands',body:{...command,requestKey:'qa-stale'}},{path:'/staff/detail/query',body:{id:staff.id}},
  {path:'/staff/query',body:{search:'已编辑',status:'all',hallId:null,role:'',loginStatus:'',page:1,pageSize:20}}]);
 assert.equal(responses[0].status,200);assert.equal(responses[0].body.version,2);
 assert.equal(responses[1].body.status,'COMMITTED');assert.deepEqual(responses[1].body.result,responses[0].body);assert.deepEqual(responses[2].body,responses[0].body);
 assert.equal(responses[3].status,409);assert.equal(responses[3].body.error.code,'IDEMPOTENCY_CONFLICT');
 assert.equal(responses[4].status,409);assert.equal(responses[4].body.error.code,'VERSION_CONFLICT');
 assert.equal(responses[5].body.name,values.name);assert.equal(responses[5].body.contact,values.contact);assert.equal(responses[5].body.version,2);assert.deepEqual(responses[5].body.account,staff.account);
 assert.equal(responses[6].body.total,1);assert.equal(responses[6].body.items[0].id,staff.id);
});
test('default fixture remains read-only; explicit scope rejects role, account and lifecycle writes without mutation',()=>{
 assert.equal(run([{path:'/staff/commands',body:command}],false)[0].status,501);
 const responses=run([{path:'/staff/commands',body:{...command,values:{...values,role:'ADMIN'}}},
  {path:'/staff/commands',body:{...command,account:{id:staff.account.id,expectedVersion:1,loginName:'no',loginEnabled:true,password:null}}},
  {path:'/staff/commands',body:{action:'LEAVE',id:staff.id,expectedVersion:1,requestKey:'qa-no-leave'}},
  {path:'/staff/detail/query',body:{id:staff.id}}]);
 for(const r of responses.slice(0,3))assert.equal(r.status,403);assert.deepEqual(responses[3].body,staff);
});
test('synthetic transaction serializes replay, rejects revoked/non-admin authority and rolls back completion fault',async()=>{
 const {createStaffEditFixture}=await import('./staff-edit-fixture.mjs');
 const {createStaffMaintenanceService}=await import('../../../../packages/application/src/staff-maintenance-service.ts');
 const fixture=await createStaffEditFixture();
 try{
  const service=createStaffMaintenanceService(fixture.dependencies),before=fixture.snapshot();
  await assert.rejects(service.execute({accountId:qaStaff[1].account.id,hallId:null},command),{code:'FORBIDDEN'});assert.deepEqual(fixture.snapshot(),before);
  await assert.rejects(service.execute({...fixture.actor,hallId:qaStaff[2].hall.id},command),{code:'FORBIDDEN'});assert.deepEqual(fixture.snapshot(),before);
  const results=await Promise.all([service.execute(fixture.actor,command),service.execute(fixture.actor,command)]);assert.deepEqual(results[0],results[1]);assert.equal(fixture.snapshot().audit.length,1);assert.equal(fixture.snapshot().receipts.size,1);
  const saved=fixture.snapshot();fixture.failCompletion();await assert.rejects(service.execute(fixture.actor,{...command,requestKey:'qa-rollback',expectedVersion:2,values:{...values,name:'rollback'}}),/SYNTHETIC_COMPLETE_FAULT/);assert.deepEqual(fixture.snapshot(),saved);
  fixture.revoke();await assert.rejects(service.receipt(fixture.actor,command.requestKey),{code:'FORBIDDEN'});await assert.rejects(service.execute(fixture.actor,command),{code:'FORBIDDEN'});assert.deepEqual(fixture.snapshot(),saved);
 }finally{await fixture.close();}
});
test('revoked fixture identity rejects HTTP reads, commands and receipt lookup',async()=>{
 const {createStaffEditFixture}=await import('./staff-edit-fixture.mjs');const fixture=await createStaffEditFixture();
 const request=(path,method='POST',body={id:staff.id})=>fixture.request({url:'https://synthetic-management.invalid/api'+path,method,headers:{'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
 try{fixture.revoke();for(const [path,method,body] of [['/staff/detail/query','POST',{id:staff.id}],['/accounts/detail/query','POST',{id:staff.account.id}],['/staff/commands','POST',command],['/staff/receipts/'+command.requestKey,'GET',null]]){const response=await request(path,method,body);assert.equal(response.status,403,path);assert.equal(JSON.parse(response.body).error.code,'FORBIDDEN');}}finally{await fixture.close();}
});


test('staff-edit preview CLOSED alignment preserves persistent all-open rows, finite EDIT authority and readback identity',async()=>{
 const {createStaffEditFixture}=await import('./staff-edit-fixture.mjs');const fixture=await createStaffEditFixture();
 const query={search:'',status:'all',hallId:null,role:'',loginStatus:'closed',page:1,pageSize:20};
 const request=async(path,body)=>{const response=await fixture.request({url:'https://synthetic-management.invalid/api'+path,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {...response,body:JSON.parse(response.body)};};
 try{
  const initial=fixture.snapshot(),closed=await request('/staff/query',query);assert.equal(closed.status,200);assert.equal(closed.body.total,0);assert.deepEqual(closed.body.items,[]);assert.deepEqual(fixture.snapshot(),initial);
  const edited=await request('/staff/commands',{...command,requestKey:'qa-preview-closed-basic-edit'});assert.equal(edited.status,200);const saved=fixture.snapshot();assert.equal(saved.audit.length,1);assert.equal(saved.receipts.size,1);
  const afterClosed=await request('/staff/query',query);assert.equal(afterClosed.status,200);assert.equal(afterClosed.body.total,0);assert.deepEqual(fixture.snapshot(),saved);
  const all=await request('/staff/query',{...query,loginStatus:'',search:'已编辑'}),open=await request('/staff/query',{...query,loginStatus:'open',search:'已编辑'}),detail=await request('/staff/detail/query',{id:staff.id});
  for(const r of [all,open]){assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.items[0].id,staff.id);assert.equal(r.body.items[0].name,values.name);assert.equal(r.body.items[0].contact,values.contact);assert.equal(r.body.items[0].version,2);assert.deepEqual(r.body.items[0].account,staff.account);}
  assert.equal(detail.status,200);assert.deepEqual(detail.body,all.body.items[0]);assert.deepEqual(fixture.snapshot(),saved);
  const denied=await request('/staff/commands',{...command,requestKey:'qa-preview-no-access-edit',expectedVersion:2,account:{id:staff.account.id,expectedVersion:1,loginName:staff.account.loginName,loginEnabled:false,password:null}});assert.equal(denied.status,403);assert.deepEqual(fixture.snapshot(),saved);
  fixture.revoke();const revoked=await request('/staff/query',query);assert.equal(revoked.status,403);assert.deepEqual(fixture.snapshot(),saved);
 }finally{await fixture.close();}
});
