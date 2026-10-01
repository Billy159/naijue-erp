import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Transaction,SOURCE,literal} from './db.ts';
import {segmentRules} from './barcode-plan.mjs';
import {supplementRevision} from './barcode-supplement-plan.mjs';
export {supplementRevision};
const ddl=readFileSync(new URL('./barcode-scheme-supplement.sql',import.meta.url),'utf8');
export async function installSchemeSupplement(tx:Transaction){await tx.execute(ddl);}

export function approvedSchemeSupplement(authority:any){
 const manifest=JSON.parse(readFileSync(new URL('./barcode-scheme-supplement-20260930.json',import.meta.url),'utf8'));
 if(manifest.revision!==supplementRevision||manifest.authorityRevision!==authority.revision||manifest.authoritySha256!==authority.sourceSha256)throw Error('UNAPPROVED_SCHEME_SUPPLEMENT');
 const scheme=readFileSync(new URL('../../'+manifest.schemePath,import.meta.url));
 if(createHash('sha256').update(scheme).digest('hex')!==manifest.schemeSha256)throw Error('SUPPLEMENT_SCHEME_FILE_CHANGED');
 const records=manifest.records,active=records.filter((r:any)=>r.status==='ACTIVE');
 const scope=records.map((r:any)=>r.skuId).sort();
 const notRequired=records.filter((r:any)=>r.status==='NOT_REQUIRED');
 if(records.length!==4288||active.length!==4278||manifest.exceptionCount!==0||manifest.noBarcodeRequiredCount!==10||notRequired.length!==10||active.length+notRequired.length!==records.length||manifest.historyFinalized!==true||manifest.finalDecisionRevision!=='history-barcode-final-20260930-v1'||notRequired.some((r:any)=>r.barcode!==null||r.decisionRevision!==manifest.finalDecisionRevision)||new Set(scope).size!==4288||new Set(active.map((r:any)=>r.barcode)).size!==active.length||createHash('sha256').update(JSON.stringify(scope)).digest('hex')!==manifest.scopeSha256)throw Error('SUPPLEMENT_SCOPE_INVALID');
 const excelActive=new Set(authority.records.filter((r:any)=>r.status==='ACTIVE').map((r:any)=>r.skuId));
 if(scope.some((id:string)=>excelActive.has(id)))throw Error('SUPPLEMENT_WOULD_CHANGE_APPROVED_EXCEL');
 for(const r of active){
  const rule=segmentRules[r.scheme];
  if(!rule||typeof r.defaultBarcode!=='string'||!/^[ -~]+$/.test(r.defaultBarcode))throw Error('SUPPLEMENT_ITEM_INVALID');
  const color=r.sourceColorCode.replace(/^0+(?=\d)/,''),size=r.sourceSizeCode.replace(/^0+(?=\d)/,'');
  if(!/^\d+$/.test(color)||!/^\d+$/.test(size)||color.length>rule.colorWidth||size.length>rule.sizeWidth||r.barcode!==r.scheme+r.defaultBarcode+color.padStart(rule.colorWidth,'0')+size.padStart(rule.sizeWidth,'0'))throw Error('SUPPLEMENT_FORMULA_MISMATCH');
 }
 return manifest;
}

