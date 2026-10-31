const loadListPage=()=>import('./transfers-list-page.tsx');
import type {Options} from './transfers-page-contracts.ts';
import {AsyncLeaf} from '../common/async-leaf.tsx';
import {createRoot} from 'react-dom/client';
import type {ReplicaTransferSession} from './transfers-session.ts';
import {transferCanLeave,transferCanDiscard} from './transfers-session.ts';
import {newTransferListViewState} from './transfers-list-state.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import {entityId} from '../../../../../../packages/domain/src/values.ts';
const loadNewTransfer=()=>import('./transfers-create-page.tsx');
const loadSourceHistory=()=>import('./transfers-history-page.tsx');
const loadNativeTransfer=()=>import('./transfers-detail-page.tsx');
export {newTransferListViewState};
function historyTarget(route:string){const parts=route.split('/');if(parts.length!==5)throw new Error('历史调拨单地址无效。');const batchId=decodeURIComponent(parts[2]!),documentId=decodeURIComponent(parts[3]!),effectiveVersion=Number(parts[4]);if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(batchId)||!Number.isSafeInteger(effectiveVersion)||effectiveVersion<1)throw new Error('历史调拨单地址无效。');entityId('transfer',documentId);return {kind:'transfers' as const,batchId,documentId,effectiveVersion};}
export function mountTransfers(host:HTMLElement,route:string,p:Options){
 const root=createRoot(host);let pageGuard:(()=>boolean)|null=null;
 root.render(route.startsWith('transfer/history/')?<AsyncLeaf load={loadSourceHistory} scope={p.scope} label="历史调拨单" pending={<p role="status">正在加载调拨单…</p>} close={()=>p.navigate('transfer')} closeLabel="返回列表">{SourceHistory=><SourceHistory {...(p.viewProduct?{viewProduct:p.viewProduct}:{})} session={p.session} scope={p.scope} http={p.http} target={historyTarget(route)} canEdit={p.historyRevision} newRequestKey={p.newRequestKey} denied={p.denied} navigate={p.navigate} guard={value=>{pageGuard=value;}} committed={()=>{p.view.reload=true;}}/>}</AsyncLeaf>:route==='transfer'?<AsyncLeaf load={loadListPage} scope={p.scope} label="单据列表">{ListPage=><ListPage {...p}/>}</AsyncLeaf>:route==='transfer/new'&&p.manualCreate?<AsyncLeaf load={loadNewTransfer} scope={p.scope} label="调拨录单页" pending={<p role="status">正在加载调拨单…</p>} close={()=>p.navigate('transfer')} closeLabel="返回列表">{NewTransfer=><NewTransfer {...p}/>}</AsyncLeaf>:route.startsWith('transfer/view/')?<AsyncLeaf load={loadNativeTransfer} scope={p.scope} label="调拨单页面" close={()=>p.navigate('transfer')} closeLabel="返回列表">{NativeTransfer=><NativeTransfer {...p} id={decodeURIComponent(route.slice('transfer/view/'.length))}/>}</AsyncLeaf>:<p role="alert">此调拨入口尚未接入当前包。</p>);
 const canDiscard=()=>p.scope.active&&!route.startsWith('transfer/history/')&&transferCanDiscard(p.session);
 return {dispose:()=>{root.unmount();p.session.create.cancelPreparation();p.session.workspace.suspend();},canLeave:()=>transferCanLeave(p.session)&&(pageGuard?.()??true),canDiscard,discard:()=>{if(!canDiscard()||!p.session.workspace.discardEditor()||!p.session.proposal.reset(true))return false;p.reset();return true;}};
}
