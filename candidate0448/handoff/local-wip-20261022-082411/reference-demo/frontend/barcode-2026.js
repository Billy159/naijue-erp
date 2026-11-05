/* Demo-only 2026 catalog extension. Old bindings and scheme definitions are never migrated. */
(function(){'use strict';
const C=PRODUCT_CATALOG,clone=C.clone,params=new URLSearchParams(location.search);
const storageKey='erp-catalog-2026-demo-v1:'+(params.get('tr-space')||'normal');
const specKey='erp-spec-dictionaries-v1:'+(params.get('tr-space')||'normal');
let specBaseline;try{specBaseline=localStorage.getItem(specKey)}catch{}
const cleanSpec=x=>{const {barcodeCode,barcodeCodes,barcodeCode2026,codeSource2026,...record}=x;return {...record,code:String(x.code??'')}};
C.specWriteIssue=()=>{try{return localStorage.getItem(specKey)!==specBaseline?'规格资料已在其他页面更新，请刷新后重新编辑。':''}catch{return '规格资料无法读取，本次未保存。'}};
C.persistSpecCodes=()=>{const error=C.specWriteIssue();if(error)return {error};try{const value=JSON.stringify({version:1,colors:C.colors.map(cleanSpec),groups:C.groups.map(g=>({...g,sizes:g.sizes.map(cleanSpec)}))});localStorage.setItem(specKey,value);specBaseline=value;return {ok:true}}catch{return {error:'规格资料保存失败，请勿关闭页面，稍后重试。'}}};
let storedBaseline;try{storedBaseline=localStorage.getItem(storageKey)}catch{}
C.fits2026=Object.freeze([['Y','修身'],['A','标准'],['B','宽松'],['C','加肥'],['D','加肥加大'],['E','特体']].map(([id,name])=>Object.freeze({id,name:id+'版（'+name+'）',code:id,fixed:true})));
C.fits.push(...C.fits2026);C.defaultScheme='2026';
C.schemes.push({id:'2026',name:'2026 条码方案',prefix:'5',length:15,parts:[{key:'fit',length:1},{key:'goods',length:7},{key:'color',length:3},{key:'size',length:3}],priority:0,symbology:'Code128',type:'解析'});
// Explicit stable size identities. Adding 160/XS and 29 does not add SKUs to old products.
const extra={UPPER:{id:'UPPER-2026-size-xs',name:'160/XS',code:''},PANTS:{id:'PANTS-2026-size-29',name:'29',code:''},FREE:{id:'FREE-2026-size-none',name:'无尺码',code:''}};
// Size codes live on the same editable group records used by import and every scheme.
const oldSizeRecords=C.sizeRecords;
C.sizeRecords=function(p){if(window.REAL_DATA_MODE||p.sizeSystem==='legacy')return oldSizeRecords(p);const rows=C.group(p.groupId)?.sizes||[];const existing=C.by?.(p.id);if(existing&&existing.groupId===p.groupId&&p.sizeIds?.length)return rows.filter(x=>p.sizeIds.includes(x.id));return p.schemeId==='2026'&&p.groupId==='FREE'?rows.filter(x=>x.id===extra.FREE.id):rows;};
const oldNew=C.newProduct;
C.newProduct=()=>C.prepare({...oldNew(),schemeId:'2026',fitId:'A',fit:C.fit('A').name});
C.has2026Barcodes=p=>Object.values(p?.barcodes||{}).some(b=>b.currentMeta?.schemeId==='2026'&&b.current);
const oldInit=C.initialize;
C.initialize=function(data){oldInit(data);
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.version===1){
  for(const c of saved.colors||[]){const current=C.color(c.id);if(current)Object.assign(current,cleanSpec(c));else C.colors.push(cleanSpec(c))}
  for(const p of saved.products||[])if((p.schemeId==='2026'||p.productSchema===2)&&p.sizeSystem==='standard'&&!data.products.some(x=>x.id===p.id))data.products.push(p);
 }}catch{C.demoStorageError='本地 2026 Demo 商品资料读取失败，请核对存储；没有改写旧商品。'}
 for(const [id,row] of Object.entries(extra)){const g=C.group(id);if(!g.sizes.some(s=>s.id===row.id))g.sizes.unshift(row);}
 try{const saved=JSON.parse(specBaseline||'null');if(saved?.version===1){for(const c of saved.colors||[]){const current=C.color(c.id);if(current)Object.assign(current,cleanSpec(c));else C.colors.push(cleanSpec(c));}for(const g of saved.groups||[]){const current=C.group(g.id);const record={...g,sizes:g.sizes.map(cleanSpec)};if(current)Object.assign(current,record);else C.groups.push(record);}}}catch{C.demoStorageError='规格资料读取失败，请核对本地存储。'}
 if(params.get('barcode-2026-fixtures')==='1')for(const [id,name,fitId,groupId] of [['D26-A-UP','隔离2026标准衬衫','A','UPPER'],['D26-Y-UP','隔离2026修身夹克','Y','UPPER'],['D26-A-PT','隔离2026标准裤装','A','PANTS'],['D26-B-PT','隔离2026宽松裤装','B','PANTS'],['D26-A-FREE','隔离2026无尺码配饰','A','FREE']]){
  if(data.products.some(p=>p.id===id))continue;const draft={...C.newProduct(),id,name,fitId,groupId,categoryId:C.standardLeaves?(groupId==='PANTS'?'cat-12-0':groupId==='FREE'?'cat-16-1':id==='D26-Y-UP'?'cat-4-0':'cat-1-0'):(groupId==='PANTS'?'pants':'shirts'),season:'秋',thickness:'常规',supplierId:C.suppliers[0].id,colorIds:[C.colors.find(c=>c.name==='藏青').id],price:100,fixture2026:true};
  C.save(draft,null,{autoBarcode:true});
 }
};
const oldHealth=C.barcodeHealth;
C.barcodeHealth=function(p,options={}){if(p.schemeId!=='2026')return oldHealth(p,options);const issues=[];
 if(!C.fits2026.some(f=>f.id===p.fitId))issues.push({text:'请选择 Y / A / B / C / D / E 版型',target:'fits'});
 if(!p.colorIds.length)issues.push({text:'尚未选择商品颜色',target:'specs'});
 for(const id of p.colorIds)if(!/^\d{3}$/.test(C.color(id)?.code||''))issues.push({text:(C.color(id)?.name||'未知颜色')+'颜色代码需为3位数字',target:'colors'});
 const records=C.sizeRecords(p);if(!records.length)issues.push({text:'请选择有效尺码组',target:'groups'});
 for(const s of records)if(!/^\d{3}$/.test(s.code||''))issues.push({text:s.name+'：尺码代码需为3位数字',target:'groups'});
 if(!options.userFacing&&!/^\d{7}$/.test(p.barcodeItemCode||''))issues.push({text:'系统货号需为7位数字',target:'goods'});
 return {ok:!issues.length,issues};
};
const oldGenerate=C.generate;
C.generate=function(p){if(p.schemeId!=='2026')return oldGenerate(p);if(p.sizeSystem==='legacy')return {error:'历史商品条码为导入事实，不重新生成'};
 const health=C.barcodeHealth(p);if(!health.ok)return {error:health.issues.map(i=>i.text).join('；')};C.prepare(p);
 const existing=C.by(p.id);if(existing&&C.has2026Barcodes(existing)){const error=identityIssue(p,existing);if(error)return {error};}
 const used=new Set(ERP_DEMO.products.filter(x=>x.id!==p.id).flatMap(x=>Object.values(x.barcodes).flatMap(C.barcodeValues)).filter(Boolean));
 for(const b of Object.values(p.barcodes))for(const code of C.barcodeValues(b).filter(Boolean))used.add(code);
 const pending=[];for(const cid of p.colorIds)for(const sid of p.sizeIds){const key=C.specKey(cid,sid);if(p.barcodes[key]?.current)continue;const scheme=C.schemes.find(s=>s.id===p.schemeId),values={fit:C.fit(p.fitId)?.code,goods:p.barcodeItemCode,color:C.color(cid)?.code,size:C.sizeRecords(p).find(x=>x.id===sid)?.code};const code=scheme.prefix+scheme.parts.map(part=>values[part.key]).join('');if(used.has(code))return {error:'条码已绑定其他规格，未生成任何新条码'};used.add(code);pending.push({key,code});}
 for(const {key,code} of pending){const b=p.barcodes[key]||{history:[],demo:true};p.barcodes[key]={...b,current:code,currentMeta:{schemeId:'2026',createdAt:new Date().toISOString(),demo:true}};}
 return {ok:true,count:pending.length};
};
function identityIssue(p,original){if(!C.has2026Barcodes(original))return '';if(p.fitId!==original.fitId||p.groupId!==original.groupId||p.barcodeItemCode!==original.barcodeItemCode||original.colorIds.some((id,i)=>p.colorIds[i]!==id)||original.sizeIds.some((id,i)=>p.sizeIds[i]!==id))return '已有2026条码，版型、系统货号及已有颜色尺码身份已锁定；请新建商品，原条码不会重算。';
 for(const [key,b] of Object.entries(original.barcodes))if(b.currentMeta?.schemeId==='2026'&&(p.barcodes[key]?.current!==b.current||p.barcodes[key]?.currentMeta?.schemeId!=='2026'))return '已有2026条码不能改写或移除。';return '';}
