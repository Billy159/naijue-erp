import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplicaPreviewTransport} from '../../runtime-preview-transport.ts';
import {createReplicaSession} from '../common/session.ts';
import {createResponsibleCapability} from './responsible-capability.ts';
import {createReplicaTransferSession} from './transfers-session.ts';
import {qaPrincipal} from '../../qa-reference-fixtures.mts';
import type {DocumentResponsibleStaffCapability} from '../../../../src/application/contracts.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';

/** Original closed preview provider only; forwarding spy returns original bytes.
 * These prove existing READ contracts, not SAVE capability, PG or browser behavior.
 */
async function fixture(t:{after:(cleanup:()=>void)=>void}){
 const original=createReplicaPreviewTransport(),requests:{path:string;method:string;body:string|null}[]=[];
 const runtime=createReplicaSession({...original.http,fetch:async(input,init)=>{requests.push({path:new URL(input).pathname,method:init.method??'GET',body:typeof init.body==='string'?init.body:null});return original.http.fetch(input,init);}});
 t.after(()=>runtime.dispose());
 assert.equal(await runtime.auth.resolveSession(),true);
 assert.equal(runtime.auth.getSnapshot().phase,'authenticated');
 assert.equal(runtime.auth.getSnapshot().principal?.staffId,qaPrincipal.staffId);
 return {runtime,requests};
}
function read(scope:ReadScope):Parameters<DocumentResponsibleStaffCapability['readCandidates']>[0]{return {identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:null,signal:scope.signal,parameters:{search:'',page:1,pageSize:20}};}

test('default responsibility readiness stays closed; explicit readiness constructs the original read capability without dispatch',async(t)=>{
 const {runtime,requests}=await fixture(t),before=requests.length;
 const closed=createReplicaTransferSession(runtime,{instanceId:'responsible-closed',newRequestKey:()=>crypto.randomUUID()});
 const open=createReplicaTransferSession(runtime,{instanceId:'responsible-open',newRequestKey:()=>crypto.randomUUID(),responsibleReady:true});
 t.after(()=>{closed.dispose();open.dispose();});
 assert.equal(closed.workspace.responsibleStaff,undefined);
 assert.equal(Boolean(open.workspace.responsibleStaff),true);
 assert.equal(requests.length,before,'constructing either session must not read or write');
 assert.deepEqual(open.workspace.responsibleStaff!.allowedRoles,['ADMIN','WAREHOUSE','SALESPERSON']);
});

test('existing original staff read resolves exact session employee and another real candidate, without changing creator or issuing commands',async(t)=>{
 const {runtime,requests}=await fixture(t),scope=runtime.reads.createScope('responsible-contract');
 const capability=createResponsibleCapability(runtime,scope),before=requests.length,result=await capability.readCandidates(read(scope));
 const exact=result.items.find(item=>item.id===runtime.auth.getSnapshot().principal?.staffId);
 assert.equal(Boolean(exact),true,'default may use only a real candidate matching the current session staff ID');
 assert.equal(typeof exact?.name,'string');assert.notEqual(exact?.name.trim(),'');
 assert.equal(result.items.some(item=>item.id!==exact!.id),true,'editable choice requires another declared employee, not a guessed label');
 assert.deepEqual(Object.keys(exact!).sort(),['id','name'],'private account/credential fields must not leak through selector');
 const sent=requests.slice(before);assert.equal(sent.length,1);assert.equal(sent[0]!.path,'/api/staff/query');
 assert.equal(sent[0]!.method,'POST');assert.equal(JSON.parse(sent[0]!.body!).role,'');
 assert.equal(requests.some(item=>/\/commands(?:\/|$)/.test(item.path)),false);
 assert.equal(runtime.auth.getSnapshot().principal?.accountId,qaPrincipal.accountId);
});

test('mismatched permission identity is rejected before any staff/provider request',async(t)=>{
 const {runtime,requests}=await fixture(t),scope=runtime.reads.createScope('responsible-mismatch'),capability=createResponsibleCapability(runtime,scope),input=read(scope),before=requests.length;
 await assert.rejects(capability.readCandidates({...input,identity:{...scope.identity,permissionRevision:scope.identity.permissionRevision+'-other'}}),error=>error instanceof Error&&'kind'in error&&error.kind==='forbidden');
 assert.equal(requests.length,before);
});

test('disposed responsibility scope cannot read staff or dispatch a hidden retry',async(t)=>{
 const {runtime,requests}=await fixture(t),scope=runtime.reads.createScope('responsible-disposed'),capability=createResponsibleCapability(runtime,scope),input=read(scope);
 scope.dispose();const before=requests.length;
 await assert.rejects(capability.readCandidates(input),error=>error instanceof Error&&'kind'in error&&error.kind==='aborted');
 assert.equal(requests.length,before);
});
