import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProductEvidencePendingCapacity} from '../adapters/postgres/src/catalogue-completeness.ts';
test('A01 unchanged count and exact UTF8 JSON byte boundaries include CREATE anchor',()=>{
 const before=null,after={name:'中文',version:1};const bytes=Buffer.byteLength(JSON.stringify([before,after]));
 assert.deepEqual(assertProductEvidencePendingCapacity({count:1023,bytes:16777216-bytes},before,after),{count:1024,bytes:16777216});
 assert.throws(()=>assertProductEvidencePendingCapacity({count:1024,bytes:0},before,after),{code:'PRODUCT_EVIDENCE_CAPACITY_EXCEEDED'});
 assert.throws(()=>assertProductEvidencePendingCapacity({count:0,bytes:16777217-bytes},before,after),{code:'PRODUCT_EVIDENCE_CAPACITY_EXCEEDED'});
 assert.deepEqual(assertProductEvidencePendingCapacity({count:0,bytes:0},before,after),{count:1,bytes});
 assert.throws(()=>assertProductEvidencePendingCapacity({count:-1,bytes:0},before,after),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});
});