const oldDeletion=C.deletionIssue;
C.deletionIssue=(kind,id,drafts=[])=>kind==='fits'&&C.fits2026.some(f=>f.id===id)?'2026版型为固定标准项，不新增、删除或修改':oldDeletion(kind,id,drafts);
const oldValidate=C.validate;
C.validate=function(p,original){if(original){const error=identityIssue(p,original);if(error)return error;}if(p.schemeId==='2026'&&(!original||original.productSchema===2)&&!C.fits2026.some(f=>f.id===p.fitId))return '请选择固定2026版型';return oldValidate(p,original);};
const oldSave=C.save;
C.save=function(draft,original,options={}){if(draft.schemeId==='2026'||draft.productSchema===2){try{if(localStorage.getItem(storageKey)!==storedBaseline)return {error:'商品资料已在其他页面更新，请刷新后重新编辑；本次未保存。'}}catch{return {error:'商品资料无法读取，本次未保存，请稍后重试。'}}}const r=oldSave(draft,original,options);if(r.ok&&(r.product.schemeId==='2026'||r.product.productSchema===2)){
 const health=C.barcodeHealth(r.product);if(!health.ok)r.barcodeNotice='商品资料已保存；'+health.issues.map(i=>i.text).join('；')+'。未生成新条码。';
 try{localStorage.setItem(storageKey,JSON.stringify({version:1,products:ERP_DEMO.products.filter(p=>p.schemeId==='2026'||p.productSchema===2),colors:C.colors.map(clone)}));storedBaseline=localStorage.getItem(storageKey);}catch{r.barcodeNotice='商品已保存到本次会话，但本地存储失败，刷新可能丢失；请勿关闭页面。';}
 }return r;};
