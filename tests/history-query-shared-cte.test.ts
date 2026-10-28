/** Real SQL construction and decoder checks; no PostgreSQL connection. */
import test from 'node:test';import assert from 'node:assert/strict';
import {PostgresSalesQueryReader} from '../adapters/postgres/src/sales-query-reader.ts';
import {actor,ids} from './support/synthetic-fixtures.ts';
function fixture(valid=true,items:unknown=[]){const calls:{sql:string;values:unknown[]}[]=[];
 const client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values});let rows:Record<string,unknown>[]=[];
  if(sql.includes('read-authorization:identity'))rows=[{account_id:actor.accountId,staff_id:ids.account,login_enabled:true,employment_status:'在职',role:'SALESPERSON',hall_id:actor.hallId,native_hall_id:actor.hallId,hall_enabled:true}];
  else if(sql.includes('normal-document-list:shared'))rows=[{exact_total:'0',history_valid:valid,history_published:true,quantity:'9007199254740993',incoming_quantity:'0',outgoing_quantity:'9007199254740993',gross_amount:null,order_discount:null,net_due:null,items}];
  return{rows,rowCount:rows.length};},release(){}};
 const reader=new PostgresSalesQueryReader({async connect(){return client;}},{profile:'source-confirmed-normal-document-lists-v1',runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(c,p){assert.equal(c,client);assert.equal(p,'HISTORY_READ');}}});
 const parameters={filter:{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:'narrow'},page:2,pageSize:20} as const;
 return {calls,read:()=>reader.readList({actor,parameters:parameters as never,scope:{kind:'all'},signal:new AbortController().signal})};}
test('P03 single materialized candidate/proof returns summary even for an empty deep page, retaining exact numeric text and NULL',async()=>{
 const f=fixture(),r=await f.read();assert.ok('totals'in r);assert.equal(r.totals.quantity,9007199254740993n);assert.equal(r.totals.netDue,null);assert.deepEqual(r.items,[]);
 const queries=f.calls.filter(c=>c.sql.includes('normal-document-list:'));assert.equal(queries.length,1);const sql=queries[0]!.sql;
 assert.equal((sql.match(/matched AS MATERIALIZED/g)??[]).length,1);assert.equal((sql.match(/history_validity AS/g)??[]).length,1);
 assert.match(sql,/total_metrics/);assert.match(sql,/page_metrics/);assert.match(sql,/FROM summary/);assert.match(sql,/coalesce\(\(SELECT jsonb_agg/);
 const proof=sql.slice(sql.indexOf('history_validity AS'),sql.indexOf('all_lines AS'));assert.doesNotMatch(proof,/strpos|LIMIT|OFFSET/);
 assert.deepEqual(queries[0]!.values.slice(-2),[20,'20']);
});
test('P03 corruption outside page filters and malformed JSON items remain fail closed before decoding a page',async()=>{
 await assert.rejects(fixture(false).read(),{code:'INVALID_DATABASE_VALUE'});
 for(const value of [null,{},'[]',42])await assert.rejects(fixture(true,value).read(),{code:'INVALID_DATABASE_VALUE'});
});

test('P03 isolated driver uses explicit supplied client, one RR readonly snapshot, three equality comparisons and bounded EXPLAIN inputs',async()=>{
 const {compareHistoryQuerySlo}=await import('./integration/history-query-slo.integration.test.ts');const calls:string[]=[];
 const result=await compareHistoryQuerySlo({client:{async query(sql){calls.push(sql);return {rows:sql.startsWith('EXPLAIN')?[{plan:'SYNTHETIC'}]:sql==='SELECT old_total'?[{total:'0'}]:sql==='SELECT old_page'?[]:sql==='SELECT new_shared'?[{total:'0',items:[]}]:[]};}},
  baseline:[{sql:'SELECT old_total',values:[]},{sql:'SELECT old_page',values:[]}],candidate:{sql:'SELECT new_shared',values:[]},
  decodeBaseline:r=>({total:r[0]![0]!.total,items:r[1]}),decodeCandidate:r=>r[0],authorization:{target:'SYNTHETIC_ONLY',isolatedNonOwner:true,approved:true},scale:{salesHeaders:28282,transferHeaders:14279,salesLines:80918,transferLines:261641}});
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
 assert.equal(result.baselineMs.length,3);assert.equal(result.candidateMs.length,3);assert.equal(result.plans.length,3);assert.equal(result.cacheResetPerformed,false);
});
