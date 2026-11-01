/** TEST-ONLY source-policy successor. No authority or engine action.
 * Keep original335 brand/material intact. This new brand has exactly4 added
 * source-read cells and must never be passed as an original335 policy.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertFinitePolicy,cellKey,expectedBoundaryObservations} from '../reference-compiler-cohort-v2/universe.mjs';
import {renderFiniteGrants} from '../reference-compiler-cohort-v2/render.mjs';
import {captureData,identifier} from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const SHA=x=>createHash('sha256').update(x).digest('hex');
export const ALIAS4_ADDENDUM_SHA256='f03db7a2a77197eaab6db5d80e002b5e4bcf2593c9d7638e8e1532d52eea0cb1';
const originals=new WeakMap();
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const checked=x=>{need(originals.has(x),'ORIGINAL_ALIAS4_POLICY_REQUIRED');return x;};
export function assertAliasFourReadPolicy(value){return checked(value);}

export function compileAliasFourReadPolicy(baseInput,input){
 const base=assertFinitePolicy(baseInput),args=captureData(input,['addendumText','maintenanceSourceText','schemaSourceText']);
 for(const text of Object.values(args))need(typeof text==='string'&&text.isWellFormed()&&Buffer.byteLength(text)<=1024*1024,'BOUNDED_PRIMITIVE_ALIAS4_SOURCE_TEXT_REQUIRED');
 need(SHA(args.addendumText)===ALIAS4_ADDENDUM_SHA256,'EXACT_ALIAS4_ADDENDUM_BYTES_REQUIRED');
 const addition=JSON.parse(args.addendumText);
 need(SHA(args.maintenanceSourceText)===addition.sourceEvidence[0].sha256&&SHA(args.schemaSourceText)===addition.sourceEvidence[1].sha256,'EXACT_ORIGINAL_ALIAS4_SOURCE_BYTES_REQUIRED');
 need(base.sourceMaterialSha256===addition.previousMaterialSha256&&base.sourceAddendumSha256===addition.previousAddendumSha256&&base.sourceFiniteUniverseSha256===addition.previousFiniteUniverseSha256,'EXACT_ORIGINAL335_BASIS_REQUIRED');
 assert.equal(base.directGrantCells.length,335);assert.equal(base.runtimeCells.length,4140);assert.equal(base.runtimeCells.filter(c=>c.allowed).length,335);assert.equal(base.functionExecute.length,137);
 const keys=new Set(addition.newReadCells.map(cellKey));assert.equal(keys.size,4);
 for(const key of keys){const cells=base.runtimeCells.filter(c=>cellKey(c)===key);assert.equal(cells.length,1);assert.equal(cells[0].allowed,false);}
 const cells=base.runtimeCells.map(c=>keys.has(cellKey(c))?{...c,allowed:true,basis:'EXPLICIT_SOURCE_ALIAS4_READ_ADDITION'}:c);
 assert.equal(cells.filter(c=>c.allowed).length,339);assert.equal(cells.filter((c,i)=>c.allowed===base.runtimeCells[i].allowed).length,4136);
 const direct=base.directGrantCells.concat(addition.newReadCells.map(c=>({...c,requirementId:'ALIAS4-VISIBLE-SKU-'+c.column,status:'SOURCE_READ_REQUIREMENT_NOT_GRANTED',source:[addition.sourceEvidence[0]]})));
 assert.equal(new Set(direct.map(cellKey)).size,339);
 const policy=freeze({...base,format:'SOURCE_COMPLETE_FINITE_SYNTHETIC_ALIAS4_ROLE_DESIGN_V2',status:'SOURCE_ALIAS4_DESIGN_ONLY_NOT_GRANTED_CANONICAL_REVIEW_OR_ENGINE_GO',
  sourceAliasReadAddendumSha256:ALIAS4_ADDENDUM_SHA256,originalFiniteSourceCellCount:335,directGrantCells:direct,runtimeCells:cells,
  finiteEffectiveVectorCounts:{...base.finiteEffectiveVectorCounts,allowed:446,denied:3831,directSourceGrantCells:339}});
 originals.set(policy,base);return policy;
}

/** Original335 rendered statements are an exact prefix; appended SQL is data
 * only. No target role parameter, adaptation, grant execution or grant option. */
export function renderAliasFourGrants(input){
 const policy=checked(input),base=originals.get(policy),old=renderFiniteGrants(base);
 const columns=['batch_id','canonical_sku_id','canonical_source_key','source_row_id'].map(identifier).join(',');
 const added='GRANT SELECT ('+columns+') ON TABLE naijue_erp.'+identifier('import_sku_alias')+' TO '+identifier(base.logical.runtime);
 return freeze({...old,status:'RENDERED_ALIAS4_SOURCE_DESIGN_ONLY_NOT_EXECUTED_OR_REVIEW',directSourceCells:339,
  original335StatementsExactlyRetained:true,aliasReadSourceCells:4,statements:[...old.statements,added]});
}

