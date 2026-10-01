import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {install,command,detail} from './runtime.ts';
import {ensureSpec} from './specs.ts';
import {transaction,SOURCE,DATABASE,identifier} from './db.ts';

const schema='v2_runtime_test_spec_'+randomBytes(4).toString('hex');
const source=async(sql:string,args:any[]=[])=>transaction(schema,tx=>tx.query(sql,args));
try{
 await install(schema);
 const item=(await source(`SELECT p.id product_id,p.code,c.id color_id,c.name color_name FROM ${SOURCE}.product p JOIN ${SOURCE}.variant v ON v.product_id=p.id JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value c ON c.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=c.dimension_id AND d.code='COLOR' WHERE p.code='005CS5371652' AND c.name='灰色' LIMIT 1`)).rows[0];
 assert(item,'source product and color fixture');
 const warehouses=(await source(`SELECT id FROM ${SOURCE}.warehouse ORDER BY id LIMIT 2`)).rows;
 assert.equal(warehouses.length,2);
 const before=Number((await source(`SELECT count(*) n FROM ${SOURCE}.variant WHERE product_id=$1::uuid`,[item.product_id])).rows[0].n);
 const identity={productId:item.product_id,colorId:item.color_id,groupName:'2026年男装上衣尺码组',sizeName:'160/XS'};
 const created=await ensureSpec(identity,schema);
 const repeated=await ensureSpec(identity,schema);
 assert.equal(repeated.skuId,created.skuId,'same row and column resolve to one SKU');
 assert.equal(repeated.sizeId,created.sizeId);
 assert.equal(Number((await source(`SELECT count(*) n FROM ${SOURCE}.variant WHERE product_id=$1::uuid`,[item.product_id])).rows[0].n),before,'imported variants stay unchanged');
 const documentId=randomUUID(),requestKey=randomUUID();
 const body={header:{business_date:'2026-09-28',source_number:'V2-DB-SPEC-'+documentId.slice(0,8)},lines:[{source_id:'spec-test-line',sku_id:created.skuId,product_id:item.product_id,color_id:item.color_id,size_id:created.sizeId,source_product_code:item.code,source_product_name:'规格验证',source_color_name:item.color_name,source_size_name:'160/XS',source_quantity:'2',from_warehouse_id:warehouses[0].id,to_warehouse_id:warehouses[1].id,unit:'件',source_lineage:{kind:'V2_SPEC_TEST'}}],fundsRecords:[]};
 const saved=await command({documentId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey,body},{schema});
 assert.equal(saved.document.status,'UNAUDITED');
 const approved=await command({documentId,operation:'approve',expectedVersion:saved.document.version,requestKey:requestKey+':approve'},{schema});
 assert.equal(approved.document.status,'APPROVED');
 const stock=(await source('SELECT warehouse_id,quantity::text FROM inventory_delta WHERE sku_id=$1::uuid ORDER BY warehouse_id',[created.skuId])).rows;
 assert.deepEqual(stock.map(x=>Number(x.quantity)).sort((a,b)=>a-b),[-2,2]);
 const loaded=await detail(documentId,schema);
 assert.equal(loaded.body.lines[0].size_id,created.sizeId);
 assert.equal(loaded.body.lines[0].source_size_name,'160/XS');
 const undone=await command({documentId,operation:'unapprove',expectedVersion:approved.document.version,requestKey:requestKey+':unapprove'},{schema});
 assert.equal(undone.document.status,'UNAUDITED');
 const neutral=(await source('SELECT quantity::text FROM inventory_delta WHERE sku_id=$1::uuid',[created.skuId])).rows;
 assert(neutral.every(x=>Number(x.quantity)===0),'unapproval reverses new-SKU stock movements');
 console.log('transfer missing size combination persists, posts stock, and reverses PASS');
}finally{
 execFileSync(process.env.PSQL_BIN||'psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',process.env.POSTGRES_HOST||'127.0.0.1','-p',process.env.POSTGRES_PORT||'5432','-U',process.env.POSTGRES_USER||process.env.USER!,'-d',DATABASE,'-c',`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`]);
}
