/** Disabled operator material. Uses only the original v19 MAIN service/store and runImportSteps. */
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const fail=code=>{throw Object.assign(Error(code),{code});};
const must=(ok,code)=>{if(!ok)fail(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&!v.includes('\0');
const absolute=v=>text(v)&&isAbsolute(v)&&resolve(v)===v;
export const fixedIdentity=Object.freeze({batchId:'aeeba5c6-fb54-4b94-bf80-93d98212a70d',actorAccountId:'151693ec-3f0f-4d39-89a4-4f44601a06b7',
 fixedSourceNamespace:'naijue:tplus:primary-ledger',selectionSha256:'964038610b470b38996133fa6a7311aea72ef8fe2749ae6fa3d751d09f079cba',
 coreReceiptId:'b48694d2-ad13-5c5c-9bd8-aed1d02fffb1',coreSourceDigest:'2589b25c06bb1312b9d1f40627fb7432f44b4293b5d1ae7186223948b144cc28'});
export const approvalPins=Object.freeze({proposalSha256:'826e63b33e8e2f52a521d5ba3e930899d61092dfb22f65b11db4f799f7efef00',
 approvalSha256:'f9da50c270c14321b17af06255a5f0649daf8b55a725b6a29fe483f342517533',
 writeContractReplySha256:'9ec37b0219f227fa39e754364ea04f1962866664283812f8d9b383ba19b2acfc'});
const approvalFiles=Object.freeze({proposal:'BARCODE-SCHEME-INITIALIZATION-PROPOSAL-v1.json',approval:'BARCODE-SCHEME-INITIALIZATION-APPROVAL-v1.json',reply:'WRITE-CONTRACT-SUPPLEMENT-v19-HUMAN-REPLY.json'});
export function validateEnabledInput(value){
 must(value?.executionEnabled===true,'SIX_SCHEME_EXECUTION_DISABLED');
 must(value.version==='SIX_SCHEME_INITIALIZATION_PREPARATION_V19_1','SIX_SCHEME_INPUT_VERSION');
 must(Object.keys(value.identity??{}).length===Object.keys(fixedIdentity).length&&Object.entries(fixedIdentity).every(([k,v])=>value.identity[k]===v),'SIX_SCHEME_ORIGINAL_IDENTITY_CHANGED');
 const s=value.sourceSnapshot,t=value.target,r=value.runtime26Review,e=value.targetIdentityEvidence;
 must(absolute(s?.root)&&typeof s.sourceRef==='string'&&/^[a-f0-9]{40}$/.test(s.sourceRef)
  &&absolute(s.independentReviewFile)&&hash(s.independentReviewSha256),'SIX_SCHEME_FROZEN_SOURCE_PENDING');
 must(absolute(r?.reviewFile)&&hash(r.trustedReviewSha256),'SIX_SCHEME_FRESH_RUNTIME_REVIEW_PENDING');
 must(text(value.requestKey)&&Number.isSafeInteger(value.expectedSequence)&&value.expectedSequence>0
  &&Number.isSafeInteger(value.expectedCursor)&&value.expectedCursor>=0,'SIX_SCHEME_ORIGINAL_KEY_OR_CHECKPOINT_PENDING');
 must(text(value.cutoffAt)&&Number.isFinite(Date.parse(value.cutoffAt))&&/(?:Z|[+-]\d\d:\d\d)$/.test(value.cutoffAt),'SIX_SCHEME_SOURCE_CUTOFF_PENDING');
 must(t?.database==='erp_rewrite_20261022_r1'&&t.role==='erp_rewrite_runtime_20261022'&&text(t.postmasterStartedAt)
  &&(t.serverAddress===null?t.serverPort===null:text(t.serverAddress)&&Number.isInteger(t.serverPort)&&t.serverPort>0&&t.serverPort<=65535),'SIX_SCHEME_FRESH_TARGET_PENDING');
 must(e?.databaseOid==='1027659'&&e.sessionUser==='erp_rewrite_runtime_20261022'&&absolute(e.freshReadbackFile)&&hash(e.freshReadbackSha256),'SIX_SCHEME_CURRENT_FACTS_PENDING');
 return structuredClone(value);
}
export function originalCommand(input,schemes){
 const c=validateEnabledInput(input),i=c.identity;
 return {action:'IMPORT_INITIALIZE_BARCODE_SCHEMES',batchId:i.batchId,actorAccountId:i.actorAccountId,requestKey:c.requestKey,
  expectedSequence:c.expectedSequence,expectedCursor:c.expectedCursor,schemeInitialization:{version:'BARCODE_SCHEME_INITIALIZATION_V19',
   coreReceiptId:i.coreReceiptId,coreSourceDigest:i.coreSourceDigest,fixedSourceNamespace:i.fixedSourceNamespace,selectionSha256:i.selectionSha256,
   cutoffAt:c.cutoffAt,target:structuredClone(c.target),approvalPins:{...approvalPins},schemes:structuredClone(schemes)}};
}
/** The original gate is activated/closed by T45 using the exact fresh input.runtime26Review.
 * This helper does not allocate/connect a raw pool, create an issuer, issue SQL, or own another transaction.
 * retainRequest must durably retain the original body/key/requestHash before the first write attempt.
 */
export async function executeOriginalSingleMain(input,{runtimeGate,signal,now,append,retainRequest}){
 const c=validateEnabledInput(input); // disabled and missing dynamic inputs fail before any gate/module/query access
 must(signal instanceof AbortSignal&&!signal.aborted&&typeof now==='function'&&typeof append==='function'&&typeof retainRequest==='function','SIX_SCHEME_ORIGINAL_CONTEXT_REQUIRED');
 must(typeof runtimeGate?.capability?.ready==='function','SIX_SCHEME_ORIGINAL_RUNTIME_GATE_REQUIRED');
 const load=p=>import(pathToFileURL(resolve(c.sourceSnapshot.root,p)).href);
 const [application,storeModule,sourceModule,barcodeModule,runModule,hashModule]=await Promise.all([
  load('packages/application/src/inventory-cutoff-import.ts'),load('adapters/postgres/src/inventory-cutoff-import-store.ts'),
  load('scripts/import-v3/native-source-authorizers.mjs'),load('adapters/postgres/src/native-barcode-import.ts'),
  load('scripts/import-v3/run.mjs'),load('packages/application/src/request-hash.ts')]);
 const paths=Object.fromEntries(Object.entries(approvalFiles).map(([k,name])=>[k,fileURLToPath(new URL(`./approved/${name}`,import.meta.url))]));
 let source,authorized,closed=false;
 const close=async()=>{if(closed)return;closed=true;if(authorized)await authorized.close();if(source)await source.close();};
 try{
  source=await sourceModule.openApprovedBarcodeSchemes26({proposalFile:paths.proposal,trustedProposalSha256:approvalPins.proposalSha256,
   approvalFile:paths.approval,trustedApprovalSha256:approvalPins.approvalSha256,binding:{...c.identity,cutoffAt:c.cutoffAt}});
  const command=originalCommand(c,source.initializationData().rows);application.validateBarcodeSchemeInitializationCommand(command);
  authorized=await sourceModule.openApprovedBarcodeSchemeInitialization26({source,writeContractReplyFile:paths.reply,
   trustedWriteContractReplySha256:approvalPins.writeContractReplySha256,command,initializeSchemes26:barcodeModule.initializeNativeBarcodeSchemesOnClient26});
  const issued=runtimeGate.capability.ready();
  const pair={assertAllowed:authorized.assertAllowed,initializeSchemes26:authorized.initializeSchemes26}; // exact two only, close stays here
  const store=new storeModule.PostgresCutoffImportStore(issued.pool,{runtime26:issued.runtime26,barcodeSchemeInitialization26:pair});
  const service=application.createCutoffImportService({store,now,authorization:{assertAllowed:authorized.assertAllowed}});
  const requestHash=hashModule.requestHash(command),operationId=application.stableImportId('operation',command.actorAccountId,command.requestKey);
  must(await retainRequest({command:structuredClone(command),requestHash,operationId,runtime26Review:structuredClone(c.runtime26Review)})===undefined,'SIX_SCHEME_ORIGINAL_REQUEST_NOT_RETAINED');
  const single={async *steps(){await authorized.assertAllowed(command.actorAccountId,command);yield {kind:'MAIN',payload:structuredClone(command)};},close};
  const result=await runModule.runImportSteps({source:single,signal,maxSteps:1,append,execute:async step=>{
   must(step.kind==='MAIN'&&hashModule.requestHash(step.payload)===requestHash,'SIX_SCHEME_ORIGINAL_REQUEST_CHANGED');
   return service.execute(step.payload);
  }});
  return {runner:result,operationId,requestHash,scope:'SIX_SCHEME_INITIALIZATION_ONLY_NOT_FULL_IMPORT_OR_PUBLICATION'};
 }finally{await close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const input=JSON.parse(await readFile(new URL('./INPUT.disabled.json',import.meta.url),'utf8'));
 must(input.executionEnabled===false,'SIX_SCHEME_LOCAL_TEMPLATE_MUST_REMAIN_DISABLED');
 process.stdout.write(JSON.stringify({status:'DISABLED_LOCAL_PREPARATION_ONLY',executionEnabled:false,DB:false,server:false})+'\n');
}
