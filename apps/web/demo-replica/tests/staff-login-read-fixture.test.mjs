/** Native HTTP/service/D1/adapter + scripted PG model; not PostgreSQL engine evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffLoginReadFixture} from './staff-login-read-fixture.mjs';
const q={search:'闭筛',status:'all',hallId:null,page:1,pageSize:20,role:'',loginStatus:''};
async function read(fixture,body,path='/staff/query'){
 const response=await fixture.request({url:'https://synthetic-management.invalid/api'+path,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {...response,body:JSON.parse(response.body)};
}
test('staff CLOSED B native fixture preserves false/null/open identities and intersections without response rewriting',async t=>{
 const f=await createStaffLoginReadFixture();t.after(()=>f.close());
 const cases=[
  [{...q},['闭筛A开通','闭筛B关闭','闭筛C未开通','闭筛D离职关闭','闭筛E离职未开通','闭筛F仓库关闭','闭筛G二厅关闭']],
  [{...q,loginStatus:'open'},['闭筛A开通']],
  [{...q,loginStatus:'closed'},['闭筛B关闭','闭筛D离职关闭','闭筛F仓库关闭','闭筛G二厅关闭']],
  [{...q,loginStatus:'closed',status:'normal'},['闭筛B关闭','闭筛F仓库关闭','闭筛G二厅关闭']],
  [{...q,loginStatus:'closed',role:'SALESPERSON',hallId:'00000000-0000-4000-8000-000000003200'},['闭筛B关闭','闭筛D离职关闭']],
  [{...q,loginStatus:'closed',role:'SALESPERSON',hallId:'00000000-0000-4000-8000-000000003200',status:'disabled'},['闭筛D离职关闭']],
 ];
 for(const [body,names] of cases){const r=await read(f,body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.body.total,names.length);assert.deepEqual(r.body.items.map(row=>row.name),names);if(body.loginStatus==='closed')assert.ok(r.body.items.every(row=>row.account!==null&&row.account.loginEnabled===false));}
 const all=await read(f,q),missing=all.body.items.find(r=>r.name==='闭筛C未开通');assert.equal(missing.account,null);const detail=await read(f,{id:missing.id},'/staff/detail/query');assert.equal(detail.status,200);assert.equal(detail.body.account,null);assert.equal(detail.body.name,missing.name);
 assert.ok(f.calls.some(c=>c.sql.includes('maintenance:identity')));assert.ok(f.calls.some(c=>c.sql.startsWith('WITH matched')));assert.ok(!f.calls.some(c=>/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(c.sql)));
 assert.equal(f.canHandle('/api/staff/commands','POST'),false);assert.equal(f.canHandle('/api/staff/receipts/key','GET'),false);
});
