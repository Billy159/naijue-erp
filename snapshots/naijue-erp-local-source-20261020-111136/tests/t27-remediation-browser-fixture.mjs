import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const webRoot=resolve('frontend'),warehouseId='00000000-0000-4000-8000-000000000601';
const productMappedId='00000000-0000-4000-8000-000000000201',productUnmappedId='00000000-0000-4000-8000-000000000202';
const mappedSkuId='00000000-0000-4000-8000-000000000301',unmappedSkuId='00000000-0000-4000-8000-000000000302';
const correctionMappedId='00000000-0000-4000-8000-000000000401',correctionUnmappedId='00000000-0000-4000-8000-000000000402';
const mappedProduct={id:productMappedId,code:'000120',name:'合成映射商品',category_code:'C01',category_name:'上衣',unit:'件',fit_name:'合身版',enabled:true,created_at:'2026-10-04'};
const unmappedProduct={id:productUnmappedId,code:'000121',name:'合成未映射商品',category_code:'C01',category_name:'上衣',unit:'件',fit_name:'宽松版',enabled:true,created_at:'2026-10-04'};
const mappedSku={id:mappedSkuId,product_id:productMappedId,enabled:true,version:2,fit_id:'FIT-A',options:{
  COLOR:{id:'color-a',code:'BK',name:'黑色'},SIZE:{id:'size-a',sourceCode:'OS',sourceName:'原始尺码-OS',code:'02',name:'标准尺码-02',standardGroup:'中码组'},
}};
const unmappedSku={id:unmappedSkuId,product_id:productUnmappedId,enabled:true,version:1,fit_id:'FIT-B',historicalUnmappedReason:'MISSING_SIZE_MAPPING',options:{
  COLOR:{id:'color-b',code:'WH',name:'白色'},SIZE:{id:'size-b',code:'XX',name:'原始未映射尺码'},
}};
const catalog={products:[mappedProduct,unmappedProduct],skus:[mappedSku,unmappedSku],barcodes:[],aliases:[],profiles:[]};
const correction=(id,number,product,sku,original,reason)=>({correctionId:id,documentType:'CORRECTION',id,number,status:'CONFIRMED',version:1,revision:1,businessDay:'2026-10-03',actorId:'synthetic-admin',
  productCode:product.code,productName:product.name,skuId:sku.id,warehouseId,unit:'件',bookQuantity:'4',actualQuantity:reason==='合成映射校正'?'5':'2',delta:reason==='合成映射校正'?'1':'-2',reason,original,
  body:{correction:{productCode:product.code,productName:product.name,skuId:sku.id,warehouseId,unit:'件',bookQuantity:'4',actualQuantity:reason==='合成映射校正'?'5':'2',delta:reason==='合成映射校正'?'1':'-2',reason,original}}});
