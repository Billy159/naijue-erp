/** The fixed SQL39 ten-body model delta, shared by both catalogue compilers. */
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const normal=s=>s.replaceAll('pg_catalog.','').replace(/\btimestamp with time zone\b/g,'timestamptz').replace(/\binteger\b/g,'int4').replace(/\bboolean\b/g,'bool').replace(/\bbigint\b/g,'int8').replace(/\s*,\s*/g,',');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_CATALOG_'+code)};
function replacement(text,before,after){need(text.split(before).length===2,'UNIQUE_FUNCTION_BODY_REQUIRED');return text.replace(before,()=>after)}
export function applyFresh35Sql39CatalogDelta(prior,specs){
 const {model,definitions,bodies}=prior;
 need(specs.length===10&&new Set(specs.map(spec=>normal(spec.signature))).size===10,'SYNTHETIC_SQL39_EXACT_TEN_REQUIRED');
 const nextDefinitions=new Map(definitions),nextBodies=new Map(bodies);
 for(const spec of specs){
  const key=normal(spec.signature),before=bodies.get(key),definition=definitions.get(key);
  need(typeof before==='string'&&typeof definition==='string'&&hash(before)===spec.beforeSha256,'SYNTHETIC_SQL39_PREDECESSOR_DIFFERS');
  const after=spec.replacements.reduce((value,[oldText,newText,occurrences=1])=>{
   need(occurrences===1,'SYNTHETIC_SQL39_REPLACEMENT_COUNT_DIFFERS');
   return replacement(value,oldText,newText);
  },before);
  need(hash(after)===spec.afterSha256,'SYNTHETIC_SQL39_ROUTINE_DIFFERS');
  nextBodies.set(key,after);nextDefinitions.set(key,replacement(definition,before,after));
 }
 const nextModel={...model,routines:model.routines.map(r=>{
  const key=normal(r.signature);
  return {...r,definitionSha256:hash(nextDefinitions.get(key)),bodySha256:hash(nextBodies.get(key))};
 })};
 need(nextModel.routines.length===154,'SYNTHETIC_SQL39_EXACT154_REQUIRED');
 return {...prior,model:nextModel,definitions:nextDefinitions,bodies:nextBodies};
}
