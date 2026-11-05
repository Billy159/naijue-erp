/** Offline comparison of caller-supplied dump text with a genuine unreviewed
 * V2 source projection. Equality authenticates neither the supplied text's
 * origin nor a physical target, installation, permission or reviewed profile. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildFresh35V2SourceProjection} from './fresh35-retirement-v2-projection.mjs';
import {canonicalFresh35SchemaDump} from './fresh35-catalog-schema-diff.mjs';
import {requireFresh35EvidenceV2Analysis,assertFresh35EvidenceV2AnalysisCurrent} from './fresh35-catalog-evidence-v2-adapter.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_SCHEMA_REVIEW_'+code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const modulePath='scripts/release/unified-install/fresh35-catalog-v2-schema-review.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
const contexts=new WeakMap();
async function ownSource(root){need(typeof root==='string'&&hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_SCHEMA_REVIEW_SOURCE_DIFFERS');}
async function checkSourcePins(root,pins){for(const pin of pins)need(hash(await readFile(resolve(root,pin.path)))===pin.sha256,'SOURCE_PIN_CHANGED:'+pin.path);}
function mappingData(value,expectedKeys){
 need(value&&Object.getPrototypeOf(value)===Object.prototype,'MAPPING_FIELDS');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 need(keys.every(key=>typeof key==='string')&&keys.sort().join(',')===expectedKeys,'MAPPING_FIELDS');
 need(keys.every(key=>Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable),'MAPPING_DATA_PROPERTIES');
 return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function snapshotMapping(value){
 const top=mappingData(value,'controller,owner'),mapping={owner:mappingData(top.owner,'source,target'),controller:mappingData(top.controller,'source,target')};
 need(['owner','controller'].every(role=>['source','target'].every(key=>typeof mapping[role][key]==='string')),'MAPPING_STRING_VALUES');
 return freeze(mapping);
}
const boundaries=Object.freeze({observationOriginAuthenticated:false,physicalTargetVerified:false,roleMembershipsVerified:false,engineDependenciesVerified:false,engineVerified:false,independentSafetyReviewComplete:false,reviewedEvidenceRegistered:false,executionAuthorized:false,installationReady:false,targetAdmitted:false,hostEnabled:false,businessImportVerified:false});

/** A branded context binds comparison inputs only, never execution authority.
 * This cohort is original177 + adapter + projection + this comparison module;
 * it is distinct from the installation-candidate or guard-review cohorts. */
export async function prepareFresh35V2SchemaReview(root,analysis,identityMapping){
 requireFresh35EvidenceV2Analysis(analysis);const mapping=snapshotMapping(identityMapping);
 await ownSource(root);await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 const projection=await buildFresh35V2SourceProjection(root,analysis,mapping);
 const canonical=canonicalFresh35SchemaDump(projection.sql,projection.foreignKeyReplacements);
 const sourcePins=[...projection.sourcePins,{path:modulePath,sha256:loadedModuleSha256}].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 need(new Set(sourcePins.map(pin=>pin.path)).size===sourcePins.length,'DUPLICATE_SOURCE_PIN');
 await ownSource(root);await assertFresh35EvidenceV2AnalysisCurrent(analysis);await checkSourcePins(root,sourcePins);
 const review=freeze({format:'FRESH35_V2_SCHEMA_TEXT_REVIEW_V1',state:'UNREVIEWED_SCHEMA_TEXT_EXPECTATION',sourceBindingSha256:projection.sourceBindingSha256,projectionSourceSetSha256:projection.projectionSourceSetSha256,sourcePins,schemaReviewSourceSetSha256:hash(JSON.stringify(sourcePins)),expectedSchemaSha256:projection.sqlSha256,expectedSemanticSha256:hash(JSON.stringify(canonical)),statementOrMemberCount:canonical.length,comparisonScope:'Exact same-version schema tokens, except canonicalizer-approved outer framing/settings and seven NULL-check placements. No SQL validity or provenance proof.',...boundaries});
 contexts.set(review,{root,analysis,foreignKeyReplacements:projection.foreignKeyReplacements});
 return review;
}

/** Supplied dump text may be a local synthetic copy. Even exact equality with
 * the source must never be labeled an observed engine result or admission. */
export async function compareFresh35V2SchemaReview(review,suppliedDump){
 const context=contexts.get(review);need(context,'GENUINE_SCHEMA_REVIEW_REQUIRED');
 await ownSource(context.root);await assertFresh35EvidenceV2AnalysisCurrent(context.analysis);await checkSourcePins(context.root,review.sourcePins);
 const canonical=canonicalFresh35SchemaDump(suppliedDump,context.foreignKeyReplacements),semanticSha256=hash(JSON.stringify(canonical));
 need(semanticSha256===review.expectedSemanticSha256,'FULL_SCHEMA_METADATA_DIFFERS');
 await ownSource(context.root);await assertFresh35EvidenceV2AnalysisCurrent(context.analysis);await checkSourcePins(context.root,review.sourcePins);
 return freeze({format:'FRESH35_V2_SCHEMA_TEXT_COMPARISON_V1',state:'SCHEMA_TEXT_MATCH_NOT_OBSERVATION_OR_ADMISSION',schemaTextMatches:true,sourceBindingSha256:review.sourceBindingSha256,schemaReviewSourceSetSha256:review.schemaReviewSourceSetSha256,expectedSchemaSha256:review.expectedSchemaSha256,suppliedDumpSha256:hash(suppliedDump),semanticSha256,statementOrMemberCount:canonical.length,...boundaries});
}
