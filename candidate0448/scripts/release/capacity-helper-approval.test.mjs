import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as generator from './generate-release-contract.mjs';
const source='synthetic helper bytes\n';const hash=createHash('sha256').update(source).digest('hex');const other='0'.repeat(64);
const boot=(capacity,full)=>`DEPLOYMENT_CAPACITY_SHA256 = '${capacity}'\nDEPLOYMENT_FULL_SHA256 = '${full}'\n`;
test('generator approval follows actual capacityHost boot branch, not legacy FULL pin',()=>{
 assert.equal(typeof generator.requireReviewedCapacityHelper,'function','CAPACITY_BRANCH_ALIGNMENT_REQUIRED');
 const original=boot(hash,other);assert.equal(generator.requireReviewedCapacityHelper(source,original),hash);assert.equal(original,boot(hash,other));
});
test('matching old FULL never substitutes for missing, changed, duplicated or unknown capacity approval',()=>{
 assert.equal(typeof generator.requireReviewedCapacityHelper,'function','CAPACITY_BRANCH_ALIGNMENT_REQUIRED');
 for(const value of [boot(other,hash),`DEPLOYMENT_FULL_SHA256 = '${hash}'\n`,boot(hash,other)+`DEPLOYMENT_CAPACITY_SHA256 = '${hash}'\n`,boot('bad',hash),boot(hash,other)+"DEPLOYMENT_CAPACITY_SHA256='bad'\n"])
  assert.throws(()=>generator.requireReviewedCapacityHelper(source,value),/DEPLOYMENT_(?:CAPACITY_PIN|HELPER_REAPPROVAL)_REQUIRED/);
 assert.throws(()=>generator.requireReviewedCapacityHelper(source+'changed',boot(hash,other)),/REAPPROVAL/);
});
