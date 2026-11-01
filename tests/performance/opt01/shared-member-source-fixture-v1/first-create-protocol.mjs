/** SQL-protocol fake only. Original adapter executes against this map, NOT PostgreSQL/ACL/triggers. */
import assert from 'node:assert/strict';
import {PostgresNativeCatalogueImportStore26} from '../../../../adapters/postgres/src/native-catalogue-import.ts';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
const key=(entity,n)=>entity+'/'+(entity==='SIZE_GROUP_MEMBER'?n.size_group_id+'/'+n.size_id:n.id);
const tables={size:'SIZE',size_group:'SIZE_GROUP',size_group_member:'SIZE_GROUP_MEMBER',product_category:'CATEGORY',color:'COLOR',fit:'FIT',season:'SEASON'};
const equal=(a,b)=>requestHash(a)===requestHash(b);
export function firstCreateProtocol(binding){
 let state={native:new Map(),sources:new Set(),bindings:new Map()},draft,stateOpen=false;
 const stats={connects:0,releases:0,commits:0,rollbacks:0,native:0,sources:0,bindings:0,groupNonemptyChecks:0,queries:0,runtimeProofs:0};
 const result=rows=>({rows,rowCount:rows.length});
 const pool={async connect(){stats.connects++;let released=false;return {async query(sql,values=[]){
  assert.equal(released,false);stats.queries++;const numbered=[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));if(numbered.length){assert.equal(Math.max(...numbered),values.length);assert.equal(new Set(numbered).size,values.length);}
  if(sql.startsWith('BEGIN')){assert.equal(stateOpen,false);stateOpen=true;draft={native:new Map(state.native),sources:new Set(state.sources),bindings:new Map(state.bindings)};return result([]);}
  if(sql==='COMMIT'){assert.equal(stateOpen,true);state=draft;stateOpen=false;stats.commits++;return result([]);}
  if(sql==='ROLLBACK'){stateOpen=false;stats.rollbacks++;return result([]);}
  assert.equal(stateOpen,true);
  if(sql.includes('cutoff_import_lock'))return result([]);
  if(sql.includes('native-catalogue-import:schema'))return result([{installed_versions:Array.from({length:26},(_,i)=>i+1)}]);
  if(sql.includes('native-catalogue-import:batch'))return result([{id:binding.batchId,mapping_version:'V2_HISTORY_NULLABLE_1',status:'STAGED',source_hash:binding.selectionSha256,source_name:binding.fixedSourceNamespace,already_published:false}]);
  if(sql.includes('native-catalogue-import:target:')){const entity=sql.match(/target:([A-Z_]+)/)[1],n=JSON.parse(values[1]),a=draft.native.get(key(entity,n));if(a)return result([{...(entity==='SIZE_GROUP_MEMBER'?{size_group_id:a.size_group_id,size_id:a.size_id}:{id:a.id}),native_equal:equal(a,n)}]);if(['COLOR','FIT','SIZE_GROUP','SEASON'].includes(entity))assert.ok(![...draft.native].some(([k,v])=>k.startsWith(entity+'/')&&v.code===n.code),'No competing native code');return result([]);}
  if(sql.includes('native-catalogue-import:reference-target')){const entity=tables[sql.match(/FROM naijue_erp\.([a-z_]+)/)[1]],a=draft.native.get(entity+'/'+values[0]);return result(a?[{native_equal:equal(a,JSON.parse(values[1]))}]:[]);}
  if(sql.includes('native-catalogue-import:reference-binding')){const b=draft.bindings.get(values[1]+'/'+values[2]);return result(b?[{native_equal:equal(b.native_snapshot,JSON.parse(values[3]))}]:[]);}
  if(sql.includes('native-catalogue-import:binding-replay')){assert.equal(draft.bindings.has(values[1]+'/'+values[2]),false,'First-creation fixture never replays');return result([]);}
  if(sql.includes('native-catalogue-import:source-replay')){assert.equal(draft.sources.has(values[0]),false);return result([]);}
  if(sql.includes('native-catalogue-import:create:')){const entity=sql.match(/create:([A-Z_]+)/)[1],columns=sql.match(/\(([^)]+)\)\s*VALUES/)[1].split(','),n=Object.fromEntries(columns.map((c,i)=>[c,values[i]]));assert.equal(draft.native.has(key(entity,n)),false);if(entity==='SIZE_GROUP_MEMBER'){assert.ok(draft.native.has('SIZE_GROUP/'+n.size_group_id));assert.ok(draft.native.has('SIZE/'+n.size_id));}draft.native.set(key(entity,n),n);stats.native++;return result([{native_snapshot:n}]);}
  if(sql.includes('native-catalogue-import:group-member')){stats.groupNonemptyChecks++;return result([...draft.native].filter(([k,n])=>k.startsWith('SIZE_GROUP_MEMBER/')&&n.size_group_id===values[0]).slice(0,1).map(([,n])=>({size_id:n.size_id})));}
  if(sql.includes('native-catalogue-import:source-create')){assert.equal(draft.sources.has(values[0]),false);draft.sources.add(values[0]);stats.sources++;return result([{id:values[0]}]);}
  if(sql.includes('native-catalogue-import:binding-create')){const columns=sql.match(/\(([^)]+)\)\s*VALUES/)[1].split(','),b=Object.fromEntries(columns.map((c,i)=>[c,c==='native_snapshot'?JSON.parse(values[i]):values[i]]));assert.ok(draft.sources.has(b.source_row_id));assert.ok(draft.native.has(key(b.entity_type,b.native_snapshot)));draft.bindings.set(b.entity_type+'/'+b.source_key,b);stats.bindings++;return result([{source_row_id:b.source_row_id}]);}
  throw Error('Unexpected fixture SQL tag: '+sql.slice(0,90));
 },release(error){assert.equal(released,false);assert.equal(error,undefined);released=true;stats.releases++;}};}};
 const runtime={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(client,purpose){assert.equal(typeof client.query,'function');assert.equal(purpose,'IMPORT_STAGE');stats.runtimeProofs++;}};
 return {store:new PostgresNativeCatalogueImportStore26(pool,runtime),stats,state:()=>state};
}
