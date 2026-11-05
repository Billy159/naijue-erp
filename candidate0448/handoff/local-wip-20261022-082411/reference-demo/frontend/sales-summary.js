/* Read-only sales presentation. Never stores totals or changes transaction rows. */
(function(root){'use strict';
function categorySnapshot(product,catalog){const category=catalog?.salesCategory?catalog.salesCategory(product):(catalog?.categories||[]).find(c=>c.id===product?.categoryId);return category?{id:category.id,name:category.name,fullName:category.fullName||catalog.path?.(category.id)||category.name}:{id:'__pending',name:'待确认分类',fullName:'商品分类尚未确认'};}
const missingCategory=()=>({id:'__unrecorded',name:'待确认分类',fullName:'历史单据未记录分类，未按当前商品资料推断'});
function project(doc,records,products,catalog){
 const saved=!!(doc.revision||(doc.status&&doc.status!=='未审核')||(doc.id&&!doc.id.startsWith('unsaved-')));
 const active=[]; // Retired original-document returns no longer participate in current document presentation.
 const units={},gifts={},originalUnits={},originalGifts={},returnedUnits={},outUnits={},categories=new Map();
 const productById=new Map((products||[]).map(p=>[p.id,p]));
 const originalById=new Map((doc.lines||[]).map(l=>[l.id,l]));
 const add=(bag,u,n)=>{bag[u]=(bag[u]||0)+n};
 function row(l,sign,phase){const n=Number(l.quantity);if(!Number.isSafeInteger(n)||n===0)return;const u=l.unit||'件',isGift=l.gift??originalById.get(l.originalLineId)?.gift??false;
  add(isGift?gifts:units,u,sign*n);
  if(phase==='original')add(isGift?originalGifts:originalUnits,u,n);
  if(!isGift&&phase==='return')add(returnedUnits,u,n);
  if(!isGift&&phase==='out')add(outUnits,u,n);
  if(isGift)return;
  const original=originalById.get(l.originalLineId),category=(phase==='return'?original?.categorySnapshot:null)||l.categorySnapshot||(saved?missingCategory():categorySnapshot(productById.get(l.productId)||catalog?.businessProduct?.(l.productId),catalog)),id=category.id;
  if(!categories.has(id))categories.set(id,{id,name:category?.name||'待确认分类',fullName:category?category.fullName||catalog.path?.(id)||category.name:'未找到商品分类',units:{}});
  add(categories.get(id).units,u,sign*n);
 }
 (doc.lines||[]).forEach(l=>row(l,1,'original'));
 active.forEach(r=>{(r.returnLines||[]).forEach(l=>row(l,-1,'return'));(r.outLines||[]).forEach(l=>row(l,1,'out'))});
 const clean=bag=>Object.fromEntries(Object.entries(bag).filter(([,n])=>n!==0));
 return {units:clean(units),gifts:clean(gifts),originalUnits:clean(originalUnits),originalGifts:clean(originalGifts),returnedUnits:clean(returnedUnits),outUnits:clean(outUnits),categories:[...categories.values()].map(c=>({...c,units:clean(c.units)})).filter(c=>Object.keys(c.units).length),hasReturns:active.length>0};
}
const api={project,categorySnapshot,missingCategory};if(typeof module==='object'&&module.exports)module.exports=api;else root.SALES_SUMMARY=api;
})(typeof window==='object'?window:globalThis);
