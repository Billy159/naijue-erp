/* Demo product master: explicit taxonomy, independent attributes; no legacy inference. */
(function(){'use strict';const C=PRODUCT_CATALOG;
const tree=[['T恤',['长袖T恤','短袖T恤']],['衬衫',['长袖衬衫','短袖衬衫']],['卫衣',[]],['毛衫',[]],['夹克',['夹克','毛呢夹克']],['风衣',['风衣','羊毛风衣']],['派克',['派克','毛呢派克']],['大衣',['大衣','毛呢大衣']],['西服',['套西','单西','西裤']],['保暖服装',['棉服','羽绒服','防寒服']],['皮革服装',['真皮皮衣','PU服装']],['毛皮服装',['吊面毛皮服装','尼克服']],['长裤',['休闲裤','牛仔裤','大版裤','松紧裤']],['短裤',[]],['中裤',[]],['内着',['内衣','内裤','袜子']],['配饰',['领带','围巾']],['其他辅料',[]]];
const legacy=C.categories.filter(c=>c.id!=='all').map(c=>({...c,legacy:true}));
C.categories.splice(1,C.categories.length-1,...tree.flatMap(([name,children],i)=>[{id:'cat-'+i,name,parent:'all',order:i,standard:true},...children.map((name,j)=>({id:'cat-'+i+'-'+j,name,parent:'cat-'+i,order:j,standard:true,leaf:true}))]),...legacy);
const categoryKey='erp-product-categories-v2:'+(new URLSearchParams(location.search).get('tr-space')||'normal');
try{const saved=JSON.parse(localStorage.getItem(categoryKey)||'null');if(Array.isArray(saved)&&saved.every(c=>(c.standard||c.canonicalCategoryId)&&c.id&&c.name&&(c.parent==='all'||saved.some(p=>p.id===c.parent&&p.parent==='all'))))C.categories.splice(1,C.categories.length-1,...saved,...legacy);}catch{}
// Collapse only redundant seed leaves; keep their identifiers for historical references.
for(const c of C.categories.filter(c=>c.standard&&c.parent!=='all')){const parent=C.categories.find(x=>x.id===c.parent);if(parent?.name===c.name&&C.categories.filter(x=>x.standard&&x.parent===parent.id).length===1){c.legacy=true;c.standard=false;c.canonicalCategoryId=parent.id;}}
C.persistCategories=()=>{try{localStorage.setItem(categoryKey,JSON.stringify(C.categories.filter(c=>c.standard||c.canonicalCategoryId)))}catch{window.toast?.('分类保留在当前页面，但本地保存失败；请勿关闭页面。')}};
C.standardParents=()=>C.categories.filter(c=>c.standard&&c.parent==='all');
C.standardLeaves=()=>C.categories.filter(c=>c.standard&&!C.categories.some(x=>x.standard&&x.parent===c.id));
C.standardCategory=p=>C.categories.find(c=>c.standard&&c.id===(C.categories.find(x=>x.id===p?.categoryId)?.canonicalCategoryId||p?.categoryId));
C.categoryLabel=p=>{const c=C.standardCategory(p);return c?C.path(c.id):'待确认分类'+(p?.category?'（原：'+p.category+'）':'')};
C.salesCategory=p=>{const c=C.standardCategory(p);return c?{id:c.id,name:c.name,fullName:C.path(c.id)}:{id:'__pending',name:'待确认分类',fullName:'历史分类尚未对应到新二级分类'}};
const oldIn=C.inCategory;C.inCategory=(p,id)=>id==='__pending'?!C.standardCategory(p):oldIn(p,id);
C.categoryNodes=()=>[{...C.categories[0],level:0,value:'全部商品'},...C.categories.filter(c=>c.standard).map(c=>({...c,level:c.parent==='all'?1:2,value:c.name})),{id:'__pending',name:'待确认分类',parent:'all',level:1,value:'待确认分类'}];
C.years=()=>[...new Set([...Array.from({length:Math.max(0,new Date().getFullYear()-2015+2)},(_,i)=>String(2015+i)),...(window.ERP_DEMO?.products||[]).map(p=>String(p.year||'')).filter(year=>/^\d{4}$/.test(year))])].sort((a,b)=>Number(b)-Number(a));
C.seasons=['春','夏','秋','冬'].map(name=>({id:name,name,disabled:false}));
C.fits2026=C.fits.filter(x=>C.fits2026.some(f=>f.id===x.id));
const settingsKey='erp-product-settings-v1:'+(new URLSearchParams(location.search).get('tr-space')||'normal');
try{const saved=JSON.parse(localStorage.getItem(settingsKey)||'null');if(saved){if(Array.isArray(saved.seasons))C.seasons.splice(0,C.seasons.length,...saved.seasons);if(Array.isArray(saved.fits)){for(const old of C.fits2026)C.fits.splice(C.fits.indexOf(old),1);C.fits2026.splice(0,C.fits2026.length,...saved.fits);C.fits.push(...C.fits2026)}}}catch{}
C.persistSettingNames=()=>{try{localStorage.setItem(settingsKey,JSON.stringify({seasons:C.seasons,fits:C.fits2026}));return {ok:true}}catch{return {error:'商品设置未能保存，请稍后重试'}}};
// Read old explicit season combinations without rewriting historical records on load.
C.seasonValues=p=>{const raw=Array.isArray(p?.season)?p.season:String(p?.season||'').split(/[、,，\s]+/);const values=raw.flatMap(v=>({'春夏':['春','夏'],'秋冬':['秋','冬'],'春季':['春'],'夏季':['夏'],'秋季':['秋'],'冬季':['冬']}[v]||[v])).filter(Boolean);return [...new Set(values)];};
C.seasonLabel=p=>C.seasonValues(p).join('、');
C.validSeasons=p=>{const values=C.seasonValues(p);return values.length>0&&values.every(v=>C.seasons.some(s=>s.id===v));};
C.thicknesses=['薄款','常规','厚款'];
C.upperShapes=[['01','圆领'],['02','中领'],['03','高领'],['15','西装领'],['16','翻领'],['17','立领'],['18','立翻领'],['19','棒球领'],['20','带帽'],['21','交叉领']];
C.pantsShapes=[['22','正常裤脚'],['23','裤脚偏小'],['24','裤脚偏大'],['26','大版裤'],['27','小脚裤']];
// Public attribute configuration uses internal IDs; ordinary users maintain names only.
const attributeKey='erp-product-attributes-v1:'+(new URLSearchParams(location.search).get('tr-space')||'normal');
let attributeBaseline=null,attributeIssue='';
const attributeKinds=['thicknesses','upperShapes','pantsShapes'];
function validateAttributes(data){return data&&attributeKinds.every(k=>Array.isArray(data[k])&&data[k].every(x=>Array.isArray(x)&&x.length===2&&x.every(v=>typeof v==='string'&&v.trim()))&&new Set(data[k].map(x=>x[0])).size===data[k].length&&new Set(data[k].map(x=>x[1])).size===data[k].length);}
let attributeData={thicknesses:C.thicknesses.map(name=>[name,name]),upperShapes:C.upperShapes,pantsShapes:C.pantsShapes};
function applyAttributes(){C.thicknesses=attributeData.thicknesses.map(x=>x[1]);C.upperShapes=attributeData.upperShapes.map(x=>[...x]);C.pantsShapes=attributeData.pantsShapes.map(x=>[...x]);}
try{attributeBaseline=localStorage.getItem(attributeKey);if(attributeBaseline){const parsed=JSON.parse(attributeBaseline);if(!validateAttributes(parsed))throw Error('格式无效');attributeData=parsed;}applyAttributes();}catch{attributeIssue='商品属性配置无法读取，请恢复有效配置后再保存';}
C.attributeRows=kind=>(attributeData[kind]||[]).map(([id,name])=>({id,name}));
C.saveAttribute=function(kind,id,name){
 if(!attributeKinds.includes(kind))return {error:'请选择属性类型'};
 if(window.MASTER_DATA?.active&&!MASTER_DATA.canManage('products'))return {error:'当前账号无权维护商品属性'};
 if(attributeIssue)return {error:attributeIssue};
 name=String(name||'').trim();if(!name||name.length>40)return {error:'请输入 1–40 字的属性名称'};
 const rows=attributeData[kind],old=rows.find(x=>x[0]===id);if(id&&!old)return {error:'该属性已变化，请刷新后重试'};
 if(rows.some(x=>x[0]!==id&&x[1]===name))return {error:'同类属性名称已存在'};
 // Legacy thickness is a name reference. Keep it intact if any saved or parked product uses it.
 const products=[...(window.ERP_DEMO?.products||[]),window.PRODUCT_UI?.state?.edit,window.PRODUCT_UI?.state?.parked?.edit].filter(Boolean);
 if(kind==='thicknesses'&&old&&old[1]!==name&&products.some(p=>p.thickness===old[1]))return {error:'该厚薄已被商品引用，请新增另一项；原值保留，避免改动历史商品'};
 try{if(localStorage.getItem(attributeKey)!==attributeBaseline)return {error:'商品属性已在其他页面更新，请刷新后重试'};
 const next=structuredClone(attributeData);const row=next[kind].find(x=>x[0]===id);if(row)row[1]=name;else next[kind].push(['attribute-'+crypto.randomUUID(),name]);
 const raw=JSON.stringify(next);localStorage.setItem(attributeKey,raw);attributeData=next;attributeBaseline=raw;applyAttributes();return {ok:true};
 }catch{return {error:'属性未保存，请检查本地存储后重试'};}
};
C.shapeOptions=p=>{const c=C.standardCategory(p);if(!c)return [...C.upperShapes,...C.pantsShapes];const parent=c.parent==='all'?c.id:c.parent;if(['cat-12','cat-13','cat-14'].includes(parent)||c.name==='西裤')return C.pantsShapes;if(Number(parent.slice(4))<=11||c.name==='内衣')return C.upperShapes;return []};
C.systemItemCode=p=>String(p?.barcodeItemCode||p?.goodsCode||p?.defaultBarcode||'');
C.priceFields=[['purchasePrice','采购价'],['price','零售价'],['wholesale5','五级批发价（工厂店供货价）'],['wholesale6','六级批发价（贴牌价）'],['wholesale7','七级批发价（批发价）'],['wholesale8','八级批发价（代理商供货价）'],['wholesale9','九级批发价（工厂店零售价）'],['wholesale10','十级批发价（葛玉珠）'],['minimumPrice','最低售价']];
const oldNew=C.newProduct;C.newProduct=()=>({...oldNew(),productSchema:2,price:null,year:String(new Date().getFullYear()),season:'',thickness:'',shapeCode:'',minimumPrice:null,wholesale5:null,wholesale6:null,wholesale7:null,wholesale8:null,wholesale9:null,wholesale10:null});
const oldPrepare=C.prepare;C.prepare=function(p){const prior=p.category;oldPrepare(p);p.enabled=true;const category=C.standardCategory(p);p.category=category?category.name:prior||p.category;return p};
const oldValidate=C.validate;C.validate=function(p,original){
 if(!String(p.year||'').trim())return '请选择年份';
 if(!String(p.season||'').trim())return '请选择季节';
 if(!String(p.barcodeItemCode??C.systemItemCode(p)).trim())return '请填写系统货号';
 if(!original||p.productSchema===2){if(!C.standardCategory(p))return '请选择商品分类';if(!C.schemes.some(x=>x.id===p.schemeId))return '请选择主条码默认方案';if(!C.years().includes(String(p.year)))return '请选择年份';if(!C.validSeasons(p))return '请选择季节';if(!(p.fitIds||[p.fitId]).length||(p.fitIds||[p.fitId]).some(id=>!C.fits2026.some(f=>f.id===id)))return '请选择版型';}
 C.standardCategory(p);
 if(p.shapeCode&&p.shapeCode!==original?.shapeCode&&!C.shapeOptions(p).some(([id])=>id===p.shapeCode))return '领型 / 裤型与当前分类不符，请重新选择';
 for(const [key,label] of C.priceFields)if(p[key]!=null&&p[key]!==''&&(!/^\d+(?:\.\d{1,2})?$/.test(String(p[key]))||!Number.isFinite(Number(p[key]))))return label+'请填写非负金额，最多两位小数';
 return oldValidate(p,original)?.replace('默认供应商','供应商')||'';
};
const key='erp-product-master-v2:'+(new URLSearchParams(location.search).get('tr-space')||'normal');let patches={},metadataBaseline;
const metadata=['schemeId','name','categoryId','category','year','season','supplierId','fitId','fitIds','fit','thickness','shapeCode','barcodeItemCode','enabled','productSchema','source',...C.priceFields.map(([k])=>k)];
C.applyMasterMetadata=function(data){for(const p of data.products){const patch=patches[p.id];if(patch)for(const k of metadata)if(Object.hasOwn(patch,k))p[k]=patch[k];}};
// Commands must validate against current persisted rules; this does not authorize stale editor saves.
C.reloadMasterMetadata=function(data){const current=JSON.parse(localStorage.getItem(key)||'{}');if(!current||typeof current!=='object'||Array.isArray(current))throw new Error('商品资料存储格式无效');for(const p of data.products){const patch=current[p.id];if(patch)for(const k of metadata)if(Object.hasOwn(patch,k))p[k]=patch[k];}};
const oldInit=C.initialize;C.initialize=function(data){oldInit(data);try{metadataBaseline=localStorage.getItem(key);patches=JSON.parse(metadataBaseline||'{}');C.applyMasterMetadata(data);}catch{C.demoStorageError='商品资料读取失败，请核对当前测试空间；历史条码未改动。'}};
const oldSave=C.save;C.save=function(draft,original,options={}){
 try{if(localStorage.getItem(key)!==metadataBaseline)return {error:'商品资料已在其他页面更新，请刷新后重新编辑；本次未保存。'}}catch{return {error:'商品资料无法读取，本次未保存，请稍后重试。'}}
 // Ordinary editing of old goods must not allocate an unrelated new item code or regenerate bindings.
 const historical=original&&original.productSchema!==2;let prepared=draft;if(original&&draft.price!==original.price&&draft.price!=null&&draft.price!=='')prepared={...draft,source:{...draft.source,referencePriceProvided:true,referencePriceSource:'商品档案人工维护（Demo）'}};const result=oldSave(prepared,original,historical?{...options,autoBarcode:false}:options);if(!result.ok)return result;
 const p=result.product;for(const [k]of C.priceFields)if(p[k]!=null&&p[k]!=='')p[k]=Number(p[k]);else if(k!=='price')p[k]=null;
 patches[p.id]=Object.fromEntries(metadata.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]));try{localStorage.setItem(key,JSON.stringify(patches));metadataBaseline=localStorage.getItem(key)}catch{result.barcodeNotice='商品已保留在当前页面，但本地资料保存失败；请勿关闭页面。'}return result;
};
const oldSearch=C.search;C.search=function(q){const text=String(q).trim().toLocaleLowerCase();if(!text)return oldSearch(q);const exact=C.resolve(q);if(exact.matches?.length)return [...new Set(exact.matches.map(x=>x.p))];return ERP_DEMO.products.filter(p=>(p.id+' '+p.name+' '+C.systemItemCode(p)).toLocaleLowerCase().includes(text));};
const priorDeletion=C.deletionIssue;
C.deletionIssue=function(kind,id,drafts=[]){
 if(kind==='groups')return '尺码组不允许删除';
 if(['categories','colors','groups'].includes(kind)){
  const entry=C[kind].find(x=>x.id===id),label={categories:'分类',colors:'颜色',groups:'尺码组'}[kind];if(!entry||id==='all')return '该资料不能删除';
  const children=kind==='categories'?C.categories.filter(x=>x.parent===id).length:0;if(children)return '当前分类仍有 '+children+' 个下级分类，无法删除。';
  const all=[...ERP_DEMO.products,...drafts.filter(Boolean)],using=all.filter(p=>kind==='categories'?p.categoryId===id:kind==='colors'?(p.colorIds||[]).includes(id):p.groupId===id);
  if(using.length)return '当前'+label+'仍被 '+using.length+' 款商品使用，无法删除。';
  if(entry.historicalReferenceCount||entry.hasHistoricalReferences)return '当前'+label+'已有历史业务引用，无法删除。';
  return '';
 }
 if(!['fits','seasons'].includes(kind))return priorDeletion(kind,id,drafts);
 const rows=kind==='fits'?C.fits2026:C.seasons,entry=rows.find(x=>x.id===id),label=kind==='fits'?'版型':'季节';if(!entry)return '该'+label+'不存在';
 const all=[...ERP_DEMO.products,...drafts.filter(Boolean)],using=all.filter(p=>kind==='fits'?(p.fitIds||[p.fitId]).includes(id):C.seasonValues(p).includes(id));
 if(using.length)return '当前'+label+'被 '+using.length+' 款商品使用，无法删除。';
 if(entry.historicalReferenceCount||entry.hasHistoricalReferences)return '当前'+label+'已有历史业务引用，无法删除。';
 return '';
};
const priorDelete=C.deleteMaster;
C.deleteMaster=function(kind,id,drafts=[]){const result=priorDelete(kind,id,drafts);if(result.ok&&kind==='fits')C.fits2026.splice(C.fits2026.findIndex(x=>x.id===id),1);return result};
C.productDeletionIssue=function(p){if(!p)return '商品不存在';const quantity=Number(p.stockTotal??ERP_DEMO.total(p));if(quantity!==0)return '商品仍有库存 '+quantity+' 件，无法删除';if(Object.values(p.barcodes||{}).some(b=>b.current||(b.history||[]).length||(b.compatible||[]).length))return '商品已有条码绑定，无法删除';if((window.SALES_SERVICE?.docs||[]).some(d=>JSON.stringify(d).includes(p.id))||(window.GOLD?.documents||[]).some(d=>JSON.stringify(d).includes(p.id))||p.hasHistoricalReferences)return '商品已有销货单、调拨单或其他业务引用，无法删除';return ''};
})();
