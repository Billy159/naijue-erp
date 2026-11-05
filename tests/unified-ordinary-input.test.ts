/** SYNTHETIC HTTP DTO decoding only. No server socket, PG, real data or publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSalesCommand } from '../apps/api/src/input.ts';
import { actor, syntheticDraft } from './support/synthetic-fixtures.ts';
function unknownDraft() {
  const d=syntheticDraft();return {...d,lines:d.lines.map(l=>({...l,pricingRule:null,zeroConfirmed:null,isGift:null,allocatedDiscount:null,
    snapshot:{...l.snapshot,productCode:null,productName:null,colorName:null,fitName:null,sizeName:null}})),settlements:d.settlements.map(s=>({...s,paymentMethodId:null}))};
}
function wire(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(_k,v:unknown)=>typeof v==='bigint'?v.toString():v));}
test('SYNTHETIC ordinary input: existing SAVE preserves structural null facts without inferred defaults',()=>{
  const parsed=parseSalesCommand(wire({action:'SAVE',requestKey:'old-memo',expectedVersion:4,draft:unknownDraft()}),actor);
  assert.ok(parsed.action==='SAVE'&&'draft' in parsed);assert.equal(parsed.draft.lines[0]?.pricingRule,null);assert.equal(parsed.draft.lines[0]?.allocatedDiscount,null);
  assert.equal(parsed.draft.lines[0]?.isGift,null);assert.equal(parsed.draft.lines[0]?.snapshot.productName,null);assert.equal(parsed.draft.settlements[0]?.paymentMethodId,null);
  assert.equal(parsed.draft.lines[0]?.quantity,2n);assert.equal(parsed.draft.lines[0]?.dealPrice,125n);
});
test('SYNTHETIC ordinary input: new SAVE still requires explicit active pricing/snapshot/method facts',()=>{
  assert.throws(()=>parseSalesCommand(wire({action:'SAVE',requestKey:'new',expectedVersion:null,draft:unknownDraft()}),actor),{code:'INVALID_HTTP_INPUT'});
});
test('SYNTHETIC ordinary input: existing null support does not relax identities, exact quantity/amount or header actor protection',()=>{
  const body={action:'SAVE',requestKey:'old-memo',expectedVersion:4,draft:unknownDraft()};
  const values=[{...body,expectedVersion:0},{...body,draft:{...body.draft,header:{...body.draft.header,createdByAccountId:actor.accountId}}},
    {...body,draft:{...body.draft,lines:body.draft.lines.map(l=>({...l,quantity:2}))}},
    {...body,draft:{...body.draft,lines:body.draft.lines.map(l=>({...l,dealPrice:null}))}},
    {...body,draft:{...body.draft,lines:body.draft.lines.map(l=>({...l,skuId:null}))}}];
  for(const invalid of values)assert.throws(()=>parseSalesCommand(wire(invalid),actor));
});
