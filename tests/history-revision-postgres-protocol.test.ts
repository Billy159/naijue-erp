/** Scripted original-client protocol only. No PostgreSQL/installed HISTORY write proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { importedHistoryTransferHallScopeSql } from '../adapters/postgres/src/imported-history-query-reader.ts';
import { PostgresHistoryRevisionStore } from '../adapters/postgres/src/history-revision-store.ts';
import type { HistoryRevisionCommand, HistoryRevisionReceipt } from '../packages/application/src/history-revision-contracts.ts';
import type { PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { requestHash } from '../packages/application/src/request-hash.ts';
import { entityId } from '../packages/domain/src/values.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={accountId:entityId('account',id(1)),hallId:entityId('hall',id(2))};
const now='2026-10-23T12:00:00.000000Z';
const command=(kind:'sales'|'transfers'='sales'):HistoryRevisionCommand=>({kind,documentId:id(10),expectedVersion:1,
  requestKey:'history-numeric-original-key',reason:'SYNTHETIC numeric correction',lines:[{lineId:id(11),quantity:'3'}],totals:null,settlements:[]});
interface Options { projectionWriteCount?:number; multiRows?:boolean; headWriteCount?:number; kind?:'sales'|'transfers'; sourceStatus?:string; revoked?:boolean; foreignHall?:boolean; published?:boolean;
  date?:string|null; receipt?:{command:HistoryRevisionCommand;result:HistoryRevisionReceipt}; failure?:string; headVersion?:number; responsible?:string|null; missingResponsible?:boolean; effectiveDate?:string|null; missingStaff?:boolean; proposedEnabled?:boolean; proposedStock?:boolean; transferScopeResults?:readonly (boolean|null|undefined)[]; effectiveFrom?:string; effectiveTo?:string }
function protocol(options:Options={}) {
  const kind=options.kind??'sales', calls:{sql:string;values:unknown[]}[]=[],releases:unknown[]=[],proofClients:unknown[]=[];
  let sequence=100,connections=0,scopeChecks=0;
  const client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values:structuredClone(values)});let rows:Record<string,unknown>[]=[],rowCount=1;
    if(options.failure&&(options.failure==='COMMIT'?sql==='COMMIT':sql.includes(options.failure)))throw Object.assign(Error('SYNTHETIC original operation failure'),{code:'SYNTHETIC_FAULT'});
    if(sql==='BEGIN ISOLATION LEVEL READ COMMITTED'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SELECT pg_advisory_xact_lock')){}
    else if(sql.includes('history-revise:receipt'))rows=options.receipt?[{id:options.receipt.result.operationId,actor_account_id:actor.accountId,
      target_type:kind==='sales'?'HISTORY_SALES':'HISTORY_TRANSFER',target_id:id(10),action:'HISTORY_REVISE',status:'COMMITTED',
      request_hash:requestHash({actorAccountId:actor.accountId,command:options.receipt.command}),result_data:options.receipt.result}]:[];
    else if(sql.includes('history-revise:source'))rows=[{id:id(10),batch_id:id(20),version:1,source_status:options.sourceStatus??'APPROVED',
      business_date:options.date===undefined?'2020-01-02':options.date,hall_id:options.foreignHall?id(900):actor.hallId,warehouse_id:id(30),
      from_warehouse_id:id(30),to_warehouse_id:id(31),created_role_source:'SALESPERSON',created_hall_id:actor.hallId,
      created_hall_provenance:'ORIGINAL',created_by_source_key:'SYNTHETIC old staff',line_count:options.multiRows?2:1,settlement_count:kind==='sales'?1:0,
      gross_amount:'2.50',order_discount:'0.00',net_due:'2.50',document_manifest_hash:'a'.repeat(64),published_operation_id:id(21),published:options.published!==false}];
    else if(sql.includes('history-revise:identity'))rows=[{id:actor.accountId,staff_id:id(3),login_enabled:!options.revoked,role:'SALESPERSON',employment_status:'在职',hall_id:actor.hallId}];
    else if(sql.includes('history-revise:hall'))rows=[{id:actor.hallId,enabled:true}];
    else if(sql.includes('history-revise:transfer-scope'))rows=(values[0] as string[]).map(w=>({id:w,hall_id:w===id(30)?actor.hallId:id(4)}));
    else if(sql.includes('history-revise:transfer-source-scope'))rows=[{allowed:options.transferScopeResults ? options.transferScopeResults[scopeChecks++] : true}];
    else if(sql.includes('history-revise:responsible'))rows=options.missingStaff?[]:[{id:values[0]}];
    else if(sql.includes('history-revise:proposed-warehouses'))rows=(values[0] as string[]).map(id=>({id,enabled:options.proposedEnabled??true,has_nonzero_inventory:options.proposedStock??false}));
    else if(sql.includes('history-revise:head-chain'))rows=[{id:id(90),document_kind:kind==='sales'?'SALES':'TRANSFER',sales_id:kind==='sales'?id(10):null,
      transfer_id:kind==='transfers'?id(10):null,from_version:(options.headVersion??2)-1,to_version:options.headVersion,operation_id:id(91),after_facts:{businessDate:options.effectiveDate??(options.date===undefined?'2020-01-02':options.date),fromWarehouseId:options.effectiveFrom??id(30),toWarehouseId:options.effectiveTo??id(31),...(options.missingResponsible?{}:{responsibleStaffId:options.responsible??null})}}];
    else if(sql.includes('history-revise:head'))rows=options.headVersion?[{header_id:id(10),version:options.headVersion,revision_id:id(90),gross_amount:'2.50',order_discount:'0.00',net_due:'2.50'}]:[];
    else if(sql.includes('history-revise:lines'))rows=[{id:id(11),sku_id:id(12),quantity:'2',deal_price:'1.25',line_amount:'2.50',allocated_discount:null,effective_valid:true},...(options.multiRows?[{id:id(14),sku_id:id(15),quantity:'2',deal_price:'1.25',line_amount:'2.50',allocated_discount:null,effective_valid:true}]:[])];
    else if(sql.includes('history-revise:settlements'))rows=[{id:id(13),direction:'RECEIVE',amount:'2.50',effective_valid:true}];
    else if(sql.includes('history-revise:put-head')){
      // Existing installed BEFORE INSERT guard runs before an ON CONFLICT UPDATE.
      if(options.headVersion&&sql.includes('INSERT INTO'))throw Object.assign(Error('SYNTHETIC first-head insert rejected for successor revision'),{code:'40001'});
      rowCount=options.headWriteCount??1;
    }
    else if(sql.includes('history-revise:put-line')||sql.includes('history-revise:put-settlement'))rowCount=options.projectionWriteCount??(values[0] as string[]).length;
    else if(sql.includes('history-posting:ledger')){rowCount=(values[0] as string[]).length;rows=(values[0] as string[]).map(id=>({id}));}
    else if(sql.includes('history-posting:balances-')){rowCount=(values[0] as string[]).length;rows=(values[0] as string[]).map((w,i)=>({warehouse_id:w,sku_id:(values[1] as string[])[i],quantity:(values[2] as string[])[i],version:(values[3] as number[])[i]}));}
    else if(sql.startsWith('SELECT naijue_erp.inventory_key_lock')){}
    else if(sql.includes('FOR UPDATE OF b'))rows=(values[0] as string[]).map((w,i)=>({warehouse_id:w,sku_id:(values[1] as string[])[i],quantity:i===0?'10':'7',version:4,last_operation_id:null,updated_at:now}));
    else if(sql.includes('history-revise:revision')||sql.includes('history-revise:put-')||sql.includes('history-revise:audit')||sql.includes('history-revise:complete')||sql.includes('history-posting:ledger')||sql.startsWith('UPDATE naijue_erp.inventory_balance')){}
    else throw Error('Unexpected SQL: '+sql);
    return {rows,rowCount};
  },release(error?:unknown){releases.push(error);}};
  const pool:PgSalesPool={async connect(){connections++;return client;}};
  const store=new PostgresHistoryRevisionStore(pool,{async assertWriteReady(actual){assert.strictEqual(actual,client);proofClients.push(actual);},newId:()=>id(sequence++)});
  return {calls,releases,proofClients,store,client,connections:()=>connections,run:(q=command(kind))=>store.revise(actor,q,
    {dataset:'HISTORY',kind:q.kind,documentId:q.documentId,actorAccountId:actor.accountId},now,new AbortController().signal)};
}
const writes=(p:ReturnType<typeof protocol>)=>p.calls.filter(c=>/^INSERT|^UPDATE/.test(c.sql.trim())||/\/\* history-(?:revise:(?:revision|put-|audit|complete)|posting:ledger)/.test(c.sql));

test('history numeric store: amount-only correction preserves nullable allocation/source date and closes one original transaction without stock',async()=>{
  const p=protocol({date:null}),q={...command(),lines:[{lineId:id(11),lineAmount:'3.00',allocatedDiscount:null}],
    totals:{grossAmount:'3.00',orderDiscount:'0.00',netDue:'3.00'},settlements:[{settlementId:id(13),amount:'3.00'}]};
  const result=await p.run(q);assert.equal(result.version,2);assert.deepEqual(result.ledgerEntryIds,[]);
  assert.equal(p.connections(),1);assert.equal(p.calls.at(-1)!.sql,'COMMIT');assert.deepEqual(p.releases,[undefined]);
  assert.ok(p.calls.every(c=>!c.sql.includes('history-posting:')&&!c.sql.includes('inventory_balance')));
  const revision=p.calls.find(c=>c.sql.includes('history-revise:revision'))!;
  const before=JSON.parse(revision.values[10] as string),after=JSON.parse(revision.values[11] as string),proof=JSON.parse(revision.values[12] as string);
  assert.equal(before.businessDate,null);assert.equal(after.businessDate,null);assert.equal(after.lines[0].allocatedDiscount,null);
  assert.deepEqual(proof.ledgerEntryIds,[]);assert.equal(proof.publishedOperationId,id(21));assert.equal(proof.documentManifestHash,'a'.repeat(64));
  assert.ok(p.calls.every(c=>!/^UPDATE naijue_erp.history_(?:sales|transfer)_(?:header|line|settlement)\b/.test(c.sql)));
  assert.ok(p.proofClients.length>=3);
});
test('history numeric store: approved transfer posts only exact delta at both endpoints on original client',async()=>{
  const p=protocol({kind:'transfers'}),result=await p.run();
  assert.equal(result.ledgerEntryIds.length,2);
  const entries=p.calls.filter(c=>c.sql.includes('history-posting:ledger'));assert.equal(entries.length,1);
  assert.deepEqual(entries[0]!.values[2],[id(30),id(31)]);assert.deepEqual(entries[0]!.values[4],['-1','1']);
  assert.deepEqual(entries[0]!.values[6],[id(11),id(11)]);assert.deepEqual(entries[0]!.values[7],['FROM','TO']);
  assert.equal((entries[0]!.values[4] as string[]).reduce((sum,n)=>sum+BigInt(n),0n),0n);
  assert.equal(p.calls.filter(c=>c.sql==='COMMIT').length,1);assert.deepEqual(p.releases,[undefined]);
});
test('history numeric store: draft quantity has no ledger and revoked/foreign/unpublished/CAS/unknown-date cases roll back without writes',async()=>{
  const draft=protocol({sourceStatus:'DRAFT',date:null});await draft.run();assert.ok(!draft.calls.some(c=>c.sql.includes('history-posting:ledger')));
  for(const options of [{revoked:true},{foreignHall:true},{published:false},{headVersion:2},{date:null}]){
    const p=protocol(options);await assert.rejects(p.run());assert.equal(writes(p).length,0);assert.equal(p.calls.at(-1)!.sql,'ROLLBACK');assert.deepEqual(p.releases,[undefined]);
  }
});
test('history numeric store: original-key replay is before CAS but after current document authority and never duplicates effects',async()=>{
  const q=command(),result:HistoryRevisionReceipt={operationId:id(100),dataset:'HISTORY',kind:'sales',documentId:q.documentId,revisionId:id(101),version:2,ledgerEntryIds:[]};
  const p=protocol({receipt:{command:q,result},headVersion:9});assert.deepEqual(await p.run(q),result);assert.equal(writes(p).length,0);
  assert.ok(p.calls.some(c=>c.sql.includes('history-revise:head-chain'))); // Current effective permission is rechecked; original receipt still bypasses version9 CAS.
  assert.equal(p.calls.filter(c=>c.sql.includes('history-revise:put-head')).length,0);
  const revoked=protocol({receipt:{command:q,result},revoked:true});await assert.rejects(revoked.run(q),{code:'FORBIDDEN'});assert.equal(writes(revoked).length,0);
  const conflict=protocol({receipt:{command:q,result}});await assert.rejects(conflict.run({...q,reason:'different'}),{code:'IDEMPOTENCY_CONFLICT'});assert.equal(writes(conflict).length,0);
});
test('history numeric store: projection failure rolls back; uncertain COMMIT discards without misleading rollback or retry',async()=>{
  const p=protocol({sourceStatus:'DRAFT',failure:'history-revise:put-line'});await assert.rejects(p.run());assert.equal(p.calls.at(-1)!.sql,'ROLLBACK');assert.equal(p.connections(),1);
  const uncertain=protocol({sourceStatus:'DRAFT',failure:'COMMIT'});await assert.rejects(uncertain.run(),{code:'HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN'});
  assert.ok(!uncertain.calls.some(c=>c.sql==='ROLLBACK'));assert.equal(uncertain.releases.length,1);assert.ok(uncertain.releases[0] instanceof Error);assert.equal(uncertain.connections(),1);
});
test('history numeric production seam requires HISTORY_REVISION on the actual client and rejects boolean authority before BEGIN',async()=>{
  const p=protocol({sourceStatus:'DRAFT'}),purposes:string[]=[],actual:object[]=[];let sequence=800;
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(client,purpose){actual.push(client);purposes.push(purpose);}};
  const store=PostgresHistoryRevisionStore.forRuntime26({async connect(){return p.client;}},{runtime26:runtime,newId:()=>id(sequence++)}),q=command();
  await store.revise(actor,q,{dataset:'HISTORY',kind:q.kind,documentId:q.documentId,actorAccountId:actor.accountId},now,new AbortController().signal);
  assert.ok(actual.length>=3);assert.ok(actual.every(c=>c===p.client));assert.ok(purposes.every(p=>p==='HISTORY_REVISION'));
  const bad=protocol({sourceStatus:'DRAFT'}),booleanRuntime={...runtime,async assertReady(){return true;}} as unknown as NativeRuntime26Capability;
  const rejected=PostgresHistoryRevisionStore.forRuntime26({async connect(){return bad.client;}},{runtime26:booleanRuntime,newId:()=>id(sequence++)});
  await assert.rejects(rejected.revise(actor,q,{dataset:'HISTORY',kind:q.kind,documentId:q.documentId,actorAccountId:actor.accountId},now,new AbortController().signal),/boolean substitute/);
  assert.equal(bad.calls.length,0);assert.ok(bad.releases[0] instanceof Error);
  const missing=protocol(),oldReadRuntime={...runtime,async assertReady(){throw Object.assign(Error('Old read review has no numeric write purpose'),{code:'NATIVE_RUNTIME26_NOT_READY'});}};
  const unavailable=PostgresHistoryRevisionStore.forRuntime26({async connect(){return missing.client;}},{runtime26:oldReadRuntime,newId:()=>id(sequence++)});
  await assert.rejects(unavailable.revise(actor,q,{dataset:'HISTORY',kind:q.kind,documentId:q.documentId,actorAccountId:actor.accountId},now,new AbortController().signal),{code:'HISTORY_REVISION_SCHEMA_NOT_READY'});
  assert.equal(missing.calls.length,0);assert.ok(missing.releases[0] instanceof Error);
});

test('v16 HISTORY store: draft header responsibility/date/endpoints stays source-immutable stock-neutral and current references share transaction',async()=>{
 const p=protocol({kind:'transfers',sourceStatus:'DRAFT',date:null});
 const q={...command('transfers'),lines:[],header:{businessDate:'2021-04-05',fromWarehouseId:id(40),responsibleStaffId:id(41)}};
 const r=await p.run(q);assert.deepEqual(r.ledgerEntryIds,[]);
 const inserted=p.calls.find(c=>c.sql.includes('history-revise:revision'))!;
 const before=JSON.parse(inserted.values[10] as string), after=JSON.parse(inserted.values[11] as string);
 assert.equal(before.businessDate,null);assert.equal(before.responsibleStaffId,null);
 assert.equal(after.businessDate,'2021-04-05');assert.equal(after.fromWarehouseId,id(40));assert.equal(after.toWarehouseId,id(31));assert.equal(after.responsibleStaffId,id(41));
 assert.equal(inserted.values[6],actor.accountId);
 assert.ok(p.calls.some(c=>c.sql.includes('history-revise:responsible')));assert.ok(p.calls.some(c=>c.sql.includes('history-revise:proposed-warehouses')));
 assert.equal(p.calls.filter(c=>/UPDATE naijue_erp.history_(?:sales|transfer)_(?:header|line|settlement)\b|history-posting:ledger|UPDATE naijue_erp.inventory_balance/.test(c.sql)).length,0);
 assert.equal(p.calls.at(-1)!.sql,'COMMIT');assert.equal(p.connections(),1);assert.equal(p.releases.length,1);
 const missing=protocol({kind:'transfers',sourceStatus:'DRAFT',missingStaff:true});await assert.rejects(missing.run(q),{code:'HISTORY_REVISION_FOREIGN_ROW'});assert.equal(writes(missing).length,0);assert.equal(missing.calls.at(-1)!.sql,'ROLLBACK');
 const retainedDisabledFrom=protocol({kind:'transfers',sourceStatus:'DRAFT',proposedEnabled:false,proposedStock:true});await retainedDisabledFrom.run(q);
 const disabledNewTo=protocol({kind:'transfers',sourceStatus:'DRAFT',proposedEnabled:false,proposedStock:true});await assert.rejects(disabledNewTo.run({...q,header:{...q.header,toWarehouseId:id(42)}}),{code:'HISTORY_REVISION_FOREIGN_ROW'});assert.equal(writes(disabledNewTo).length,0);
});
test('v16 HISTORY store: later numeric changes retain effective responsible while legacy absent person remains unknown',async()=>{
 for(const legacy of [false,true]){
  const p=protocol({sourceStatus:'DRAFT',headVersion:2,responsible:id(41),missingResponsible:legacy,effectiveDate:'2021-04-05'});
  await p.run({...command(),expectedVersion:2});
  const call=p.calls.find(c=>c.sql.includes('history-revise:revision'))!;const before=JSON.parse(call.values[10] as string),after=JSON.parse(call.values[11] as string);
  assert.equal(before.businessDate,'2021-04-05');assert.equal(after.responsibleStaffId,legacy?null:id(41));assert.equal(before.responsibleStaffId,after.responsibleStaffId);
 }
});


test('TRANSFER_HALL_IDS revision: current and proposed endpoint authority reuse exact original source proof on the locked transaction', async () => {
  const p = protocol({ kind: 'transfers', sourceStatus: 'DRAFT', headVersion: 2, effectiveFrom: id(32), effectiveTo: id(33), transferScopeResults: [true, true] });
  const q = { ...command('transfers'), expectedVersion: 2, lines: [], header: { fromWarehouseId: id(40) } };
  await p.run(q);
  const checks = p.calls.filter(c => c.sql.includes('history-revise:transfer-source-scope'));
  assert.equal(checks.length, 2);
  assert.deepEqual(checks.map(c => c.values), [[id(10), [actor.hallId], id(32), id(33), id(20)], [id(10), [actor.hallId], id(40), id(33), id(20)]]);
  for (const check of checks) {
    assert.ok(check.sql.includes(importedHistoryTransferHallScopeSql(2, false, [3, 4]) + ' AS allowed'));
    assert.match(check.sql, /FROM naijue_erp.history_transfer_header h WHERE h.id=\$1::uuid AND h.batch_id=\$5::uuid/);
    assert.match(check.sql, /h.created_hall_provenance='ORIGINAL'/);
    assert.match(check.sql, /ch_ref.native_hall_id=h.created_hall_id/);
    assert.match(check.sql, /wr_read.target_id=h.from_warehouse_id/); assert.match(check.sql, /wr_read.target_id=h.to_warehouse_id/);
    assert.doesNotMatch(check.sql, /MIGRATION_DERIVED|responsible_staff|staff\.hall_id/);
    const at = p.calls.indexOf(check), prior = p.calls.slice(0, at).findLast(c => c.sql.includes('history-revise:transfer-scope'))!;
    assert.match(prior.sql, /FOR SHARE/); assert.deepEqual(prior.values[0], check.values.slice(2, 4));
  }
  assert.equal(p.connections(), 1); assert.equal(p.calls.at(-1)!.sql, 'COMMIT'); assert.deepEqual(p.releases, [undefined]);
  assert.equal(writes(p).filter(c => /history-posting:ledger|UPDATE naijue_erp.history_transfer_header/.test(c.sql)).length, 0);
});
test('TRANSFER_HALL_IDS revision: missing original source authority at current or proposed endpoints rejects before any revision or stock writes', async () => {
  for (const decisions of [[false], [null], [undefined], [true, false], [true, null]]) {
    const p = protocol({ kind: 'transfers', sourceStatus: 'DRAFT', transferScopeResults: decisions });
    await assert.rejects(p.run({ ...command('transfers'), lines: [], header: { fromWarehouseId: id(40) } }), { code: 'FORBIDDEN' });
    assert.equal(writes(p).length, 0); assert.equal(p.calls.at(-1)!.sql, 'ROLLBACK'); assert.equal(p.connections(), 1);
    assert.equal(p.calls.filter(c => c.sql.includes('history-revise:transfer-source-scope')).length, decisions.length);
  }
});

test('history transfer explicit NULL clear skips only staff lookup, preserves audited NULL and same transaction COMMIT',async()=>{
 const p=protocol({kind:'transfers',sourceStatus:'DRAFT',headVersion:2,responsible:id(41)});
 const q={...command('transfers'),expectedVersion:2,lines:[],header:{responsibleStaffId:null}};
 const r=await p.run(q);assert.deepEqual(r.ledgerEntryIds,[]);
 const inserted=p.calls.find(c=>c.sql.includes('history-revise:revision'))!;
 const before=JSON.parse(inserted.values[10] as string),after=JSON.parse(inserted.values[11] as string);
 assert.equal(before.responsibleStaffId,id(41));assert.equal(after.responsibleStaffId,null);assert.equal(inserted.values[6],actor.accountId);
 assert.ok(!p.calls.some(c=>c.sql.includes('history-revise:responsible')));
 assert.ok(!p.calls.some(c=>/UPDATE naijue_erp.history_(sales|transfer)_(header|line)|history-posting:ledger/.test(c.sql)));
 assert.equal(p.connections(),1);assert.equal(p.calls.at(-1)!.sql,'COMMIT');assert.equal(p.releases.length,1);
});

test('successor heads use original guard UPDATE path with identity/version/previous-revision CAS for both kinds',async()=>{
 for(const kind of ['sales','transfers'] as const){
  const p=protocol({kind,sourceStatus:'DRAFT',headVersion:2}),q={...command(kind),expectedVersion:2,...(kind==='sales'?{lines:[{lineId:id(11),dealPrice:'1.26'}],settlements:[{settlementId:id(13),amount:'2.50'}]}:{})};
  const result=await p.run(q),head=p.calls.find(c=>c.sql.includes('history-revise:put-head'))!;
  assert.equal(result.version,3);assert.match(head.sql,/UPDATE naijue_erp.history_(sales|transfer)_effective/);assert.ok(!head.sql.includes('INSERT INTO'));assert.ok(!head.sql.includes('ON CONFLICT'));
  assert.match(head.sql,/header_id=\$1::uuid AND version=\$2::integer AND revision_id=\$3::uuid/);
  assert.deepEqual(head.values.slice(0,5),[id(10),2,id(90),3,id(101)]);
  assert.deepEqual(head.values.slice(5),kind==='sales'?['2.50','0.00','2.50']:[]);assert.equal(p.calls.at(-1)!.sql,'COMMIT');
 }
});
test('first effective head remains INSERT and zero successor CAS rolls back before projection/audit/receipt completion',async()=>{
 const first=protocol({sourceStatus:'DRAFT'});await first.run();const insert=first.calls.find(c=>c.sql.includes('history-revise:put-head'))!;
 assert.match(insert.sql,/INSERT INTO/);assert.ok(!insert.sql.includes('ON CONFLICT'));assert.deepEqual(insert.values.slice(0,3),[id(10),2,id(101)]);
 for(const kind of ['sales','transfers'] as const){const p=protocol({kind,sourceStatus:'DRAFT',headVersion:2,headWriteCount:0});await assert.rejects(p.run({...command(kind),expectedVersion:2}),{code:'VERSION_CONFLICT'});
 assert.equal(p.calls.at(-1)!.sql,'ROLLBACK');assert.equal(p.calls.filter(c=>c.sql.includes('history-revise:put-line')||c.sql.includes('history-revise:audit')||c.sql.includes('history-revise:complete')).length,0);}
});
test('successor current head does not turn original-key receipt replay into another head write',async()=>{
 const q=command(),receipt:HistoryRevisionReceipt={operationId:id(60),dataset:'HISTORY',kind:'sales',documentId:id(10),revisionId:id(61),version:2,ledgerEntryIds:[]};
 const p=protocol({sourceStatus:'DRAFT',headVersion:2,receipt:{command:q,result:receipt}});assert.deepEqual(await p.run(q),receipt);
 assert.equal(writes(p).length,0);assert.equal(p.calls.filter(c=>c.sql.includes('history-revise:put-head')).length,0);assert.equal(p.calls.at(-1)!.sql,'COMMIT');
});

test('HV2-P04 batches only selected line projections preserving order and exact signed quantity strings',async()=>{
 const p=protocol({kind:'transfers',sourceStatus:'DRAFT',multiRows:true});
 const q={...command('transfers'),lines:[{lineId:id(14),quantity:'-3'},{lineId:id(11),quantity:'0'}]};
 const result=await p.run(q);assert.deepEqual(result.ledgerEntryIds,[]);
 const writes=p.calls.filter(c=>c.sql.includes('history-revise:put-line'));
 assert.equal(writes.length,1);assert.match(writes[0]!.sql,/FROM unnest\(\$1::uuid\[\],\$3::bigint\[\]\)/);
 assert.deepEqual(writes[0]!.values,[[id(14),id(11)],id(101),['-3','0']]);
 assert.equal(p.calls.filter(c=>c.sql.includes('history-revise:put-settlement')).length,0);
 assert.equal(p.calls.at(-1)!.sql,'COMMIT');assert.equal(p.connections(),1);
});
test('HV2-P04 incomplete batch write rolls back original transaction without audit or receipt',async()=>{
 const p=protocol({kind:'transfers',sourceStatus:'DRAFT',multiRows:true,projectionWriteCount:1});
 await assert.rejects(p.run({...command('transfers'),lines:[{lineId:id(14),quantity:'-3'},{lineId:id(11),quantity:'0'}]}));
 assert.equal(p.calls.at(-1)!.sql,'ROLLBACK');assert.equal(p.calls.filter(c=>c.sql.includes('history-revise:audit')||c.sql.includes('history-revise:complete')).length,0);
});
