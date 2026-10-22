import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { openNativeImportBootstrap } from './native-bootstrap.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { HISTORY_COUNT_KEYS, HISTORY_MAPPING_VERSION } from '../../packages/application/src/history-storage-contract.ts';
import { prepareNativePartyImportChunk, validatePreparedNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`, pin = 'a'.repeat(64), sha = b => createHash('sha256').update(b).digest('hex');
async function fixture(t, mutate = () => {}) {
  const dir=await mkdtemp(join(await realpath(tmpdir()),'native-bootstrap-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const target={database:'demo_8877_synthetic_bootstrap',role:'synthetic_importer',serverAddress:'127.0.0.1',serverPort:55555,postmasterStartedAt:'synthetic-start'};
  const binding={version:'NATIVE_IMPORT_EXECUTION_19_V1',batchId:id(1),actorAccountId:id(30),fixedSourceNamespace:'synthetic:bootstrap',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:pin,authorizedPayloadHash:'b'.repeat(64),target};
  const source={format:'PRIVATE_OLD_ACCOUNT_SOURCE_CAPTURE_V1',oldSourceBatchId:'SYNTHETIC_OLD_SOURCE',oldSourceManifestSha256:'c'.repeat(64),rows:[0,1,2].map(i=>({sourceAccountId:id(10+i),sourceAccountVersion:1,sourceEmployeeNativeId:i===2?null:id(10+i),sourceEmployeeCode:i===2?null:`000${i}`,oldSourceBatchId:'SYNTHETIC_OLD_SOURCE',
    loginName:`SYNTHETIC_PRIVATE_LOGIN_${i}`,credentialSalt:'1'.repeat(48),credentialHash:'pbkdf2-sha256:600000:'+'2'.repeat(64),sourceRole:i===0?'ADMIN':'WAREHOUSE',sourceHallId:null,sourceStoreId:null,sourceEmploymentStatus:'在职',sourceLoginEnabled:true,sourceEnabled:true}))};
  const accounts=source.rows.slice(0,2).map((r,i)=>({sourceAccountId:r.sourceAccountId,sourceAccountVersion:1,sourceEmployeeNativeId:r.sourceEmployeeNativeId,sourceEmployeeCode:r.sourceEmployeeCode,staffSourceKey:r.sourceEmployeeNativeId,nativeAccountId:id(30+i),nativeStaffId:id(60+i),sourceRole:r.sourceRole,nativeRole:r.sourceRole,sourceHallId:null,sourceStoreId:null,nativeHallId:null,sourceEmploymentStatus:'在职',sourceLoginEnabled:true,sourceEnabled:true}));
  const command={action:'IMPORT_STAGE',actorAccountId:binding.actorAccountId,requestKey:'synthetic-original-stage',batchId:binding.batchId,sourceName:binding.fixedSourceNamespace,sourceManifestRef:'synthetic:exact-original-selection',sourceHash:pin,cutoffAt:binding.cutoffAt,mappingVersion:HISTORY_MAPPING_VERSION,
    expected:{WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:1},historyMetadata:{payloadHash:binding.authorizedPayloadHash,expectedCounts:Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,k==='import_source_row'?2:0]))}};
  const decisions={version:'NATIVE_ACCOUNT_IDENTITY_CANDIDATE_V1',batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:pin,containsCredentials:false,containsLoginNames:false,accounts,unlinked:[{sourceAccountId:id(12)}],importerCandidate:{sourceAccountId:id(10),nativeAccountId:id(30)}};
  mutate({source,decisions,binding,command});
  const sb=Buffer.from(JSON.stringify(source));decisions.sourceCaptureSha256=sha(sb);const db=Buffer.from(JSON.stringify(decisions));
  const review={version:'C_NATIVE_ACCOUNT_BOOTSTRAP_REVIEW_V1',sourceCaptureSha256:sha(sb),accountDecisionSha256:sha(db),oldSourceBatchId:source.oldSourceBatchId,oldSourceManifestSha256:source.oldSourceManifestSha256,binding,
    stageCommandSha256:requestHash(command),expectedSourceRows:3,expectedLinkedRows:2,expectedUnlinkedRows:1,importerSourceAccountId:id(10)};
  const rb=Buffer.from(JSON.stringify(review)),sourceFile=join(dir,'source-private.json'),decisionFile=join(dir,'decision.json'),reviewFile=join(dir,'review-outside.json');
  for(const[path,bytes]of[[sourceFile,sb],[decisionFile,db],[reviewFile,rb]])await writeFile(path,bytes,{mode:0o600});
  const partyInputs=new Map();for(const [i,r]of source.rows.slice(0,2).entries()){
    const table=IMPORT_V2_TABLES.find(t=>t.entity==='STAFF'),fields={...Object.fromEntries(table.columns.map(c=>[c.name,''])),'来源编号':id(10+i),'姓名':'SYNTHETIC source staff','角色':i===0?'管理员':'仓库','任职状态':'在职'};
    const input={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:{entity:'STAFF',source:'BASE_V2',path:table.file,baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,csvSha256:pin},
      source:{id:id(80+i),batchId:binding.batchId,entityType:'STAFF',sourceKey:id(10+i),fileRef:'synthetic.xlsx',sheet:'STAFF',rowNo:String(2+i),sourceFileSha256:pin,rowSha256:pin,rawFields:fields,normalizedFields:fields,fieldProvenance:{schema_version:1,fields:{}}},
      nativeSnapshot:{id:id(60+i),name:'SYNTHETIC source staff',hall_id:null,role:i===0?'ADMIN':'WAREHOUSE',contact:null,employment_status:'在职',version:1},bindings:{},enumMappings:{'角色':{raw:fields['角色'],native:i===0?'ADMIN':'WAREHOUSE',evidenceRef:'synthetic-role'},'任职状态':{raw:'在职',native:'在职',evidenceRef:'synthetic-state'}}};partyInputs.set(id(10+i),input);
  }
  const partySource={async verify(){},async bootstrapPartyClosure(key){const input=partyInputs.get(key);assert.ok(input,'Exact source-only staff lookup, never byname');return{chunk:prepareNativePartyImportChunk([input]),staff:{sourceKey:key,nativeId:input.nativeSnapshot.id,role:input.nativeSnapshot.role,hallId:null,employmentStatus:'在职',source:input.source}};},async authorizePartyChunk(c){validatePreparedNativePartyImportChunk(c);assert.ok(partyInputs.has(c.rows[0].input.source.sourceKey));}};
  return{options:{binding,accountSourceFile:sourceFile,trustedAccountSourceSha256:sha(sb),accountDecisionFile:decisionFile,trustedAccountDecisionSha256:sha(db),reviewFile,trustedReviewSha256:sha(rb),partySource},command,binding,sourceFile,privateLoginMarker:'SYNTHETIC_PRIVATE_LOGIN_'};
}
function client(f){const calls=[],accounts=[],intents=new Map(),natives=new Set(),sources=new Map();let nonempty=false,failAccount=0;
  return{calls,accounts,set nonempty(v){nonempty=v;},set failAccount(v){failAccount=v;},async query(sql,values=[]){calls.push(sql);const ans=(rows=[])=>({rows,rowCount:rows.length});
    if(sql.includes('native-bootstrap:target'))return ans([{database:f.binding.target.database,role:f.binding.target.role,server_address:f.binding.target.serverAddress,server_port:f.binding.target.serverPort,postmaster_started_at:f.binding.target.postmasterStartedAt,versions:Array.from({length:19},(_,i)=>i+1)}]);
    if(sql.includes('native-bootstrap:one-new-batch'))return ans([{id:f.binding.batchId,source_name:f.binding.fixedSourceNamespace,source_hash:pin,status:'STAGED',batch_count:1}]);
    if(sql.includes('native-bootstrap:empty-domain'))return ans([{existing:nonempty}]);
    if(sql.includes('native-bootstrap:account')){if(accounts.length+1===failAccount)throw Error('SYNTHETIC second account failure');assert.ok(natives.has(values[1]));accounts.push(values);return ans([{id:values[0],staff_id:values[1]}]);}
    if(sql.includes('native-party-import:schema'))return ans([{installed_versions:Array.from({length:19},(_,i)=>i+1)}]);
    if(sql.includes('AS integrity_guards_present'))return ans([{integrity_guards_present:true}]);if(sql.includes('AS accounting_guards_present'))return ans([{accounting_guards_present:true}]);
    if(sql.includes(':global-lock'))return ans();if(sql.includes(':batch'))return ans([{mapping_version:HISTORY_MAPPING_VERSION,status:'STAGED',source_hash:pin,source_name:f.binding.fixedSourceNamespace,already_published:false}]);
    if(sql.includes('native-party-import:target'))return ans(natives.has(values[0])?[{id:values[0]}]:[]);
    if(sql.includes('native-party-import:replay-complete'))return ans([{source_complete:true,reference_complete:true,record_complete:true}]);
    if(sql.includes('native-party-import:replay'))return ans(intents.has(values[1])?[{evidence_equal:JSON.stringify(intents.get(values[1]))===values[0]}]:[]);
    if(sql.includes('native-party-import:intent')){const v=JSON.parse(values[0]);intents.set(v.source_row_id,v);return ans([{source_row_id:v.source_row_id}]);}
    if(sql.includes('native-party-import:create')){const v=JSON.parse(values[0]);natives.add(v.id);return ans([{id:v.id}]);}
    if(sql.includes('native-party-import:new-source-identity'))return ans();
    if(sql.includes('reference:native'))return ans([{id:values[0],native_equal:true}]);
    if(sql.includes('reference:replay'))return ans(sources.has(values[0])?[{source_equal:JSON.stringify(sources.get(values[0]))===values[1],reference_equal:true}]:[]);
    if(sql.includes('reference:source')){const v=JSON.parse(values[0]);sources.set(v.id,v);return ans([{id:v.id}]);}
    if(sql.includes('reference:reference'))return ans([{source_row_id:JSON.parse(values[0]).source_row_id}]);
    throw Error('Unexpected bootstrap SQL protocol: '+sql.slice(0,100));
  }};
}
const context=f=>({command:f.command,now:'2026-10-22T00:00:00Z',operationId:stableImportId('operation',f.binding.actorAccountId,f.command.requestKey)});
test('private bootstrap source authorization precedes DB; pinned real-role mapping prepares every linked account and excludes only explicitunlinked',async t=>{
  const f=await fixture(t),b=await openNativeImportBootstrap(f.options);t.after(()=>b.close());const c=client(f);await b.authorizeStageSourceActor(f.binding.actorAccountId,f.command);assert.equal(c.calls.length,0);
  assert.equal(b.report.sourceAccounts,3);assert.equal(b.report.preparedAccounts,2);assert.equal(b.report.unlinkedRetained,1);assert.ok(!JSON.stringify(b.report).includes(f.privateLoginMarker));
  await assert.rejects(b.authorizeStageSourceActor(id(999),f.command),/STAGE_SOURCE_AUTHORIZATION/);
  await assert.rejects(b.authorizeStageSourceActor(f.binding.actorAccountId,{...f.command,requestKey:'changed-original'}),/STAGE_SOURCE_AUTHORIZATION/);assert.equal(c.calls.length,0);
});
test('bootstrap creates exact staff/source/evidence before every linked account on oneborrowedclient; no internaltransaction or credentialsinreceipt',async t=>{
  const f=await fixture(t),b=await openNativeImportBootstrap(f.options);t.after(()=>b.close());const c=client(f);await b.stageBootstrap.stageNewBatch(c,context(f));
  assert.equal(c.accounts.length,2);assert.deepEqual(c.accounts.map(x=>x[0]),[id(30),id(31)]);assert.ok(c.accounts.every(x=>x[3].startsWith('naijue:pbkdf2-sha256:1:600000:')));
  assert.ok(c.calls.every(sql=>!/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/.test(sql)));assert.ok(c.calls.indexOf(c.calls.find(sql=>sql.includes('native-party-import:create')))<c.calls.indexOf(c.calls.find(sql=>sql.includes('native-bootstrap:account'))));
});
test('missing outsidegrant, skipped linkedaccounts and false ADMIN mapping failclosed before DB or exposedsourcecredentials',async t=>{
  const f=await fixture(t);await assert.rejects(openNativeImportBootstrap({...f.options,trustedReviewSha256:null}),/OUTSIDE_PIN/);
  const missing=await fixture(t,({decisions})=>{decisions.accounts.pop();});await assert.rejects(openNativeImportBootstrap(missing.options),/REVIEW_BINDING|FULL_ACCOUNT_SET/);
  const role=await fixture(t,({source})=>{source.rows[0].sourceRole='WAREHOUSE';});await assert.rejects(openNativeImportBootstrap(role.options),/EXACT_ACCOUNT_MAPPING|STAFF_FACTS_CHANGED|REAL_IMPORTER/);
});
test('nonempty target or changed source refuses; innerwritefailure remains for MAIN rollback and originalkey recovery',async t=>{
  const f=await fixture(t),b=await openNativeImportBootstrap(f.options);t.after(()=>b.close());const c=client(f);c.nonempty=true;await assert.rejects(b.stageBootstrap.stageNewBatch(c,context(f)),/TARGET_NOT_EMPTY/);assert.equal(c.accounts.length,0);
  const failing=client(f);failing.failAccount=2;await assert.rejects(b.stageBootstrap.stageNewBatch(failing,context(f)),/SYNTHETIC second account failure/);assert.equal(failing.accounts.length,1);assert.ok(failing.calls.every(sql=>!/^(BEGIN|COMMIT|ROLLBACK)\b/.test(sql)));
  await writeFile(f.sourceFile,Buffer.concat([await readFile(f.sourceFile),Buffer.from(' ')]));const untouched=client(f);await assert.rejects(b.stageBootstrap.stageNewBatch(untouched,context(f)),/FILE_CHANGED/);assert.equal(untouched.calls.length,0);
});
