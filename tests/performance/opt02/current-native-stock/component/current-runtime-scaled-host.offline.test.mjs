/** Source parity and mocked read-only rows only. No SQL, PG or target approval. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import{createHash}from'node:crypto';import ts from 'typescript';
import { buildReferenceFixture } from './fixture.mjs';
import { buildScaledReferenceFixture } from './scaled-fixture.mjs';
import { SCALED_REFERENCE_BALANCES_SQL } from './scaled-source-verification.mjs';
import { verifyPublishedReferenceState, verifyPublishedScaledReferenceState, PUBLISHED_REFERENCE_STATE_SQL, preparePublishedScaledReferenceAlias4 } from './current-runtime-host.mjs';
const H=x=>createHash('sha256').update(x).digest('hex');
const originalHashes={assertCurrentRuntimePool:'d0239299e4c011713e98f54722fcf3035994f57fb1f79cd4d4eca2c0ca8c2be6',runOriginalPublicationAndClose:'20338a84fd97efc0bdd37b2c67287aa0aa429e4457ce35a3d85f9ae0d735228b',createCapturedQueryBoundary:'82ab3117209f17c5dc4adef7c71570efadf08abdb4d29d8da859ddc0bcc3f5b0',renderOwnerPublicationGuard:'c3dc3cd345de9bfa9224c62a513f0cc9f35237337788888cc08d414395ec3b32',verifyPublishedReferenceState:'029797a74f1dce9137aadbe6947e295a016f653521846117b4960f85a133bf17',createCurrentRuntimeSession:'e6b9479e25bb6a02b052282b409059f957a4cb3c44cc7255c0f3365bea039dcf'};
const source=await readFile(new URL('./current-runtime-host.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('host.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
for(const [name,hash] of Object.entries(originalHashes))test('P08 exact original function AST text unchanged: '+name,()=>assert.equal(H(functions.get(name)),hash));
test('scaled published verifier differs only in explicit brand, balances and107 cursor; old body untouched',()=>{
 const scaled=functions.get('verifyPublishedScaledReferenceState').replace('verifyPublishedScaledReferenceState','verifyPublishedReferenceState').replace('assertScaledFixture(fixtureInput)','assertFixture(fixtureInput)').replace('verifyScaledReferenceBalances(query, fixture)','verifyReferenceBalances(query, fixture)').replace('originalCheckpointCursor: 107','originalCheckpointCursor: 10');assert.equal(scaled,functions.get('verifyPublishedReferenceState'));
});
test('source profiles are private frozen maps; original335 and339 both still select original105 source functions',()=>{
 assert.match(source,/const ORIGINAL_REFERENCE_FUNCTIONS = Object\.freeze\(\{ build: buildReferenceFixture, seed: seedNewReference,/);
 assert.match(source,/seedEvidenceName: 'reference105-seed-acknowledged\.json', publication: createReferencePublication/);
 assert.match(source,/ORIGINAL_335_PREPARATION = Object\.freeze\(\{ assertPolicy: assertFinitePolicy, renderGrants: renderFiniteGrants, reference: ORIGINAL_REFERENCE_FUNCTIONS \}\)/);
 assert.match(source,/ALIAS4_339_PREPARATION = Object\.freeze\(\{ assertPolicy: assertAliasFourReadPolicy, renderGrants: renderAliasFourGrants, reference: ORIGINAL_REFERENCE_FUNCTIONS \}\)/);
 assert.match(source,/SCALED_ALIAS4_339_PREPARATION = Object\.freeze\(\{ assertPolicy: assertAliasFourReadPolicy, renderGrants: renderAliasFourGrants, reference: SCALED_REFERENCE_FUNCTIONS \}\)/);
 for(const stmt of ast.statements)if(ts.isVariableStatement(stmt)&&stmt.declarationList.declarations.some(d=>/PREPARATION|REFERENCE_FUNCTIONS/.test(d.name.getText(ast))))assert.ok(!stmt.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
 assert.equal(functions.get('preparePublishedScaledReferenceAlias4'),'export async function preparePublishedScaledReferenceAlias4(input) {\n  return await prepareReferenceOnProfile(input, SCALED_ALIAS4_339_PREPARATION);\n}');
});
function published(f){return {status:'IMPORTED',source_name:f.commands[0].sourceName,source_manifest_ref:f.commands[0].sourceManifestRef,source_hash:f.commands[0].sourceHash,inventory_mode:'CUTOFF_STOCK_BASELINE',checkpoint:f.checkpoints[3],cutoff_at:f.cutoffAt.slice(0,-1)+'000Z',history_expected_counts:null,history_payload_hash:null};}
function balances(f){return f.baselines.map(b=>({warehouse_id:b.warehouseId,sku_id:b.skuId,quantity:b.quantity,version:1,last_operation_id:f.expectedResults[2].operationId})).sort((a,b)=>a.warehouse_id<b.warehouse_id?-1:a.warehouse_id>b.warehouse_id?1:a.sku_id<b.sku_id?-1:a.sku_id>b.sku_id?1:0);}
test('new profile reads exact303 published source then all balances; four known values and196 absences remain distinct',async()=>{
 const f=buildScaledReferenceFixture(),calls=[];const got=await verifyPublishedScaledReferenceState(async(sql,values)=>{calls.push([sql,values]);if(sql===PUBLISHED_REFERENCE_STATE_SQL){assert.deepEqual(values,[f.batchId]);return{rows:[published(f)]};}assert.equal(sql,SCALED_REFERENCE_BALANCES_SQL);return{rows:balances(f)};},f);
 assert.equal(calls.length,2);assert.deepEqual(got,{originalBatchPublished:true,originalCheckpointSequence:3,originalCheckpointCursor:107,originalBalances:{nonzeroRows:4,absentSourcePairs:196,completeWarehouseSkuPairs:200,matchedSource:true,phase:'MUST_BE_CHECKED_BEFORE_ORIGINAL_PUBLISH_NOT_AFTER_ONLY',publicationOrRuntimeApproval:false},additionalNativeProductSkuIdsForbidden:false,authority:'NONE'});
});
test('old and scaled fixture brands cannot cross, clone or expose getter-backed runtime queries',async()=>{
 const old=buildReferenceFixture(),scaled=buildScaledReferenceFixture(),q=()=>assert.fail('must reject before query');await assert.rejects(verifyPublishedReferenceState(q,scaled));for(const bad of [old,{...scaled},JSON.parse(JSON.stringify(scaled,(_k,v)=>typeof v==='bigint'?v.toString():v)),{}])await assert.rejects(verifyPublishedScaledReferenceState(q,bad));
});
test('scaled published batch rejects source, publication, checkpoint and unknown-history drift before balance SQL',async()=>{
 const f=buildScaledReferenceFixture();for(const mutate of [r=>r.status='VALIDATING',r=>r.source_name='foreign',r=>r.source_manifest_ref='foreign',r=>r.source_hash='0'.repeat(64),r=>r.inventory_mode='other',r=>r.cutoff_at=null,r=>r.history_expected_counts={},r=>r.history_payload_hash='x',r=>r.checkpoint={...r.checkpoint,cursor:10}]){const row=structuredClone(published(f));mutate(row);let calls=0;await assert.rejects(verifyPublishedScaledReferenceState(async sql=>{calls++;assert.equal(sql,PUBLISHED_REFERENCE_STATE_SQL);return{rows:[row]};},f));assert.equal(calls,1);}
 for(const rows of [[],[published(f),published(f)]])await assert.rejects(verifyPublishedScaledReferenceState(async()=>({rows}),f));
});
test('balance missing/unknown/extraneous/operation drift never becomes lawful zero',async()=>{
 const f=buildScaledReferenceFixture();for(const mutate of [r=>r.pop(),r=>r.push({...r[0]}),r=>r[0].quantity=null,r=>r[0].quantity='0',r=>r[0].last_operation_id=null]){const rows=balances(f);mutate(rows);await assert.rejects(verifyPublishedScaledReferenceState(async sql=>({rows:sql===PUBLISHED_REFERENCE_STATE_SQL?[published(f)]:rows}),f));}
});
test('public scaled preparation accepts no caller-supplied profile or field accessors',async()=>{
 for(const bad of [{profile:{}},{fixture:buildScaledReferenceFixture()},Object.defineProperty({},'plan',{enumerable:true,get(){assert.fail('getter read');}})])await assert.rejects(preparePublishedScaledReferenceAlias4(bad));
});
