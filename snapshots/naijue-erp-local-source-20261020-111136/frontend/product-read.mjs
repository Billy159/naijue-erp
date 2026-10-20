/* Explicit, scoped product reads. Constructing this service performs no request. */
export class ProductReadError extends Error {
 constructor(message,code='PROTOCOL',extra={}){super(message);this.name='ProductReadError';this.code=code;Object.assign(this,extra);}
}
const arrays=['products','skus','sourceBarcodes','barcodes','aliases','profiles'];
const unique=value=>[...new Set(value||[])];
const empty=()=>({products:[],catalog:Object.fromEntries(arrays.map(key=>[key,[]])),identities:{version:1,products:[],skus:[],productCodes:[]},catalogVersion:'',unresolved:[]});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export function createProductReader({request,scope,consume=async()=>[],limit=3,paths={}}){
 if(typeof request!=='function'||typeof scope!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>4)throw new TypeError('Product reader requires request, session scope and a bounded queue');
 const endpoints={list:'/runtime/product-list',details:'/runtime/product-details',barcode:'/runtime/barcode',...paths};
 const pending=new Map(),details=new Map(),states=new Map(),waiting=[];
 let owner=String(scope()),epoch=0,version='',versionEpoch=0,active=0;
 const stale=()=>new ProductReadError('登录身份或商品资料已变化，请重试','AUTH',{stale:true});
 const reset=reason=>{epoch++;versionEpoch++;owner=String(scope());version='';pending.clear();details.clear();states.clear();while(waiting.length)waiting.shift().reject(stale());return reason;};
 const current=()=>{if(owner!==String(scope()))reset('session');return epoch;};
 const isCurrent=generation=>generation===epoch&&owner===String(scope());
 const state=(key,value)=>{states.set(key,value);};
 const drain=()=>{while(active<limit&&waiting.length){const job=waiting.shift();if(!isCurrent(job.generation)){job.reject(stale());continue;}active++;Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{active--;drain();});}};
 const schedule=(run,generation)=>new Promise((resolve,reject)=>{waiting.push({run,generation,resolve,reject});drain();});
 function deduplicated(key,run){
  const generation=current(),scoped=owner+'|'+epoch+'|'+key;
  if(pending.has(scoped))return pending.get(scoped);
  state(key,{status:'loading',error:null});
  const task=schedule(async()=>{if(!isCurrent(generation))throw stale();const value=await run(generation);if(!isCurrent(generation))throw stale();state(key,{status:'ready',error:null});return value;},generation)
   .catch(error=>{if(isCurrent(generation))state(key,{status:'error',error:error.message});throw error;})
   .finally(()=>{if(pending.get(scoped)===task)pending.delete(scoped);});
  pending.set(scoped,task);return task;
 }
 const query=(path,value)=>path+'?query='+encodeURIComponent(JSON.stringify(value));
 function acceptVersion(next){
  if(typeof next!=='string'||!next)throw new ProductReadError('商品资料版本缺失，请重试');
  if(version!==next){details.clear();versionEpoch++;}version=next;
 }
 async function list({filters={},page=1,size=20,purpose='products'}={}){
  if(!Number.isSafeInteger(page)||page<1||![20,50,100,200,500].includes(size)||!['products','picker'].includes(purpose))throw new ProductReadError('商品查询参数无效','VALIDATION');
  const input={filters:stable(filters),page,size,purpose};
  return deduplicated('list:'+JSON.stringify(input),async generation=>{
   const stamp=versionEpoch;
   const result=await request(query(endpoints.list,input));
   if(!isCurrent(generation))throw stale();
   if(!result||!Array.isArray(result.items)||!Array.isArray(result.productIds)||!Number.isSafeInteger(result.total)||result.total<0||result.page!==page||result.size!==size)throw new ProductReadError('商品列表分页返回无效，请重试');
   if(result.items.length!==result.productIds.length||result.items.some((row,index)=>row.id!==result.productIds[index]||typeof row.code!=='string'))throw new ProductReadError('商品列表身份不一致，请重试');
   if(stamp!==versionEpoch&&result.catalogVersion!==version)throw new ProductReadError('商品资料在读取期间更新，请重试','STALE_DATA',{stale:true});
   acceptVersion(result.catalogVersion);return result;
  });
 }
 async function ensureDetails({productIds=[],skuIds=[],codes=[]}={}){
  const generation=current();
  if([productIds,skuIds,codes].some(ids=>!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id)))throw new ProductReadError('商品身份读取参数无效','VALIDATION');
  const input={productIds:unique(productIds.map(id=>id.toLowerCase())),skuIds:unique(skuIds.map(id=>id.toLowerCase())),codes:unique(codes)};
  if(!Object.values(input).some(ids=>ids.length))return empty();
  // Only caller-supplied identities are chunked; there is no directory enumeration.
  const specified=Object.entries(input).flatMap(([key,ids])=>ids.map(id=>({key,id})));
  if(specified.length>100){
   const parts=[];for(let at=0;at<specified.length;at+=100){const part={productIds:[],skuIds:[],codes:[]};for(const {key,id} of specified.slice(at,at+100))part[key].push(id);parts.push(part);}
   const merged=empty();for(const part of await Promise.all(parts.map(value=>ensureDetails(value)))){
    if(merged.catalogVersion&&merged.catalogVersion!==part.catalogVersion)throw new ProductReadError('商品资料在读取期间更新，请重试','STALE_DATA',{stale:true});
    merged.catalogVersion=part.catalogVersion;merged.products.push(...part.products);merged.unresolved.push(...(part.unresolved||[]));
    for(const key of arrays)merged.catalog[key].push(...part.catalog[key]);
    for(const key of ['products','skus','productCodes'])merged.identities[key].push(...part.identities[key]);
   }if(!isCurrent(generation))throw stale();
   merged.products=[...new Map(merged.products.map(row=>[row.uuid,row])).values()];
   for(const key of arrays)merged.catalog[key]=[...new Map(merged.catalog[key].map(row=>[JSON.stringify(row),row])).values()];
   for(const key of ['products','skus','productCodes'])merged.identities[key]=[...new Map(merged.identities[key].map(row=>[JSON.stringify(row),row])).values()];
   return merged;
  }
  const key='details:'+JSON.stringify(stable(input)),cached=details.get(key);
  if(cached&&cached.version===version&&Date.now()-cached.at<60000)return cached.value;
  return deduplicated(key,async generation=>{
   const stamp=versionEpoch;
   const result=await request(query(endpoints.details,input));
   if(!result?.catalog||arrays.some(key=>!Array.isArray(result.catalog[key]))||result.identities?.version!==1||['products','skus','productCodes'].some(key=>!Array.isArray(result.identities[key])))throw new ProductReadError('商品详情返回无效，请重试');
   if(!isCurrent(generation))throw stale();
   if(stamp!==versionEpoch&&result.catalogVersion!==version)throw new ProductReadError('商品资料已更新，请重试','STALE_DATA',{stale:true});
   acceptVersion(result.catalogVersion);
   const products=await consume(result.catalog,result.identities,{isCurrent:()=>isCurrent(generation)&&version===result.catalogVersion});
   if(!isCurrent(generation)||version!==result.catalogVersion)throw stale();
   const value={...result,products,unresolved:result.unresolved||[]};
   details.set(key,{version,at:Date.now(),value});if(details.size>150)details.delete(details.keys().next().value);
   return value;
  });
 }
 async function resolveBarcode(raw){
  if(typeof raw!=='string')throw new ProductReadError('条码必须保留原字符串','VALIDATION');
  const code=raw.trim();if(!code)return {kind:'not-found',code,candidates:[],products:[]};
  return deduplicated('barcode:'+code,()=>request(endpoints.barcode+'?code='+encodeURIComponent(code)));
 }
 return {list,ensureDetails,resolveBarcode,invalidate:reset,get catalogVersion(){current();return version;},get status(){current();return Object.fromEntries(states);}};
}