// Only exact bindings identify a new barcode. No inference upgrades old products.
const oldResolve=C.resolve;
C.resolve=function(raw){const r=oldResolve(raw);if(r.matches.length||!/^5[YABCDE]\d{13}$/.test(raw.trim()))return r;return {...r,reason:'2026结构已识别，但没有已生成的商品规格条码；未猜测或自动建货'};};
// Register newly created Demo SKU dimensions in the existing shared mock transaction.
// Existing quantities are copied by stable identity; no business event is invented here.
C.syncDemo2026=function(state){
 // A stale page may add dimensions, but may never remove shared SKU identities or stock.
 let latest=[];try{latest=JSON.parse(localStorage.getItem(storageKey)||'null')?.products||[]}catch{}
 for(const p of ERP_DEMO.products.filter(p=>p.schemeId==='2026'||p.productSchema===2)){
  let saved=state.products.find(x=>x.id===p.id);const persisted=latest.find(x=>x.id===p.id);
  const sources=[saved,persisted,p].filter(Boolean),colorIds=[...new Set(sources.flatMap(x=>x.colorIds||[]))],sizeIds=[...new Set(sources.flatMap(x=>x.sizeIds||[]))];
  const labels=(ids,idKey,labelKey)=>ids.map(id=>{for(const x of [persisted,p,saved].filter(Boolean)){const i=x[idKey]?.indexOf(id);if(i>=0&&x[labelKey]?.[i]!=null)return x[labelKey][i]}return id});
  const colors=labels(colorIds,'colorIds','colors'),sizes=labels(sizeIds,'sizeIds','sizes');
  const warehouses=[...new Set([...ERP_DEMO.warehouses.map(w=>w.id),...Object.keys(saved?.stock||{})])];
  const stock=Object.fromEntries(warehouses.map(w=>[w,colorIds.map(cid=>sizeIds.map(sid=>{const ci=saved?.colorIds.indexOf(cid),si=saved?.sizeIds.indexOf(sid);return ci>=0&&si>=0?saved.stock[w]?.[ci]?.[si]??0:0}))]));
  const next={id:p.id,colors,sizes,colorIds,sizeIds,stock};if(saved)Object.assign(saved,next);else state.products.push(next);
  // Keep the page's stock matrix aligned with the identity order used by transactions.
  Object.assign(p,clone(next));if(persisted)p.barcodes={...p.barcodes,...clone(persisted.barcodes||{})};
 }
};
})();