/** Compare complete typed MOCK/actual-supplied cells against the pre-frozen new
 * source vector, never adjust the observations or claim original335 approval.
 * Session identity/default/function/canonical review remain external duties. */
export function compareAliasFourCells(input,value){
 const policy=checked(input),observed=captureData(value,['role','cells']);
 need(observed.role===policy.logical.runtime&&Array.isArray(observed.cells)&&Object.getPrototypeOf(observed.cells)===Array.prototype&&observed.cells.length===4140&&Reflect.ownKeys(observed.cells).length===4141,'EXACT_ALIAS4_COMPLETE_CELL_OBSERVATION_REQUIRED');
 const expected=new Map(policy.runtimeCells.map(c=>[cellKey(c),c.allowed])),seen=new Set();
 for(let i=0;i<observed.cells.length;i++){
  const d=Object.getOwnPropertyDescriptor(observed.cells,String(i));need(d&&Object.hasOwn(d,'value')&&d.enumerable,'OWN_ALIAS4_CELL_DATA_REQUIRED');
  const c=captureData(d.value,['schema','relation','objectKind','column','privilege','allowed']);
  need(typeof c.schema==='string'&&typeof c.relation==='string'&&typeof c.objectKind==='string'&&(c.column===null||typeof c.column==='string')&&typeof c.privilege==='string'&&typeof c.allowed==='boolean','PRIMITIVE_ALIAS4_CELL_REQUIRED');
  const key=cellKey(c);need(expected.has(key)&&!seen.has(key),'UNKNOWN_DUPLICATE_ALIAS4_CELL');seen.add(key);
  need(c.allowed===expected.get(key),'ALIAS4_SOURCE_PRIVILEGE_EXPECTATION_MISMATCH');
 }
 need(seen.size===4140,'EXACT_ALIAS4_ALL_CELLS_REQUIRED');
 return freeze({status:'SOURCE_CELL_VECTOR_MATCH_ONLY_NOT_SESSION_OR_CANONICAL_APPROVAL',cells:4140,mismatches:0,authority:'NONE',independentlyProvesSessionRole:false});
}

/** Extend only the source EXPECTED rawACL rows, never trim/change actual rows. */
export function expectedAliasFourBoundary(input){
 const policy=checked(input),base=originals.get(policy),old=expectedBoundaryObservations(base);
 const extra=policy.directGrantCells.slice(335).map(c=>({schema:c.schema,relation:c.relation,objectKind:c.objectKind,column:c.column,privilege:c.privilege,
  grantee:base.logical.runtime,grantor:base.logical.sourceOwner,grantOption:false}));
 const grants=[...old.explicitRuntimeGrants,...extra].sort((a,b)=>cellKey(a)<cellKey(b)?-1:cellKey(a)>cellKey(b)?1:0);
 return freeze({...old,explicitRuntimeGrants:grants});
}
function closedEqual(actual,expected,where){
 if(expected===null||typeof expected!=='object'){need(typeof actual===typeof expected&&actual===expected,'ALIAS4_BOUNDARY_MISMATCH:'+where);return;}
 if(Array.isArray(expected)){
  need(Array.isArray(actual)&&Object.getPrototypeOf(actual)===Array.prototype&&actual.length===expected.length&&Reflect.ownKeys(actual).length===expected.length+1,'CLOSED_ALIAS4_BOUNDARY_ARRAY:'+where);
  for(let i=0;i<expected.length;i++){const d=Object.getOwnPropertyDescriptor(actual,String(i));need(d&&d.enumerable&&Object.hasOwn(d,'value'),'OWN_ALIAS4_BOUNDARY_DATA:'+where);closedEqual(d.value,expected[i],where+'['+i+']');}return;
 }
 const keys=Object.keys(expected),a=captureData(actual,keys);for(const k of keys)closedEqual(a[k],expected[k],where+'.'+k);
}
export function compareAliasFourBoundary(input,actual){
 closedEqual(actual,expectedAliasFourBoundary(input),'boundary');
 return freeze({status:'ALIAS4_BOUNDARY_MATCH_ONLY_NOT_CANONICAL_OR_ISSUER_REVIEW',authority:'NONE',independentlyProvesDatabaseExecution:false,originalCanonicalProbeStillRequired:true,functions:137,roleFlagRows:4});
}
