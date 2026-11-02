/** T45-only composition of original source factories and stores, before V7/V8.
 * No CLI, injectable factory/pool, grant issuance, DDL or direct business SQL.
 * The input carries original private options, not invented credentials/reviews.
 */
import assert from 'node:assert/strict';
import {jsonObject} from '../../adapters/postgres/src/codec.ts';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {BoundedPostgresPool} from '../../adapters/postgres/src/bounded-pool.ts';
import type {BoundedPostgresConfig} from '../../adapters/postgres/src/bounded-pool.ts';
import {createNativeRuntime26Issuer,NATIVE_RUNTIME26_PREPARATION13_FORMAT,NATIVE_RUNTIME26_PREPARATION13_PATCH_LEVEL} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {PostgresCutoffImportStore} from '../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import type {ImportStageBootstrap26,BarcodeSchemeInitialization26} from '../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import {initializeNativeBarcodeSchemesOnClient26} from '../../adapters/postgres/src/native-barcode-import.ts';
import {PostgresNativeCatalogueImportStore26} from '../../adapters/postgres/src/native-catalogue-import.ts';
import {readNativeCoreWarehouseCarryForward} from '../../adapters/postgres/src/native-import-record-accounting.ts';
import {importedHistoryReadSql} from '../../adapters/postgres/src/imported-history-query-reader.ts';
import {createCutoffImportService,validateCutoffImportCommand,stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import type {CoreStageCommand,BarcodeSchemeInitializationCommand} from '../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {collectCurrentReviewedCatalogue,CURRENT_LIVE_LEDGER_QA_TARGET,CURRENT_LIVE_LEDGER_QA_BATCH,CURRENT_LIVE_LEDGER_QA_NAMESPACE,CURRENT_REWRITE_SYNTHETIC_TARGET,CURRENT_REWRITE_SYNTHETIC_BATCH,CURRENT_REWRITE_SYNTHETIC_NAMESPACE} from './current-runtime26-sales-fixture.ts';
import type {CurrentSalesBlueprint,CurrentReviewedCatalogueSource,CurrentSalesPublicationOptions} from './current-runtime26-sales-fixture.ts';

export const CURRENT_PREPARATION_ROLE='v7_r1_prepare_20261031_01';
const V4='26_hv2_history_set_guards_preparation_xmin_from_v22';
type Options=Readonly<Record<string,unknown>>;
interface Closable {close():Promise<void>}
interface Bootstrap extends Closable {readonly command:CoreStageCommand;readonly bootstrap26:ImportStageBootstrap26;now():string;authorizeStageSourceActor(actor:string,command:CoreStageCommand):Promise<void>}
interface SchemeSource extends Closable {initializationData():unknown;verify():Promise<void>}
export interface CurrentRuntime26PreparationInput {
 readonly authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_V4';
 readonly blueprint:CurrentSalesBlueprint;
 readonly postgres:BoundedPostgresConfig;
 readonly expectedDatabaseOid:string;
 readonly runtime26Review:{readonly reviewFile:string;readonly trustedReviewSha256:string};
 readonly partySourceOptions:Options;
 /** Original native-bootstrap options, excluding partySource (constructed here). */
 readonly bootstrapOptions:Options;
 readonly catalogueSourceOptions:Options;
 readonly schemeSourceOptions:Options;
 readonly schemeInitialization:{readonly command:BarcodeSchemeInitializationCommand;readonly writeContractReplyFile:string;readonly trustedWriteContractReplySha256:string};
 readonly publication:CurrentSalesPublicationOptions;
}
export interface CurrentRuntime26Preparation13Input extends Omit<CurrentRuntime26PreparationInput,'authorization'> {
 readonly authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_PREPARATION13_V1';
}
export interface Rewrite26PreparationInput extends Omit<CurrentRuntime26PreparationInput,'authorization'> { readonly authorization:'CONFIRMED_REWRITE26_SYNTHETIC_PREPARATION_V1'; readonly targetAttestation:{readonly file:string;readonly trustedSha256:string}; }
type PreparationInput=CurrentRuntime26PreparationInput|CurrentRuntime26Preparation13Input|Rewrite26PreparationInput;
export interface Rewrite26CorePreparationInput extends Omit<Rewrite26PreparationInput,'publication'> { readonly control:{readonly mode:'FIRST'|'READ_ONLY_RECOVERY'|'INIT_AFTER_READBACK';readonly deadlineUtc:string;readonly signal:AbortSignal}; }

export interface CurrentRuntime26PreparedPublicationResult {
 readonly status:'IMPORTED';
 readonly coreResult:Awaited<ReturnType<ReturnType<typeof createCutoffImportService>['execute']>>;
 readonly publication:{readonly batchId:string;readonly sourceHash:string;readonly historyPayloadHash:string};
 readonly preparationOnly:true;readonly ordinaryV8Acceptance:false;
}
/** Pure finite routing checks, before source/private-file reads or pool creation.
 * This marker checks routing, never grants authority or replaces C execution approval. */
function validatePreparationInput(i:PreparationInput,preparation13:boolean,rewrite=false):void{
 if (rewrite) { validateRewriteInput(i); return; }
 assert.equal(i?.authorization,preparation13?'CONFIRMED_NEW_ISOLATED_PREPARATION_135_PREPARATION13_V1':'CONFIRMED_NEW_ISOLATED_PREPARATION_135_V4');
 const b=i.blueprint;assert.equal(b.database,CURRENT_LIVE_LEDGER_QA_TARGET);assert.equal(b.batchId,CURRENT_LIVE_LEDGER_QA_BATCH);assert.equal(b.namespace,CURRENT_LIVE_LEDGER_QA_NAMESPACE);
 assert.equal(i.postgres.target.database,b.database);assert.equal(i.postgres.target.user,CURRENT_PREPARATION_ROLE);
 assert.equal(i.postgres.target.host,'/qa-socket');assert.equal(i.postgres.target.port,5432);assert.equal(i.postgres.target.ssl,false);
 assert.match(i.expectedDatabaseOid,/^[1-9]\d*$/);assert.ok(!['16391','21551','1027659'].includes(i.expectedDatabaseOid));
 assert.ok(isAbsolute(i.runtime26Review.reviewFile)&&/^[a-f0-9]{64}$/.test(i.runtime26Review.trustedReviewSha256));
 const binding=i.bootstrapOptions.binding as {phase:string;target:{database:string;role:string;serverAddress:unknown;serverPort:unknown};batchId:string;fixedSourceNamespace:string;selectionSha256:string;actorAccountId:string};
 assert.equal(binding?.phase,'CORE_INITIALIZATION_26_V1');assert.equal(binding.batchId,b.batchId);assert.equal(binding.fixedSourceNamespace,b.namespace);assert.equal(binding.selectionSha256,b.pins.selectionSha256);assert.equal(binding.actorAccountId,b.refs.importer.nativeAccountId);
 assert.equal(binding.target.database,b.database);assert.equal(binding.target.role,CURRENT_PREPARATION_ROLE);assert.equal(binding.target.serverAddress,null);assert.equal(binding.target.serverPort,null);
 assert.ok(!Object.hasOwn(i.bootstrapOptions,'partySource'),'Only original party factory may provide partySource');
 const short={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256};
 for(const options of [i.partySourceOptions,i.catalogueSourceOptions,i.schemeSourceOptions])assert.deepEqual(options.binding,short);
 validateCutoffImportCommand(i.schemeInitialization.command);assert.equal(i.schemeInitialization.command.actorAccountId,b.refs.importer.nativeAccountId);assert.equal(i.schemeInitialization.command.batchId,b.batchId);assert.deepEqual(i.schemeInitialization.command.schemeInitialization.target,binding.target);
 assert.ok(i.publication.signal instanceof AbortSignal&&!i.publication.signal.aborted&&isAbsolute(i.publication.configFile)&&Number.isSafeInteger(i.publication.maxSteps)&&i.publication.maxSteps>0&&i.publication.maxSteps<=1_000_000&&typeof i.publication.append==='function');
}

async function runPreparedPublication(i:PreparationInput,preparation13:boolean,rewrite=false):Promise<CurrentRuntime26PreparedPublicationResult>{
 validatePreparationInput(i,preparation13,rewrite);
 const executionRole=rewrite?i.postgres.target.user:CURRENT_PREPARATION_ROLE;
 if (rewrite) {
  const attestation=(i as Rewrite26PreparationInput).targetAttestation;const raw=await readFile(attestation.file);
  assert.equal(createHash('sha256').update(raw).digest('hex'),attestation.trustedSha256);
  const target=JSON.parse(raw.toString('utf8')) as {database:string;databaseOid:string;systemIdentifier:string;result:string};
  assert.equal(target.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(target.databaseOid,'16387');
  assert.equal(target.systemIdentifier,'7703341807471058958');assert.equal(target.result,'PASS');
 }
 // The original issuer re-reads/pins this file and actual metadata on its owned
 // connection. This precheck prevents choosing an unrelated observation profile.
 const bytes=await readFile(i.runtime26Review.reviewFile);assert.equal(createHash('sha256').update(bytes).digest('hex'),i.runtime26Review.trustedReviewSha256);
 const review=JSON.parse(bytes.toString('utf8')) as {catalog:{format:string;patchLevel:string};target:{database:string;databaseOid:string;actingRole:string;sessionUser:string}};
 assert.equal(review.catalog.format,rewrite?'EXACT26_RUNTIME_CATALOG_EXPORT_HISTORY_DRAFT_SEQUENCE_SYSTEM_V1':preparation13?NATIVE_RUNTIME26_PREPARATION13_FORMAT:'EXACT26_RUNTIME_CATALOG_EXPORT_V4');assert.equal(review.catalog.patchLevel,rewrite?'26_hv2_history_draft_sequence_system_acl_from_v1':preparation13?NATIVE_RUNTIME26_PREPARATION13_PATCH_LEVEL:V4);
 assert.equal(review.target.database,i.blueprint.database);assert.equal(review.target.databaseOid,i.expectedDatabaseOid);assert.equal(review.target.actingRole,executionRole);assert.equal(review.target.sessionUser,executionRole);
 const partyModule=await import(new URL('../../scripts/import-v3/native-party-source26.mjs',import.meta.url).href) as {openReviewedPartySource26(o:Options):Promise<Closable>};
 const sourceModule=await import(new URL('../../scripts/import-v3/native-source-authorizers.mjs',import.meta.url).href) as {
  openReviewedCatalogueSource26(o:Options):Promise<CurrentReviewedCatalogueSource&Closable>;
  openApprovedBarcodeSchemes26(o:Options):Promise<SchemeSource>;
  openApprovedBarcodeSchemeInitialization26(o:unknown):Promise<BarcodeSchemeInitialization26&Closable>;
 };
 const bootstrapModule=await import(new URL('../../scripts/import-v3/native-bootstrap.mjs',import.meta.url).href) as {openNativeImportBootstrap26(o:Options):Promise<Bootstrap>};
 const hostValidation=await import(new URL('../../scripts/import-v3/production-source-host.mjs',import.meta.url).href) as {validateExecutableSourceHostJob26(value:unknown):{binding:{phase:string;target:unknown;batchId:string;actorAccountId:string;fixedSourceNamespace:string;selectionSha256:string;coreReceiptId:string};runtime26Review:CurrentRuntime26PreparationInput['runtime26Review'];deadlineUtc:string}};
 const job=hostValidation.validateExecutableSourceHostJob26(JSON.parse((await readFile(i.publication.configFile)).toString('utf8')));
 const expectedBinding=i.bootstrapOptions.binding as {target:unknown};assert.equal(job.binding.phase,'FULL_SOURCE_CONTINUATION_26_V1');assert.deepEqual(job.binding.target,expectedBinding.target);assert.equal(job.binding.batchId,i.blueprint.batchId);assert.equal(job.binding.actorAccountId,i.blueprint.refs.importer.nativeAccountId);assert.equal(job.binding.fixedSourceNamespace,i.blueprint.namespace);assert.equal(job.binding.selectionSha256,i.blueprint.pins.selectionSha256);assert.deepEqual(job.runtime26Review,i.runtime26Review);
 const active=()=>assert.ok(!i.publication.signal.aborted&&Date.now()<Date.parse(job.deadlineUtc),'Original preparation job expired or cancelled');
 active();
 const owned:Closable[]=[];let pool:BoundedPostgresPool|undefined,failure:unknown,result:CurrentRuntime26PreparedPublicationResult|undefined;
 try{
  const party=await partyModule.openReviewedPartySource26(i.partySourceOptions);owned.push(party);
  const bootstrap=await bootstrapModule.openNativeImportBootstrap26({...i.bootstrapOptions,partySource:party});owned.push(bootstrap);
  const catalogue=await sourceModule.openReviewedCatalogueSource26(i.catalogueSourceOptions);owned.push(catalogue);
  const chunks=await collectCurrentReviewedCatalogue(i.blueprint,catalogue);
  const schemes=await sourceModule.openApprovedBarcodeSchemes26(i.schemeSourceOptions);owned.push(schemes);
  const initializer=await sourceModule.openApprovedBarcodeSchemeInitialization26({...i.schemeInitialization,source:schemes,initializeSchemes26:initializeNativeBarcodeSchemesOnClient26});owned.push(initializer);
  // All original source factories verify their independently pinned approvals
  // before the first pool is constructed; nothing can supply a fake issuer.
  active();pool=new BoundedPostgresPool(i.postgres);
  const issuer=await createNativeRuntime26Issuer(pool,i.runtime26Review),{runtime26}=issuer;
  const c=await issuer.pool.connect();
  try{
   await runtime26.assertReady(c,'IMPORT_STAGE');
   const rows=(await c.query(`SELECT current_user role,session_user,(SELECT count(*)::integer FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace) routines,
    (SELECT rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user) ordinary,
    (SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database()) owns_database,
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)=current_user) owns_schema,
    EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND pg_get_userbyid(relowner)=current_user) owns_relation,
    EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND pg_get_userbyid(proowner)=current_user) owns_routine,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) member`)).rows;
   assert.equal(rows.length,1);const r=rows[0]!;assert.ok(r.role===executionRole&&r.session_user===executionRole&&r.routines===(rewrite?137:135)&&r.ordinary===true&&r.owns_database===false&&r.owns_schema===false&&r.owns_relation===false&&r.owns_routine===false&&r.member===false);
  }finally{c.release();}
  // Preflight the original FULL grant/source host before any CORE write. Its
  // source generator stays dormant until CORE/INIT/catalogue have committed.
  const hostModule=await import(new URL('../../scripts/import-v3/production-source-host.mjs',import.meta.url).href) as {openImportHost26(o:unknown):Promise<{executor:{binding:{target:unknown;coreReceiptId:string;batchId:string;actorAccountId:string;fixedSourceNamespace:string;selectionSha256:string;coreSourceDigest:string;authorizedPayloadHash:string};[key:string]:unknown};source:unknown;close():Promise<void>}>};
  const runner=await import(new URL('../../scripts/import-v3/run.mjs',import.meta.url).href) as {createPostgresImportExecutor26(o:unknown):(step:unknown)=>Promise<unknown>;runImportSteps(o:unknown):Promise<unknown>};
  active();const full=await hostModule.openImportHost26({configFile:i.publication.configFile,signal:i.publication.signal});owned.push(full);
  const fb=full.executor.binding;assert.deepEqual(fb.target,(i.bootstrapOptions.binding as {target:unknown}).target);assert.equal(fb.batchId,i.blueprint.batchId);assert.equal(fb.actorAccountId,i.blueprint.refs.importer.nativeAccountId);assert.equal(fb.fixedSourceNamespace,i.blueprint.namespace);assert.equal(fb.selectionSha256,i.blueprint.pins.selectionSha256);
  active();const core=bootstrap.command;assert.equal(core.action,'IMPORT_CORE_STAGE');assert.equal(bootstrap.now(),i.blueprint.now);assert.equal(fb.coreSourceDigest,core.coreInitialization.coreSourceDigest);const expectedCoreOperation=stableImportId('operation',core.actorAccountId,core.requestKey);assert.equal(fb.coreReceiptId,expectedCoreOperation);assert.equal(i.schemeInitialization.command.schemeInitialization.coreReceiptId,expectedCoreOperation);
  const coreAuthorization={assertAllowed:async(actor:string,command:CoreStageCommand)=>{active();assert.equal(requestHash(command),requestHash(core));await bootstrap.authorizeStageSourceActor(actor,command);active();}};
  const coreService=createCutoffImportService({now:bootstrap.now.bind(bootstrap),authorization:coreAuthorization,store:new PostgresCutoffImportStore(issuer.pool,{runtime26,coreAuthorization,stageBootstrap26:bootstrap.bootstrap26})});
  const coreResult=await coreService.execute(core);assert.equal(coreResult.status,'STAGED');
  active();const init=i.schemeInitialization.command;assert.equal(init.schemeInitialization.coreReceiptId,coreResult.operationId);assert.equal(job.binding.coreReceiptId,coreResult.operationId);assert.equal(fb.coreReceiptId,coreResult.operationId);
  await createCutoffImportService({now:bootstrap.now.bind(bootstrap),authorization:{assertAllowed:async(actor,command)=>{active();assert.deepEqual(command,init);await initializer.assertAllowed(actor,init);active();}},store:new PostgresCutoffImportStore(issuer.pool,{runtime26,barcodeSchemeInitialization26:initializer})}).execute(init);
  for(const chunk of chunks){active();await catalogue.authorize(chunk);await new PostgresNativeCatalogueImportStore26(issuer.pool,runtime26).stage(chunk);}await catalogue.verify();
  await runner.runImportSteps({source:full.source,execute:runner.createPostgresImportExecutor26(full.executor),append:i.publication.append,signal:i.publication.signal,maxSteps:i.publication.maxSteps});
  const read=await issuer.pool.connect();let began=false,discard:Error|undefined;
  try{
   await runtime26.assertReady(read,'IMPORT_PUBLISH');await read.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
   const proof=await readNativeCoreWarehouseCarryForward(read,fb as Parameters<typeof readNativeCoreWarehouseCarryForward>[1],runtime26);assert.equal(proof.status,'IMPORTED');assert.equal(proof.committedOperations.at(-1)?.action,'IMPORT_PUBLISH');const checkpoint=jsonObject(proof.checkpoint);assert.deepEqual(checkpoint.counts,checkpoint.expected);assert.equal(proof.warehouses.length,22);
   const pub=importedHistoryReadSql('sales'),rows=(await read.query(`SELECT b.id,b.source_hash,b.history_payload_hash,(${pub.publishedPredicate}) published FROM ${pub.publicationFrom} WHERE b.id=$2::uuid`,[pub.values[0],i.blueprint.batchId])).rows;
   assert.equal(rows.length,1);const p=rows[0]!;assert.equal(p.published,true);assert.equal(p.source_hash,i.blueprint.pins.selectionSha256);assert.equal(p.history_payload_hash,(fb as {authorizedPayloadHash?:string}).authorizedPayloadHash);
   await read.query('ROLLBACK');began=false;result={status:'IMPORTED' as const,coreResult,publication:{batchId:String(p.id),sourceHash:String(p.source_hash),historyPayloadHash:String(p.history_payload_hash)},preparationOnly:true as const,ordinaryV8Acceptance:false as const};
  }catch(e){discard=e instanceof Error?e:Error('Preparation readback unknown');throw e;}finally{try{if(began)await read.query('ROLLBACK');}finally{read.release(discard);}}
 }catch(e){failure=e;}finally{
  const cleanup:unknown[]=[];for(const owner of owned.reverse())try{await owner.close();}catch(e){cleanup.push(e);}if(pool)try{await pool.dispose();}catch(e){cleanup.push(e);}
  if(cleanup.length)failure=new AggregateError([...(failure===undefined?[]:[failure]),...cleanup],'Preparation cleanup unconfirmed; no acceptance');
 }
 if(failure!==undefined)throw failure;assert.ok(result);return result;
}

/** Original V4 route remains exact12; it does not silently adopt a new review. */
export function validateCurrentRuntime26PreparationInput(i:CurrentRuntime26PreparationInput):void{validatePreparationInput(i,false);}
export function runCurrentRuntime26PreparedPublication(i:CurrentRuntime26PreparationInput):Promise<CurrentRuntime26PreparedPublicationResult>{return runPreparedPublication(i,false);}
/** Approved preparation13 route: original135 business source, distinct review. */
export function validateCurrentRuntime26Preparation13Input(i:CurrentRuntime26Preparation13Input):void{validatePreparationInput(i,true);}
export function runCurrentRuntime26Preparation13Publication(i:CurrentRuntime26Preparation13Input):Promise<CurrentRuntime26PreparedPublicationResult>{return runPreparedPublication(i,true);}


/** Fixed-target successor. The process/system identity remains independently
 * attested by the T45 host; this route never substitutes that attestation. */
function validateRewriteInput(i:PreparationInput|Rewrite26CorePreparationInput):void {
 assert.equal(i?.authorization,'CONFIRMED_REWRITE26_SYNTHETIC_PREPARATION_V1');
 const attestation=(i as Rewrite26PreparationInput).targetAttestation;assert.ok(attestation&&isAbsolute(attestation.file)&&/^[a-f0-9]{64}$/.test(attestation.trustedSha256));
 const b=i.blueprint; assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(b.batchId,CURRENT_REWRITE_SYNTHETIC_BATCH);assert.equal(b.namespace,CURRENT_REWRITE_SYNTHETIC_NAMESPACE);
 assert.equal(i.postgres.target.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(i.expectedDatabaseOid,'16387');
 const role=i.postgres.target.user; assert.equal(role,'schema_runtime_20261102_01');
 assert.equal(i.postgres.target.host,'127.0.0.1');assert.equal(i.postgres.target.port,18641);
 assert.ok(isAbsolute(i.runtime26Review.reviewFile)&&/^[a-f0-9]{64}$/.test(i.runtime26Review.trustedReviewSha256));
 const binding=i.bootstrapOptions.binding as {phase:string;target:{database:string;role:string};batchId:string;fixedSourceNamespace:string;selectionSha256:string;actorAccountId:string};
 assert.equal(binding?.phase,'CORE_INITIALIZATION_26_V1');assert.equal(binding.target.database,b.database);assert.equal(binding.target.role,role);
 assert.equal(binding.batchId,b.batchId);assert.equal(binding.fixedSourceNamespace,b.namespace);assert.equal(binding.selectionSha256,b.pins.selectionSha256);assert.equal(binding.actorAccountId,b.refs.importer.nativeAccountId);
 assert.ok(!Object.hasOwn(i.bootstrapOptions,'partySource'));
 const short={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256};
 for(const options of [i.partySourceOptions,i.catalogueSourceOptions,i.schemeSourceOptions])assert.deepEqual(options.binding,short);
 validateCutoffImportCommand(i.schemeInitialization.command);assert.equal(i.schemeInitialization.command.actorAccountId,b.refs.importer.nativeAccountId);assert.equal(i.schemeInitialization.command.batchId,b.batchId);assert.deepEqual(i.schemeInitialization.command.schemeInitialization.target,binding.target);
 if ('control' in i) { assert.ok(['FIRST','READ_ONLY_RECOVERY','INIT_AFTER_READBACK'].includes(i.control.mode)&&i.control.signal instanceof AbortSignal&&!i.control.signal.aborted&&typeof i.control.deadlineUtc==='string'&&i.control.deadlineUtc.endsWith('Z')&&Date.parse(i.control.deadlineUtc)>Date.now()); }
 else assert.ok(i.publication.signal instanceof AbortSignal&&!i.publication.signal.aborted&&isAbsolute(i.publication.configFile)&&Number.isSafeInteger(i.publication.maxSteps)&&i.publication.maxSteps>0&&i.publication.maxSteps<=1_000_000&&typeof i.publication.append==='function');
}
export function validateRewrite26CorePreparationInput(i:Rewrite26CorePreparationInput):void {validateRewriteInput(i);}
export function validateRewrite26PreparationInput(i:Rewrite26PreparationInput):void {validatePreparationInput(i,false,true);}
export function runRewrite26PreparedPublication(i:Rewrite26PreparationInput):Promise<CurrentRuntime26PreparedPublicationResult>{return runPreparedPublication(i,false,true);}

/** Original reviewed bootstrap and scheme initializer, without opening the FULL
 * source session. Recovery reads the committed original key only; it never writes. */
export async function runRewrite26CorePreparation(i:Rewrite26CorePreparationInput){
 validateRewrite26CorePreparationInput(i);
 const active=()=>assert.ok(!i.control.signal.aborted&&Date.now()<Date.parse(i.control.deadlineUtc),'CORE preparation expired or cancelled');
 const targetBytes=await readFile(i.targetAttestation.file);assert.equal(createHash('sha256').update(targetBytes).digest('hex'),i.targetAttestation.trustedSha256);
 const target=JSON.parse(targetBytes.toString('utf8'));assert.equal(target.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(target.databaseOid,'16387');assert.equal(target.systemIdentifier,'7703341807471058958');assert.equal(target.result,'PASS');
 const reviewBytes=await readFile(i.runtime26Review.reviewFile);assert.equal(createHash('sha256').update(reviewBytes).digest('hex'),i.runtime26Review.trustedReviewSha256);
 const review=JSON.parse(reviewBytes.toString('utf8'));assert.equal(review.catalog.format,'EXACT26_RUNTIME_CATALOG_EXPORT_HISTORY_DRAFT_SEQUENCE_SYSTEM_V1');assert.equal(review.catalog.patchLevel,'26_hv2_history_draft_sequence_system_acl_from_v1');assert.equal(review.target.database,i.blueprint.database);assert.equal(review.target.databaseOid,i.expectedDatabaseOid);assert.equal(review.target.actingRole,i.postgres.target.user);assert.equal(review.target.sessionUser,i.postgres.target.user);
 const partyModule=await import(new URL('../../scripts/import-v3/native-party-source26.mjs',import.meta.url).href) as {openReviewedPartySource26(o:Options):Promise<Closable>};
 const bootstrapModule=await import(new URL('../../scripts/import-v3/native-bootstrap.mjs',import.meta.url).href) as {openNativeImportBootstrap26(o:Options):Promise<Bootstrap>};
 const sourceModule=await import(new URL('../../scripts/import-v3/native-source-authorizers.mjs',import.meta.url).href) as {openApprovedBarcodeSchemes26(o:Options):Promise<SchemeSource>;openApprovedBarcodeSchemeInitialization26(o:unknown):Promise<BarcodeSchemeInitialization26&Closable>};
 const owned:Closable[]=[];let pool:BoundedPostgresPool|undefined;let failure:unknown;let result:unknown;
 try{
  active();const party=await partyModule.openReviewedPartySource26(i.partySourceOptions);owned.push(party);
  const bootstrap=await bootstrapModule.openNativeImportBootstrap26({...i.bootstrapOptions,partySource:party});owned.push(bootstrap);
  const core=bootstrap.command,coreReceiptId=stableImportId('operation',core.actorAccountId,core.requestKey),init=i.schemeInitialization.command;
  assert.equal(core.action,'IMPORT_CORE_STAGE');assert.equal(bootstrap.now(),i.blueprint.now);assert.equal(coreReceiptId,init.schemeInitialization.coreReceiptId);
  let initializer:(BarcodeSchemeInitialization26&Closable)|undefined;
  if(i.control.mode!=='READ_ONLY_RECOVERY'){const schemes=await sourceModule.openApprovedBarcodeSchemes26(i.schemeSourceOptions);owned.push(schemes);initializer=await sourceModule.openApprovedBarcodeSchemeInitialization26({...i.schemeInitialization,source:schemes,initializeSchemes26:initializeNativeBarcodeSchemesOnClient26});owned.push(initializer);}
  active();pool=new BoundedPostgresPool(i.postgres);const issuer=await createNativeRuntime26Issuer(pool,i.runtime26Review),runtime26=issuer.runtime26;
  const c=await issuer.pool.connect();
  try{
   await runtime26.assertReady(c,'IMPORT_STAGE');
   const rows=(await c.query(`SELECT current_user role,session_user,(SELECT count(*)::integer FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace) routines,
    (SELECT rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user) ordinary,
    (SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database()) owns_database,
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)=current_user) owns_schema,
    EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND pg_get_userbyid(relowner)=current_user) owns_relation,
    EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND pg_get_userbyid(proowner)=current_user) owns_routine,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) member`)).rows;
   assert.equal(rows.length,1);const r=rows[0]!;assert.ok(r.role===i.postgres.target.user&&r.session_user===i.postgres.target.user&&r.routines===137&&r.ordinary===true&&r.owns_database===false&&r.owns_schema===false&&r.owns_relation===false&&r.owns_routine===false&&r.member===false);
  }finally{c.release();}
  const readProof=async()=>{active();const client=await issuer.pool.connect();let began=false;let discard:Error|undefined;
   try{await runtime26.assertReady(client,'IMPORT_STAGE');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');began=true;
    const proof=await readNativeCoreWarehouseCarryForward(client,{batchId:i.blueprint.batchId,coreReceiptId,coreSourceDigest:core.coreInitialization.coreSourceDigest},runtime26);
    assert.equal(proof.actorAccountId,core.actorAccountId);assert.equal(proof.fixedSourceNamespace,i.blueprint.namespace);assert.equal(proof.selectionSha256,i.blueprint.pins.selectionSha256);
    await client.query('COMMIT');began=false;return proof;
   }catch(e){if(began)try{await client.query('ROLLBACK');}catch{discard=Error('CORE readback rollback failed');}else discard=e instanceof Error?e:Error('CORE readback failed');throw e;}finally{client.release(discard);}
  };
  const exactInit=(proof:Awaited<ReturnType<typeof readProof>>)=>proof.committedOperations.find(o=>o.action==='IMPORT_INITIALIZE_BARCODE_SCHEMES'&&o.requestKey===init.requestKey&&o.requestHash===requestHash(init));
  const writeInit=async()=>{active();await createCutoffImportService({now:bootstrap.now.bind(bootstrap),authorization:{assertAllowed:async(actor,command)=>{active();assert.deepEqual(command,init);await initializer!.assertAllowed(actor,init);active();}},store:new PostgresCutoffImportStore(issuer.pool,{runtime26,barcodeSchemeInitialization26:initializer})}).execute(init);};
  if(i.control.mode==='FIRST'){
   const coreAuthorization={assertAllowed:async(actor:string,command:CoreStageCommand)=>{active();assert.equal(requestHash(command),requestHash(core));await bootstrap.authorizeStageSourceActor(actor,command);active();}};
   const coreResult=await createCutoffImportService({now:bootstrap.now.bind(bootstrap),authorization:coreAuthorization,store:new PostgresCutoffImportStore(issuer.pool,{runtime26,coreAuthorization,stageBootstrap26:bootstrap.bootstrap26})}).execute(core);assert.equal(coreResult.status,'STAGED');assert.equal(coreResult.operationId,coreReceiptId);
   await writeInit();
  }else if(i.control.mode==='INIT_AFTER_READBACK'){
   const prior=await readProof();assert.equal(prior.status,'STAGED');
   if(!exactInit(prior)){assert.equal(prior.committedOperations.length,0,'Unexpected committed chain; do not initialize');assert.equal(jsonObject(prior.checkpoint).sequence,1);await writeInit();}
  }
  const proof=await readProof(),committed=exactInit(proof);
  if(i.control.mode!=='READ_ONLY_RECOVERY')assert.ok(committed,'Committed original INIT receipt required');
  result={coreReceiptId,coreSourceDigest:core.coreInitialization.coreSourceDigest,initializationCommitted:Boolean(committed),verifiedCurrent:proof,preparationOnly:true as const,fullSourceExecutionAuthorized:false as const};
 }catch(e){failure=e;}finally{const cleanup:unknown[]=[];for(const owner of owned.reverse())try{await owner.close();}catch(e){cleanup.push(e);}if(pool)try{await pool.dispose();}catch(e){cleanup.push(e);}if(cleanup.length)failure=new AggregateError([...(failure===undefined?[]:[failure]),...cleanup],'CORE preparation cleanup unconfirmed');}
 if(failure!==undefined)throw failure;return result;
}
