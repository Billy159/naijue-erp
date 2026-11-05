import type { ReadScope } from '../../../../src/loading/read-scope.ts';
/** One application-owned autofocus opportunity per readonly drawer instance.
 * The existing opener and scopes own this opportunity; never retry it later. */
export function createDrawerMountFocus(options:{
 workbench:{current:HTMLDivElement|null};scope:Pick<ReadScope,'active'>;
 parent:Pick<ReadScope,'active'>;anchor:HTMLElement|null;
}):(node:HTMLDivElement|null)=>void {
 let attempted=false;
 return node=>{
  options.workbench.current=node;
  if(!node||attempted)return;
  // Consume even a refused first mount, including StrictMode/ref remounts.
  // A later return to the opener is not a new autofocus authorization.
  attempted=true;
  const opener=options.anchor,document=node.ownerDocument;
  if(!node.isConnected||!options.scope.active||!options.parent.active||!document.hasFocus()||
   !opener?.isConnected||opener.ownerDocument!==document||document.activeElement!==opener)return;
  node.focus({preventScroll:true});
 };
}
