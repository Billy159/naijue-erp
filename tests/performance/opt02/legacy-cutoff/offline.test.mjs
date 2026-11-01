import test from 'node:test';import assert from 'node:assert/strict';
import {buildLegacyCutoffFixture,SHA,CASE_ID,extraReferenceCommands} from './fixture.mjs';
import {createExactLegacySourceAuthorizer,snapshot} from './source-authorizer.mjs';
import {createOriginalLegacyPublication,verifyAcknowledgedReceipt} from './publication.mjs';
import {createCutoffImportService,validateCutoffImportCommand} from '../../../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
import {NODE_SCRYPT_DUMMY_HASH} from '../../../../packages/authentication/src/passwords.ts';
import {READ_COLUMNS,finiteGrants,assertFiniteColumnMatrix,readCases,assertStockPage,admissionCases,assertCutoffAdmission} from './read-contract.mjs';
import {guardedLegacyPool} from './wire-boundary.mjs';
import {sqlGate} from '../../opt00/pg-component/component.mjs';
import {createBudget} from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const f=buildLegacyCutoffFixture(),bytes=async path=>Buffer.from(f.artifacts.find(a=>a.path===path).utf8),clone=x=>structuredClone(x);
test('source-only finite103 refs,2WH3SKU,4 actual signed input keys and2 explicit zero holes; no fake history',()=>{
 assert.equal(f.caseId,CASE_ID);assert.equal(f.referenceRowCount,103);assert.equal(f.referenceRowCount,f.originalReferenceRowCount+f.extraReferenceRows);assert.equal(f.warehouses.length,2);assert.equal(f.skus.length,3);assert.equal(f.baselines.length,4);assert.equal(f.zeroPairs.length,2);assert.equal(f.nativeWarehouseCreateEnabled,false);assert.equal(f.executionApproved,false);
 assert.deepEqual(f.expected,{WAREHOUSE:2,SKU:3,INVENTORY_LEDGER:4,IMPORT_BATCH:1});assert.deepEqual(f.expectedProductStocks.map(p=>p.quantity),['16','0','5']);assert.equal(f.artifacts.length,3);for(const a of f.artifacts){assert.equal(a.bytes,Buffer.byteLength(a.utf8));assert.equal(a.sha256,SHA(a.utf8));assert.ok(Object.isFrozen(a));}
 const source=JSON.parse(f.artifacts[2].utf8);assert.equal(source.noHistorySourceRows,true);assert.equal(source.noProductSourceRows,true);assert.equal(source.finalDelta.rows.length,0);assert.equal(source.mappingVersion,'synthetic-legacy-cutoff-v1');
});
test('original validator accepts all exact typed commands with proper counters; IMPORTED is only planned, never materialized source',()=>{
 f.commands.forEach(validateCutoffImportCommand);assert.deepEqual(f.checkpoints.map(c=>[c.sequence,c.cursor]),[[0,0],[1,5],[2,9],[3,10]]);assert.deepEqual(f.expectedResults.map(r=>r.ledgerEntryIds.length),[0,0,4,0]);assert.ok(f.commands.every(c=>!Object.hasOwn(c,'historyMetadata')));assert.equal(typeof f.commands[2].items[0].quantity,'bigint');assert.equal(f.commands[0].sourceHash,f.artifacts[2].sha256);
});
test('every membership/nonzero original has actual row SHA and only source-known target; no repeated destination',()=>{
 const raw=f.artifacts[1].utf8.trimEnd().split('\n');const items=[...f.commands[1].items,...f.commands[2].items];assert.equal(items.length,raw.length);for(let i=0;i<items.length;i++){assert.equal(items[i].sourceRecordHash,SHA(raw[i]));assert.equal(items[i].sourceFileRef,f.artifacts[1].path);}assert.equal(new Set(items.map(i=>i.sourceKey)).size,9);
 const keys=[...f.baselines,...f.zeroPairs].map(b=>b.warehouseId+':'+b.skuId);assert.equal(new Set(keys).size,6);
});
test('source authorizer checks exact actor/full typed command and all3 actual artifact byte strings on every call',async()=>{
 const reads=[],a=createExactLegacySourceAuthorizer(async p=>{reads.push(p);return bytes(p);});for(const command of f.commands)await a.assertAllowed(f.reference.actor.accountId,command);assert.equal(reads.length,12);
 await assert.rejects(a.assertAllowed(f.warehouses[0].id,f.commands[0]),/EXACT_SOURCE_ACTOR/);const changed=clone(f.commands[2]);changed.items[0].quantity=changed.items[0].quantity.toString();await assert.rejects(a.assertAllowed(f.reference.actor.accountId,changed));
 for(const [i,k,v] of [[0,'sourceHash','b'.repeat(64)],[0,'mappingVersion','V2_HISTORY_NULLABLE_1'],[1,'expectedCursor',1],[3,'expectedSequence',1]]){const c=clone(f.commands[i]);c[k]=v;await assert.rejects(a.assertAllowed(f.reference.actor.accountId,c));}
 const c=clone(f.commands[3]);c.approval.noUnresolvedExceptions=false;await assert.rejects(a.assertAllowed(f.reference.actor.accountId,c));
});
test('tampered/missing artifact never reaches original store; no no-op role-only authorizer',async()=>{
 for(const badPath of f.artifacts.map(a=>a.path)){let storeCalls=0;const authorization=createExactLegacySourceAuthorizer(async p=>p===badPath?Buffer.from('changed'):bytes(p)),service=createCutoffImportService({authorization,store:{async execute(){storeCalls++;throw Error('SHOULD_NOT_CALL');}},now:()=> '2026-11-01T00:30:00.000Z'});await assert.rejects(service.execute(f.commands[0]),/FROZEN_SYNTHETIC_ARTIFACT/);assert.equal(storeCalls,0);}
});
test('data snapshot rejects accessors/hidden/symbol/coercion/sparse/added array fields without invoking getter',()=>{
 let calls=0;for(const v of[Object.defineProperty({},'x',{enumerable:true,get(){calls++;return 1;}}),Object.defineProperty({},'x',{value:1}),{[Symbol('x')]:1},{x:{toString(){calls++;return 'safe';}}},[,1],Object.assign([1],{extra:2})])assert.throws(()=>snapshot(v));assert.equal(calls,0);assert.notEqual(requestHash({quantity:1n}),requestHash({quantity:'1'}));
});
test('publication verifies files before any pool connect and is one-attempt/no retry even on first failure',async()=>{
 let connects=0,before=0,acks=0;const run=createOriginalLegacyPublication({pool:{async connect(){connects++;throw Error('SHOULD_NOT_CONNECT');}},readArtifact:async()=>Buffer.from('bad'),now:()=> '2026-11-01T00:30:00.000Z',beforeCommand:async()=>{before++;},onAcknowledged:async()=>{acks++;}});await assert.rejects(run.execute(),/FROZEN_SYNTHETIC_ARTIFACT/);await assert.rejects(run.execute(),/ONE_ATTEMPT_NO_REPLAY/);assert.deepEqual({connects,before,acks},{connects:0,before:0,acks:0});
});
test('after exact source verification, first original-store acquire error retains original error and no acknowledgement/retry',async()=>{
 let connects=0,before=0,acks=0;const original=Error('CAPTURED_ACQUIRE_FAILURE');const run=createOriginalLegacyPublication({pool:{async connect(){connects++;throw original;}},readArtifact:bytes,now:()=> '2026-11-01T00:30:00.000Z',beforeCommand:async()=>{before++;},onAcknowledged:async()=>{acks++;}});await assert.rejects(run.execute(),e=>e===original);await assert.rejects(run.execute(),/ONE_ATTEMPT_NO_REPLAY/);assert.deepEqual({connects,before,acks},{connects:1,before:1,acks:0});
});
test('receipt observer refuses an unacknowledged/mutated result before any query',async()=>{let queries=0;await assert.rejects(verifyAcknowledgedReceipt(async()=>{queries++;throw Error('NO_QUERY');},0,{...f.expectedResults[0],status:'IMPORTED'}),/EXACT_ACKNOWLEDGED/);assert.equal(queries,0);});

