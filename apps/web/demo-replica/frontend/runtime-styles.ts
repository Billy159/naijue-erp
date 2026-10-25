import { frozenStyleOrder as order } from './frozen-style-order.ts';
const common: readonly string[] = ["ui-tokens.css", "styles.css", "gold.css", "interaction-common.css", "ui-review.css", "final-ui.css", "brand-components.css", "golden-consistency.css", "unified-single-select.css", "confirmation-dialogs.css"];
const groups: Readonly<Record<string, readonly string[]>> = {
 inventory:['inventory-workbench.css','matrix-experiments.css','inventory-refinement.css','product-inventory-unified.css','inventory-ledger.css'],
 products:['inventory-workbench.css','inventory-refinement.css','product-current.css','product-refinement.css','product-inventory-unified.css','product-rework.css'],
 catalogue:['inventory-workbench.css','inventory-refinement.css','product-current.css','product-refinement.css','product-inventory-unified.css','product-rework.css'],
 settings:['inventory-workbench.css','inventory-refinement.css','basic-settings.css'],
 sales:['inventory-workbench.css','inventory-refinement.css','sales-current.css','entry-shared.css','matrix-experiments.css','sales-returns.css','sales-golden.css','sales-refinement.css','sales-detail-alignment.css','product-current.css'],
 transfer:['inventory-workbench.css','inventory-refinement.css','transfer-current.css','entry-shared.css','matrix-experiments.css','transfer-scan-drawer.css','product-current.css','product-inventory-unified.css'],
};
const slots = new Map(order.map(name => {const anchor=document.createComment('frozen-style:'+name);document.head.append(anchor);return [name,anchor] as const;}));
const loaded = new Map<string,{node:HTMLLinkElement;ready:Promise<void>}>();
// Approved v16 adds a separate responsible employee to the original document header.
// Keep the original narrow-screen layout; this selector applies only to the paired consumer.
const approvedDocumentHeaderStyle=document.createElement('style');
approvedDocumentHeaderStyle.dataset.approvedContract='v16-document-responsibility';
approvedDocumentHeaderStyle.textContent='@media(min-width:1351px){.tc-editor .tc-gold-doc-fields[data-document-responsibility=v16]{grid-template-columns:160px minmax(180px,1fr) minmax(180px,1fr) minmax(155px,.7fr) minmax(130px,.55fr) minmax(130px,.55fr) auto}}';
document.head.append(approvedDocumentHeaderStyle);

// Frozen transfer-current.css contains the shared sidebar rule. Keep it outside route-scoped stylesheet removal.
const sharedNavigationStyle=document.createElement('style');
sharedNavigationStyle.dataset.replicaSharedNavigation='';
sharedNavigationStyle.textContent=".tc-nav-group>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between}.tc-nav-group>summary::-webkit-details-marker{display:none}.tc-nav-group>summary:after{content:'';width:6px;height:6px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(-45deg);margin-right:9px}.tc-nav-group[open]>summary:after{transform:rotate(45deg)}.tc-nav-children>.nav.child{padding-left:42px}";
document.head.append(sharedNavigationStyle);

let assetBase='/';
export function configureReplicaStyleAssetBase(base:string):void { assetBase=base; }
export async function prepareReplicaCommonStyles(signal:AbortSignal):Promise<void>{
 if(signal.aborted)throw new DOMException('Startup cancelled','AbortError');
 await Promise.all(common.map(ensure));
 if(signal.aborted)throw new DOMException('Startup cancelled','AbortError');
}
function ensure(name:string):Promise<void>{
 const existing=loaded.get(name);if(existing)return existing.ready;
 const node=document.createElement('link');node.rel='stylesheet';node.href=assetBase+'source-styles/'+name;node.dataset.frozenStyle=name;
 const ready=new Promise<void>((resolve,reject)=>{node.onload=()=>resolve();node.onerror=()=>{loaded.delete(name);node.remove();reject(new Error('Stylesheet unavailable: '+name));};});
 loaded.set(name,{node,ready});slots.get(name)!.after(node);return ready;
}
export async function prepareReplicaStyles(route:string,signal:AbortSignal):Promise<void>{
 if(signal.aborted)throw new DOMException('Route cancelled','AbortError');
 const key=route==='inventory'?'inventory':route.startsWith('products')?'products':route.startsWith('sales')?'sales':route.startsWith('transfer')?'transfer':route.startsWith('settings')||route==='customers'||route==='suppliers'?'settings':'catalogue';
 const wanted=new Set([...common,...groups[key]??[]]);
 await Promise.all([...wanted].map(ensure));
 if(signal.aborted)throw new DOMException('Route cancelled','AbortError');
 for(const [name,value] of loaded)if(!wanted.has(name)){value.node.remove();loaded.delete(name);}
}

/** Original inventory product drawer styles load with its first open; keep current page styles. */
export async function prepareInventoryProductDrawerStyles(signal:AbortSignal):Promise<void>{
 if(signal.aborted)throw new DOMException('Drawer cancelled','AbortError');
 await Promise.all(groups.products!.map(ensure));
 if(signal.aborted)throw new DOMException('Drawer cancelled','AbortError');
}
