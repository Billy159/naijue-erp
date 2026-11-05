import type { Selection } from '../../../../src/inventory/contracts.ts';

export class SelectionBudgetError extends Error {constructor(maximum:number){super(`最多${maximum}项，当前选择已保留。`);}}
export function assertSelectionBudget(value:readonly Selection[]|null,maximum:number):void{if(value&&new Set(value.map(item=>item.id)).size>maximum)throw new SelectionBudgetError(maximum);}
export function pasteCodes(raw:string,maximum:number,maxLength:number):string[]{if(new TextEncoder().encode(raw).byteLength>65536)throw new Error('粘贴内容超过64KiB，当前选择已保留。');const codes=[...new Set(raw.split(/[\s,，;；、]+/).filter(Boolean))];if(codes.length>maximum)throw new SelectionBudgetError(maximum);if(codes.some(code=>code.length>maxLength||/[\u0000-\u001f\u007f]/.test(code)))throw new Error('款号长度或字符不符合查询要求，当前选择已保留。');return codes;}
export const ALL_FILTER_VALUE='__inventory_all__';
type Choice=Selection&{readonly disabled?:boolean};
type Extra={readonly trigger?:{readonly value?:unknown;readonly _key?:unknown;readonly key?:unknown};readonly checked?:boolean};
const ids=(items:readonly Choice[])=>items.filter(item=>!item.disabled).map(item=>item.id);
const complete=(value:readonly Selection[],items:readonly Choice[])=>{const selected=new Set(value.map(item=>item.id)),keys=ids(items);return keys.length>0&&keys.every(id=>selected.has(id));};

/** null means the complete authorized range, including candidates not loaded yet. */
export function checkedFilterValues(value:readonly Selection[]|null,items:readonly Choice[],itemsComplete=false,standaloneAll=false):string[]{
 if(standaloneAll)return value===null?[ALL_FILTER_VALUE]:value.map(item=>item.id);
 return value===null?[ALL_FILTER_VALUE,...ids(items)]:[...(itemsComplete&&complete(value,items)?[ALL_FILTER_VALUE]:[]),...value.map(item=>item.id)];
}

/** Materialize the full range only when an individual item is removed from All. */
export async function resolveFilterSelection(value:readonly Selection[]|null,items:readonly Choice[],next:unknown,extra:Extra,loadAll:()=>Promise<readonly Choice[]>,itemsComplete=false,maxSelections=Infinity,standaloneAll=false):Promise<readonly Selection[]|null>{
 const bounded=(value:readonly Selection[]|null)=>{assertSelectionBudget(value,maxSelections);return value;};
 const key=extra.trigger?.value??extra.trigger?._key??extra.trigger?.key;
 // Frozen category contract: All is a standalone choice, not every checked child.
 if(standaloneAll){
  if(key===ALL_FILTER_VALUE)return null;
  const raw=(Array.isArray(next)?next:[]).map(item=>typeof item==='string'?item:(item as {value?:unknown})?.value).filter(id=>id!==ALL_FILTER_VALUE);
  const known=new Map<string,Choice>([...items,...(value??[])].map(item=>[item.id,item]));
  const selected=raw.filter((id):id is string=>typeof id==='string').flatMap(id=>{const item=known.get(id);return item&&!item.disabled?[{id:item.id,label:item.label}]:[];});
  return bounded(selected.length?selected:null);
 }
 if(key===ALL_FILTER_VALUE)return extra.checked===true?null:[];
 if(typeof key==='string'&&typeof extra.checked==='boolean'){
  if(value===null)return extra.checked?null:bounded((await loadAll()).filter(item=>!item.disabled&&item.id!==key).map(({id,label})=>({id,label})));
  const selected=new Map(value.map(item=>[item.id,item]));
  if(extra.checked){const item=items.find(item=>item.id===key);if(item&&!item.disabled)selected.set(key,{id:item.id,label:item.label});}else selected.delete(key);
  const result=[...selected.values()];return bounded(itemsComplete&&complete(result,items)?null:result);
 }
 const raw=(Array.isArray(next)?next:[]).map(item=>typeof item==='string'?item:(item as {value?:unknown})?.value);
 if(raw.includes(ALL_FILTER_VALUE))return null;
 const known=new Map<string,Choice>([...items,...(value??[])].map(item=>[item.id,item]));
 return bounded(raw.filter((id):id is string=>typeof id==='string').flatMap(id=>{const item=known.get(id);return item?[{id:item.id,label:item.label}]:[];}));
}
