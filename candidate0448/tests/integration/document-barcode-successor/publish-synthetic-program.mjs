/** Test-only publication helper. Call only on a freshly installed, isolated
 * loopback PostgreSQL database named synthetic_document_*. This is one part
 * of the document fixture; it does not construct a parent SAVE or a runtime
 * capability. It never discovers credentials or falls back to an owner. */
import assert from 'node:assert/strict';
import pg from 'pg';
const INITIALIZER='erp_unified27_initializer_2393dbc6db9581c2';
const IMPORTER='erp_unified27_importer_2393dbc6db9581c2';
const PHASE=Object.freeze({masterChunk:'MASTER',baselineKeys:'KEYS',documentChunk:'DOCUMENTS',publish:'PUBLISH'});
export async function publishSyntheticProgram(client, program, encodedScrypt, expectedDatabase) {
 if (!(client instanceof pg.Client) || !/^synthetic_document_[a-z0-9_]+$/.test(expectedDatabase) || !program?.initialize || !Array.isArray(program.steps) || program.steps.length===0 || typeof encodedScrypt!=='string') throw Error('ISOLATED_SYNTHETIC_PROGRAM_REQUIRED');
 const id=await client.query("SELECT current_database() AS db, pg_catalog.host(pg_catalog.inet_server_addr()) AS host");
 if(id.rows.length!==1 || id.rows[0].db!==expectedDatabase || !['127.0.0.1','::1'].includes(id.rows[0].host)) throw Error('ISOLATED_LOOPBACK_TARGET_REQUIRED');
 const initialized=structuredClone(program.initialize), steps=structuredClone(program.steps); let began=false, commitAttempted=false;
 const call=async(sql,args)=>{const r=await client.query(sql,args);assert.equal(r.rowCount,1);return r.rows[0].result;};
 try {
  assert.equal((await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')).command,'BEGIN');began=true;
  assert.equal((await client.query(`SET LOCAL ROLE ${INITIALIZER}`)).command,'SET');
  const before=await call('SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text) AS result',[initialized,encodedScrypt]);
  if(before?.state!=='ABSENT') throw Error('FRESH_SYNTHETIC_TARGET_REQUIRED');
  await call('SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text) AS result',[initialized,encodedScrypt]);
  assert.equal((await client.query(`SET LOCAL ROLE ${IMPORTER}`)).command,'SET');
  for(let i=0;i<steps.length;i++) {const step=steps[i],phase=PHASE[step?.method];if(!phase)throw Error('UNKNOWN_SYNTHETIC_PHASE');await call('SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb) AS result',[initialized.operation_id,i+1,phase,step.request]);}
  const result=await call('SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid) AS result',[initialized.operation_id]);
  if(result?.state!=='PENDING_TRANSACTION')throw Error('SYNTHETIC_PUBLICATION_INCOMPLETE');
  assert.equal((await client.query('SET CONSTRAINTS ALL IMMEDIATE')).command,'SET');
  commitAttempted=true;assert.equal((await client.query('COMMIT')).command,'COMMIT');began=false;
  return Object.freeze({result,baselineBatchId:initialized.batch_id,documentBatchId:initialized.payload.document_batch_id});
 } catch(error) {if(began && !commitAttempted){try{await client.query('ROLLBACK');}catch(cleanup){throw new AggregateError([error,cleanup],'Synthetic publication failed and rollback is uncertain');}} throw error;}
}
