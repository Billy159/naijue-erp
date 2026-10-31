import type {ReplicaTransferSession} from './transfers-session.ts';
import type {TransferListViewState} from './transfers-list.tsx';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
import {createDocumentProductActivation} from '../products/document-activation.ts';
export function createTransfersFeature(options:ReadyPageOptions,navigate:Navigate){
  const {session}=options;
  let transfers:ReplicaTransferSession|null=null,transferView:TransferListViewState|null=null;
  let transferViewScope:ReadScope|null=null;
  const documentProductActivation=(host:HTMLElement,scope:ReadScope)=>createDocumentProductActivation(session,host,scope);
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if ((route==='transfer'||route.startsWith('transfer/'))&&config.transfers){
      const [module,factory,products]=await Promise.all([import('./transfers-entry.tsx'),import('./transfers-session.ts'),import('../../../../src/transport/product-http-reader.ts')]);
      if(!scope.active)return {dispose:()=>{},canLeave:()=>true};
      if(route==='transfer/new'&&transfers?.scope.active&&transfers.workspace.getSnapshot().editor&&factory.transferCanLeave(transfers)){transfers.dispose();transfers=null;}
      if(!transfers?.scope.active)transfers=factory.createReplicaTransferSession(session,{instanceId:'replica-transfer-owner',newRequestKey:options.newRequestKey,responsibleReady:config.documentResponsibleReady===true});
      if (!transferViewScope?.active) {
        transferViewScope = session.reads.createScope('replica-transfer-list-view');
        transferView = module.newTransferListViewState();
        const viewOwner = transferViewScope;
        viewOwner.signal.addEventListener('abort', () => {
          if (transferViewScope === viewOwner) { transferView = null; transferViewScope = null; }
        }, { once: true });
      }
      // Original document View opens the six-tab page; the parent draft stays mounted.
      const activation=config.transferProductFullPage&&config.products&&config.productFullPage?documentProductActivation(host,scope):null;
      try{const mounted=module.mountTransfers(host,route,{manualCreate:config.transferManualCreate===true,reset:()=>{transfers?.dispose();transfers=null;transferView!.reload=true;},productReader:products.createProductHttpReader(http),session:transfers,scope,view:transferView!,existingEdit:config.transferExistingEdit===true,http,historyRevision:options.historyRevision?.transfers===true,newRequestKey:options.newRequestKey,denied:session.onAccessFailure,navigate,...(activation?{viewProduct:(product:{id:string;label:string})=>{void activation.open(product);}}:{})});return {...mounted,dispose:()=>{activation?.dispose();mounted.dispose();}};}catch(error){activation?.dispose();throw error;}
    }
    throw new Error('此页面尚未接入当前版本。');
  }
  const prepare=(route:string)=>Promise.all([import('./transfers-entry.tsx'),import('./transfers-session.ts'),route==='transfer'?import('./transfers-list-page.tsx'):route==='transfer/new'?import('./transfers-create-page.tsx'):route.startsWith('transfer/history/')?import('./transfers-history-page.tsx'):import('./transfers-detail-page.tsx')]);
  return {prepare,mount,hasUnresolvedWrite:()=>!!transfers?.scope.active&&(transfers.workspace.hasUnresolvedWrite||[...transfers.historyOwners.values()].some(entry=>entry.owner.unresolved)),dispose(){transferViewScope?.dispose();transferViewScope=null;transferView=null;transfers?.dispose();transfers=null;}};
}
