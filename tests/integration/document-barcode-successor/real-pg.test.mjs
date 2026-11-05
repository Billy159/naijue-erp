/** Executable local-only integration runner. Requires a real, independently
 * prepared disposable synthetic database and a fixture adapter; no fake client,
 * DDL, GRANT, production connection or guessed IDs. See README.md. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { resolveNativeDocumentSpecifications } from '../../../adapters/postgres/src/native-document-specification.ts';
import { randomUUID } from 'node:crypto';
import { generateSkuBarcode } from '../../../packages/application/src/barcode-generation.ts';
const fixturePath=process.env.DOCUMENT_SYNTHETIC_FIXTURE;
if(!fixturePath || !fixturePath.startsWith('/')) throw Error('DOCUMENT_SYNTHETIC_FIXTURE must be an absolute path to the local real-PG fixture module');
const fixture=await import(pathToFileURL(fixturePath).href);
if(typeof fixture.openCase!=='function')throw Error('Fixture must export openCase(mode)');
const modes=['complete-group','missing-barcode-permission','retained-barcode'];
for(const mode of modes)test(`real PostgreSQL document append: ${mode}`,async()=>{
 const f=await fixture.openCase(mode); const {writer,observer,pool,runtime,catalogue,assertBound,productId,spec}=f;
 assert.ok(writer instanceof pg.Client && observer instanceof pg.Client && writer!==observer,'Two actual distinct pg.Client instances required');
 assert.equal(f.isolatedSynthetic,true);assert.equal(typeof f.prepareParent,'function');assert.equal(typeof f.completeParent,'function');
 let began=false;
 const snapshot=async()=>{
  const p=await observer.query('SELECT to_jsonb(p) AS v FROM naijue_erp.product p WHERE p.id=$1::uuid',[productId]);
  const s=await observer.query('SELECT to_jsonb(s) AS v FROM naijue_erp.sku s WHERE s.product_id=$1::uuid ORDER BY s.id',[productId]);
  const b=await observer.query('SELECT to_jsonb(b) AS v FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid ORDER BY b.id',[productId]);
  const a=await observer.query("SELECT to_jsonb(a) AS v FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid ORDER BY a.id",[productId]);
  const r=await observer.query("SELECT to_jsonb(r) AS v FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid ORDER BY r.id",[productId]);
  return {product:p.rows,skus:s.rows,barcodes:b.rows,audits:a.rows,receipts:r.rows};
 };
 try{
  for(const c of [writer,observer]){const r=await c.query('SELECT current_database() AS db');assert.equal(r.rows.length,1);assert.match(r.rows[0].db,/^synthetic_[a-z0-9_]+$/);assert.equal(r.rows[0].db,f.expectedDatabase);}
  const before=await snapshot();
  assert.equal((await writer.query('BEGIN ISOLATION LEVEL READ COMMITTED')).command,'BEGIN');began=true;
  const prepared=await f.prepareParent(writer);assert.ok(prepared.scope && prepared.scope.actor && prepared.scope.documentId);
  const selections=[{spec}],newId=()=>randomUUID();
  const resolve=()=>resolveNativeDocumentSpecifications({pool,client:writer,runtime,catalogue,assertBound},{scope:prepared.scope,selections,newId});
  if(mode==='missing-barcode-permission'){
   const grants=await writer.query("SELECT bool_and(has_column_privilege(current_user,'naijue_erp.sku_barcode',c,'INSERT')) AS allowed FROM unnest(ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled']) c");
   assert.equal(grants.rows[0].allowed,false);await assert.rejects(resolve,{code:'DOCUMENT_BARCODE_SCHEMA_NOT_READY'});
  }else{
   const selected=await resolve();assert.equal(selected.length,1);
   const actual=await writer.query(`SELECT s.id,s.size_id,b.barcode,b.sku_id,p.system_item_code,p.default_barcode_scheme_id,c.code AS color_code,f.code AS fit_code,z.code AS size_code FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id LEFT JOIN naijue_erp.sku_barcode b ON b.sku_id=s.id AND b.barcode_kind='MAIN' WHERE s.product_id=$1::uuid AND s.color_id=$2::uuid AND s.fit_id=$3::uuid ORDER BY s.size_id`,[productId,spec.colorId,spec.fitId]);
   const group=await writer.query('SELECT m.size_id FROM naijue_erp.product p JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id WHERE p.id=$1::uuid ORDER BY m.size_id',[productId]);
   assert.ok(group.rows.length>1,'Fixture must include multiple sizes');assert.deepEqual([...new Set(actual.rows.map(r=>r.size_id))],group.rows.map(r=>r.size_id));
   const previousSkus=new Set(before.skus.map(row=>row.v.id));
   for(const row of actual.rows)if(!previousSkus.has(row.id)){
    assert.equal(row.sku_id,row.id);assert.equal(typeof row.barcode,'string');
    assert.equal(row.barcode,generateSkuBarcode({schemeId:row.default_barcode_scheme_id,productSegment:row.system_item_code,fitCode:row.fit_code,colorCode:row.color_code,sizeCode:row.size_code}));
   }
   await f.completeParent(writer,prepared,selected);assert.equal((await writer.query('SET CONSTRAINTS ALL IMMEDIATE')).command,'SET');
   if(mode==='retained-barcode'){assert.ok(before.barcodes.length>0,'Fixture must contain an old binding');const after=await writer.query('SELECT to_jsonb(b) AS v FROM naijue_erp.sku_barcode b WHERE b.id=$1::uuid',[before.barcodes[0].v.id]);assert.deepEqual(after.rows[0],before.barcodes[0]);}
  }
  assert.equal((await writer.query('ROLLBACK')).command,'ROLLBACK');began=false;
  assert.deepEqual(await snapshot(),before,'fresh observer sees original product, SKU and barcode state after rollback');
 }finally{if(began)await writer.query('ROLLBACK');await f.close();}
});
