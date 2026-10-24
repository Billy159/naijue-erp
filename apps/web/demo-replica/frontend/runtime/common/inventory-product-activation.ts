import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import type {Selection} from '../../../../src/inventory/contracts.ts';
export interface InventoryDrawerLeaf {open:(options:{parent:ReadScope;product:Selection;anchor:HTMLElement|null;viewport:HTMLElement|null;onClosed:()=>void})=>()=>void}
export type InventoryProductFeedback={readonly phase:'loading'|'ready'|'error'|'disposed';readonly retry?:()=>void};
/** Own only the asynchronous inventory action. The leaf owns its Drawer and focus/scroll restoration. */
export function createInventoryProductActivation(options:{scope:ReadScope;host:HTMLElement;anchorSelector?:string;viewportSelector?:string;load:(mode:'initial'|'retry')=>Promise<InventoryDrawerLeaf>;feedback:(state:InventoryProductFeedback)=>void}){
 let generation=0,disposed=false,retrySelected=false,drawer:(()=>void)|null=null,anchor:HTMLElement|null=null;
 const capture=(event:Event)=>{const target=event.target;if(target instanceof options.host.ownerDocument.defaultView!.Element){const button=target.closest<HTMLElement>(options.anchorSelector??'button.mx-view');if(button&&options.host.contains(button))anchor=button;}};
 options.host.addEventListener('click',capture,true);
 const open=async(product:Selection)=>{
  if(disposed||!options.scope.active)return;const request=++generation,origin=anchor?.isConnected?anchor:options.host.ownerDocument.activeElement instanceof options.host.ownerDocument.defaultView!.HTMLElement?options.host.ownerDocument.activeElement as HTMLElement:null,viewport=options.host.querySelector<HTMLElement>(options.viewportSelector??'#iw-results');
  drawer?.();drawer=null;options.feedback({phase:'loading'});
  try{const leaf=await options.load(retrySelected?'retry':'initial');if(disposed||!options.scope.active||request!==generation)return;drawer=leaf.open({parent:options.scope,product,anchor:origin,viewport,onClosed:()=>{if(request===generation)drawer=null;}});options.feedback({phase:'ready'});}
  catch{if(!disposed&&options.scope.active&&request===generation)options.feedback({phase:'error',retry:()=>{retrySelected=true;anchor=origin;void open(product);}});}
 };
 const dispose=()=>{if(disposed)return;disposed=true;generation++;options.host.removeEventListener('click',capture,true);options.scope.signal.removeEventListener('abort',dispose);drawer?.();drawer=null;anchor=null;options.feedback({phase:'disposed'});};
 options.scope.signal.addEventListener('abort',dispose,{once:true});if(!options.scope.active)dispose();
 return {open,dispose};
}
