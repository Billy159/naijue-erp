import test from 'node:test';
import assert from 'node:assert/strict';
import {after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createFresh35BootstrapNetworkModel,prepareFresh35CatalogProgramModel} from './fixtures/fresh35-bootstrap-network-model.mjs';
import {loadFresh35CombinedSource,loadFresh35Admin154Source,fresh35Admin154SourceData,describeFresh35CombinedSource,resolveFresh35ReferenceInputPaths,renderFresh35CombinedSchema,combinedSha256 as hash} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const reference=process.env.FRESH35_TEST_REFERENCE_DIRECTORY??resolve(root,'reference-inputs');
const paths=await resolveFresh35ReferenceInputPaths(reference),model=await createFresh35BootstrapNetworkModel({proposalDate:'20261105'});
after(()=>model.close());
const source=await loadFresh35Admin154Source(root,{baselineDirectory:paths.baselineDirectory});
const {base,candidate}=fresh35Admin154SourceData(source);
const graph=await prepareFresh35CatalogProgramModel(model,base,paths),api=graph.catalogAPI;
const catalog=await api.buildFresh35Admin154Catalog(source,model.target,paths);
const sql=api.fresh35CombinedCatalogSql(catalog,source,model.target),descriptor=api.describeFresh35CombinedCatalog(catalog);
const getModel=s=>JSON.parse(s.guardSql.split('$combined_model$')[1]);

test('only the frozen a53 delta derives a complete 154 model while the base 152 model and every non-routine category remain exact',()=>{
 const old=getModel(api.fresh35CombinedCatalogSql(graph.catalog,base,model.target)),next=getModel(sql);
 assert.equal(old.routines.length,152);assert.equal(next.routines.length,154);assert(sql.guardSql.includes("'naijue_erp'::regnamespace)<>154"));
 assert(api.fresh35CombinedCatalogSql(graph.catalog,base,model.target).guardSql.includes("'naijue_erp'::regnamespace)<>152"));
 for(const key of Object.keys(old).filter(k=>k!=='routines'))assert.deepEqual(next[key],old[key],key);
 const changes=next.routines.filter(r=>!old.routines.some(p=>isDeepStrictEqual(p,r)));assert.equal(changes.length,6);
 for(const r of candidate.newRoutines){
  const row=next.routines.find(x=>x.signature===r.signature);assert.equal(row.bodySha256,r.sha256);assert(row.acl.every(a=>!a.startsWith('=')));
  assert.equal(row.acl.length,r.name==='standard_admin_provision_only_v1'?2:1);
 }
 for(const change of candidate.manifest.routineChanges){assert.equal(old.routines.find(r=>r.signature===change.signature)?.bodySha256,change.before);assert.equal(next.routines.find(r=>r.signature===change.signature)?.bodySha256,change.after);}
 assert.equal(descriptor.patchSqlSha256,candidate.manifest.patchSqlSha256);assert.equal(descriptor.sourceSetSha256,describeFresh35CombinedSource(source).sourceSetSha256);
 assert.equal(descriptor.predecessorModelSha256,api.describeFresh35CombinedCatalog(graph.catalog).modelSha256);
 assert.equal(descriptor.modelSha256,hash(JSON.stringify(next)));
});

test('an admin154 source cannot enter the original installer or implicit 152 compiler',async()=>{
 assert.throws(()=>renderFresh35CombinedSchema(source,{}),/ADMIN154_REQUIRES_SEPARATE_SUCCESSOR_NOT_REINSTALL/);
 await assert.rejects(api.buildFresh35CombinedCatalog(source,model.target,paths),/ADMIN154_EXPLICIT_CATALOG_REQUIRED/);
 await assert.rejects(graph.lifecycleAPI.compileFresh35CombinedProgram({source,target:model.target,catalog}),/ADMIN154_REQUIRES_SEPARATE_SUCCESSOR_NOT_REINSTALL/);
 assert.equal(getModel(api.fresh35Admin154PredecessorCatalogSql(catalog)).routines.length,152);
 assert.throws(()=>api.fresh35Admin154ControllerCatalogSql(catalog,source,model.target,'2026-11-11 01:00:00.123456+00',Date.now()+10000),/ADMIN154_CURRENT_CONTROLLER_REQUIRED/,'synthetic target cannot authorize the production controller');
});
