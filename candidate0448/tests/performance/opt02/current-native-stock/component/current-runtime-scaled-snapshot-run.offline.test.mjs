/** Pure MOCK protocol/source tests only: no target, SQL, PG or review authority. */
import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{PassThrough}from'node:stream';
import{parseAcceptanceArgs,ACCEPTANCE,EXPECTED,SEMANTICS,assertReferenceArtifact,buildReviewRequest,assertAcceptanceReview,assertExternalTargetReceipt,waitReviewHash,auditError,acceptanceTerminal,createFixedBusinessStageSaver,createFixedSamplingSaver,REVIEWER_FIXED_INPUTS}from'./current-runtime-scaled-snapshot-run.mjs';
import{BUSINESS_PURPOSES,SCALED_BUSINESS_STATUS}from'./scaled-current-runtime-business.mjs';import{SCALED_SAMPLING_STATUS}from'./scaled-snapshot-admission-sampling.mjs';import{LOGICAL}from'../reference-compiler-cohort-v2/universe.mjs';import{INTERNAL_TRIGGER_BINDINGS_SQL}from'./current-runtime-catalog-diagnostic-run.mjs';import{createBudget}from'../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const H=x=>createHash('sha256').update(x).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const target={systemIdentifier:'NEW_E007_SYNTHETIC',database:LOGICAL.database,databaseOid:'16387',owner:LOGICAL.sourceOwner,port:18577,postmasterStart:'2026-11-01 08:00:00+00',startsAt:1,expiresAt:1200001};
const identity={server_addr:'127.0.0.1/32'};
const canonical={path:ACCEPTANCE.base+'/canonical-observation.json',sha256:'c'.repeat(64),catalogSha256:'d'.repeat(64),utf8Bytes:1358459},bindings={path:ACCEPTANCE.base+'/internal-trigger-bindings.json',sha256:'e'.repeat(64)};
const request=()=>buildReviewRequest({target,identity,pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt,actualCanonical:canonical,bindings});
function originalReview(){const r=request();return{version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:r.issuerTarget,catalog:r.catalog,purposes:[...BUSINESS_PURPOSES],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:ACCEPTANCE.base+'/independent-review.json',sha256:'b'.repeat(64),result:'PASS'},realImportExecutionAuthorized:false};}
function pair(){const r=request(),actual={path:canonical.path,sha256:canonical.sha256,catalogSha256:canonical.catalogSha256},proof={format:'FINITE_CURRENT_RUNTIME_SOURCE_SEMANTIC_PROOF_V1',result:'PASS',physicalRunId:ACCEPTANCE.runId,systemIdentifier:target.systemIdentifier,target:r.issuerTarget,sourcePinsSha256:r.sourcePinsSha256,referenceCatalogSha256:EXPECTED.catalogSha256,actualCanonical:clone(canonical),bindings:clone(bindings),rulesSha256:SEMANTICS.rulesSha256,checkerSha256:SEMANTICS.checkerSha256,comparison:{status:'SOURCE_SEMANTICS_MATCH_ONLY_NOT_TARGET_REVIEW',canonicalRawSha256:canonical.catalogSha256,sourceRuleSha256:SEMANTICS.rulesSha256,sourceForeignKeyRoles:756,sourceUniqueRoles:2,allInternalBindings:758,exactUserTriggerObjects:196,rawCanonicalUnchanged:true,rawCanonicalUnchangedMeaning:'MOCK actual text is retained, not crosscluster equal',issuerOrTargetAuthority:'NONE',diagnosticLimits:'MOCK only; external target review required'},scope:'SOURCE_SEMANTICS_ONLY_NOT_METADATA_AUTHORITY'},receipt={format:'FINITE_CURRENT_RUNTIME_INDEPENDENT_TARGET_REVIEW_V1',result:'PASS',physicalRunId:ACCEPTANCE.runId,systemIdentifier:target.systemIdentifier,target:r.issuerTarget,sourcePinsSha256:r.sourcePinsSha256,catalog:r.catalog,referenceCatalogSha256:EXPECTED.catalogSha256,actualCanonical:actual,sourceSemantics:{path:ACCEPTANCE.base+'/source-semantic-proof.json',sha256:'f'.repeat(64),result:'PASS'},scope:'EXACT_TARGET_METADATA_ONLY',realImportExecutionAuthorized:false,checks:{startsAt:target.startsAt,expiresAt:target.expiresAt,reviewedAt:new Date(1000).toISOString(),sourceFiles:40,originalStatements:714,v22Parents:131,sourceFixtureRows:303,sourceFixtureDatasetId:'c20261101ba1a',originalPublicationCommands:4,sourceRoutines:137,effectivePrivilegeCells:4140,sourceTypeClosure:true,effectiveSessionReplicationRoleSetGuard:true,repeatableReadReadOnlySnapshot:'MOCK:RR:SNAPSHOT',sourceUserTriggers:196,totalEnabledTriggers:954,triggerNondrift:true,fullSourcePinsMatched:true,directOrdinaryLogin:true,evidence:[{path:canonical.path,sha256:canonical.sha256,bytes:10}]}};return{r,proof,receipt};}
const validate=({r,proof,receipt})=>assertExternalTargetReceipt(receipt,proof,{target,identity,request:r,snapshot:'MOCK:RR:SNAPSHOT'});
test('exact new e007 command/target only; old flags, arbitrary path/port and duplicate/coercible args refuse',()=>{
 assert.equal(parseAcceptanceArgs([]),null);assert.deepEqual(parseAcceptanceArgs(['--run-current-runtime-scaled-snapshot','a'.repeat(64)]),{trustedPinsSha256:'a'.repeat(64)});
 for(const a of [['--run-current-runtime-snapshot-admission','a'.repeat(64)],['--run-current-runtime-alias4-reviewed-acceptance','a'.repeat(64)],['--run-current-runtime-acceptance','a'.repeat(64)],['--run-current-runtime-catalog-diagnostic','a'.repeat(64)],['--run-current-runtime-scaled-snapshot','A'.repeat(64)],['--run-current-runtime-scaled-snapshot','a'.repeat(64),'--port','18572'],['--help','--help'],[1]])assert.throws(()=>parseAcceptanceArgs(a));
 assert.equal(ACCEPTANCE.runId,'c20261101e007');assert.equal(ACCEPTANCE.port,18577);assert.match(ACCEPTANCE.base,/pg-current-runtime-acceptance-c20261101e007$/);assert.match(ACCEPTANCE.pinsPath,/current-scaled-snapshot-e007\/SOURCE-PINS.json$/);
});
test('19-key pending request distinguishes source-only alias339 referencebd68 from actual rawcatalog, no automatic approval',()=>{
 const r=request();assert.equal(Object.keys(r).length,19);assert.equal(r.format,'FINITE_E007_SCALED_SNAPSHOT_INDEPENDENT_ISSUER_REVIEW_REQUEST_V1');assert.equal(r.status,'PENDING_EXTERNAL_REVIEW_NOT_AUTHORITY');assert.equal(r.authority,'NONE');assert.equal(r.referenceExpected.sha256,EXPECTED.catalogSha256);assert.equal(r.catalog.sha256,canonical.catalogSha256);assert.notEqual(r.catalog.sha256,r.referenceExpected.sha256);assert.deepEqual(r.purposes,BUSINESS_PURPOSES);assert.deepEqual(r.actualCanonical,canonical);assert.deepEqual(r.bindings,bindings);
 for(const id of ['7703089336081934099','7703096890285320019','7703102194329098126','7703108941652350921','7703123541136058418','7703146531489867910'])assert.throws(()=>buildReviewRequest({target:{...target,systemIdentifier:id},identity,pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt,actualCanonical:canonical,bindings}));
 const bad={...canonical,path:'/foreign/actual.json'};assert.throws(()=>buildReviewRequest({target,identity,pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt,actualCanonical:bad,bindings}));
});
test('source-only alias339 exact UTF8 remains immutable reference; not rewritten with an actual target digest',async()=>{
 const text=await readFile(EXPECTED.canonicalPath,'utf8');assert.equal(H(text),EXPECTED.catalogSha256);assertReferenceArtifact(text);assert.throws(()=>assertReferenceArtifact(text+' '));assert.throws(()=>assertReferenceArtifact('{}'));
});
test('original exact8 review accepts only actual rawhash and7identity/3purpose; copying referencehash is refused',()=>{
 const r=originalReview();assert.equal(assertAcceptanceReview(r,target,identity,canonical).result,'PASS');const wrong=originalReview();wrong.catalog.sha256=EXPECTED.catalogSha256;assert.throws(()=>assertAcceptanceReview(wrong,target,identity,canonical));
 for(const mutate of [x=>x.target.serverPort=18572,x=>x.target.actingRole=LOGICAL.sourceOwner,x=>x.catalog.format='OLD',x=>x.purposes.push('IMPORT_PUBLISH'),x=>x.realImportExecutionAuthorized=true,x=>x.extra=true]){const bad=originalReview();mutate(bad);assert.throws(()=>assertAcceptanceReview(bad,target,identity,canonical));}
});
test('MOCK external13-key proof+13-key target receipt bind exact artifacts/rules/target; validator only returns pin, no issuer',()=>{
 const p=pair();assert.equal(Object.keys(p.proof).length,13);assert.equal(Object.keys(p.receipt).length,13);assert.equal(Object.keys(p.proof.comparison).length,11);assert.deepEqual(validate(p),p.receipt.sourceSemantics);
});
test('external proof and receipt reject any wrong physicalrun/systemID/identity/sourcepins/reference/catalog/evidence',()=>{
 const mutations=[x=>x.proof.physicalRunId='c20261101e003',x=>x.receipt.systemIdentifier='old',x=>x.proof.target.sessionUser=LOGICAL.admin,x=>x.receipt.target.serverPort=18573,x=>x.proof.sourcePinsSha256='0'.repeat(64),x=>x.receipt.referenceCatalogSha256=canonical.catalogSha256,x=>x.receipt.catalog.sha256=EXPECTED.catalogSha256,x=>x.proof.actualCanonical.sha256='0'.repeat(64),x=>x.proof.actualCanonical.utf8Bytes=1,x=>x.proof.bindings.path='/foreign',x=>x.proof.bindings.sha256='0'.repeat(64),x=>x.receipt.actualCanonical.path='/foreign',x=>x.proof.rulesSha256='0'.repeat(64),x=>x.proof.checkerSha256='0'.repeat(64),x=>x.receipt.sourceSemantics.path='/foreign',x=>x.receipt.sourceSemantics.result='PENDING',x=>x.proof.scope='ALL',x=>x.receipt.realImportExecutionAuthorized=true,x=>x.proof.extra=true];
 for(const mutate of mutations){const p=pair();mutate(p);assert.throws(()=>validate(p));}
});
test('comparison is original source-only result, never target authority; counts/rawhash/foreign+unique cannot be weakened',()=>{
 for(const [k,v]of Object.entries({status:'PASS',canonicalRawSha256:EXPECTED.catalogSha256,sourceRuleSha256:'0'.repeat(64),sourceForeignKeyRoles:758,sourceUniqueRoles:0,allInternalBindings:757,exactUserTriggerObjects:195,rawCanonicalUnchanged:false,issuerOrTargetAuthority:'APPROVED'})){const p=pair();p.proof.comparison[k]=v;assert.throws(()=>validate(p));}
 for(const key of ['comparison','sourcePinsSha256','actualCanonical','bindings']){const p=pair();delete p.proof[key];assert.throws(()=>validate(p));}
 const p=pair();Object.defineProperty(p.proof.target,'database',{enumerable:true,get(){assert.fail('getter invoked');}});assert.throws(()=>validate(p));
});
test('rules/checker are exact pre-frozen source files and query is exact successfully executed allinternal v3 bytes',async()=>{
 assert.equal(H(await readFile(SEMANTICS.rulesPath)),SEMANTICS.rulesSha256);assert.equal(H(await readFile(SEMANTICS.checkerPath)),SEMANTICS.checkerSha256);assert.equal(H(INTERNAL_TRIGGER_BINDINGS_SQL),'f90d393cd0c42c9904a8cb01e4959aaf4e51d1641fdfc68d93ba8fe89d978934');
});
test('one SHA stdin protocol retained: originaldeadline/no paths/retry; incomplete/extra bytes refuse',async()=>{
 const s=new PassThrough(),c=new AbortController(),p=waitReviewHash(s,createBudget(Date.now(),1000),c.signal);s.write('a'.repeat(64)+'\n');assert.equal(await p,'a'.repeat(64));s.destroy();
 for(const text of ['','a'.repeat(64),'a'.repeat(64)+'\nX']){const stream=new PassThrough(),q=waitReviewHash(stream,createBudget(Date.now(),1000),c.signal);stream.end(text);await assert.rejects(q);stream.destroy();}
 const stream=new PassThrough(),q=waitReviewHash(stream,createBudget(Date.now(),20),c.signal);await assert.rejects(q,/ABSOLUTE_DEADLINE/);stream.destroy();
});
test('source evidence saves+originalguards precede WAIT; external checked+immutable files precede actual original business',async()=>{
 const s=await readFile(new URL('./current-runtime-scaled-snapshot-run.mjs',import.meta.url),'utf8');const ordered=["await save('canonical-observation.json'","await save('acceptance-rr-snapshot.json'","await save('internal-trigger-bindings.json'",'assertAcceptanceObservation(actual.rows[0],target)','const reviewRequest=buildReviewRequest',"status:'WAIT_REVIEW'",'const external=await readIndependentAcceptanceReview','const finite=await runScaledCurrentRuntimeBusinessWithContext'];const offsets=ordered.map(x=>{const i=s.indexOf(x);assert.ok(i>=0,x);return i;});assert.deepEqual(offsets,[...offsets].sort((a,b)=>a-b));
 assert.doesNotMatch(s,/assertExpectedCanonical|observed_canonical_text===expectedText|catalog_sha256===EXPECTED.catalogSha256|save\(['"](?:issuer-review|independent-review|source-semantic-proof)\.json/);
 assert.match(s,/createAcceptancePinRegistry\(\[\{path:actualCanonical.path/);assert.match(s,/if\(evidenceRegistry\)await evidenceRegistry.verify\(\)/);assert.match(s,/if\(externalRegistry\)await externalRegistry.verify\(\)/);assert.match(s,/referenceCatalogSha256:EXPECTED.catalogSha256/);
});
test('original20min/physical fence/unknowncloseonly/ownedstop/catalogfullprofile and exactmandatoryself files unchanged',async()=>{
 const s=await readFile(new URL('./current-runtime-scaled-snapshot-run.mjs',import.meta.url),'utf8');for(const text of ['budget=createBudget(Date.now())','preparePublishedScaledReferenceAlias4({plan,policy,target','createCapturedQueryBoundary({budget,queryMetrics:metrics})',"if(main&&!boundary.gate.quarantined())",'stopForeground(foreground)',"await fullSources('post-stop',true);result.sourcePostflight=true",'ORIGINAL_ISSUER_FULL_METADATA_WITH_RUNTIME_METRICS_NOT_OPT02_ACCEPTANCE',"const required=['current-runtime-scaled-snapshot-run.mjs','current-runtime-scaled-snapshot-run.offline.test.mjs'",'mtimeNs','ctimeNs'])assert.ok(s.includes(text),text);assert.doesNotMatch(s,/verificationProfile\s*:\s*['\"]DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1/);
});
test('terminal success still needs externalreview+originalbusiness+all cleanup, not source-only comparisons',()=>{
 const ok={observationPassed:true,independentReviewAccepted:true,businessPassed:true,samplingPassed:true,otherClients:0,clientsClosed:true,stopExitCode:0,foregroundDefinitiveClose:true,portState:'CLOSED',pidFileAbsent:true,processAbsent:true,controlShutDown:true,sourcePostflight:true};assert.match(acceptanceTerminal(ok),/^PASS_SCALED_SNAPSHOT_DIFFERENTIAL_NOT_OPT02_ACCEPTANCE$/);
 for(const [k,v]of Object.entries({independentReviewAccepted:false,businessPassed:false,samplingPassed:false,sourcePostflight:false,clientsClosed:false,unknownOutcome:true,firstFailure:{code:'SOURCE_MISMATCH'}}))assert.match(acceptanceTerminal({...ok,[k]:v}),/^FAILED/);
});
test('audit keeps original code/cause plus close failure and redacts all known secrets',()=>{
 const a=Object.assign(new Error('SECRET source'),{code:'SOURCE'}),b=Object.assign(new Error('close'),{code:'CLOSE'}),r=auditError(new AggregateError([a,b],'both',{cause:a}),s=>s.replaceAll('SECRET','[REDACTED]'));assert.equal(r.cause.code,'SOURCE');assert.equal(r.errors[0].code,'SOURCE');assert.equal(r.errors[1].code,'CLOSE');assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});

test('external review window cannot renew original20min; fullchecks/snapshot/evidence remain externally bound',()=>{
 for(const [key,value]of Object.entries({startsAt:0,expiresAt:target.expiresAt+1,reviewedAt:new Date(target.expiresAt).toISOString(),sourceFiles:39,originalStatements:713,v22Parents:130,sourceFixtureRows:104,originalPublicationCommands:3,sourceRoutines:136,effectivePrivilegeCells:4139,sourceUserTriggers:195,totalEnabledTriggers:953,sourceTypeClosure:false,effectiveSessionReplicationRoleSetGuard:false,triggerNondrift:false,fullSourcePinsMatched:false,directOrdinaryLogin:false,repeatableReadReadOnlySnapshot:'different',evidence:[]})){const p=pair();p.receipt.checks[key]=value;assert.throws(()=>validate(p));}
});

test('e007 pins/request regression and source-only339expected never reuse old E002/E004 format or old2b95approval',async()=>{
 const r=request(),source=await readFile(new URL('./current-runtime-scaled-snapshot-run.mjs',import.meta.url),'utf8');
 assert.equal(EXPECTED.catalogSha256,'bd68ad5e539c16a7ff3131770cb7ee69437b0a8e25c2eec995092740c8ac6622');assert.match(EXPECTED.canonicalPath,/independent-alias-read-policy-review\/PROPOSED-EXPECTED-CANONICAL-UTF8.txt$/);
 assert.equal(SEMANTICS.rulesSha256,'f21d42ee1f5905e75961475f128749c91ae02c0822aa3c0f27ef2bcfba831de3');assert.equal(SEMANTICS.checkerSha256,'b690cb759405a0ef4896003c57813aeca6c59567a4a9b2b5c421860a56e28d6d');
 assert.ok(source.includes('CURRENT_RUNTIME_SCALED_SNAPSHOT_E007_SOURCE_PINS_V1'));assert.ok(source.includes('compileAliasFourReadPolicy(basePolicy'));assert.ok(source.includes('observeAliasFourPolicy({policy'));assert.ok(source.includes('preparePublishedScaledReferenceAlias4({plan,policy,target'));
 assert.doesNotMatch(r.format,/E002|E004|E005/);assert.equal(REVIEWER_FIXED_INPUTS.length,7);assert.ok(REVIEWER_FIXED_INPUTS.every(p=>p.includes('independent-e007-target-review/')));
 const contract=JSON.parse(await readFile(REVIEWER_FIXED_INPUTS.find(p=>p.endsWith('/REVIEW-CONTRACT.json')),'utf8'));assert.equal(contract.requestFormat,r.format);assert.deepEqual(contract.requestKeys,Object.keys(r));
});
const stage=(sequence=1,transition='START')=>({format:'FINITE_CURRENT_RUNTIME_BUSINESS_STAGE_V1',sequence,stage:'SUPPLIER_EXECUTE',transition,action:null,operationId:null,receipt:null,resultHash:null,error:null});
test('fixed business stage saver uses unique sequence-stage-transition wx names, never calls RETURNED independentCOMMIT',async()=>{
 const saved=[],write=createFixedBusinessStageSaver(async(name,value)=>{saved.push({name,value});});await write(stage());await write(stage(2,'RETURNED'));
 assert.deepEqual(saved.map(x=>x.name),['business-stage-001-SUPPLIER_EXECUTE-START.json','business-stage-002-SUPPLIER_EXECUTE-RETURNED.json']);assert.equal(saved[1].value.transition,'RETURNED');assert.doesNotMatch(saved[1].name,/COMMIT/);await assert.rejects(write(stage(2,'RETURNED')));assert.equal(saved.length,2);
});
test('fixed stage saver rejects traversal/getters/parallel duplicate and retains exact loggerfailure without retry',async()=>{
 let count=0;const write=createFixedBusinessStageSaver(async()=>{count++;});for(const patch of [{stage:'../escape'},{sequence:'1'},{transition:'COMMITTED'},{resultHash:'notSHA'}])await assert.rejects(write({...stage(),...patch}));
 const getter=stage();Object.defineProperty(getter,'sequence',{enumerable:true,get(){assert.fail('stage getter');}});await assert.rejects(write(getter));assert.equal(count,0);
 const original=new Error('wx failed'),failed=createFixedBusinessStageSaver(async()=>{count++;throw original;});await assert.rejects(failed(stage()),e=>e===original);assert.equal(count,1);
 let release;const wait=new Promise(r=>{release=r;}),parallel=createFixedBusinessStageSaver(async()=>{await wait;});const first=parallel(stage());await assert.rejects(parallel(stage()));release();await first;
});

const sampleEvent=(sequence=1)=>({sequence,phase:'BASELINE',label:'narrow:first',result:{status:'VALID_SAMPLE',serviceWallNs:'123',events:[]}});
test('sampling terminal cannot claim OPT02 or pass without genuine sampling result plus all original cleanup',async()=>{
 const source=await readFile(new URL('./current-runtime-scaled-snapshot-run.mjs',import.meta.url),'utf8');
 const order=['const finite=await runScaledCurrentRuntimeBusinessWithContext',"await save('original-business-result.json'","await fullSources('pre-snapshot-admission-sampling')",'const sampling=await runScaledSnapshotAdmissionSampling',"await save('scaled-snapshot-admission-sampling.json'","await fullSources('post-snapshot-admission-sampling')"];
 const offsets=order.map(x=>{const i=source.indexOf(x);assert.ok(i>=0,x);return i;});assert.deepEqual(offsets,[...offsets].sort((a,b)=>a-b));
 assert.match(source,/context:finite.context,metrics,budget,signal:abort.signal/);
 assert.match(source,/sampling.status===SCALED_SAMPLING_STATUS/);assert.equal(SCALED_SAMPLING_STATUS,'PASS_SCALED_SNAPSHOT_ADMISSION_ONLY_NOT_OPT02_ACCEPTANCE');assert.match(source,/business.status===SCALED_BUSINESS_STATUS/);assert.equal(SCALED_BUSINESS_STATUS,'PASS_SCALED_CURRENT_RUNTIME_BUSINESS_ONLY_NOT_PERFORMANCE');
 assert.match(source,/safeSourceTextValues:\[COMPLETE_SCOPE_DECISION,'CUTOFF_MEMBER','POST_CUTOFF_CREATED'\]/);
});
test('fixed sample saver detaches exact JSON, uses unique monotonic wx artifact names and refuses fake fields',async()=>{
 const saved=[],save=createFixedSamplingSaver(async(name,value)=>{saved.push({name,value});});
 const e=sampleEvent();await save(e);e.result.serviceWallNs='mutated';assert.equal(saved[0].value.result.serviceWallNs,'123');
 assert.equal(saved[0].name,'sampling-001-BASELINE.json');await assert.rejects(save(sampleEvent()));
 for(const patch of [{phase:'../escape'},{sequence:'2'},{label:'bad label'},{extra:true}])await assert.rejects(save({...sampleEvent(2),...patch}));
 const bad=sampleEvent(2);Object.defineProperty(bad.result,'secret',{enumerable:true,get(){assert.fail('getter read');}});await assert.rejects(save(bad));
 const sparse=sampleEvent(2);sparse.result.events=Array(1);sparse.result.events.extra='replaced-hole';await assert.rejects(save(sparse));
 const next=sampleEvent(2);next.phase='DIFFERENTIAL';await save(next);assert.equal(saved.length,2);
});
test('sample saver retains failed original logger and permanently refuses retry; concurrent duplicate cannot write',async()=>{
 let sends=0;const original=new Error('wx uncertain failure'),save=createFixedSamplingSaver(async()=>{sends++;throw original;});
 await assert.rejects(save(sampleEvent()),e=>e===original);await assert.rejects(save(sampleEvent()));assert.equal(sends,1);
 let release;const waiting=new Promise(r=>release=r),writer=createFixedSamplingSaver(async()=>waiting),first=writer(sampleEvent());
 await assert.rejects(writer(sampleEvent()));release();await first;
});

test('scaled external metadata receipt requires exact303-row ba1a source, not old105 or cloned logicalID',()=>{for(const [key,value]of [['sourceFixtureRows',105],['sourceFixtureRows',304],['sourceFixtureDatasetId','c20261101cafe'],['sourceFixtureDatasetId',null]]){const p=pair();p.receipt.checks[key]=value;assert.throws(()=>validate(p));}const p=pair();delete p.receipt.checks.sourceFixtureDatasetId;assert.throws(()=>validate(p));});
