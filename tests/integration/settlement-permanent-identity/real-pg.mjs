/** NOT EXECUTED. Inject an explicitly authorized fresh synthetic setup and physical
 * target. Uses the existing real SQL whole-package atomicity/replay runner.
 * No connections, credentials, installer, role grants or target discovery here. */
import assert from 'node:assert/strict';
import {registerWholePackageSqlAtomicity} from '../whole-package-sql-atomicity.mjs';
import {buildSettlementIdentityProgram} from './program.mjs';
export function registerSettlementIdentityPg(register,setup,expectedTarget){
 if(typeof register!=='function'||typeof setup!=='function'||!expectedTarget||!/^synthetic_whole_[a-z0-9_]{1,48}$/.test(expectedTarget.database_name)||!['127.0.0.1','::1'].includes(expectedTarget.server_address)||!Number.isInteger(expectedTarget.server_port)||!/^[1-9][0-9]*$/.test(expectedTarget.database_oid)||!/^[1-9][0-9]*$/.test(expectedTarget.system_identifier)||!/^[a-f0-9]{64}$/.test(expectedTarget.catalog_sha256))throw Error('EXPLICIT_FRESH_SYNTHETIC_TARGET_REQUIRED');
 expectedTarget=structuredClone(expectedTarget);
 registerWholePackageSqlAtomicity(register,async mode=>{
  const f=await setup(mode);
  try{
   for(const client of [f.writer,f.observer]){
    const result=await client.query("SELECT current_database() AS database_name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,host(inet_server_addr()) AS server_address,inet_server_port() AS server_port,(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier");
    const {catalog_sha256,...physical}=expectedTarget;assert.deepEqual(result.rows,[physical]);
   }
   const catalog=await f.observer.query("SELECT encode(sha256(convert_to((SELECT string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.prokind='f'),'UTF8')),'hex') AS hash");
   assert.equal(catalog.rows[0].hash,expectedTarget.catalog_sha256);
   const target={protocol:'STANDARD_IMPORT_SQL_V1',database_name:expectedTarget.database_name,database_oid:expectedTarget.database_oid,system_identifier:expectedTarget.system_identifier,catalog_sha256:expectedTarget.catalog_sha256};
   const {program,expected}=buildSettlementIdentityProgram(target),priorAssert=f.assertPublished;
   return{...f,initialize:program.initialize,steps:program.steps,async assertPublished(observer,summary){
    await priorAssert(observer,summary);
    const rows=(await observer.query('SELECT id,sales_id,amount::text,direction FROM naijue_erp.sales_settlement ORDER BY id')).rows;
    assert.equal(rows.length,16);assert.equal(new Set(rows.map(r=>r.id)).size,16);
    for(const row of rows){const match=expected.find(e=>e.id===row.id);assert.ok(match);assert.equal(row.sales_id,match.sales_id);assert.equal(row.amount,'1.00');assert.equal(row.direction,'RECEIVE');}
    const proofs=(await observer.query("SELECT id,target_id,naijue_erp.standard_import_record_proof(id) AS proof FROM naijue_erp.import_record WHERE target_type='SALES_SETTLEMENT' ORDER BY id")).rows;
    assert.equal(proofs.length,16);
    for(const row of proofs){const match=expected.find(e=>e.record_id===row.id);assert.ok(match);assert.equal(row.target_id,match.id);assert.equal(row.proof.fields.id,match.id);assert.equal(row.proof.fields.sales_id,match.sales_id);}
   }};
  }catch(error){await f.close();throw error;}
 },['success-and-exact-replay']);
}
