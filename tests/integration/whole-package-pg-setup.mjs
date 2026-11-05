/** Explicit opt-in, loopback-only, already-installed disposable synthetic targets.
 * No private fixture module, installer, credential discovery or owner fallback. */
import assert from 'node:assert/strict';
import pg from 'pg';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {NODE_SCRYPT_DUMMY_HASH} from '../../packages/authentication/src/passwords.ts';
import {PostgresInventoryQueryReader} from '../../adapters/postgres/src/inventory-query-reader.ts';
import {createRuntime27CommandIssuer} from '../../adapters/postgres/src/runtime27-command-issuer.ts';
import {buildSyntheticWholePackageFixture,snapshotSyntheticDatabase,assertSyntheticPublished} from '../fixtures/unified-import/whole-package-synthetic.ts';
export const WHOLE_PG_MODES=Object.freeze(['success-and-exact-replay','prepare-only','middle-failure','publish-failure','constraint-failure','sealed-append-failure','count-underflow-failure','count-overflow-failure','large-document-success','multiple-documents-success','departure-null-success','departure-date-success','replica-after-prepare-failure','replica-after-finish-failure','zero-unknown-success','zero-unknown-rollback']);
export function validateSyntheticPgCases(config,modes=WHOLE_PG_MODES){
 if(!config||config.confirmedSynthetic!==true||!config.cases||Object.keys(config.cases).sort().join()!==[...modes].sort().join())throw Error('EXPLICIT_SYNTHETIC_CASES_REQUIRED');
 const seen=new Set();for(const mode of modes){const c=config.cases[mode];if(!c||!['127.0.0.1','::1'].includes(c.host)||!Number.isSafeInteger(c.port)||c.port<1024||c.port>65535||typeof c.database!=='string'||!/^synthetic_whole_[a-z0-9_]{1,48}$/.test(c.database))throw Error('LOOPBACK_SYNTHETIC_TARGET_REQUIRED');
  const key=c.host+':'+c.port+'/'+c.database;if(seen.has(key))throw Error('FRESH_CASE_TARGET_REQUIRED');seen.add(key);
  for(const who of (mode==='zero-unknown-success'?['writer','observer','runtime']:['writer','observer']))if(!c[who]||typeof c[who].user!=='string'||!/^[a-z_][a-z0-9_]{0,62}$/.test(c[who].user)||typeof c[who].password!=='string'||c[who].password.length>1024)throw Error('EXPLICIT_CONNECTION_IDENTITY_REQUIRED');
 }return structuredClone(config.cases);
}
/** Synthetic engine-case adapter: combine adjacent complete documents without
 * changing source rows. It is not the production streaming request compiler. */
