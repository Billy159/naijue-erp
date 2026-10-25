import { createRoot } from 'react-dom/client';
import type { ProductEditorProps } from '../../../../src/products/product-editor-contracts.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import { ProductEditor } from './editor.tsx';
import { ReadScope } from '../../../../src/loading/read-scope.ts';
export interface SourceProductEditorOptions extends ProductEditorProps {readonly http:HttpQueryOptions;readonly catalogueOptions?:import('../catalogue/entry.tsx').CataloguePageOptions}
/** C/F1 supplies the existing session-bound capability and original #page host. */
export function mountProductEditor(host:HTMLElement,options:SourceProductEditorOptions){
 if(!options.parent.active)return()=>{};
 const scope=new ReadScope(options.parent.identity,options.parent.routeInstanceId+':product-editor',options.productId,()=>{});
 const abort=()=>scope.dispose();options.parent.signal.addEventListener('abort',abort,{once:true});
 document.body.classList.add('pc-mode');document.body.classList.remove('gold-mode','inventory-workbench');
 const root=createRoot(host);root.render(<ProductEditor {...options} parent={scope}/>);let disposed=false;
 return()=>{if(disposed)return;disposed=true;options.parent.signal.removeEventListener('abort',abort);root.unmount();scope.dispose();options.parent.dispose();};
}
