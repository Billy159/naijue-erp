"""Wire only the isolated candidate's existing source/catalog/host files."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
OP=HERE/'operation'
BASE=HERE.with_name('20261117-r3-root07-source-successor-01')/'operation'
REL='scripts/release/unified-install/batched-import-v1/'
STEM='SETTLEMENT24-CURRENT-WIRE'
PIN_PATH=REL+STEM+'-PINS.json'
def main():
 pin=hashlib.sha256((OP/PIN_PATH).read_bytes()).hexdigest()
 assets=[PIN_PATH,'adapters/postgres/patches/settlement24-current-wire-successor.sql']+[REL+STEM+'-161-'+kind+'.json'for kind in ('MODEL','BODIES','DEFINITIONS')]
 path='scripts/release/unified-install/fresh35-combined-source-v1.mjs'
 source=(BASE/path).read_text();anchor=' const entryPaths=[';assert source.count(anchor)==1
 source=source.replace(anchor,anchor+','.join(json.dumps(x)for x in assets)+',',1)
 (OP/path).write_text(source)
 path='scripts/release/unified-install/fresh35-combined-catalog-v1.mjs'
 source=(BASE/path).read_text()
 addition=r'''

// Exact approved current-wire successor over the immutable command catalog.
const settlement24ReviewSha256='PIN_SHA';
async function readSettlement24CurrentWireInputs(source){
 const {root}=fresh35CombinedSourceData(source),base=resolve(root,'scripts/release/unified-install/batched-import-v1');
 const review=await pinned(resolve(base,'SETTLEMENT24-CURRENT-WIRE-PINS.json'),settlement24ReviewSha256);
 need(review.format==='FRESH35_SETTLEMENT24_CURRENT_WIRE_SUCCESSOR_PINS_V1'
  &&review.decisionSha256==='3b04898ea9050610f83295c51075c65dfeaf95c0566a1cd834b140df1085bef6'
  &&review.predecessorCommandReviewSha256===commandSuccessorReviewSha256
  &&review.approved.rawSha256==='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05'
  &&review.approved.manifestSha256==='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
  &&review.approved.namespace==='naijue:tplus:20261102'&&review.approved.documents===24&&review.approved.settlements===26,
  'SETTLEMENT24_EXACT_SOURCE_DECISION_REQUIRED');
 const expected=['naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)',
  'naijue_erp.assert_document_migration(uuid)','naijue_erp.standard_whole_package_verify_v2(jsonb,text)'];
 need(review.changes.length===3&&review.changes.every((r,i)=>r.signature===expected[i]),'SETTLEMENT24_EXACT_THREE_ROUTINES_REQUIRED');
 const sqlPath=resolve(root,review.sqlPath);
 need(await realpath(sqlPath)===sqlPath&&hash(await readFile(sqlPath))===review.sqlSha256,'SETTLEMENT24_SQL_SOURCE_DIFFERS');
 const values=await Promise.all(['MODEL','BODIES','DEFINITIONS'].map(kind=>pinned(resolve(root,review.catalogInputs[kind].path),review.catalogInputs[kind].sha256)));
 return {review,values};
}
export async function buildFresh35Settlement24CurrentWireCatalogV1(source,target,predecessorCatalog){
 describeFresh35CombinedCatalog(predecessorCatalog);
 const prior=catalogs.get(predecessorCatalog),t=describeFresh35CombinedTarget(target);
 need(prior.source===source&&prior.target===target&&prior.descriptor.format==='FRESH35_BATCHED_COMMAND_SUCCESSOR_CATALOG_SPEC_V1',
  'SETTLEMENT24_COMMAND_PREDECESSOR_REQUIRED');
 const {review,values:[raw,bodies,definitions]}=await readSettlement24CurrentWireInputs(source);
 const model=remap(raw,{fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller});
 const expected=structuredClone(prior.model),changes=new Map(review.changes.map(r=>[r.signature,r]));
 need(expected.routines.length===161&&expected.tables.length===35&&expected.columns.length===351&&expected.indexes.length===114,
  'SETTLEMENT24_ORIGINAL_CATALOG_SHAPE_REQUIRED');
 for(const change of review.changes){
  const item=expected.routines.find(r=>normal(r.signature)===change.signature);
  need(item?.bodySha256===change.beforeBodySha256&&item.definitionSha256===change.beforeDefinitionSha256
   &&hash(prior.bodies.get(change.signature))===change.beforeBodySha256
   &&hash(prior.definitions.get(change.signature))===change.beforeDefinitionSha256,
   'SETTLEMENT24_EXACT_PREDECESSOR_ROUTINE_REQUIRED');
  item.bodySha256=change.afterBodySha256;item.definitionSha256=change.afterDefinitionSha256;
 }
 need(isDeepStrictEqual(model,expected),'SETTLEMENT24_UNRELATED_MODEL_CHANGED');
 need(Object.keys(bodies).length===161&&Object.keys(definitions).length===161,'SETTLEMENT24_EXACT161_SNAPSHOTS_REQUIRED');
 for(const [signature,body]of prior.bodies){
  const change=changes.get(signature);
  need(change?hash(bodies[signature])===change.afterBodySha256&&hash(definitions[signature])===change.afterDefinitionSha256
   :bodies[signature]===body&&definitions[signature]===prior.definitions.get(signature),
   'SETTLEMENT24_EXACT_THREE_ROUTINE_DELTA_REQUIRED');
 }
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,settlement24ReviewSha256}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_SETTLEMENT24_CURRENT_WIRE_CATALOG_SPEC_V1',sourceSetSha256,
  changes:review.changes.map(r=>({signature:r.signature,before:r.beforeBodySha256,after:r.afterBodySha256,
   beforeDefinitionSha256:r.beforeDefinitionSha256,afterDefinitionSha256:r.afterDefinitionSha256})),
  predecessorModelSha256:prior.descriptor.modelSha256,modelSha256:hash(JSON.stringify(model)),patchSqlSha256:review.sqlSha256,
  successorPinsSha256:settlement24ReviewSha256,changedRoutineCount:3,guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,bodies:new Map(Object.entries(bodies)),definitions:new Map(Object.entries(definitions)),
  sql,observation,baseCatalog:predecessorCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 // All five new assets are in the original source-pin mechanism. The recursive
 // check preserves the old one-routine command-catalog assertions unchanged.
 await assertFresh35CombinedCatalogCurrent(token);return token;
}
'''.replace('PIN_SHA',pin)
 (OP/path).write_text(source+addition)
 path='tools/unified-import/fresh35-host-session.mjs';source=(BASE/path).read_text()
 anchor='buildFresh35BatchedCommandSuccessorCatalogV1,fresh35CompactZeroParentCatalog'
 assert source.count(anchor)==1
 source=source.replace(anchor,'buildFresh35BatchedCommandSuccessorCatalogV1,buildFresh35Settlement24CurrentWireCatalogV1,fresh35CompactZeroParentCatalog',1)
 anchor=' const catalog=await buildFresh35BatchedCommandSuccessorCatalogV1(source,target,predecessor),d=describeFresh35CombinedCatalog(catalog);'
 assert source.count(anchor)==1
 source=source.replace(anchor,' const command=await buildFresh35BatchedCommandSuccessorCatalogV1(source,target,predecessor);\n const catalog=await buildFresh35Settlement24CurrentWireCatalogV1(source,target,command),d=describeFresh35CombinedCatalog(catalog);',1)
 anchor=' const currentCatalog=await buildFresh35BatchedCommandSuccessorCatalogV1(c.source,c.target,currentPredecessor);'
 assert source.count(anchor)==1
 source=source.replace(anchor,' const commandCatalog=await buildFresh35BatchedCommandSuccessorCatalogV1(c.source,c.target,currentPredecessor);\n const currentCatalog=await buildFresh35Settlement24CurrentWireCatalogV1(c.source,c.target,commandCatalog);',1)
 (OP/path).write_text(source)
 print('Wired isolated source/catalog/host delta; no database code executed.')
if __name__=='__main__':main()
