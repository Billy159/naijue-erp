/** Pure finite synthetic ordering: no browser, server, database or real records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDocumentCreatedOrder} from './document-created-order.ts';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const key=(n,createdAt,dataset='LIVE',batchId=null)=>({documentId:id(n),createdAt,dataset,batchId});
test('creation, not a later edit or business date, is the primary key',()=>{
  const newer={...key(2,'2026-10-31T00:51:00Z'),updatedAt:'2026-10-31T00:51:00Z',businessDate:'2026-01-01'};
  const oldEdited={...key(1,'2026-10-20T00:00:00Z'),updatedAt:'2026-11-01T00:00:00Z',businessDate:'2026-12-31'};
  assert.deepEqual([oldEdited,newer].sort(compareDocumentCreatedOrder),[newer,oldEdited]);
});
test('all finite candidates are ordered before slicing; page two has no omitted or repeated identity',()=>{
  const rows=Array.from({length:45},(_,i)=>key(i+1,`2026-10-31T00:00:${String(i).padStart(2,'0')}Z`));
  const ordered=rows.toReversed().sort(compareDocumentCreatedOrder),first=ordered.slice(0,20),second=ordered.slice(20,40);
  assert.equal(first[0].documentId,id(45));assert.equal(second[0].documentId,id(25));
  assert.equal(new Set([...first,...second].map(row=>row.documentId)).size,40);
});
test('unknown historical time stays null and is not synthesized from local/business/update timestamps',()=>{
  const unknown={...key(1,null,'HISTORY',id(100)),createdLocalAt:'2099-01-01T12:00:00',businessDate:'2099-01-01',updatedAt:'2099-01-01T12:00:00Z'};
  const known=key(2,'2020-01-01T00:00:00Z');
  assert.deepEqual([unknown,known].sort(compareDocumentCreatedOrder),[known,unknown]);assert.equal(unknown.createdAt,null);
});
test('UTC fractional precision through microseconds is preserved and native composite ties are deterministic',()=>{
  const rows=[key(1,'2026-10-31T00:00:00Z'),key(2,'2026-10-31T00:00:00.000001Z'),key(3,'2026-10-31T00:00:00.001Z')];
  assert.deepEqual(rows.sort(compareDocumentCreatedOrder).map(row=>row.documentId),[id(3),id(2),id(1)]);
  const instant='2026-10-31T00:00:00.000000Z',a=key(1,instant,'HISTORY',id(100)),b=key(1,instant,'HISTORY',id(101)),c=key(1,instant,'LIVE');
  assert.deepEqual([c,b,a].sort(compareDocumentCreatedOrder),[a,b,c]);
  assert.throws(()=>compareDocumentCreatedOrder(key(1,'2026-10-31 12:00:00'),c));
});
