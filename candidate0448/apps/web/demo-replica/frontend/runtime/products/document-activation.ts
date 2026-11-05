import type {ReplicaSession} from '../common/session.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import {entityId} from '../../../../../../packages/domain/src/values.ts';
import {createInventoryProductActivation,type InventoryDrawerLeaf} from '../common/inventory-product-activation.ts';
import {loadInventoryProductDrawerModule} from '../common/inventory-product-loader.ts';
/** The document retains its draft, route and viewport. Product inspection uses
 * the same readonly leaf as inventory; it never writes current data into history. */
export function createDocumentProductActivation(session:ReplicaSession,host:HTMLElement,scope:ReadScope,
 load:((mode:'initial'|'retry')=>Promise<InventoryDrawerLeaf>)=async mode=>{
  const [drawer,reader]=await Promise.all([loadInventoryProductDrawerModule(mode),import('../../../../src/transport/product-http-reader.ts'),import('../../runtime-styles.ts').then(styles=>styles.prepareInventoryProductDrawerStyles(scope.signal))]);
  return {open:context=>drawer.openInventoryProductDrawer({...context,reader:reader.createProductHttpReader(session.http),onAccessFailure:session.onAccessFailure})};
 }){
 let disposed=false;const marker='document-product:'+scope.routeInstanceId;
 const activation=createInventoryProductActivation({scope,host,anchorSelector:'button[data-document-product]',viewportSelector:'.sale-lines,#tc-lines',load,feedback:state=>{
  const toast=host.ownerDocument.getElementById('toast');if(!toast)return;
  if(state.phase==='ready'||state.phase==='disposed'){if(toast.dataset.documentProductOpen===marker){toast.replaceChildren();toast.style.display='none';delete toast.dataset.documentProductOpen;}return;}
  toast.dataset.documentProductOpen=marker;toast.replaceChildren(state.phase==='loading'?'正在打开商品资料…':'商品资料未能打开，请重试。');toast.style.display='block';
  if(state.phase==='error'&&state.retry){const retry=host.ownerDocument.createElement('button');retry.type='button';retry.className='btn';retry.textContent='重试';retry.onclick=state.retry;toast.append(' ',retry);}
 }});
 return {async open(product:{id:string;label:string}){
  if(disposed||!scope.active)return false;
  const auth=session.auth.getSnapshot();
  if(auth.phase!=='authenticated'||auth.principal?.accountId!==scope.identity.accountId)return false;
  entityId('product',product.id);await activation.open(product);return true;
 },dispose(){if(disposed)return;disposed=true;activation.dispose();}};
}
