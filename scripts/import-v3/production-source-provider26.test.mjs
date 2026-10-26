import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionSourceProvider26,providerVersion,sourceGroups,openSourceSession} from './production-source-provider26.mjs';
import {captureNativeSourceProvider26,captureNativeSourceSession26} from './production-source-host.mjs';
import {HISTORY_COUNT_KEYS} from '../../packages/application/src/history-storage-contract.ts';
import {HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,digest=c=>c.repeat(64);
function fixture(){
 const binding={version:'NATIVE_IMPORT_EXECUTION_26_V1',phase:'FULL_SOURCE_CONTINUATION_26_V1',batchId:id(1),actorAccountId:id(2),fixedSourceNamespace:'synthetic:provider26',
  cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:digest('a'),authorizedPayloadHash:digest('b'),coreSourceDigest:digest('c'),coreReceiptId:id(3),
  target:{database:'demo_8877_provider26',role:'synthetic',serverAddress:null,serverPort:null,postmasterStartedAt:'synthetic'}};
 const inputs={version:'PRODUCTION_SOURCE_PROVIDER26_INPUT_V1',binding,core:{receiptId:binding.coreReceiptId,coreSourceDigest:binding.coreSourceDigest},
  closureScope:{batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:binding.selectionSha256,authorizedPayloadHash:binding.authorizedPayloadHash,
   expectedCounts:Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0])),expectedSourceEntityCounts:Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0]))},
  producers:Object.fromEntries(sourceGroups.map(group=>[group,{mode:'RETAINED',descriptor:{synthetic:group}}])),warehouses:[]};
 const trace={opens:[],closes:[],grants:[],verified:0,ready:0,authorityCloses:0,sourceChecks:0,nativeChecks:0,coreBound:0};
 const controller=new AbortController();let deny,boolean=false,mutate=false;
 const resources=new Map();
 const authority={
  async verifyInputs(){trace.verified++;},async assertGroupAllowed(group){trace.grants.push(group);if(group===deny)throw Object.assign(Error('SYNTHETIC_MISSING_REAL_APPROVAL'),{code:'SYNTHETIC_MISSING_REAL_APPROVAL',group});},
  async assertExecutionAllowed(){},async authorizeStep(step){trace.nativeChecks++;if(mutate)step.payload.changed=true;if(boolean)return true;},async assertAllowed(){},async authorizeNativeCommand(){},
  async openRetained(group){trace.opens.push(group);let closed=false;
   const resource={async verify(){assert.equal(closed,false);},async authorize(){trace.sourceChecks++;},async close(){assert.equal(closed,false);closed=true;trace.closes.push(group);},
    async bindCoreContinuation(p){assert.equal(p.authorizedPayloadHash,binding.authorizedPayloadHash);trace.coreBound++;},async authorizePartyChunk(){trace.sourceChecks++;},
    async *chunks(){yield{synthetic:group};},async *rows(){yield{synthetic:group};},async *groups(){yield{synthetic:group};},
    async openClosure(scope,context){assert.equal(scope.authorizedPayloadHash,binding.authorizedPayloadHash);assert.equal(context.group,group);
     return {async verify(){},async *sourceRows(){},async *typedRows(){},async *documents(){},async close(){}};}};
   resources.set(group,resource);return resource;},
  async capturedOptions(){throw Error('No C144 payload read in this fixture');},async openRetainedClosure(){throw Error('Unused');},
  async coreProjection(){return{authorizedPayloadHash:binding.authorizedPayloadHash,coreMembers:Array.from({length:115},(_,i)=>({sourceRowId:id(100+i)}))};},async *mainCommands(){throw Error('No MAIN grant in this preflight-only fixture');},
  async authorizeProductSource(){trace.sourceChecks++;},async close(){trace.authorityCloses++;},now:()=> '2026-10-24T00:00:00Z'};
 const context={binding,sources:{synthetic:true},signal:controller.signal,database:{ready(){trace.ready++;throw Object.assign(Error('Original runtime not active'),{code:'SYNTHETIC_ORIGINAL_RUNTIME_REQUIRED'});}}};
 return {binding,inputs,authority,trace,context,resources,controller,setDeny:g=>{deny=g;},setBoolean:()=>{boolean=true;},setMutate:()=>{mutate=true;}};
}
test('provider26 all11: original host captures executable session, retained factories and core binding without database or source recapture',async()=>{
 const f=fixture(),provider=createProductionSourceProvider26(f.inputs,f.authority);
 assert.equal(providerVersion,'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1');assert.equal(sourceGroups.length,11);
 const declared=captureNativeSourceProvider26(provider),session=captureNativeSourceSession26(await declared.openSourceSession(f.context),f.binding);
 await session.preflight();assert.deepEqual(f.trace.opens,sourceGroups);assert.deepEqual(f.trace.grants,sourceGroups);assert.equal(f.trace.coreBound,1);assert.equal(f.trace.ready,0);assert.equal(session.bootstrap26,null);
 for(const group of sourceGroups){const source=await session.openSources[group](f.inputs.closureScope,{group,signal:f.controller.signal});await source.verify();assert.deepEqual([...await Array.fromAsync(source.sourceRows())],[]);await source.close();}
 const step={kind:'PARTY',payload:{synthetic:'PARTIES'}};await session.authorizeStep(step);assert.equal(f.trace.sourceChecks,1);assert.equal(f.trace.nativeChecks,1);
 await session.nativeProductSourceReader.authorize({synthetic:'product-source-evidence'});assert.equal(f.trace.sourceChecks,2);
 await session.close();await session.close();assert.equal(f.trace.closes.length,11);assert.equal(f.trace.authorityCloses,1);
});
test('provider26 exact missing scheme or hall grant refuses before any source constructor or runtime activation',async()=>{
 for(const group of ['BARCODES','HEADERS']){const f=fixture();f.setDeny(group);const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);
  await assert.rejects(s.preflight(),e=>e.code==='SYNTHETIC_MISSING_REAL_APPROVAL'&&e.group===group);assert.equal(f.trace.opens.length,0);assert.equal(f.trace.ready,0);assert.equal(f.trace.authorityCloses,1);}
 const f=fixture();delete f.inputs.producers.SETTLEMENTS;assert.throws(()=>createProductionSourceProvider26(f.inputs,f.authority));
 f.inputs.binding.authorizedPayloadHash=f.inputs.binding.coreSourceDigest;assert.throws(()=>createProductionSourceProvider26(f.inputs,f.authority),{code:'PRODUCTION_PROVIDER26_FULL_BINDING_REQUIRED'});
});
test('provider26 original native authority cannot be a bool or mutate source payload; runtime is required for MAIN carry22',async()=>{
 const f=fixture(),s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);await s.preflight();
 f.setBoolean();await assert.rejects(s.authorizeStep({kind:'SKU',payload:{synthetic:1}}),{code:'PRODUCTION_PROVIDER26_AUTHORITY_RESULT'});
 await assert.rejects(s.steps().next(),{code:'SYNTHETIC_ORIGINAL_RUNTIME_REQUIRED'});assert.equal(f.trace.ready,1);await s.close();
 const g=fixture(),other=await createProductionSourceProvider26(g.inputs,g.authority).openSourceSession(g.context);await other.preflight();g.setMutate();
 await assert.rejects(other.authorizeStep({kind:'STOCK_CONTRIBUTOR',payload:{synthetic:1}}),{code:'PRODUCTION_PROVIDER26_STEP_MUTATED'});await other.close();
});
test('provider26 construction failure closes already opened source and authority; abort prevents late successful preflight',async()=>{
 const f=fixture();f.authority.coreProjection=async()=>({authorizedPayloadHash:digest('d')});
 const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);
 await assert.rejects(s.preflight(),{code:'PRODUCTION_PROVIDER26_CORE_PROJECTION'});assert.deepEqual(f.trace.closes,['PARTIES']);assert.equal(f.trace.authorityCloses,1);
 const g=fixture();const original=g.authority.openRetained;g.authority.openRetained=async(...args)=>{const r=await original(...args);g.controller.abort();return r;};
 const a=await createProductionSourceProvider26(g.inputs,g.authority).openSourceSession(g.context);await assert.rejects(a.preflight(),{code:'PRODUCTION_PROVIDER26_CLOSED'});assert.deepEqual(g.trace.closes,['PARTIES']);assert.equal(g.trace.authorityCloses,1);
});

