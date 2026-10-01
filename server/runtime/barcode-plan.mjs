// C8/C9 user decision, 2026-09-30: every scheme uses the complete source
// default barcode as its item field, including scheme 9. Product codes and
// names do not supply this segment. Its declared width is ignored.
export const segmentRules=Object.freeze({
  '0':{id:'2020',item:'defaultBarcode',colorWidth:1,sizeWidth:2},
  '8':{id:'2018',item:'defaultBarcode',colorWidth:1,sizeWidth:2},
  '6':{id:'2021',item:'defaultBarcode',colorWidth:3,sizeWidth:2},
  '2':{id:'2021fit',item:'defaultBarcode',colorWidth:3,sizeWidth:2},
  '9':{id:'2023',item:'defaultBarcode',colorWidth:3,sizeWidth:3},
});

function normalized(row){
  const a=row.a||{};
  return {...row,scheme:String(row.scheme??a.sourceBarcodeSchemeCode??''),defaultBarcode:String(row.default_barcode??a.defaultBarcode??''),sourceColor:String(row.options?.COLOR??''),sourceSize:String(row.options?.SIZE??'')};
}
function unique(values){return [...new Set(values)];}
function sizeCode(raw,width){
  if(!raw)return '';
  if(raw.length<=width)return raw.padStart(width,'0');
  if(width!==2)return '';
  if(raw==='910')return '00'; // The original T+ 910 is 无尺码, never 40.
  if(/^90[1-9]$/.test(raw))return raw.slice(-2);
  if(/^9(4[1-9]|50)$/.test(raw))return String(Number(raw)-940).padStart(2,'0');
  return '';
}
function itemCode(row,rule){
  if(rule.item!=='defaultBarcode')throw Error('ITEM_FIELD_MUST_BE_DEFAULT_BARCODE');
  return {code:row.defaultBarcode,derivation:null};
}
function indexCodes(entries){
  const index=new Map();
  for(const entry of entries){if(!index.has(entry.barcode))index.set(entry.barcode,[]);index.get(entry.barcode).push(entry);}
  return index;
}
function conflictingOwners(entries,sku){return entries?.some(entry=>!entry.sku_id||entry.sku_id!==sku)??false;}

