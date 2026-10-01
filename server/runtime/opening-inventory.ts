import {readFile} from 'node:fs/promises';
import {transaction, SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';

/** Installed explicitly, never by an inventory read or page load. */
export async function installOpeningInventory(schema=RUNTIME){
 const sql=(await readFile(new URL('./opening-inventory.sql',import.meta.url),'utf8')).replaceAll('__SOURCE__',SOURCE);
 await transaction(schema,tx=>tx.execute(sql));
}

export async function applyDemoOpening(plan:any,schema=RUNTIME){
 if((schema!==RUNTIME&&!schema.startsWith('v2_runtime_test_'))||plan.mode!=='DEMO_ONLY'||plan.revision!=='demo-opening-existing-tplus-20260930-v1'||plan.issues?.length||plan.cells.length!==32430)throw Error('UNCONFIRMED_OPENING_PLAN');
 await installOpeningInventory(schema);
 return transaction(schema,async tx=>{
  // Runtime commands write posting before inventory_delta: use that same lock order.
  await tx.execute('LOCK TABLE posting,inventory_delta IN SHARE ROW EXCLUSIVE MODE');
  const existing=(await tx.query('SELECT id,active,source_sha256 FROM inventory_opening_run WHERE id=$1',[plan.revision])).rows[0];
  if(existing){if(existing.source_sha256!==plan.sourceSha256||!existing.active)throw Error('OPENING_REVISION_CONFLICT');return {applied:false,revision:plan.revision};}
  const invalid=(await tx.query(`SELECT count(*) n FROM jsonb_array_elements($1::jsonb)x WHERE NOT EXISTS(SELECT 1 FROM ${SOURCE}.variant WHERE id=(x->>'skuId')::uuid) OR NOT EXISTS(SELECT 1 FROM ${SOURCE}.warehouse WHERE id=(x->>'warehouseId')::uuid)`,[JSON.stringify(plan.cells)])).rows[0];
  if(Number(invalid.n))throw Error('UNKNOWN_OPENING_IDENTITY');
  const metadata={...plan};delete metadata.cells;delete metadata.issues;
  await tx.query('INSERT INTO inventory_opening_run(id,source_sha256,source_file,mode,body) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id',[plan.revision,plan.sourceSha256,plan.sourceFile,plan.mode,JSON.stringify(metadata)]);
  await tx.query(`INSERT INTO inventory_opening_cell SELECT $1,(x->>'warehouseId')::uuid,(x->>'skuId')::uuid,(x->>'quantity')::numeric,x->>'unit',x->>'sourceCell',x FROM jsonb_array_elements($2::jsonb)x RETURNING source_cell`,[plan.revision,JSON.stringify(plan.cells)]);
  await tx.query('INSERT INTO inventory_opening_delta_checkpoint SELECT $1,warehouse_id,sku_id,quantity FROM inventory_delta RETURNING sku_id',[plan.revision]);
  await tx.query('INSERT INTO inventory_opening_prior_posting SELECT $1,id FROM posting RETURNING posting_id',[plan.revision]);
  await tx.query('UPDATE inventory_opening_run SET active=false WHERE active RETURNING id');
  await tx.query('UPDATE inventory_opening_run SET active=true WHERE id=$1 RETURNING id',[plan.revision]);
  const diff=(await tx.query(`WITH actual AS (SELECT warehouse_id,variant_id,sum(quantity) q FROM (SELECT * FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b GROUP BY warehouse_id,variant_id), wanted AS (SELECT warehouse_id,sku_id,quantity FROM inventory_opening_cell WHERE run_id=$1) SELECT count(*) n FROM actual a FULL JOIN wanted w ON w.warehouse_id=a.warehouse_id AND w.sku_id=a.variant_id WHERE coalesce(a.q,0)<>coalesce(w.quantity,0)`,[plan.revision])).rows[0];
  if(Number(diff.n))throw Error('OPENING_QUANTITY_MISMATCH');
  return {applied:true,revision:plan.revision,cells:plan.cells.length,warehouses:plan.controls.warehouses,byUnit:plan.controls.byUnit};
 });
}