test('provider26 standard module entry loads only independently pinned small operator input and authority, never an implicit source path',async t=>{
 const {mkdtemp,writeFile,realpath,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const directory=await mkdtemp(join(await realpath(tmpdir()),'provider26-input-'));
 const oldFile=process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_FILE,oldPin=process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256;
 t.after(async()=>{if(oldFile===undefined)delete process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_FILE;else process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_FILE=oldFile;if(oldPin===undefined)delete process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256;else process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256=oldPin;await rm(directory,{recursive:true,force:true});});
 const f=fixture(),marker=`provider26:${directory}`;globalThis[marker]={opened:0,closed:0};t.after(()=>delete globalThis[marker]);
 const code=`export async function openProductionSourceAuthority26(){globalThis[${JSON.stringify(marker)}].opened++;return {async verifyInputs(){},async assertGroupAllowed(){},async assertExecutionAllowed(){},async authorizeStep(){},async assertAllowed(){},async authorizeNativeCommand(){},async openRetained(){throw Error('NOT_READ');},async capturedOptions(){throw Error('NOT_READ');},async openRetainedClosure(){throw Error('NOT_READ');},async coreProjection(){throw Error('NOT_READ');},async *mainCommands(){throw Error('NOT_EXECUTED');},async authorizeProductSource(){},async close(){globalThis[${JSON.stringify(marker)}].closed++;},now:()=> '2026-10-24T00:00:00Z'};}`;
 const authorityFile=join(directory,'authority.mjs');await writeFile(authorityFile,code);
 f.inputs.authorityModule={path:authorityFile,sha256:createHash('sha256').update(code).digest('hex')};const bytes=JSON.stringify(f.inputs),file=join(directory,'input.json');await writeFile(file,bytes);
 process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_FILE=file;process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256=digest('f');
 await assert.rejects(openSourceSession(f.context),{code:'PRODUCTION_PROVIDER26_INPUT_CHANGED'});assert.equal(globalThis[marker].opened,0);
 process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256=createHash('sha256').update(bytes).digest('hex');
 const s=captureNativeSourceSession26(await openSourceSession(f.context),f.binding);assert.equal(globalThis[marker].opened,1);assert.equal(f.trace.ready,0);await s.close();assert.equal(globalThis[marker].closed,1);
});

test('provider26 continuation: original helper reads22 claims before BIND, skips core parties and refuses a repeated warehouse claim',async()=>{
 const f=fixture(),checkpoint={sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
 f.inputs.warehouses=Array.from({length:53},(_,i)=>({targetType:'WAREHOUSE',targetId:id(1000+i),sourceEntityType:'WAREHOUSE',sourceKey:`SYNTHETIC_WH_${i}`,sourceRecordHash:digest('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(2000+i),reviewedAt:'2026-10-24T00:00:00Z',decisionReason:'SYNTHETIC_APPROVED'}}));
 const sql=[],client={async query(text){sql.push(text);const rows=text.includes('native-core:carry-forward')?f.inputs.warehouses.slice(0,22).map(w=>({checkpoint,import_batch_id:f.binding.batchId,import_record_id:w.nativeRecord.id,target_type:'WAREHOUSE',target_id:w.targetId,operation_id:f.binding.coreReceiptId,checkpoint_sequence:1,source_entity_type:'WAREHOUSE',source_key:w.sourceKey,source_record_hash:w.sourceRecordHash,source_file_ref:w.sourceFileRef,warehouse_record:w.nativeRecord})):[];return{rows,rowCount:rows.length};},release(){f.trace.released=(f.trace.released??0)+1;}};
 f.context.database.ready=()=>({pool:{async connect(){return client;}},runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'IMPORT_STAGE');}}});
 const original=f.authority.openRetained;f.authority.openRetained=async(...args)=>{const resource=await original(...args);if(args[0]==='PARTIES')resource.chunks=async function*(){yield{rows:Array.from({length:115},(_,i)=>({input:{source:{id:id(100+i)}}}))};};return resource;};
 const phases=[];f.authority.mainCommands=async function*(phase,ctx){phases.push(phase);assert.equal(ctx.progress.remainingWarehouses.length,31);assert.equal(ctx.progress.claims.length,22);
  if(phase==='BIND')yield{action:'IMPORT_BIND_FULL_SOURCE',batchId:f.binding.batchId,actorAccountId:f.binding.actorAccountId,expectedSequence:ctx.progress.checkpoint.sequence,expectedCursor:22,fullBinding:{coreReceiptId:f.binding.coreReceiptId,coreSourceDigest:f.binding.coreSourceDigest,authorizedPayloadHash:f.binding.authorizedPayloadHash}};
  else if(phase==='ACCOUNT')yield{action:'IMPORT_CHUNK',batchId:f.binding.batchId,actorAccountId:f.binding.actorAccountId,items:[f.inputs.warehouses[0]]};
 };
 const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);await s.preflight();const iterator=s.steps();
 const first=await iterator.next();assert.equal(first.value.payload.action,'IMPORT_BIND_FULL_SOURCE');assert.equal(sql[0],'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(sql.at(-1),'COMMIT');assert.equal(f.trace.released,1);
 const kinds=[];for(let i=0;i<10;i++)kinds.push((await iterator.next()).value.kind);assert.equal(kinds.includes('PARTY'),false);assert.deepEqual(kinds,['CATALOGUE','PRODUCT','SKU','BARCODE','STOCK_CONTRIBUTOR','PAYMENT','HEADER','SALES_DETAIL','SETTLEMENT','TRANSFER_LINES']);
 await assert.rejects(iterator.next(),{code:'PRODUCTION_PROVIDER26_CORE_CLAIM_REPEATED'});assert.deepEqual(phases,['BIND','ACCOUNT']);assert.equal(sql.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q)),false);await s.close();
});

async function retainedBarcodeFiles(t,options={}){
 const {mkdtemp,writeFile,readFile,realpath,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const {prepareNativeBarcode,nativeBarcodeSourceEvidence,nativeBarcodeSchemeInitializationRows26,NATIVE_BARCODE_MAIN_DEMOTION_VERSION}=await import('../../packages/application/src/native-barcode-import.ts');
 const {IMPORT_V2_TABLES}=await import('../../packages/application/src/import-v2-contract.ts');
 const {historyClosureProjectionRow26:project,historyClosureRowHash:rowHash}=await import('../../packages/application/src/history-typed-closure.ts');
 const sha=b=>createHash('sha256').update(b).digest('hex'),dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-provider26-barcode-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const f=fixture(),sourceBinding=Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,f.binding[k]]));
 async function save(name,bytes){const path=join(dir,name);await writeFile(path,bytes,{mode:0o600});return{path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};}
 const schemes=nativeBarcodeSchemeInitializationRows26(),prepared=[1,2,3].map(n=>{
  const norm=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE').columns.map(c=>[c.name,'']));
  Object.assign(norm,{'来源编号':`SYNTHETIC:${n}`,'条码':`0000SYNTHETIC:${n}`,'条码性质':n===2?'已确认旧码':'主码','原始条码性质快照':'主码','绑定范围':'SKU','SKU来源编号':`SYNTHETIC_CANONICAL:${n}`,'合并前SKU来源编号':`SYNTHETIC_OLD:${n}`,'状态':'正常','原条码方案':schemes[n-1].native.name});
  const raw={...norm,'SKU来源编号':norm['合并前SKU来源编号'],'条码性质':'主码'};delete raw['绑定范围'];
  return prepareNativeBarcode({batchId:f.binding.batchId,fixedSourceNamespace:f.binding.fixedSourceNamespace,selection:{source:'V3_BARCODE_REPLACEMENT',entity:'BARCODE',path:'business/03历史条码.csv',baseManifestSha256:digest('a'),selectionSha256:f.binding.selectionSha256,approvalSha256:digest('a'),csvSha256:digest('a'),excludedSourceIdsSetSha256:digest('a')},
   source:{id:id(900-n),batchId:f.binding.batchId,entityType:'BARCODE',sourceKey:norm['来源编号'],fileRef:'SYNTHETIC.xlsx',sheet:'SYNTHETIC',rowNo:String(n+1),sourceFileSha256:digest('a'),rowSha256:digest('a'),rawFields:raw,normalizedFields:norm,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC ONLY',raw:v}]))}},
   nativeBarcodeId:id(100+n),sku:{nativeId:id(500+n),canonicalSourceKey:norm['SKU来源编号'],oldSourceSkuKey:norm['合并前SKU来源编号']},scheme:{id:schemes[n-1].native.id,snapshot:schemes[n-1].native},
   ...(n===2?{mainDemotion:{version:NATIVE_BARCODE_MAIN_DEMOTION_VERSION,mappingSha256:digest('a'),approvalSha256:digest('a'),entrySha256:digest('a'),sourceKey:norm['来源编号'],originalSourceRowSha256:digest('a'),oldSourceSkuKey:norm['合并前SKU来源编号'],canonicalSourceSkuKey:norm['SKU来源编号'],barcode:norm['条码'],keptMainSourceKey:'SYNTHETIC_KEEP',keptMainBarcode:'SYNTHETIC_KEEP_CODE'}}:{})});
 });
 const encoded=prepared.map(p=>Buffer.from(JSON.stringify(p)+'\n'));let offset=0;
 const entries=prepared.map((p,n)=>{const source=project('import_source_row',nativeBarcodeSourceEvidence(p)),typed=project('sku_barcode',p.nativeBarcode),e={ordinal:n,sourceKey:p.source.sourceKey,sourceRowId:p.source.id,nativeBarcodeId:p.nativeBarcodeId,prepared:{offset,bytes:encoded[n].length,sha256:sha(encoded[n]),fingerprint:p.fingerprint},original:{offset:n*10,bytes:1,sha256:p.source.rowSha256},source:{relation:source.relation,key:source.key,sha256:rowHash(source)},typed:{relation:typed.relation,key:typed.key,sha256:rowHash(typed)}};offset+=encoded[n].length;return e;});
 options.mutateIndex?.(entries);
 const cmp=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)),order=field=>entries.toSorted((a,b)=>cmp(a[field].key,b[field].key)).map(e=>e.ordinal);
 const permutation={version:'BARCODE15018_RETAINED_GLOBAL_ORDER_26_V1',source:order('source'),typed:order('typed'),schemes:{version:'APPROVED_EXACT6_BARCODE_INITIALIZATION_INPUT_26_V1',binding:structuredClone(sourceBinding),rows:schemes,proposalSha256:digest('a'),approvalSha256:digest('b'),humanQuestionCallId:'SYNTHETIC_ONLY'}};options.mutatePermutation?.(permutation);
 const artifacts={prepared:await save('prepared.jsonl',Buffer.concat(encoded)),index:await save('index.jsonl',entries.map(e=>JSON.stringify(e)+'\n').join('')),permutations:await save('permutations.json',JSON.stringify(permutation))};
 const manifest={version:'ORIGINAL_BARCODE15018_APPROVED_SOURCE_CAPTURE_26_V1',binding:sourceBinding,selectedRows:3,summary:{rows:3},source:{path:'/SYNTHETIC_RAW_MUST_NEVER_OPEN',bytes:30},inputPins:{proposal:{sha256:digest('a')},approval:{sha256:digest('b')}},artifacts};options.mutateManifest?.(manifest);
 const helperPath='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D3/retained-native-closure-streams-20261026.mjs';
 const helper=await save('approved-helper.mjs',await readFile(helperPath));assert.equal(helper.sha256,'c366469ba18d1b0be26b3478b8cd54ede013268d88feb644b36802c9b6e38ca6');
 f.inputs.producers.BARCODES={mode:'RETAINED',descriptor:await save('capture.json',JSON.stringify(manifest)),closureHelper:helper};
 f.inputs.closureScope.expectedCounts.import_source_row=3;f.inputs.closureScope.expectedCounts.barcodes=3;f.inputs.closureScope.expectedSourceEntityCounts.BARCODE=3;
 // Only the original continuation protocol is scripted; real BARCODE source
 // construction/range hashing/decoding and closure helper use actual temp files.
 f.inputs.warehouses=Array.from({length:53},(_,n)=>({targetType:'WAREHOUSE',targetId:id(1000+n),sourceEntityType:'WAREHOUSE',sourceKey:`SYNTHETIC_WH_${n}`,sourceRecordHash:digest('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(2000+n),reviewedAt:'2026-10-24T00:00:00Z',decisionReason:'SYNTHETIC_ONLY'}}));
 const checkpoint={sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
 const client={async query(text){const rows=text.includes('native-core:carry-forward')?f.inputs.warehouses.slice(0,22).map(w=>({checkpoint,import_batch_id:f.binding.batchId,import_record_id:w.nativeRecord.id,target_type:'WAREHOUSE',target_id:w.targetId,operation_id:f.binding.coreReceiptId,checkpoint_sequence:1,source_entity_type:'WAREHOUSE',source_key:w.sourceKey,source_record_hash:w.sourceRecordHash,source_file_ref:w.sourceFileRef,warehouse_record:w.nativeRecord})):[];return{rows,rowCount:rows.length};},release(){}};
 f.context.database.ready=()=>({pool:{async connect(){return client;}},runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'IMPORT_STAGE');}}});
 const fallback=f.authority.openRetained;f.authority.openRetained=async(...args)=>{assert.notEqual(args[0],'BARCODES','Pinned real barcode reader must not fall back to QA/retained authority factory');const resource=await fallback(...args);if(args[0]==='PARTIES')resource.chunks=async function*(){yield{rows:[]};};return resource;};
 f.authority.mainCommands=async function*(phase){assert.equal(phase,'BIND');yield{action:'IMPORT_BIND_FULL_SOURCE',batchId:f.binding.batchId,actorAccountId:f.binding.actorAccountId,fullBinding:{coreReceiptId:f.binding.coreReceiptId,coreSourceDigest:f.binding.coreSourceDigest,authorizedPayloadHash:f.binding.authorizedPayloadHash}};};
 return{...f,prepared,entries,manifest,dir,artifacts,writeFile,open:()=>createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context),project,nativeBarcodeSourceEvidence};
}
test('provider26 real BARCODE: temp-file rows authorize exact capture members and closure uses original helper rather than C144/authority pass-through',async t=>{
 const f=await retainedBarcodeFiles(t),s=await f.open();t.after(()=>s.close());await s.preflight();assert.equal(f.trace.opens.length,10);assert.equal(f.trace.opens.includes('BARCODES'),false);
 const staged=[];for await(const step of s.steps()){if(step.kind==='BARCODE'){staged.push(step.payload);if(staged.length===3)break;}}
 assert.deepEqual(staged,f.prepared);assert.equal(staged[1].nativeBarcode.barcode_kind,'CONFIRMED_OLD');assert.equal(Object.hasOwn(staged[1].source.rawFields,'绑定范围'),false);
 const ownSignal=new AbortController(),closure=await s.openSources.BARCODES(f.inputs.closureScope,{group:'BARCODES',signal:ownSignal.signal});
 const sources=await Array.fromAsync(closure.sourceRows()),typed=await Array.fromAsync(closure.typedRows());assert.equal(sources.length,3);assert.equal(typed.length,9);assert.equal(typed.filter(r=>r.relation==='barcode_scheme').length,6);assert.deepEqual(await Array.fromAsync(closure.documents()),[]);
 assert.deepEqual(sources.map(r=>r.key),f.entries.toSorted((a,b)=>Buffer.compare(Buffer.from(a.source.key),Buffer.from(b.source.key))).map(e=>e.source.key));
 const changed=structuredClone(f.prepared[0]);changed.nativeBarcodeId=id(999);await assert.rejects(s.authorizeStep({kind:'BARCODE',payload:changed}));
 const other=structuredClone(f.prepared[0]);other.source.id=id(999);await assert.rejects(s.authorizeStep({kind:'BARCODE',payload:other}),{code:'PRODUCTION_BARCODE26_MEMBERSHIP'});
 await s.close();await s.close();assert.equal(f.trace.authorityCloses,1);await assert.rejects(closure.verify());
});
test('provider26 real BARCODE: source grant and strict helper pin fail before real retained construction, never fall back',async t=>{
 const denied=await retainedBarcodeFiles(t);denied.setDeny('BARCODES');denied.inputs.producers.BARCODES.closureHelper.path='/MUST_NOT_OPEN';const s=await denied.open();await assert.rejects(s.preflight(),{code:'SYNTHETIC_MISSING_REAL_APPROVAL'});assert.equal(denied.trace.opens.length,0);
 const wrong=await retainedBarcodeFiles(t);wrong.inputs.producers.BARCODES.closureHelper.sha256=digest('f');const bad=await wrong.open();await assert.rejects(bad.preflight(),{code:'PRODUCTION_BARCODE26_HELPER_PIN'});assert.equal(wrong.trace.authorityCloses,1);assert.equal(wrong.trace.opens.includes('BARCODES'),false);
});
test('provider26 real BARCODE: original index range hash and whole metadata pins reject changed bytes or forged membership',async t=>{
 const wrongRange=await retainedBarcodeFiles(t,{mutateIndex:entries=>{entries[0].prepared.sha256=digest('f');}}),s=await wrongRange.open();t.after(()=>s.close());await s.preflight();
 const closure=await s.openSources.BARCODES(wrongRange.inputs.closureScope,{group:'BARCODES',signal:new AbortController().signal});await assert.rejects(Array.fromAsync(closure.sourceRows()),{code:'PRODUCTION_BARCODE26_RANGE_CHANGED'});
 const metadata=await retainedBarcodeFiles(t);await metadata.writeFile(metadata.artifacts.index.path,'{}\n');const bad=await metadata.open();await assert.rejects(bad.preflight(),{code:'PRODUCTION_BARCODE26_FILE_SIZE'});assert.equal(metadata.trace.authorityCloses,1);
 const mismatch=await retainedBarcodeFiles(t,{mutateManifest:m=>{m.binding.selectionSha256=digest('f');}}),other=await mismatch.open();await assert.rejects(other.preflight(),{code:'PRODUCTION_BARCODE26_CAPTURE_BINDING'});
});
test('provider26 real BARCODE: invalid count/order/scheme metadata rejects before any prepared range is consumed',async t=>{
 for(const mutatePermutation of [p=>p.source.reverse(),p=>{p.typed[0]=p.typed[1];},p=>{p.schemes.rows[0].native.name='SUBSTITUTED';}]){
  const f=await retainedBarcodeFiles(t,{mutatePermutation}),s=await f.open();await assert.rejects(s.preflight());assert.equal(f.trace.authorityCloses,1);
 }
 const count=await retainedBarcodeFiles(t);count.inputs.closureScope.expectedCounts.barcodes=4;const s=await count.open();await assert.rejects(s.preflight(),{code:'PRODUCTION_BARCODE26_CAPTURE_BINDING'});
});
test('provider26 real BARCODE: original owner close during constructor and closure cancellation close the retained source without escaped success',async t=>{
 const during=await retainedBarcodeFiles(t);let s;during.authority.verifyInputs=async()=>{during.trace.verified++;if(during.trace.verified===2)await s.close();};s=await during.open();await assert.rejects(s.preflight(),{code:'PRODUCTION_PROVIDER26_CLOSED'});await s.close();assert.equal(during.trace.authorityCloses,1);
 const f=await retainedBarcodeFiles(t),open=await f.open();t.after(()=>open.close());await open.preflight();const abort=new AbortController(),closure=await open.openSources.BARCODES(f.inputs.closureScope,{group:'BARCODES',signal:abort.signal});abort.abort();await assert.rejects(Array.fromAsync(closure.sourceRows()),{code:'PRODUCTION_BARCODE26_CLOSED'});await open.close();await open.close();assert.equal(f.trace.authorityCloses,1);
});
