/** Existing whole-package PG runner extension. Setup is owned by T45: actual
 * isolated installation/clients and original host admission, never model booleans.
 * This file does not connect, install, grant, start/stop a server or read secrets.
 * SQL/function boundaries are tested here; formal release entry is a separate check. */
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {snapshotSyntheticDatabase} from '../fixtures/unified-import/whole-package-synthetic.ts';
import {createRuntime27CommandIssuer} from '../../adapters/postgres/src/runtime27-command-issuer.ts';
import {PostgresSalesUnitOfWork} from '../../adapters/postgres/src/sales-unit-of-work.ts';
import {PostgresTransferUnitOfWork} from '../../adapters/postgres/src/transfer-unit-of-work.ts';
import {createSalesService} from '../../packages/application/src/sales-service.ts';
import {createSalesActionAuthorization} from '../../packages/application/src/sales-authorization.ts';
import {createNativeTransactionSalesBusinessRules} from '../../packages/application/src/sales-native-facts.ts';
import {createTransferService} from '../../packages/application/src/transfer-service.ts';
import {createSourceConfirmedTransferAuthorization,createSourceConfirmedTransferReferences} from '../../packages/application/src/transfer-policy.ts';
export const BASELINE_SCOPE_PG_MODES=Object.freeze(['baseline-scope-combined']);
const phases={masterChunk:'MASTER',baselineKeys:'KEYS',documentChunk:'DOCUMENTS',publish:'PUBLISH'};
const runtimeRole='erp_unified27_runtime_2393dbc6db9581c2';
async function ack(c,sql,expected){assert.equal((await c.query(sql)).command,expected);}
async function call(c,sql,values){const r=await c.query(sql,values);assert.equal(r.rowCount,1);return r.rows[0].result;}
async function ordinary(c,database){
 const r=await c.query(`SELECT current_database() db,session_user,current_user,
  r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
  r.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') owner
  FROM pg_roles r WHERE r.rolname=session_user`),x=r.rows[0];
 assert.equal(r.rows.length,1);assert.equal(x.db,database);for(const k of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','owner'])assert.equal(x[k],false,k);
}
async function proof(f,warehouse,sku){
 const c=await f.runtimePool.connect();let began=false;
 try{await ordinary(c,f.database);await ack(c,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','BEGIN');began=true;await ack(c,'SET LOCAL ROLE '+runtimeRole,'SET');
  const r=await c.query("SELECT current_user role,naijue_erp.standard_inventory_key_proof($1::uuid,$2::uuid)->>'state' state",[warehouse,sku]);assert.equal(r.rows.length,1);assert.equal(r.rows[0].role,runtimeRole);
  await ack(c,'ROLLBACK','ROLLBACK');began=false;return r.rows[0].state;
 }finally{try{if(began)await c.query('ROLLBACK');}finally{c.release(true);}}
}
async function publish(f,initialize=f.fixture.initialize,beforeStep){
 const w=f.writer;let began=false;
 try{await ack(w,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;await ack(w,'SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2','SET');
  await call(w,'SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text) result',[initialize,f.encodedScrypt]);await ack(w,'SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2','SET');
  let ordinal=0;for(const step of f.fixture.steps){await beforeStep?.(step);await call(w,'SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb) result',[initialize.operation_id,++ordinal,phases[step.method],step.request]);}
  const pending=await call(w,'SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid) result',[initialize.operation_id]);assert.equal(pending.state,'PENDING_TRANSACTION');
  await ack(w,'SET CONSTRAINTS ALL IMMEDIATE','SET');await ack(w,'COMMIT','COMMIT');began=false;return pending;
 }finally{if(began)await ack(w,'ROLLBACK','ROLLBACK');}
}
async function current(f){return (await f.observer.query(`SELECT w.id warehouse_id,b.quantity::text quantity,b.version,
 (SELECT count(*)::integer FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=$1::uuid) ledger_count
 FROM naijue_erp.warehouse w LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=$1::uuid ORDER BY w.id`,[f.fixture.syntheticSkuId])).rows;}
function services(f){
 const issuer=createRuntime27CommandIssuer(f.runtimePool,{database:f.database,user:f.runtimeUser,port:f.port},'WHOLE_V2',f.ordinaryAdmission);
 const now=()=>new Date().toISOString(),newId=()=>randomUUID();
 return {sales:createSalesService({unitOfWork:new PostgresSalesUnitOfWork(issuer.pool,{runtime27:issuer.runtime27}),rules:createNativeTransactionSalesBusinessRules(),authorization:createSalesActionAuthorization(),now,newId}),
  transfers:createTransferService({unitOfWork:new PostgresTransferUnitOfWork(issuer.pool,{runtime27:issuer.runtime27}),authorization:createSourceConfirmedTransferAuthorization(),references:createSourceConfirmedTransferReferences(),now,newId})};
}
function commands(f,s){
 const rows=f.fixture.pkg.records,field=t=>rows[t][0].fields,actor={accountId:f.fixture.initialize.payload.admin.account_id,hallId:null,role:'ADMIN'},spec={productId:field('product').id,colorId:field('color').id,fitId:field('fit').id,sizeId:field('size').id};
 const missing=f.fixture.expectedBaseline.missingWarehouseId,from=field('warehouse').id;
 const saveSale=quantity=>s.sales.execute({action:'SAVE',actor,requestKey:randomUUID(),expectedVersion:null,proposal:{salesId:null,businessType:'SALE',businessDate:new Date().toISOString().slice(0,10),note:'SYNTHETIC baseline scope',hallId:field('hall').id,customerId:field('customer').id,salespersonId:field('staff').id,warehouseId:missing,orderDiscount:'0.00',lines:[{existingLineId:null,spec,quantity,dealPrice:'1.00',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false}],settlements:[{existingSettlementId:null,paymentAccountId:field('payment_account').id,paymentMethodId:field('payment_method').id,direction:'RECEIVE',amount:quantity+'.00'}]}});
 const sale=(action,r)=>s.sales.execute({action,actor,requestKey:randomUUID(),salesId:r.salesId,expectedVersion:r.version});
 const saveTransfer=()=>s.transfers.execute({action:'SAVE',actor,requestKey:randomUUID(),expectedVersion:null,proposal:{transferId:null,businessDate:new Date().toISOString().slice(0,10),note:'SYNTHETIC baseline scope',fromWarehouseId:from,toWarehouseId:missing,lines:[{existingLineId:null,spec,quantity:'3'}]}});
 const transfer=(action,r)=>s.transfers.execute({action,actor,requestKey:randomUUID(),transferId:r.transferId,expectedVersion:r.version});
 return {saveSale,sale,saveTransfer,transfer,missing,from};
}
async function assertReceipt(f,result,kind,action,ledgerCount){
 const r=(await f.observer.query(`SELECT r.status,r.action,r.target_type,(SELECT count(*)::integer FROM naijue_erp.audit_change a WHERE a.operation_id=r.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id AND a.object_id=r.target_id) audits,
 (SELECT count(*)::integer FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id) effects FROM naijue_erp.operation_receipt r WHERE r.id=$1::uuid`,[result.operationId])).rows;
 assert.equal(r.length,1);assert.equal(r[0].status,'COMMITTED');assert.equal(r[0].target_type,kind);assert.equal(r[0].action,action);assert.equal(r[0].audits,1);assert.equal(r[0].effects,ledgerCount);
}
/** setup(mode) returns the single fresh disposable target with actual pg
 * writer/observer Clients and runtime Pool, buildSyntheticBaselineScopeSqlProgram
 * output, encodedScrypt, actual database/runtimeUser/port and close(). Optional
 * ordinaryAdmission, if present, must be genuine existing Fresh35 host output, never a stub. */
export function registerBaselineScopeSqlAtomicity(register,setup){
 for(const mode of BASELINE_SCOPE_PG_MODES)register(mode,async()=>{
  const f=await setup(mode);assert.ok(f.writer instanceof pg.Client&&f.observer instanceof pg.Client&&f.writer!==f.observer&&f.runtimePool instanceof pg.Pool);
  assert.match(f.database,/^synthetic_[a-z0-9_]+$/);assert.equal(typeof f.close,'function');
  try{await ordinary(f.writer,f.database);const captured=(await f.observer.query('SELECT current_database() db,pg_backend_pid() pid')).rows[0];assert.equal(captured.db,f.database);
   const before=await snapshotSyntheticDatabase(f.observer);assert.ok(Object.entries(before.tables).every(([name,t])=>name==='schema_migration'||t.count==='0'),'one fresh empty synthetic target required');const missing=f.fixture.expectedBaseline.missingWarehouseId,sku=f.fixture.syntheticSkuId;
   assert.equal(f.fixture.initialize.payload.explicit_zero_approval.format_version,'INVENTORY_BASELINE_SCOPE_V1');assert.equal(f.fixture.steps.filter(s=>s.method==='baselineKeys').reduce((n,s)=>n+s.request.payload.rows.length,0),2);
   assert.equal(await proof(f,missing,sku),'UNKNOWN');
   {
    const wrong=structuredClone(f.fixture.initialize);wrong.payload.explicit_zero_approval.warehouse_totals[0].quantity=(BigInt(wrong.payload.explicit_zero_approval.warehouse_totals[0].quantity)+1n).toString();
    await assert.rejects(publish(f,wrong),e=>e.code==='23514'&&e.message.includes('INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS'));
    assert.deepEqual(await snapshotSyntheticDatabase(f.observer),before);assert.equal(await proof(f,missing,sku),'UNKNOWN');
   }
   await publish(f,undefined,async()=>{assert.deepEqual(await snapshotSyntheticDatabase(f.observer),before,'no committed prefix');assert.equal(await proof(f,missing,sku),'UNKNOWN');});
   let stock=await current(f);assert.equal(stock.length,3);const byId=new Map(stock.map(r=>[r.warehouse_id,r]));assert.equal(byId.get(missing).quantity,null);assert.equal(byId.get(missing).ledger_count,0);assert.equal(byId.get(f.fixture.expectedBaseline.negativeWarehouseId).quantity,'-7');assert.equal(stock.reduce((n,r)=>n+BigInt(r.quantity??'0'),0n),93n);
   assert.equal(await proof(f,missing,sku),'EXPLICIT_ZERO');assert.equal(await proof(f,randomUUID(),sku),'UNKNOWN');assert.equal(await proof(f,missing,randomUUID()),'UNKNOWN');
   {
    const after=await snapshotSyntheticDatabase(f.observer);await ack(f.writer,'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN');await ack(f.writer,'SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2','SET');
    try{const replay=await call(f.writer,'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text) result',[f.fixture.initialize,f.encodedScrypt]);assert.equal(replay.state,'COMMITTED');}finally{await ack(f.writer,'ROLLBACK','ROLLBACK');}
    assert.deepEqual(await snapshotSyntheticDatabase(f.observer),after);
   }
   const s=services(f),c=commands(f,s);
   {
    const drafts=await Promise.all([c.saveSale('2'),c.saveSale('3')]);const results=await Promise.all(drafts.map(r=>c.sale('APPROVE',r)));for(const r of results)await assertReceipt(f,r,'SALES','APPROVE',1);
    const r=(await current(f)).find(r=>r.warehouse_id===missing);assert.equal(r.quantity,'-5');assert.equal(r.version,2);assert.equal(r.ledger_count,2);
    const pairs=(await f.observer.query('SELECT quantity_before::text,quantity_after::text,quantity_delta::text FROM naijue_erp.inventory_ledger WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid ORDER BY quantity_before DESC',[missing,sku])).rows;
    assert.equal(pairs.length,2);assert.equal(pairs.filter(r=>r.quantity_before==='0').length,1);for(const r of pairs)assert.equal(BigInt(r.quantity_after)-BigInt(r.quantity_before),BigInt(r.quantity_delta));
   }
   let sale=await c.saveSale('2');sale=await c.sale('APPROVE',sale);await assertReceipt(f,sale,'SALES','APPROVE',1);assert.equal((await current(f)).find(r=>r.warehouse_id===missing).quantity,'-7');
   sale=await c.sale('UNAPPROVE',sale);await assertReceipt(f,sale,'SALES','UNAPPROVE',1);assert.equal((await current(f)).find(r=>r.warehouse_id===missing).quantity,'-5');sale=await c.sale('APPROVE',sale);assert.equal((await current(f)).find(r=>r.warehouse_id===missing).quantity,'-7');
   let tr=await c.saveTransfer();const total=()=>current(f).then(rows=>rows.reduce((n,r)=>n+BigInt(r.quantity??'0'),0n));const prior=await total();
   for(const action of ['APPROVE','UNAPPROVE','APPROVE']){tr=await c.transfer(action,tr);await assertReceipt(f,tr,'TRANSFER',action,2);assert.equal(await total(),prior);const effects=(await f.observer.query('SELECT endpoint,quantity_delta::text FROM naijue_erp.inventory_ledger WHERE operation_id=$1::uuid',[tr.operationId])).rows;assert.equal(effects.length,2);assert.equal(effects.reduce((n,r)=>n+BigInt(r.quantity_delta),0n),0n);}
   const connection=await f.runtimePool.connect();try{await ordinary(connection,f.database);assert.notEqual((await connection.query('SELECT pg_backend_pid() pid')).rows[0].pid,captured.pid);}finally{connection.release(true);}
  }finally{await f.close();}
 });
}
