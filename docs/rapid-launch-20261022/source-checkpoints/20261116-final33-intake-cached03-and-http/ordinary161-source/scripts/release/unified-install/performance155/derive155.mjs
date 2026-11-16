import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {derivePerformance155 as deriveEleven,normal} from './parents/20261115-r3-party-audit-key-pg-local-01/derive155.mjs';
export {normal};
const read=url=>readFile(new URL(url,import.meta.url),'utf8').then(JSON.parse);
const ten=await read('./parents/20261115-r3-party-audit-key-pg-local-01/FINAL155-CAPTURE.json');
const final=await read('./FINAL155-CAPTURE.json');
const signature='naijue_erp.is_native_party_import_insert(text,jsonb)';
const delta=final.functions.find(row=>row.signature===signature);
const sha=value=>createHash('sha256').update(value).digest('hex');
const remap=(value,roles)=>Array.isArray(value)?value.map(item=>remap(item,roles)):
 value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>{
  const next=remap(item,roles);return [key,key==='acl'&&Array.isArray(next)?next.sort():next];
 })):typeof value==='string'?Object.hasOwn(roles,value)?roles[value]:(()=>{
  const acl=value.match(/^([^=]*)=([^/]*)\/(.+)$/);return acl?(roles[acl[1]]??acl[1])+'='+acl[2]+'/'+(roles[acl[3]]??acl[3]):value;
 })():value;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const rows=value=>value.map(row=>JSON.stringify(canonical(row))).sort();

/** Original derive interface; one body/definition delta over the accepted eleven layers.
 * Preserve source/sourceSet and extra model/top-level caller fields, input Maps and original signatures.
 * FINAL155 is a derived capture, with exact actual-parent/runtime provenance in CAPTURE-PROVENANCE.json.
 */
export function derivePerformance155(input,roleNames={}) {
 const base=input.model.indexes.length===114 && input.model.routines.find(row=>normal(row.signature)===normal(signature))?.bodySha256==='d89543f7875e02c1ef202a0b63012ee6f490c0960837345394e5355f17890fbb'?{model:structuredClone(input.model),definitions:new Map(input.definitions),bodies:new Map(input.bodies)}:
  deriveEleven(input,roleNames);
 const expected=remap(ten.model,roleNames);
 assert.equal(base.model.routines.length,155);assert.equal(base.definitions.size,155);assert.equal(base.bodies.size,155);
 for(const key of Object.keys(expected)) {
  if(key==='routines')continue;
  if(Array.isArray(expected[key]))assert.deepEqual(rows(base.model[key]),rows(expected[key]),'eleven-layer category '+key);
  else assert.deepEqual(base.model[key],expected[key]);
 }
 const byKey=new Map(expected.routines.map(row=>[normal(row.signature),row]));
 const normalizedKeys=base.model.routines.map(row=>normal(row.signature));
 assert.equal(new Set(normalizedKeys).size,normalizedKeys.length,'duplicate normalized routine signature');
 assert.deepEqual([...normalizedKeys].sort(),[...byKey.keys()].sort(),'eleven-layer normalized routine signatures incomplete');
 for(const row of base.model.routines) {
  const key=normal(row.signature),wanted=byKey.get(key);
  assert.deepEqual({...row,signature:key},{...wanted,signature:key});
  assert.equal(sha(base.definitions.get(key)),row.definitionSha256);assert.equal(sha(base.bodies.get(key)),row.bodySha256);
 }
 const mapped=remap(delta.model,roleNames),key=normal(signature);
 base.model.routines=base.model.routines.map(row=>normal(row.signature)===key?{...mapped,signature:row.signature}:row);
 base.definitions.set(key,delta.definition);base.bodies.set(key,delta.body);
 assert.equal(sha(base.definitions.get(key)),mapped.definitionSha256);assert.equal(sha(base.bodies.get(key)),mapped.bodySha256);
 return {...input,...base};
}
