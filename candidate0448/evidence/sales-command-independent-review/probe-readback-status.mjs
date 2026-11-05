import { ReadContext } from '../../apps/web/src/loading/read-scope.ts';
import { SalesCommandWorkspace } from '../../apps/web/src/sales/commands/controller.ts';
import { detail, draft, result, receipt, uuid } from '../../apps/web/src/sales/commands/fixtures.test-support.ts';
for (const action of ['APPROVE','VOID']) {
 const context=new ReadContext({accountId:'INDEPENDENT',sessionRevision:'1',permissionRevision:'1'});let current=detail(),sent=[];
 const w=new SalesCommandWorkspace({scope:context.createScope('INDEPENDENT'),client:{execute:async c=>{sent.push(c);return result(c)},receipt:async c=>receipt(c)},reader:{readDetail:async()=>current},newRequestKey:()=>`independent-${sent.length}`,onAccessFailure:()=>{}});
 await w.openExisting(uuid(1));await w.submit(action);
 current=detail('DRAFT',3); const refreshed=await w.readCurrent(),adopted=w.adoptCurrent();
 const editable=w.replaceDraft({...draft(),header:{...draft().header,note:'after impossible status'}});
 console.log(JSON.stringify({action,committedStatus:result(sent[0]).status,refreshed,adopted,editable,detailStatus:w.getSnapshot().editor?.detail?.document.header.status}));w.dispose();
}
