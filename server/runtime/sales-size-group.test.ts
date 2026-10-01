import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {install,command,detail} from './runtime.ts';
import {ensureSpec} from './specs.ts';
import {transaction,SOURCE,DATABASE,identifier} from './db.ts';

const schema='v2_runtime_test_sale_group_'+randomBytes(4).toString('hex');
const sql=(query:string,args:any[]=[])=>transaction(schema,tx=>tx.query(query,args));
async function sourceFacts(){return (await sql(`SELECT
 (SELECT md5(string_agg(row_to_json(v)::text,',' ORDER BY id)) FROM ${SOURCE}.variant v) variants,
 (SELECT md5(string_agg(row_to_json(s)::text,',' ORDER BY id)) FROM ${SOURCE}.spec_value s) sizes,
 (SELECT md5(string_agg(source_record_sha256,'' ORDER BY source_id)) FROM ${SOURCE}.tplus_history_line) history,
 (SELECT md5(string_agg(variant_id||':'||warehouse_id||':'||quantity,',' ORDER BY variant_id,warehouse_id)) FROM ${SOURCE}.tplus_inventory_balance_source) balances`)).rows;}
try{
 await install(schema);
 const before=await sourceFacts();
 const item=(await sql(`SELECT p.id product_id,p.code,c.id color_id,c.name color_name FROM ${SOURCE}.product p JOIN ${SOURCE}.variant v ON v.product_id=p.id JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value c ON c.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=c.dimension_id AND d.code='COLOR' WHERE p.code='026MS5133001' AND c.name='大红色' LIMIT 1`)).rows[0];
 assert(item,'actual requested product and color exist');
 const warehouse=(await sql(`SELECT id FROM ${SOURCE}.warehouse ORDER BY id LIMIT 1`)).rows[0].id;
 const payment=(await sql(`SELECT primary_payment_method_id payment_method_id,id fund_account_id FROM ${SOURCE}.tplus_fund_account WHERE primary_payment_method_id IS NOT NULL LIMIT 1`)).rows[0];
 const identity={productId:item.product_id,colorId:item.color_id,groupName:'男装上衣尺码',sizeName:'160/XS',sizeCode:'201',fitId:'A'};
 const spec=await ensureSpec(identity,schema);
 assert.deepEqual(await ensureSpec(identity,schema),spec,'repeating the exact group combination is idempotent');
 const documentId=randomUUID(),requestKey=randomUUID();
 const body={header:{business_date:'2026-10-01',source_number:'V2-SALE-GROUP-'+documentId.slice(0,8),adjustment:0},
  lines:[{source_id:'group-test-line',sku_id:spec.skuId,product_id:item.product_id,color_id:item.color_id,size_id:spec.sizeId,
   source_product_code:item.code,source_product_name:'针织衫',source_color_name:item.color_name,source_size_name:'160/XS',
   source_quantity:'2',unit_price:'898',amount:'1796',warehouse_id:warehouse,unit:'件',source_lineage:{kind:'V2_SALE_GROUP_TEST'}}],
  fundsRecords:[{...payment,source_id:'payment-one',amount:'100',direction:'receipt'},
   {...payment,source_id:'payment-two',amount:'1696',direction:'receipt'}]};
 const request={documentId,documentType:'SALE',operation:'create' as const,expectedVersion:0,requestKey,body};
 const saved=await command(request,{schema});
 assert.equal(saved.document.status,'UNAUDITED');
 assert.deepEqual(await command(request,{schema}),saved);
 assert.equal(Number((await sql('SELECT count(*) n FROM inventory_delta')).rows[0].n),0,'saving a draft does not post stock');
 const approve={documentId,operation:'approve' as const,expectedVersion:saved.document.version,requestKey:requestKey+':approve'};
 const approved=await command(approve,{schema});
 assert.deepEqual(await command(approve,{schema}),approved,'repeating approval does not post twice');
 const stock=(await sql('SELECT quantity::text FROM inventory_delta WHERE sku_id=$1::uuid AND warehouse_id=$2::uuid',[spec.skuId,warehouse])).rows;
 assert.deepEqual(stock.map(x=>Number(x.quantity)),[-2]);
 const loaded=await detail(documentId,schema);
 assert.equal(loaded.body.lines[0].sku_id,spec.skuId);
 assert.equal(loaded.body.lines[0].size_id,spec.sizeId);
 assert.equal(loaded.body.lines[0].source_size_name,'160/XS');
 assert.deepEqual(loaded.body.fundsRecords.map(x=>x.amount),['100','1696'],'both receipts keep their amounts and order');
 await command({documentId,operation:'unapprove',expectedVersion:approved.document.version,requestKey:requestKey+':unapprove'},{schema});
 assert((await sql('SELECT quantity::text FROM inventory_delta WHERE sku_id=$1::uuid',[spec.skuId])).rows.every(x=>Number(x.quantity)===0));
 assert.deepEqual(await sourceFacts(),before,'all original variant, size, stock and historical-line facts remain unchanged');
 console.log('026MS5133001 / 160 XS sales save, two receipts, approve, retry, reverse and unchanged source facts: PASS');
}finally{
 execFileSync(process.env.PSQL_BIN||'psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',process.env.POSTGRES_HOST||'127.0.0.1','-p',process.env.POSTGRES_PORT||'5432','-U',process.env.POSTGRES_USER||process.env.USER!,'-d',DATABASE,'-c',`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`]);
}
