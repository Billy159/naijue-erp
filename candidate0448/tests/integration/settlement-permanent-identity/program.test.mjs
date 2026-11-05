import test from 'node:test';import assert from 'node:assert/strict';
import {buildSettlementIdentityProgram} from './program.mjs';
import {registerSettlementIdentityPg} from './real-pg.mjs';
test('offline settlement PG fixture preserves sixteen permanent occurrences and the existing UUID',()=>{
 const f=buildSettlementIdentityProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_whole_settlement',catalog_sha256:'a'.repeat(64)});
 assert.equal(f.expected.length,16);assert.equal(new Set(f.expected.map(r=>r.id)).size,16);assert.equal(new Set(f.expected.map(r=>r.sales_id)).size,1);assert.equal(f.expected[0].id,'99999999-9999-4999-8999-999999999999');
 const rows=f.program.steps.flatMap(s=>s.request.payload.rows??[]).filter(r=>r.entity_type==='SALES_SETTLEMENT');
 assert.equal(rows.length,16);assert.ok(rows.every(r=>r.fields.amount==='1.00'));
 assert.deepEqual(rows.map(r=>r.record_id).sort(),f.expected.map(r=>r.record_id).sort());
});
test('PG test registration requires explicit target and does not invoke setup',()=>{
 let calls=0,registered=0;const setup=()=>{calls++;throw Error('must not connect during registration');};
 assert.throws(()=>registerSettlementIdentityPg(()=>{},setup,null),/EXPLICIT_FRESH/);
 registerSettlementIdentityPg(()=>{registered++;},setup,{system_identifier:'123456789',database_oid:'42',database_name:'synthetic_whole_settlement',server_address:'127.0.0.1',server_port:55442,catalog_sha256:'a'.repeat(64)});
 assert.equal(registered,1);assert.equal(calls,0);
});
