import {finalStyleOrder as order,replicaCommonStyles as common,replicaRouteStyles,replicaStyleGroup} from './style-manifest.ts';
// One active page sheet before lazy component styles. New resources load inertly,
// then switch atomically; an aborted read scope must never activate stale styles.
const slots=new Map(order.map(name=>{
 const existing=[...document.head.childNodes].find(node=>node.nodeType===8&&node.textContent==='frozen-style:'+name);
 const anchor=existing??document.createComment('frozen-style:'+name);if(!existing)document.head.append(anchor);return [name,anchor] as const;
}));
const loaded=new Map<string,{node:HTMLLinkElement;ready:Promise<void>}>();
let assetBase='/',activeGroup='catalogue',generation=0;
export function configureReplicaStyleAssetBase(base:string):void{assetBase=base;}
function ensure(name:string):Promise<void>{
 const existing=loaded.get(name);if(existing)return existing.ready;
 const initial=document.head.querySelector<HTMLLinkElement>('link[data-frozen-style="'+name+'"]');
 if(initial?.sheet){const ready=Promise.resolve();loaded.set(name,{node:initial,ready});return ready;}
 initial?.remove();const node=document.createElement('link');node.rel='stylesheet';node.media='not all';node.href=assetBase+'source-styles/'+name;node.dataset.frozenStyle=name;
 const ready=new Promise<void>((resolve,reject)=>{node.onload=()=>resolve();node.onerror=()=>{loaded.delete(name);node.remove();reject(new Error('Stylesheet unavailable: '+name));};});
 loaded.set(name,{node,ready});slots.get(name)!.after(node);return ready;
}
function activate(names:readonly string[]):void{
 const wanted=new Set(names);for(const [name,value]of loaded){if(wanted.has(name))value.node.media='all';else{value.node.remove();loaded.delete(name);}}
}
function check(signal:AbortSignal):void{if(signal.aborted)throw new DOMException('Style preparation cancelled','AbortError');}
export async function prepareReplicaCommonStyles(signal:AbortSignal):Promise<void>{check(signal);await Promise.all(common.map(ensure));check(signal);activate(common);}
export async function prepareReplicaStyles(route:string,signal:AbortSignal):Promise<void>{
 check(signal);const version=++generation,key=replicaStyleGroup(route),wanted=['ui-tokens.css','final-base.css',replicaRouteStyles[key]!];
 await Promise.all(wanted.map(ensure));check(signal);if(version!==generation)throw new DOMException('Style route superseded','AbortError');
 activeGroup=key;activate(wanted);
}
/** Union sheets preserve original interleaved order; appending a whole product sheet would not. */
export async function prepareInventoryProductDrawerStyles(signal:AbortSignal):Promise<void>{
 check(signal);const version=generation,group=activeGroup;
 const name=group==='inventory'?'inventory-with-products.css':replicaRouteStyles[group]!;
 await ensure(name);check(signal);if(version!==generation)throw new DOMException('Drawer route superseded','AbortError');activate(['ui-tokens.css','final-base.css',name]);
}
