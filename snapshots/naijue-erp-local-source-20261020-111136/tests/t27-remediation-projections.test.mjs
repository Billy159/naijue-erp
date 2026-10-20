import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionDimensions,correctionWorkbookLine,productSheets,workbookJsonCell} from '../frontend/output-projections.js';

const productId='00000000-0000-4000-8000-000000000201';
const mappedSkuId='00000000-0000-4000-8000-000000000301';
const unmappedSkuId='00000000-0000-4000-8000-000000000302';

test('T27 mapped product workbook keeps original size separate from its standard display size',()=>{
  const product={id:productId,code:'000120',name:'合成商品',category_code:'C01',category_name:'上衣',unit:'件',fit_name:'合身版',enabled:true,created_at:'2026-10-04'};
  const mapped={id:mappedSkuId,product_id:productId,enabled:true,version:3,fit_id:'FIT-A',options:{COLOR:{id:'color-a',code:'BK',name:'黑色'},SIZE:{id:'size-a',sourceCode:'OS',sourceName:'原始尺码-OS',code:'02',name:'标准尺码-02',standardGroup:'中码组'}}};
  const unmapped={id:unmappedSkuId,product_id:productId,enabled:true,version:1,fit_id:'FIT-A',historicalUnmappedReason:'MISSING_SIZE_MAPPING',options:{COLOR:{id:'color-b',code:'WH',name:'白色'},SIZE:{id:'size-b',code:'XX',name:'原始未知尺码'}}};
  const sheets=productSheets([product],{products:[product],skus:[mapped,unmapped],barcodes:[],aliases:[]});
  const [headers,mappedRow,unmappedRow]=sheets.find(sheet=>sheet.name==='原 SKU').rows;
  assert.equal(headers[10],'原尺码码');assert.equal(headers[11],'原尺码');
  assert.deepEqual(mappedRow.slice(10,15),['OS','原始尺码-OS','02','标准尺码-02','中码组']);
  assert.deepEqual(unmappedRow.slice(10,15),['XX','原始未知尺码','','','']);
});

test('T27 correction print and workbook dimensions come only from the saved correction snapshot',()=>{
  const mapped={productCode:'000120',skuId:mappedSkuId,unit:'件',delta:'1',bookQuantity:'4',actualQuantity:'5',reason:'合成映射校正',
    original:{COLOR:{code:'BK',name:'黑色'},FIT:{id:'fit-a',name:'合身版'},SIZE:{code:'OS',name:'原始尺码-OS'}}};
  assert.deepEqual(correctionDimensions(mapped),{color:'黑色',fit:'合身版',size:'原始尺码-OS'});
  assert.deepEqual(correctionWorkbookLine(mapped),{
    document_id:'UNKNOWN',operation_actor_id:'UNKNOWN',operation_time:'UNKNOWN',
    product_code:'000120',sku_id:mappedSkuId,color_name:'黑色',fit_name:'合身版',source_size:'原始尺码-OS',source_quantity:'1',unit:'件',
    book_quantity:'4',actual_quantity:'5',reason:'合成映射校正',correction:mapped,
  });

  const serviceSnapshot={correctionId:'74854d96-aedf-41bf-b623-0df08211a4d4',actorId:'g2-warehouse',confirmedAt:'2026-10-04T12:12:41.276Z',...mapped};
  const projected=correctionWorkbookLine(serviceSnapshot,{documentId:serviceSnapshot.correctionId,actorId:serviceSnapshot.actorId,operationTime:serviceSnapshot.confirmedAt});
  assert.deepEqual([projected.document_id,projected.operation_actor_id,projected.operation_time],
    ['74854d96-aedf-41bf-b623-0df08211a4d4','g2-warehouse','2026-10-04T12:12:41.276Z']);
  assert.deepEqual([correctionWorkbookLine({}).document_id,correctionWorkbookLine({}).operation_actor_id,correctionWorkbookLine({}).operation_time],
    ['UNKNOWN','UNKNOWN','UNKNOWN']);

  const unmapped={productCode:'000121',skuId:unmappedSkuId,unit:'件',delta:'-2',bookQuantity:'8',actualQuantity:'6',reason:'合成未映射校正',
    original:{COLOR:{name:'白色'},SIZE:{code:'XX',name:'原始未知尺码'}}};
  assert.deepEqual(correctionDimensions(unmapped),{color:'白色',fit:'',size:'原始未知尺码'});
  assert.equal(correctionWorkbookLine(unmapped).fit_name,'');
  assert.equal(correctionDimensions({original:{}}).color,'');
});

test('T27 oversized source JSON is split into Excel-safe cells and can be reconstructed exactly',()=>{
  const original=JSON.stringify({note:'原文🙂'.repeat(42000),sourceSize:'OS'}),fragments=[];
  const marker=workbookJsonCell(original,{id:'doc-1',number:'COR-1',kind:'修订',revision:2,source:'完整快照'},fragments);
  assert.match(marker,/JSON 原文/);assert(fragments.length>2);
  assert(fragments.every(row=>row[8].length<=30000));
  assert.equal(fragments.map(row=>row[8]).join(''),original);
  assert(fragments.every(row=>row[0]==='doc-1'&&row[3]===2));
});
