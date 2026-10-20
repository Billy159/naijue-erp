import {createServer} from 'node:http';
import {readFileSync, statSync} from 'node:fs';
import {extname, resolve, sep} from 'node:path';

const webRoot=resolve('dist/web');
const productId='00000000-0000-4000-8000-000000000201';
const skuId='00000000-0000-4000-8000-000000000301';
const saleId='00000000-0000-4000-8000-000000000401';
const transferId='00000000-0000-4000-8000-000000000402';
const color={id:'00000000-0000-4000-8000-000000000501',code:'BK',name:'黑色'};
const size={id:'00000000-0000-4000-8000-000000000502',code:'00',name:'原尺码00',sourceName:'原尺码00',sourceCode:'00'};
const line=(id,quantity)=>({id,product_code:'000120',sku_id:skuId,color_name:'黑色',fit_name:'常规版',source_size:'原尺码00',source_quantity:quantity,unit:'件',unit_price:'12.30',amount:'12.30'});
const older={header:{business_date:'2026-09-30',business_type:'RETURN_EXCHANGE',hall_name:'合成营业厅'},lines:[line('old-line','1')],fundsRecords:[{direction:'IN',payment_method_id:'cash',source_payment_method_name:'现金',fund_account_id:'till',source_fund_account_name:'收银账户',amount:'8.00',source_id:'old-fund'}]};
const current={header:{business_date:'2026-10-01',business_type:'RETURN_EXCHANGE',hall_name:'合成营业厅'},lines:[line('line-a','2'),line('line-b','3')],fundsRecords:[
  {direction:'IN',payment_method_id:'cash',source_payment_method_name:'现金',fund_account_id:'till',source_fund_account_name:'收银账户',amount:'10.00',source_id:'fund-a'},
  {direction:'OUT',payment_method_id:'bank',source_payment_method_name:'转账',fund_account_id:'bank-account',source_fund_account_name:'银行账户',amount:'5.00',source_id:'fund-b'},
]};
const transferBody={header:{business_date:'2026-10-01',source_from_warehouse_id:'warehouse-a',source_to_warehouse_id:'warehouse-b'},lines:[{...line('transfer-line','4'),amount:'',unit_price:''}],fundsRecords:[]};
const detail={
  [saleId]:{id:saleId,number:'TH-0001',document_type:'SALE',status:'APPROVED',version:2,current_revision:2,business_day:'2026-10-01',body:current,
    history:[{revision:1,version:1,operation:'create',actor_name:'录入员',created_at:'2026-09-30T01:00:00Z',body:older},{revision:2,version:2,operation:'save',actor_name:'复核员',created_at:'2026-10-01T01:00:00Z',body:current}]},
  [transferId]:{id:transferId,number:'DB-0001',document_type:'TRANSFER',status:'APPROVED',version:1,current_revision:1,business_day:'2026-10-01',body:transferBody,
    history:[{revision:1,version:1,operation:'create',actor_name:'仓库员',created_at:'2026-10-01T02:00:00Z',body:transferBody}]},
};
const product={id:productId,code:'000120',name:'合成测试商品',category_code:'C01',category_name:'上装',unit:'件',fit_name:'常规版',enabled:true,created_at:'2026-10-02'};
const sku={id:skuId,product_id:productId,enabled:true,version:1,fit_id:'FIT-A',options:{COLOR:color,SIZE:size}};
const catalog={products:[product],skus:[sku],barcodes:[{product_id:productId,sku_id:skuId,barcode:'0000123456',generated:false}],
  aliases:[{product_id:productId,sku_id:skuId,barcode:'OLD-0001',origin:'MANUAL',historical_note:'保留原码'}],profiles:[]};
const inventory={warehouseId:'warehouse-a',warehouseName:'合成仓库',warehouseEnabled:true,productId,productCode:'000120',productName:'合成测试商品',skuId,
  original:{color,size},unit:'件',quantity:'2',versions:{product:1,sku:1,warehouse:1},standard:{mappingStatus:'UNMAPPED',mappingRevision:''},basis:{kind:'SOURCE',difference:'0',reconciled:true}};
