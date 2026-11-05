/** Actual emitted category CTE on isolated PostgreSQL. NOT full runtime26/authorization acceptance.
 * No DDL, migrations, issuer creation or business writes. Compile-only doubles collect reader SQL.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {PostgresSalesQueryReader} from '../../adapters/postgres/src/sales-query-reader.ts';
import {PostgresTransferQueryReader} from '../../adapters/postgres/src/transfer-query-reader.ts';
import {actor,ids} from '../support/synthetic-fixtures.ts';
const output=process.argv[2];if(!output)throw new Error('Explicit evidence output required');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function compiled(kind){let emitted='';const client={async query(sql){let rows=[];if(sql.includes('read-authorization:identity'))rows=[{account_id:actor.accountId,staff_id:ids.account,login_enabled:true,employment_status:'在职',role:'ADMIN',hall_id:actor.hallId,native_hall_id:actor.hallId,hall_enabled:true}];else if(sql.includes('normal-document-list:shared')){emitted=sql;rows=[{exact_total:'0',history_valid:true,history_published:false,quantity:'0',incoming_quantity:'0',outgoing_quantity:'0',gross_amount:'0',order_discount:'0',net_due:'0',items:[]}];}return {rows,rowCount:rows.length};},release(){}};
 const options={profile:'source-confirmed-normal-document-lists-v1',runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){/* Compiler-only double, never used for PostgreSQL acceptance. */}}};
 const Reader=kind==='sales'?PostgresSalesQueryReader:PostgresTransferQueryReader;
 const filter=kind==='sales'?{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null}:{startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
 await new Reader({async connect(){return client;}},options).readList({actor,parameters:{filter,page:1,pageSize:20},scope:{kind:'all'},signal:new AbortController().signal});
 const a=emitted.indexOf('category_groups AS'),b=emitted.indexOf('products AS',a);assert.ok(a>0&&b>a);return {emitted,fragment:emitted.slice(a,b).trim().replace(/,$/,'')};
}
const inputs=[];let line=0;
function add(doc,cat,product,quantity,gift=false,dataset='LIVE'){inputs.push({dataset,batch_id:dataset==='LIVE'?null:id(999),document_id:id(doc),line_no:++line,category_id:cat===null?null:id(cat),category_name:cat===null?null:cat===70||cat===71?'同名':'分类'+cat,product_id:product===null?null:id(product),quantity,is_gift:gift});}
add(1,70,100,'9007199254740993');add(1,70,100,'-3');add(1,70,101,'999',true);add(1,71,102,'-5');add(1,null,103,'2');
add(2,70,100,'3');add(2,70,100,'7');add(2,70,101,'0');add(2,70,102,'-2');add(2,71,103,'4');
for(let cat=80;cat<85;cat++)add(3,cat,cat+100,'1');
add(4,70,100,'8');add(4,70,100,'-8');add(5,70,100,'100',false,'HISTORY');
const client=new pg.Client({host:'/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket',port:55439,user:'erp_test_owner',database:'erp_synthetic',password:undefined,connectionTimeoutMillis:5000});
const result={scope:'ACTUAL_CATEGORY_CTE_ONLY_NOT_RUNTIME26_ACCEPTANCE',checks:[],queries:[]};
try{await client.connect();const identity=(await client.query("SELECT current_database() AS db,current_setting('listen_addresses') AS listen,current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS sync")).rows[0];assert.deepEqual(identity,{db:'erp_synthetic',listen:'',fsync:'on',sync:'on'});result.identity=identity;await client.query('BEGIN READ ONLY');
 for(const kind of ['sales','transfer']){const {emitted,fragment}=await compiled(kind);const sql=`WITH page_lines AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(dataset text,batch_id uuid,document_id uuid,line_no integer,category_id uuid,category_name text,product_id uuid,quantity numeric,is_gift boolean)),${fragment} SELECT * FROM category_summaries ORDER BY document_id`;
 const rows=(await client.query(sql,[JSON.stringify(inputs)])).rows;const row=n=>rows.find(r=>r.document_id===id(n));
 assert.equal(row(5),undefined,'HISTORY must never be classified from current categories');assert.equal(row(3).category_items.length,3);assert.equal(row(3).category_has_more,true);
 if(kind==='sales'){assert.deepEqual(row(1).category_items.map(x=>x.value),['9007199254740990','-5','2']);assert.notEqual(row(1).category_items[0].categoryId,row(1).category_items[1].categoryId);assert.equal(row(4),undefined,'net-zero category hidden');}
 else{assert.deepEqual(row(2).category_items.map(x=>x.value),['1','1']);assert.equal(row(1).category_items[0].value,'2');}
 result.checks.push({kind,pass:true,rows});result.queries.push({kind,emittedSha256:createHash('sha256').update(emitted).digest('hex'),sql});
 }
 await client.query('ROLLBACK');result.status='PASS';
}catch(error){result.status='FAIL';result.error=String(error);try{await client.query('ROLLBACK');}catch{};process.exitCode=1;}finally{await client.end();await writeFile(output,JSON.stringify(result,null,2));console.log(result.status,result.scope);}
