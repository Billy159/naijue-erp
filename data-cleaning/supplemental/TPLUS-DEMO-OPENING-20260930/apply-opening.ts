import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transaction,SOURCE} from '../../../server/runtime/db.ts';
import {RUNTIME} from '../../../server/runtime/runtime.ts';
import {applyDemoOpening} from '../../../server/runtime/opening-inventory.ts';

const plan=JSON.parse(await readFile(new URL('./opening-plan.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(await readFile(new URL('../../../inputs/库存状况表.xlsx',import.meta.url))).digest('hex'),plan.sourceSha256);
const tables=[SOURCE+'.tplus_history_document',SOURCE+'.tplus_history_line',SOURCE+'.tplus_inventory_balance_source',SOURCE+'.variant',RUNTIME+'.generated_barcode',RUNTIME+'.barcode_scheme_supplement',RUNTIME+'.document',RUNTIME+'.revision',RUNTIME+'.movement',RUNTIME+'.inventory_delta'];
async function controls(){return transaction(RUNTIME,async tx=>{
 const values:Record<string,any>={};
 for(const table of tables)values[table]=(await tx.query(`SELECT count(*) n,md5(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text)) hash FROM ${table} t`)).rows[0];
 return values;
});}
const before=await controls();
await writeFile(new URL('./before-controls.json',import.meta.url),JSON.stringify(before,null,2)+'\n');
const applied=await applyDemoOpening(plan),repeat=await applyDemoOpening(plan),after=await controls();
assert.deepEqual(after,before);assert.equal(repeat.applied,false);
const result=await transaction(RUNTIME,async tx=>{
 const row=(await tx.query(`WITH actual AS (SELECT warehouse_id,variant_id,sum(quantity) quantity FROM (SELECT * FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b GROUP BY warehouse_id,variant_id), wanted AS (SELECT * FROM inventory_opening_cell WHERE run_id=$1) SELECT count(*) FILTER(WHERE coalesce(a.quantity,0)<>coalesce(w.quantity,0)) differences,count(*) FILTER(WHERE a.quantity<0) negative_cells FROM actual a FULL JOIN wanted w ON w.warehouse_id=a.warehouse_id AND w.sku_id=a.variant_id`,[plan.revision])).rows[0];
 const quantities=(await tx.query('SELECT unit,sum(quantity)::text quantity,count(*)::int cells FROM inventory_opening_cell WHERE run_id=$1 GROUP BY unit ORDER BY unit',[plan.revision])).rows;
 return {status:'PASS',applied,repeat,sourceAndExistingRuntimeTablesUnchanged:true,differences:Number(row.differences),negativeCells:Number(row.negative_cells),byUnit:quantities};
});
assert.equal(result.differences,0);assert.equal(result.negativeCells,340);
await writeFile(new URL('./opening-application-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
