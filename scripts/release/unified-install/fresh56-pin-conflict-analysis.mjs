/** Read-only source diagnostic. Hash-matched body literals are not a SQL parser,
 * installed catalogue, runtime reachability proof or permission to install. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh56CombinedCandidate} from './fresh56-combined-candidate.mjs';
import {loadWholeCatalogSpec} from './whole-catalog-gate.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function inspectPinnedBodyLiterals(sources,pins,replacements){
 need(Array.isArray(pins)&&pins.length===177&&new Set(pins.map(p=>p.signature)).size===177,'PIN_CONFLICT_EXACT_COHORT_REQUIRED');
 const found=new Map();
 for(const source of sources){
  need(typeof source.sql==='string'&&hash(source.sql)===source.sha256,'PIN_CONFLICT_SOURCE_CHANGED');
  for(const match of source.sql.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)){
   const body=match[2],bodySha256=hash(body);
   for(const pin of pins.filter(p=>p.sha256===bodySha256)){
    found.set(pin.signature,{signature:pin.signature,bodySha256,source:source.path,
     predecessorPinLiterals:replacements.filter(r=>body.includes(r.before_sha256)).map(r=>r.signature)});
   }
  }
 }
 need(found.size===177,'PIN_CONFLICT_PINNED_BODY_LITERAL_MISSING');
 return [...found.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
}
export async function analyzeFresh56PinConflicts(root){
 const candidate=await loadFresh56CombinedCandidate(root),spec=await loadWholeCatalogSpec(root);
 const sources=await Promise.all(spec.installation_sources.filter(p=>p.path.endsWith('.sql')).map(async p=>({...p,sql:await readFile(resolve(root,p.path),'utf8')})));
 const routines=inspectPinnedBodyLiterals(sources,spec.pins,candidate.replacements);
 const flowPaths=['apps/api/src/production-provider-composition.ts','apps/api/src/postgres-read-api.ts','adapters/postgres/src/runtime27-command-issuer.ts','adapters/postgres/src/native-import-accounting-capability.ts'];
 const flowSources=await Promise.all(flowPaths.map(async path=>{const text=await readFile(resolve(root,path),'utf8');return {path,sha256:hash(text),predecessorPinLiterals:candidate.replacements.filter(r=>text.includes(r.before_sha256)).map(r=>r.signature)};}));
 return {format:'FRESH56_PIN_CONFLICT_SOURCE_ANALYSIS_V1',sourceSetSha256:candidate.sourceSetSha256,
  routines,flowSources,lexicalOccurrenceFiles:candidate.embeddedPinOccurrences,
  literalMatchingOnly:true,installedCatalogVerified:false,runtimeReachabilityProven:false,
  installationReady:false,existingProfilesChanged:false,
  limitations:['Exact body hash matches identify content only; this is not independent parsing of CREATE/DO placement.','Top-level historical installation checks must not be repinned globally.','No caller/trigger reachability, ACL, PostgreSQL execution, or final35 retirement is inferred.']};
}
