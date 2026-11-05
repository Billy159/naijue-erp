import test from 'node:test'; import assert from 'node:assert/strict';
import { readHistoricalBarcodeDeclarations } from '../adapters/postgres/src/historical-barcode-declaration-reader.ts';
import { BARCODE_SCHEMES as S } from '../packages/application/src/barcode-generation.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64), ref={file_sha256:hash,sheet:'synthetic',row:1};
const attestation={version:'HISTORICAL_BARCODE_ATTESTATION_V1',verification:'LOCAL_DECLARATION_ONLY',product_id:id(1),product_source_key:'p',entries:[{scheme_id:S.y2021fit,color_id:id(2),fit_id:id(3),size_id:id(4),product_segment:'31550411',color_code:'501',size_code:'03',sources:{product:ref,color:ref,fit:ref,size:ref}}]};
const sku={id:id(5),productId:id(1),colorId:id(2),fitId:id(3),sizeId:id(4)};
test('V2 proof-reader maps only exact allocated product/coordinate and labels local declaration',async()=>{
 let query=''; let args:unknown[]=[]; const result=await readHistoricalBarcodeDeclarations(async(s,v)=>{query=s;args=v;return {rows:[{attestation,pinned_source_files:[hash]}]}},id(1),S.y2021fit,[sku]);
 assert.match(query,/standard_historical_barcode_declaration\(\$1::uuid\)/); assert.deepEqual(args,[id(1)]); assert.deepEqual(result,[{skuId:sku.id,schemeId:S.y2021fit,productSegment:'31550411',colorCode:'501',sizeCode:'03',evidenceRef:`LOCAL_DECLARATION_ONLY:${id(1)}`}]);
});
test('absent mapping remains missing; duplicate proof rows, spoofed scope and malformed pins reject',async()=>{
 const empty=await readHistoricalBarcodeDeclarations(async()=>({rows:[]}),id(1),S.y2021fit,[sku]);assert.deepEqual(empty,[]);
 const row={attestation,pinned_source_files:[hash]};
 for(const rows of [[row,row],[{...row,pinned_source_files:['b'.repeat(64)]}],[{...row,attestation:{...attestation,verification:'SOURCE_VERIFIED'}}],[{...row,attestation:{...attestation,product_id:id(9)}}]]) await assert.rejects(readHistoricalBarcodeDeclarations(async()=>({rows}),id(1),S.y2021fit,[sku]));
});
test('all five product scheme declarations pass through candidate reader without remapping source segments',async()=>{
  const samples=[[S.y2018,'06008','0','06','806008006'],[S.y2020,'5122301721','0','07','05122301721007'],[S.y2021,'5139305','504','03','6513930550403'],[S.y2021fit,'31550411','501','03','23155041150103'],[S.y2023,'5336253','501','508','95336253501508']] as const;
  const {generateSkuBarcode}=await import('../packages/application/src/barcode-generation.ts');
  for(const [scheme,segment,color,size,expected] of samples) {
    const e={...attestation.entries[0]!,scheme_id:scheme,product_segment:segment,color_code:color,size_code:size};
    const row={attestation:{...attestation,entries:[e]},pinned_source_files:[hash]};
    const [mapped]=await readHistoricalBarcodeDeclarations(async()=>({rows:[row]}),id(1),scheme,[sku]);
    assert.equal(mapped!.skuId,sku.id); assert.equal(generateSkuBarcode({...mapped!,fitCode:null}),expected);
  }
});
test('one published product scheme cannot contain conflicting source product segments',async()=>{
 const e={...attestation.entries[0]!,size_id:id(8),product_segment:'different'};
 const row={attestation:{...attestation,entries:[attestation.entries[0]!,e]},pinned_source_files:[hash]};
 await assert.rejects(readHistoricalBarcodeDeclarations(async()=>({rows:[row]}),id(1),S.y2021fit,[sku]));
});
