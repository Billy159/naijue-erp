/** Offline successor schema contract only. No installed-catalogue validation,
 * OS record loading/publication, physical-target authority or live host wiring. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {resolve} from 'node:path';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {WHOLE_CATALOG_QUERY} from './whole-catalog-gate.mjs';
import {loadFresh56CombinedCandidate} from './fresh56-combined-candidate.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const need=(ok,message)=>{if(!ok)throw Error(message);};
const models=new WeakMap();
const FORMAT='FRESH56_INSTALLATION_RECORD_SOURCE_DRAFT_V1';
export async function loadFresh56SuccessorModel(sourceRoot){
 const modelSources=[];
 for(const name of ['fresh56-combined-candidate.mjs','fresh56-successor-record-draft.mjs']){
  const path='scripts/release/unified-install/'+name;
  const sourceBytes=await readFile(resolve(sourceRoot,path)),moduleFileBytes=await readFile(new URL('./'+name,import.meta.url));
  need(sourceBytes.equals(moduleFileBytes),'FRESH56_MODEL_SOURCE_MODULE_FILE_DIFFERS');
  modelSources.push({path,sha256:hash(sourceBytes)});
 }
 const candidate=await loadFresh56CombinedCandidate(sourceRoot);
 const description={profile:'FRESH56_PUBLICATION9_FK7_ROWTYPE11',
  predecessorSourceSpecSha256:candidate.predecessorSourceSpecSha256,candidateSources:candidate.sources,
  candidateSourceSetSha256:candidate.sourceSetSha256,modelSources,
  predecessorCatalogQuerySha256:hash(WHOLE_CATALOG_QUERY),
  provenance:'SOURCE_BYTES_MATCH_CURRENT_MODULE_FILES_NOT_AUTHENTICATED_EXECUTION',
  expectedCatalog:{tableCount:56,routineCount:177,routinePins:candidate.successorRoutinePins,
   foreignKeyDelta:candidate.foreignKeyDelta,preserved:candidate.preserved},
  requiredEvidence:['EXACT_SUCCESSOR_CATALOG_QUERY_AND_ACL','INDEPENDENT_REVIEWED_PHYSICAL_TARGET_CATALOG','ROOT_OWNED_DISTINCT_INSTALLATION_RECORD','ATOMIC_INSTALL_IMPORT_ROLLBACK_REPLAY_AND_ORDINARY_BUSINESS_TESTS'],
  sourceOnly:true,installationReady:false,targetAdmitted:false};
 const model=freeze({...description,sourceModelSha256:hash(JSON.stringify(description))});
 const token=Object.freeze({profile:model.profile});models.set(token,model);return token;
}
export function describeFresh56SuccessorModel(token){need(models.has(token),'FRESH56_GENUINE_SOURCE_MODEL_REQUIRED');return models.get(token);}
function draftFor(token){const model=describeFresh56SuccessorModel(token);return {
 format:FORMAT,profile:model.profile,sourceModelSha256:model.sourceModelSha256,
 expectedCatalog:model.expectedCatalog,physicalTarget:null,installedAt:null,reviewedCatalog:null,
 sourceOnly:true,installationReady:false,targetAdmitted:false,
};}
export function renderFresh56RecordDraft(token){return JSON.stringify(draftFor(token),null,2)+'\n';}
/** Validates an offline draft against a genuine source model only. A success
 * result is deliberately not a spec, record binding or branded admission token. */
export function validateFresh56RecordDraft(text,token){
 const expected=draftFor(token);
 need(typeof text==='string'&&Buffer.byteLength(text)<=262144,'FRESH56_RECORD_DRAFT_BOUNDS');
 const parsed=parseStrictJson(text);
 need(isDeepStrictEqual(parsed,expected),'FRESH56_RECORD_DRAFT_DIFFERS');
 return Object.freeze({validDraft:true,sourceOnly:true,installationReady:false,targetAdmitted:false,
  sourceModelSha256:expected.sourceModelSha256});
}
// No caller-supplied record, client, path, approval or target can bypass this.
export async function loadFresh56InstalledRecord(){throw Error('FRESH56_INSTALLATION_EVIDENCE_UNIMPLEMENTED');}
export async function publishFresh56InstalledRecord(){throw Error('FRESH56_INSTALLATION_EVIDENCE_UNIMPLEMENTED');}
