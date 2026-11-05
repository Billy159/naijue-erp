/** Opt-in extensions preserve legacy exact rows and category-v1 exact summaries. */
export function documentListWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object'||!('items'in value)||!Array.isArray(value.items))return value;
 return {...value,items:value.items.map((item:unknown)=>{if(!item||typeof item!=='object'||!('categorySummary'in item))return item;
  const {categorySummary,...legacy}=item;
  if(version==='category-v1'&&categorySummary&&typeof categorySummary==='object'){const {categoryCount:_,...v1}=categorySummary as Record<string,unknown>;return {...legacy,categorySummary:v1};}
  return legacy;})};
}
export function transferDetailWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object'||!('categorySummary'in value))return value;
 const {categorySummary:_,...legacy}=value;return legacy;
}

export function salesDetailWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object')return value;
 const {productSummary:_,categorySummary:__,...legacy}=value as Record<string,unknown>;return legacy;
}
