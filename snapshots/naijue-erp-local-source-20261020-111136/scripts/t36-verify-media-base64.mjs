/** T36 regression: the actual media route parser must accept an 8 MiB base64 body.
 * Identity and media storage are synthetic doubles; no database/filesystem writes.
 */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {pathToFileURL} from 'node:url';
const source=process.env.T36_MEDIA_MODULE;
assert.ok(source?.startsWith('/'),'Explicit compiled media route module required');
const {registerMediaRoutes}=await import(pathToFileURL(source));
const productId='33000000-0000-4000-8000-000000000007';
const bytes=Buffer.alloc(8*1024*1024,1),valid=bytes.toString('base64');
const app=Fastify({bodyLimit:12*1024*1024});let staged=0;
app.identity={execute:async(_token,_id,_selection,work)=>work({actor:{id:'synthetic-parser-only'},repo:{runtime:'"synthetic"'},session:{query:async()=>({rows:[]})}})};
app.addHook('onRequest',async request=>{request.identityToken='synthetic-parser-only';});
const store={stage:async input=>{assert.deepEqual(input.bytes,bytes);staged++;return {mediaId:productId,expiresAt:new Date(Date.now()+60000).toISOString()};},token:()=>({state:'STAGED'})};
registerMediaRoutes(app,store);
const send=base64=>app.inject({method:'POST',url:'/api/media/'+productId+'/stage',payload:{productId,requestKey:'t36-parser-regression',declaredType:'image/png',file:{name:'synthetic.png',base64}}});
try{
 const response=await send(valid);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.state,'STAGED');assert.equal(staged,1);
 for(const [name,encoded] of [['bad-character','!!!!'],['whitespace','AA==\n'],['missing-padding','AA'],['misplaced-padding','A=AA'],['noncanonical-pad-bits','AB=='],['oversized-encoded',Buffer.alloc(8*1024*1024+3).toString('base64')],['empty','']]){
  const rejected=await send(encoded);assert.equal(rejected.statusCode,400,name+': '+rejected.body);
 }
 assert.equal(staged,1);console.log(JSON.stringify({status:'PASS_SCOPED_MEDIA_BASE64_ROUTE_REGRESSION',actualRouteParser:true,maximumFileBytes:bytes.length,maximumBase64Bytes:valid.length,invalidCases:7,acceptedStageCalls:staged,syntheticIdentityAndStore:true,databaseConnections:0}));
}finally{await app.close();}
