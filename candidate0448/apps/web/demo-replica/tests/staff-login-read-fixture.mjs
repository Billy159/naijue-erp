/** TEST ONLY: native HTTP/service/D1/read-adapter with scripted PG responses.
 * Independent predeclared synthetic staff data. Not a PostgreSQL engine proof.
 * No socket, database, credentials, writes, or permission/profile changes. */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createOrganizationMaintenanceReadHttpPlugin} from '../../../api/src/organization-maintenance-http.ts';
import {PostgresMaintenanceCommandUnitOfWork} from '../../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import {PostgresOrganizationMaintenanceReadUnitOfWork} from '../../../../adapters/postgres/src/organization-maintenance-store.ts';
import {qaStaff,qaPrincipal,qaHalls} from '../frontend/qa-reference-fixtures.mts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hall={id:qaHalls[0].id,name:qaHalls[0].name,enabled:qaHalls[0].enabled};
const otherHall={id:id(991200),name:'闭筛二厅',enabled:true};
const row=(n,name,{enabled=null,employmentStatus='在职',role='SALESPERSON',hall:assigned=hall}={})=>({kind:'STAFF',id:id(991000+n),version:1,createdAt:null,updatedAt:null,name,role,hall:assigned,contact:null,employmentStatus,account:enabled===null?null:{id:id(992000+n),loginName:`closed-filter-${n}`,loginEnabled:enabled,authVersion:1,version:1}});
export const staffLoginReadRows=Object.freeze([
 structuredClone(qaStaff[0]),
 row(1,'闭筛A开通',{enabled:true}),row(2,'闭筛B关闭',{enabled:false}),row(3,'闭筛C未开通'),
 row(4,'闭筛D离职关闭',{enabled:false,employmentStatus:'离职'}),row(5,'闭筛E离职未开通',{employmentStatus:'离职'}),
 row(6,'闭筛F仓库关闭',{enabled:false,role:'WAREHOUSE',hall:null}),row(7,'闭筛G二厅关闭',{enabled:false,hall:otherHall})
]);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export async function createStaffLoginReadFixture(){
 const calls=[];
 const pool={async connect(){return {async query(sql,values=[]){
  calls.push({sql,values:structuredClone(values)});
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i,'read fixture forbids mutation SQL');
  if(sql.includes('maintenance:identity'))return {rows:[{account_id:qaPrincipal.accountId,staff_id:qaPrincipal.staffId,login_enabled:true,employment_status:'在职',role:'ADMIN',hall_id:null}],rowCount:1};
  if(sql.startsWith('WITH matched')){
   const withRole=sql.includes('m.role=$7::text'),loginParameter=withRole?8:7;
   const [search,status,hallId,size,offset,target]=values,role=withRole?values[6]:undefined;
   const hasLogin=sql.includes(`$${loginParameter}::text=''`),login=hasLogin?values[loginParameter-1]:undefined;
   if(hasLogin && login==='closed'){
    assert.match(sql,new RegExp(`\\$${loginParameter}(?:::text)?='open' AND a\\.login_enabled IS TRUE`),'native OPEN branch required');
    assert.match(sql,new RegExp(`\\$${loginParameter}(?:::text)?='closed' AND a\\.login_enabled IS FALSE`),'native CLOSED B branch required');
    assert.doesNotMatch(sql,/COALESCE\(a\.login_enabled|a\.login_enabled IS NOT TRUE/);
   }
   // Deterministic scripted data model, independent of response DTOs. Count/page
   // are computed from the same matching set; this is not SQL execution.
   const matched=staffLoginReadRows.filter(r=>(target===null||r.id===target)
    &&(!search||[r.name,r.account?.loginName??''].some(value=>value.toLowerCase().includes(search.toLowerCase())))
    &&(status==='all'||status==='normal'&&r.employmentStatus==='在职'||status==='disabled'&&r.employmentStatus==='离职')
    &&(hallId===null||r.hall?.id===hallId)&&(!role||r.role===role)
    &&(!login||login==='open'&&r.account?.loginEnabled===true||login==='closed'&&r.account?.loginEnabled===false))
    .slice().sort((a,b)=>cmp(a.name,b.name)||cmp(a.id,b.id));
   return {rows:[{total:String(matched.length),items:structuredClone(matched.slice(offset,offset+size))}],rowCount:1};
  }
  assert.ok(sql==='BEGIN ISOLATION LEVEL READ COMMITTED'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('maintenance:administrator-lock'),`Unexpected read fixture SQL: ${sql}`);
  return {rows:[],rowCount:0};
 },release(){}};}};
 const app=Fastify({logger:false});app.register(createOrganizationMaintenanceReadHttpPlugin({authenticate:async()=>({accountId:qaPrincipal.accountId,hallId:null}),unitOfWork:new PostgresOrganizationMaintenanceReadUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool)),kinds:['STAFF']}));await app.ready();
 return {calls,async close(){await app.close();},canHandle(path,method){return method==='POST'&&['/api/staff/query','/api/staff/detail/query'].includes(path);},async request(request){const url=new URL(request.url);assert.equal(url.origin,'https://synthetic-management.invalid');assert.ok(this.canHandle(url.pathname,request.method));const r=await app.inject({method:request.method,url:url.pathname.slice(4)+url.search,headers:request.headers,payload:request.body});return {status:r.statusCode,headers:r.headers,body:r.body};}};
}
