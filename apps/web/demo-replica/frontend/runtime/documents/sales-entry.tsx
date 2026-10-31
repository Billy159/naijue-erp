const loadListPage=()=>import('./sales-list-page.tsx');
import {AsyncLeaf} from '../common/async-leaf.tsx';
import { createRoot } from 'react-dom/client';
import {newSalesListViewState} from './sales-list-state.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import type {Options} from './sales-page-contracts.ts';
import {salesCanLeave,salesCanDiscard} from './sales-session.ts';
export {salesCanLeave} from './sales-session.ts';
const loadImportedHistory=()=>import('./history-page.tsx');
const loadNewDocument=()=>import('./sales-new-page.tsx');
const loadEditDocument=()=>import('./sales-edit-page.tsx');
const loadReadDocument=()=>import('./sales-detail-page.tsx');
export {newSalesListViewState};
function historyRouteTarget(route:string){const parts=route.split('/');if(parts.length!==5)throw new Error('历史单据地址无效。');const batchId=decodeURIComponent(parts[2]!),documentId=decodeURIComponent(parts[3]!),effectiveVersion=Number(parts[4]);if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(batchId)||!Number.isSafeInteger(effectiveVersion)||effectiveVersion<1)throw new Error('历史单据地址无效。');entityId('sales',documentId);return {kind:'sales' as const,batchId,documentId,effectiveVersion};}
export function mountSales(host:HTMLElement,route:string,p:Options){

 const root=createRoot(host);let pageGuard:(()=>boolean)|null=null;const canLeave=()=>salesCanLeave(p.session)&&(pageGuard?.()??true);
 root.render(route.startsWith('sales/history/')?<AsyncLeaf load={loadImportedHistory} scope={p.scope} label="历史销货单" pending={<p role="status">正在加载单据…</p>} close={()=>p.navigate('sales')} closeLabel="返回列表">{ImportedHistory=><ImportedHistory {...(p.viewProduct?{viewProduct:p.viewProduct}:{})} session={p.session} scope={p.scope} http={p.http} target={historyRouteTarget(route)} canEdit={p.historyRevision} newRequestKey={p.newRequestKey} denied={p.denied} navigate={p.navigate} guard={value=>{pageGuard=value;}} committed={()=>{p.view.reload=true;}}/>}</AsyncLeaf>:route==='sales'?<AsyncLeaf load={loadListPage} scope={p.scope} label="单据列表">{ListPage=><ListPage {...p}/>}</AsyncLeaf>:route==='sales/new'&&p.manualCreate?<AsyncLeaf load={loadNewDocument} scope={p.scope} label="销货单页面" close={()=>p.navigate('sales')} closeLabel="返回列表">{NewDocument=><NewDocument {...p}/>}</AsyncLeaf>:route.startsWith('sales/edit/')&&p.existingEdit?<AsyncLeaf load={loadEditDocument} scope={p.scope} label="销货单页面" close={()=>p.navigate('sales')} closeLabel="返回列表">{EditDocument=><EditDocument {...p} id={decodeURIComponent(route.slice('sales/edit/'.length))}/>}</AsyncLeaf>:route.startsWith('sales/view/')?<AsyncLeaf load={loadReadDocument} scope={p.scope} label="销货单页面" close={()=>p.navigate('sales')} closeLabel="返回列表">{ReadDocument=><ReadDocument {...p} id={decodeURIComponent(route.slice('sales/view/'.length))}/>}</AsyncLeaf>:<p role="alert">当前版本未开放此销货操作。</p>);
 const canDiscard=()=>p.scope.active&&!route.startsWith('sales/history/')&&salesCanDiscard(p.session);
 return {dispose:()=>{root.unmount();p.session.create.cancelPreparation();p.session.editor.suspend();},canLeave:()=>canLeave(),canDiscard,discard:()=>{if(!canDiscard()||!p.session.editor.discardEditor(true)||!p.session.proposal.reset(true))return false;p.onDiscarded();return true;}};
}
