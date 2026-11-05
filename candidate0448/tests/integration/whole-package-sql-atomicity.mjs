/** PostgreSQL acceptance runner, NOT EXECUTED in the source-only task.
 * The authorized test owner supplies two actual pg Clients on an isolated,
 * freshly installed synthetic target plus a compiled synthetic program.
 * This module never opens a connection, reads credentials, installs SQL or grants
 * roles. snapshot(observer) must use fresh READ COMMITTED statements and include
 * all 35 normal tables, receipts, audits, import records and document counters.
 */
import assert from 'node:assert/strict';
const roles={initializer:'erp_unified27_initializer_2393dbc6db9581c2',importer:'erp_unified27_importer_2393dbc6db9581c2'};
const phase={masterChunk:'MASTER',baselineKeys:'KEYS',documentChunk:'DOCUMENTS',publish:'PUBLISH'};
async function control(client,sql,command){const r=await client.query(sql);assert.equal(r.command,command);}
async function call(client,sql,args){const r=await client.query(sql,args);assert.equal(r.rowCount,1);return r.rows[0].result;}
/** register(name, fn) may be node:test's test function. setup creates a distinct
 * authorized synthetic target for each case; no existing user target is accepted.
 * Deliberately no default setup/env URL/owner fallback and no silent skips.
 */
