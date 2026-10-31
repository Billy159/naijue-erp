import {loadInventoryProductDrawerModule} from '../common/inventory-product-loader.ts';
import {createInventoryProductActivation} from '../common/inventory-product-activation.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { InventoryMountOptions, InventoryProductContext, InventoryQuerySnapshot } from './index.tsx';
import { snapshotQueryParameters } from '../../../../src/loading/query-parameters.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
export function createInventoryFeature(options:ReadyPageOptions,navigate:Navigate){
  const {session}=options;
  let inventoryContextScope: ReadScope | null = null;
  let inventoryQuery: InventoryQuerySnapshot | null = null;
  let inventoryProductContext: InventoryProductContext | null = null;
  const inventoryContextOwner = () => {
    if (!inventoryContextScope?.active) {
      inventoryQuery = null; inventoryProductContext = null;
      inventoryContextScope = session.reads.createScope('replica-inventory-query-context');
      const contextOwner = inventoryContextScope;
      contextOwner.signal.addEventListener('abort', () => {
        if (inventoryContextScope === contextOwner) {
          inventoryQuery = null; inventoryProductContext = null; inventoryContextScope = null;
        }
      }, { once: true });
    }
    return inventoryContextScope;
  };
  const openProductInventory = async (scope: ReadScope, product: InventoryProductContext['product']) => {
    if (!scope.active) return false;
    const contextOwner = inventoryContextOwner();
    const entry = snapshotQueryParameters({ identity: contextOwner.identity, product, previousQuery: inventoryQuery });
    inventoryProductContext = entry;
    let accepted = false;
    try {
      accepted = await navigate('inventory') === true;
      return accepted;
    } finally {
      if (!accepted && inventoryProductContext === entry) inventoryProductContext = null;
    }
  };
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if (route === 'inventory' && config.inventory) {
      const module = await import('./index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const contextOwner = inventoryContextOwner(), productContext = inventoryProductContext;
      const marker='inventory-product:'+scope.routeInstanceId;
      const activation=createInventoryProductActivation({scope,host,load:async mode=>{
        const [drawer,reader]=await Promise.all([loadInventoryProductDrawerModule(mode),import('../../../../src/transport/product-http-reader.ts'),import('../../runtime-styles.ts').then(styles=>styles.prepareInventoryProductDrawerStyles(scope.signal))]);
        return {open:context=>drawer.openInventoryProductDrawer({...context,reader:reader.createProductHttpReader(http),onAccessFailure:session.onAccessFailure})};
      },feedback:state=>{
        const toast=host.ownerDocument.getElementById('toast');if(!toast)return;
        if(state.phase==='ready'||state.phase==='disposed'){if(toast.dataset.inventoryProductOpen===marker){toast.replaceChildren();toast.style.display='none';delete toast.dataset.inventoryProductOpen;}return;}
        toast.dataset.inventoryProductOpen=marker;toast.replaceChildren(state.phase==='loading'?'正在打开商品资料…':'商品资料未能打开，请重试。');toast.style.display='block';
        if(state.phase==='error'&&state.retry){const retry=host.ownerDocument.createElement('button');retry.type='button';retry.className='btn';retry.textContent='重试';retry.onclick=state.retry;toast.append(' ',retry);}
      }});
      let release:()=>void;
      try{release=module.mountInventoryPage(host,{...options.inventory,scope,http,...(productContext?{productContext}:{}),onQueryApplied:snapshot=>{if(scope.active&&contextOwner.active)inventoryQuery=snapshotQueryParameters(snapshot);},onAccessFailure:session.onAccessFailure,onViewProduct:product=>{void activation.open(product);}});inventoryProductContext=null;}catch(error){activation.dispose();throw error;}
      return {dispose:()=>{activation.dispose();release();},canLeave:()=>true};
    }
    throw new Error('此页面尚未接入当前版本。');
  }
  const prepare=(_route:string)=>import('./index.tsx');
  return {prepare,mount,openProductInventory,hasUnresolvedWrite:()=>false,dispose(){inventoryContextScope?.dispose();inventoryContextScope=null;inventoryQuery=null;inventoryProductContext=null;}};
}
