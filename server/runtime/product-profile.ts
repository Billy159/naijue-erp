import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {compatibleFit} from '../adapter.mjs';
import {sizeMapping} from './size-mapping.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';
import {excelManagedProduct} from './excel-barcode-authority.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields=['name','categoryId','year','season','supplierId','thickness','shapeCode','barcodeItemCode','freeCode','schemeId','fitId','fitIds','selectedColorIds','selectedFitIds','selectedSizeIds','groupId','purchasePrice','price','wholesale5','wholesale6','wholesale7','wholesale8','wholesale9','wholesale10','minimumPrice'];
const fail=(s:string):never=>{throw Error(s)};
function mainBarcode(profile:any,fitId:string,colorCode:string,sizeCode:string){
 if(profile.schemeId==='2018')return /^\d{5}$/.test(String(profile.freeCode||''))&&/^\d$/.test(colorCode)&&/^\d{2}$/.test(sizeCode)?'8'+profile.freeCode+colorCode+sizeCode:'';
 const goods=String(profile.barcodeItemCode||'');
 const schemes:{[key:string]:[string,number,number]}={'2020':['0',3,3],'2021':['6',3,2],'2021fit':['2',3,2],'2023':['9',3,3],'2026':['5',3,3]};
 const rule=schemes[profile.schemeId];if(!rule||!/^\d{7}$/.test(goods)||!/^[A-Z]$/.test(fitId))return '';
 const [prefix,colorLength,sizeLength]=rule;
 if(!new RegExp('^\\d{'+colorLength+'}$').test(colorCode)||!new RegExp('^\\d{'+sizeLength+'}$').test(sizeCode))return '';
 return prefix+(profile.schemeId==='2026'?fitId:'')+goods+(profile.schemeId==='2021fit'?fitId:'')+colorCode+sizeCode;
}
export async function productProfiles(schema=RUNTIME){return transaction(schema,async tx=>({profiles:(await tx.query('SELECT product_id,body,version FROM product_profile_overlay')).rows,aliases:(await tx.query('SELECT barcode,product_id,sku_id,historical_note,origin FROM product_barcode_alias')).rows}));}
export async function saveProductProfile(input:any,schema=RUNTIME){
 if(!uuid.test(input?.productId||'')||!Number.isSafeInteger(input?.expectedVersion)||input.expectedVersion<0||!input?.profile||typeof input.profile!=='object')fail('INVALID_PRODUCT_PROFILE');
 const productId=input.productId,body=input.profile,images=body.images||[],aliases=input.aliases||[],removedAliases=input.removedAliases||[],specs=input.specs;
 const newCode=input.newCode==null?'':String(input.newCode).trim();if(newCode&&!/^[A-Za-z0-9_-]{1,80}$/.test(newCode))fail('款号只能使用字母、数字、短横线或下划线');
 if(!Array.isArray(images)||images.length>1000||!Array.isArray(aliases)||aliases.length>200||!Array.isArray(removedAliases)||removedAliases.length>200||removedAliases.some((code:any)=>typeof code!=='string'||!code||code.length>80))fail('INVALID_PRODUCT_MEDIA_OR_BARCODES');
 const profile:any={};for(const key of fields)if(Object.hasOwn(body,key))profile[key]=body[key];
 if(typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>80)fail('INVALID_PRODUCT_NAME');
 for(const key of ['categoryId','supplierId','schemeId','barcodeItemCode','thickness','shapeCode','season','year','fitId','groupId'])if(profile[key]!=null&&(typeof profile[key]!=='string'||profile[key].length>120))fail('INVALID_PRODUCT_FIELD');
 if(!profile.year?.trim())fail('请选择年份');
 if(!profile.season?.trim())fail('请选择季节');
 if(!profile.barcodeItemCode?.trim())fail('请填写系统货号');
 if(profile.freeCode!=null&&profile.freeCode!==''&&!/^\d{5}$/.test(profile.freeCode))fail('2018 方案货号编码须为 5 位数字');
 if(specs!==undefined&&(!specs||!Array.isArray(specs.colors)||!Array.isArray(specs.sizes)||!Array.isArray(specs.fits)||!specs.colors.length||!specs.sizes.length||!specs.fits.length||specs.colors.length>60||specs.sizes.length>60||specs.fits.length>20||specs.colors.some((x:any)=>!uuid.test(x))||specs.fits.some((x:any)=>typeof x!=='string'||!/^[A-Z]$/.test(x))||specs.sizes.some((x:any)=>!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>80||typeof x.groupName!=='string'||!x.groupName.trim()||x.groupName.length>100||String(x.code||'').length>12)))fail('INVALID_PRODUCT_SPECS');
 if(profile.fitIds!==undefined&&(!Array.isArray(profile.fitIds)||!profile.fitIds.length||profile.fitIds.length>20||profile.fitIds.some((id:any)=>typeof id!=='string'||id.length>50)))fail('INVALID_PRODUCT_FITS');
 for(const key of ['purchasePrice','price','wholesale5','wholesale6','wholesale7','wholesale8','wholesale9','wholesale10','minimumPrice'])if(profile[key]!=null&&profile[key]!==''&&(!Number.isFinite(Number(profile[key]))||Number(profile[key])<0||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(profile[key]))))fail('INVALID_PRODUCT_PRICE');
 for(const image of images){if(!image||typeof image.name!=='string'||image.name.length>180||!['主图','白底图','吊牌图','详情图','颜色配图','辅助图片'].includes(image.role)||typeof image.url!=='string'||!(image.url.startsWith('/')||/^data:image\/(png|jpeg|webp);base64,/i.test(image.url))||image.url.length>11_200_000)fail('INVALID_PRODUCT_IMAGE')}
 const perColor=new Set();for(const image of images.filter((x:any)=>x.role==='颜色配图')){if(!image.colorId||perColor.has(image.colorId))fail('DUPLICATE_COLOR_IMAGE');perColor.add(image.colorId)}
 profile.images=images.map((x:any,i:number)=>({id:String(x.id||''),name:x.name,role:x.role,url:x.url,colorId:String(x.colorId||''),sortOrder:i}));
 return transaction(schema,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product:'+productId]);
  await tx.execute('LOCK TABLE generated_barcode IN ROW EXCLUSIVE MODE');
  const excelManaged=await excelManagedProduct(tx,productId);
  // Manual aliases bind exact strings to existing SKUs; Excel protection still freezes main-code generation below.
  let source=(await tx.query(`SELECT p.id,p.code,f.name fit_name FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id WHERE p.id=$1::uuid`,[productId])).rows[0];
  const v2=(await tx.query('SELECT id,code,body,deleted FROM product_overlay WHERE id=$1::uuid',[productId])).rows[0];
  if(v2?.deleted)fail('商品已删除');
  if(!source&&v2)source={id:v2.id,code:v2.code,fit_name:(v2.body.fitId||'A')+'版'};
  if(!source){
   if(!newCode||input.expectedVersion!==0||!specs)fail('PRODUCT_NOT_FOUND');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product-code:'+newCode]);
   if((await tx.query(`SELECT 1 FROM ${SOURCE}.product WHERE code=$1 UNION ALL SELECT 1 FROM product_overlay WHERE code=$1 LIMIT 1`,[newCode])).rowCount)fail('商品款号已存在');
   if(!profile.categoryId||!profile.supplierId||!profile.fitId)fail('请填写商品分类、供应商和版型');
   if(profile.schemeId==='2026'&&!profile.barcodeItemCode){
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product-item-code']);
    for(let attempt=0;attempt<100&&!profile.barcodeItemCode;attempt++){
     const code=(await tx.query("SELECT nextval('product_item_code_seq')::text code")).rows[0].code;
     const taken=(await tx.query(`SELECT 1 FROM product_profile_overlay WHERE body->>'barcodeItemCode'=$1 UNION ALL SELECT 1 FROM ${SOURCE}.product WHERE position($1 in code)>0 LIMIT 1`,[code])).rowCount;
     if(!taken)profile.barcodeItemCode=code;
    }
    if(!profile.barcodeItemCode)fail('系统货号已用尽');
   }
   await tx.query('INSERT INTO product_overlay(id,code,body) VALUES($1::uuid,$2,$3::jsonb) RETURNING id',[productId,newCode,JSON.stringify(profile)]);
   source={id:productId,code:newCode,fit_name:profile.fitId+'版'};
  }
  if(newCode&&newCode!==source.code)fail('商品款号与已保存商品不一致');
  if(!excelManaged&&profile.barcodeItemCode){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product-item-code:'+profile.barcodeItemCode]);
   if((await tx.query("SELECT 1 FROM product_profile_overlay WHERE product_id<>$1::uuid AND body->>'barcodeItemCode'=$2 LIMIT 1",[productId,profile.barcodeItemCode])).rowCount)fail('系统货号已被其他商品使用');}
  const current=(await tx.query('SELECT version,body FROM product_profile_overlay WHERE product_id=$1::uuid',[productId])).rows[0],version=current?.version||0;if(version!==input.expectedVersion)fail('PRODUCT_VERSION_CONFLICT');
  for(const key of ['specSizeRecords','historicalSpecSizeRecords','removedHistoricalBarcodes'])if(current?.body?.[key]!==undefined)profile[key]=current.body[key];
  if(profile.categoryId&&!(await tx.query(`SELECT 1 FROM ${SOURCE}.category WHERE code=$1 UNION SELECT 1 FROM product_master_overlay WHERE kind='categories' AND id=$1 AND deleted=false`,[profile.categoryId])).rowCount)fail('UNKNOWN_PRODUCT_CATEGORY');
  const baseFit=compatibleFit(source.fit_name).id,created:any[]=[];
  if(specs){
   const masters=(await tx.query("SELECT kind,id,body FROM product_master_overlay WHERE deleted=false AND kind IN ('groups','fits')")).rows;
   const activeGroup=masters.find((x:any)=>x.kind==='groups'&&x.id===profile.groupId)?.body||currentSizeGroups().find(x=>x.id===profile.groupId);
   if(!activeGroup||specs.sizes.some((size:any)=>size.groupName!==activeGroup.name||!activeGroup.sizes.some((candidate:any)=>candidate.id===size.id&&candidate.name===size.name)))fail('尺码只能从商品当前尺码组选择');
   const activeNames=new Set<string>(activeGroup.sizes.map((x:any)=>x.name));
   const permittedFits=new Set(['Y','A','B','C','D','E',...masters.filter((x:any)=>x.kind==='fits').map((x:any)=>x.id)]);
   if(specs.fits.some((id:string)=>!permittedFits.has(id)))fail('版型不存在，请重新选择');
   if(!excelManaged&&profile.schemeId==='2018'&&!profile.freeCode){
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product-free-code-2018']);
    const candidate=(await tx.query(`SELECT lpad(n::text,5,'0') code FROM generate_series(1,99999) n WHERE NOT EXISTS(SELECT 1 FROM ${SOURCE}.tplus_product_barcode b WHERE b.barcode ~ '^8[0-9]{8}$' AND substring(b.barcode from 2 for 5)=lpad(n::text,5,'0')) AND NOT EXISTS(SELECT 1 FROM generated_barcode b WHERE b.barcode ~ '^8[0-9]{8}$' AND substring(b.barcode from 2 for 5)=lpad(n::text,5,'0')) AND NOT EXISTS(SELECT 1 FROM product_barcode_alias b WHERE b.barcode ~ '^8[0-9]{8}$' AND substring(b.barcode from 2 for 5)=lpad(n::text,5,'0')) AND NOT EXISTS(SELECT 1 FROM product_profile_overlay p WHERE p.body->>'freeCode'=lpad(n::text,5,'0') AND p.product_id<>$1::uuid) ORDER BY n LIMIT 1`,[productId])).rows[0];
    if(!candidate)fail('2018 方案可用货号编码已用尽');
    profile.freeCode=candidate.code;
   }
   const sourceVariants=(await tx.query(`SELECT v.id,c.spec_value_id color_id,z.spec_value_id size_id FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension cd ON cd.id=c.dimension_id AND cd.code='COLOR' JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id JOIN ${SOURCE}.spec_dimension zd ON zd.id=z.dimension_id AND zd.code='SIZE' WHERE v.product_id=$1::uuid`,[productId])).rows;
   const sizeRows=[];for(const size of specs.sizes){const uiSizeId=String(size.id||''),name=size.name.trim();let id=uiSizeId;if(uuid.test(id)){
    const known=(await tx.query(`SELECT 1 FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='SIZE' WHERE s.id=$1::uuid UNION ALL SELECT 1 FROM size_overlay WHERE id=$1::uuid LIMIT 1`,[id])).rowCount;if(!known)fail('尺码不存在，请重新选择');
   }else{id=(await tx.query('INSERT INTO size_overlay(group_name,name) VALUES($1,$2) ON CONFLICT(group_name,name) DO UPDATE SET name=excluded.name RETURNING id',[size.groupName,name])).rows[0].id}
   sizeRows.push({id,uiSizeId,name,code:String(activeGroup.sizes.find((x:any)=>x.id===uiSizeId).code||'').trim(),groupName:activeGroup.name});
   }
   const retired=(current?.body?.specSizeRecords||[]).filter((record:any)=>!activeNames.has(record.name));
   if(retired.length)profile.historicalSpecSizeRecords=[...(current?.body?.historicalSpecSizeRecords||[]),...retired.filter((record:any)=>!(current?.body?.historicalSpecSizeRecords||[]).some((old:any)=>old.id===record.id))];
   profile.specSizeRecords=sizeRows;
   profile.selectedSizeIds=sizeRows.map(x=>x.uiSizeId);
   profile.selectedColorIds=[...new Set(specs.colors)];
   profile.selectedFitIds=[...new Set(specs.fits)];
   profile.fitIds=[...new Set(specs.fits)];
   profile.fitId=specs.fits.includes(profile.fitId)?profile.fitId:specs.fits[0];
   const selectedNames=new Set(sizeRows.map(x=>x.name));
   const sourceCells=new Map<string,string[]>();
   for(const row of sourceVariants){const mapped=sizeMapping.get(row.id);if(!mapped||mapped.targetGroup!==profile.groupId)continue;
    const sizeName=mapped.sourceCode==='910'&&mapped.sourceSize==='无尺码'?'无尺码':mapped.targetSize;
    const cell=row.color_id+'|'+baseFit+'|'+sizeName;
    const ids=sourceCells.get(cell)||[];ids.push(row.id);sourceCells.set(cell,ids);
   }
   const previous= current?.body||{};
   const sourceGroups=[...new Set(sourceVariants.map((row:any)=>sizeMapping.get(row.id)?.targetGroup).filter(Boolean))];
   const previousGroup=previous.groupId||(sourceGroups.length===1?sourceGroups[0]:'');
   const priorSource=sourceVariants.map((row:any)=>({row,mapped:sizeMapping.get(row.id)})).filter(({mapped}:any)=>mapped?.targetGroup===previousGroup);
   const priorColors=new Set<string>(Array.isArray(previous.selectedColorIds)?previous.selectedColorIds:priorSource.map(({row}:any)=>row.color_id));
   const priorFits=new Set<string>(Array.isArray(previous.selectedFitIds)?previous.selectedFitIds:priorSource.length?[baseFit]:[]);
   const priorNames=new Set<string>(Array.isArray(previous.selectedSizeIds)&&Array.isArray(previous.specSizeRecords)?previous.specSizeRecords.filter((x:any)=>previous.selectedSizeIds.includes(x.uiSizeId||x.id)).map((x:any)=>x.name):priorSource.map(({mapped}:any)=>mapped.sourceCode==='910'&&mapped.sourceSize==='无尺码'?'无尺码':mapped.targetSize));
   for(const row of sourceVariants){const mapped=sizeMapping.get(row.id);if(!mapped||mapped.targetGroup!==previousGroup)continue;
    const sizeName=mapped.sourceCode==='910'&&mapped.sourceSize==='无尺码'?'无尺码':mapped.targetSize;
    const previousDefinition=masters.find((x:any)=>x.kind==='groups'&&x.id===previousGroup)?.body||currentSizeGroups().find(x=>x.id===previousGroup);
    if(!previousDefinition?.sizes.some((size:any)=>size.name===sizeName))continue;
    if(Array.isArray(previous.selectedColorIds)&&!previous.selectedColorIds.includes(row.color_id))continue;
    if(Array.isArray(previous.selectedFitIds)&&!previous.selectedFitIds.includes(baseFit))continue;
    if(Array.isArray(previous.selectedSizeIds)&&Array.isArray(previous.specSizeRecords)&&!previous.specSizeRecords.some((x:any)=>x.name===sizeName&&previous.selectedSizeIds.includes(x.uiSizeId||x.id)))continue;
    if(mapped.targetGroup!==profile.groupId||!specs.colors.includes(row.color_id)||!specs.fits.includes(baseFit)||!selectedNames.has(sizeName))fail('移除的规格已有原始 SKU、条码、库存或业务单据引用，无法删除');
   }
   const wantedSizes=new Set(sizeRows.map(x=>x.id));
   const currentOverlay=(await tx.query('SELECT id,color_id,size_id,fit_id,size_name,group_name FROM variant_overlay WHERE product_id=$1::uuid',[productId])).rows;
   for(const row of currentOverlay){if(row.group_name===activeGroup.name&&!activeNames.has(row.size_name))continue;if(specs.colors.includes(row.color_id)&&wantedSizes.has(row.size_id)&&specs.fits.includes(row.fit_id))continue;
    fail('移除的规格已有 SKU，无法删除');
   }
   const colorRows=(await tx.query(`SELECT s.id::text id,s.code FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='COLOR' WHERE s.id::text IN (SELECT jsonb_array_elements_text($1::jsonb)) UNION ALL SELECT id,body->>'code' code FROM product_master_overlay WHERE kind='colors' AND deleted=false AND id IN (SELECT jsonb_array_elements_text($1::jsonb))`,[JSON.stringify(specs.colors)])).rows;
   const colors=new Map(colorRows.map((x:any)=>[x.id,x]));if(specs.colors.some((id:string)=>!colors.has(id)))fail('颜色不存在，请重新选择');
   for(const colorId of specs.colors)for(const fitId of specs.fits)for(const size of sizeRows){const sourceCell=colorId+'|'+fitId+'|'+size.name,sourceIds=sourceCells.get(sourceCell)||[];
    if(sourceIds.length>1)continue;
    const old=sourceIds.length?{id:sourceIds[0]}:(await tx.query('SELECT id FROM variant_overlay WHERE product_id=$1::uuid AND color_id=$2::uuid AND size_id=$3::uuid AND fit_id=$4',[productId,colorId,size.id,fitId])).rows[0];
    if(!old&&priorColors.has(colorId)&&priorFits.has(fitId)&&priorNames.has(size.name))continue;
    const sku=old||(await tx.query(`INSERT INTO variant_overlay(product_id,color_id,size_id,fit_id,size_name,size_code,group_name) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) RETURNING id`,[productId,colorId,size.id,fitId,size.name,size.code,size.groupName])).rows[0];
    if(!old)created.push({skuId:sku.id,colorId,fitId,sizeId:size.id,sizeName:size.name});
    const colorCode=String((colors.get(colorId) as any).code||''),barcode=excelManaged?'':mainBarcode(profile,fitId,colorCode,size.code);
    if(!barcode&&newCode&&profile.schemeId)fail('当前规格的条码编码不完整，请补齐颜色和尺码编码');
    if(barcode&&!(await tx.query('SELECT 1 FROM generated_barcode WHERE sku_id=$1::uuid LIMIT 1',[sku.id])).rowCount){
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':barcode:'+barcode]);
      if((await tx.query(`SELECT 1 FROM ${SOURCE}.tplus_product_barcode WHERE barcode=$1 AND (product_id<>$2::uuid OR sku_id IS DISTINCT FROM $3::uuid) UNION ALL SELECT 1 FROM generated_barcode WHERE barcode=$1 UNION ALL SELECT 1 FROM product_barcode_alias WHERE barcode=$1 AND sku_id<>$3::uuid LIMIT 1`,[barcode,productId,sku.id])).rowCount)fail('新规格条码 '+barcode+' 已被使用，请调整编码');
      await tx.query('INSERT INTO generated_barcode(sku_id,product_id,barcode,scheme_id,evidence) VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb) RETURNING barcode',[sku.id,productId,barcode,profile.schemeId,JSON.stringify({source:'product-profile',fitId,colorId,sizeId:size.id})]);
    }
   }
  }
  const skuRows=(await tx.query(`SELECT id FROM ${SOURCE}.variant WHERE product_id=$1::uuid UNION SELECT id FROM variant_overlay WHERE product_id=$1::uuid`,[productId])).rows,skuIds=new Set(skuRows.map((x:any)=>x.id));
  for(const code of [...new Set(aliases.map((item:any)=>String(item.code||'').trim()))].sort())
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':barcode:'+code]);
  const seen=new Set();for(const item of aliases){const code=String(item.code||'').trim(),sku=String(item.skuId||'');if(!code||code.length>80||!uuid.test(sku)||!skuIds.has(sku)||seen.has(code))fail('INVALID_COMPATIBLE_BARCODE');seen.add(code);
   if((await tx.query(`SELECT 1 FROM ${SOURCE}.tplus_product_barcode WHERE barcode=$1 UNION SELECT 1 FROM generated_barcode WHERE barcode=$1`,[code])).rowCount)fail('BARCODE_ALREADY_BOUND');
   const existing=(await tx.query('SELECT sku_id FROM product_barcode_alias WHERE barcode=$1',[code])).rows[0];if(existing&&existing.sku_id!==sku)fail('BARCODE_ALREADY_BOUND');
  }
  for(const code of new Set(removedAliases)){
   if(seen.has(code))fail('待删除条码仍在商品草稿中');
   if((await tx.query('SELECT 1 FROM generated_barcode WHERE product_id=$1::uuid AND barcode=$2 LIMIT 1',[productId,code])).rowCount)fail('主条码不允许删除');
   const owned=(await tx.query(`SELECT 1 FROM ${SOURCE}.tplus_product_barcode WHERE product_id=$1::uuid AND barcode=$2 UNION ALL SELECT 1 FROM product_barcode_alias WHERE product_id=$1::uuid AND barcode=$2 LIMIT 1`,[productId,code])).rowCount;
   if(!owned&&!profile.removedHistoricalBarcodes?.includes(code))fail('条码不属于当前商品');
   profile.removedHistoricalBarcodes=[...new Set([...(profile.removedHistoricalBarcodes||[]),code])];
   await tx.query('DELETE FROM product_barcode_alias WHERE product_id=$1::uuid AND barcode=$2 RETURNING barcode',[productId,code]);
  }
  for(const item of aliases)await tx.query("INSERT INTO product_barcode_alias(barcode,product_id,sku_id,historical_note,origin) VALUES($1,$2::uuid,$3::uuid,$4,'MANUAL') ON CONFLICT(barcode) DO NOTHING RETURNING barcode",[String(item.code).trim(),productId,item.skuId,String(item.note||'').slice(0,100)]);
  const updated=await tx.query(`INSERT INTO product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1) ON CONFLICT(product_id) DO UPDATE SET body=excluded.body,version=product_profile_overlay.version+1,updated_at=now() RETURNING version`,[productId,JSON.stringify(profile)]);
  if(v2)await tx.query('UPDATE product_overlay SET body=$2::jsonb,updated_at=now() WHERE id=$1::uuid RETURNING id',[productId,JSON.stringify(profile)]);
  else if(newCode)await tx.query('UPDATE product_overlay SET body=$2::jsonb,updated_at=now() WHERE id=$1::uuid RETURNING id',[productId,JSON.stringify(profile)]);
  return {productId,version:updated.rows[0].version,created};
 });
}
export async function deleteProduct(input:any,schema=RUNTIME){
 const productId=String(input?.productId||'');if(!uuid.test(productId))fail('INVALID_PRODUCT');
 return transaction(schema,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product:'+productId]);
  const product=(await tx.query(`SELECT id,code FROM ${SOURCE}.product WHERE id=$1::uuid UNION ALL SELECT id,code FROM product_overlay WHERE id=$1::uuid AND deleted=false LIMIT 1`,[productId])).rows[0];if(!product)fail('PRODUCT_NOT_FOUND');
  const version=(await tx.query('SELECT version FROM product_profile_overlay WHERE product_id=$1::uuid',[productId])).rows[0]?.version||0;
  if(version!==input.expectedVersion)fail('商品已被其他页面修改，请刷新后重试');
  const refs=(await tx.query(`SELECT
   (SELECT count(*) FROM (SELECT warehouse_id,sku_id,sum(quantity) qty FROM (SELECT warehouse_id,variant_id sku_id,quantity FROM ${SOURCE}.tplus_inventory_balance_source UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta) balances WHERE sku_id IN (SELECT id FROM ${SOURCE}.variant WHERE product_id=$1::uuid UNION ALL SELECT id FROM variant_overlay WHERE product_id=$1::uuid) GROUP BY warehouse_id,sku_id HAVING sum(quantity)<>0) occupied) stock_cells,
   (SELECT count(*) FROM ${SOURCE}.tplus_history_line WHERE product_id=$1::uuid) history,
   (SELECT count(*) FROM ${SOURCE}.document_line WHERE variant_id IN (SELECT id FROM ${SOURCE}.variant WHERE product_id=$1::uuid)) source_documents,
   (SELECT count(*) FROM revision WHERE body::text LIKE '%'||$1||'%') runtime_documents,
   (SELECT count(*) FROM movement WHERE sku_id IN (SELECT id FROM ${SOURCE}.variant WHERE product_id=$1::uuid UNION ALL SELECT id FROM variant_overlay WHERE product_id=$1::uuid))+(SELECT count(*) FROM ${SOURCE}.inventory_movement WHERE variant_id IN (SELECT id FROM ${SOURCE}.variant WHERE product_id=$1::uuid)) movements`,[productId])).rows[0];
  const reasons=[];if(Number(refs.stock_cells)>0)reasons.push('库存不为 0');if(Number(refs.history)+Number(refs.source_documents)+Number(refs.runtime_documents)>0)reasons.push('已有销货单或调拨单引用');if(Number(refs.movements)>0)reasons.push('已有库存业务记录');
  if(reasons.length)fail('无法删除商品：'+reasons.join('；'));
  if(input.checkOnly===true)return {productId,code:product.code,canDelete:true};
  await tx.query('DELETE FROM product_barcode_alias WHERE product_id=$1::uuid RETURNING barcode',[productId]);
  await tx.query('DELETE FROM generated_barcode WHERE product_id=$1::uuid RETURNING barcode',[productId]);
  await tx.query('DELETE FROM variant_overlay WHERE product_id=$1::uuid RETURNING id',[productId]);
  await tx.query('DELETE FROM product_profile_overlay WHERE product_id=$1::uuid RETURNING product_id',[productId]);
  const fromSource=(await tx.query(`SELECT 1 FROM ${SOURCE}.product WHERE id=$1::uuid`,[productId])).rowCount>0;
  if(fromSource)await tx.query(`INSERT INTO product_overlay(id,code,body,deleted) VALUES($1::uuid,$2,'{}'::jsonb,true) ON CONFLICT(id) DO UPDATE SET deleted=true,updated_at=now() RETURNING id`,[productId,product.code]);
  else await tx.query('DELETE FROM product_overlay WHERE id=$1::uuid RETURNING id',[productId]);
  return {productId,code:product.code,deleted:true};
 });
}