const saleList={id:saleId,number:'TH-0001',status:'APPROVED',version:2,current_revision:2,business_day:'2026-10-01',body:current};
const transferList={id:transferId,number:'DB-0001',status:'APPROVED',version:1,current_revision:1,business_day:'2026-10-01',body:transferBody};

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function sendJson(response,status,data){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(data));}
const server=createServer((request,response)=>{
  if(request.method!=='GET'&&request.method!=='HEAD')return sendJson(response,405,{ok:false,error:{code:'READ_ONLY_FIXTURE',message:'合成验收服务仅允许 GET'}});
  const url=new URL(request.url||'/',`http://${request.headers.host||'127.0.0.1'}`),path=url.pathname;
  if(path.startsWith('/api/')){
    const route=path.slice('/api'.length);let data;
    if(route==='/runtime/session')data={employee:{id:'t27-synthetic',name:'T27 合成验收',role:'ADMIN'},csrfToken:'t27-fixture-csrf',stateScope:'t27-fixture'};
    else if(route==='/runtime/catalog')data=catalog;
    else if(route==='/reference/warehouses')data={items:[{id:'warehouse-a',name:'合成仓库',code:'W-A',enabled:true},{id:'warehouse-b',name:'合成调入仓',code:'W-B',enabled:true}],total:2};
    else if(route==='/runtime/inventory')data={items:[inventory],total:1};
    else if(route==='/runtime/ledger')data={items:[{id:'movement-a',time:'2026-10-01T01:00:00Z',businessDay:'2026-10-01',kind:'SALE',documentId:saleId,revision:2,lineIndex:1,quantity:'-2',stockDelta:'-2',before:'10',after:'8',historicalOnly:false}],total:1,reconstructedQuantity:'8',balance:{view:'original',items:[{warehouseId:'warehouse-a',skuId,unit:'件',unitConflict:false,quantity:'8'}],total:1}};
    else if(route==='/sales/documents')data={items:[saleList],total:1,page:1,size:200};
    else if(route==='/runtime/documents'&&url.searchParams.get('type')==='TRANSFER')data={items:[transferList],total:1,page:1,size:200};
    else if(route==='/corrections')data={items:[],total:0,page:1,size:200};
    else if(route===`/outputs/products/${productId}`)data={product,skus:[sku],barcodes:catalog.barcodes,aliases:catalog.aliases};
    else if(route.startsWith('/outputs/documents/'))data=detail[route.slice('/outputs/documents/'.length)];
    else if(route.startsWith('/outputs/barcode-labels/')){
      if(url.searchParams.get('code')!=='0000123456'||url.searchParams.get('skuId')!==skuId)return sendJson(response,409,{ok:false,error:{code:'BARCODE_NOT_UNIQUE',message:'合成条码无法唯一定位'}});
      data={code:'0000123456',productId,productCode:'000120',skuId,fitId:'FIT-A',options:sku.options};
    } else return sendJson(response,404,{ok:false,error:{code:'NOT_FOUND',message:`未实现的合成只读接口 ${route}`} });
    return sendJson(response,200,{ok:true,data});
  }
  const file=resolve(webRoot,'.'+path);
  if(file!==webRoot&&!file.startsWith(webRoot+sep))return sendJson(response,403,{ok:false,error:{code:'PATH',message:'路径无效'}});
  const target=file===webRoot?resolve(webRoot,'index.html'):file;
  try{if(!statSync(target).isFile())throw new Error('not a file');const body=readFileSync(target);response.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store'});response.end(request.method==='HEAD'?undefined:body)}
  catch{response.writeHead(404,{'content-type':'text/plain; charset=utf-8'});response.end('Not found')}
});
const port=Number(process.env.T27_FIXTURE_PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`T27 synthetic read-only fixture: http://127.0.0.1:${port}/export-workbench.html`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
