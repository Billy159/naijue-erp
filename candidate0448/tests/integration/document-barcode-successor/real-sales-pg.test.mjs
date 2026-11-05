/** Local-only synthetic PostgreSQL integration test. The installation must be
 * prepared by the shipped isolated installer before invocation. No private
 * fixture module, production data, fake capability or silent skip. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildMultisizeSyntheticProgram} from './multisize-program.ts';
import {snapshotSyntheticDatabase} from '../../fixtures/unified-import/whole-package-synthetic.ts';
import {publishSyntheticProgram} from './publish-synthetic-program.mjs';
import {NODE_SCRYPT_DUMMY_HASH} from '../../../packages/authentication/src/passwords.ts';
import {createRuntime27CommandIssuer} from '../../../adapters/postgres/src/runtime27-command-issuer.ts';
import {assertDocumentBarcodeSuccessor} from '../../../adapters/postgres/src/document-barcode-successor-admission.ts';
import {PostgresMaintenanceCommandUnitOfWork} from '../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import {PostgresProductMaintenanceUnitOfWork} from '../../../adapters/postgres/src/product-maintenance-store.ts';
import {createOrdinary27ProductCapacityFactory} from '../../../adapters/postgres/src/ordinary27-product-capacity.ts';
import {createProductMaintenanceService} from '../../../packages/application/src/product-maintenance-service.ts';
import {CATALOGUE_PRICE_KEYS} from '../../../packages/application/src/catalogue-price-input.ts';
import {PostgresSalesUnitOfWork} from '../../../adapters/postgres/src/sales-unit-of-work.ts';
import {createSalesService} from '../../../packages/application/src/sales-service.ts';
import {createSalesActionAuthorization} from '../../../packages/application/src/sales-authorization.ts';
import {createNativeTransactionSalesBusinessRules} from '../../../packages/application/src/sales-native-facts.ts';
import {generateSkuBarcode,BARCODE_SCHEMES} from '../../../packages/application/src/barcode-generation.ts';
const options=JSON.parse(process.env.DOCUMENT_SYNTHETIC_PG??'null');
if(!options||options.confirmedSynthetic!==true||options.confirmedDisposable!==true||!options.cases)throw Error('DOCUMENT_SYNTHETIC_PG must contain explicit isolated test connection settings');
const seen=new Set();
for(const mode of ['complete-group','missing-barcode-permission','retained-barcode','bad-master-policy','bad-document-policy','bad-staff-policy','bad-audit-policy','reference-lock-guards','product-no-scheme','product-no-scheme-commit','large-group-rollback']) {
 const c=options.cases[mode];
 if((mode.startsWith('bad-')||mode==='missing-barcode-permission'||mode==='product-no-scheme-commit')&&c?.allowPersistentTestChanges!==true)throw Error('DISPOSABLE_PERSISTENT_CHANGE_AUTHORIZATION_REQUIRED');
 if(!c||!['127.0.0.1','::1'].includes(c.host)||!Number.isSafeInteger(c.port)||c.port<1024||c.port>65535||!/^synthetic_document_[a-z0-9_]+$/.test(c.database)||!c.bootstrap||!c.runtime||!c.admin||[c.bootstrap,c.runtime,c.admin].some(x=>Object.keys(x).sort().join(',')!=='password,user'||typeof x.user!=='string'||typeof x.password!=='string')||new Set([c.bootstrap.user,c.runtime.user,c.admin.user]).size!==3)throw Error('EXPLICIT_LOOPBACK_SYNTHETIC_TARGET_REQUIRED');
 const key=`${c.host}:${c.port}/${c.database}`;if(seen.has(key))throw Error('DISTINCT_SYNTHETIC_DATABASES_REQUIRED');seen.add(key);
 test(`actual PostgreSQL SALE SAVE specification generation: ${mode}`,async()=>{
  const base={host:c.host,port:c.port,database:c.database,ssl:false,connectionTimeoutMillis:3000,statement_timeout:15000};
  const setup=new pg.Client({...c.bootstrap,...base,application_name:'synthetic_document_setup'}),observer=new pg.Client({...c.admin,...base,application_name:'synthetic_document_observer'}),native=new pg.Pool({...c.runtime,...base,max:1,application_name:'synthetic_document_runtime'});
  try {
   await setup.connect();await observer.connect();
   assert.equal((await observer.query('SET row_security=off')).command,'SET');
   const identity=await observer.query("SELECT current_database() AS db, pg_catalog.host(pg_catalog.inet_server_addr()) AS host, d.oid::text AS oid, c.system_identifier::text AS sysid,pg_catalog.pg_postmaster_start_time()::text AS started, encode(sha256(convert_to((SELECT string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.prokind='f'),'UTF8')),'hex') AS binding FROM pg_database d CROSS JOIN pg_control_system() c WHERE d.datname=current_database()");
   assert.equal(identity.rows.length,1);const id=identity.rows[0];assert.equal(id.db,c.database);assert.ok(['127.0.0.1','::1'].includes(id.host));
   const checkTarget=async(client)=>{const t=await client.query("SELECT current_database() AS db, pg_catalog.host(pg_catalog.inet_server_addr()) AS host, inet_server_port() AS port, d.oid::text AS oid, pg_catalog.pg_postmaster_start_time()::text AS started, pg_catalog.pg_backend_pid() AS pid FROM pg_database d WHERE d.datname=current_database()");assert.equal(t.rows.length,1);const x=t.rows[0];assert.equal(x.db,id.db);assert.equal(x.host,id.host);assert.equal(x.port,c.port);assert.equal(x.oid,id.oid);assert.equal(x.started,id.started);const seen=await observer.query('SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND datid=$2::oid) AS found',[x.pid,id.oid]);assert.equal(seen.rows[0].found,true,'observer must see this backend on the same disposable target');};
   await checkTarget(setup);
   const empty=await snapshotSyntheticDatabase(observer);assert.equal(empty.tables.schema_migration?.count,'27');assert.ok(Object.entries(empty.tables).every(([name,table])=>name==='schema_migration'||table.count==='0'),'fresh empty synthetic business schema required');
   const f=buildMultisizeSyntheticProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:id.sysid,database_oid:id.oid,database_name:id.db,catalog_sha256:id.binding},mode==='large-group-rollback'?202:2);
   await publishSyntheticProgram(setup,f.program,NODE_SCRYPT_DUMMY_HASH,c.database);
   let latestRaw;const verifiedNative={async connect(){const raw=await native.connect();try{await checkTarget(raw);latestRaw=raw;return raw;}catch(error){raw.release(true);throw error;}}};
   if(mode.startsWith('bad-')){
    const baseline=createRuntime27CommandIssuer(verifiedNative,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
    const pre=await baseline.pool.connect();let started=false;try{await pre.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;await baseline.runtime27.assertReady(pre,'DOCUMENT_COMMAND');started=false;await pre.query('ROLLBACK');}finally{try{if(started)await pre.query('ROLLBACK');}finally{pre.release(true);}}
    const table=mode==='bad-master-policy'?'color':mode==='bad-document-policy'?'sales_header':mode==='bad-audit-policy'?'audit_change':'staff';
    const policy=['sales_header','audit_change'].includes(table)?'standard_published_runtime':'standard_published_master_runtime';
    await observer.query(`ALTER POLICY ${policy} ON naijue_erp.${table} USING (true) WITH CHECK (true)`);
    const invalid=createRuntime27CommandIssuer(verifiedNative,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
    await assert.rejects(()=>invalid.pool.connect(),{code:'NATIVE_RUNTIME27_NOT_READY'});return;
   }
   if(mode==='missing-barcode-permission'){
    const issuerBefore=createRuntime27CommandIssuer(verifiedNative,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
    const beforeLease=await issuerBefore.pool.connect();let began=false;try{await beforeLease.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;await issuerBefore.runtime27.assertReady(beforeLease,'DOCUMENT_COMMAND');await assertDocumentBarcodeSuccessor(beforeLease,true);began=false;await beforeLease.query('ROLLBACK');}finally{try{if(began)await beforeLease.query('ROLLBACK');}finally{beforeLease.release(true);}}
    await observer.query('REVOKE INSERT (id,barcode,sku_id,barcode_kind,scheme_id,enabled) ON naijue_erp.sku_barcode FROM erp_unified27_runtime_2393dbc6db9581c2');
    const issuerAfter=createRuntime27CommandIssuer(verifiedNative,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
    const afterLease=await issuerAfter.pool.connect();began=false;try{await afterLease.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;await issuerAfter.runtime27.assertReady(afterLease,'DOCUMENT_COMMAND');await assertDocumentBarcodeSuccessor(afterLease,false);const p=await afterLease.query("SELECT bool_and(NOT has_column_privilege(current_user,'naijue_erp.sku_barcode',x,'INSERT')) AS all_denied FROM unnest(ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled']) x");assert.equal(p.rows[0].all_denied,true);await assert.rejects(()=>assertDocumentBarcodeSuccessor(afterLease,true),{code:'DOCUMENT_BARCODE_SCHEMA_NOT_READY'});began=false;await afterLease.query('ROLLBACK');}finally{try{if(began)await afterLease.query('ROLLBACK');}finally{afterLease.release(true);}}
   }
   const snapshot=async()=>{
    const facts={};for(const table of ['sales_header','sales_line','sales_settlement','inventory_balance','inventory_ledger','operation_receipt','audit_change','runtime_document_number_allocation','product_category','supplier','size_group','season','barcode_scheme','product_image']){const rows=(await observer.query(`SELECT to_jsonb(t) v FROM naijue_erp.${table} t ORDER BY to_jsonb(t)::text LIMIT 10001`)).rows;assert.ok(rows.length<=10000,'bounded synthetic facts');facts[table]=rows;}
    return {product:(await observer.query('SELECT to_jsonb(p) v FROM naijue_erp.product p ORDER BY id')).rows,skus:(await observer.query('SELECT to_jsonb(s) v FROM naijue_erp.sku s ORDER BY id')).rows,barcodes:(await observer.query('SELECT to_jsonb(b) v FROM naijue_erp.sku_barcode b ORDER BY b.id')).rows,facts};
   };
   const before=await snapshot();assert.equal(before.skus.length,1);assert.ok(before.barcodes.length>=1);
   const issuer=createRuntime27CommandIssuer(verifiedNative,{database:c.database,user:c.runtime.user,port:c.port},'WHOLE_V2');
   if(mode==='product-no-scheme'||mode==='product-no-scheme-commit'){
    const driver=new PostgresMaintenanceCommandUnitOfWork(issuer.pool),capacity=createOrdinary27ProductCapacityFactory(issuer.pool,issuer.runtime27),realProduct=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:capacity,deletionGuard:null}),stop=Symbol('synthetic product rollback');let actual;
    const unitOfWork={seasonContract:realProduct.seasonContract,transaction(work){return realProduct.transaction(async tx=>{const result=await work(tx);assert.equal((await latestRaw.query('SET CONSTRAINTS ALL IMMEDIATE')).command,'SET');actual={result,product:(await latestRaw.query('SELECT default_barcode_scheme_id FROM naijue_erp.product WHERE id=$1::uuid',[result.targetId])).rows,skus:(await latestRaw.query('SELECT id FROM naijue_erp.sku WHERE product_id=$1::uuid',[result.targetId])).rows,barcodes:(await latestRaw.query('SELECT b.id FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid',[result.targetId])).rows,receipt:(await latestRaw.query('SELECT id FROM naijue_erp.operation_receipt WHERE id=$1::uuid AND target_id=$2::uuid',[result.operationId,result.targetId])).rows};throw stop;});}};
    const service=createProductMaintenanceService({unitOfWork:mode==='product-no-scheme-commit'?realProduct:unitOfWork,now:()=>new Date().toISOString(),newId:()=>randomUUID()});
    const command={action:'CREATE',requestKey:`synthetic-product-${randomUUID()}`,values:{productCode:`SYNTHETIC-${randomUUID()}`,name:'SYNTHETIC no scheme',categoryId:f.categoryId,supplierId:f.supplierId,seasonIds:[f.seasonId],sizeGroupId:f.sizeGroupId,year:2026,systemItemCode:'1234567',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,null]))},skus:[],barcodes:[],skuSelection:{colorIds:[f.colorId],fitIds:[f.fitId]}};
    if(mode==='product-no-scheme-commit'){
     const result=await service.executeV2({accountId:f.admin.account_id,hallId:null},command);
     const product=await observer.query('SELECT default_barcode_scheme_id FROM naijue_erp.product WHERE id=$1::uuid',[result.targetId]);
     const skus=await observer.query('SELECT id FROM naijue_erp.sku WHERE product_id=$1::uuid',[result.targetId]);
     const barcodes=await observer.query('SELECT b.id FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid',[result.targetId]);
     const receipt=await observer.query('SELECT id FROM naijue_erp.operation_receipt WHERE id=$1::uuid AND target_id=$2::uuid',[result.operationId,result.targetId]);
     const audit=await observer.query("SELECT operation_id FROM naijue_erp.audit_change WHERE operation_id=$1::uuid AND object_type='PRODUCT' AND object_id=$2::uuid",[result.operationId,result.targetId]);
     assert.equal(product.rows.length,1);assert.equal(product.rows[0].default_barcode_scheme_id,null);assert.equal(skus.rows.length,2);assert.equal(barcodes.rows.length,0);assert.equal(receipt.rows.length,1);assert.equal(audit.rows.length,1);return;
    }
    try{await service.executeV2({accountId:f.admin.account_id,hallId:null},command);assert.fail('synthetic product must roll back');}catch(error){assert.equal(error,stop);}
    assert.equal(actual.product.length,1);assert.equal(actual.product[0].default_barcode_scheme_id,null);assert.equal(actual.skus.length,2);assert.equal(actual.barcodes.length,0);assert.equal(actual.receipt.length,1);assert.deepEqual(await snapshot(),before,'null-scheme product and its audit/receipt roll back');return;
   }
   if(mode==='reference-lock-guards'){
    for(const table of ['product_category','supplier','size_group','season','barcode_scheme','product_image']){
     const lock=await issuer.pool.connect();let began=false;
     try{await lock.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;await issuer.runtime27.assertReady(lock,'DOCUMENT_COMMAND');
      const rows=await lock.query(`SELECT id FROM naijue_erp.${table} ORDER BY id LIMIT 1 FOR SHARE`);assert.equal(rows.rows.length,1,`visible synthetic ${table} row required`);
      await assert.rejects(()=>lock.query(`UPDATE naijue_erp.${table} SET id=id WHERE id=$1::uuid`,[rows.rows[0].id]),e=>e?.code==='23514'&&e?.message==='Runtime reference lock must not update identity');
      began=false;await lock.query('ROLLBACK');
     }finally{try{if(began)await lock.query('ROLLBACK');}finally{lock.release(true);}}
    }
    assert.deepEqual(await snapshot(),before,'runtime lock-only attempts do not change synthetic facts');return;
   }
   if(mode==='retained-barcode'){
    const probe=await issuer.pool.connect();let began=false;
    try {await checkTarget(probe);await probe.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;await issuer.runtime27.assertReady(probe,'DOCUMENT_COMMAND');
     await assert.rejects(()=>probe.query("UPDATE naijue_erp.sku_barcode SET barcode=barcode||'9' WHERE id=$1::uuid",[before.barcodes[0].v.id]),e=>['42501','23514'].includes(e?.code));
     began=false;await probe.query('ROLLBACK');
    } finally {try{if(began)await probe.query('ROLLBACK');}finally{probe.release(true);}}
    assert.deepEqual(await snapshot(),before,'forbidden old-barcode modification leaves all synthetic facts unchanged');
   }
   let lease,observed,retained,business;
   const pool={async connect(){lease=await issuer.pool.connect();try{await checkTarget(lease);return lease;}catch(error){lease.release(true);throw error;}}};
   const real=new PostgresSalesUnitOfWork(pool,{runtime27:issuer.runtime27});const sentinel=Symbol('synthetic rollback');
   const unitOfWork={transaction(work){return real.transaction(async tx=>{const result=await work(tx);assert.equal((await lease.query('SET CONSTRAINTS ALL IMMEDIATE')).command,'SET');observed=await lease.query('SELECT s.id,s.size_id,z.code AS size_code,b.barcode,b.scheme_id FROM naijue_erp.sku s JOIN naijue_erp.size z ON z.id=s.size_id LEFT JOIN naijue_erp.sku_barcode b ON b.sku_id=s.id AND b.barcode_kind=\'MAIN\' WHERE s.product_id=$1::uuid AND s.color_id=$2::uuid AND s.fit_id=$3::uuid ORDER BY s.size_id',[f.productId,f.colorId,f.fitId]);retained=await lease.query('SELECT to_jsonb(b) v FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid AND b.id=ANY($2::uuid[]) ORDER BY b.id',[f.productId,before.barcodes.map(row=>row.v.id)]);
    business={result,lines:(await lease.query('SELECT sku_id FROM naijue_erp.sales_line WHERE sales_id=$1::uuid',[result.salesId])).rows,
     receipt:(await lease.query('SELECT id FROM naijue_erp.operation_receipt WHERE id=$1::uuid AND target_id=$2::uuid',[result.operationId,result.salesId])).rows,
     audit:(await lease.query("SELECT operation_id FROM naijue_erp.audit_change WHERE operation_id=$1::uuid AND object_type='SALES' AND object_id=$2::uuid",[result.operationId,result.salesId])).rows,
     productAudit:(await lease.query("SELECT a.operation_id,jsonb_array_length(a.after_values->'skus') AS added_count FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id AND r.target_id=a.object_id WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid",[f.productId])).rows};
    assert.equal(business.lines.length,1);assert.equal(business.receipt.length,1);assert.equal(business.audit.length,1);
    assert.ok(business.productAudit.length>before.facts.audit_change.filter(row=>row.v.object_type==='PRODUCT'&&row.v.object_id===f.productId).length,'SKU append adds product audit paired with a receipt');if(mode==='large-group-rollback')assert.ok(business.productAudit.some(row=>row.added_count===201),'one audit must contain all 201 new SKU facts');throw sentinel;});}};
   const service=createSalesService({unitOfWork,rules:createNativeTransactionSalesBusinessRules(),authorization:createSalesActionAuthorization(),now:()=>new Date().toISOString(),newId:()=>randomUUID()});
   const command={action:'SAVE',actor:{accountId:f.admin.account_id,hallId:null},requestKey:`synthetic-${randomUUID()}`,expectedVersion:null,proposal:{salesId:null,businessType:'SALE',businessDate:'2026-10-21',note:null,hallId:f.hallId,customerId:f.customerId,salespersonId:f.staffId,warehouseId:f.warehouseId,orderDiscount:'0.00',lines:[{existingLineId:null,spec:{productId:f.productId,colorId:f.colorId,fitId:f.fitId,sizeId:mode==='retained-barcode'?f.addedSizeId:f.existingSizeId},quantity:'1',dealPrice:'1.00',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false}],settlements:[]}};
   try {await service.execute(command);assert.fail('The synthetic transaction must roll back');}catch(error){if(mode==='missing-barcode-permission'){assert.equal(error?.code,'DOCUMENT_BARCODE_SCHEMA_NOT_READY');}else assert.equal(error,sentinel);}
   if(mode!=='missing-barcode-permission'){
    assert.ok(observed);assert.deepEqual(retained.rows,before.barcodes,'existing barcode facts are unchanged before rollback');assert.equal(observed.rows.length,f.sizeIds.length);assert.deepEqual(new Set(observed.rows.map(r=>r.size_id)),new Set(f.sizeIds));const added=observed.rows.find(r=>r.size_id===f.addedSizeId);assert.ok(added?.barcode);if(mode==='retained-barcode')assert.equal(business.lines[0].sku_id,added.id,'parent SAVE references the generated SKU');
    for(const row of observed.rows.filter(r=>r.id!==f.existingSkuId)){assert.equal(row.scheme_id,BARCODE_SCHEMES.y2023);assert.equal(row.barcode,generateSkuBarcode({schemeId:BARCODE_SCHEMES.y2023,productSegment:'1234567',fitCode:'A',colorCode:'504',sizeCode:row.size_code}));}
   }
   assert.deepEqual(await snapshot(),before,'transaction rollback preserves product, SKU, barcode, sales, receipt, audit and number-allocation facts');
  } finally {await native.end();await Promise.allSettled([setup.end(),observer.end()]);}
 });
}
