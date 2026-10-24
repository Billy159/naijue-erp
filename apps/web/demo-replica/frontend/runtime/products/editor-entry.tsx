import { createRoot } from 'react-dom/client';
import type { ProductEditorProps } from '../../../../src/products/product-editor-contracts.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import { ProductEditor } from './editor.tsx';
export interface SourceProductEditorOptions extends ProductEditorProps {readonly http:HttpQueryOptions;readonly catalogueOptions?:import('../catalogue/entry.tsx').CataloguePageOptions}
/** C/F1 supplies the existing session-bound capability and original #page host. */
export function mountProductEditor(host:HTMLElement,options:SourceProductEditorOptions){
 document.body.classList.add('pc-mode');document.body.classList.remove('gold-mode','inventory-workbench');
 const root=createRoot(host);root.render(<ProductEditor {...options}/>);let disposed=false;
 return()=>{if(disposed)return;disposed=true;root.unmount();options.parent.dispose();};
}
