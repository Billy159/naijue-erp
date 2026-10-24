/// <reference path="./inventory-drawer-imports.d.ts" />
/** Code-resource state only, shared across inventory route re-entry in this fixed module version. */
let retrySelected=false;
export function inventoryDrawerModuleMode(requested:'initial'|'retry'):'initial'|'retry'{
 if(requested==='retry')retrySelected=true;
 return retrySelected?'retry':'initial';
}
/** One fixed retry identity. Only explicit UI retry selects it; no timer/counter/automatic loop. */
export function loadInventoryProductDrawerModule(mode:'initial'|'retry'){
 return inventoryDrawerModuleMode(mode)==='retry'
  ? import('../products/inventory-drawer.tsx?inventory-drawer-retry')
  : import('../products/inventory-drawer.tsx');
}
