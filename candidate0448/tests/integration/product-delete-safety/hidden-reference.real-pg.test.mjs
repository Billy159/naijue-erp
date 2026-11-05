/** Explicit disposable synthetic PostgreSQL negative test. Never installs schema,
 * grants permissions, creates fixtures, commits a product write, or contacts a
 * non-loopback target. Absence of a configured target is a hard failure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { parseDeleteSafetyTarget } from './target.mjs';
import { createRuntime27CommandIssuer } from '../../../adapters/postgres/src/runtime27-command-issuer.ts';
import { PostgresMaintenanceCommandUnitOfWork } from '../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { createOrdinary27ProductCapacityFactory } from '../../../adapters/postgres/src/ordinary27-product-capacity.ts';
import { PostgresProductMaintenanceUnitOfWork } from '../../../adapters/postgres/src/product-maintenance-store.ts';
import { createProductMaintenanceService } from '../../../packages/application/src/product-maintenance-service.ts';

if(process.env.PGOPTIONS)throw Error('PGOPTIONS_NOT_ALLOWED_FOR_SYNTHETIC_TEST');
const c=parseDeleteSafetyTarget(process.env.PRODUCT_DELETE_SYNTHETIC_PG);
const base={host:c.host,port:c.port,database:c.database,ssl:false,connectionTimeoutMillis:3000,statement_timeout:15000};
const identitySql=`SELECT current_database() AS db,pg_catalog.host(pg_catalog.inet_server_addr()) AS host,inet_server_port() AS port,d.oid::text AS oid,pg_postmaster_start_time()::text AS started FROM pg_catalog.pg_database d WHERE d.datname=current_database()`;
const snapshotSql=`SELECT (SELECT to_jsonb(p)::text FROM naijue_erp.product p WHERE p.id=$1::uuid) AS product,
 (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]')::text FROM naijue_erp.sku s WHERE s.product_id=$1::uuid) AS skus,
 (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]')::text FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid) AS barcodes,
 (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]')::text FROM naijue_erp.product_image i WHERE i.product_id=$1::uuid) AS images,
 (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.warehouse_id,b.sku_id),'[]')::text FROM naijue_erp.inventory_balance b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid) AS balances,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')::text FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid) AS ledger,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')::text FROM naijue_erp.sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid) AS sales_lines,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')::text FROM naijue_erp.transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid) AS transfer_lines,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')::text FROM naijue_erp.history_sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid) AS historical_sales_lines,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')::text FROM naijue_erp.history_transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid) AS historical_transfer_lines,
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]')::text FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid) AS audits,
 (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]')::text FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid) AS receipts`;

test(`SKU deletion fails closed: ${c.scenario}`,async()=>{
 const observer=new pg.Client({...base,user:c.observer.user,password:c.observer.password,application_name:'synthetic_delete_observer'});
 const native=new pg.Pool({...base,user:c.runtime.user,password:c.runtime.password,max:1,application_name:'synthetic_delete_runtime'});
 try {
  await observer.connect();await observer.query('SET default_transaction_read_only=on');await observer.query('SET row_security=off');
  const observed=(await observer.query(identitySql)).rows[0];assert.ok(observed);assert.equal(observed.db,c.database);assert.equal(observed.host,c.host);assert.equal(observed.port,c.port);
  const other=(await observer.query('SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity WHERE datid=$1::oid AND pid<>pg_backend_pid()',[observed.oid])).rows[0];assert.equal(other.count,0,'disposable database must be exclusive before test');
  const inspect=await observer.query(`SELECT p.version,p.deleted_at,(SELECT count(*)::text FROM naijue_erp.sku s WHERE s.product_id=p.id) AS sku_count,
   (SELECT count(*)::text FROM naijue_erp.warehouse) AS warehouse_count,
   (SELECT count(*)::text FROM naijue_erp.sku s CROSS JOIN naijue_erp.warehouse w LEFT JOIN naijue_erp.inventory_balance b ON b.sku_id=s.id AND b.warehouse_id=w.id WHERE s.product_id=p.id AND b.sku_id IS NOT NULL AND b.quantity<>0) AS nonzero_balances,
   (SELECT count(*)::text FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=p.id) AS barcode_count,
   (SELECT count(*)::text FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=p.id) AS ledger_count,
   ((SELECT count(*) FROM naijue_erp.sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=p.id)+(SELECT count(*) FROM naijue_erp.transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=p.id)+(SELECT count(*) FROM naijue_erp.history_sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=p.id)+(SELECT count(*) FROM naijue_erp.history_transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=p.id))::text AS all_refs,
   ((SELECT count(*) FROM naijue_erp.sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id JOIN naijue_erp.sales_header h ON h.id=l.sales_id JOIN naijue_erp.import_batch b ON b.id=h.import_batch_id WHERE s.product_id=p.id AND b.status<>'IMPORTED')+
    (SELECT count(*) FROM naijue_erp.transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id JOIN naijue_erp.transfer_header h ON h.id=l.transfer_id JOIN naijue_erp.import_batch b ON b.id=h.import_batch_id WHERE s.product_id=p.id AND b.status<>'IMPORTED'))::text AS hidden_refs
   FROM naijue_erp.product p WHERE p.id=$1::uuid`,[c.productId]);
  assert.equal(inspect.rows.length,1);const before=inspect.rows[0];assert.equal(before.deleted_at,null);assert.ok(BigInt(before.sku_count)>0n);assert.ok(BigInt(before.warehouse_count)>0n);assert.equal(before.nonzero_balances,'0');assert.ok(BigInt(before.sku_count)*BigInt(before.warehouse_count)<=10000n,'synthetic matrix must be bounded');assert.equal(before.barcode_count,'0');assert.equal(before.ledger_count,'0');if(c.scenario==='hidden-reference')assert.ok(BigInt(before.hidden_refs)>0n,'fixture must actually contain a hidden staged reference');else assert.equal(before.all_refs,'0','eligible fixture must have no document or historical references');
  const original=(await observer.query(snapshotSql,[c.productId])).rows[0];
  const checkedPool={async connect(){const raw=await native.connect();try{const found=(await raw.query(identitySql)).rows[0];assert.deepEqual(found,observed);return raw;}catch(error){raw.release(true);throw error;}}};
  const issuer=createRuntime27CommandIssuer(checkedPool,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
  const lease=await issuer.pool.connect();let started=false;
  try{await lease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');started=true;await issuer.ordinaryRead.assertReady(lease,'ORDINARY_DOCUMENT_READ');
   const zero=await lease.query(`SELECT count(*)::text AS keys,count(*) FILTER(WHERE (b.sku_id IS NOT NULL AND b.quantity<>0) OR (b.sku_id IS NULL AND naijue_erp.standard_inventory_key_proof(w.id,s.id)->>'state' IS DISTINCT FROM 'EXPLICIT_ZERO'))::text AS unknown_or_nonzero FROM naijue_erp.sku s CROSS JOIN naijue_erp.warehouse w LEFT JOIN naijue_erp.inventory_balance b ON b.sku_id=s.id AND b.warehouse_id=w.id WHERE s.product_id=$1::uuid`,[c.productId]);
   assert.equal(zero.rows.length,1);assert.equal(BigInt(zero.rows[0].keys),BigInt(before.sku_count)*BigInt(before.warehouse_count));assert.equal(zero.rows[0].unknown_or_nonzero,'0','every balance must be explicit zero or have the existing EXPLICIT_ZERO baseline proof');
   const visible=await lease.query(`SELECT ((SELECT count(*) FROM naijue_erp.sales_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid)+(SELECT count(*) FROM naijue_erp.transfer_line l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=$1::uuid))::text AS refs`,[c.productId]);assert.equal(visible.rows[0].refs,'0','runtime must see no product document references in this fixture');
   await lease.query('ROLLBACK');started=false;
  }finally{if(started)await lease.query('ROLLBACK');lease.release(true);}
  const driver=new PostgresMaintenanceCommandUnitOfWork(issuer.pool),capacity=createOrdinary27ProductCapacityFactory(issuer.pool,issuer.runtime27),actual=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:capacity,deletionGuard:null});
  // Even an accidental future success must roll back, never commit the test write.
  const sentinel=Error('UNEXPECTED_DELETE_ROLLED_BACK');const guarded={seasonContract:actual.seasonContract,transaction(work){return actual.transaction(async tx=>{await work(tx);throw sentinel;});}};
  const service=createProductMaintenanceService({unitOfWork:guarded,now:()=>new Date().toISOString(),newId:()=>randomUUID()});
  let outcome;
  try { await service.execute({accountId:c.actorAccountId,hallId:null},{action:'DELETE',requestKey:`synthetic-delete-${randomUUID()}`,id:c.productId,expectedVersion:before.version}); }
  catch (error) { outcome=error; }
  assert.deepEqual((await observer.query(snapshotSql,[c.productId])).rows[0],original,'product and evidence must remain unchanged');
  assert.equal(outcome?.code,'PRODUCT_DELETE_NOT_READY','SKU-bearing deletion must remain unavailable');
 }finally{await native.end();await observer.end();}
});
