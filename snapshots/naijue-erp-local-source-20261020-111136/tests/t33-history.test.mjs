import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateHistoryPlan,historyDigest,historyInstant,HistoryError} from '../server/domain/inventory/history-plan.ts';
import {compareHistoryInventory} from '../server/domain/inventory/history-reconciliation.ts';
import {createHistoryFixture,A,B,SKU,SKU2,cutoff} from '../scripts/t33/fixtures.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));mkdirSync(join(root,'outputs/T33/unit-fixtures'),{recursive:true});
const fixture=createHistoryFixture(mkdtempSync(join(root,'outputs/T33/unit-fixtures/run-')),{duplicate:true});
const fresh=()=>structuredClone(fixture.input);
const cell=(p,w,s,u='件')=>p.cells.find(c=>c.warehouseId===w&&c.originalSkuId===s&&c.measurementUnit===u);
const rejects=(f,code)=>assert.throws(f,e=>e instanceof HistoryError&&e.code===code);
const comparison=p=>({cutoff,complete:true,rows:p.cells.map(c=>({warehouseId:c.warehouseId,originalSkuId:c.originalSkuId,measurementUnit:c.measurementUnit,quantity:c.quantity,sourceRowReferences:c.eventReferences}))});

test('S01: original 10 + inbound 7 - outbound 12 = 5; report 6 cannot change calculation',()=>{
  const input=fresh();input.events=input.events.filter(e=>['in','out'].includes(e.eventId));const p=calculateHistoryPlan(input);
  assert.equal(cell(p,A,SKU).quantity,'5.0000');const original=historyDigest(p),c=comparison(p),r=structuredClone(c);
  assert.equal(compareHistoryInventory(c,r,c).matches,true);
  r.rows.find(x=>x.warehouseId===A&&x.originalSkuId===SKU&&x.measurementUnit==='件').quantity='6';
  const result=compareHistoryInventory(c,r,c);assert.equal(result.matches,false);assert.equal(result.differences[0].reportDifference,'-1.0000');assert.equal(historyDigest(p),original);
});
test('S02/S09: three proven source aliases produce one -3/+3 transfer; exact duplicates add zero',()=>{
  const p=calculateHistoryPlan(fresh());assert.equal(p.duplicateEvents,1);const e=p.events.find(e=>e.eventId==='transfer');assert.equal(e.sourceNumbers.length,3);
  assert.deepEqual(e.atCutoff.legs.map(l=>l.contributionQuantity),['-3','3']);assert.equal(cell(p,A,SKU).quantity,'2.0000');assert.equal(cell(p,B,SKU).quantity,'3.0000');
  const fewer=fresh();fewer.events.pop();assert.deepEqual(calculateHistoryPlan(fewer).cells,p.cells);
});
test('S03: equal aggregate with warehouse or original SKU swap is rejected per key',()=>{
  const c=comparison(calculateHistoryPlan(fresh())),r=structuredClone(c);
  const a=r.rows.find(x=>x.warehouseId===A&&x.originalSkuId===SKU&&x.measurementUnit==='件'),b=r.rows.find(x=>x.warehouseId===B&&x.originalSkuId===SKU);[a.quantity,b.quantity]=[b.quantity,a.quantity];
  assert.equal(compareHistoryInventory(c,r,c).differences.length,2);
  const r2=structuredClone(c),x=r2.rows.find(x=>x.warehouseId===A&&x.originalSkuId===SKU2);const y=r2.rows.find(x=>x.warehouseId===A&&x.originalSkuId===SKU&&x.measurementUnit==='件');[x.quantity,y.quantity]=[y.quantity,x.quantity];
  assert.equal(compareHistoryInventory(c,r2,c).differences.length,2);
});
test('S04: same original SKU has separate 件/双 cells and preserves negative exact decimals',()=>{
  const p=calculateHistoryPlan(fresh());assert.equal(cell(p,A,SKU,'双').quantity,'1.1250');assert.equal(cell(p,A,SKU2).quantity,'-4.0000');assert.equal(cell(p,A,SKU).measurementUnit,'件');
});
test('S05/S07: at T corrected v2 only; after-T change and inactive transfers do not enter Q(T)',()=>{
  const p=calculateHistoryPlan(fresh()),e=p.events.find(e=>e.eventId==='correction');assert.equal(e.atCutoff.stateDecision.selectedVersionId,'v2');assert.equal(e.atCutoff.legs[0].contributionQuantity,'-3');
  for(const id of ['unapproved-at-t','after-t-transfer'])assert.ok(p.events.find(e=>e.eventId===id).atCutoff.legs.every(l=>l.contributionQuantity==='0'));
  assert.equal(p.events.length,11);
});
test('S06: effective stock gain survives unknown cause; unknown state remains unresolved',()=>{
  const p=calculateHistoryPlan(fresh());assert.equal(p.events.find(e=>e.eventId==='effective-gain-cause-unknown').atCutoff.legs[0].contributionQuantity,'5');
  const bad=fresh();bad.events[0].atCutoff.stateDecision.stateAtCutoff='UNKNOWN';rejects(()=>calculateHistoryPlan(bad),'UNRESOLVED_OR_WRONG_T31_BOUNDARY');
});
test('opening already includes an earlier +10; it is not replayed after the opening boundary',()=>{
  const p=calculateHistoryPlan(fresh()),ref=cell(p,A,SKU2).eventReferences.find(r=>r.eventId==='cross-period');assert.equal(ref.fromQuantity,'10.0000');assert.equal(ref.toQuantity,'10.0000');assert.equal(ref.delta,'0.0000');
});
test('S08: missing opening, missing period or zero without proof is refused',()=>{
  const a=fresh();a.originalOpenings.shift();rejects(()=>calculateHistoryPlan(a),'MISSING_ORIGINAL_OPENING');
  const b=fresh();b.originalOpenings[0].includedPeriod.through={...b.openingBoundary,inclusive:false};rejects(()=>calculateHistoryPlan(b),'OPENING_PERIOD_OR_IDENTITY_NOT_PROVEN');
  const c=fresh();c.originalOpenings[1].evidence=[];rejects(()=>calculateHistoryPlan(c),'SOURCE_EVIDENCE_REQUIRED');
  const d=fresh();d.originalOpenings[1].quantity='1';rejects(()=>calculateHistoryPlan(d),'NO_OPENING_IS_NOT_ZERO');
});
test('source hashes, exact cutoff/timezone/inclusion and precision are contract-bound',()=>{
  for(const change of [{timezone:'UTC'},{inclusive:undefined},{at:'2020-02-01'},{at:'2020-02-30T12:00:00+08:00'}]){
    const p=fresh();p.cutoff={...p.cutoff,...change};assert.throws(()=>calculateHistoryPlan(p),HistoryError);
  }
  rejects(()=>historyInstant('2020-02-01T24:00:00+08:00'),'INVALID_HISTORY_TIME');
  const p=fresh();p.cutoff.inclusive=false;rejects(()=>calculateHistoryPlan(p),'UNRESOLVED_OR_WRONG_T31_BOUNDARY');
  const q=fresh();q.originalOpenings[0].quantity='0.00001';rejects(()=>calculateHistoryPlan(q),'SOURCE_QUANTITY_PRECISION');
  const r=fresh();r.contractSha256='0'.repeat(64);rejects(()=>calculateHistoryPlan(r),'INVALID_HISTORY_PLAN_OR_POLICY');
});
test('report fields cannot be passed as quantity input; missing/blank report rows are never zero',()=>{
  rejects(()=>calculateHistoryPlan({...fresh(),inventoryReport:{quantity:'99'}}),'UNEXPECTED_QUANTITY_INPUT');
  const c=comparison(calculateHistoryPlan(fresh())),r=structuredClone(c);r.rows[0].quantity=null;r.rows.pop();
  const d=compareHistoryInventory(c,r,c);assert.equal(d.matches,false);assert.equal(d.differences.length,2);assert.ok(d.differences.some(x=>x.blank.length));assert.ok(d.differences.some(x=>x.missing.length));
});
test('duplicate conflicts, merged identity mappings, transfer one-sided and reused version bodies are rejected',()=>{
  const p=fresh();p.events.at(-1).sourceNumbers.push('CONFLICT');rejects(()=>calculateHistoryPlan(p),'CONFLICTING_CANONICAL_EVENT');
  const q=fresh();q.mappings.filter(m=>m.kind==='SKU')[1].targetId=SKU;rejects(()=>calculateHistoryPlan(q),'AMBIGUOUS_OR_MERGED_ORIGINAL_MAPPING');
  const r=fresh();r.events.find(e=>e.eventId==='transfer').atCutoff.legs.pop();rejects(()=>calculateHistoryPlan(r),'TRANSFER_ENDPOINTS_NOT_CONSERVED');
  const s=fresh();s.events[0].atCutoff.legs[0].candidateQuantity='8';s.events[0].atCutoff.legs[0].contributionQuantity='8';rejects(()=>calculateHistoryPlan(s),'IMMUTABLE_T31_VERSION_CHANGED');
});
test('same content, different canonical event/number remains two genuine contributions',()=>{
  const fixture2=createHistoryFixture(mkdtempSync(join(root,'outputs/T33/unit-fixtures/distinct-')),{adjustEvents:events=>{
    const e=structuredClone(events[0]);e.eventId='same-content-different-number';e.sourceNumber=e.eventId;e.sourceNumbers=[e.eventId];e.sourceAliases=[{dataset:'ISOLATED_FIXTURE',number:e.eventId}];
    for(const v of e.versions)for(const l of v.lines){l.eventId=e.eventId;l.lineId=e.eventId+'-L1';}events.push(e);
  }});assert.equal(cell(calculateHistoryPlan(fixture2.input),A,SKU).quantity,'9.0000');
});
test('opening-period correction removes old included +10 and includes corrected +8 once',()=>{
  const fixture2=createHistoryFixture(mkdtempSync(join(root,'outputs/T33/unit-fixtures/period-change-')),{adjustEvents:events=>{
    const e=events.find(e=>e.eventId==='cross-period'),v=structuredClone(e.versions[0]);v.versionId='v2';for(const l of v.lines){l.versionId='v2';l.quantity='8';}e.versions.push(v);
    e.transitions.push({transitionId:'covered-period-correction',sequence:2,state:'EFFECTIVE',versionId:'v2',effectiveAt:'2020-01-15T00:00:00+08:00',evidence:e.canonicalizationEvidence});
  }});
  const p=calculateHistoryPlan(fixture2.input),c=cell(p,A,SKU2),change=c.eventReferences.find(e=>e.eventId==='cross-period');assert.equal(change.fromQuantity,'10.0000');assert.equal(change.toQuantity,'8.0000');assert.equal(change.delta,'-2.0000');assert.equal(c.quantity,'-6.0000');
});
test('the exact instant T is included/excluded as declared, selecting different transfer state',()=>{
  const fixtureAt=inclusive=>createHistoryFixture(mkdtempSync(join(root,'outputs/T33/unit-fixtures/boundary-')),{cutoff:{...cutoff,inclusive},adjustEvents:events=>{
    const e=events.find(e=>e.eventId==='transfer');e.transitions[1].effectiveAt=cutoff.at;
  }});
  const included=calculateHistoryPlan(fixtureAt(true).input),excluded=calculateHistoryPlan(fixtureAt(false).input);
  assert.equal(cell(included,A,SKU).quantity,'2.0000');assert.equal(cell(excluded,A,SKU).quantity,'5.0000');assert.equal(cell(excluded,B,SKU).quantity,'0.0000');assert.notEqual(included.manifestSha256,excluded.manifestSha256);
});
