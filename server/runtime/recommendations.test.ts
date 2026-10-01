import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SOURCE,identifier,transaction} from './db.ts';

const schema='v2_runtime_test_rec_'+randomUUID().replaceAll('-','');
const source=readFileSync(new URL('./http.ts',import.meta.url),'utf8');
const route=source.slice(source.indexOf("if(url.pathname==='/runtime/recommendations')"));
const start=route.indexOf('`WITH recent'),end=route.indexOf('`',start+1);
assert(start>=0&&end>start);
const sql=route.slice(start+1,end).replaceAll('${SOURCE}',identifier(SOURCE));
await transaction(schema,async tx=>{
 await tx.execute(`CREATE SCHEMA ${identifier(schema)}`);
 await tx.execute(`CREATE TABLE ${identifier(schema)}.document(id text PRIMARY KEY,document_type text,status text,business_day date,updated_at timestamptz,current_revision text)`);
 await tx.execute(`CREATE TABLE ${identifier(schema)}.revision(document_id text,revision text,body jsonb)`);
});
try{
 await transaction(schema,async tx=>{
  const add=async(id:string,status:string,hall:string,date:string,day:string|null,customer:string,records:any[])=>{
   await tx.query('INSERT INTO document VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[id,'SALE',status,day,'2026-10-01T01:00:00Z','r']);
   await tx.query('INSERT INTO revision VALUES($1,$2,$3) RETURNING document_id',[id,'r',JSON.stringify({header:{hall_id:hall,business_date:date,source_party_id:customer},fundsRecords:records})]);
  };
  await add('old-import','APPROVED','hall-a','2026-09-30','2026-09-30','old-customer',[{payment_method_id:'wechat',fund_account_id:'old-wechat'},{payment_method_id:'bank',fund_account_id:'old-bank'}]);
  await add('new-runtime','APPROVED','hall-a','2026-10-01',null,'new-customer',[{payment_method_id:'wechat',fund_account_id:'latest-wechat'},{payment_method_id:'cash',fund_account_id:'latest-cash'}]);
  await add('newer-draft','UNAUDITED','hall-a','2026-10-02',null,'draft-customer',[{payment_method_id:'wechat',fund_account_id:'draft-account'}]);
  await add('newer-deleted','DELETED','hall-a','2026-10-03',null,'deleted-customer',[{payment_method_id:'wechat',fund_account_id:'deleted-account'}]);
  await add('other-hall','APPROVED','hall-b','2026-10-04',null,'other-customer',[{payment_method_id:'wechat',fund_account_id:'other-account'}]);
  const result=(await tx.query(sql,[JSON.stringify(['hall-a'])])).rows[0].data;
  assert.equal(result.customerId,'new-customer','a new saved header date must outrank the prior imported business day');
  const accounts=new Map(result.accounts.map((x:any)=>[x.methodId,x.accountId]));
  assert.equal(accounts.get('wechat'),'latest-wechat');assert.equal(accounts.get('cash'),'latest-cash');assert.equal(accounts.get('bank'),'old-bank');
  await tx.query("UPDATE document SET status='UNAUDITED' WHERE id='new-runtime' RETURNING id");
  const reversed=(await tx.query(sql,[JSON.stringify(['hall-a'])])).rows[0].data;
  assert.equal(reversed.customerId,'old-customer');
  assert.equal(reversed.accounts.find((x:any)=>x.methodId==='wechat').accountId,'old-wechat');
  assert(!reversed.accounts.some((x:any)=>x.methodId==='cash'),'unapproved payments cannot remain the effective recommendation');
 });
 console.log('Latest effective hall/method recommendation: header date fallback, mixed methods, drafts/deleted/other halls and reversal PASS');
}finally{
 await transaction(schema,tx=>tx.execute(`DROP SCHEMA ${identifier(schema)} CASCADE`));
}
