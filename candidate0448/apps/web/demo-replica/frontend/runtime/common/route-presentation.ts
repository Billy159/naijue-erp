const modes=['pc-mode','gold-mode','inventory-workbench','sale-mode','tc-mode'] as const;
export function routePresentationModes(route:string):readonly string[]{
 if(route==='inventory')return ['gold-mode','inventory-workbench'];
 if(route==='products'||route.startsWith('products/')||['product-categories','product-settings','barcode-schemes'].includes(route))return ['pc-mode'];
 if(route==='sales'||route.startsWith('sales/'))return ['sale-mode','gold-mode'];
 if(route==='transfer'||route.startsWith('transfer/'))return ['tc-mode','gold-mode'];
 return [];
}
/** Only the shell owns route presentation. Page-owned selectors use the page mode attribute; shell/portals retain body compatibility. */
export function createRoutePresentationOwner(page:HTMLElement){
 const body=page.ownerDocument.body,original=modes.filter(mode=>body.classList.contains(mode));
 const clear=()=>{body.classList.remove(...modes);delete page.dataset.replicaRoute;delete page.dataset.replicaModes;};
 return {clear,activate(route:string){clear();const active=routePresentationModes(route);page.dataset.replicaRoute=route;page.dataset.replicaModes=active.join(' ');body.classList.add(...active);},dispose(){clear();body.classList.add(...original);}};
}
