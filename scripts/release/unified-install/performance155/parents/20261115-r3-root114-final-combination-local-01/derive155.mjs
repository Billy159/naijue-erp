import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// Same interface and normalization as the existing frozen-155 derive; no sourceSet wrapper.
export const normal = signature => signature.replaceAll('pg_catalog.','')
  .replace(/\btimestamp with time zone\b/g,'timestamptz').replace(/\binteger\b/g,'int4')
  .replace(/\bboolean\b/g,'bool').replace(/\bbigint\b/g,'int8').replace(/\s*,\s*/g,',');
const sha = value => createHash('sha256').update(value).digest('hex');
const read = name => readFile(new URL(name,import.meta.url),'utf8').then(JSON.parse);
const parents = await Promise.all(['PARENT154-CAPTURE.json','FROZEN155-CAPTURE.json','WITNESS155-CAPTURE.json'].map(read));
const final = await read('FINAL155-CAPTURE.json');
function remap(value,roles) {
  if(Array.isArray(value))return value.map(item=>remap(item,roles));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>{
    const mapped=remap(item,roles);
    return [key,key==='acl'&&Array.isArray(mapped)?mapped.sort():mapped];
  }));
  if(typeof value!=='string')return value;
  if(Object.hasOwn(roles,value))return roles[value];
  const acl=value.match(/^([^=]*)=([^/]*)\/(.+)$/);
  return acl?(roles[acl[1]]??acl[1])+'='+acl[2]+'/'+(roles[acl[3]]??acl[3]):value;
}
const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const rowKey = row => JSON.stringify(canonical(row));
const equalRows = (a,b) => isDeepStrictEqual(a.map(rowKey).sort(),b.map(rowKey).sort());

/** From exact original 154, frozen seven-layer 155, or f4e 155, to final 155/114.
 * Preserve caller model source fields and its existing signature spelling/order.
 */
export function derivePerformance155({model,definitions,bodies},roleNames={}) {
  assert.ok([154,155].includes(model.routines.length));
  assert.equal(definitions.size,model.routines.length);
  assert.equal(bodies.size,model.routines.length);
  const expectedCandidates=parents.map(parent=>remap(parent.model,roleNames));
  const expected=expectedCandidates.find(candidate=>candidate.routines.length===model.routines.length&&
    equalRows(candidate.routines.map(row=>({...row,signature:normal(row.signature)})),
      model.routines.map(row=>({...row,signature:normal(row.signature)}))));
  assert.ok(expected,'input must match the original 154, frozen 155, or f4e 155 routines');
  const successor=remap(final.model,roleNames);
  const byKey=new Map(expected.routines.map(row=>[normal(row.signature),row]));
  for(const row of model.routines) {
    const key=normal(row.signature),wanted=byKey.get(key);
    assert.deepEqual({...row,signature:key},{...wanted,signature:key});
    assert.equal(sha(definitions.get(key)),row.definitionSha256);
    assert.equal(sha(bodies.get(key)),row.bodySha256);
  }
  const nextModel=structuredClone(model);
  for(const key of Object.keys(expected)) {
    if(key==='routines')continue;
    if(Array.isArray(expected[key])) {
      assert.ok(equalRows(model[key],expected[key]),'parent category differs '+key);
      const existing=new Set(expected[key].map(rowKey));
      const removed=expected[key].filter(row=>!successor[key].some(next=>isDeepStrictEqual(next,row)));
      assert.deepEqual(removed,[],'unexpected removal in '+key);
      nextModel[key].push(...successor[key].filter(row=>!existing.has(rowKey(row))));
    } else assert.deepEqual(model[key],expected[key]);
  }
  const nextByKey=new Map(successor.routines.map(row=>[normal(row.signature),row]));
  nextModel.routines=model.routines.map(row=>({...nextByKey.get(normal(row.signature)),signature:row.signature}));
  for(const row of successor.routines)if(!byKey.has(normal(row.signature)))nextModel.routines.push(row);
  const nextDefinitions=new Map(definitions),nextBodies=new Map(bodies);
  for(const row of final.functions) {
    const key=normal(row.signature);nextDefinitions.set(key,row.definition);nextBodies.set(key,row.body);
  }
  assert.equal(nextModel.routines.length,155);assert.equal(nextModel.indexes.length,114);
  assert.equal(nextDefinitions.size,155);assert.equal(nextBodies.size,155);
  for(const row of nextModel.routines) {
    const key=normal(row.signature);
    assert.equal(sha(nextDefinitions.get(key)),row.definitionSha256);
    assert.equal(sha(nextBodies.get(key)),row.bodySha256);
  }
  return {model:nextModel,definitions:nextDefinitions,bodies:nextBodies};
}
