const order: readonly string[] = ["ui-tokens.css", "styles.css", "gold.css", "product-current.css", "inventory-workbench.css", "transfer-current.css", "sales-current.css", "entry-shared.css", "matrix-experiments.css", "interaction-common.css", "sales-returns.css", "basic-settings.css", "ui-review.css", "final-ui.css", "brand-components.css", "inventory-refinement.css", "golden-consistency.css", "unified-single-select.css", "sales-golden.css", "transfer-scan-drawer.css", "confirmation-dialogs.css", "sales-refinement.css", "product-refinement.css", "sales-detail-alignment.css", "product-inventory-unified.css", "product-rework.css", "inventory-ledger.css"];
const common: readonly string[] = ["ui-tokens.css", "styles.css", "gold.css", "interaction-common.css", "ui-review.css", "final-ui.css", "brand-components.css", "golden-consistency.css", "unified-single-select.css", "confirmation-dialogs.css"];
const groups: Readonly<Record<string, readonly string[]>> = {
 inventory:['inventory-workbench.css','inventory-refinement.css','product-inventory-unified.css','inventory-ledger.css'],
 products:['product-current.css','product-refinement.css','product-inventory-unified.css','product-rework.css'],
 catalogue:['product-current.css','product-refinement.css','product-inventory-unified.css','product-rework.css'],
 settings:['basic-settings.css'],
 sales:['sales-current.css','entry-shared.css','matrix-experiments.css','sales-returns.css','sales-golden.css','sales-refinement.css','sales-detail-alignment.css','product-current.css'],
 transfer:['transfer-current.css','entry-shared.css','matrix-experiments.css','transfer-scan-drawer.css','product-current.css','product-inventory-unified.css'],
};
const slots = new Map(order.map(name => {const anchor=document.createComment('frozen-style:'+name);document.head.append(anchor);return [name,anchor] as const;}));
const loaded = new Map<string,{node:HTMLLinkElement;ready:Promise<void>}>();
function ensure(name:string):Promise<void>{
 const existing=loaded.get(name);if(existing)return existing.ready;
 const node=document.createElement('link');node.rel='stylesheet';node.href='/source-styles/'+name;node.dataset.frozenStyle=name;
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
