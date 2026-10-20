import type {FastifyInstance} from 'fastify';
import {registerBusinessRoute} from '../../security/http.js';
import {object,identifier} from '../../security/errors.js';
import {batchInput,preflight,commit,batchResult} from './reference.js';
export function registerReferenceImportRoutes(app:FastifyInstance):void {
  const selection={kind:'reference-import' as const,kinds:['products','masters'] as const};
  registerBusinessRoute(app,{method:'POST',url:'/api/imports/references/preflight',resolve:()=>({id:'imports.referencePreflight',selection}),handler:(context,request)=>preflight(context,batchInput(request.body))});
  registerBusinessRoute(app,{method:'POST',url:'/api/imports/references/commit',resolve:request=>{const input=object(request.body);return {id:'imports.referenceCommit',selection,locks:[{scope:'reference',key:'master-data-catalog'},{scope:'reference',key:'product-catalog'},{scope:'barcode',key:'product-barcodes'},{scope:'inventory',key:'posting-ledger'},
    {scope:'idempotency',key:'reference-batch:'+identifier(input['batchId'])},{scope:'idempotency',key:'reference-request:'+identifier(input['requestKey'])}]};},handler:(context,request)=>commit(context,object(request.body))});
  registerBusinessRoute(app,{method:'GET',url:'/api/imports/references/result',resolve:()=>({id:'imports.referencePreflight',selection}),handler:(context,request)=>batchResult(context,object(request.query)['batchId'])});
}