/** Add the separately authorized missing-SKU scope to the same rebuild transaction. */
export async function stageSchemeSupplement(tx:Transaction,manifest:any){
 await tx.execute('CREATE TEMP TABLE scheme_supplement_stage(sku_id uuid PRIMARY KEY,product_id uuid,status text,barcode text,record jsonb) ON COMMIT DROP');
 await tx.execute(`INSERT INTO pg_temp.scheme_supplement_stage SELECT (r->>'skuId')::uuid,(r->>'productId')::uuid,r->>'status',r->>'barcode',r FROM jsonb_array_elements(${literal(JSON.stringify(manifest.records))}::jsonb) r`);
 const invalid=(await tx.query(`SELECT s.sku_id FROM pg_temp.scheme_supplement_stage s
  LEFT JOIN ${SOURCE}.variant v ON v.id=s.sku_id LEFT JOIN ${SOURCE}.product p ON p.id=v.product_id LEFT JOIN ${SOURCE}.tplus_product_source a ON a.product_id=p.id
  LEFT JOIN ${SOURCE}.variant_option co ON co.variant_id=v.id AND co.dimension_id=(SELECT id FROM ${SOURCE}.spec_dimension WHERE code='COLOR') LEFT JOIN ${SOURCE}.spec_value c ON c.id=co.spec_value_id
  LEFT JOIN ${SOURCE}.variant_option zo ON zo.variant_id=v.id AND zo.dimension_id=(SELECT id FROM ${SOURCE}.spec_dimension WHERE code='SIZE') LEFT JOIN ${SOURCE}.spec_value z ON z.id=zo.spec_value_id
  WHERE v.id IS NULL OR v.product_id<>s.product_id OR p.code<>s.record->>'code'
  OR a.source_payload->>'defaultBarcode' IS DISTINCT FROM s.record->>'defaultBarcode'
  OR a.source_payload->>'sourceBarcodeSchemeCode' IS DISTINCT FROM s.record->>'scheme'
  OR c.code IS DISTINCT FROM s.record->>'sourceColorCode' OR c.name IS DISTINCT FROM s.record->>'colorName'
  OR z.code IS DISTINCT FROM s.record->>'sourceSizeCode' OR z.name IS DISTINCT FROM s.record->>'sizeName' LIMIT 1`)).rows;
 if(invalid.length)throw Error('SUPPLEMENT_SOURCE_IDENTITY_CHANGED');
 if((await tx.query("SELECT s.sku_id FROM pg_temp.scheme_supplement_stage s JOIN pg_temp.excel_record_stage e USING(sku_id) WHERE e.status='ACTIVE' LIMIT 1")).rowCount)throw Error('SUPPLEMENT_OVERRIDES_EXCEL_SKU');
 const missingOutsideScope=(await tx.query(`SELECT v.id FROM ${SOURCE}.variant v WHERE NOT EXISTS(SELECT 1 FROM pg_temp.excel_record_stage e WHERE e.sku_id=v.id AND e.status='ACTIVE') AND NOT EXISTS(SELECT 1 FROM pg_temp.scheme_supplement_stage s WHERE s.sku_id=v.id) LIMIT 1`)).rows;
 if(missingOutsideScope.length)throw Error('SUPPLEMENT_MISSING_SCOPE_CHANGED');
 await tx.execute(`INSERT INTO pg_temp.excel_barcode_stage SELECT sku_id,product_id,barcode,record->>'schemeId',jsonb_build_object(
  'rule',${literal(supplementRevision)},'source','存货条码方案.xlsx/条码段信息','generated',true,
  'sourceItemField','defaultBarcode','sourceDefaultBarcode',record->>'defaultBarcode','goods',record->>'defaultBarcode','itemWidthIgnored',true,
  'sourceScheme',record->>'scheme','sourceProduct',record->>'code','sourceColor',record->>'sourceColorCode','sourceSize',record->>'sourceSizeCode',
  'colorCode',record->>'colorSegment','sizeCode',record->>'sizeSegment','colorWidth',record->'colorWidth','sizeWidth',record->'sizeWidth',
  'scopeCount',4288,'schemeSha256',${literal(manifest.schemeSha256)}) FROM pg_temp.scheme_supplement_stage WHERE status='ACTIVE'`);
}

export async function persistSchemeSupplement(tx:Transaction,manifest:any){
 await tx.execute(`INSERT INTO barcode_scheme_supplement(sku_id,product_id,revision,status,barcode,record)
  SELECT sku_id,product_id,${literal(supplementRevision)},status,barcode,record FROM pg_temp.scheme_supplement_stage
  ON CONFLICT(sku_id) DO UPDATE SET product_id=excluded.product_id,revision=excluded.revision,status=excluded.status,barcode=excluded.barcode,record=excluded.record,updated_at=now()
  WHERE (barcode_scheme_supplement.product_id,barcode_scheme_supplement.revision,barcode_scheme_supplement.status,barcode_scheme_supplement.barcode,barcode_scheme_supplement.record) IS DISTINCT FROM (excluded.product_id,excluded.revision,excluded.status,excluded.barcode,excluded.record)`);
}
