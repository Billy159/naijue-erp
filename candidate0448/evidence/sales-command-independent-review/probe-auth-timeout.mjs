import { ReadContext } from '../../apps/web/src/loading/read-scope.ts';
import { SalesCommandWorkspace } from '../../apps/web/src/sales/commands/controller.ts';
import { createSalesCommandHttpClient } from '../../apps/web/src/sales/commands/http-client.ts';
import { detail,draft,save } from '../../apps/web/src/sales/commands/fixtures.test-support.ts';
for (const status of [401,403]){
 const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',timeoutMs:10,fetch:async()=>new Response(new ReadableStream({}),{status,headers:{'Content-Type':'application/json'}})});
 const context=new ReadContext({accountId:'INDEPENDENT',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('AUTH-TIMEOUT');let access=0;
 const w=new SalesCommandWorkspace({scope,client,reader:{readDetail:async()=>detail()},newRequestKey:()=>`independent-auth-${status}`,onAccessFailure:()=>{access++;}});
 w.openCreate(draft());await w.submit('SAVE');console.log(JSON.stringify({status,kind:w.getSnapshot().write.error?.kind,scopeActive:scope.active,oldDraftRetained:!!w.getSnapshot().editor?.draft,access}));w.dispose();
}
