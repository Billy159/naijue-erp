import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {loadFresh56SuccessorModel,describeFresh56SuccessorModel,renderFresh56RecordDraft,validateFresh56RecordDraft,loadFresh56InstalledRecord,publishFresh56InstalledRecord} from '../scripts/release/unified-install/fresh56-successor-record-draft.mjs';
import {validateInstallationRecord} from '../scripts/release/unified-install/whole-installation-record.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const token=await loadFresh56SuccessorModel(root),model=describeFresh56SuccessorModel(token),text=renderFresh56RecordDraft(token),draft=JSON.parse(text);
test('genuine source model yields exact177 pins and FK7 expectations but no installation authority',()=>{
 assert.equal(model.expectedCatalog.routinePins.length,177);assert.equal(model.expectedCatalog.foreignKeyDelta.length,7);
 assert.equal(model.expectedCatalog.tableCount,56);assert.equal(model.profile,'FRESH56_PUBLICATION9_FK7_ROWTYPE11');
 const result=validateFresh56RecordDraft(text,token);assert.equal(result.validDraft,true);assert.equal(result.installationReady,false);assert.equal(result.targetAdmitted,false);
 assert.equal(draft.physicalTarget,null);assert.equal(draft.installedAt,null);assert.equal(draft.reviewedCatalog,null);
 assert.ok(Object.isFrozen(model.expectedCatalog.routinePins[0]));
});
test('forged model tokens and cross-profile installation records are rejected',()=>{
 for(const fake of [{},model,JSON.parse(JSON.stringify(token))])assert.throws(()=>describeFresh56SuccessorModel(fake),/GENUINE/);
 assert.throws(()=>validateFresh56RecordDraft(JSON.stringify({format:'WHOLE_INSTALLATION_RECORD_V1'}),token),/DRAFT_DIFFERS/);
 assert.throws(()=>validateInstallationRecord(draft,model.sourceModelSha256),/UNTRUSTED/);
});
test('record validation rejects false observations, extra keys, changed body pins and FK deltas',()=>{
 const changes=[d=>d.installationReady=true,d=>d.physicalTarget={database:'fake'},d=>d.installedAt='2026-11-04T00:00:00.000Z',d=>d.reviewedCatalog={sha256:'0'.repeat(64)},d=>d.extra=true,d=>d.sourceModelSha256='0'.repeat(64),d=>d.expectedCatalog.routinePins[0].sha256='0'.repeat(64),d=>d.expectedCatalog.foreignKeyDelta[0].expression='true',d=>d.expectedCatalog.tableCount=35];
 for(const mutate of changes){const d=structuredClone(draft);mutate(d);assert.throws(()=>validateFresh56RecordDraft(JSON.stringify(d),token),/DRAFT_DIFFERS/);}
});
test('strict serialized JSON rejects duplicates, malformed or oversized input',()=>{
 assert.throws(()=>validateFresh56RecordDraft(text.replace('{','{"format":"forged",'),token));
 for(const invalid of [null,{},'{', ' '.repeat(262145)])assert.throws(()=>validateFresh56RecordDraft(invalid,token));
});
test('live record load and publish refuse before reading arguments or using external resources',async()=>{
 let touched=0;const poison=new Proxy({},{get(){touched++;throw Error('TOUCHED');}});
 await assert.rejects(loadFresh56InstalledRecord(poison),/FRESH56_INSTALLATION_EVIDENCE_UNIMPLEMENTED/);
 await assert.rejects(publishFresh56InstalledRecord(poison),/FRESH56_INSTALLATION_EVIDENCE_UNIMPLEMENTED/);assert.equal(touched,0);
});
test('alternate source root cannot claim changed model bytes; file equality does not claim authenticated execution',async()=>{
 const {mkdtemp,mkdir,copyFile,appendFile}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const temp=await mkdtemp(join(tmpdir(),'fresh56-model-source-'));
 await mkdir(join(temp,'scripts/release/unified-install'),{recursive:true});
 for(const name of ['fresh56-combined-candidate.mjs','fresh56-successor-record-draft.mjs']){
  const path='scripts/release/unified-install/'+name;await copyFile(join(root,path),join(temp,path));
 }
 await appendFile(join(temp,'scripts/release/unified-install/fresh56-successor-record-draft.mjs'),'\n// Changed provenance claim\n');
 await assert.rejects(loadFresh56SuccessorModel(temp),/MODEL_SOURCE_MODULE_FILE_DIFFERS/);
 assert.equal(model.provenance,'SOURCE_BYTES_MATCH_CURRENT_MODULE_FILES_NOT_AUTHENTICATED_EXECUTION');
});