const corrections=[
  correction(correctionMappedId,'JZ-MAPPED',mappedProduct,mappedSku,{COLOR:{code:'BK',name:'黑色'},FIT:{id:'fit-a',name:'合身版'},SIZE:{code:'OS',name:'原始尺码-OS'}},'合成映射校正'),
  correction(correctionUnmappedId,'JZ-UNMAPPED',unmappedProduct,unmappedSku,{COLOR:{code:'WH',name:'白色'},SIZE:{code:'XX',name:'原始未映射尺码'}},'合成未映射校正'),
];
const requests=[];
const captureDir=resolve('outputs/T27/supplements/20261004-01/downloads');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function sendJson(response,status,data){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(data));}
const server=createServer((request,response)=>{
  const url=new URL(request.url||'/',`http://${request.headers.host||'127.0.0.1'}`),isApi=url.pathname.startsWith('/api/'),route=isApi?url.pathname.slice(4):url.pathname;
  if(url.pathname==='/__fixture/capture'){
    if(request.method!=='POST')return sendJson(response,405,{ok:false,error:{code:'METHOD',message:'仅接收合成工作簿'}});
    const name=url.searchParams.get('name')||'';
    if(!/^T27-(?:商品-\d+个|单据-\d+张)\.xlsx$/.test(name))return sendJson(response,400,{ok:false,error:{code:'NAME',message:'工作簿名称不在隔离范围'}});
    const chunks=[];let total=0;
    request.on('data',chunk=>{total+=chunk.length;if(total>16*1024*1024){request.destroy();return;}chunks.push(chunk);});
    request.on('end',()=>void (async()=>{try{await mkdir(captureDir,{recursive:true});await writeFile(resolve(captureDir,name),Buffer.concat(chunks));sendJson(response,200,{captured:true,name,bytes:total});}catch{sendJson(response,500,{ok:false,error:{code:'CAPTURE',message:'合成工作簿未能保存'}});}})());
    return;
  }
  if(isApi){
    requests.push({method:request.method,path:route,query:url.search});
    if(request.method!=='GET')return sendJson(response,405,{ok:false,error:{code:'READ_ONLY_FIXTURE',message:'合成验收服务仅允许 GET'}});
    let data;
    if(route==='/runtime/session')data={employee:{id:'t27-remediation-synthetic',name:'T27 合成复验',role:'ADMIN'},csrfToken:'t27-remediation-csrf',stateScope:'t27-remediation'};
    else if(route==='/runtime/catalog')data=catalog;
    else if(route==='/reference/warehouses')data={items:[{id:warehouseId,name:'合成仓库',code:'W-A',enabled:true}],total:1};
    else if(route==='/sales/documents'||route==='/runtime/documents')data={items:[],total:0,page:Number(url.searchParams.get('page')||1),size:Number(url.searchParams.get('size')||200)};
    else if(route==='/corrections'){
      const filtered=corrections.filter(row=>(!url.searchParams.get('warehouseId')||row.warehouseId===url.searchParams.get('warehouseId'))&&(!url.searchParams.get('skuId')||row.skuId===url.searchParams.get('skuId')));
      const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('size')||200);
      data={items:filtered.slice((page-1)*size,page*size),total:filtered.length,page,size};
    }else if(route==='/outputs/products'){
      const ids=(url.searchParams.get('ids')||'').split(',').filter(Boolean),products=new Map(catalog.products.map(row=>[row.id,row]));
      data={records:ids.map(id=>({product:products.get(id),skus:catalog.skus.filter(row=>row.product_id===id),barcodes:[],aliases:[]}))};
    }else if(route.startsWith('/outputs/documents/'))data=corrections.find(row=>row.id===route.split('/').at(-1));
    else if(route==='/__fixture/requests')data={requests};
    else return sendJson(response,404,{ok:false,error:{code:'NOT_FOUND',message:`No synthetic fixture for ${route}`} });
    return sendJson(response,200,{ok:true,data});
  }
  const file=resolve(webRoot,'.'+route);
  if(file!==webRoot&&!file.startsWith(webRoot+sep))return sendJson(response,403,{ok:false,error:{code:'PATH',message:'路径无效'}});
  const target=file===webRoot?resolve(webRoot,'index.html'):file;
  try{if(!statSync(target).isFile())throw new Error('not a file');let body=readFileSync(target);
    if(route==='/export-workbench.html'){
      const hook=`<script>(()=>{const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href),name=this.download;if(blob&&/^T27-(?:商品-\\d+个|单据-\\d+张)\\.xlsx$/.test(name))blob.arrayBuffer().then(bytes=>fetch('/__fixture/capture?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:bytes}));return click.call(this);};})();</script>`;
      body=Buffer.from(body.toString('utf8').replace('<script src="assets/vendor/jszip.min.js',`${hook}<script src="assets/vendor/jszip.min.js`));
    }
    response.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store'});response.end(request.method==='HEAD'?undefined:body);}
  catch{response.writeHead(404,{'content-type':'text/plain; charset=utf-8'});response.end('Not found');}
});
const port=Number(process.env.T27_REMEDIATION_FIXTURE_PORT||4174);
server.listen(port,'127.0.0.1',()=>console.log(`T27 remediation synthetic fixture: http://127.0.0.1:${port}/export-workbench.html`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
