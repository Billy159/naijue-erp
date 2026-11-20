/** Authoritative page styles. Historical demo sheets are reference-only, never layered at runtime. */
export const finalStyleSources:Readonly<Record<string,string>>={
 'arco-documents.css':'styles/arco-documents.css','arco-products.css':'styles/arco-products.css',
 'arco-settings.css':'styles/arco-settings.css','arco-catalogue.css':'styles/arco-catalogue.css',
 'ui-tokens.css':'ui-tokens.css','final-base.css':'styles/shared/base-reset-shell.css','styles.css':'styles/shell.css',
 'inventory-workbench.css':'styles/inventory.css','product-current.css':'styles/products.css',
 'basic-settings.css':'styles/settings.css','sales-current.css':'styles/sales.css','transfer-current.css':'styles/transfer.css',
 'inventory-with-products.css':'styles/inventory-with-products.css',
};
export const finalStyleOrder=Object.keys(finalStyleSources);
export const replicaCommonStyles:readonly string[]=['ui-tokens.css','final-base.css','styles.css'];
export const replicaRouteStyles:Readonly<Record<string,string>>={inventory:'inventory-workbench.css',products:'product-current.css',catalogue:'product-current.css',settings:'basic-settings.css',sales:'sales-current.css',transfer:'transfer-current.css'};
export function replicaStyleGroup(route:string):string{return route==='inventory'?'inventory':route.startsWith('products')?'products':route.startsWith('sales')?'sales':route.startsWith('transfer')?'transfer':route.startsWith('settings')||route==='customers'||route==='suppliers'?'settings':'catalogue';}

/** Inventory and documents share the date, product picker and read-only product drawer. */
export const replicaRouteArco:Readonly<Record<string,string>>={inventory:'arco-documents.css',sales:'arco-documents.css',transfer:'arco-documents.css',products:'arco-products.css',catalogue:'arco-catalogue.css',settings:'arco-settings.css'};
