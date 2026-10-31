import { createRoot } from 'react-dom/client';
import { createProductHttpReader } from '../../../../src/transport/product-http-reader.ts';
import { createInventoryHttpReader } from '../../../../src/transport/inventory-http-reader.ts';
import { createInventoryOutputReader } from '../../../../src/inventory/output-adapter.ts';
import { createInventoryLedgerHttpReader } from '../../../../src/inventory/ledger-http-reader.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import { InventoryPage, type InventoryPageProps } from './page.tsx';
export type { InventoryProductContext, InventoryQuerySnapshot } from './page.tsx';
export type InventoryMountOptions=Omit<InventoryPageProps,'reader'|'outputReader'|'ledgerReader'|'productReader'>&{http:HttpQueryOptions};
/** F1/C normal #inventory entry calls this once per existing route ReadScope.
 * It mounts only the original inventory body inside the original #page. */
export function mountInventoryPage(host:HTMLElement,options:InventoryMountOptions):()=>void{
 const {http,...props}=options;const root=createRoot(host);root.render(<InventoryPage {...props} reader={createInventoryHttpReader(http)} productReader={createProductHttpReader(http)} outputReader={createInventoryOutputReader(http)} ledgerReader={createInventoryLedgerHttpReader(http)}/>);let disposed=false;
 return()=>{if(disposed)return;disposed=true;root.unmount();};
}
