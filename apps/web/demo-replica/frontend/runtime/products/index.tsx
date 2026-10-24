import { createRoot } from 'react-dom/client';
import type { HttpQueryOptions,HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { createProductManagementHttpReader } from '../../../../src/products/http-reader.ts';
import { createProductHttpReader } from '../../../../src/transport/product-http-reader.ts';
import { ProductList } from './list.tsx';
export interface ProductListMountOptions {scope:ReadScope;http:HttpQueryOptions;onAccessFailure:(e:HttpQueryError)=>void;openEditor:(id:string|null)=>void}
/** Same original #products route/host; C/F1 owns routing and session. */
export function mountProductList(host:HTMLElement,options:ProductListMountOptions){const root=createRoot(host);document.body.classList.add('pc-mode');document.body.classList.remove('gold-mode','inventory-workbench');root.render(<ProductList scope={options.scope} reader={createProductManagementHttpReader(options.http)} productReader={createProductHttpReader(options.http)} onAccessFailure={options.onAccessFailure} openEditor={options.openEditor}/>);let disposed=false;return()=>{if(disposed)return;disposed=true;root.unmount();options.scope.dispose();};}
export async function mountProductDetail(host:HTMLElement,options:import('./detail.tsx').ProductDetailOptions){const {ProductDetail}=await import('./detail.tsx');if(!options.scope.active)return()=>{};const root=createRoot(host);document.body.classList.add('pc-mode');document.body.classList.remove('gold-mode','inventory-workbench');root.render(<ProductDetail {...options}/>);let disposed=false;return()=>{if(disposed)return;disposed=true;root.unmount();options.scope.dispose();};}
