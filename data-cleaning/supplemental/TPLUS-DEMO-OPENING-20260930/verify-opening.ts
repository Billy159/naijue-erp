import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {transaction,SOURCE,identifier} from '../../../server/runtime/db.ts';
import {install,command,RUNTIME} from '../../../server/runtime/runtime.ts';
import {applyDemoOpening} from '../../../server/runtime/opening-inventory.ts';
import {ledger} from '../../../server/runtime/ledger.ts';
import {currentSizeGroups} from '../../../frontend/product-size-groups.mjs';

const plan=JSON.parse(await readFile(new URL('./opening-plan.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(await readFile(new URL('../../../inputs/库存状况表.xlsx',import.meta.url))).digest('hex'),plan.sourceSha256);
const schema='v2_runtime_test_opening_'+randomUUID().replaceAll('-','').slice(0,12);
const key=plan.cells[0],to=plan.cells.find((x:any)=>x.warehouseId!==key.warehouseId)!.warehouseId;
const query=(sql:string,args:any[]=[])=>transaction(schema,tx=>tx.query(sql,args));
const stock=async(warehouse=key.warehouseId)=>Number((await query(`SELECT coalesce(sum(quantity),0) quantity FROM (SELECT warehouse_id,variant_id,quantity FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b WHERE warehouse_id=$1::uuid AND variant_id=$2::uuid`,[warehouse,key.skuId])).rows[0].quantity);
const sourceHash=async()=>transaction(RUNTIME,async tx=>(await tx.query(`SELECT md5(string_agg(to_jsonb(v)::text,E'\n' ORDER BY v.warehouse_id,v.variant_id)) hash FROM ${SOURCE}.tplus_inventory_balance_source v`)).rows[0].hash);
const beforeHash=await sourceHash();
await install(schema);
try{
 // A previous test posting/delta must be absorbed, not replayed on the snapshot.
 await query('INSERT INTO inventory_delta VALUES($1::uuid,$2::uuid,7) RETURNING sku_id',[key.warehouseId,key.skuId]);
 const applied=await applyDemoOpening(plan,schema);assert.equal(applied.applied,true);
 assert.equal(await stock(),Number(key.quantity));
 assert.equal((await applyDemoOpening(plan,schema)).applied,false);
 const initialLedger=await ledger({sku:key.skuId,warehouse:key.warehouseId},schema);
 assert.equal(Number(initialLedger.quantity),Number(key.quantity));
 assert.equal(initialLedger.items.find((x:any)=>x.document_type==='OPENING')?.after,Number(key.quantity));
 for(const row of initialLedger.items.filter((x:any)=>x.historical_only))assert.equal(row.after,null);
 const destination=await stock(to),id=randomUUID();
 const body={header:{business_date:'2026-09-30',source_number:'DEMO-OPENING-VERIFICATION'},lines:[{source_id:'verification-1',sku_id:key.skuId,from_warehouse_id:key.warehouseId,to_warehouse_id:to,source_quantity:'1'}],fundsRecords:[]};
 const create=await command({documentId:id,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'create',body},{schema});
 assert.equal(await stock(),Number(key.quantity));
 const approved=await command({documentId:id,operation:'approve',expectedVersion:create.document.version,requestKey:'approve'},{schema});
 assert.equal(await stock(),Number(key.quantity)-1);assert.equal(await stock(to),destination+1);
 assert.equal(Number((await ledger({sku:key.skuId,warehouse:key.warehouseId},schema)).quantity),Number(key.quantity)-1);
 await command({documentId:id,operation:'unapprove',expectedVersion:approved.document.version,requestKey:'unapprove'},{schema});
 assert.equal(await stock(),Number(key.quantity));assert.equal(await stock(to),destination);
 const differences=Number((await query(`WITH actual AS (SELECT warehouse_id,variant_id,sum(quantity) quantity FROM (SELECT * FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b GROUP BY warehouse_id,variant_id), wanted AS (SELECT warehouse_id,sku_id,quantity FROM inventory_opening_cell WHERE run_id=$1) SELECT count(*) n FROM actual a FULL JOIN wanted w ON a.warehouse_id=w.warehouse_id AND a.variant_id=w.sku_id WHERE coalesce(a.quantity,0)<>coalesce(w.quantity,0)`,[plan.revision])).rows[0].n);
 assert.equal(differences,0);assert.equal(await sourceHash(),beforeHash);
 assert.deepEqual(currentSizeGroups().map((g:any)=>g.name),['男装上衣尺码','男装裤子尺码','女装尺码组','鞋码','童装尺码','配饰均码']);
 const result={status:'PASS',sourceCells:plan.cells.length,warehouses:plan.controls.warehouses,negativeCells:plan.controls.quantitySigns.negative,unmatchedCells:plan.issues.length,stockDifferencesAfterApproveAndUnapprove:differences,sourceUnchanged:true,repeatApplicationWrites:0,tests:['snapshot replaces historical reconstruction','previous runtime delta is checkpointed','pending transfer does not change stock','new approval changes both warehouses once','unapproval restores the snapshot','ledger starts from opening and preserves history','six current size groups are available']};
 await writeFile(new URL('./opening-test-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await transaction(RUNTIME,tx=>tx.execute('DROP SCHEMA '+identifier(schema)+' CASCADE'));}
