import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresCatalogueMaintenanceUnitOfWork } from '../adapters/postgres/src/catalogue-maintenance-store.ts';
import type { MaintenancePgContext } from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { createCatalogueMaintenanceService } from '../packages/application/src/catalogue-maintenance-service.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const A=sid('category',701),B=sid('category',702),C=sid('category',703);
function fixture(options:{children?:boolean;parent?:'missing'|'deleted'|'descendant'|'deep';sameParent?:boolean}={}) {
 const calls:string[]=[];let puts=0,completions=0;
 const result={operationId:sid('operation',705),kind:'CATEGORY' as const,targetId:A,version:2};
 const context:MaintenancePgContext={client:{async query(sql:string){calls.push(sql);
  if(sql.startsWith('SELECT id,name,version'))return {rows:[{id:A,name:'A',version:1,deleted_at:null,parent_id:options.sameParent?C:null,display_order:0}],rowCount:1};
  if(sql.startsWith('WITH RECURSIVE ancestors'))return {rows:options.parent==='missing'?[]:[{id:options.parent==='descendant'?B:C,parent_id:null,retained:options.parent!=='deleted',cyclic:false},...(options.parent==='deep'?[{id:sid('category',704),parent_id:null,retained:true,cyclic:false}]:[])],rowCount:1};
  if(sql.includes('category-depth:subtree'))return {rows:[{id:A,depth:0,cyclic:false},...(options.children?[{id:B,depth:1,cyclic:false}]:[])],rowCount:1};
  if(sql.includes(' AS duplicate'))return {rows:[{duplicate:false}],rowCount:1};
  if(sql.startsWith('UPDATE'))puts++;
  return {rows:[],rowCount:1};}},evidence:{async assertAllowed(){},async getReceipt(){return undefined;},async complete(){completions++;return result;}}};
 const uow=new PostgresCatalogueMaintenanceUnitOfWork({async transaction<T>(work:(tx:MaintenancePgContext)=>Promise<T>){return work(context);}});
 const service=createCatalogueMaintenanceService({unitOfWork:uow,now:()=> '2026-10-28T00:00:00Z',newId:()=>result.operationId});
 return {calls,service,puts:()=>puts,completions:()=>completions};
}
const command=(parentId:string|null=C)=>({action:'EDIT',id:A,expectedVersion:1,requestKey:'HV2_B14_MOVE',values:{name:'Renamed',parentId,displayOrder:0}});
test('B14 root with live child cannot move below another root; no put/evidence',async()=>{
 const f=fixture({children:true});await assert.rejects(f.service.execute(actor,'CATEGORY',command()),{code:'CATEGORY_DEPTH'});assert.equal(f.puts(),0);assert.equal(f.completions(),0);
 assert.ok(f.calls[0]!.includes('pg_advisory_xact_lock'));
});
test('B14 leaf can move; same-parent rename retains behavior; root can stay root',async()=>{
 for(const [options,parent]of [[{},C],[{sameParent:true,children:true},C],[{children:true},null]] as const){const f=fixture(options);await f.service.execute(actor,'CATEGORY',command(parent));assert.equal(f.puts(),1);assert.equal(f.completions(),1);}
});
for(const parent of ['missing','deleted','descendant','deep'] as const)test('B14 refuses '+parent+' parent',async()=>{
 const f=fixture({parent,children:true});await assert.rejects(f.service.execute(actor,'CATEGORY',command(parent==='descendant'?B:C)),{code:parent==='deep'?'CATEGORY_DEPTH': 'CATEGORY_CYCLE'});assert.equal(f.puts(),0);assert.equal(f.completions(),0);
});