export function combineSyntheticDocumentChunks(program){
 const steps=structuredClone(program.steps),i=steps.findIndex(s=>s.method==='documentChunk'&&s.request.payload.mode==='CHUNK'),a=steps[i],b=steps[i+1];
 assert.ok(a&&b&&b.method==='documentChunk'&&b.request.payload.mode==='CHUNK');assert.ok(a.request.payload.documents.length&&b.request.payload.documents.length);assert.ok(a.request.payload.rows.length+b.request.payload.rows.length<=500);
 a.request.payload.rows.push(...b.request.payload.rows);a.request.payload.documents.push(...b.request.payload.documents);
 a.request.operation_id=stableImportId('SYNTHETIC_MULTI_DOCUMENT_REQUEST',a.request.operation_id,b.request.operation_id);a.request.request_key=a.request.operation_id;steps.splice(i+1,1);
 for(let j=i+1;j<steps.length;j++)if(steps[j].request.batch_id===a.request.batch_id&&typeof steps[j].request.payload.expected_sequence==='number')steps[j].request.payload.expected_sequence--;
 return steps;
}
export function createSyntheticPgSetup(config,modes=WHOLE_PG_MODES){const cases=validateSyntheticPgCases(config,modes);const consumed=new Set();return async mode=>{
 if(consumed.has(mode)||!cases[mode])throw Error('SYNTHETIC_CASE_ALREADY_CONSUMED');consumed.add(mode);const c=cases[mode];
 const make=who=>new pg.Client({host:c.host,port:c.port,database:c.database,user:c[who].user,password:c[who].password,ssl:false,connectionTimeoutMillis:5000,statement_timeout:120000,application_name:'whole-package-synthetic-acceptance'});
 const writer=make('writer'),observer=make('observer');
 try{await writer.connect();await observer.connect();
  for(const client of [writer,observer]){const r=await client.query('SELECT current_database() AS db');assert.equal(r.rows[0].db,c.database);}
  const role=await writer.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,has_parameter_privilege(current_user,'session_replication_role','SET') AS parameter_set FROM pg_catalog.pg_roles WHERE rolname=session_user");assert.equal(role.rows.length,1);assert.ok(Object.values(role.rows[0]).every(v=>v===false),'ordinary controller required');
  const before=await snapshotSyntheticDatabase(observer);assert.equal(before.tables.schema_migration?.count,'27','complete schema migration lineage required');assert.ok(Object.entries(before.tables).every(([name,t])=>name==='schema_migration'||t.count==='0'),'fresh empty synthetic business schema required');
  const identity=await observer.query("SELECT d.oid::text AS oid,c.system_identifier::text AS system_identifier,encode(sha256(convert_to((SELECT string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.prokind='f'),'UTF8')),'hex') AS source_binding FROM pg_database d CROSS JOIN pg_control_system() c WHERE d.datname=current_database()");
  const variant=mode.startsWith('zero-unknown-')?'zero-unknown':mode==='large-document-success'?'large-document':mode==='departure-null-success'?'departure-null':mode==='departure-date-success'?'departure-date':'default';
  // Synthetic target binding for this fixture is not catalogue admission.
  const f=buildSyntheticWholePackageFixture({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:identity.rows[0].system_identifier,database_oid:identity.rows[0].oid,database_name:c.database,catalog_sha256:identity.rows[0].source_binding},NODE_SCRYPT_DUMMY_HASH,variant);
  const assertZeroUnknown=async(verified)=>{
   const [covered,zero,missing]=f.syntheticWarehouseRows,sku=f.syntheticSkuId;
   assert.equal(verified.inventory_summary.verified_key_count,2);
   assert.equal(verified.inventory_coverage.explicit_zero_keys,1);
   assert.equal(verified.inventory_coverage.unknown_combinations_not_enumerated,true);
   assert.equal(verified.unknown_keys_materialized,false);
   assert.equal(Object.hasOwn(verified,'inventory_keys'),false);
   const rows=(await observer.query(`SELECT w.id, b.quantity::text AS quantity,
      (SELECT count(*)::text FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=$2::uuid) AS ledger_count
      FROM naijue_erp.warehouse w LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=$2::uuid
      WHERE w.id=ANY($1::uuid[])`,[[covered.id,zero.id,missing.id],sku])).rows;
   const byId=new Map(rows.map(row=>[row.id,row]));assert.equal(rows.length,3);
   assert.equal(byId.get(covered.id).quantity,'100');assert.equal(byId.get(zero.id).quantity,'0');assert.equal(byId.get(zero.id).ledger_count,'0');
   assert.equal(byId.get(missing.id).quantity,null);assert.equal(byId.get(missing.id).ledger_count,'0');
   const rawPool=new pg.Pool({host:c.host,port:c.port,database:c.database,user:c.runtime.user,password:c.runtime.password,ssl:false,connectionTimeoutMillis:5000,statement_timeout:120000,max:1});
   try{const issuer=createRuntime27CommandIssuer(rawPool,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');const reader=new PostgresInventoryQueryReader(issuer.pool,null,undefined,null,issuer.ordinaryRead);
    const result=await reader.readInventory({actor:{accountId:f.program.initialize.payload.admin.account_id,hallId:null},scope:{hallIds:[covered.hallId],warehouses:f.syntheticWarehouseRows},
      parameters:{page:1,pageSize:100,filter:{productIds:[],categoryIds:[],warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}},signal:new AbortController().signal});
    const rows=result.data.products[0].colorFits[0].rows,size=result.data.products[0].sizes[0].id;
    assert.deepEqual(rows[0].cells[size],{state:'known',skuId:sku,quantity:'100'});
    assert.deepEqual(rows[1].cells[size],{state:'known',skuId:sku,quantity:'0'});
    assert.deepEqual(rows[2].cells[size],{state:'unknown',skuId:sku});
    assert.deepEqual(result.data.allMatchesTotal,{knownQuantity:'100',unknownCells:1,completeness:'incomplete'});
   }finally{await rawPool.end();}
  };
  return {syntheticIsolated:true,writer,observer,assertZeroUnknown,initialize:f.program.initialize,steps:mode==='multiple-documents-success'?combineSyntheticDocumentChunks(f.program):f.program.steps,encodedScrypt:NODE_SCRYPT_DUMMY_HASH,constraintFailureAt:f.constraintFailureAt,constraintFailureStep:f.constraintFailureStep,sealedAppendAfter:f.sealedAppendAfter,sealedAppendStep:f.sealedAppendStep,snapshot:snapshotSyntheticDatabase,assertPublished:async(o,summary)=>{await assertSyntheticPublished(o,f.program.initialize.batch_id,f.documentBatchId,summary);if(variant.startsWith('departure')){const r=await o.query('SELECT departure_date::text AS date FROM naijue_erp.staff WHERE id<>$1::uuid',[f.program.initialize.payload.admin.staff_id]);assert.ok(r.rows.length>0);assert.ok(r.rows.every(x=>x.date===(variant==='departure-null'?null:'2024-02-29')));}if(variant==='large-document'){const r=await o.query('SELECT count(*)::integer AS count FROM naijue_erp.sales_line');assert.equal(r.rows[0].count,501);}},close:async()=>{await writer.end();await observer.end();}};
 }catch{await Promise.allSettled([writer.end(),observer.end()]);throw Error('SYNTHETIC_PG_SETUP_FAILED: check isolated schema, role and connection prerequisites privately');}
};}
