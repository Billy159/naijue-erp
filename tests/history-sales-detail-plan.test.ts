/** Design-contract skeleton only. No sales mapper/store/authorizer implementation or SQL execution. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { v2Cents, v2Nullable, v2ApprovedCents, v2MoneyApprovalSet } from "../packages/application/src/import-v2.ts";
import type { HistorySalesLine, HistorySalesSettlement } from "../packages/application/src/history-storage-contract.ts";
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;

test("sales-detail PLAN: exact existing normalized nineteen/nine-column contracts require no guessed fields",()=>{
  const sales=IMPORT_V2_TABLES.find(t=>t.entity==="SALES_LINE")!,settle=IMPORT_V2_TABLES.find(t=>t.entity==="SETTLEMENT")!;
  assert.equal(sales.file,"business/14历史销货明细.csv");assert.equal(sales.columns.length,19);
  assert.deepEqual(sales.columns.filter(c=>c.logicalType==="MONEY").map(c=>[c.name,c.required]),[["原参考价",false],["原成交单价",true],["原行金额",true],["原分摊优惠",false]]);
  assert.equal(settle.file,"business/15历史收退记录.csv");assert.equal(settle.columns.length,9);
  assert.equal(settle.columns.find(c=>c.name==="原收款方式来源编号")?.required,false);
});
test("sales-detail PLAN: existing nullable typed DTO can preserve empty/zero/false and independent monetary facts",()=>{
  const line:HistorySalesLine={id:id(1),batchId:id(2),sourceRowId:id(3),headerId:id(4),lineNo:7,skuId:id(5),quantity:"2",
    productCodeSnapshot:"0007",productNameSnapshot:null,colorNameSnapshot:null,fitNameSnapshot:null,sizeNameSnapshot:null,barcodeSnapshot:null,
    referencePrice:null,dealPrice:"0.03",lineAmount:"0.12",allocatedDiscount:null,isGift:false,pricingMethodSource:null,discountTenths:null,ordinaryZeroConfirmed:null};
  assert.equal(v2Nullable(""),null);assert.equal(v2Nullable("0007"),"0007");assert.equal(line.isGift,false);
  assert.equal(v2Cents(line.lineAmount)-BigInt(line.quantity)*v2Cents(line.dealPrice),6n,"synthetic genuine difference stays visible; not a balancing approval");
  assert.equal(line.ordinaryZeroConfirmed,null);assert.equal(line.referencePrice,null);
});
test("settlement PLAN: original method snapshot and names remain independent of account current configuration",()=>{
  const row:HistorySalesSettlement={id:id(1),batchId:id(2),sourceRowId:id(3),headerId:id(4),lineNo:3,paymentAccountId:id(5),direction:"REFUND",amount:"0.00",
    accountNameSnapshot:"SYNTHETIC ORIGINAL ACCOUNT",methodNameSnapshot:"SYNTHETIC ORIGINAL METHOD",paymentMethodIdSnapshot:id(6)};
  const currentAccount={id:id(5),name:"SYNTHETIC RENAMED ACCOUNT",payment_method_id:id(7)};
  assert.notEqual(row.paymentMethodIdSnapshot,currentAccount.payment_method_id);assert.notEqual(row.accountNameSnapshot,currentAccount.name);
  assert.equal(row.amount,"0.00");assert.equal(row.direction,"REFUND");
});
test("sales-detail PLAN: existing cents primitive is exact, leading-zero aware and never rounds floating tails",()=>{
  assert.equal(v2Cents("0001.00"),100n);assert.equal(v2Cents("-0.06"),-6n);assert.throws(()=>v2Cents("1.00000001"));
  const supplied=Array.from({length:32},(_,i)=>({fileSha256:"a".repeat(64),sheet:"SYNTHETIC",row:String(i+1),sourceId:`SYNTHETIC-${i}`,field:"原行金额",rawValue:"1.00000001",exactCentValue:"1.00"}));
  const map=v2MoneyApprovalSet(supplied,supplied);assert.equal(v2ApprovedCents(supplied[0]!,map),100n);
  for(const changed of [{sourceId:"OTHER"},{field:"原成交单价"},{row:"99"},{fileSha256:"b".repeat(64)},{rawValue:"1.00000002"}])
    assert.throws(()=>v2ApprovedCents({...supplied[0]!,...changed},map),/MONEY_CELL_NOT_APPROVED/);
});
test("sales-detail PLAN: frozen schema already carries typed columns and payment FK; old directories do not allow payment kinds",async()=>{
  const sql=await readFile(new URL("../adapters/postgres/migrations/0011_history_storage.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE naijue_erp.history_sales_line/);assert.match(sql,/allocated_discount numeric\(18,2\), is_gift boolean/);
  assert.match(sql,/payment_method_id_snapshot uuid REFERENCES naijue_erp.payment_method\(id\)/);
  const header=await readFile(new URL("../adapters/postgres/migrations/0012_history_header_native_reference.sql",import.meta.url),"utf8");
  assert.match(header,/entity_type IN \('HALL', 'CUSTOMER', 'STAFF'\)/);
});
for(const feature of ["pure SALES_LINE mapper with full input recomputation","pure SETTLEMENT mapper with separate original-method binding",
  "independently pinned sales-detail exact reader and full source coverage","whole 32-cell approval closure without blanket tolerance",
  "actual SQL same-transaction source+sales-line INSERT","typed payment native-source directory and distinct existing-target/creation authority",
  "actual SQL settlement INSERT refuses absent typed payment binding","exact source/typed-row/binding replay and partial/orphan rejection",
  "maintenance-after-replay without native overwrite","same-batch header/alias/canonical import scope proof","whole-chunk rollback and no stock/progress/publication effects",
  "unknown-COMMIT both actual outcomes without rollback or retry","independent publication field/lineage verifier before opening capability",
  "real PostgreSQL schema/guard/isolation acceptance on authorized Mac only"])
  test.todo(`NOT IMPLEMENTED / NOT RUN: ${feature}`);
