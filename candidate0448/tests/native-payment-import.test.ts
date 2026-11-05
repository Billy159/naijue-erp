import test from "node:test";
import assert from "node:assert/strict";
import { prepareNativePaymentImportChunk, validatePreparedNativePaymentImportChunk, stageNativePaymentImport } from "../packages/application/src/native-payment-import.ts";
import { paymentChunk, paymentId } from "./support/native-payment-fixtures.ts";
test("payment method/account/optional recommendation relation retain exact source identities and explicit creation facts", async () => {
  const method=prepareNativePaymentImportChunk(paymentChunk()),account=prepareNativePaymentImportChunk(paymentChunk("PAYMENT_ACCOUNT",20)),relation=prepareNativePaymentImportChunk(paymentChunk("PAYMENT_ACCOUNT_HALL",40));
  assert.deepEqual(method.rows[0]!.nativeSnapshot,{id:paymentId(10),name:"原方式10",enabled:true,version:1});
  assert.equal(account.rows[0]!.nativeSnapshot.payment_method_id,paymentId(10));
  assert.deepEqual(relation.rows[0]!.nativeSnapshot,{payment_account_id:paymentId(20),hall_id:paymentId(30)});
  assert.equal(relation.rows[0]!.source.sourceKey,'["ACCOUNT-20","HALL-30"]');assert.equal(Object.hasOwn(relation.rows[0]!.source.rawFields,"来源编号"),false);
  for(const c of [method,account,relation])validatePreparedNativePaymentImportChunk(c);
  assert.deepEqual(await stageNativePaymentImport(paymentChunk()),{mode:"DRY_RUN",rows:1,inserted:0,replayed:0,published:false,importReady:false});
});
test("payment raw getters/symbols/array metadata reject before clone and cannot be laundered into prepared input",()=>{
  let calls=0;const getter=paymentChunk();Object.defineProperty(getter,"rows",{get(){calls++;return [];}});
  const symbol=paymentChunk();Object.defineProperty(symbol.rows[0]!.source.rawFields,Symbol("hidden"),{value:true});
  const array=paymentChunk();Object.defineProperty(array.rows,"hidden",{value:true});
  for(const c of [getter,symbol,array])assert.throws(()=>prepareNativePaymentImportChunk(c));assert.equal(calls,0);
  const prepared=prepareNativePaymentImportChunk(paymentChunk());prepared.rows[0]!.nativeSnapshot.name="CHANGED";assert.throws(()=>validatePreparedNativePaymentImportChunk(prepared));
});
test("payment source/target/enum/dependency/compound-identity and full occurrence duplicates fail closed",()=>{
  const cases=[];
  for(const change of [
    (c:ReturnType<typeof paymentChunk>)=>{c.rows[0]!.source.sourceKey="other";},
    (c:ReturnType<typeof paymentChunk>)=>{c.rows[0]!.source.normalizedFields.方式名称="renamed";},
    (c:ReturnType<typeof paymentChunk>)=>{c.rows[0]!.enabledMapping=null;},
    (c:ReturnType<typeof paymentChunk>)=>{c.rows=[c.rows[0]!,structuredClone(c.rows[0]!)];},
  ]){const c=paymentChunk();change(c);cases.push(c);}
  const account=paymentChunk("PAYMENT_ACCOUNT",20);account.rows[0]!.references.收款方式来源编号!.sourceKey="wrong";cases.push(account);
  const relation=paymentChunk("PAYMENT_ACCOUNT_HALL",40);relation.rows[0]!.source.sourceKey="invented-row-id";cases.push(relation);
  for(const c of cases)assert.throws(()=>prepareNativePaymentImportChunk(c));
});
test("payment STAGE needs independent whole-chunk authorization and does not silently enable writes",async()=>{
  let stored=0;const store={async stage(){stored++;return {inserted:1,replayed:0,nativeCurrentMatchesCreation:true};}};
  await assert.rejects(stageNativePaymentImport(paymentChunk(),{mode:"STAGE",store}));assert.equal(stored,0);
  await assert.rejects(stageNativePaymentImport(paymentChunk(),{mode:"STAGE",store,async authorize(){throw Error("current source authorization refused");}}));assert.equal(stored,0);
  const result=await stageNativePaymentImport(paymentChunk(),{mode:"STAGE",store,async authorize(c){assert.equal(c.rows.length,1);}});assert.equal(result.published,false);assert.equal(stored,1);
});