/** Pure, reproducible barcode plan. No source SKU or inventory is modified. */
export function planHistoricalBarcodes(sourceRows,existingRows){
  const rows=sourceRows.map(normalized),existing=existingRows.map(x=>({...x,sku_id:x.sku_id||null}));
  const groups=new Map(),issues=[],candidates=[],colorRemaps=[];
  for(const row of rows){if(!groups.has(row.product_id))groups.set(row.product_id,[]);groups.get(row.product_id).push(row);}
  for(const group of groups.values()){
    const first=group[0],rule=segmentRules[first.scheme];
    if(!rule){for(const row of group)issues.push({reason:'UNKNOWN_SCHEME',product:row.code,sku:row.sku_id,scheme:row.scheme});continue;}
    const colorMap=new Map(),usedColors=new Set();
    const colors=unique(group.map(x=>x.sourceColor)).sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b));
    const direct=[...colors].filter(raw=>raw&&raw.length<=rule.colorWidth).sort((a,b)=>(b.length===rule.colorWidth)-(a.length===rule.colorWidth)||Number(a)-Number(b)||a.localeCompare(b));
    for(const raw of direct){const slot=raw.padStart(rule.colorWidth,'0');if(!usedColors.has(slot)){colorMap.set(raw,slot);usedColors.add(slot);}}
    for(const raw of colors){
      if(colorMap.has(raw))continue;
      if(!raw){issues.push({reason:'COLOR_MISSING',product:first.code,color:raw});continue;}
      if(![1,3].includes(rule.colorWidth)){issues.push({reason:'COLOR_NO_RULE',product:first.code,color:raw});continue;}
      let slot='';for(let i=1;i<=10**rule.colorWidth-1;i++){const candidate=String(i).padStart(rule.colorWidth,'0');if(!usedColors.has(candidate)){slot=candidate;break;}}
      if(slot){
        colorMap.set(raw,slot);usedColors.add(slot);
        if(raw.length<=rule.colorWidth)colorRemaps.push({product:first.code,sourceColor:raw,previous:raw.padStart(rule.colorWidth,'0'),assigned:slot,reason:'source-color-slot-collision'});
      }else issues.push({reason:'COLOR_SLOT_EXHAUSTED',product:first.code,color:raw});
    }
    const sizeMap=new Map(),usedSizes=new Map();
    for(const raw of unique(group.map(x=>x.sourceSize))){
      const slot=sizeCode(raw,rule.sizeWidth);
      if(!slot){issues.push({reason:'SIZE_NO_RULE',product:first.code,size:raw});continue;}
      if(usedSizes.has(slot)&&usedSizes.get(slot)!==raw){issues.push({reason:'SIZE_CODE_COLLISION',product:first.code,size:raw,with:usedSizes.get(slot),slot});continue;}
      usedSizes.set(slot,raw);sizeMap.set(raw,slot);
    }
    const item=itemCode(first,rule),goods=item.code;
    for(const row of group){
      const color=colorMap.get(row.sourceColor),size=sizeMap.get(row.sourceSize);
      if(!goods||!color||!size){issues.push({reason:!goods?'GOODS_MISSING':!color?'COLOR_MISSING':'SIZE_MISSING',product:row.code,sku:row.sku_id,scheme:row.scheme,defaultBarcode:row.defaultBarcode,sourceColor:row.sourceColor,sourceSize:row.sourceSize});continue;}
      candidates.push({...row,goods,color,size,barcode:row.scheme+goods+color+size,colorWidth:rule.colorWidth,sizeWidth:rule.sizeWidth,sourceItemField:rule.item,stockCodeDerivation:item.derivation});
    }
  }
  // A generated v2 code can happen to match a new one-digit-color candidate
  // for another SKU. Assign a free per-product color slot before publishing.
  const byCandidateProduct=new Map();for(const row of candidates){if(!byCandidateProduct.has(row.product_id))byCandidateProduct.set(row.product_id,[]);byCandidateProduct.get(row.product_id).push(row);}
  for(const group of byCandidateProduct.values()){
    if(group[0].colorWidth!==1)continue;
    for(const raw of unique(group.map(x=>x.sourceColor))){
      const affected=group.filter(x=>x.sourceColor===raw),occupied=indexCodes([...existing,...candidates.filter(x=>!affected.includes(x))].map(x=>({...x,sku_id:x.sku_id})));
      if(!affected.some(x=>conflictingOwners(occupied.get(x.barcode),x.sku_id)))continue;
      const used=new Set(group.filter(x=>x.sourceColor!==raw).map(x=>x.color));
      for(let digit=1;digit<=9;digit++){
        const slot=String(digit);if(used.has(slot))continue;
        const trial=affected.map(x=>({...x,color:slot,barcode:x.scheme+x.goods+slot+x.size}));
        if(trial.some(x=>conflictingOwners(occupied.get(x.barcode),x.sku_id)))continue;
        if(unique(trial.map(x=>x.barcode)).length!==trial.length)continue;
        colorRemaps.push({product:group[0].code,sourceColor:raw,previous:affected[0].color,assigned:slot,reason:'avoid-existing-barcode-collision'});
        for(let i=0;i<affected.length;i++){affected[i].color=slot;affected[i].barcode=trial[i].barcode;}
        break;
      }
    }
  }
  const occupied=indexCodes([...existing,...candidates]);
  const generatedBySku=new Map(existing.filter(x=>x.origin==='generated').map(x=>[x.sku_id,x]));
  const collisions=[],accepted=[];
  for(const row of candidates){
    const owned=generatedBySku.get(row.sku_id);
    if(owned&&!['historical-generation-v2','historical-generation-v3','historical-generation-v3-c9'].includes(owned.rule)){
      issues.push({reason:'CUSTOM_BARCODE_OWNED',product:row.code,sku:row.sku_id,barcode:owned.barcode});
      continue;
    }
    const owners=occupied.get(row.barcode);
    if(conflictingOwners(owners,row.sku_id))collisions.push({reason:'BARCODE_COLLISION',product:row.code,sku:row.sku_id,barcode:row.barcode,sourceColor:row.sourceColor,sourceSize:row.sourceSize,owners:owners.map(x=>({sku:x.sku_id,origin:x.origin||'candidate'}))});
    else accepted.push(row);
  }
  const acceptedCodes=indexCodes(accepted),oldBySku=generatedBySku;
  const aliases=[],aliasIndex=indexCodes(existing.filter(x=>x.origin!=='generated'));
  for(const row of accepted){
    const old=oldBySku.get(row.sku_id);
    if(old&&old.barcode!==row.barcode){
      if(conflictingOwners(acceptedCodes.get(old.barcode),row.sku_id)||conflictingOwners(aliasIndex.get(old.barcode),row.sku_id))issues.push({reason:'OLD_CODE_ALIAS_COLLISION',product:row.code,sku:row.sku_id,barcode:old.barcode});
      else aliases.push({product_id:row.product_id,sku_id:row.sku_id,barcode:old.barcode,kind:'prior-generated'});
    }
    if(row.sourceSize.length>row.sizeWidth){
      const barcode=row.scheme+row.goods+row.color+row.sourceSize;
      if(barcode!==row.barcode&&old?.barcode!==barcode){
        const owners=[...(occupied.get(barcode)||[]),...aliases.filter(x=>x.barcode===barcode)];
        if(conflictingOwners(owners,row.sku_id))issues.push({reason:'RAW_SIZE_ALIAS_COLLISION',product:row.code,sku:row.sku_id,barcode});
        else aliases.push({product_id:row.product_id,sku_id:row.sku_id,barcode,kind:'raw-source-size'});
      }
    }
  }
  const dedupedAliases=[...new Map(aliases.map(x=>[x.barcode,x])).values()];
  return {sourceCount:rows.length,productCount:groups.size,candidates,accepted,collisions,issues,colorRemaps,aliases:dedupedAliases};
}
