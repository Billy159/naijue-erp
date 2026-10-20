import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {AuthorizedBusinessWorkflow} from '../../security/http.js';
import type {ActionLock} from '../../database/session.js';
import {registerBusinessRoute,registerBusinessWorkflowRoute} from '../../security/http.js';
import {identifier,object} from '../../security/errors.js';
import {MediaStore,mediaMetadata,type MediaRecord} from '../../media/store.js';
import {catalog,catalogPage,identityCatalog,productMasters,productPage,productReference,resolveBarcode} from './catalog.js';
import {authorizeAction} from '../../security/policies.js';
import {changeMaster} from './masters.js';
import {deleteProduct,requestKey,saveProfile,type PreparedImage} from './profile.js';
import {fail,text,imageRoles} from './definitions.js';
import {productStock,productTotals} from './stock.js';

function locks(body:Record<string,unknown>):ActionLock[] {
  return [{scope:'reference',key:'master-data-catalog'},{scope:'reference',key:'product-catalog'},
    {scope:'barcode',key:'product-barcodes'},{scope:'inventory',key:'posting-ledger'},...(body['productId']?[{scope:'product' as const,key:identifier(body['productId'],true)}]:[]),
    ...(body['requestKey']?[{scope:'idempotency' as const,key:'product:'+requestKey(body)}]:[])];
}
function body(request:FastifyRequest):Record<string,unknown>{return object(request.body);}
async function images(workflow:AuthorizedBusinessWorkflow,store:MediaStore,input:Record<string,unknown>):Promise<PreparedImage[]> {
  const raw=object(input['profile'])['images'];if(raw===undefined)return [];
  if(!Array.isArray(raw)||raw.length>1000)return fail('商品图片无效');
  const productId=identifier(input['productId'],true),result:PreparedImage[]=[],colorImages=new Set<string>();
  for(const [index,value]of raw.entries()){
    const image=object(value),colorId=text(image['colorId']??'','图片颜色',128,true),metadata=mediaMetadata({name:image['name'],role:imageRoles[String(image['role'])]||image['role'],colorName:image['colorName']??null,sortOrder:index});
    if(metadata.role==='color'&&(!colorId||colorImages.has(colorId)))return fail('每种颜色只能保存一张颜色配图');if(metadata.role==='color')colorImages.add(colorId);
    if(image['mediaId']){
      const row=(await workflow.execute(context=>context.session.query<MediaRecord>(`SELECT * FROM ${context.repo.runtime}.product_image WHERE id=$1::uuid AND product_id=$2::uuid`,[identifier(image['mediaId'],true),productId]))).rows[0];
      if(!row||row.role.startsWith('history/'))return fail('图片未关联此商品或已被替换');
      result.push({id:row.id,name:metadata.name,role:metadata.role,colorId,colorName:metadata.colorName,sortOrder:index,path:row.path,sha256:row.sha256,mediaType:row.media_type});
    }else{
      const url=text(image['url'],'图片内容',11185000),match=url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
      if(!match)return fail('新图片必须通过受控媒体上传');
      const stage=await store.stage({bytes:Buffer.from(match[2]!,'base64'),declaredType:match[1],name:metadata.name,productId,actorId:workflow.actor.id,requestKey:`${requestKey(input)}_${index}`});
      const saved=await store.promote(stage);
      result.push({id:stage.mediaId,name:metadata.name,role:metadata.role,colorId,colorName:metadata.colorName,sortOrder:index,path:saved.path,sha256:stage.checksum,mediaType:stage.declaredType});
    }
  }
  return result;
}
export function registerProductRoutes(app:FastifyInstance,store:MediaStore):void {
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/product-stock',resolve:()=>({id:'inventory.balance',selection:{kind:'global'}}),handler:async(context,request)=>{
    const query=object(request.query),codes=JSON.parse(String(query['products']??'[]')) as unknown;
    if(!Array.isArray(codes)||codes.length>100||codes.some(c=>typeof c!=='string'||c.length>80))return fail('商品库存筛选无效');
    return productStock(context,codes as string[]);}});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/product-totals',resolve:()=>({id:'inventory.balance',selection:{kind:'global'}}),handler:productTotals});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/catalog',resolve:()=>({id:'products.list',selection:{kind:'global'}}),handler:async(context,request)=>{
    const query=object(request.query);if(Object.keys(query).some(key=>key!=='products'))return fail('商品目录参数无效');
    if(query['products']===undefined)return catalog(context);
    let ids:unknown;try{ids=JSON.parse(String(query['products']));}catch{return fail('商品目录参数无效');}
    if(!Array.isArray(ids)||ids.length>100)return fail('商品目录每批最多100个商品');
    if(!ids.length)return {products:[],skus:[],barcodes:[],sourceBarcodes:[],aliases:[],profiles:[]};
    return catalog(context,ids.map(id=>identifier(id,true)));
  }});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/catalog-page',resolve:()=>({id:'products.list',selection:{kind:'global'}}),handler:(context,request)=>{
    authorizeAction(context.actor,'barcodes.resolve');return catalogPage(context,request.query);
  }});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/product-masters',resolve:()=>({id:'productMasters.list',selection:{kind:'global'}}),handler:productMasters});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/products',resolve:()=>({id:'products.list',selection:{kind:'global'}}),handler:(context,request)=>productPage(context,request.query)});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/barcode',resolve:()=>({id:'barcodes.resolve',selection:{kind:'global'}}),handler:(context,request)=>resolveBarcode(context,object(request.query)['code']??object(request.query)['barcode'])});
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/product-identity',resolve:()=>({id:'barcodes.resolve',selection:{kind:'global'}}),handler:async(context,request)=>{
    const query=object(request.query);
    if(Object.keys(query).some(key=>key!=='code'))return fail('商品身份参数无效');
    return query['code']===undefined?identityCatalog(context):resolveBarcode(context,query['code']);
  }});
  for(const kind of ['categories','colors','fits','sizes','size-groups','seasons','units'])registerBusinessRoute(app,{method:'GET',url:`/api/reference/${kind}`,resolve:()=>({id:'productMasters.list',selection:{kind:'global'}}),handler:async(context,request)=>{
    const rows=await productReference(context,kind),query=object(request.query),page=Number(query['page']||1),size=Number(query['size']||200);
    if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>500)return fail('分页参数无效');return {items:rows.slice((page-1)*size,page*size),total:rows.length};}});
  registerBusinessWorkflowRoute(app,{method:'POST',url:'/api/runtime/product-profile',resolve:request=>({id:'products.save',selection:{kind:'global'},locks:locks(body(request))}),workflow:async(workflow,request)=>{
    const input=body(request);
    const committed=await workflow.execute(async context=>(await context.session.query(`SELECT 1 FROM ${context.repo.runtime}.idempotency_request
      WHERE actor_id=$1 AND command_scope='products.save' AND idempotency_key=$2 AND completed_at IS NOT NULL`,[context.actor.id,requestKey(input)])).rows.length>0);
    // A committed retry must use the original result even after temporary media tokens expire.
    if(committed)return workflow.execute(context=>saveProfile(context,input,[]));
    const prepared=await images(workflow,store,input);
    return workflow.execute(context=>saveProfile(context,input,prepared));}});
  registerBusinessRoute(app,{method:'POST',url:'/api/runtime/product-delete',resolve:request=>{const input=body(request);return {id:input['checkOnly']===true?'products.checkDelete':'products.delete',selection:{kind:'product',id:identifier(input['productId'],true)},locks:locks(input)};},handler:(context,request)=>deleteProduct(context,body(request))});
  registerBusinessRoute(app,{method:'POST',url:'/api/runtime/product-master',resolve:request=>{const input=body(request);return {id:input['action']==='check-delete'?'productMasters.checkDelete':'productMasters.save',selection:{kind:'global'},locks:locks(input)};},handler:(context,request)=>changeMaster(context,body(request))});
}
