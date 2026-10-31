/** Authoritative page styles. Historical demo sheets are reference-only, never layered at runtime. */
export const finalStyleSources:Readonly<Record<string,string>>={
 'ui-tokens.css':'ui-tokens.css','final-base.css':'styles/shared/base-reset-shell.css','styles.css':'styles/shell.css',
 'inventory-workbench.css':'styles/inventory.css','product-current.css':'styles/products.css',
 'basic-settings.css':'styles/settings.css','sales-current.css':'styles/sales.css','transfer-current.css':'styles/transfer.css',
 'inventory-with-products.css':'styles/inventory-with-products.css',
};
export const finalStyleOrder=Object.keys(finalStyleSources);
export const replicaCommonStyles:readonly string[]=['ui-tokens.css','final-base.css','styles.css'];
export const replicaRouteStyles:Readonly<Record<string,string>>={inventory:'inventory-workbench.css',products:'product-current.css',catalogue:'product-current.css',settings:'basic-settings.css',sales:'sales-current.css',transfer:'transfer-current.css'};
export function replicaStyleGroup(route:string):string{return route==='inventory'?'inventory':route.startsWith('products')?'products':route.startsWith('sales')?'sales':route.startsWith('transfer')?'transfer':route.startsWith('settings')||route==='customers'||route==='suppliers'?'settings':'catalogue';}