export function registerWholePackageSqlAtomicity(register,setup,modes){
 const run=async(mode)=>{
  const f=await setup(mode);const {writer,observer,encodedScrypt,snapshot}=f;
  const initialize=structuredClone(f.initialize),steps=structuredClone(f.steps);
  const countMode=mode==='count-underflow-failure'||mode==='count-overflow-failure';
  if(countMode){
   // Keep every legitimate row and descriptor. Deliberately corrupt only the
   // declared cardinality, consistently in INIT and DOCUMENTS STAGE.
   const expected=initialize.payload.expected_documents;const key=Object.keys(expected).find(k=>k!=='IMPORT_BATCH'&&Number.isSafeInteger(expected[k])&&expected[k]>0);assert.ok(key);
   expected[key]+=mode==='count-underflow-failure'?1:-1;
   const stage=steps.find(s=>s.method==='documentChunk'&&s.request.payload.mode==='STAGE');assert.ok(stage);stage.request.payload.expected=structuredClone(expected);
   for(const step of steps) if(step.method==='documentChunk') step.request.payload.expected=structuredClone(expected);
  }
  assert.equal(f.syntheticIsolated,true);assert.notEqual(writer,observer);assert.ok(steps.length>=3);
  const before=await snapshot(observer);let began=false;
  const inspect=()=>call(writer,'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text) AS result',[initialize,encodedScrypt]);
  const executeStep=(step,ordinal)=>call(writer,'SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb) AS result',[initialize.operation_id,ordinal,phase[step.method],step.request]);
  const inspectReadOnly=async(expected)=>{await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN');began=true;await control(writer,`SET LOCAL ROLE ${roles.initializer}`,'SET');assert.equal((await writer.query('SELECT pg_catalog.pg_current_xact_id_if_assigned()::text AS xid')).rows[0].xid,null);const value=await inspect();assert.equal(value.state,expected);assert.equal((await writer.query('SELECT pg_catalog.pg_current_xact_id_if_assigned()::text AS xid')).rows[0].xid,null);await control(writer,'ROLLBACK','ROLLBACK');began=false;return value;};
  try{
   if(mode==='success-and-exact-replay'){
    // Real engine negative: old APIs are not a second active path in this profile.
    for(const role of Object.values(roles))for(const entry of ['standard_initialize_current_admin','standard_import_master_chunk','standard_import_baseline_keys','standard_import_document_chunk','standard_publish_import','standard_import_status','standard_import_inspect_target','standard_import_verify']){
     await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;
     await control(writer,`SET LOCAL ROLE ${role}`,'SET');
     await assert.rejects(()=>writer.query(`SELECT naijue_erp.${entry}($1::jsonb,$2::text)`,[{},null]),e=>e.code==='42501');
     await control(writer,'ROLLBACK','ROLLBACK');began=false;
    }
    assert.deepEqual(await snapshot(observer),before);
   }
   await inspectReadOnly('ABSENT');assert.deepEqual(await snapshot(observer),before);
   await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;
   await control(writer,`SET LOCAL ROLE ${roles.initializer}`,'SET');assert.equal((await inspect()).state,'ABSENT');
   await call(writer,'SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text) AS result',[initialize,encodedScrypt]);
   await control(writer,`SET LOCAL ROLE ${roles.importer}`,'SET');
   if(mode==='replica-after-prepare-failure'){
    await assert.rejects(()=>writer.query("SET LOCAL session_replication_role='replica'"),e=>e.code==='42501');
   }else if(mode==='prepare-only'){
    await assert.rejects(()=>control(writer,'SET CONSTRAINTS ALL IMMEDIATE','SET'));
   }else{
    let failed=false;
    for(let i=0;i<steps.length;i++){
     if(mode==='middle-failure'&&i===1){await assert.rejects(()=>executeStep(steps[i],i+99));failed=true;break;}
     if(mode==='constraint-failure'&&i===f.constraintFailureAt){
      assert.ok(f.constraintFailureStep);await assert.rejects(()=>executeStep(f.constraintFailureStep,i+1),e=>['23503','23505','23514','23502'].includes(e.code));failed=true;break;
     }
     if(mode==='publish-failure'&&i===steps.length-1){
      assert.equal(steps[i].method,'publish');const bad=structuredClone(steps[i]);bad.request.payload.expected_sequence=-1;
      await assert.rejects(()=>executeStep(bad,i+1));failed=true;break;
     }
     if(countMode){
      try{await executeStep(steps[i],i+1);}catch(e){
       assert.equal(e.code,'23514');
       if(mode==='count-underflow-failure')assert.match(e.message,/STANDARD_PUBLICATION_INCOMPLETE|STANDARD_COUNTER_RANGE_INVALID/);
       else assert.ok(['STANDARD_COUNTER_RANGE_INVALID','conversion counter type/range/monotonicity mismatch'].includes(e.message));
       if(mode==='count-underflow-failure'){assert.equal(i,steps.length-1);assert.equal(steps[i].method,'publish');assert.match(e.message,/STANDARD_PUBLICATION_INCOMPLETE/);}
       failed=true;break;
      }
     }else await executeStep(steps[i],i+1);
     if(mode==='sealed-append-failure'&&i===f.sealedAppendAfter){
      assert.ok(f.sealedAppendStep);await assert.rejects(()=>executeStep(f.sealedAppendStep,i+2),e=>e.code==='23514'&&e.message.includes('WHOLE_DOCUMENT_ALREADY_SEALED'));failed=true;break;
     }
     assert.deepEqual(await snapshot(observer),before,'another connection must not see a committed prefix');
    }
    if(mode.endsWith('failure')&&mode!=='replica-after-finish-failure')assert.equal(failed,true,'failure case must actually reach its injection');
    else{
     const pending=await call(writer,'SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid) AS result',[initialize.operation_id]);assert.equal(pending.state,'PENDING_TRANSACTION');
     if(mode==='replica-after-finish-failure'){await assert.rejects(()=>writer.query("SET LOCAL session_replication_role='replica'"),e=>e.code==='42501');await control(writer,'ROLLBACK','ROLLBACK');began=false;assert.deepEqual(await snapshot(observer),before);return;}
     assert.deepEqual(await snapshot(observer),before);
     if(mode==='zero-unknown-rollback'){await control(writer,'ROLLBACK','ROLLBACK');began=false;assert.deepEqual(await snapshot(observer),before,'explicit zero and all other package state roll back');return;}
     await control(writer,'COMMIT','COMMIT');began=false;
     const after=await snapshot(observer);assert.notDeepEqual(after,before);await f.assertPublished(observer,pending.summary);
     const readonlyReplay=await inspectReadOnly('COMMITTED');assert.deepEqual(readonlyReplay.summary,pending.summary);assert.deepEqual(await snapshot(observer),after);
     if(mode==='zero-unknown-success'){
      await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;await control(writer,`SET LOCAL ROLE ${roles.initializer}`,'SET');
      const verified=await call(writer,'SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text) AS result',[initialize,encodedScrypt]);
      assert.equal(verified.verified,true);assert.equal(verified.verification_profile,'STANDARD_WHOLE_PACKAGE_VERIFY_V2');
      assert.equal(verified.baseline_batch_id,initialize.batch_id);assert.equal(verified.batch_id,initialize.payload.document_batch_id);
      assert.equal(verified.source_counts.INVENTORY_KEY,2);assert.equal(verified.source_counts.WAREHOUSE,3);
      assert.equal(verified.inventory_coverage.explicit_source_keys,2);assert.equal(verified.inventory_coverage.explicit_zero_keys,1);
      assert.equal(verified.inventory_coverage.unknown_combinations_not_enumerated,true);assert.equal(verified.inventory_coverage.complete_total_inventory,false);
      for(const totals of [verified.source_totals,verified.current_totals]){
       assert.match(totals.inventory_quantity,/^100(?:\.0+)?$/);assert.match(totals.sales_quantity,/^16(?:\.0+)?$/);
       assert.match(totals.sales_line_amount,/^16(?:\.0+)?$/);assert.match(totals.sales_net_due,/^16(?:\.0+)?$/);
       assert.match(totals.sales_settlement_amount,/^16(?:\.0+)?$/);assert.match(totals.transfer_quantity,/^2(?:\.0+)?$/);
      }
      await control(writer,'COMMIT','COMMIT');began=false;await f.assertZeroUnknown(verified);
     }
     // New transaction, exact same INIT request: read stored full closure only.
     await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;
     await control(writer,`SET LOCAL ROLE ${roles.initializer}`,'SET');
     const verified=await call(writer,'SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text) AS result',[initialize,encodedScrypt]);
     assert.equal(verified.verified,true);assert.equal(verified.verification_profile,'STANDARD_WHOLE_PACKAGE_VERIFY_V2');assert.equal(verified.unknown_keys_materialized,false);
     const decimal=s=>{assert.match(s,/^-?\d+(?:\.\d+)?$/);return s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');};
     for(const key of Object.keys(verified.source_totals))assert.equal(decimal(verified.current_totals[key]),decimal(verified.source_totals[key]),'fresh import real numeric reconciliation '+key);
     const replay=await inspect();assert.equal(replay.state,'COMMITTED');assert.deepEqual(replay.summary,pending.summary);
     await control(writer,'COMMIT','COMMIT');began=false;assert.deepEqual(await snapshot(observer),after);
     // Same key, different plan must conflict rather than replay or write.
     await control(writer,'BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');began=true;await control(writer,`SET LOCAL ROLE ${roles.initializer}`,'SET');
     const conflict={...initialize,plan_sha256:initialize.plan_sha256==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64)};
     await assert.rejects(()=>call(writer,'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text) AS result',[conflict,encodedScrypt]),e=>e.code==='23505');
     await control(writer,'ROLLBACK','ROLLBACK');began=false;assert.deepEqual(await snapshot(observer),after);return;
    }
   }
   await control(writer,'ROLLBACK','ROLLBACK');began=false;assert.deepEqual(await snapshot(observer),before,'all effects, counters and audit rows roll back');
  }finally{if(began)await control(writer,'ROLLBACK','ROLLBACK');await f.close();}
 };
 for(const mode of modes??['success-and-exact-replay','prepare-only','middle-failure','publish-failure','constraint-failure','sealed-append-failure','count-underflow-failure','count-overflow-failure','large-document-success','multiple-documents-success','departure-null-success','departure-date-success','replica-after-prepare-failure','replica-after-finish-failure','zero-unknown-success','zero-unknown-rollback'])register('actual SQL whole package: '+mode,()=>run(mode));
}
