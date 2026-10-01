import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transaction,SOURCE} from './db.ts';

test('optimized inventory ranges retain quantities, zero-only colors, null bounds and pagination',async()=>{
 const source=readFileSync(new URL('./http.ts',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf("if(url.pathname==='/runtime/inventory')"),source.indexOf("if(url.pathname==='/runtime/stock')"));
 const template=handler.split('q(`')[1].split('`,[JSON.stringify(codes)')[0];
 const query=new Function('SOURCE','unit','page','size','return `'+template+'`;');
 await transaction('v2_runtime_stage03c',async tx=>{
  const variants=(await tx.query(`SELECT v.id,p.code,c.spec_value_id color_id,z.spec_value_id size_id FROM ${SOURCE}.variant v JOIN ${SOURCE}.product p ON p.id=v.product_id JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension cd ON cd.id=c.dimension_id AND cd.code='COLOR' JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id JOIN ${SOURCE}.spec_dimension zd ON zd.id=z.dimension_id AND zd.code='SIZE' WHERE p.code='026MS5133001' ORDER BY c.spec_value_id,z.spec_value_id`)).rows;
  assert(variants.length>2);const first=variants[0],second=variants.find(v=>v.color_id!==first.color_id);assert(second);
  await tx.execute('CREATE TEMP TABLE inventory_balance_base(warehouse_id uuid,variant_id uuid,quantity numeric) ON COMMIT DROP; CREATE TEMP TABLE inventory_delta(warehouse_id uuid,sku_id uuid,quantity numeric) ON COMMIT DROP; CREATE TEMP TABLE variant_overlay(id uuid,product_id uuid,color_id uuid,size_id uuid) ON COMMIT DROP; CREATE TEMP TABLE product_overlay(id uuid,code text,deleted boolean) ON COMMIT DROP');
  const warehouses=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];
  await tx.query('INSERT INTO inventory_balance_base VALUES ($1,$2,-3),($3,$2,8),($1,$4,0) RETURNING variant_id',[warehouses[0],first.id,warehouses[1],second.id]);
  const args=[JSON.stringify([first.code]),JSON.stringify(warehouses)];
  const result=(await tx.query(query(SOURCE,'product',1,100),args)).rows[0].data;
  assert.equal(result.total,5);assert.equal(result.rowCount,2);assert.equal(result.productCount,1);
  assert.deepEqual(result.rows.map(r=>Number(r.total)),[-3,8]);
  const zero=result.colors.find(c=>c.color_id===second.color_id);assert(zero);assert.equal(Number(zero.cols[second.size_id]),0);assert.equal(zero.first,null);assert.equal(zero.last,null);
  assert.equal(result.products[0].first,0);assert.equal(result.products[0].last,1);
  const next=(await tx.query(query(SOURCE,'product',2,100),args)).rows[0].data;assert.equal(next.rows.length,0);assert.equal(next.total,5);assert.equal(next.productCount,1);
  const rowPage=(await tx.query(query(SOURCE,'row',1,100),args)).rows[0].data;assert.deepEqual(rowPage.rows,result.rows);
  const empty=(await tx.query(query(SOURCE,'product',1,100),[JSON.stringify([]),JSON.stringify(warehouses)])).rows[0].data;assert.equal(empty.total,0);assert.equal(empty.productCount,0);
 });
});
