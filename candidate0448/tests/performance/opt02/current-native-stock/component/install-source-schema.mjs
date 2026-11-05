/** Exact original 40-file/137-body source installation using real paired brands.
 * No driver/cluster is constructed; query must be the host's physical-fenced admin.
 * No old SQL/target predicate/body pin is rewritten. */
import { assertPlan, sourceCohortFor } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { captureData, identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { outcomeBoundary } from '../sequence-acl-micro/contract.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
export async function installOriginalSourceSchema(input) {
  const args=captureData(input,['plan','target','query','gate','beforeFile','onSourceEvent']);
  const plan=assertPlan(args.plan),cohort=sourceCohortFor(plan),target=cohort.sourcePlan.targetSnapshot(args.target);
  need(typeof args.query==='function'&&typeof args.beforeFile==='function'&&typeof args.onSourceEvent==='function'
    &&typeof args.gate?.quarantined==='function','EXPLICIT_SOURCE_INSTALL_HOST_CALLBACKS_REQUIRED');
  let transaction=false,submitted=0;
  try {
    for(const file of plan.files){
      await cohort.sourcePlan.assertSources(plan);await args.beforeFile(file);
      if(file.path===cohort.sourcePlan.V22){
        const carrier=cohort.v22Carrier.v22Carrier(plan,target);
        await outcomeBoundary(args.gate,()=>args.query(carrier.sql),'MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY');
        await args.onSourceEvent({path:file.path,fileSha256:file.sha256,replacement:'ORIGINAL_131_GUARDED_NEW_TARGET_V22_CARRIER_ONE_TRANSACTION',
          originalStatementCount:file.statements.length,submittedSha256:carrier.sha256,originalMemberSha256:carrier.originalMemberSha256});
        continue;
      }
      for(const statement of file.statements){
        if(statement.kind==='BEGIN'){
          need(!transaction,'NESTED_SOURCE_TRANSACTION');await args.query(statement.sql);transaction=true;
          await args.query("SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='3s'");
          await args.query(cohort.sourcePlan.targetGuard(target));await args.query(`SET LOCAL ROLE ${identifier(target.owner)}`);
        }else if(statement.kind==='COMMIT'){
          need(transaction,'UNPAIRED_SOURCE_COMMIT');await cohort.sourcePlan.assertSources(plan);
          await args.query('RESET ROLE');await args.query(cohort.sourcePlan.targetGuard(target));
          await outcomeBoundary(args.gate,()=>args.query(statement.sql),'MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY');transaction=false;
        }else{need(transaction,'SOURCE_SQL_OUTSIDE_ORIGINAL_TRANSACTION');await args.query(statement.sql);}
        submitted++;await args.onSourceEvent({path:statement.path,index:statement.index,kind:statement.kind,statementSha256:statement.statementSha256});
      }
    }
    need(!transaction&&submitted===714,'EXACT_714_ORIGINAL_AND_GUARDED_V22_EVENT_REQUIRED');
    await cohort.sourcePlan.assertSources(plan);
    return Object.freeze({submittedOriginalStatements:714,sourceFiles:40,originalRoutineBodies:137,ordinaryBusinessAcceptance:false});
  }catch(error){
    if(transaction&&!args.gate.quarantined()){
      try{await args.query('ROLLBACK');transaction=false;}catch(rollback){throw new AggregateError([error,rollback],'SOURCE_INSTALL_AND_ROLLBACK_FAILED',{cause:error});}
    }
    throw error;
  }
}
