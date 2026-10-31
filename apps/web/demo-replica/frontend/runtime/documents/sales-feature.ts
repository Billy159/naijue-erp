import type { ReplicaSalesSession } from './sales-session.ts';
import type { SalesListViewState } from './sales-list.tsx';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
import {createDocumentProductActivation} from '../products/document-activation.ts';
export function createSalesFeature(options:ReadyPageOptions,navigate:Navigate){
  const {session}=options;
  let sales:ReplicaSalesSession|null=null,salesView:SalesListViewState|null=null;
  let salesViewScope:ReadScope|null=null;
  const documentProductActivation=(host:HTMLElement,scope:ReadScope)=>createDocumentProductActivation(session,host,scope);
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if ((route==='sales'||route==='sales/new'||route.startsWith('sales/view/')||route.startsWith('sales/edit/')||route.startsWith('sales/history/')) && config.sales) {
      const [module,factory,references,products] = await Promise.all([import('./sales-entry.tsx'),import('./sales-session.ts'),import('../../../../src/sales/http-reader.ts'),import('../../../../src/transport/product-http-reader.ts')]);
      if(!scope.active)return {dispose:()=>{},canLeave:()=>true};
      if(!sales?.scope.active)sales=factory.createReplicaSalesSession(session,{instanceId:'replica-sales-owner',newRequestKey:options.newRequestKey,responsibleReady:config.documentResponsibleReady===true});
      if (!salesViewScope?.active) {
        salesViewScope = session.reads.createScope('replica-sales-list-view');
        salesView = module.newSalesListViewState();
        const viewOwner = salesViewScope;
        viewOwner.signal.addEventListener('abort', () => {
          if (salesViewScope === viewOwner) { salesView = null; salesViewScope = null; }
        }, { once: true });
      }
      const resetSales=()=>{sales?.dispose();sales=null;};
      const activation=config.salesProductFullPage&&config.products&&config.productFullPage?documentProductActivation(host,scope):null;
      try{const mounted=module.mountSales(host,route,{principal,session:sales,scope,view:salesView!,references:references.createSalesFilterReferenceHttpReader(http),productReader:products.createProductHttpReader(http),http,historyRevision:options.historyRevision?.sales===true,newRequestKey:options.newRequestKey,manualCreate:config.salesManualCreate===true,existingEdit:config.salesExistingEdit===true,denied:session.onAccessFailure,navigate,onCommitted:resetSales,onDiscarded:resetSales,...(activation?{viewProduct:(product:{id:string;label:string})=>{void activation.open(product);}}:{})});return {...mounted,dispose:()=>{activation?.dispose();mounted.dispose();}};}catch(error){activation?.dispose();throw error;}
    }
    throw new Error('此页面尚未接入当前版本。');
  }
  const prepare=(route:string)=>Promise.all([import('./sales-entry.tsx'),import('./sales-session.ts'),route==='sales'?import('./sales-list-page.tsx'):route==='sales/new'?import('./sales-new-page.tsx'):route.startsWith('sales/edit/')?import('./sales-edit-page.tsx'):route.startsWith('sales/history/')?import('./history-page.tsx'):import('./sales-detail-page.tsx')]);
  return {prepare,mount,hasUnresolvedWrite:()=>!!sales?.scope.active&&(sales.editor.commands.hasUnresolvedWrite||[...sales.historyOwners.values()].some(entry=>entry.owner.unresolved)),dispose(){salesViewScope?.dispose();salesViewScope=null;salesView=null;sales?.dispose();sales=null;}};
}
