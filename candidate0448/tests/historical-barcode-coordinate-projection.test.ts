import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoricalBarcodeAttestation } from '../packages/application/src/historical-barcode-attestation.ts';
import { projectLocalHistoricalBarcodeDeclarations as project } from '../packages/application/src/historical-barcode-coordinate-projection.ts';
import { BARCODE_SCHEMES as S, generateSkuBarcode } from '../packages/application/src/barcode-generation.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha='a'.repeat(64), ref={file_sha256:sha,sheet:'synthetic',row:1};
const samples=[[S.y2018,'06008','0','06','806008006'],[S.y2020,'5122301721','0','07','05122301721007'],[S.y2021,'5139305','504','03','6513930550403'],[S.y2021fit,'31550411','501','03','23155041150103'],[S.y2023,'5336253','501','508','95336253501508']] as const;
const entries=samples.map(([scheme,product,color,size])=>({scheme_id:scheme,color_id:id(2),fit_id:id(3),size_id:id(4),product_segment:product,color_code:color,size_code:size,sources:{product:ref,color:ref,fit:ref,size:ref}}));
const declaration=parseHistoricalBarcodeAttestation({version:'HISTORICAL_BARCODE_ATTESTATION_V1',product_id:id(1),product_source_key:'synthetic',entries},id(1),new Set([sha]));
const sku={id:id(5),productId:id(1),colorId:id(2),fitId:id(3),sizeId:id(4)};
test('offline local declarations resolve product-selected scheme against actual allocated SKU coordinates',()=>{
  for(const [scheme,,,,expected] of samples) { const p=project({productId:id(1),schemeId:scheme,declaration,skus:[sku]}); assert.deepEqual(p.missingSkuIds,[]); assert.equal(p.matched[0]!.skuId,sku.id); assert.equal(generateSkuBarcode({...p.matched[0]!,fitCode:null}),expected); }
});
test('coordinate mismatches remain missing; duplicate or cross-product identities are rejected',()=>{
  const target={...sku,id:id(6),colorId:id(7)}; assert.deepEqual(project({productId:id(1),schemeId:S.y2018,declaration,skus:[target]}).missingSkuIds,[target.id]);
  for(const skus of [[sku,sku],[sku,{...sku,id:id(8)}],[{...sku,productId:id(9)}]]) assert.throws(()=>project({productId:id(1),schemeId:S.y2018,declaration,skus}));
  assert.throws(()=>project({productId:id(9),schemeId:S.y2018,declaration,skus:[]}));
});
test('historical 910 and current 910 remain scoped by source and size identity, never inferred from equal raw code',()=>{
  const e={...entries[4]!,size_code:'910',size_id:id(40)};
  const historic=parseHistoricalBarcodeAttestation({version:'HISTORICAL_BARCODE_ATTESTATION_V1',product_id:id(1),product_source_key:'legacy-no-size',entries:[e]},id(1),new Set([sha]));
  const legacySku={...sku,sizeId:id(40)}, currentSku={...sku,id:id(6),sizeId:id(41)};
  const oldResult=project({productId:id(1),schemeId:S.y2023,declaration:historic,skus:[legacySku,currentSku]});
  assert.equal(oldResult.matched.length,1); assert.equal(oldResult.matched[0]!.skuId,legacySku.id); assert.deepEqual(oldResult.missingSkuIds,[currentSku.id]);
  assert.equal(generateSkuBarcode({...oldResult.matched[0]!,fitCode:null}), '95336253501910');
  assert.equal(generateSkuBarcode({schemeId:S.y2026,productSegment:'5395661',fitCode:'5',colorCode:'504',sizeCode:'910'}), '555395661504910');
});
