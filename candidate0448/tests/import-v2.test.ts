import test from 'node:test';
import assert from 'node:assert/strict';
import { parseV2Csv, V2_LIMITS, v2Integer, v2Cents, v2Nullable, v2Temporal, v2AliasIndex, v2MoneyApprovalSet, v2ApprovedCents, v2HistoricalCustomerIds, v2HistoricalCustomerReference, parseV2JsonLines, v2CreatorHallDecision, v3BarcodeExclusion } from '../packages/application/src/import-v2.ts';
import type { MoneyApproval } from '../packages/application/src/import-v2.ts';
async function csv(input: string, size=1, limits=V2_LIMITS) { async function* chunks() { for(let i=0;i<input.length;i+=size) yield input.slice(i,i+size); } const rows: string[][] = []; for await (const row of parseV2Csv(chunks(),limits)) rows.push(row); return rows; }
test('CSV preserves literal IDs, formula text, null lexemes, Unicode, multiline and escaped quotes at every boundary',async()=>{
  const input='id,note,empty\r\n0001,"a,""b""\n中",\r\n=1+1,tail,""';
  for(let size=1;size<20;size++) assert.deepEqual(await csv(input,size),[['id','note','empty'],['0001','a,"b"\n中',''],['=1+1','tail','']]);
  assert.equal(v2Nullable(''),null); assert.equal(v2Nullable('0001'),'0001'); assert.equal(v2Nullable('null'),'null');
});
test('CSV rejects malformed quotes, BOM, NUL and bounded overflows',async()=>{
  for(const input of ['a"b','"a"tail','"a','\ufeffa','a\0']) await assert.rejects(csv(input));
  await assert.rejects(csv('abcd',1,{...V2_LIMITS,fieldCharacters:3}),/FIELD_LIMIT/);
  await assert.rejects(csv('a,b',1,{...V2_LIMITS,columns:1}),/COLUMN_LIMIT/);
  await assert.rejects(csv('a\nb',1,{...V2_LIMITS,rows:1}),/ROW_LIMIT/);
  await assert.rejects(csv('abcd',1,{...V2_LIMITS,characters:3}),/CHARACTER_LIMIT/);
});
test('exact signed numbers never float round or erase identity strings',()=>{
  assert.equal(v2Cents('9007199254740991.01'),900719925474099101n);
  assert.equal(v2Cents('-0.01'),-1n); assert.equal(v2Integer('-9223372036854775808'),-9223372036854775808n);
  for(const raw of ['1.001','1e2','NaN',' 1','1.']) assert.throws(()=>v2Cents(raw));
  assert.throws(()=>v2Integer('9223372036854775808')); assert.throws(()=>v2Cents('10000000000000000.00'));
});
const coordinate={product:'synthetic-product',color:'007',fit:'A',size:'synthetic-size'};
test('old identities remain many-to-one and all target coordinates must agree',()=>{
  const canonical=new Map([['canonical',coordinate]]);
  const a={oldId:'0001',canonicalId:'canonical',coordinate};
  const result=v2AliasIndex(canonical,[a,{...a,oldId:'0002'}]); assert.deepEqual([...result],[['0001','canonical'],['0002','canonical']]);
  assert.throws(()=>v2AliasIndex(canonical,[a,a]),/DUPLICATE/);
  assert.throws(()=>v2AliasIndex(canonical,[{...a,coordinate:{...coordinate,color:'7'}}]),/COORDINATE/);
  assert.throws(()=>v2AliasIndex(canonical,[{...a,canonicalId:'unknown'}]),/MISSING/);
  assert.throws(()=>v2AliasIndex(canonical,[]),/NOT_COVERED/);
});
const approvals: MoneyApproval[]=Array.from({length:32},(_,i)=>({fileSha256:'a'.repeat(64),sheet:'synthetic',row:String(i+2),sourceId:`synthetic-${i}`,field:'amount',rawValue:'1.00000000000001',exactCentValue:'1.00'}));
test('32 approvals match the entire provenance/value identity, not count or tolerance',()=>{
  const set=v2MoneyApprovalSet(approvals,[...approvals].reverse()); assert.equal(v2ApprovedCents(approvals[0]!,set),100n);
  for(const field of ['fileSha256','sheet','row','sourceId','field','rawValue','exactCentValue'] as const) {
    const changed=approvals.map(a=>({...a})); changed[0]![field]+='x'; assert.throws(()=>v2MoneyApprovalSet(approvals,changed),/IDENTITY/);
    assert.throws(()=>v2ApprovedCents({...approvals[0]!,[field]:'other'},set),/NOT_APPROVED/);
  }
  assert.throws(()=>v2MoneyApprovalSet(approvals,approvals.slice(1)),/COUNT/);
  assert.throws(()=>v2MoneyApprovalSet(approvals,[...approvals.slice(1),approvals[1]!]),/IDENTITY/);
  assert.throws(()=>v2Cents(approvals[0]!.rawValue),/PRECISION/);
});
test('time parsing fails closed retaining even ambiguous/fractional raw values',()=>{
  for(const raw of ['60','45600.1234567890123','2020-01-01','2020-01-01T00:00:00']) assert.deepEqual(v2Temporal(raw),{raw,state:'POLICY_REQUIRED',parsed:null});
  assert.deepEqual(v2Temporal(''),{raw:null,state:'UNKNOWN',parsed:null});
});

