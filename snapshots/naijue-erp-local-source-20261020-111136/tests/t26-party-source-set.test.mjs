import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPartySplitBatches} from '../scripts/t26-party-split.mjs';

// Reuse delivered synthetic API snapshots. Do not rebuild approved lists or open a database.
const approved = JSON.parse(readFileSync(new URL('../outputs/T26/continuation-20261003/classification-package.json',import.meta.url),'utf8'));
const snapshot = JSON.parse(readFileSync(new URL('../outputs/T26/continuation-20261003/readback-receipts.json',import.meta.url),'utf8')).masters;
const fixture = () => structuredClone(snapshot);
const party = current => current.records.find(row=>row.kind==='parties'&&row.sourceFacts?.records?.length);
const additions = () => {
  const row = structuredClone(party(snapshot));
  row.id = '26000000-0000-4000-8000-000000009999';
  row.version = 0;
  row.body.code = 'NEW-SOURCE-CODE';
  row.body.name = '合成新增来源往来';
  for (const record of row.sourceFacts.records) {
    if(record.source)record.source['往来单位编码']=row.body.code;
    if(record.originalSourceRecord)record.originalSourceRecord.batch_id='SYNTHETIC-NEW-TPLUS-BATCH';
  }
  row.body.sourceFacts=structuredClone(row.sourceFacts);
  return row;
};
const reject = (current,reason,code) => assert.throws(()=>buildPartySplitBatches(approved,current),
  error=>error.code==='PARTY_SOURCE_CHANGED'&&error.differences.some(d=>d.reason===reason&&d.code===code));

test('source-backed new code refuses the old classification and reports its exact identity',()=>{
  const current=fixture(),extra=additions();current.records.push(extra);
  assert.throws(()=>buildPartySplitBatches(approved,current),error=>error.code==='PARTY_SOURCE_CHANGED'&&
    error.differences.some(d=>d.reason==='ADDED_SOURCE_IDENTITY'&&d.code===extra.body.code&&d.id===extra.id));
});

test('unchanged source set preserves five batches, exclusions, input facts and deterministic replay',()=>{
  const current=fixture(),original=structuredClone(current),packageBefore=structuredClone(approved);
  const plan=buildPartySplitBatches(approved,current);
  assert.deepEqual(plan.batches.map(b=>b.rows.length),[100,100,100,100,83]);
  assert.deepEqual(plan.counts,{supplier:222,customer:261,excluded:2});
  assert.equal(plan.excluded.length,2);
  for (const {rows} of plan.batches)for(const row of rows) {
    const original=current.records.find(r=>r.id===row.payload.id&&r.kind==='parties');
    const classification=approved.parties.find(p=>p.id===original.id);
    assert.equal(row.payload.expectedVersion,original.version);
    assert.deepEqual(row.payload.body,{...original.body,usage:[classification.role],tags:[classification.role]});
    assert.ok(!plan.excluded.some(p=>p.id===row.payload.id));
  }
  assert.deepEqual(buildPartySplitBatches(approved,current),plan);
  assert.deepEqual(current,original);assert.deepEqual(approved,packageBefore);
});

test('missing source identities report exact codes including excluded identities',()=>{
  for (const item of [approved.parties.find(p=>p.role==='supplier'),approved.parties.find(p=>p.role===null)]) {
    const current=fixture();current.records=current.records.filter(r=>r.kind!=='parties'||r.id!==item.id);
    reject(current,'MISSING_CURRENT_IDENTITY',item.code);
  }
});

test('source code replacement reports both the added code and missing old source code',()=>{
  const current=fixture(),old=party(current),code=old.body.code;old.body.code='REPLACED-SOURCE-CODE';
  assert.throws(()=>buildPartySplitBatches(approved,current),error=>error.code==='PARTY_SOURCE_CHANGED'&&
    error.differences.some(d=>d.reason==='ADDED_SOURCE_IDENTITY'&&d.code==='REPLACED-SOURCE-CODE')&&
    error.differences.some(d=>d.reason==='MISSING_CURRENT_IDENTITY'&&d.code===code));
});

test('duplicate current code and rebound source identity retain their refusal branches',()=>{
  const duplicated=fixture(),extra=structuredClone(party(duplicated));extra.id='26000000-0000-4000-8000-000000009998';
  duplicated.records.push(extra);reject(duplicated,'DUPLICATE_CURRENT_CODE',extra.body.code);
  const rebound=fixture(),row=party(rebound);row.id=extra.id;reject(rebound,'IDENTITY_REBOUND',row.body.code);
});

test('legitimate new local runtime records do not enter source-set reconciliation or get classified',()=>{
  const original=buildPartySplitBatches(approved,snapshot);
  for (const sourceFacts of [{},{records:[]},{localNote:'人工新增档案'}]) {
    const current=fixture(),local=additions();local.version=1;local.body.code='LOCAL-CREATED-CODE';
    local.sourceFacts=sourceFacts;local.body.sourceFacts=sourceFacts;current.records.push(local);
    const before=structuredClone(current);assert.deepEqual(buildPartySplitBatches(approved,current),original);
    assert.deepEqual(current,before);
  }
  // The master API permits a blank optional code for local creates; these are not source codes.
  const blankCodes=fixture();
  for(const id of ['26000000-0000-4000-8000-000000009997','26000000-0000-4000-8000-000000009996']) {
    const local=additions();local.id=id;local.version=1;local.body.code='';local.sourceFacts={};local.body.sourceFacts={};blankCodes.records.push(local);
  }
  assert.deepEqual(buildPartySplitBatches(approved,blankCodes),original);
});

test('a local record with the same code and UUID cannot substitute for missing original provenance',()=>{
  const current=fixture(),row=party(current);row.sourceFacts={};row.body.sourceFacts={};
  reject(current,'MISSING_CURRENT_IDENTITY',row.body.code);
});

test('source facts determine provenance independently of editable status or duplicated body metadata',()=>{
  const current=fixture(),extra=additions();extra.version=5;extra.body.enabled=false;
  extra.body.usage=[];extra.body.tags=[];delete extra.body.sourceFacts;current.records.push(extra);
  reject(current,'ADDED_SOURCE_IDENTITY',extra.body.code);
});
