import type { Selection } from '../../../../src/inventory/contracts.ts';

export const ALL_FILTER_VALUE='__inventory_all__';
type Choice=Selection&{readonly disabled?:boolean};
type Extra={readonly trigger?:{readonly value?:unknown;readonly _key?:unknown;readonly key?:unknown};readonly checked?:boolean};
const ids=(items:readonly Choice[])=>items.filter(item=>!item.disabled).map(item=>item.id);
const complete=(value:readonly Selection[],items:readonly Choice[])=>{const selected=new Set(value.map(item=>item.id)),keys=ids(items);return keys.length>0&&keys.every(id=>selected.has(id));};

/** null means the complete authorized range, including candidates not loaded yet. */
export function checkedFilterValues(value:readonly Selection[]|null,items:readonly Choice[],itemsComplete=false):string[]{
 return value===null?[ALL_FILTER_VALUE,...ids(items)]:[...(itemsComplete&&complete(value,items)?[ALL_FILTER_VALUE]:[]),...value.map(item=>item.id)];
}

/** Materialize the full range only when an individual item is removed from All. */
export async function resolveFilterSelection(value:readonly Selection[]|null,items:readonly Choice[],next:unknown,extra:Extra,loadAll:()=>Promise<readonly Choice[]>,itemsComplete=false):Promise<readonly Selection[]|null>{
 const key=extra.trigger?.value??extra.trigger?._key??extra.trigger?.key;
 if(key===ALL_FILTER_VALUE)return extra.checked===true?null:[];
 if(typeof key==='string'&&typeof extra.checked==='boolean'){
  if(value===null)return extra.checked?null:(await loadAll()).filter(item=>!item.disabled&&item.id!==key).map(({id,label})=>({id,label}));
  const selected=new Map(value.map(item=>[item.id,item]));
  if(extra.checked){const item=items.find(item=>item.id===key);if(item&&!item.disabled)selected.set(key,{id:item.id,label:item.label});}else selected.delete(key);
  const result=[...selected.values()];return itemsComplete&&complete(result,items)?null:result;
 }
 const raw=(Array.isArray(next)?next:[]).map(item=>typeof item==='string'?item:(item as {value?:unknown})?.value);
 if(raw.includes(ALL_FILTER_VALUE))return null;
 const known=new Map([...items,...(value??[])].map(item=>[item.id,item]));
 return raw.filter((id):id is string=>typeof id==='string').flatMap(id=>{const item=known.get(id);return item?[{id:item.id,label:item.label}]:[];});
}
