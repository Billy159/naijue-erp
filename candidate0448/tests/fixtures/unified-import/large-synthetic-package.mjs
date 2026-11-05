/** Deterministic fabricated workload, never derived from private data. Output is written
 * incrementally and callers must create/remove its temporary parent directory. */
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createSyntheticPackage} from './synthetic-package.ts';
import {TABLE_SCHEMAS,sha256,registryTargetId} from '../../../packages/application/src/unified-import-contract.ts';

export async function writeLargeSyntheticPackage(root,{scale='full'}={}) {
 await mkdir(root,{recursive:true});const p=createSyntheticPackage(),m=p.manifest,ns=m.source_namespace;
 const n=scale==='smoke'?{sales_header:11,sales_line:29,sales_settlement:9,transfer_header:7,transfer_line:31,inventory_baseline:67,product:12,warehouse:6}: {sales_header:28894,sales_line:83399,sales_settlement:26382,transfer_header:14835,transfer_line:273948,inventory_baseline:42227,product:2970,warehouse:15};
 const source=m.source_files[0].sha256,ref=(t,i)=>[{file_sha256:source,sheet:`SYNTHETIC_${t.toUpperCase()}_${i%97}`,row:i}];
 const key=(t,i)=>i===1?`${t}:01`:t==='warehouse'&&i===2?'warehouse:02':`synthetic:${t}:sequence:${String(i).padStart(8,'0')}`;
 const identityCache=new Map();const target=(t,i)=>{if(['product','sku','warehouse','sales_header','transfer_header','color','fit','size'].includes(t)){const k=`${t}:${i}`;if(!identityCache.has(k))identityCache.set(k,registryTargetId(ns,t.toUpperCase(),key(t,i)));return identityCache.get(k);}return registryTargetId(ns,t.toUpperCase(),key(t,i));};
 const base=(t)=>p.records[t][0];
 const money=c=>`${c<0?'-':''}${Math.trunc(Math.abs(c)/100)}.${String(Math.abs(c)%100).padStart(2,'0')}`;
 const saleQuantity=(h,i)=>(h%7===0||h%3===0&&i%2===0?-1:1)*(1+i%5);
 const salesExtra=n.sales_line-2*n.sales_header;
 const transferBase=Math.floor(n.transfer_line/n.transfer_header),transferExtra=n.transfer_line-transferBase*n.transfer_header;
 const salesCount=h=>2+(h<=salesExtra?1:0),salesOffset=h=>2*(h-1)+Math.min(h-1,salesExtra);
 const transferCount=h=>transferBase+(h<=transferExtra?1:0),transferOffset=h=>transferBase*(h-1)+Math.min(h-1,transferExtra);
 const saleGross=h=>{let total=0;for(let j=1;j<=salesCount(h);j++)total+=saleQuantity(h,salesOffset(h)+j)*(100+(h%900));return total;};
 const counts=Object.fromEntries(Object.keys(TABLE_SCHEMAS).map(t=>[t,p.records[t].length]));
 Object.assign(counts,n,{sku:n.product});delete counts.warehouse;counts.warehouse=n.warehouse;delete counts.sales_headerX;
 const generated=new Set(['product','sku','warehouse','color','fit','size','size_group_member','sales_header','sales_line','sales_settlement','transfer_header','transfer_line','inventory_baseline']);
 for(const [path,bytes] of Object.entries(p.artifacts)) if(path!=='identity-registry.jsonl'&&path!=='reconciliation.json'&&!generated.has(path.replace(/\.jsonl$/,''))){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
 const registry=await open(join(root,'identity-registry.jsonl'),'wx',0o600);let regHash=createHash('sha256'),regBytes=0,regRows=0,regBuffer='';
 async function registryRow(value){regBuffer+=JSON.stringify(value)+'\n';regRows++;if(regBuffer.length>=262144)await flushRegistry();}
 async function flushRegistry(){if(!regBuffer)return;const b=Buffer.from(regBuffer);regHash.update(b);regBytes+=b.length;await registry.writeFile(b);regBuffer='';}
 for(const e of p.registry)if(!generated.has(e.entity_type.toLowerCase()))await registryRow(e);
 async function emit(table,iterable){const path=`${table}.jsonl`,h=await open(join(root,path),'wx',0o600),digest=createHash('sha256');let bytes=0,count=0,buffer='';
  async function flush(){if(!buffer)return;const b=Buffer.from(buffer);digest.update(b);bytes+=b.length;await h.writeFile(b);buffer='';}
  try{for(const row of iterable){count++;buffer+=JSON.stringify(row)+'\n';if(buffer.length>=262144)await flush();if(TABLE_SCHEMAS[table].id){const r={entity_type:table.toUpperCase(),source_namespace:ns,canonical_source_key:row.source_key,target_id:row.fields.id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:row.source_refs};await registryRow(r);}}await flush();}finally{await h.close();}
  Object.assign(m.files.find(x=>x.table===table),{relative_path:path,bytes,sha256:digest.digest('hex'),row_count:count});counts[table]=count;
 }
 const make=(t,i,f)=>({source_key:key(t,i),source_refs:ref(t,i),fields:{...base(t).fields,id:target(t,i),...f}});
 try {
  await emit('color',(function*(){for(let i=1;i<=20;i++)yield make('color',i,{code:`SYN-C${String(i).padStart(3,'0')}`,name:`SYNTHETIC COLOR ${i}`});})());
  await emit('fit',(function*(){for(let i=1;i<=8;i++)yield make('fit',i,{code:String.fromCharCode(64+i),name:`SYNTHETIC FIT ${i}`});})());
  await emit('size',(function*(){for(let i=1;i<=12;i++)yield make('size',i,{code:String(899+i),name:`SYNTHETIC SIZE ${i}`});})());
  await emit('size_group_member',(function*(){for(let i=1;i<=12;i++)yield {source_key:key('size_group_member',i),source_refs:ref('size_group_member',i),fields:{...base('size_group_member').fields,size_id:target('size',i),display_order:i}};})());
  await emit('product',(function*(){for(let i=1;i<=n.product;i++)yield make('product',i,{product_code:`SYNTHETIC-P-${String(i).padStart(7,'0')}`,name:`SYNTHETIC ITEM ${i} ${'sample-description-'.repeat(1+i%4)}`,system_item_code:String(100000+i)});})());
  await emit('sku',(function*(){for(let i=1;i<=n.product;i++)yield make('sku',i,{product_id:target('product',i),color_id:target('color',1+(i-1)%20),fit_id:target('fit',1+(i-1)%8),size_id:target('size',1+(i-1)%12),sku_code:`SYNTHETIC-SKU-${String(i).padStart(8,'0')}`});})());
  await emit('warehouse',(function*(){for(let i=1;i<=n.warehouse;i++)yield make('warehouse',i,{name:`SYNTHETIC WAREHOUSE ${i}`});})());
  await emit('sales_header',(function*(){for(let h=1;h<=n.sales_header;h++){const gross=money(saleGross(h));yield make('sales_header',h,{number:`SYN-SALES-${String(h).padStart(9,'0')}`,warehouse_id:target('warehouse',1+h%Math.min(14,n.warehouse-1)),status:h<=n.sales_settlement?'APPROVED':'DRAFT',gross_amount:gross,net_due:gross,note:`SYNTHETIC sales document ${h} / reference ${String(h*17).padStart(10,'0')}`});}})());
  await emit('sales_line',(function*(){for(let h=1;h<=n.sales_header;h++)for(let j=1;j<=salesCount(h);j++){const i=salesOffset(h)+j,q=saleQuantity(h,i),price=100+h%900;yield make('sales_line',i,{sales_id:target('sales_header',h),line_no:j,sku_id:target('sku',1+(i*19)%n.product),quantity:String(q),deal_price:money(price),line_amount:money(q*price),product_code_snapshot:`SYNTHETIC-P-${String(1+(i*19)%n.product).padStart(7,'0')}`,product_name_snapshot:`SYNTHETIC line ${i} ${'varied '.repeat(1+i%8)}`,color_name_snapshot:`Synthetic color ${i%11}`,fit_name_snapshot:`Synthetic fit ${i%7}`,size_name_snapshot:`Synthetic size ${i%17}`});}})());
  await emit('sales_settlement',(function*(){for(let h=1;h<=n.sales_settlement;h++)yield make('sales_settlement',h,{sales_id:target('sales_header',h),direction:saleGross(h)<0?'REFUND':'RECEIVE',amount:money(Math.abs(saleGross(h))),account_name_snapshot:`SYNTHETIC account ${h%23}`,method_name_snapshot:`SYNTHETIC method ${h%5}`});})());
  await emit('transfer_header',(function*(){for(let h=1;h<=n.transfer_header;h++)yield make('transfer_header',h,{number:`SYN-TRANSFER-${String(h).padStart(9,'0')}`,from_warehouse_id:target('warehouse',1),to_warehouse_id:target('warehouse',2+h%(Math.min(14,n.warehouse-1)-1)),note:`SYNTHETIC transfer ${h} reference ${h*29}`});})());
  await emit('transfer_line',(function*(){for(let h=1;h<=n.transfer_header;h++)for(let j=1;j<=transferCount(h);j++){const i=transferOffset(h)+j;yield make('transfer_line',i,{transfer_id:target('transfer_header',h),line_no:j,sku_id:target('sku',1+(i*23)%n.product),quantity:String(1+i%37),product_code_snapshot:`SYNTHETIC-P-${String(1+(i*23)%n.product).padStart(7,'0')}`,product_name_snapshot:`SYNTHETIC transfer line ${i} ${'sample '.repeat(1+i%9)}`,color_name_snapshot:`Synthetic color ${i%11}`,fit_name_snapshot:`Synthetic fit ${i%7}`,size_name_snapshot:`Synthetic size ${i%17}`});}})());
  await emit('inventory_baseline',(function*(){for(let i=1;i<=n.inventory_baseline;i++){const warehouse=1+Math.floor((i-1)/n.product),sku=1+(i-1)%n.product;yield {source_key:key('inventory_baseline',i),source_refs:ref('inventory_baseline',i),fields:{warehouse_id:target('warehouse',warehouse),sku_id:target('sku',sku),quantity:String((i%301)-100)}};}})());
  await flushRegistry();
 } finally {await registry.close();}
 m.identity_registry={relative_path:'identity-registry.jsonl',bytes:regBytes,row_count:regRows,sha256:regHash.digest('hex')};m.inventory_source.warehouse_registry_sha256=m.identity_registry.sha256;m.inventory_source.sku_registry_sha256=m.identity_registry.sha256;
 const reconciliation=p.reports['reconciliation.json'];for(const [t,c] of Object.entries(counts))reconciliation.tables[t]={source_rows:c,retained_rows:c,rejected_rows:0};const rb=Buffer.from(JSON.stringify(reconciliation)+'\n');await writeFile(join(root,'reconciliation.json'),rb);Object.assign(m.reports.find(x=>x.role==='RECONCILIATION'),{bytes:rb.length,sha256:sha256(rb)});
 const manifest=Buffer.from(JSON.stringify(m));await writeFile(join(root,'manifest.json'),manifest);return {manifestSha256:sha256(manifest),counts,bytes:regBytes+m.files.reduce((a,x)=>a+x.bytes,0)+m.reports.reduce((a,x)=>a+x.bytes,0)+m.assets.reduce((a,x)=>a+x.bytes,0)+manifest.length};
}
