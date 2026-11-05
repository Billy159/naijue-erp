import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../apps/web/src/loading/read-scope.ts';
import { createStaffSettingsCommandClient } from '../apps/web/src/staff-settings/http-client.ts';
import { createStaffSettingsWorkspace } from '../apps/web/src/staff-settings/controller.ts';
import { StaffClientError, type StaffCommand, type StaffSettingsRecord } from '../apps/web/src/staff-settings/contracts.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const secret='SYNTHETIC-BUSY-PASSWORD';
const record:StaffSettingsRecord={id:id(1),name:'原员工',role:'ADMIN',hall:null,contact:null,employmentStatus:'在职',version:7,account:{id:id(2),staffId:id(1),loginName:'synthetic-login',loginEnabled:true,version:3}};
function fixture(reply:()=>Promise<Response>){
 const scope=new ReadScope({accountId:id(90),sessionRevision:'s',permissionRevision:'p'},'busy',null,()=>{});
 let keys=0,writes=0;const sent:StaffCommand[]=[];
 const client=createStaffSettingsCommandClient({origin:'https://staff.synthetic.invalid',basePath:'/api',timeoutMs:100,fetch:async(input,init)=>{
  assert.equal(new URL(String(input)).origin,'https://staff.synthetic.invalid');
  if(init?.method==='POST'){sent.push(JSON.parse(String(init.body)) as StaffCommand);if(sent.length===1)return reply();writes++;return Response.json({operationId:id(30),kind:'STAFF',targetId:record.id,version:8});}
  return Response.json({error:{code:'RECEIPT_NOT_FOUND',message:'Missing'}},{status:404});
 }});
 const workspace=createStaffSettingsWorkspace({scope,roles:[{value:'ADMIN',label:'管理员',requiresHall:false}],reader:{async readList(){return {items:[],total:0,page:1,pageSize:20};},async readDetail(){return {...record,version:8,account:{...record.account!,version:4}};}},client,newRequestKey:()=>`busy-key-${++keys}`,writesEnabled:()=>true,onAccessFailure(){}});
 const editor=workspace.open(record)!;editor.update({name:'修改姓名'});editor.setPasswordIntent(true);
 return {scope,workspace,editor,sent,keys:()=>keys,writes:()=>writes};
}
test('strict prewrite busy rejects, permits cancel or explicit fresh password/key with original CAS',async()=>{
 const busy=()=>Promise.resolve(Response.json({error:{code:'AUTHENTICATION_BUSY',message:'Authentication capacity is temporarily unavailable'}},{status:429}));
 const f=fixture(busy);await f.editor.submit(secret);assert.equal(f.editor.getSnapshot().write.phase,'rejected');assert.equal(f.editor.getSnapshot().write.error?.status,429);assert.equal(f.editor.getSnapshot().write.error?.code,'AUTHENTICATION_BUSY');assert.equal(f.editor.locked,false);assert.equal(f.editor.hasUnresolvedWrite,false);assert.equal(f.editor.getSnapshot().draft?.name,'修改姓名');assert.doesNotMatch(JSON.stringify(f.editor.getSnapshot()),/SYNTHETIC-BUSY-PASSWORD/);
 await f.editor.submit('');assert.equal(f.sent.length,1);assert.equal(f.keys(),1);f.editor.setPasswordIntent(true);await f.editor.submit(secret);assert.equal(f.sent.length,2);assert.notEqual(f.sent[0]!.requestKey,f.sent[1]!.requestKey);for(const c of f.sent){assert.equal(c.action,'EDIT');if(c.action==='EDIT'){assert.equal(c.id,record.id);assert.equal(c.expectedVersion,7);assert.equal(c.account?.expectedVersion,3);}}
 await f.editor.readback();assert.equal(f.editor.getSnapshot().readback.phase,'ready');assert.equal(f.writes(),1);f.scope.dispose();
 const g=fixture(busy);await g.editor.submit(secret);assert.equal(g.workspace.close(),false);assert.equal(g.editor.discard(),true);assert.equal(g.workspace.close(),true);assert.equal(g.workspace.canLeave(),true);g.scope.dispose();
});
test('unknown429 HTML extra fields500 network and timeout stay uncertain without replay or password retention',async()=>{
 const cases=[()=>Promise.resolve(new Response('<html>busy</html>',{status:429})),()=>Promise.resolve(Response.json({error:{code:'OTHER_BUSY',message:'Busy'}},{status:429})),()=>Promise.resolve(Response.json({error:{code:'AUTHENTICATION_BUSY',message:'Busy',extra:true}},{status:429})),()=>Promise.resolve(Response.json({error:{code:'INTERNAL_ERROR',message:'Failed'}},{status:500})),()=>Promise.reject(new TypeError('synthetic network')),()=>new Promise<Response>(()=>{})];
 for(const reply of cases){const f=fixture(reply);await f.editor.submit(secret);assert.equal(f.editor.getSnapshot().write.phase,'uncertain');assert.equal(f.workspace.close(),false);assert.equal(f.editor.discard(),false);await f.editor.recover();assert.equal(f.editor.getSnapshot().write.phase,'uncertain');await f.editor.submit(secret);assert.equal(f.sent.length,1);assert.equal(f.keys(),1);assert.doesNotMatch(JSON.stringify(f.editor.getSnapshot()),/SYNTHETIC-BUSY-PASSWORD/);assert.ok(f.editor.getSnapshot().write.error instanceof StaffClientError);f.scope.dispose();}
});
