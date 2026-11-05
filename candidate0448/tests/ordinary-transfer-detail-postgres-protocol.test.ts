/** Synthetic driver protocol only; no PG execution or source data. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresTransferQueryReader } from '../adapters/postgres/src/transfer-query-reader.ts';
import type { OrdinaryDocumentListOptions } from '../adapters/postgres/src/ordinary-document-list-reader.ts';
import { actor, ids, sid } from './support/synthetic-transfer.ts';
const time = "2026-10-20T12:00:00.000000Z";
const header = () => ({ responsible_staff_id: null, responsible_name: null, id: ids.transfer, number: "SYNTHETIC-ONLY", business_date: "2026-10-20", from_warehouse_id: ids.fromWarehouse, to_warehouse_id: ids.toWarehouse,
  status: "DRAFT", version: 1, note: null, created_by_account_id: ids.account, created_hall_id: ids.hall, created_role: "SALESPERSON", created_at: time,
  updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER", from_warehouse_name: "SYNTHETIC CURRENT SOURCE",
  to_warehouse_name: "SYNTHETIC CURRENT DESTINATION", from_hall_name: "SYNTHETIC CURRENT SOURCE HALL", to_hall_name: "SYNTHETIC CURRENT DESTINATION HALL", created_by_name: "SYNTHETIC CURRENT CREATOR", approved_by_name: null });
const line = () => ({ id: ids.line, transfer_id: ids.transfer, line_no: 1, sku_id: ids.sku, quantity: "9007199254740993", product_code_snapshot: "SYNTHETIC OLD CODE",
  product_name_snapshot: "SYNTHETIC OLD PRODUCT", color_name_snapshot: "SYNTHETIC OLD COLOR", fit_name_snapshot: "SYNTHETIC OLD FIT", size_name_snapshot: "SYNTHETIC OLD SIZE", barcode_snapshot: "001234560000", is_current: true });
const catalogIds = { product: sid("product", 301), color: sid("color", 302), fit: sid("fit", 303), size: sid("size", 304), size2: sid("size", 305), size3: sid("size", 306), group: sid("sizeGroup", 307) };
const sku = () => ({ category_id: sid('category',901),category_name:'SYNTHETIC CATEGORY',sku_id: ids.sku, product_id: catalogIds.product, product_code: "CURRENT-CODE", product_name: "SYNTHETIC CURRENT PRODUCT", color_id: catalogIds.color,
  color_name: "SYNTHETIC CURRENT COLOR", fit_id: catalogIds.fit, fit_name: "SYNTHETIC CURRENT FIT", size_id: catalogIds.size, size_group_id: catalogIds.group });
const member = () => ({ size_group_id: catalogIds.group, group_code: "GROUP", group_name: "SYNTHETIC CURRENT GROUP", size_id: catalogIds.size,
  size_code: null, size_name: "SYNTHETIC CURRENT SIZE", display_order: -1 });

class Client {
 calls:{sql:string;values:unknown[]}[]=[]; released=false; ready=true; hidden=false; count=1; basis='CUTOFF_HISTORY';
 identity={account_id:actor.accountId,staff_id:sid('staff',1),login_enabled:true,role:'SALESPERSON',employment_status:'在职',hall_id:actor.hallId,native_hall_id:actor.hallId,hall_enabled:true};
 async query(sql:string,values:unknown[]=[]){
  this.calls.push({sql,values});let rows:Record<string,unknown>[]=[];
  if(sql.includes('read-authorization:identity'))rows=[this.identity];
  else if(sql.includes('ordinary-detail:ready'))rows=[{business_ready:this.ready}];
  else if(sql.startsWith('SELECT h.id')){assert.match(sql,/standard_business_ready\(\)/);assert.match(sql,/b.status='IMPORTED'/);assert.match(sql,/fw.hall_id=\$\d+::uuid OR tw.hall_id=\$\d+::uuid OR \(h.created_hall_id=\$\d+::uuid AND h.created_role='SALESPERSON'\)/);assert.ok(values.includes(ids.hall));rows=this.hidden?[]:[{...header(),stock_basis:this.basis,created_by_account_id:null,created_by_name:null,created_at:null,updated_at:null,created_hall_id:null,created_role:null,unified_staff_columns:true,created_by_staff_id:null,approved_by_staff_id:null}];}
  else if(sql.includes('FROM naijue_erp.transfer_line')){assert.deepEqual(values,[ids.transfer,2001]);rows=Array.from({length:this.count},(_,i)=>({...line(),id:sid('transferLine',1000+i),line_no:i+1,product_name_snapshot:null}));}
  else if(sql.startsWith('SELECT s.id AS sku_id')){assert.deepEqual(values,[[ids.sku],20001]);rows=[sku()];}
  else if(sql.startsWith('SELECT g.id AS size_group_id')){assert.deepEqual(values,[[catalogIds.group],20001]);rows=[member()];}
  else assert.match(sql,/^(BEGIN|COMMIT|ROLLBACK)/);return {rows,rowCount:rows.length};
 }
 release(){this.released=true;}
}
const read=()=>({actor,scope:{kind:'restricted' as const,clauses:[{fromHallId:ids.hall},{toHallId:ids.hall},{createdHallId:ids.hall,createdRole:'SALESPERSON' as const}]},parameters:{transferId:ids.transfer},signal:new AbortController().signal});
function setup(c:Client,proof?:()=>Promise<unknown>){let proofs=0;const options:OrdinaryDocumentListOptions={profile:'source-confirmed-ordinary-documents-v1',databaseGeneration:'synthetic',schemaDigest:'a'.repeat(64),runtime27:{profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(client,purpose){proofs++;assert.equal(client,c);assert.equal(purpose,'ORDINARY_DOCUMENT_READ');return await proof?.() as undefined;}}};return {options,reader:new PostgresTransferQueryReader({async connect(){return c;}},options),proofs:()=>proofs};}
for(const basis of ['CUTOFF_HISTORY','RUNTIME_LEDGER'])test(`ordinary transfer detail ${basis} keeps current SKUs, exact quantity and unknown people/time`,async()=>{const c=new Client();c.basis=basis;const f=setup(c),result=await f.reader.readDetail(read());assert.equal(f.proofs(),1);assert.equal(result.stockBasis,basis);assert.equal(result.document.header.createdByAccountId,null);assert.equal(result.document.header.createdByStaffId,null);assert.equal(result.document.header.createdAt,null);assert.equal(result.document.header.updatedAt,null);assert.equal(result.references.createdByName,null);assert.equal(result.document.lines[0]!.quantity,9007199254740993n);assert.equal(result.document.lines[0]!.snapshot.productName,null);assert.equal(result.catalog.skus[0]!.skuId,ids.sku);assert.equal(result.categorySummary?.basis,basis==='CUTOFF_HISTORY'?'UNKNOWN':'CURRENT');assert.equal(c.calls.at(-1)?.sql,'COMMIT');assert.ok(c.released);assert.ok(c.calls.every(x=>!/history_|HISTORY_READ|FOR UPDATE|FOR SHARE|pg_current_xact_id/.test(x.sql)));});
test('ordinary transfer detail rejects unpublished/hidden parents and changed actor before children',async()=>{for(const mode of ['unpublished','hidden','hall','role','disabled'] as const){const c=new Client();if(mode==='unpublished')c.ready=false;if(mode==='hidden')c.hidden=true;if(mode==='hall')c.identity.hall_id=ids.otherHall;if(mode==='role')c.identity.role='ADMIN';if(mode==='disabled')c.identity.login_enabled=false;await assert.rejects(setup(c).reader.readDetail(read()),{code:mode==='unpublished'?'ORDINARY_DOCUMENTS_NOT_READY':mode==='hidden'?'DOCUMENT_NOT_FOUND':'FORBIDDEN'});assert.ok(!c.calls.some(x=>/FROM naijue_erp.transfer_line|SELECT s.id AS sku_id/.test(x.sql)));assert.equal(c.calls.at(-1)?.sql,'ROLLBACK');assert.ok(c.released);}});
test('ordinary transfer detail2000 current lines retained,2001 rejected before catalogue',async()=>{for(const count of [2000,2001]){const c=new Client();c.count=count;const result=setup(c).reader.readDetail(read());if(count===2000)assert.equal((await result).document.lines.length,2000);else{await assert.rejects(result,{code:'TRANSFER_READ_TOO_LARGE'});assert.ok(!c.calls.some(x=>x.sql.startsWith('SELECT s.id AS sku_id')));}assert.ok(c.released);}});
test('ordinary transfer detail no26/boolean capability or other-operation fallback',async()=>{const c=new Client(),f=setup(c);assert.throws(()=>new PostgresTransferQueryReader({async connect(){return c;}},{...f.options,runtime27:{profile:'EXACT26'}} as never));await assert.rejects(setup(c,async()=>true).reader.readDetail(read()));assert.ok(!c.calls.some(x=>x.sql.includes('read-authorization:identity')));const d=new Client(),r=setup(d).reader;for(const method of ['readList','readHistory','readWarehouses'] as const)await assert.rejects(r[method](read() as never),{code:'ORDINARY_DOCUMENTS_NOT_READY'});assert.equal(d.calls.length,0);});
