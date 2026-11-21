import { createRoot } from 'react-dom/client';
import type { HttpQueryOptions,HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { createProductManagementHttpReader } from '../../../../src/products/http-reader.ts';
import { createProductHttpReader } from '../../../../src/transport/product-http-reader.ts';
import { ProductList } from './list.tsx';
export interface ProductListMountOptions {notify?:(message:string)=>void;scope:ReadScope;http:HttpQueryOptions;onAccessFailure:(e:HttpQueryError)=>void;openEditor:(id:string|null)=>void;openDetails?:(id:string)=>void}
/** Same original #products route/host; C/F1 owns routing and session. */
export function mountProductList(host:HTMLElement,options:ProductListMountOptions){const root=createRoot(host);root.render(<ProductList {...(options.notify?{notify:options.notify}:{})} scope={options.scope} reader={createProductManagementHttpReader(options.http)} productReader={createProductHttpReader(options.http)} onAccessFailure={options.onAccessFailure} openEditor={options.openEditor} {...(options.openDetails?{openDetails:options.openDetails}:{})}/>);let disposed=false;return()=>{if(disposed)return;disposed=true;root.unmount();};}
