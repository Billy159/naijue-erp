/* Shared catalog identity boundary for candidates, exact scans and matrices. */
(function(root){'use strict';
let snapshot={version:1,products:[],skus:[],productCodes:[]},bySku=new Map(),byProduct=new Map(),codesByProduct=new Map(),byCell=new Map(),getProduct=()=>null;
const cellKey=sku=>[sku.productId,sku.fitId,sku.options.COLOR?.id,sku.options.SIZE?.id].join('|');
function install(value,lookup=getProduct){if(value?.version!==1||!Array.isArray(value.skus)||!Array.isArray(value.products)||!Array.isArray(value.productCodes))throw Error('商品身份接口返回无效');snapshot=value;bySku=new Map(value.skus.map(s=>[s.skuId,s]));byProduct=new Map(value.products.map(p=>[p.productId,p]));codesByProduct=new Map();byCell=new Map();for(const s of value.skus){const codes=codesByProduct.get(s.productId)||[];codes.push(...s.codes);codesByProduct.set(s.productId,codes);const key=cellKey(s);byCell.set(key,(byCell.get(key)||0)+1)}getProduct=lookup;}
function cell(p,c,s,{allowDisabled=false}={}){
 if(!p||!Number.isInteger(c)||!Number.isInteger(s)||c<0||s<0||c>=p.colorIds.length||s>=p.sizeIds.length)return null;
 const id=p.skuByCell?.[p.colorIds[c]+'|'+p.sizeIds[s]],sku=bySku.get(id);
 return sku&&byCell.get(cellKey(sku))===1&&sku.productId===p.uuid&&sku.fitId===(p.fitId||'')&&sku.options.COLOR?.id===p.colorIds[c]&&sku.options.SIZE?.id===p.sizeIds[s]&&(allowDisabled||sku.enabled!==false)?sku:null;
}
function merge(value,lookup=getProduct){
 if(value?.version!==1||!Array.isArray(value.skus)||!Array.isArray(value.products)||!Array.isArray(value.productCodes))throw Error('商品身份接口返回无效');
 const replaced=new Set(value.products.map(p=>p.productId));
 install({version:1,products:[...snapshot.products.filter(p=>!replaced.has(p.productId)),...value.products],skus:[...snapshot.skus.filter(s=>!replaced.has(s.productId)),...value.skus],productCodes:[...snapshot.productCodes.filter(p=>!replaced.has(p.productId)),...value.productCodes]},lookup);
}
function locate(sku){const p=getProduct(sku.productCode,sku.fitId,sku.productId),c=p?.colorIds.indexOf(sku.options.COLOR?.id),s=p?.sizeIds.indexOf(sku.options.SIZE?.id);
 return p&&cell(p,c,s,{allowDisabled:true})?.skuId===sku.skuId?{p,c,s,skuId:sku.skuId,enabled:sku.enabled}:null;
}
function adapt(result){
 const candidates=result.candidates||[],matches=candidates.map(locate).filter(Boolean),products=result.products||[];
 // An unmapped candidate still participates in ambiguity; never promote a remaining match.
 const kind=result.kind==='not-loaded'?'unknown':result.kind==='sku'&&matches.length===1?(matches[0].p.barcodes?.[matches[0].p.colorIds[matches[0].c]+'|'+matches[0].p.sizeIds[matches[0].s]]?.current===result.code?'current':'historical'):result.kind==='ambiguous'?'ambiguous':result.kind==='sku'?'unmapped':result.kind==='product'?'product':'missing';
 return {...result,identityKind:result.kind,kind,matches,products};
}
function resolve(raw){const code=String(raw??'').trim(),candidates=code?snapshot.skus.filter(s=>s.codes.includes(code)):[];
 if(candidates.length)return adapt({kind:candidates.length===1?'sku':'ambiguous',code,candidates,...(candidates.length===1?{skuId:candidates[0].skuId}:{})});
 const products=code?snapshot.products.filter(p=>p.code===code||snapshot.productCodes.some(b=>b.code===code&&b.productId===p.productId)):[];
 return adapt({kind:products.length?'product':root.LEGACY_REAL?.productReader?'not-loaded':'not-found',code,products});
}
async function resolveFresh(raw){const reader=root.LEGACY_REAL?.productReader,code=String(raw??'').trim();
 const value=reader?await reader.resolveBarcode(code):await root.ERP_API.request('/runtime/product-identity?code='+encodeURIComponent(code));
 if(reader){const ids=[...new Set([...(value.candidates||[]),...(value.products||[])].map(row=>row.productId).filter(Boolean))];if(ids.length)await reader.ensureDetails({productIds:ids});}
 for(const sku of value.candidates||[])bySku.set(sku.skuId,sku);
 return adapt(value);
}
function search(products,raw,options={}){const text=String(raw??'').trim(),q=text.toLocaleLowerCase(),exact=options.includeBarcodes===false?{matches:[],candidates:[],products:[]}:resolve(text),rows=[];
 if(exact.identityKind==='ambiguous')return exact.matches.filter(x=>products.some(p=>p.uuid===x.p.uuid)).map(x=>({p:x.p,rank:0,identityKey:x.skuId,requireSelection:true,enabled:x.enabled,
  label:[x.p.colors[x.c],x.p.fit||x.p.fitId,x.p.sizes[x.s]].join(' / '),exactSpec:x.enabled===false?null:{c:x.c,s:x.s,productId:x.p.id,skuId:x.skuId}}));
 for(const p of products){if(!byProduct.has(p.uuid))continue;
  const id=String(p.id).toLocaleLowerCase(),name=String(p.name).toLocaleLowerCase(),item=String(p.barcodeItemCode||p.goodsCode||'').toLocaleLowerCase();
  const candidates=exact.candidates||[],mapped=exact.matches.filter(x=>x.p.uuid===p.uuid),productHit=exact.products.some(x=>x.productId===p.uuid);
  let rank=!q?6:id===q?0:id.endsWith(q)?1:id.startsWith(q)?2:id.includes(q)?3:name.includes(q)?4:item&&item.includes(q)?5:Infinity;
  if(options.partialBarcodeSearch&&q.length>=6&&(codesByProduct.get(p.uuid)||[]).some(code=>code.toLocaleLowerCase().includes(q)))rank=Math.min(rank,5);
  if(candidates.some(x=>x.productId===p.uuid)||productHit)rank=0;if(rank===Infinity)continue;
  const match=exact.identityKind==='sku'&&mapped.length===1&&mapped[0].enabled!==false?mapped[0]:null;
  rows.push({p,rank,enabled:byProduct.get(p.uuid).enabled,exactSpec:match?{c:match.c,s:match.s,productId:match.p.id,skuId:match.skuId}:null});
 }
 return rows.sort((a,b)=>a.rank-b.rank||String(a.p.id).localeCompare(String(b.p.id)));
}
root.PRODUCT_IDENTITY={install,merge,cell,locate,resolve,resolveFresh,search,adapt,get ready(){return bySku.size>0}};
})(typeof window!=='undefined'?window:globalThis);
