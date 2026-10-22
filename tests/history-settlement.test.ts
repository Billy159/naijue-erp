import test from "node:test";import assert from "node:assert/strict";
import { prepareHistorySettlementChunk,validatePreparedHistorySettlementChunk,stageHistorySettlementChunk } from "../packages/application/src/import-v3-history-settlement.ts";
import { settlementChunk } from "./support/history-settlement-fixtures.ts";
import { paymentId as id, originalPaymentFields,PAYMENT_HASH } from "./support/native-payment-fixtures.ts";
import { v2MoneyApprovalSet } from "../packages/application/src/import-v2.ts";
test("historical account and independent original method/name snapshots never copy the account's current method",()=>{
 const input=settlementChunk(),c=prepareHistorySettlementChunk(input),r=c.rows[0]!;
 assert.equal(r.account.nativeSnapshot.payment_method_id,id(10));assert.equal(r.settlement.payment_method_id_snapshot,id(11));
 assert.equal(r.settlement.account_name_snapshot,"历史账户旧名");assert.equal(r.settlement.method_name_snapshot,"历史方式旧名");
 assert.equal(r.settlement.direction,"REFUND");assert.equal(r.settlement.amount,"7.03");assert.equal(r.settlement.line_no,9);validatePreparedHistorySettlementChunk(c);
});
test("optional original method absent or empty stays NULL and retains source own-key distinction; missing nonempty binding rejects",()=>{
 const absent=settlementChunk(false),empty=settlementChunk(false);empty.rows[0]!.source.rawFields.原收款方式来源编号="";empty.rows[0]!.source.normalizedFields.原收款方式来源编号="";empty.rows[0]!.source.fieldProvenance=originalPaymentFields(empty.rows[0]!.source.rawFields);
 const a=prepareHistorySettlementChunk(absent),b=prepareHistorySettlementChunk(empty);assert.equal(a.rows[0]!.settlement.payment_method_id_snapshot,null);assert.equal(b.rows[0]!.settlement.payment_method_id_snapshot,null);assert.notEqual(a.fingerprint,b.fingerprint);
 const missing=settlementChunk();missing.rows[0]!.method=null;assert.throws(()=>prepareHistorySettlementChunk(missing));
});
test("negative/overprecision amount, unknown direction, forged identity/header/account, duplicate line and changed prepared data reject",()=>{
 for(const [field,value] of [["金额","-0.01"],["金额","1.00001"],["方向","猜测退款"],["来源编号","OTHER"],["账户来源编号","OTHER"]]){
  const c=settlementChunk();c.rows[0]!.source.rawFields[field!]=value!;c.rows[0]!.source.normalizedFields[field!]=value!;c.rows[0]!.source.fieldProvenance=originalPaymentFields(c.rows[0]!.source.rawFields);assert.throws(()=>prepareHistorySettlementChunk(c));
 }
 const duplicate=settlementChunk();duplicate.rows.push(structuredClone(duplicate.rows[0]!));assert.throws(()=>prepareHistorySettlementChunk(duplicate));
 const c=prepareHistorySettlementChunk(settlementChunk());c.rows[0]!.settlement.amount="0.00";assert.throws(()=>validatePreparedHistorySettlementChunk(c));
 const zero=settlementChunk();zero.rows[0]!.source.rawFields.金额="0";zero.rows[0]!.source.normalizedFields.金额="0";zero.rows[0]!.source.fieldProvenance=originalPaymentFields(zero.rows[0]!.source.rawFields);assert.equal(prepareHistorySettlementChunk(zero).rows[0]!.settlement.amount,"0.00");
});
test("whole32 exact-cell amount correction succeeds only for exact file/sheet/row/source/field/raw/candidate",()=>{
 const c=settlementChunk(),s=c.rows[0]!.source;s.rawFields.金额="7.0300000000000001";s.fieldProvenance=originalPaymentFields(s.rawFields);
 const approvals=[...c.moneyApprovals.values()];approvals[0]={fileSha256:PAYMENT_HASH,sheet:"SETTLEMENT",row:"2",sourceId:s.sourceKey,field:"金额",rawValue:s.rawFields.金额 as string,exactCentValue:"7.03"};c.moneyApprovals=v2MoneyApprovalSet(approvals,approvals);
 assert.equal(prepareHistorySettlementChunk(c).rows[0]!.settlement.amount,"7.03");
 const changed=structuredClone(c);changed.rows[0]!.source.rowNo="3";assert.throws(()=>prepareHistorySettlementChunk(changed));
 const partial=structuredClone(c),less=new Map(partial.moneyApprovals);less.delete(less.keys().next().value!);partial.moneyApprovals=less;assert.throws(()=>prepareHistorySettlementChunk(partial));
});
test("raw getters/symbols/map overrides reject before clone, and STAGE requires independent exact authorizer",async()=>{
 let getters=0,stores=0;const raw=settlementChunk();Object.defineProperty(raw,"rows",{get(){getters++;throw Error();}});assert.throws(()=>prepareHistorySettlementChunk(raw));assert.equal(getters,0);
 const symbol=settlementChunk();Object.defineProperty(symbol.rows[0]!,Symbol("hidden"),{value:true});assert.throws(()=>prepareHistorySettlementChunk(symbol));
 const map=settlementChunk();Object.defineProperty(map.moneyApprovals,"entries",{get(){getters++;throw Error();}});assert.throws(()=>prepareHistorySettlementChunk(map));assert.equal(getters,0);
 const store={async stage(){stores++;return {inserted:1,replayed:0};}};await assert.rejects(stageHistorySettlementChunk(settlementChunk(),{mode:"STAGE",store}));assert.equal(stores,0);
 const dry=await stageHistorySettlementChunk(settlementChunk());assert.equal(dry.published,false);assert.equal(stores,0);
});