test('additive4 source setup uses original INSERT columns; no import/receipt/audit/direct balances',()=>{
 const rows=extraReferenceCommands(NODE_SCRYPT_DUMMY_HASH);assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.table),['warehouse','warehouse','product','sku']);assert.equal(rows[2].values[0],f.alternateProduct.id);assert.deepEqual(rows[3].values,[f.skus[2].id,f.alternateProduct.id,f.reference.colorId,f.reference.fitId,f.reference.sizes[0].id,f.skus[2].sku_code,true,1,null]);assert.ok(rows.every(r=>r.text.startsWith('INSERT INTO naijue_erp.')));assert.throws(()=>extraReferenceCommands('not-a-hash'));
});
test('source-defined86 SELECT cells and no credential/audit/receipt/sequence/whole-table grants; exact role required',()=>{
 const rows=Object.entries(READ_COLUMNS).flatMap(([table_name,cols])=>cols.map(column_name=>({table_name,column_name,can_select:true,can_insert:false,can_update:false,can_references:false})));assert.equal(assertFiniteColumnMatrix(rows).exactSelectCells,86);assert.equal(READ_COLUMNS.product.length,25);assert.equal(READ_COLUMNS.import_batch.length,15);assert.ok(!['password_hash','request_hash'].some(c=>Object.values(READ_COLUMNS).some(cols=>cols.includes(c))));assert.ok(!Object.hasOwn(READ_COLUMNS,'operation_receipt'));const grants=finiteGrants('dot_opt02_read_'+CASE_ID);assert.equal(grants.length,16);assert.ok(grants.every(sql=>sql.startsWith('GRANT SELECT (')));assert.throws(()=>finiteGrants({toString(){throw Error('COERCED');}}));assert.throws(()=>finiteGrants('foreign_role'));assert.throws(()=>assertFiniteColumnMatrix([...rows,{table_name:'product',column_name:'xmin',can_select:true,can_insert:false,can_update:false,can_references:false}]));const wrong=clone(rows);wrong[0].can_update=true;assert.throws(()=>assertFiniteColumnMatrix(wrong));assert.throws(()=>assertFiniteColumnMatrix(rows.slice(1)));
});
test('frozen wide/narrow/deep/confirmed-zero independent source oracle never accepts unknown as0 or empty page as empty total',()=>{
 for(const c of readCases()){const actual={exactTotal:c.expectedTotal,page:c.parameters.page,pageSize:100,items:c.expectedStocks.map(x=>({id:x.id,totalStock:x.quantity}))};assertStockPage(actual,c);if(actual.items.length){assert.throws(()=>assertStockPage({...actual,items:actual.items.map((p,i)=>i? p:{...p,totalStock:null})},c));}else assert.throws(()=>assertStockPage({...actual,exactTotal:0},c));}
 assert.equal(admissionCases().length,6);for(const c of admissionCases()){assertCutoffAdmission([c.expected],c.expected);assert.throws(()=>assertCutoffAdmission([{...c.expected,admitted:false}],c.expected));}
});
test('original real store lost COMMIT ACK is once-only, original cause retained, all later wireSQL blocked, clients close then owned-stop boundary',async()=>{
 const wire=[],events=[],original=Object.assign(Error('SCRIPTED_LOST_COMMIT_ACK_NOT_PG'),{code:'ECONNRESET'}),gate=sqlGate(async sql=>{wire.push(sql);return{rows:[],rowCount:0};}),budget=createBudget(Date.now());let acquired=0;
 const pool=guardedLegacyPool({gate,budget,openCaptured:async()=>{acquired++;return{async query(input){const sql=typeof input==='string'?input:input.text;wire.push(sql);if(sql==='COMMIT')throw original;return{rows:[],rowCount:/^INSERT /.test(sql)?1:0};}};},closeCaptured:async()=>{events.push('captured-client-close');return{settled:true,confirmed:true};}});
 const run=createOriginalLegacyPublication({pool,readArtifact:bytes,now:()=> '2026-11-01T00:30:00.000Z',beforeCommand:async()=>{},onAcknowledged:async()=>{events.push('MUST_NOT_ACK');}});
 let failure;try{await run.execute();}catch(e){failure=e;}finally{await pool.close();events.push('owned-stop-boundary-no-native-engine');}
 assert.equal(failure.code,'COMPONENT_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY');assert.equal(failure.cause,original);assert.equal(acquired,1);assert.equal(wire.filter(s=>s==='COMMIT').length,1);assert.equal(wire.at(-1),'COMMIT');assert.ok(!wire.includes('ROLLBACK'));assert.equal(gate.quarantined(),true);for(const sql of ['ROLLBACK','SELECT 1','RESET ROLE'])assert.throws(()=>gate.query(sql),/NO_SQL_AFTER_UNKNOWN_COMMIT/);await assert.rejects(pool.connect(),/NO_ACQUIRE_AFTER_UNKNOWN_COMMIT/);assert.deepEqual(events,['captured-client-close','owned-stop-boundary-no-native-engine']);
});
test('late captured lease after global quarantine closes before any SQL; no leaked physical acquisition',async()=>{
 let openResolve,closes=0,queries=0;const gate=sqlGate(async()=>{}),pool=guardedLegacyPool({gate,budget:createBudget(Date.now()),openCaptured:()=>new Promise(resolve=>{openResolve=resolve;}),closeCaptured:async()=>{closes++;return{settled:true,confirmed:true};}});const pending=pool.connect();await new Promise(resolve=>setImmediate(resolve));gate.quarantine(Error('UNKNOWN_ON_OTHER_CLIENT'));openResolve({async query(){queries++;}});await assert.rejects(pending,/LATE_LEASE_AFTER_QUARANTINE_CLOSED/);assert.equal(closes,1);assert.equal(queries,0);await pool.close();
});
test('pool close waits late acquisition/actual close and rejects active lease SQL; failed close is not PASS',async()=>{
 let resolveOpen,resolveClose,settled=false,closes=0;const gate=sqlGate(async()=>{}),pool=guardedLegacyPool({gate,budget:createBudget(Date.now()),openCaptured:()=>new Promise(r=>{resolveOpen=r;}),closeCaptured:()=>{closes++;return new Promise(r=>{resolveClose=r;});}});const pending=pool.connect();await new Promise(r=>setImmediate(r));const ending=pool.close().then(()=>{settled=true;});await new Promise(r=>setImmediate(r));assert.equal(settled,false);resolveOpen({async query(){throw Error('NO_SQL');}});await new Promise(r=>setImmediate(r));assert.equal(closes,1);assert.equal(settled,false);resolveClose({settled:true,confirmed:true});await assert.rejects(pending,/LATE_LEASE_AFTER_QUARANTINE_CLOSED/);await ending;assert.equal(settled,true);
 const bad=guardedLegacyPool({gate:sqlGate(async()=>{}),budget:createBudget(Date.now()),openCaptured:async()=>({async query(){}}),closeCaptured:async()=>({settled:true,confirmed:false})}),lease=await bad.connect();await assert.rejects(bad.close(),/ALL_CAPTURED_CLIENT_CLOSURES_MUST_CONFIRM/);assert.throws(()=>lease.query('SELECT 1'),/ORIGINAL_COMPONENT_LEASE_RELEASED/);
});
