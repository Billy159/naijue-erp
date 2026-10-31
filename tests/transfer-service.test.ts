/** SYNTHETIC transaction tests only, not real PostgreSQL or production authorization acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { quantity, version } from "../packages/domain/src/values.ts";
import { actor, draft, fixture, ids, sid } from "./support/synthetic-transfer.ts";
import type { TransferCommand, TransferDraft, TransferDocument } from "../packages/application/src/transfer-ports.ts";
const save = (value: TransferDraft = draft(), expectedVersion: number | null = null, requestKey = "save"): TransferCommand => ({ actor, action:"SAVE", requestKey, expectedVersion:expectedVersion===null?null:version(expectedVersion), draft:value });
const action = (name:"APPROVE"|"UNAPPROVE"|"VOID", expectedVersion:number, requestKey:string=name): TransferCommand => ({ actor,action:name,requestKey,expectedVersion:version(expectedVersion),transferId:ids.transfer });
test("SYNTHETIC transfer: save is stock-neutral; approve posts both endpoints with exact quantities and trusted creator", async()=>{
  const f=fixture(); const value=draft(["9007199254740993"]);
  await f.service.execute(save(value)); assert.equal(f.balance(ids.fromWarehouse),0n); assert.equal(f.balance(ids.toWarehouse),0n);
  const h=f.document().header; assert.equal(h.createdByAccountId,actor.accountId); assert.equal(h.createdHallId,actor.hallId); assert.equal(h.createdRole,actor.role);
  const result=await f.service.execute(action("APPROVE",1)); assert.equal(result.status,"APPROVED"); assert.equal(result.ledgerEntryIds.length,2);
  assert.equal(f.balance(ids.fromWarehouse),-9007199254740993n); assert.equal(f.balance(ids.toWarehouse),9007199254740993n);
  const ledger=f.store.snapshot().ledger; assert.equal(ledger[0]?.skuId,ledger[1]?.skuId); assert.equal(ledger.reduce((s,l)=>s+l.quantityDelta,0n),0n);
});
test("SYNTHETIC transfer: same-SKU multiple actual lines retain identity and each two-ended effect",async()=>{
  const f=fixture(); await f.service.execute(save(draft(["2","3"]))); await f.service.execute(action("APPROVE",1));
  assert.equal(f.balance(ids.fromWarehouse),-5n); assert.equal(f.balance(ids.toWarehouse),5n); assert.equal(f.store.snapshot().ledger.length,4);
  assert.equal(f.store.snapshot().balances.get(JSON.stringify([ids.fromWarehouse,ids.sku]))?.version,3);
  assert.deepEqual(f.document().lines.map(l=>l.id),[ids.line,ids.line2]);
});
test("SYNTHETIC transfer: approve/unapprove/edit/reapprove exactly reverses old effects before new quantities",async()=>{
  const f=fixture(); await f.service.execute(save()); await f.service.execute(action("APPROVE",1)); await f.service.execute(action("UNAPPROVE",2));
  assert.equal(f.balance(ids.fromWarehouse),0n); assert.equal(f.balance(ids.toWarehouse),0n);
  await f.service.execute(save(draft(["3"]),3,"edit")); assert.equal(f.balance(ids.fromWarehouse),0n);
  await f.service.execute(action("APPROVE",4,"approve-again")); assert.equal(f.balance(ids.fromWarehouse),-3n); assert.equal(f.balance(ids.toWarehouse),3n);
  const rows=f.store.snapshot().ledger; assert.equal(rows.length,6); assert.equal(rows.filter(l=>l.reversesEntryId!==null).length,2);
});
test("SYNTHETIC transfer: retained removed line survives edit without being reposted",async()=>{
  const f=fixture(); await f.service.execute(save(draft(["2","3"]))); await f.service.execute(save(draft(["4"]),1,"edit"));
  assert.equal(f.document().lines.length,2); assert.equal(f.document().lines.find(l=>l.id===ids.line2)?.isCurrent,false);
  await f.service.execute(action("APPROVE",2)); assert.equal(f.store.snapshot().ledger.length,2); assert.equal(f.balance(ids.fromWarehouse),-4n);
});
for(const [name,change,code] of [
  ["same warehouse",(d:TransferDraft)=>({...d,header:{...d.header,toWarehouseId:d.header.fromWarehouseId}}),"SAME_WAREHOUSE"],
  ["empty",(d:TransferDraft)=>({...d,lines:[]}),"INVALID_LINES"],
  ["zero",(d:TransferDraft)=>({...d,lines:d.lines.map(l=>({...l,quantity:quantity("0")}))}),"INVALID_TRANSFER_LINE"],
  ["negative",(d:TransferDraft)=>({...d,lines:d.lines.map(l=>({...l,quantity:quantity("-1")}))}),"INVALID_TRANSFER_LINE"],
  ["duplicate identity",(d:TransferDraft)=>({...d,lines:[...d.lines,...d.lines]}),"INVALID_TRANSFER_LINE"],
  ["duplicate position",(d:TransferDraft)=>({...d,lines:[...d.lines,{...d.lines[0]!,id:ids.line2}]}),"INVALID_TRANSFER_LINE"],
  ["foreign owner",(d:TransferDraft)=>({...d,lines:d.lines.map(l=>({...l,transferId:sid("transfer",999)}))}),"INVALID_TRANSFER_LINE"]
] as const) test(`SYNTHETIC transfer: rejects ${name} without writes`,async()=>{
  const f=fixture(); await assert.rejects(f.service.execute(save(change(draft()))),{code}); assert.equal(f.store.snapshot().transfers.size,0); assert.equal(f.store.snapshot().audit.length,0);
});
test("SYNTHETIC transfer: original-key concurrent replay returns one operation; different content conflicts",async()=>{
  const f=fixture(); const command=save(); const [a,b]=await Promise.all([f.service.execute(command),f.service.execute(command)]);
  assert.deepEqual(a,b); assert.equal(f.store.snapshot().receipts.size,1); assert.equal(f.store.snapshot().audit.length,1);
  await assert.rejects(f.service.execute(save(draft(["3"]))),{code:"IDEMPOTENCY_CONFLICT"});
  f.revokeAccess(); await assert.rejects(f.service.execute(command),{code:"FORBIDDEN"});
});
test("SYNTHETIC transfer: expectedVersion CAS and state transitions fail closed",async()=>{
  const f=fixture(); await f.service.execute(save()); await assert.rejects(f.service.execute(action("APPROVE",2)),{code:"VERSION_CONFLICT"});
  await f.service.execute(action("APPROVE",1)); await assert.rejects(f.service.execute(save(draft(),2,"edit")),{code:"INVALID_STATE"});
  await assert.rejects(f.service.execute(action("VOID",2)),{code:"INVALID_STATE"}); assert.equal(f.store.snapshot().ledger.length,2);
});
test("SYNTHETIC transfer: draft void retains facts and has no stock effects",async()=>{
  const f=fixture(); await f.service.execute(save()); const r=await f.service.execute(action("VOID",1)); assert.equal(r.status,"VOID"); assert.equal(f.document().lines.length,1);
  assert.equal(f.store.snapshot().ledger.length,0); assert.equal(f.balance(ids.fromWarehouse),0n);
});
for(const point of ["ledger:2","balance:2","document","audit","receipt"]) test(`SYNTHETIC transfer: ${point} failure rolls back both warehouses, evidence and version`,async()=>{
  const f=fixture(); await f.service.execute(save()); const before=f.store.snapshot(); f.store.failNextAt=point;
  await assert.rejects(f.service.execute(action("APPROVE",1)),/SYNTHETIC injected/); assert.deepEqual(f.store.snapshot(),before);
  await f.service.execute(action("APPROVE",1)); assert.equal(f.balance(ids.fromWarehouse),-2n); assert.equal(f.balance(ids.toWarehouse),2n);
});
test("SYNTHETIC transfer: one missing endpoint balance is NOT_READY and not implicit zero",async()=>{
  const f=fixture(); await f.service.execute(save()); f.store.removeBalance(ids.toWarehouse,ids.sku); const before=f.store.snapshot();
  await assert.rejects(f.service.execute(action("APPROVE",1)),{code:"INVENTORY_NOT_READY"}); assert.deepEqual(f.store.snapshot(),before);
});
test("SYNTHETIC transfer: input aliases cannot mutate hash or execution after first await",async()=>{
  const f=fixture(); const command=save(); const pending=f.service.execute(command); const unsafe=command as unknown as {draft:{header:{number:string};lines:{quantity:bigint}[]}};
  unsafe.draft.header.number="changed"; unsafe.draft.lines[0]!.quantity=999n; await pending;
  assert.equal(f.document().header.number,"SYNTHETIC-TRANSFER-200"); assert.equal(f.document().lines[0]?.quantity,2n);
});
test("SYNTHETIC transfer: missing or corrupted original endpoint provenance prevents reversal",async()=>{
  for(const corrupt of ["missing","endpoint","quantity","version"]){
    const f=fixture(); await f.service.execute(save()); await f.service.execute(action("APPROVE",1)); const rows=f.store.snapshot().ledger;
    f.store.replaceLedger(corrupt==="missing"?rows.slice(1):rows.map((l,i)=>i===0?corrupt==="quantity"?{...l,quantityDelta:quantity("-9")}:corrupt==="version"?{...l,sourceDocumentVersion:version(1)}:{...l,source:{kind:"TRANSFER",transferId:ids.transfer,transferLineId:ids.line,endpoint:"TO"}}:l));
    const before=f.store.snapshot(); await assert.rejects(f.service.execute(action("UNAPPROVE",2)),{code:"MISSING_POSTING_PROVENANCE"}); assert.deepEqual(f.store.snapshot(),before);
  }
});
test("SYNTHETIC transfer: cutoff history is never reversed as runtime ledger",async()=>{
  const f=fixture(); await f.service.execute(save()); f.store.seedDocument(f.document(),"CUTOFF_HISTORY"); const before=f.store.snapshot();
  await assert.rejects(f.service.execute(action("APPROVE",1)),{code:"HISTORICAL_POSTING_NOT_IMPLEMENTED"}); assert.deepEqual(f.store.snapshot(),before);
});
test("SYNTHETIC transfer policy: salesperson may approve and unapprove a visible transfer made by another salesperson",async()=>{
  const f=fixture(); await f.service.execute(save()); const other={...actor,accountId:sid("account",240)};
  f.store.seedIdentity({accountId:other.accountId,staffId:sid("staff",242),loginEnabled:true,role:"SALESPERSON",employmentStatus:"在职",hallId:ids.hall,hallEnabled:true});
  await f.service.execute({...action("APPROVE",1),actor:other}); await f.service.execute({...action("UNAPPROVE",2),actor:other}); assert.equal(f.balance(ids.fromWarehouse),0n);
});
test("SYNTHETIC transfer policy: trusted creator hall OR either endpoint hall, not creator current hall or client-selected worker",async()=>{
  const f=fixture(); await f.service.execute(save());
  for(const warehouseId of [ids.fromWarehouse,ids.toWarehouse]) f.store.seedWarehouse({id:warehouseId,hallId:ids.otherHall,enabled:true,hallEnabled:true,hasNonzeroInventory:false});
  await f.service.execute(action("APPROVE",1)); // original hall creation remains visible even after both warehouse halls differ
  const outsider={...actor,hallId:sid("hall",999)}; await assert.rejects(f.service.execute({...action("UNAPPROVE",2),actor:outsider}),{code:"FORBIDDEN"});
  f.store.seedIdentity({...f.store.snapshot().identities.get(actor.accountId)!,hallId:ids.otherHall});
  await f.service.execute({...action("UNAPPROVE",2),actor:{...actor,hallId:ids.otherHall}}); // endpoint branch
});
test("SYNTHETIC transfer policy: SAVE checks old and proposed scope, preserving original creator role/hall",async()=>{
  let calls=0; const f=fixture({authorization:{async assertAllowed(_a,_action,document,previous){calls++; if(previous&&document.header.toWarehouseId!==previous.header.toWarehouseId) throw Object.assign(new Error("scope"),{code:"FORBIDDEN"});}}});
  await f.service.execute(save()); const proposed={...draft(),header:{...draft().header,toWarehouseId:sid("warehouse",888)}};
  await assert.rejects(f.service.execute(save(proposed,1,"edit")),{code:"FORBIDDEN"}); assert.equal(calls,3); assert.equal(f.document().header.toWarehouseId,ids.toWarehouse);
});
test("SYNTHETIC transfer references: unknown/disabled SKU and disabled destination reject; disabled nonzero source exception remains",async()=>{
  const f=fixture(); f.store.seedSku({id:ids.sku,enabled:false}); await assert.rejects(f.service.execute(save()),{code:"SKU_UNAVAILABLE"});
  f.store.seedSku({id:ids.sku,enabled:true}); f.store.seedWarehouse({id:ids.toWarehouse,hallId:ids.hall,enabled:false,hallEnabled:true,hasNonzeroInventory:true});
  await assert.rejects(f.service.execute(save()),{code:"WAREHOUSE_UNAVAILABLE"}); f.store.seedWarehouse({id:ids.toWarehouse,hallId:ids.hall,enabled:true,hallEnabled:true,hasNonzeroInventory:false});
  f.store.seedWarehouse({id:ids.fromWarehouse,hallId:ids.hall,enabled:false,hallEnabled:true,hasNonzeroInventory:false}); await assert.rejects(f.service.execute(save()),{code:"WAREHOUSE_UNAVAILABLE"});
  f.store.seedWarehouse({id:ids.fromWarehouse,hallId:ids.hall,enabled:false,hallEnabled:true,hasNonzeroInventory:true}); await f.service.execute(save());
  await f.service.execute(action("APPROVE",1)); f.store.seedSku({id:ids.sku,enabled:false}); await f.service.execute(action("UNAPPROVE",2)); assert.equal(f.balance(ids.fromWarehouse),0n);
});
test("SYNTHETIC transfer: unapproval rollback preserves complete original posting",async()=>{
  const f=fixture(); await f.service.execute(save()); await f.service.execute(action("APPROVE",1)); const before=f.store.snapshot(); f.store.failNextAt="balance:2";
  await assert.rejects(f.service.execute(action("UNAPPROVE",2)),/SYNTHETIC/); assert.deepEqual(f.store.snapshot(),before);
});

test("SYNTHETIC transfer: audit stores only actual changed-line deltas, never unchanged retained document copies",async()=>{
  const f=fixture();await f.service.execute(save(draft(["2","3"])));
  let audits=f.store.snapshot().audit;assert.equal(audits[0]?.before,null);assert.equal(audits[0]?.after.lines.length,2);
  const memo={...draft(["2","3"]),header:{...draft().header,note:"memo only"}};
  await f.service.execute(save(memo,1,"memo"));audits=f.store.snapshot().audit;assert.deepEqual(audits[1]?.before?.lines,[]);assert.deepEqual(audits[1]?.after.lines,[]);
  await f.service.execute(save(draft(["4","3"]),2,"change-one"));audits=f.store.snapshot().audit;
  assert.deepEqual(audits[2]?.before?.lines.map(l=>[l.id,l.quantity]),[[ids.line,2n]]);assert.deepEqual(audits[2]?.after.lines.map(l=>[l.id,l.quantity]),[[ids.line,4n]]);
  await f.service.execute(save(draft(["4"]),3,"remove-line"));audits=f.store.snapshot().audit;
  assert.deepEqual(audits[3]?.before?.lines.map(l=>[l.id,l.isCurrent]),[[ids.line2,true]]);assert.deepEqual(audits[3]?.after.lines.map(l=>[l.id,l.isCurrent]),[[ids.line2,false]]);
  await f.service.execute(action("APPROVE",4));await f.service.execute(action("UNAPPROVE",5));await f.service.execute(action("VOID",6));audits=f.store.snapshot().audit;
  for(const audit of audits.slice(4)){assert.deepEqual(audit.before?.lines,[]);assert.deepEqual(audit.after.lines,[]);}
  assert.equal(f.document().lines.length,2);assert.equal(f.document().lines.find(l=>l.id===ids.line2)?.isCurrent,false);
});
test("SYNTHETIC transfer: same account/key/content replay survives trusted role/hall changes and rechecks current scope",async()=>{
  const f=fixture();const command=save();const committed=await f.service.execute(command);
  const current=f.store.snapshot().identities.get(actor.accountId)!;
  // A caller-only role change is not a real current-identity change and must fail closed.
  await assert.rejects(f.service.execute({...command,actor:{...actor,role:"ADMIN",hallId:null}}),{code:"FORBIDDEN"});
  f.store.seedIdentity({...current,role:"ADMIN",hallId:null,hallEnabled:null});
  assert.deepEqual(await f.service.execute({...command,actor:{...actor,role:"ADMIN",hallId:null}}),committed);
  f.store.seedIdentity({...current,hallId:ids.otherHall,hallEnabled:true});
  await assert.rejects(f.service.execute({...command,actor:{...actor,hallId:ids.otherHall}}),{code:"FORBIDDEN"});
  assert.equal(f.store.snapshot().receipts.size,1);assert.equal(f.store.snapshot().audit.length,1);
});

test("SYNTHETIC transfer references: disabled SKU SAVE may retain/reduce trusted prior aggregate but cannot increase, move endpoints or approve",async()=>{
  const f=fixture();await f.service.execute(save(draft(["5"])));f.store.seedSku({id:ids.sku,enabled:false});
  await f.service.execute(save(draft(["2","3"]),1,"split-retain"));assert.equal(f.document().lines.filter(l=>l.isCurrent).reduce((sum,l)=>sum+l.quantity,0n),5n);
  await assert.rejects(f.service.execute(save(draft(["3","3"]),2,"increase")),{code:"SKU_UNAVAILABLE"});
  const warehouse=sid("warehouse",987);f.store.seedWarehouse({id:warehouse,hallId:ids.hall,enabled:true,hallEnabled:true,hasNonzeroInventory:false});
  await assert.rejects(f.service.execute(save({...draft(["2","3"]),header:{...draft().header,toWarehouseId:warehouse}},2,"move")),{code:"SKU_UNAVAILABLE"});
  await f.service.execute(save(draft(["1","2"]),2,"reduce"));await assert.rejects(f.service.execute(action("APPROVE",3)),{code:"SKU_UNAVAILABLE"});
  assert.equal(f.balance(ids.fromWarehouse),0n);assert.equal(f.store.snapshot().ledger.length,0);
});

test("v16 LIVE transfer responsible stays independent from creator and omission preserves same-key behavior", async () => {
  const f=fixture(), employee=sid('staff',7001), other=sid('staff',7002);
  await f.service.execute(save());
  assert.equal(f.document().header.responsibleStaffId,null);
  const selected={...draft(),header:{...draft().header,responsibleStaffId:employee}};
  const q=save(selected,1,'responsible-change'), result=await f.service.execute(q);
  assert.equal(f.document().header.responsibleStaffId,employee);
  assert.equal(f.document().header.createdByAccountId,actor.accountId);
  assert.equal(f.document().header.createdHallId,actor.hallId);
  assert.equal(f.document().header.createdRole,actor.role);
  assert.equal(f.store.snapshot().ledger.length,0);
  assert.deepEqual(await f.service.execute(q),result);
  await assert.rejects(f.service.execute(save({...selected,header:{...selected.header,responsibleStaffId:other}},1,'responsible-change')),{code:'IDEMPOTENCY_CONFLICT'});
  await f.service.execute(save(draft(),2,'legacy-omission'));
  assert.equal(f.document().header.responsibleStaffId,employee);
  const evidence=f.store.snapshot().audit.at(-2)!;
  assert.equal(evidence.before!.header.responsibleStaffId,null);
  assert.equal(evidence.after.header.responsibleStaffId,employee);
  await f.service.execute(action('APPROVE',3));
  await assert.rejects(f.service.execute(save(selected,4,'approved-refuse')),{code:'INVALID_STATE'});
});

import {parseTransferCommand as parseV16TransferCommand} from '../apps/api/src/transfer-input.ts';

test('v16 LIVE input: responsibility is an optional staff selection, never creator; explicit null clears and omission preserves',()=>{
 const body={action:'SAVE',requestKey:'v16-wire',expectedVersion:null,draft:JSON.parse(JSON.stringify(draft(),(_k,v)=>typeof v==='bigint'?v.toString():v))};
 const old=parseV16TransferCommand(body,actor);assert.equal(old.action,'SAVE');if(old.action!=='SAVE'||!('draft'in old))throw Error('Expected original draft');assert.equal(Object.hasOwn(old.draft.header,'responsibleStaffId'),false);
 const employee=sid('staff',7001), withStaff=parseV16TransferCommand({...body,draft:{...body.draft,header:{...body.draft.header,responsibleStaffId:employee}}},actor);
 if(withStaff.action!=='SAVE'||!('draft'in withStaff))throw Error('Expected original draft');assert.equal(withStaff.draft.header.responsibleStaffId,employee);
 const clear=parseV16TransferCommand({...body,draft:{...body.draft,header:{...body.draft.header,responsibleStaffId:null}}},actor);
 if(clear.action!=='SAVE'||!('draft'in clear))throw Error('Expected original draft');assert.equal(clear.draft.header.responsibleStaffId,null);
 for(const bad of ['','NOT-A-STAFF-ID'])assert.throws(()=>parseV16TransferCommand({...body,draft:{...body.draft,header:{...body.draft.header,responsibleStaffId:bad}}},actor));
 assert.throws(()=>parseV16TransferCommand({...body,draft:{...body.draft,header:{...body.draft.header,createdByAccountId:employee}}},actor));
});

import {PostgresTransferQueryReader as V16TransferReader} from '../adapters/postgres/src/transfer-query-reader.ts';
test('v16 LIVE read projection: unknown responsible stays null while creator and permission remain real',async()=>{
 for(const selected of [null,sid('staff',7001)]){
  const calls:string[]=[];let releases=0;
  const row={id:ids.transfer,number:'SYNTHETIC',business_date:'2026-10-20',from_warehouse_id:ids.fromWarehouse,to_warehouse_id:ids.toWarehouse,status:'DRAFT',version:1,created_by_account_id:actor.accountId,created_at:'2026-10-20T00:00:00Z',updated_at:'2026-10-20T00:00:00Z',responsible_staff_id:selected,responsible_name:selected===null?null:'RESPONSIBLE ONLY',created_by_name:'TRUE CREATOR',approved_by_name:null,from_warehouse_name:'FROM',to_warehouse_name:'TO',from_hall_name:'HALL1',to_hall_name:'HALL2'};
  const reader=new V16TransferReader({async connect(){return{async query(sql:string){calls.push(sql);const rows=sql.startsWith('SELECT COUNT')?[{exact_total:'1'}]:sql.startsWith('SELECT page.id')?[{transfer_id:ids.transfer,total_quantity:'2'}]:sql.startsWith('SELECT h.id')?[row]:[];return{rows,rowCount:rows.length};},release(){releases++;}};}});
  const page=await reader.readList({actor,scope:{kind:'restricted',clauses:[{createdHallId:actor.hallId!,createdRole:'SALESPERSON'}]},signal:new AbortController().signal,parameters:{filter:{startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null},page:1,pageSize:20}});
  assert.equal(page.items[0]!.responsibleStaffId,selected);assert.equal(page.items[0]!.responsibleName,selected===null?null:'RESPONSIBLE ONLY');assert.equal(page.items[0]!.createdByAccountId,actor.accountId);assert.equal(page.items[0]!.createdByName,'TRUE CREATOR');
  assert.ok(calls.some(sql=>sql.includes('LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id')));assert.ok(calls.some(sql=>sql.includes('h.created_hall_id')));assert.equal(releases,1);
 }
});

test('transfer explicit NULL clear preserves creator stock and original-key/CAS audit boundaries',async()=>{
 const f=fixture(),staff=sid('staff',7001);await f.service.execute(save({...draft(),header:{...draft().header,responsibleStaffId:staff}}));
 const original=f.document().header,cleared={...draft(),header:{...draft().header,responsibleStaffId:null}};
 const q=save(cleared,1,'transfer-clear'),r=await f.service.execute(q);assert.deepEqual(await f.service.execute(q),r);
 assert.equal(f.document().header.responsibleStaffId,null);assert.equal(f.document().header.createdByAccountId,original.createdByAccountId);
 assert.equal(f.document().header.createdHallId,original.createdHallId);assert.equal(f.document().header.createdRole,original.createdRole);
 const audit=f.store.snapshot().audit.at(-1)!;assert.equal(audit.before!.header.responsibleStaffId,staff);assert.equal(audit.after.header.responsibleStaffId,null);
 assert.equal(f.store.snapshot().ledger.length,0);assert.equal(f.balance(ids.fromWarehouse),0n);assert.equal(f.balance(ids.toWarehouse),0n);
 await assert.rejects(f.service.execute(save({...cleared,header:{...cleared.header,responsibleStaffId:staff}},1,'transfer-clear')),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(f.service.execute(save(cleared,1,'stale-clear')),{code:'VERSION_CONFLICT'});
 await f.service.execute(save(draft(),2,'after-clear-omit'));assert.equal(f.document().header.responsibleStaffId,null);
});
