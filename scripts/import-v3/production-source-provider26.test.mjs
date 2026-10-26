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
 const helper=await save('approved-helper.mjs',await readFile(helperPath));assert.equal(helper.sha256,'6f87f87f5acbeee6930924cc13073b54194d7301d113421ec381009334f65b22');
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

async function productionAuthorityFiles(t,options={}){
 const {mkdtemp,writeFile,readFile,realpath,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{fileURLToPath}=await import('node:url'),{createHash}=await import('node:crypto');
 const {historySettlementRequestHash:capture}=await import('../../packages/application/src/import-v3-history-settlement.ts');
 const {HISTORY_TYPED_CLOSURE_VERSION}=await import('../../packages/application/src/history-typed-closure.ts');
 const {openProductionSourceAuthority26}=await import('./production-source-provider26.mjs');
 const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-c-authority26-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const f=fixture(),sha=b=>createHash('sha256').update(b).digest('hex');
 if(options.binding){Object.assign(f.binding,options.binding);Object.assign(f.inputs.closureScope,Object.fromEntries(['batchId','fixedSourceNamespace','selectionSha256'].map(k=>[k,f.binding[k]])));}
 async function save(name,value){const bytes=Buffer.from(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?{__bigint:v.toString()}:v)),path=join(directory,name);await writeFile(path,bytes,{mode:0o600});return{path,bytes:bytes.length,sha256:sha(bytes)};}
 const members=Array.from({length:115},(_,n)=>({sourceRowId:id(3000+n),entity:n<49?'STAFF':n<71?'HALL':n<93?'WAREHOUSE':'CUSTOMER',sourceKey:`SYNTHETIC:${n}`,nativeId:id(4000+n)}));
 const maintenance={version:'CORE_MAINTENANCE_BINDING_V1',members:members.map(m=>({...m,version:1,nativeSnapshot:{id:m.nativeId,version:1},operations:[]}))};
 const warehouses=Array.from({length:53},(_,n)=>({targetType:'WAREHOUSE',targetId:id(7000+n),sourceEntityType:'WAREHOUSE',sourceKey:`SYNTHETIC_WH_${n}`,sourceRecordHash:digest('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(6000+n),reviewedAt:'2026-10-24T00:00:00Z',decisionReason:'SYNTHETIC_ONLY'}}));
 const projection={authorizedPayloadHash:f.binding.authorizedPayloadHash,coreMembers:members,staffProofs:members.slice(0,49).map(m=>({sourceRowId:m.sourceRowId,bootstrapAccounts:{origin:'MIGRATION_DERIVED',reason:'SYNTHETIC_SAFE_PROOF_NOT_REAL_FACT',evidence_ref:digest('a'),raw:{source_row_id:m.sourceRowId}}})),coreMaintenanceBinding:maintenance};
 const safeData={dataComplete:true,missing:[],publicationAuthorized:false,identity:Object.fromEntries(['batchId','actorAccountId','fixedSourceNamespace','selectionSha256','coreReceiptId','coreSourceDigest'].map(k=>[k,f.binding[k]])),target:{database:f.binding.target.database,role:f.binding.target.role},cutoffAt:f.binding.cutoffAt,checkpoint:{sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}},coreMembers:members,staffProofs:projection.staffProofs,coreMaintenanceBinding:maintenance,warehouses,originalCoreClaimRecordIds:warehouses.slice(0,22).map(w=>w.nativeRecord.id)};
 options.mutateProjection?.(safeData);const coreRef=await save('SAFE-CORE-DATA.json',safeData);f.inputs.core.coreProjection=coreRef;f.inputs.warehouses=coreRef;
 const bind={action:'IMPORT_BIND_FULL_SOURCE',actorAccountId:f.binding.actorAccountId,batchId:f.binding.batchId,requestKey:'SYNTHETIC_BIND',expectedSequence:1,expectedCursor:22,fullBinding:{authorizedPayloadHash:f.binding.authorizedPayloadHash,historyExpectedCounts:f.inputs.closureScope.expectedCounts,inventoryExpectedCounts:{WAREHOUSE:53,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:1},sourceClosurePins:sourceGroups.map(group=>({group,sha256:digest('a')})),coreReceiptId:f.binding.coreReceiptId,coreSourceDigest:f.binding.coreSourceDigest,coreMaintenanceBinding:maintenance}};
 const account={action:'IMPORT_CHUNK',actorAccountId:f.binding.actorAccountId,batchId:f.binding.batchId,requestKey:'SYNTHETIC_ACCOUNT',expectedSequence:2,expectedCursor:22,items:[...warehouses.slice(22),{targetType:'SKU',targetId:id(8000),sourceEntityType:'SKU',sourceKey:'SYNTHETIC_SKU',sourceRecordHash:digest('a'),sourceFileRef:'SYNTHETIC.xlsx'},{targetType:'INVENTORY_LEDGER',warehouseId:warehouses[0].targetId,skuId:id(8000),quantity:1n,businessDate:'2026-10-04',sourceEntityType:'INVENTORY_BASELINE',sourceKey:'SYNTHETIC_NONZERO_LEDGER',sourceRecordHash:digest('a'),sourceFileRef:'SYNTHETIC.xlsx'}]};
 const plan={version:HISTORY_TYPED_CLOSURE_VERSION,selectionSha256:f.binding.selectionSha256,authorizedPayloadHash:f.binding.authorizedPayloadHash,sourceManifestSha256:digest('a'),typedManifestSha256:digest('c'),documentManifestSha256:digest('d'),expectedCounts:f.inputs.closureScope.expectedCounts,sourceEntityCounts:f.inputs.closureScope.expectedSourceEntityCounts,documentCount:0};
 const publish={action:'IMPORT_PUBLISH',actorAccountId:f.binding.actorAccountId,batchId:f.binding.batchId,requestKey:'SYNTHETIC_PUBLISH',expectedSequence:3,expectedCursor:55,approval:{completeScope:true,absentMeansZero:true,allFilesVerified:true,finalDeltaVerified:true,noUnresolvedExceptions:true,sourceHash:f.binding.selectionSha256,sourceManifestRef:'SYNTHETIC_ORIGINAL_MANIFEST'},historyClosure:plan};
 options.mutateCommands?.({bind,account,publish});
 const mainCommands={BIND:await save('BIND.json',bind),ACCOUNT:[await save('ACCOUNT.json',account)],PUBLISH:await save('PUBLISH.json',publish)};
 const modulePath=fileURLToPath(new URL('./production-source-provider26.mjs',import.meta.url)),moduleBytes=await readFile(modulePath);f.inputs.authorityModule={path:modulePath,sha256:sha(moduleBytes)};
 options.mutateInputs?.(f.inputs);if(options.prepareInputs)await options.prepareInputs(f.inputs,{binding:f.binding,directory,save,writeFile,sha,readFile});
 const job={version:'NATIVE_IMPORT_SOURCE_HOST26_V1',registrationId:'SYNTHETIC_AUTHORITY_METADATA_ONLY',deadlineUtc:new Date(Date.now()+60000).toISOString(),maxSteps:100,binding:f.binding,
  database:{host:'127.0.0.1',port:5432,database:f.binding.target.database,user:f.binding.target.role,tls:'local-transport',caFile:null,statementTimeoutMs:1000},providers:{path:modulePath,sha256:sha(moduleBytes)},
  sources:{base:'/SYNTHETIC/base',v3Amendment:'/SYNTHETIC/v3',v3Approval:'/SYNTHETIC/approval.json',trustedApprovalSha256:digest('a'),approvedMoneyOverlaySha256:digest('a'),sourceRoot:'/SYNTHETIC/root',spoolParent:'/SYNTHETIC/spool',maxSpoolBytes:1,maxEvidenceSpoolBytes:1,referenceDecisionFile:'/SYNTHETIC/decisions.json',trustedReferenceDecisionSha256:digest('a'),mappingFiles:{synthetic:'/SYNTHETIC/map.json'},reviewFile:'/SYNTHETIC/product-review.json',trustedReviewSha256:digest('a')},runtime26Review:{reviewFile:'/SYNTHETIC/runtime-review.json',trustedReviewSha256:digest('a')}};
 options.mutateJob?.(job);const jobRef=await save('JOB.json',job);
 const grant={version:'C_PRODUCTION_SOURCE_EXECUTION26_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_REGISTERED_FULL_SOURCE_EXECUTION',issuingAuthority:'C',realImportExecutionAuthorized:true,job:jobRef,sourceInputDigest:capture(Object.fromEntries(['version','binding','core','closureScope','warehouses','producers'].map(k=>[k,f.inputs[k]]))),groups:[...sourceGroups],mainCommands};
 options.mutateGrant?.(grant);const grantRef=await save('C-EXECUTION-AUTHORIZATION.json',grant);f.inputs.executionAuthorization=grantRef;const inputRef=await save('INPUT.json',f.inputs);
 const progress={checkpoint:{sequence:1,cursor:22},warehouses:warehouses.slice(0,22),remainingWarehouses:warehouses.slice(22)};
 return{...f,bind,account,publish,plan,progress,grant,grantRef,inputRef,job,jobRef,coreRef,writeFile,save,capture,
  async open({externalPin=grantRef.sha256}={}){const old=process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256,oldJob=process.env.NAIJUE_IMPORT_JOB_FILE;
   try{if(externalPin===null)delete process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256;else process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256=externalPin;delete process.env.NAIJUE_IMPORT_JOB_FILE;
    return await openProductionSourceAuthority26({binding:f.binding,inputFile:inputRef.path,trustedInputSha256:inputRef.sha256,signal:f.controller.signal});
   }finally{if(old===undefined)delete process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256;else process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256=old;if(oldJob===undefined)delete process.env.NAIJUE_IMPORT_JOB_FILE;else process.env.NAIJUE_IMPORT_JOB_FILE=oldJob;}}
 };
}
test('provider26 production authority: independently pinned C job and exact MAIN files authorize original keys and private safe CORE projection without a database',async t=>{
 const f=await productionAuthorityFiles(t),a=await f.open();t.after(()=>a.close());assert.equal(Object.keys(a).length,14);assert.ok(Object.values(a).every(v=>typeof v==='function'));
 await a.verifyInputs({inputDigest:f.capture(f.inputs),binding:f.binding,core:f.inputs.core});await a.assertExecutionAllowed(f.binding);
 await a.assertGroupAllowed('BARCODES',f.inputs.producers.BARCODES,f.binding);
 for(const cmd of [f.bind,f.account,f.publish]){await a.assertAllowed(f.binding.actorAccountId,cmd);await a.authorizeNativeCommand(f.binding.actorAccountId,cmd);}
 for(const phase of ['BIND','ACCOUNT','PUBLISH'])assert.equal((await Array.fromAsync(a.mainCommands(phase,{binding:f.binding,core:f.inputs.core,progress:f.progress}))).length,1);
 const p=await a.coreProjection(f.inputs.core,f.binding);assert.equal(p.coreMembers.length,115);assert.equal(p.staffProofs.length,49);assert.equal(p.coreMaintenanceBinding.members.length,115);assert.equal(p.authorizedPayloadHash,f.binding.authorizedPayloadHash);await p.verify();
 const changed=structuredClone(f.account);changed.items.at(-1).quantity=2n;await assert.rejects(a.authorizeNativeCommand(f.binding.actorAccountId,changed),{code:'PRODUCTION_AUTHORITY26_MAIN_NOT_AUTHORIZED'});
 await assert.rejects(a.assertAllowed(id(999),f.bind),{code:'PRODUCTION_AUTHORITY26_MAIN_NOT_AUTHORIZED'});
 await a.authorizeStep({kind:'CLOSURE',payload:{plan:f.plan}},f.binding);const altered=structuredClone(f.plan);altered.typedManifestSha256=digest('f');await assert.rejects(a.authorizeStep({kind:'CLOSURE',payload:{plan:altered}},f.binding));
 await a.close();await a.close();await assert.rejects(a.assertExecutionAllowed(f.binding),{code:'PRODUCTION_AUTHORITY26_CLOSED'});
});
test('provider26 production authority: input checksum alone, self pin, wrong C scope and missing real facts never authorize',async t=>{
 const f=await productionAuthorityFiles(t);for(const externalPin of [null,digest('f'),f.inputRef.sha256])await assert.rejects(f.open({externalPin}),{code:'PRODUCTION_AUTHORITY26_C_EXECUTION_PIN_REQUIRED'});
 for(const options of [
  {mutateGrant:g=>{g.realImportExecutionAuthorized=false;}},{mutateGrant:g=>{g.groups.pop();}},{mutateGrant:g=>{g.sourceInputDigest=digest('f');}},
  {mutateInputs:i=>{i.core.coreProjection=null;}},{mutateInputs:i=>{i.binding.authorizedPayloadHash=null;}}
 ]){const bad=await productionAuthorityFiles(t,options);await assert.rejects(bad.open());}
});
test('provider26 production authority: command chain/count/nonzero ledger and safe projection integrity are genuine required facts',async t=>{
 for(const options of [
  {mutateCommands:x=>{x.account.expectedCursor++;}},{mutateCommands:x=>{x.account.items.pop();}},
  {mutateCommands:x=>{x.account.items.at(-1).quantity=0n;}},{mutateCommands:x=>{x.bind.fullBinding.inventoryExpectedCounts.INVENTORY_LEDGER=0;}},
  {mutateProjection:p=>{p.coreMembers.pop();}},{mutateProjection:p=>{p.staffProofs[0].bootstrapAccounts.raw.password='SYNTHETIC_FORBIDDEN_FIELD';}}
 ]){const bad=await productionAuthorityFiles(t,options);await assert.rejects(bad.open());}
 const f=await productionAuthorityFiles(t),a=await f.open();t.after(()=>a.close());const progress=structuredClone(f.progress);progress.checkpoint.sequence++;
 await assert.rejects(Array.fromAsync(a.mainCommands('BIND',{binding:f.binding,core:f.inputs.core,progress})),{code:'PRODUCTION_AUTHORITY26_CURRENT_CHECKPOINT'});
});
test('provider26 production authority: expiry, metadata replacement, altered recipe, abort and close reject rather than becoming empty grants',async t=>{
 const f=await productionAuthorityFiles(t),a=await f.open();t.after(()=>a.close());
 const recipe=structuredClone(f.inputs.producers.SKU??f.inputs.producers.SKUS);recipe.changed=true;await assert.rejects(a.assertGroupAllowed('SKUS',recipe,f.binding),{code:'PRODUCTION_AUTHORITY26_GROUP_SCOPE'});
 await f.writeFile(f.grantRef.path,'{}');await assert.rejects(a.assertExecutionAllowed(f.binding),{code:'PRODUCTION_AUTHORITY26_METADATA_CHANGED'});
 const expired=await productionAuthorityFiles(t,{mutateJob:j=>{j.deadlineUtc='2000-01-01T00:00:00.000Z';}});await assert.rejects(expired.open());
 const current=await productionAuthorityFiles(t),other=await current.open();t.after(()=>other.close());const realNow=Date.now;Date.now=()=>Date.parse(current.job.deadlineUtc)+1;
 try{await assert.rejects(other.assertExecutionAllowed(current.binding),{code:'PRODUCTION_AUTHORITY26_CLOSED'});}finally{Date.now=realNow;}
 const cancelled=await productionAuthorityFiles(t),c=await cancelled.open();t.after(()=>c.close());cancelled.controller.abort();await assert.rejects(c.assertExecutionAllowed(cancelled.binding),{code:'PRODUCTION_AUTHORITY26_CLOSED'});
});
test('provider26 production authority: original C144 transport/options/child closure really read temp files while native resolver waits for original database activation',async t=>{
 const {syntheticSalesDetailChunk}=await import('../../tests/support/synthetic-sales-detail-fixtures.ts'),{stableImportId}=await import('../../packages/application/src/inventory-cutoff-import.ts');
 const {prepareHistorySalesDetailChunk,HISTORY_SALES_DETAIL_VERSION}=await import('../../packages/application/src/import-v3-history-sales-detail.ts');
 const {historyClosureProjectionRow26:project}=await import('../../packages/application/src/history-typed-closure.ts'),{v2MoneyApprovalSet}=await import('../../packages/application/src/import-v2.ts');
 const {join}=await import('node:path');let expectedPrepared;
 const f=await productionAuthorityFiles(t,{async prepareInputs(inputs,{binding,directory,save,writeFile,sha,readFile}){
  const input=syntheticSalesDetailChunk(),source=input.rows[0].source;input.batchId=source.batchId=binding.batchId;input.fixedSourceNamespace=binding.fixedSourceNamespace;source.id=stableImportId('source-row',input.fixedSourceNamespace,'SALES_LINE',source.sourceKey);source.rawFields.原成交单价='0.03000000000000001';
  const approvals=[...input.moneyApprovals.values()];approvals[0]={fileSha256:source.sourceFileSha256,sheet:source.sheet,row:source.rowNo,sourceId:source.sourceKey,field:'原成交单价',rawValue:source.rawFields.原成交单价,exactCentValue:source.normalizedFields.原成交单价};input.moneyApprovals=v2MoneyApprovalSet(approvals,approvals);
  async function rawFile(name,bytes){const path=join(directory,name);await writeFile(path,bytes,{mode:0o600});return{path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};}
  const columns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
  const csv=[columns.join(','),...approvals.map(a=>{const row={file:'SYNTHETIC.xlsx',sheet:a.sheet,row:a.row,sourceId:a.sourceId,entity:'SALES_LINE',documentSourceId:'SYNTHETIC-SALES-1',field:a.field,rawValue:a.rawValue,candidateExactCentValue:a.exactCentValue,sourceFileSha256:a.fileSha256};return columns.map(k=>row[k]??'').join(',');})].join('\n')+'\n';
  const moneyRef=await rawFile('APPROVED-SYNTHETIC-MONEY.csv',Buffer.from(csv));input.selection.moneyApprovalSha256=moneyRef.sha256;
  source.fieldProvenance={schema_version:1,fields:Object.fromEntries(Object.entries(source.rawFields).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:v}]))};source.fieldProvenance.fields.SKU来源编号={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:source.rawFields.SKU来源编号,evidence_ref:'mappings/old-to-canonical-sku-15121.csv'};source.fieldProvenance.fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:source.rowSha256};
  expectedPrepared=prepareHistorySalesDetailChunk(input);const row=expectedPrepared.rows[0],sourceRow=project('import_source_row',{id:source.id,batch_id:source.batchId,entity_type:source.entityType,source_key:source.sourceKey,file_ref:source.fileRef,sheet:source.sheet,row_no:source.rowNo,source_file_sha256:source.sourceFileSha256,row_sha256:source.rowSha256,raw_fields:source.rawFields,normalized_fields:source.normalizedFields,field_provenance:{...row.fieldProvenance,history_sales_detail_staging:{validator_version:HISTORY_SALES_DETAIL_VERSION,fingerprint:row.fingerprint,selection:input.selection,header:row.header,sku:row.sku}}});
  const sourceRef={...await rawFile('C144-source.jsonl',Buffer.from(JSON.stringify(sourceRow)+'\n')),rows:1,mode:'0600',entity:'SALES_LINE',actualColumns:12};
  const typedRef={...await rawFile('C144-typed.jsonl',Buffer.from(JSON.stringify(project('history_sales_line',row.line))+'\n')),rows:1,mode:'0600',entity:'SALES_LINE',actualColumns:21};
  const manifest={status:'ACTUAL_SOURCE_TYPED_PROJECTIONS_COMPLETED_REFERENCE_ONLY',referenceOnly:true,nativeBindingsVerified:false,PG:false,MAIN:false,PUBLISH:false,all11:false,actualPayloadHash:null,sourceRows:1,typedRows:1,artifacts:[sourceRef,typedRef]};
  const helperRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D3';
  async function helper(name){const path=join(helperRoot,name),bytes=await readFile(path);return{path,bytes:bytes.length,sha256:sha(bytes)};}
  inputs.producers.SALES_DETAILS={mode:'CAPTURED_C144',descriptor:{synthetic:'C144'},sourceRoot:'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022',entity:'SALES_LINE',chunkRows:1,manifestRef:await save('C144-MANIFEST.json',manifest),source:sourceRef,typed:typedRef,moneyRef,trustedApprovalSha256:input.selection.approvalSha256,supportModules:{transport:await helper('retained-sales-settlement-consumer-20261025.mjs'),options:await helper('prepare-retained-sales-options-20261026.mjs'),closure:await helper('sales-header-closure-session-20261026.mjs')}};
 }});
 const a=await f.open();t.after(()=>a.close());let ready=0;const options=await a.capturedOptions('SALES_DETAILS',f.inputs.producers.SALES_DETAILS,{binding:f.binding,signal:f.controller.signal,database:{ready(){ready++;throw Error('SYNTHETIC_ORIGINAL_DATABASE_NOT_ACTIVATED');}}});assert.equal(ready,0);
 const {openAuthorizedSalesDetailReader}=await import('../import-v2/authorized-sales-detail-reader.mjs');const reader=await openAuthorizedSalesDetailReader(options);t.after(()=>reader.close());const rows=await Array.fromAsync(reader.rows());assert.equal(rows.length,1);assert.equal(ready,0);
 await assert.rejects(reader.authorize(expectedPrepared),/SYNTHETIC_ORIGINAL_DATABASE_NOT_ACTIVATED/);assert.equal(ready,1);
 const child=await a.openRetainedClosure('SALES_DETAILS',f.inputs.producers.SALES_DETAILS,f.inputs.closureScope,{group:'SALES_DETAILS',signal:new AbortController().signal});
 assert.equal((await Array.fromAsync(child.sourceRows())).length,1);const typed=await Array.fromAsync(child.typedRows());assert.equal(typed.length,1);assert.equal(typed[0].projection.quantity,'-2');assert.deepEqual(await Array.fromAsync(child.documents()),[]);
 await child.close();await reader.close();await a.close();await a.close();
});
test('provider26 production authority: explicit original genuine product reader and evidence authorizer are composed, a retained path cannot stand in for a source',async t=>{
 const {fixture:productFixture}=await import('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D3/retained-native-closure-fixtures-20261026/product.mjs');
 const {prepareProductEvidenceChunk}=await import('../../packages/application/src/product-evidence-staging.ts');
 const product=await productFixture(t),f=await productionAuthorityFiles(t,{binding:product.options.binding,mutateInputs:inputs=>{
  inputs.producers.PRODUCTS.options=product.options;inputs.producers.PRODUCTS.productEvidenceSource={...product.options.source,binding:product.options.binding};
 }}),a=await f.open();t.after(()=>a.close());
 const reader=await a.openRetained('PRODUCTS',f.inputs.producers.PRODUCTS,{binding:f.binding,signal:f.controller.signal});const chunks=await Array.fromAsync(reader.chunks());assert.equal(chunks.length,1);await reader.authorize(chunks[0]);
 const evidence=prepareProductEvidenceChunk({batchId:product.input.batchId,fixedSourceNamespace:product.input.fixedSourceNamespace,selection:product.input.selection,rows:product.input.rows.map(({source,product,blankPricePolicy})=>({source,product,blankPricePolicy}))});
 await a.authorizeProductSource(evidence);const forged=structuredClone(evidence);forged.rows[0].source.sourceKey='SUBSTITUTED';await assert.rejects(a.authorizeProductSource(forged));
 await assert.rejects(a.openRetained('HEADERS',f.inputs.producers.HEADERS,{binding:f.binding,signal:f.controller.signal}),{code:'PRODUCTION_AUTHORITY26_RETAINED_READER_INPUT_REQUIRED'});
 await reader.close();await a.close();await a.close();await assert.rejects(reader.verify());
});

const retainedFixtureRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D3';
async function retainedNativeFiles(t,group){
 const {pathToFileURL}=await import('node:url'),{mkdtemp,realpath,readFile,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const module={PRODUCTS:'product',SKUS:'sku',STOCK_CONTRIBUTORS:'stock'}[group],data=await(await import(pathToFileURL(retainedFixtureRoot+'/retained-native-closure-fixtures-20261026/'+module+'.mjs'))).fixture(t);
 const prepared=group==='STOCK_CONTRIBUTORS'?data.groups[0]:data.prepared,f=fixture();Object.assign(f.binding,data.options.binding);Object.assign(f.inputs.closureScope,Object.fromEntries(['batchId','fixedSourceNamespace','selectionSha256'].map(k=>[k,f.binding[k]])));
 const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-real-retained-native-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const sha=b=>createHash('sha256').update(b).digest('hex'),save=async(name,bytes)=>{const path=join(directory,name);await writeFile(path,bytes,{mode:0o600});return{path,bytes:bytes.length,sha256:sha(bytes)};};
 const original={...await import('../../packages/application/src/native-product-import.ts'),...await import('../../packages/application/src/native-sku-import.ts'),...await import('../../packages/application/src/native-stock-contributor-import.ts'),...await import('../../packages/application/src/history-typed-closure.ts')};
 const helper=await import(pathToFileURL(retainedFixtureRoot+'/retained-native-closure-streams-20261026.mjs')),expected=helper.projectRetainedNativeClosureRecord26(original,group,prepared);
 const body=Buffer.from(JSON.stringify(prepared)+(group==='PRODUCTS'?'':'\n'));
 const file=await save('prepared'+(group==='PRODUCTS'?'.json':'.jsonl'),body),closureHelper=await save('helper.mjs',await readFile(retainedFixtureRoot+'/retained-native-closure-streams-20261026.mjs'));
 f.inputs.producers[group]={mode:'RETAINED',retainedNative:{files:[file],records:1,sourceRows:expected.sources.length,typedRows:expected.typed.length},closureHelper};
 f.inputs.closureScope.expectedSourceEntityCounts[group==='PRODUCTS'?'PRODUCT':group==='SKUS'?'SKU':'INVENTORY_BASELINE']=expected.sources.length;
 f.inputs.closureScope.expectedCounts.import_source_row=expected.sources.length;
 if(group==='SKUS')f.inputs.closureScope.expectedCounts.import_sku_alias=expected.sources.length;
 if(group==='STOCK_CONTRIBUTORS')f.inputs.closureScope.expectedCounts.import_stock_contributor=expected.typed.length;
 const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);t.after(()=>s.close());
 return{...f,s,prepared,expected,writeFile,file,sha,body};
}
for(const group of ['PRODUCTS','SKUS','STOCK_CONTRIBUTORS'])test('source620 retained real '+group+': original file membership, sorted full closure and mutation refusal without database',async t=>{
 const f=await retainedNativeFiles(t,group);await f.s.preflight();assert.equal(f.trace.ready,0);assert.ok(!f.trace.opens.includes(group));
 await f.s.authorizeStep({kind:{PRODUCTS:'PRODUCT',SKUS:'SKU',STOCK_CONTRIBUTORS:'STOCK_CONTRIBUTOR'}[group],payload:f.prepared});
 const changed=structuredClone(f.prepared);changed.fingerprint=digest('f');await assert.rejects(f.s.authorizeStep({kind:{PRODUCTS:'PRODUCT',SKUS:'SKU',STOCK_CONTRIBUTORS:'STOCK_CONTRIBUTOR'}[group],payload:changed}),/MEMBERSHIP/);
 const closure=await f.s.openSources[group](f.inputs.closureScope,{group,signal:f.controller.signal}),ordered=rows=>rows.toSorted((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
 assert.deepEqual(await Array.fromAsync(closure.sourceRows()),ordered(f.expected.sources));assert.deepEqual(await Array.fromAsync(closure.typedRows()),ordered(f.expected.typed));assert.deepEqual(await Array.fromAsync(closure.documents()),[]);
 await closure.close();await f.s.close();assert.equal(f.trace.ready,0);assert.equal(f.trace.authorityCloses,1);
});
test('source620 retained real prepared file changed after preflight refuses before closure yields',async t=>{
 const f=await retainedNativeFiles(t,'SKUS');await f.s.preflight();const changed=Buffer.from(f.body);changed[changed.indexOf(34)+1]^=1;await f.writeFile(f.file.path,changed);
 await assert.rejects(f.s.openSources.SKUS(f.inputs.closureScope,{group:'SKUS',signal:f.controller.signal}));assert.equal(f.trace.ready,0);
});
test('T04 canonical stock MAIN proof: exact signed group required before ACCOUNT; wrong warehouse, SKU, quantity and missing group refuse',async t=>{
 const {pathToFileURL}=await import('node:url'),data=await(await import(pathToFileURL(retainedFixtureRoot+'/retained-native-closure-fixtures-20261026/stock.mjs'))).fixture(t),group=data.groups[0];
 const f=await productionAuthorityFiles(t,{binding:data.options.binding,mutateCommands:({account,bind,publish})=>{
  for(const counts of [bind.fullBinding.historyExpectedCounts,publish.historyClosure.expectedCounts]){counts.import_source_row=group.contributors.length;counts.import_stock_contributor=group.contributors.length;}publish.historyClosure.sourceEntityCounts.INVENTORY_BASELINE=group.contributors.length;
  Object.assign(account.items.at(-1),{warehouseId:group.warehouse.nativeId,skuId:group.sku.nativeId,quantity:BigInt(group.signedQuantity),sourceKey:group.canonicalStock['来源编号']});
 },mutateInputs:inputs=>{inputs.closureScope.expectedSourceEntityCounts.INVENTORY_BASELINE=group.contributors.length;inputs.closureScope.expectedCounts.import_source_row=group.contributors.length;inputs.closureScope.expectedCounts.import_stock_contributor=group.contributors.length;}});
 const a=await f.open();t.after(()=>a.close());await assert.rejects(a.authorizeNativeCommand(f.binding.actorAccountId,f.account),/STOCK_MAIN_INCOMPLETE/);
 const {prepareNativeStockGroup}=await import('../../packages/application/src/native-stock-contributor-import.ts');
 for(const field of ['warehouse','sku']){const changed=structuredClone(data.groupInput);changed[field].nativeId=id(9999);await assert.rejects(a.authorizeStep({kind:'STOCK_CONTRIBUTOR',payload:prepareNativeStockGroup(changed)},f.binding),/STOCK_MAIN_MISMATCH/);}
 const changed=structuredClone(data.groupInput);changed.canonicalStock['来源编号']='OTHER';for(const c of changed.contributors)c.lineage.canonicalStockRowSourceId='OTHER';await assert.rejects(a.authorizeStep({kind:'STOCK_CONTRIBUTOR',payload:prepareNativeStockGroup(changed)},f.binding),/STOCK_MAIN_MISMATCH/);
 await a.authorizeStep({kind:'STOCK_CONTRIBUTOR',payload:group},f.binding);await a.authorizeNativeCommand(f.binding.actorAccountId,f.account);
 const wrong=await productionAuthorityFiles(t,{binding:data.options.binding,mutateCommands:({account})=>{Object.assign(account.items.at(-1),{warehouseId:group.warehouse.nativeId,skuId:group.sku.nativeId,quantity:1n,sourceKey:group.canonicalStock['来源编号']});}}),b=await wrong.open();t.after(()=>b.close());await assert.rejects(b.authorizeStep({kind:'STOCK_CONTRIBUTOR',payload:group},wrong.binding),/STOCK_MAIN_MISMATCH/);
});

const H=digest('a');
const {IMPORT_V2_TABLES}=await import('../../packages/application/src/import-v2-contract.ts');
const {v2MoneyApprovalSet}=await import('../../packages/application/src/import-v2.ts');
const {createNativeHeader26BindingPreparer}=await import('./prepare-native-header26-bindings.mjs');
function retainedHeaderFixture(){
 const binding={batchId:id(1),fixedSourceNamespace:'synthetic-known',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:H};
 const parties=[{entity:'HALL',sourceKey:'H1',nativeSnapshot:{id:id(10),name:'Synthetic Hall',version:1,default_customer_id:null,default_sales_warehouse_id:null,enabled:true}},
 {entity:'WAREHOUSE',sourceKey:'W1',nativeSnapshot:{id:id(20),name:'Synthetic Warehouse',version:1,hall_id:id(10),enabled:true,created_operation_id:null}},
 {entity:'CUSTOMER',sourceKey:'C1',nativeSnapshot:{id:id(30),name:'Synthetic Customer',version:1,code:'0001',enabled:true,created_at:null,updated_at:null}}];
 const historicalCustomers=[{sourceKey:'HIST-CUSTOMER:'+id(60),originalPartyIdentity:id(60),sourceDocumentNumber:'INV-2',nativeSnapshot:{id:id(50),name:'Synthetic Historic',version:1,code:'0002',enabled:false,created_at:null,updated_at:null}}];
 const moneyApprovals=Array.from({length:32},(_,i)=>({fileSha256:H,sheet:'HEADER',row:String(i+20),sourceId:'MONEY'+i,field:'优惠前金额',rawValue:'1.00000000000001',exactCentValue:'1.00'}));
 function record(i,hall,customer='C1'){
  const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='SALES_HEADER').columns.map(c=>[c.name,'']));
  Object.assign(n,{来源编号:'DOC-'+i,原单号:'INV-'+i,业务日期:'2024-02-29',原审核状态:'未审核',创建厅归属来源:'UNKNOWN',创建厅归属原因:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED',单据类型:'销售',所属厅来源编号:hall,客户来源编号:customer,仓库来源编号:'W1',优惠前金额:'10.00',整单优惠:'1',应结金额:'8.50'});
  const raw={...n,原创建厅编号:'UPLOADED_HALL'};delete raw.创建厅归属来源;delete raw.创建厅归属原因;
  return{source:{id:id(100+i),batchId:binding.batchId,entityType:'SALES_HEADER',sourceKey:n.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'HEADER',rowNo:String(i+2),sourceFileSha256:H,rowSha256:H,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:{}}},selection:{entity:'SALES_HEADER',source:'BASE_V2',path:'business/13历史销货单头.csv',baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H},creatorHallOverlay:{evidenceRef:'synthetic.csv#'+i,file:'SYNTHETIC.xlsx',sheet:'HEADER',row:String(i+2),sourceId:n.来源编号,documentNumber:n.原单号,personField:'营业员来源编号',personId:'',uploadedWarehouseDerivedHall:'UPLOADED_HALL',candidateCreatorHall:'',provenance:'UNKNOWN',reason:n.创建厅归属原因},temporalEvidence:{}};
 }
 return{context:{binding,parties,historicalCustomers,moneyApprovals},record};
}

function retainedHeaderOverlay(f,r){const s=r.source;return{version:'USER_CONFIRMED_HISTORY_BUSINESS_HALL_OVERLAY_1',batchId:s.batchId,fixedSourceNamespace:f.context.binding.fixedSourceNamespace,selectionSha256:H,sourceKey:s.sourceKey,warehouseSourceKey:'W1',targetHallSourceKey:'H1',targetHallNativeId:id(10),sourceFileRef:s.fileRef,sourceFileSha256:s.sourceFileSha256,sheet:s.sheet,rowNo:s.rowNo,originalBusinessHall:'',provenance:'MIGRATION_DERIVED',reason:'USER_CONFIRMED_WAREHOUSE_TO_BUSINESS_HALL',decisionSource:{threadId:'synthetic-human',humanMessageId:'synthetic-decision',continueMessageId:'synthetic-continue',adoptionOwner:'C',scope:'ALL2471_WAREHOUSE_TO_BUSINESS_HALL_MAPPING_USER_CONFIRMED',originalBlankNotClaimedHistoricalFact:true},evidenceRef:'USER_DECISION:synthetic-human:synthetic-decision#'+s.sourceKey};}

function retainedHeaderInputs(){const f=retainedHeaderFixture(),a=f.record(1,'H1'),b=f.record(2,''),o=retainedHeaderOverlay(f,b),pa=createNativeHeader26BindingPreparer({...f.context,expected:{SALES_HEADER:1,TRANSFER_HEADER:0,historicalReferences:0}}),known=pa.prepare(a);pa.finish();const pb=createNativeHeader26BindingPreparer({...f.context,businessHallOverlays:new Map([[b.source.sourceKey,o]]),expected:{SALES_HEADER:1,TRANSFER_HEADER:0,historicalReferences:0}}),mapped=pb.prepare(b);pb.finish();const{moneyApprovals,...saved}=mapped.input;void moneyApprovals;
 return{binding:f.context.binding,moneyApprovals:v2MoneyApprovalSet(f.context.moneyApprovals,f.context.moneyApprovals),items:[{partition:'KNOWN25811',value:{record:a,prepared:known.prepared,decision:known.decision}},{partition:'MAPPED2471',value:{originalRecord:b,input:saved,prepared:mapped.prepared,decision:mapped.decision}}]};}

async function retainedHeaderFiles(t,options={}){
 const {pathToFileURL}=await import('node:url'),{mkdtemp,realpath,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const {prepareV3HistoryHeaderChunk}=await import('../../packages/application/src/import-v3-history-header-staging.ts'),{transferHeaderProjection26}=await import('./native-transfer-header-source26.mjs');
 const codec=await import('../../packages/application/src/history-typed-closure.ts'),helper=await import(pathToFileURL(retainedFixtureRoot+'/sales-header-closure-session-20261026.mjs')),input=retainedHeaderInputs();
 const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-real-retained-header-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const sha=b=>createHash('sha256').update(b).digest('hex'),save=async(name,b)=>{const path=join(directory,name),bytes=Buffer.isBuffer(b)?b:Buffer.from(b);await writeFile(path,bytes,{mode:0o600});return{path,bytes:bytes.length,sha256:sha(bytes)};};
 const partitions={},entries=[],salesExpected=[];
 for(const item of input.items){const bytes=Buffer.from(JSON.stringify(item.value)+'\n');partitions[item.partition]={...await save(item.partition+'.jsonl',bytes),rows:1};const p=item.value.prepared;
  const projection=(await import(pathToFileURL(retainedFixtureRoot+'/prepare-retained-sales-header-window-20261026.mjs'))).salesHeaderProjection26(codec.historyClosureProjectionRow26,p);salesExpected.push(projection);
  entries.push(helper.captureSalesHeaderClosureEntry(codec,{partition:item.partition,offset:0,bytes:bytes.length,projection,fingerprint:p.fingerprint}));}
 const salesIndex={version:'RETAINED_SALES_HEADER_CLOSURE_INDEX_V1',binding:input.binding,partitions,rows:2,entries};options.mutateIndex?.(salesIndex);
 const table=IMPORT_V2_TABLES.find(t=>t.entity==='TRANSFER_HEADER'),n=Object.fromEntries(table.columns.map(c=>[c.name,'']));Object.assign(n,{来源编号:'SYN-TRANSFER',原单号:'0000123',业务日期:'2024-02-29',原审核状态:'已审核',调出仓来源编号:'W1',调入仓来源编号:'W2',创建厅归属来源:'UNKNOWN',创建厅归属原因:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'});
 const raw={...n,原创建厅编号:'UPLOADED'};delete raw.创建厅归属来源;delete raw.创建厅归属原因;
 const fields=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value}]));fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:H};
 const source={id:id(700),batchId:input.binding.batchId,entityType:'TRANSFER_HEADER',sourceKey:n.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'HEADER',rowNo:'30',sourceFileSha256:H,rowSha256:H,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields,history_cell_encoding_evidence:{temporalEvidence:{}}}};
 const transferInput={...input.binding,source,selection:{entity:'TRANSFER_HEADER',source:'BASE_V2',path:table.file,baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H},creatorHallOverlay:{evidenceRef:'SYNTHETIC#30',file:source.fileRef,sheet:source.sheet,row:source.rowNo,sourceId:source.sourceKey,documentNumber:n.原单号,personField:'原制单账号编号',personId:'',uploadedWarehouseDerivedHall:'UPLOADED',candidateCreatorHall:'',provenance:'UNKNOWN',reason:n.创建厅归属原因},temporalEvidence:{},bindings:{调出仓来源编号:{sourceKey:'W1',nativeId:id(20)},调入仓来源编号:{sourceKey:'W2',nativeId:id(21)}}};delete transferInput.cutoffAt;delete transferInput.selectionSha256;
 const transferChunk=prepareV3HistoryHeaderChunk([transferInput]),projection=transferHeaderProjection26(transferChunk.rows[0].prepared),transfer={rows:1};let entry={headerId:projection.document.headerId,headerSourceRowId:source.id,sourceKey:source.sourceKey};
 for(const [role,value]of Object.entries({source:projection.sourceRow,typed:projection.typedRow,document:projection.document})){const b=Buffer.from(JSON.stringify(value)+'\n');transfer[role]=await save(role+'.jsonl',b);entry[role]={offset:0,bytes:b.length,sha256:sha(b)};}
 transfer.index=await save('transfer-index.jsonl',JSON.stringify(entry)+'\n');
 const helpers=Object.fromEntries(await Promise.all([['closure','sales-header-closure-session-20261026.mjs'],['salesWindow','prepare-retained-sales-header-window-20261026.mjs'],['transferWindow','prepare-retained-transfer-header-window-20261025-v2.mjs']].map(async([role,name])=>{const path=retainedFixtureRoot+'/'+name,b=await readFile(path);return[role,{path,bytes:b.length,sha256:sha(b)}];})));
 const f=fixture();Object.assign(f.binding,input.binding);Object.assign(f.inputs.closureScope,Object.fromEntries(['batchId','fixedSourceNamespace','selectionSha256'].map(k=>[k,f.binding[k]])));
 Object.assign(f.inputs.closureScope.expectedCounts,{import_source_row:3,history_sales_header:2,history_transfer_header:1});Object.assign(f.inputs.closureScope.expectedSourceEntityCounts,{SALES_HEADER:2,TRANSFER_HEADER:1});
 f.inputs.producers.HEADERS={mode:'RETAINED',retainedHeaders:{sales:{rows:2,index:await save('sales-index.json',JSON.stringify(salesIndex)),partitions,money:{path:'/SYNTHETIC_NOT_NEEDED_FOR_CLOSURE',bytes:1,sha256:H}},transfer,helpers}};
 const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);t.after(()=>s.close());return{...f,s,expected:[...salesExpected,projection],writeFile};
}
test('source620 retained HEADERS: complete original sales index and transfer ranges compose globally ordered real file streams and allocations without DB',async t=>{
 const f=await retainedHeaderFiles(t);await f.s.preflight();assert.equal(f.trace.ready,0);assert.ok(!f.trace.opens.includes('HEADERS'));
 const c=await f.s.openSources.HEADERS(f.inputs.closureScope,{group:'HEADERS',signal:f.controller.signal}),ordered=rows=>rows.toSorted((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
 assert.deepEqual(await Array.fromAsync(c.sourceRows()),ordered(f.expected.map(p=>p.sourceRow)));assert.deepEqual(await Array.fromAsync(c.typedRows()),ordered(f.expected.map(p=>p.typedRow)));assert.deepEqual((await Array.fromAsync(c.documents())).sort((a,b)=>a.headerId.localeCompare(b.headerId)),f.expected.map(p=>p.document).sort((a,b)=>a.headerId.localeCompare(b.headerId)));await f.s.close();assert.equal(f.trace.ready,0);
});
test('source620 retained HEADERS: partial sales index refuses and changed captured canonical row cannot yield',async t=>{
 const f=await retainedHeaderFiles(t,{mutateIndex:index=>{index.entries.pop();}});await assert.rejects(f.s.preflight());assert.equal(f.trace.ready,0);
 const g=await retainedHeaderFiles(t);await g.s.preflight();await g.writeFile(g.inputs.producers.HEADERS.retainedHeaders.sales.partitions.KNOWN25811.path,'CHANGED');const c=await g.s.openSources.HEADERS(g.inputs.closureScope,{group:'HEADERS',signal:g.controller.signal}).catch(()=>null);if(c)await assert.rejects(Array.fromAsync(c.sourceRows()));assert.equal(g.trace.ready,0);
});
async function retainedTransferFiles(t,options={}){
 const {mkdtemp,realpath,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const {prepareV3HistoryChunk}=await import('../../packages/application/src/import-v3-history-staging.ts'),{transferLineSourceEvidence26}=await import('./native-transfer-line-source26.mjs'),{historyClosureProjectionRow26:project}=await import('../../packages/application/src/history-typed-closure.ts');
 const f=fixture(),directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-real-retained-transfer-'));t.after(()=>rm(directory,{recursive:true,force:true}));const sha=b=>createHash('sha256').update(b).digest('hex'),save=async(name,b)=>{const path=join(directory,name);await writeFile(path,b,{mode:0o600});return{path,bytes:b.length,sha256:sha(b)};};
 const selection={entity:'TRANSFER_LINE',source:'BASE_V2',path:'business/17历史调拨明细.csv',baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H};
 const chunks=[1,2].map(i=>{const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='TRANSFER_LINE').columns.map(c=>[c.name,'']));Object.assign(n,{来源编号:'LINE'+i,单据来源编号:'TRANSFER'+i,SKU来源编号:'SKU1',原行号:'1',原数量:i===1?'-2':'3'});
  const source={id:id(900-i),batchId:f.binding.batchId,entityType:'TRANSFER_LINE',sourceKey:n.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'LINE',rowNo:String(i),sourceFileSha256:H,rowSha256:H,rawFields:{...n},normalizedFields:n,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(n).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC',raw:v}]))}};
  return prepareV3HistoryChunk({batchId:f.binding.batchId,fixedSourceNamespace:f.binding.fixedSourceNamespace,selection,rows:[{source,header:{sourceKey:n.单据来源编号,nativeId:id(600+i)},sku:{sourceKey:'SKU1',nativeId:id(500)}}]});});
 const pairs=chunks.map(c=>({source:project('import_source_row',transferLineSourceEvidence26(c.rows[0],selection)),typed:project('history_transfer_line',c.rows[0].line)})),n=pairs.length,index=Buffer.alloc(64+n*256+n*4*2+n*36),buffers={source:[],typed:[]};
 index.write('TL26JOIN1');for(const[at,v]of[[12,1],[16,n],[20,n],[24,256],[28,n*256],[32,n*4],[36,n*4],[40,n*36],[44,64]])index.writeUInt32LE(v,at);
 for(let i=0;i<n;i++){const at=64+i*256;index.writeUInt32LE(i,at);for(const[role,keyAt,lengthAt,offsetAt,bytesAt,shaAt]of[['source',64,60,4,12,192],['typed',128,61,16,24,224]]){const b=Buffer.from(JSON.stringify(pairs[i][role])+'\n'),key=Buffer.from(pairs[i][role].key),offset=buffers[role].reduce((sum,x)=>sum+x.length,0);index.writeBigUInt64LE(BigInt(offset),at+offsetAt);index.writeUInt32LE(b.length,at+bytesAt);index[at+lengthAt]=key.length;key.copy(index,at+keyAt);Buffer.from(sha(b),'hex').copy(index,at+shaAt);buffers[role].push(b);}}
 options.mutateIndex?.(index);const spec={rows:n,index:await save('index.bin',index),source:await save('source.jsonl',Buffer.concat(buffers.source)),typed:await save('typed.jsonl',Buffer.concat(buffers.typed))};
 f.inputs.producers.TRANSFER_LINES={mode:'RETAINED',retainedTransferLines:spec};Object.assign(f.inputs.closureScope.expectedCounts,{import_source_row:n,history_transfer_line:n});f.inputs.closureScope.expectedSourceEntityCounts.TRANSFER_LINE=n;
 const s=await createProductionSourceProvider26(f.inputs,f.authority).openSourceSession(f.context);t.after(()=>s.close());return{...f,s,chunks,pairs,writeFile};
}
test('source620 retained TRANSFER_LINES: packed original file ranges authorize exact DTOs, preserve negative units, and yield global source12/typed13 order',async t=>{
 const f=await retainedTransferFiles(t);await f.s.preflight();for(const chunk of f.chunks)await f.s.authorizeStep({kind:'TRANSFER_LINES',payload:chunk});const changed=structuredClone(f.chunks[0]);changed.rows[0].line.sku_id=id(999);await assert.rejects(f.s.authorizeStep({kind:'TRANSFER_LINES',payload:changed}));
 const c=await f.s.openSources.TRANSFER_LINES(f.inputs.closureScope,{group:'TRANSFER_LINES',signal:f.controller.signal}),ordered=rows=>rows.toSorted((a,b)=>Buffer.compare(Buffer.from(a.key),Buffer.from(b.key)));
 assert.deepEqual(await Array.fromAsync(c.sourceRows()),ordered(f.pairs.map(p=>p.source)));assert.deepEqual(await Array.fromAsync(c.typedRows()),ordered(f.pairs.map(p=>p.typed)));assert.deepEqual(await Array.fromAsync(c.documents()),[]);assert.equal(f.trace.ready,0);
});
test('source620 retained TRANSFER_LINES: duplicate packed membership and incomplete file coverage refuse during preflight',async t=>{
 for(const mutateIndex of [b=>{b.copy(b,64+256+64,64+64,64+100);},b=>{b.writeBigUInt64LE(1n,64+4);}]){const f=await retainedTransferFiles(t,{mutateIndex});await assert.rejects(f.s.preflight());assert.equal(f.trace.ready,0);}
});
test('source620 retained helper version: unchanged real BARCODE membership and six schemes remain compatible with T04 projection module',async t=>{
 const f=await retainedBarcodeFiles(t),s=await f.open();t.after(()=>s.close());await s.preflight();for(const payload of f.prepared)await s.authorizeStep({kind:'BARCODE',payload});
 const c=await s.openSources.BARCODES(f.inputs.closureScope,{group:'BARCODES',signal:new AbortController().signal});assert.equal((await Array.fromAsync(c.sourceRows())).length,3);const typed=await Array.fromAsync(c.typedRows());assert.equal(typed.length,9);assert.equal(typed.filter(r=>r.relation==='barcode_scheme').length,6);assert.equal(f.trace.ready,0);
});
