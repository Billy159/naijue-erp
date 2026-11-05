/** Real API plugin + original strict web decoder, in-process inject only.
 * The synthetic trusted-actor adapter is NOT a login/session authentication test. */
import Fastify from 'fastify';import assert from 'node:assert/strict';
export async function runHttpProtocol({before,after,pool,fixture:f,step=async(_label,work)=>work()}) {
 const parameters={context:{kind:'TRANSFER'},skuIds:[...f.requested]},expectedSkus=f.requested.map(id=>f.good.find(s=>s.id===id)),expectedProducts=f.orderedProducts.map(productId=>({productId,state:'ELIGIBLE',sizeGroupId:productId===f.base.productId?f.base.targetGroupId:f.otherProduct.groupId})),events=[];
 async function using({reader,actor=f.base.actor},work){const app=Fastify({logger:false});app.register(after.http({reader,authenticate:async()=>actor}));await app.ready();
  const web=after.webFactory({origin:'http://127.0.0.1',basePath:'',fetch:async(url,init)=>{const parsed=new URL(url);assert.equal(parsed.origin,'http://127.0.0.1');assert.equal(init.method,'POST');const response=await app.inject({method:'POST',url:parsed.pathname,headers:Object.fromEntries(new Headers(init.headers)),payload:init.body});const body=response.json();events.push({path:parsed.pathname,status:response.statusCode,bytes:Buffer.byteLength(response.body),body});
    if(response.statusCode===200&&parsed.pathname==='/current-form/saved-edit-sku-batch-v2/query'){assert.equal(body.version,2);assert.deepEqual(Object.keys(body).sort(),['products','skus','version']);assert(body.skus.every(s=>Array.isArray(s)&&s.length===13&&s.every(v=>typeof v==='string')&&s[12]==='UNAVAILABLE'));assert(body.products.every(p=>Array.isArray(p)&&p.length===3&&p[1]==='ELIGIBLE'));}
    assert.equal(response.headers['cache-control'],'no-store');return new Response(response.body,{status:response.statusCode,headers:{'content-type':'application/json'}});}});
  try{return await work(web);}finally{await app.close();}}
 const reader=new after.Reader(pool,after.authorization());
 const saved=await step('HTTP-v2-original-plugin-and-web-decoder',()=>using({reader},async web=>web.readSavedEditSkuBatch(parameters,new AbortController().signal)));assert.deepEqual(saved,{version:1,skus:expectedSkus,products:expectedProducts});
 const bare=await step('HTTP-legacy-bare-array',()=>using({reader},async web=>web.readSkuBatch(parameters,new AbortController().signal)));assert.deepEqual(bare,expectedSkus);assert(Array.isArray(events.find(e=>e.path==='/current-form/sku-batch/query').body));
 const policy=after.authorization(),deny={async authorize(context,intent,signal){const grant=await policy.authorize(context,intent,signal);if(intent.kind==='saved-edit-sku-batch')throw new after.DomainError('FORBIDDEN','Finite host refuses new metadata intent');return grant;}};
 const failures=[];
 for(const [name,options,kind]of [['HTTP-denied-new-intent',{reader:new after.Reader(pool,deny)},'forbidden'],['HTTP-unknown-actor',{reader,actor:{accountId:f.outsideSize.id,hallId:null}},'forbidden'],['HTTP-missing-new-method',{reader:new before.Reader(pool,before.authorization())},'unavailable'],['HTTP-no-authenticated-actor',{reader,actor:null},'unauthenticated']]){
  await assert.rejects(step(name,()=>using(options,web=>web.readSavedEditSkuBatch(parameters,new AbortController().signal))),e=>e.kind===kind);failures.push({case:name,kind});}
 await assert.rejects(step('HTTP-invalid-member-sku',()=>using({reader},web=>web.readSavedEditSkuBatch({context:parameters.context,skuIds:[f.base.skuIds[0],f.bad.find(x=>x.kind==='missing-member').id]},new AbortController().signal))),e=>e.kind==='conflict');failures.push({case:'HTTP-invalid-member-sku',kind:'conflict'});
 return{scope:'IN_PROCESS_ORIGINAL_HTTP_WEB_DECODE_OVER_REAL_POOL_NOT_BROWSER_SESSION_NETWORK_OR_PERFORMANCE',wireVersion:2,decodedDomainVersion:1,saved,bare,failures,events,sessionAuthenticationClaim:false,largePayloadAcceptanceClaim:false};
}
