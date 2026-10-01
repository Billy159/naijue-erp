import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {sizeMapping} from '../../../server/runtime/size-mapping.ts';
import {currentSizeMapping} from '../../../frontend/product-size-groups.mjs';
import {applyAcceptedSizeDecisions} from '../../size-mapping/accepted-size-decisions.mjs';

const json=(p:string)=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const before=json('before-user-size-audit.json');
const after=json('../../size-mapping/user-size-audit.json');
const policy=json('../../size-mapping/accepted-size-decisions.json');
const analysis=json('analysis.json');
const accepted=new Map(policy.decisions.map((r:any)=>[r.sku,r]));
const sourceFields=['sku','product','sourceGroup','sourceCode','sourceSize','color','workbookRows'];
assert.equal(after.matches.length,14864);
assert.equal(new Set(after.matches.map((r:any)=>r.sku)).size,14864);
let changed=0,unchanged=0,historicalNoSize=0;
const actualRecords=[];
for(let i=0;i<before.matches.length;i++){
 const old=before.matches[i],raw=after.matches[i],current:any=sizeMapping.get(raw.sku);
 assert.ok(current);
 for(const key of sourceFields)assert.deepEqual(raw[key],old[key],`historical ${key} preserved for ${raw.sku}`);
 const decision:any=accepted.get(raw.sku);
 if(decision){
  const target=decision.target;
  assert.equal(current.targetGroup,decision.targetGroup);
  assert.equal(current.targetSize,target[3]);
  assert.deepEqual(current.target,target);
  assert.equal(current.issue,null);
  changed++;
 }else{
  assert.deepEqual(raw,old,'out-of-scope original audit row unchanged');
  assert.deepEqual(current,currentSizeMapping(old),'out-of-scope current mapping unchanged');
  unchanged++;
 }
 if(current.sourceCode==='910'&&current.sourceSize==='无尺码'){
  assert.equal(current.targetSize,'无尺码');historicalNoSize++;
 }
 const record=analysis.records.find((r:any)=>r.sku===raw.sku);
 const expected=record.expected;
 if(expected){
  assert.equal(current.targetGroup,expected.groupId,`full audit group for ${raw.sku}`);
  assert.equal(current.targetSize,expected.name,`full audit name for ${raw.sku}`);
  if(expected.code)assert.equal(current.target[2],expected.code);
 }else assert.equal(record.status,'保留历史规格','only accepted auxiliary exceptions have no target');
 actualRecords.push({...record,currentGroupId:current.targetSize?current.targetGroup:null,storedGroupId:current.targetGroup,
  currentGroup:current.targetSize?current.target[0]:'',currentCode:current.sourceCode==='910'&&current.sourceSize==='无尺码'?'910':current.targetSize?current.target[2]:raw.sourceCode,
  currentName:current.targetSize||raw.sourceSize,mappedName:current.targetSize,rawTargetName:raw.target[3],rawNormalizedTarget:raw.targetSize,
  priorStatus:record.status,status:decision?'已同步':record.status});
}
assert.equal(changed,402);assert.equal(unchanged,14462);
const applied=applyAcceptedSizeDecisions(after.matches,policy);
assert.deepEqual(applied,after.matches,'replay does not change already synchronized data');
const reverted=applyAcceptedSizeDecisions(before.matches,policy);
assert.deepEqual(reverted,after.matches,'accepted decisions restore the correct result from the old audit');
const corrupted=structuredClone(before.matches);
corrupted.find((r:any)=>accepted.has(r.sku)).sourceCode='WRONG';
assert.throws(()=>applyAcceptedSizeDecisions(corrupted,policy),/ACCEPTED_SIZE_SOURCE_CHANGED/);
assert.throws(()=>applyAcceptedSizeDecisions(after.matches.filter((r:any)=>!accepted.has(r.sku)),policy),/ACCEPTED_SIZE_SKU_MISSING/);
const summary={revision:policy.revision,originalSkus:after.matches.length,updatedSkus:changed,unrelatedSkusUnchanged:unchanged,
 updatedProducts:new Set(policy.decisions.map((r:any)=>r.source.product)).size,pendingMappings:0,pendingGroupReviews:0,
 preservedHistoricalNoSize:historicalNoSize,retainedAuxiliaryExceptions:actualRecords.filter(r=>r.status==='保留历史规格').length,
 idempotentReplay:true,changedSourceRejected:true,missingSkuRejected:true};
writeFileSync(new URL('mapping-verification.json',import.meta.url),JSON.stringify({summary,records:actualRecords},null,2)+'\n');
console.log(JSON.stringify(summary));