test('supplementary customer identities resolve only historical sales, never current defaults',()=>{
  const row={sourceKey:'000-synthetic-history',enabled:false,historicalOnly:true,visibleInCurrentCustomerList:false};
  const ids=v2HistoricalCustomerIds([row]);
  assert.equal(v2HistoricalCustomerReference('SALES_HEADER.客户来源编号->CUSTOMER',row.sourceKey,ids),true);
  assert.equal(v2HistoricalCustomerReference('HALL.默认客户来源编号->CUSTOMER',row.sourceKey,ids),false);
  assert.equal(v2HistoricalCustomerReference('SALES_HEADER.客户来源编号->CUSTOMER','unknown',ids),false);
  assert.throws(()=>v2HistoricalCustomerIds([row,row]));
  for (const patch of [{enabled:true},{historicalOnly:false},{visibleInCurrentCustomerList:true}]) assert.throws(()=>v2HistoricalCustomerIds([{...row,...patch}]));
});

test('JSONL framing is chunk-safe and bounded without decoding numbers as money',async()=>{
  async function* chunks(text: string) { for(const c of text) yield c; }
  const rows: unknown[]=[]; for await (const row of parseV2JsonLines(chunks('{"raw":"0001"}\n{"raw":"1.00000000000001"}'))) rows.push(row);
  assert.deepEqual(rows,[{raw:'0001'},{raw:'1.00000000000001'}]);
  await assert.rejects(async()=>{for await (const _ of parseV2JsonLines(chunks('{"a":1}'),3)) { /* consume */ }} ,/LINE_LIMIT/);
  await assert.rejects(async()=>{for await (const _ of parseV2JsonLines(chunks('{}\n{}\n'),100,1)) { /* consume */ }} ,/ROW_LIMIT/);
  await assert.rejects(async()=>{for await (const _ of parseV2JsonLines(chunks('\n'))) { /* consume */ }} ,/EMPTY/);
});

test('creator hall derives only from the actual person employee hall; unknown never borrows warehouse context',()=>{
  const staff=new Map([['known','hall-001'],['no-hall','']]);
  assert.deepEqual(v2CreatorHallDecision('SALES_HEADER','known',staff),{matchedStaffId:'known',candidateHall:'hall-001',provenance:'MIGRATION_DERIVED',reason:'MIGRATION_DERIVED_CURRENT_EMPLOYEE_HALL'});
  assert.equal(v2CreatorHallDecision('TRANSFER_HEADER','no-hall',staff).candidateHall,null);
  assert.equal(v2CreatorHallDecision('TRANSFER_HEADER','unknown',staff).reason,'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED');
  assert.equal(v2CreatorHallDecision('SALES_HEADER','',staff).reason,'UNKNOWN_NO_SALESPERSON_ID');
  assert.equal(v2CreatorHallDecision('TRANSFER_HEADER','',staff).candidateHall,null);
});

const barcodeColumns=['来源编号','条码','SKU来源编号','绑定范围','商品来源编号'];
const syntheticBarcodes=[
  {'来源编号':'product-barcode-001','条码':'000001','SKU来源编号':'','绑定范围':'PRODUCT','商品来源编号':'product-1'},
  {'来源编号':'product-barcode-002','条码':'000002','SKU来源编号':'','绑定范围':'PRODUCT','商品来源编号':'product-2'},
  {'来源编号':'sku-barcode-001','条码':'000003','SKU来源编号':'sku-1','绑定范围':'SKU','商品来源编号':'product-1'},
  {'来源编号':'sku-barcode-002','条码':'000004','SKU来源编号':'sku-2','绑定范围':'SKU','商品来源编号':'product-2'},
];
test('explicit v3 selection removes only all approved PRODUCT rows; retained fields remain literal',()=>{
  const before=JSON.stringify(syntheticBarcodes);
  assert.deepEqual(v3BarcodeExclusion(barcodeColumns,syntheticBarcodes,syntheticBarcodes.slice(0,2),syntheticBarcodes.slice(2),{excluded:2,effective:2}),{sourceRows:4,excludedProductEvidenceRows:2,effectiveSkuRows:2,effectiveFieldsUnchanged:true,productRowsInEffectiveTarget:0});
  assert.equal(JSON.stringify(syntheticBarcodes),before);
});
test('v3 exclusion rejects missing/extra/duplicate/non-PRODUCT deletion and raw mutations',()=>{
  const excluded=syntheticBarcodes.slice(0,2), effective=syntheticBarcodes.slice(2), policy={excluded:2,effective:2};
  for(const changed of [excluded.slice(1),[...excluded,effective[0]!],[excluded[0]!,excluded[0]!],[excluded[0]!,effective[0]!]]) assert.throws(()=>v3BarcodeExclusion(barcodeColumns,syntheticBarcodes,changed,effective,policy));
  assert.throws(()=>v3BarcodeExclusion(barcodeColumns,syntheticBarcodes,[{...excluded[0]!,条码:'changed'},excluded[1]!],effective,policy),/RAW_CHANGED/);
  assert.throws(()=>v3BarcodeExclusion(barcodeColumns,syntheticBarcodes,excluded,[{...effective[0]!,条码:'changed'},effective[1]!],policy),/EFFECTIVE_FIELDS/);
  assert.throws(()=>v3BarcodeExclusion(barcodeColumns,syntheticBarcodes,excluded,[excluded[0]!,effective[1]!],policy));
});
