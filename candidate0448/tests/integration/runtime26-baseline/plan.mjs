/** Connection-free Phase1 inspection. No execution/approval switch exists. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadSourceInventory} from './source-inventory.mjs';
import {createAclCandidate} from './acl-matrix.mjs';
export async function inspectBaselineCandidate(profile='V6'){
 const inventory=await loadSourceInventory(),matrix=createAclCandidate(inventory,profile),p=inventory.profiles[profile];
 return {status:'SOURCE_PINNED_CANDIDATE_NOT_COMPLETE_BASELINE',mode:'OFFLINE_RENDER_ONLY_NO_EXECUTION',profile,sourceFingerprint:inventory.sourceFingerprint,expectedRoutineCount:p.expectedRoutineCount,matchingFinalRoutineBodies:p.routines.length,sourceTables:p.schema.tables.length,declaredColumnCandidates:p.schema.tables.reduce((n,t)=>n+t.columns.length,0),schemaValidation:p.schema.validation,unresolvedDynamicSchemaStatements:p.schema.unresolved.length,aclCells:matrix.cells.length,undeterminedAclCells:matrix.decisionsRequired.columnAndFunctionAndSequenceCells,matrixFingerprint:matrix.fingerprint,publicExceptionPreserved:matrix.publicExceptionPreserved,excludedUnwiredModuleTables:matrix.excludedUnwiredModuleTables,requiredNextStep:'Independent source/schema/ACL review and actual new-cluster birth/lifecycle scope before any Phase2 DDL; no runtime review produced'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length!==1||args[0]!=='--inspect'){process.stderr.write('Refused: Phase1 supports only --inspect; no database/approval/execution entry exists.\n');process.exitCode=2;}
 else console.log(JSON.stringify(await inspectBaselineCandidate(),null,2));
}
