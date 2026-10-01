/* Reuses the inventory export's bundled JSZip + typed OpenXML cell approach. */
(function(){'use strict';const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''),col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
async function create(rows){const z=new JSZip(),head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
z.file('[Content_Types].xml',head+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
z.file('_rels/.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
z.file('xl/workbook.xml',head+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="销货单查询结果" sheetId="1" r:id="rId1"/></sheets></workbook>');
z.file('xl/_rels/workbook.xml.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
z.file('xl/styles.xml',head+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
z.file('xl/worksheets/sheet1.xml',head+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="22" customWidth="1"/></cols><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>{const num=typeof v==='number'&&Number.isFinite(v);return `<c r="${col(j)}${i+1}" s="${num?j>=7&&j<=9?1:0:2}"${num?'':' t="inlineStr"'}>${num?'<v>'+v+'</v>':'<is><t xml:space="preserve">'+xml(v)+'</t></is>'}</c>`}).join('')}</row>`).join('')}</sheetData></worksheet>`);return z.generateAsync({type:'uint8array',compression:'DEFLATE'})}
function report(doc,{useSnapshotAmounts=true}={}){
 const D=window.ERP_DEMO,C=window.PRODUCT_CATALOG,H=window.MATRIX_SECTIONS,A=window.SALES_AUDIT,catalog=window.SALES_SERVICE?.catalog;
 const money=value=>Number.isSafeInteger(value)?value/100:'',warehouse=id=>D.warehouses.find(x=>x.id===id)?.name||'';
 const type=A.type(doc),data=[['奈爵服饰 销货单',doc.revision?doc.id:'未保存',doc.date,doc.status,type],['营业厅',doc.storeName||catalog?.stores.find(x=>x.id===doc.storeId)?.name||'','客户',doc.customerName||catalog?.customers.find(x=>x.id===doc.customerId)?.name||''],['营业员',doc.salespersonName||catalog?.staff.find(x=>x.id===doc.salespersonId)?.name||'','创建者',doc.creator?.name||''],[type==='退货'?'退入仓':'出库仓',doc.warehouseName||warehouse(doc.warehouseId)]];
 if(type==='换货')data.push(['退入仓',doc.returnWarehouseName||warehouse(doc.returnWarehouseId)]);
 if(doc.note)data.push(['备注',doc.note]);
 const amounts={out:0,in:0},amountKnown={out:true,in:true};
 const sections=type==='销售'?[['销售商品',A.outgoing(doc),'out']]:[['退回商品',A.incoming(doc),'in'],['换出商品',A.outgoing(doc),'out']];
 for(const [label,lines,direction] of sections){
  if(!lines.length)continue;
  const products=[...new Map(lines.map(l=>[l.productId,C.businessProduct?.(l.productId)||D.products.find(p=>p.id===l.productId)]).filter(([,p])=>p)).values()];
  const assigned=new Set(),groups=H.displaySections(lines.map(line=>({p:line.productId,line})),products,C),matrices=[];
  for(const group of groups){
   const entries=[];
   for(const row of group.rows){
    const size=group.sizes.find(z=>H.matches(row.product,z).some(s=>s.id===row.line.sizeId));
    if(!size||assigned.has(row.line))continue;
    assigned.add(row.line);entries.push({line:row.line,product:row.product,size});
   }
   if(entries.length)matrices.push({...group,entries});
  }
  const unmatched=lines.filter(line=>!assigned.has(line));
  if(unmatched.length){
   const sizes=[...new Set(unmatched.map(l=>l.size||l.sourceSize||'未记录尺码'))].map(name=>({id:name,name}));
   matrices.push({name:'历史／独立尺码',sizes,entries:unmatched.map(line=>({line,product:products.find(p=>p.id===line.productId),size:sizes.find(s=>s.name===(line.size||line.sourceSize||'未记录尺码'))}))});
  }
  for(const group of matrices){
   data.push([label+' · '+group.name],['货号','颜色','商品名称',...group.sizes.map(s=>s.name),'小计','版型','参考零售价','折扣','成交单价','金额','赠品','备注']);
   const rows=new Map();
   for(const {line:l,product:p,size} of group.entries){
    const key=JSON.stringify([l.productId,l.colorId||l.color,l.name,l.fitId||p?.fitId,l.fit,l.priceCents,l.referenceCents,l.pricingRule,l.discountTenths,!!l.gift,Math.sign(l.quantity)]);
    if(!rows.has(key))rows.set(key,{line:l,product:p,values:group.sizes.map(()=>0),amount:0,known:true,notes:new Set()});
    const row=rows.get(key),quantity=Number(l.quantity)||0,snapshot=l.netCents??l.amountCents,original=doc._runtime?.body?.lines.find(x=>x.source_id===l.id);
    const snapshotMatches=original?Math.abs(Number(original.source_quantity))===Math.abs(quantity)&&Math.round(Number(original.unit_price)*100)===l.priceCents:useSnapshotAmounts;
    const amount=snapshotMatches&&Number.isSafeInteger(snapshot)?Math.sign(quantity)*Math.abs(snapshot):Number.isSafeInteger(l.priceCents)?quantity*l.priceCents:null;
    row.values[group.sizes.indexOf(size)]+=quantity;
    if(amount===null){row.known=false;amountKnown[direction]=false;}else{row.amount+=amount;amounts[direction]+=amount;}
    if(l.note)row.notes.add(l.note);
   }
   for(const {line:l,product:p,values,amount,known,notes} of rows.values()){
    const code=p?.displayId||p?.styleNumber||p?.sourceProductId||String(l.productId).split('::fit:')[0];
    const discount=l.discountTenths!=null?l.discountTenths/10:l.referenceCents>0&&Number.isSafeInteger(l.priceCents)?Math.round(l.priceCents/l.referenceCents*100)/10:'';
    data.push([code,l.color||'',l.name||p?.name||'',...values,values.reduce((n,x)=>n+x,0),l.fit||C.fit?.(l.fitId)?.name||p?.fit||'',money(l.referenceCents),discount,money(l.priceCents),known?money(amount):'',l.gift?'是':'',Array.from(notes).join('；')]);
   }
  }
 }
 const adjustment=Number.isSafeInteger(doc.adjustmentCents)?doc.adjustmentCents:0;
 const total=amounts.out-amounts.in-(type==='退货'?-adjustment:adjustment);
 data.push(['销售金额',amountKnown.out?money(amounts.out):'','退回金额',amountKnown.in?money(amounts.in):''],['整单优惠',money(adjustment),'应结金额',amountKnown.out&&amountKnown.in?money(total):'']);
 return data;
}
window.SALES_EXPORT={create,report};})();
