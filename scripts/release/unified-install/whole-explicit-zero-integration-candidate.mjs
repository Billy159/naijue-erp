/** Offline bounded zero-approval successor. No installed-catalog admission,
 * permission expansion, target access, record publication or runtime activation. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {renderWholeHistoricalReceptionCandidate} from './whole-sales-integration-candidate.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code);};
export const EXPLICIT_ZERO_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0027_explicit_zero_evidence_successor.sql',sha256:'709e76b6d6f00ce06a8468f3605f938919d2e721c82798fa0ca278dc7b8b5db2'});
function transactionBody(sql){need((sql.match(/^BEGIN;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'EXPLICIT_ZERO_TRANSACTION_INVALID');return sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);}
export async function renderWholeExplicitZeroCandidate(root){
 const prior=await renderWholeHistoricalReceptionCandidate(root),patch=await readFile(resolve(root,EXPLICIT_ZERO_SQL_PIN.path),'utf8');
 need(hash(patch)===EXPLICIT_ZERO_SQL_PIN.sha256,'EXPLICIT_ZERO_SQL_SOURCE_DIFFERS');
 const spec=JSON.parse(patch.split('$explicit_zero_changes$')[1]),signature='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 const old=JSON.stringify({signature,sha256:spec.predecessor_sha256,new:true});
 need(prior.accessSql.split(old).length===2,'EXPLICIT_ZERO_ACCESS_PREDECESSOR_DIFFERS');
 const accessSql=prior.accessSql.replace(old,()=>JSON.stringify({signature,sha256:spec.successor_sha256,new:true}));
 const previousAccess=transactionBody(prior.accessSql);
 need(prior.sql.split(previousAccess).length===2,'EXPLICIT_ZERO_INSTALL_POSITION_INVALID');
 const sql=prior.sql.replace(previousAccess,()=>transactionBody(patch)+'\n'+transactionBody(accessSql));
 const routineChanges=prior.manifest.routineChanges.map(x=>x.signature===signature?{...x,after:spec.successor_sha256}:x);
 return {...prior,sql,accessSql,
  catalogPinProposal:{...prior.catalogPinProposal,format:'WHOLE_EXPLICIT_ZERO_PIN_PROPOSAL_V1',changes:routineChanges},
  manifest:{...prior.manifest,format:'WHOLE_EXPLICIT_ZERO_CANDIDATE_V1',sqlSha256:hash(sql),routineChanges,
   predecessorChain:[...prior.manifest.predecessorChain,{signature,before:spec.predecessor_sha256,after:spec.successor_sha256}],sourcePins:[...prior.manifest.sourcePins,EXPLICIT_ZERO_SQL_PIN],
   explicitZeroEvidence:{format:'EXPLICIT_ZERO_APPROVAL_MERKLE_V1',maxRows:250000,maxProofDepth:18,authority:'INDEPENDENT_FILE_SHA_VERIFIED_BY_TRUSTED_HOST',sqlAuthorityClaim:false,newDatabaseColumns:0,newDatabaseTables:0,newDatabaseRoutines:0}}};
}
