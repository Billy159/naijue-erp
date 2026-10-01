import {readFileSync} from 'node:fs';
const splitConfig=JSON.parse(readFileSync(new URL('./product-color-split.json',import.meta.url),'utf8'));const splits=splitConfig.enabled===false?{}:splitConfig.items;
import {compatibleFit} from '../adapter.mjs';
import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
// User decision: workbook sheet 1 remarks; seven-digit system item code, not default barcode.
export const schemes:any={'0':{id:'2020',lengths:[7,3,3]},'8':{id:'2018',lengths:[5,1,2]},'6':{id:'2021',lengths:[7,3,2]},'2':{id:'2021fit',lengths:[7,1,3,2]},'9':{id:'2023',lengths:[7,3,3]}};
export async function installBarcodes(){return transaction(RUNTIME,tx=>tx.execute(`CREATE TABLE IF NOT EXISTS generated_barcode(sku_id uuid PRIMARY KEY,product_id uuid NOT NULL,barcode text UNIQUE NOT NULL,scheme_id text NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`));}
export async function generateHistoricalBarcodes(confirm2023=true){
 return transaction(RUNTIME,async tx=>{
  await tx.execute('LOCK TABLE generated_barcode IN EXCLUSIVE MODE');
  await tx.execute('CREATE TABLE IF NOT EXISTS generated_barcode_retired (LIKE generated_barcode INCLUDING DEFAULTS)');
  await tx.execute("INSERT INTO generated_barcode_retired SELECT * FROM generated_barcode WHERE evidence->>'rule' IS DISTINCT FROM 'historical-generation-v2'; DELETE FROM generated_barcode WHERE evidence->>'rule' IS DISTINCT FROM 'historical-generation-v2'");
  const rows=(await tx.query(`SELECT p.id product_id,p.code,s.source_payload a,v.id sku_id,jsonb_object_agg(d.code,sv.code) options FROM ${SOURCE}.product p JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id JOIN ${SOURCE}.variant v ON v.product_id=p.id JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value sv ON sv.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=o.dimension_id GROUP BY p.id,s.source_payload,v.id`)).rows;
  const old=(await tx.query(`SELECT barcode,sku_id FROM generated_barcode UNION ALL SELECT barcode,sku_id FROM ${SOURCE}.tplus_product_barcode`)).rows;
  const occupied=new Map<string,Set<string>>();for(const b of old){if(!occupied.has(b.barcode))occupied.set(b.barcode,new Set());occupied.get(b.barcode)!.add(b.sku_id||'SOURCE_PRODUCT_ONLY');}
  const candidates:any[]=[],issues:any[]=[];
  for(const r of rows){const prefix=r.a.sourceBarcodeSchemeCode,scheme=schemes[prefix];if(!scheme){issues.push({product:r.code,sku:r.sku_id,reason:'UNKNOWN_SCHEME'});continue;}
   const split=splits[r.code];if(split)r.options.COLOR=split.colorCode;
   const matches=[...(split?.baseCode||r.code).matchAll(/(?<![0-9])[0-9]{7}(?![0-9])/g)];const goods=matches.length===1?matches[0][0]:null;
   const values=(prefix==='8'?[r.a.defaultBarcode,r.options.COLOR,r.options.SIZE]:prefix==='2'?[goods,compatibleFit(r.a.source?.['版型']).barcodeCode,r.options.COLOR,r.options.SIZE]:[goods,r.options.COLOR,r.options.SIZE]).map(x=>String(x??''));
   if(values.some((v,i)=>!v||v.length>scheme.lengths[i])){issues.push({product:r.code,sku:r.sku_id,reason:'SEGMENT_LENGTH',values,lengths:scheme.lengths});continue;}
   const barcode=prefix+values.map((v,i)=>v.padStart(scheme.lengths[i],'0')).join('');candidates.push({...r,barcode,scheme,values,split});
   if(!occupied.has(barcode))occupied.set(barcode,new Set());occupied.get(barcode)!.add(r.sku_id);
  }
  let inserted=0;for(const r of candidates){if(occupied.get(r.barcode)!.size>1){issues.push({product:r.code,sku:r.sku_id,reason:'BARCODE_COLLISION',barcode:r.barcode});continue;}
   const evidence={source:'存货条码方案.xlsx/sheet1备注' ,sourceScheme:r.a.sourceBarcodeSchemeCode,sourceProduct:r.code,colorSplit:r.split||null,sourceDefaultBarcode:r.a.defaultBarcode,values:r.values,lengths:r.scheme.lengths,padding:'left-zero',rule:'historical-generation-v2',confirmed2023:confirm2023};
   inserted+=(await tx.query('INSERT INTO generated_barcode(sku_id,product_id,barcode,scheme_id,evidence) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(sku_id) DO NOTHING RETURNING sku_id',[r.sku_id,r.product_id,r.barcode,r.scheme.id,JSON.stringify(evidence)])).rows.length;
  }
  return {inserted,issues,total:rows.length};
 });
}
