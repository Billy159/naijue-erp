import {readFileSync} from 'node:fs';
import {transaction,SOURCE,literal} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {planHistoricalBarcodes,segmentRules} from './barcode-plan.mjs';
import {validateC8Freeze} from './c8-freeze.mjs';
import {validateC9Freeze} from './c9-freeze.mjs';
import {installExcelBarcodeAuthority,excelBarcodePolicy} from './excel-barcode-authority.ts';

export const schemes=segmentRules;
const declaredItemWidths:{[key:string]:number}={'0':10,'8':5,'6':7,'2':8,'9':7};
const c8Review=JSON.parse(readFileSync(new URL('./c8-barcode-targets.json',import.meta.url),'utf8'));
const c8Freeze=JSON.parse(readFileSync(new URL('./c8-barcode-freeze.json',import.meta.url),'utf8'));
const c8SkuIds=new Set<string>(c8Review.records.map((r:{skuId:string})=>r.skuId));
if(c8Review.count!==163||c8SkuIds.size!==163)throw Error('C8_SCOPE_INVALID');

export async function installBarcodes(){
 return transaction(RUNTIME,async tx=>{
  await tx.execute(`CREATE TABLE IF NOT EXISTS generated_barcode(sku_id uuid PRIMARY KEY,product_id uuid NOT NULL,barcode text UNIQUE NOT NULL,scheme_id text NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
  await installExcelBarcodeAuthority(tx);
 });
}

/** Apply the reviewed C8 barcode rules only to its 163 source SKUs. */
export async function generateHistoricalBarcodes(confirm2023=true){
 return generateReviewedBarcodes(c8Review,c8Freeze,validateC8Freeze,confirm2023);
}

/** Apply C9 only when explicitly invoked; the frozen C8 entry stays separate. */
export async function generateC9HistoricalBarcodes(){
 const review=JSON.parse(readFileSync(new URL('./c9-barcode-targets.json',import.meta.url),'utf8'));
 const freeze=JSON.parse(readFileSync(new URL('./c9-barcode-freeze.json',import.meta.url),'utf8'));
 return generateReviewedBarcodes(review,freeze,validateC9Freeze,true);
}

async function generateReviewedBarcodes(review:any,freeze:any,validateFreeze:any,confirm2023:boolean){
 const expected=review.review==='C8'?163:review.review==='C9'?531:0;
 const skuIds=new Set<string>(review.records.map((r:{skuId:string})=>r.skuId));
 if(!expected||review.count!==expected||skuIds.size!==expected)throw Error('BARCODE_REVIEW_SCOPE_INVALID');
 const generationRule=review.review==='C9'?'historical-generation-v3-c9':'historical-generation-v3';
 return transaction(RUNTIME,async tx=>{
  await tx.execute('LOCK TABLE generated_barcode,product_barcode_alias IN EXCLUSIVE MODE');
  if(await excelBarcodePolicy(tx))throw Error('条码已按基本数据对照表.xls冻结；旧 C8/C9 生成规则已停用');
  await tx.execute('CREATE TABLE IF NOT EXISTS generated_barcode_retired (LIKE generated_barcode INCLUDING DEFAULTS)');
  const targetIds=literal(JSON.stringify([...skuIds]));
  const rows=(await tx.query(`SELECT p.id product_id,p.code,s.source_payload a,v.id sku_id,jsonb_object_agg(d.code,sv.code) options
   FROM ${SOURCE}.product p JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id
   JOIN ${SOURCE}.variant v ON v.product_id=p.id AND v.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${targetIds}::jsonb))
   JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id
   JOIN ${SOURCE}.spec_value sv ON sv.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=o.dimension_id
   GROUP BY p.id,s.source_payload,v.id`)).rows;
  const existing=(await tx.query(`SELECT barcode,sku_id,product_id,'generated' origin,evidence->>'rule' rule FROM generated_barcode
   UNION ALL SELECT barcode,sku_id,product_id,'alias' origin,NULL rule FROM product_barcode_alias
   UNION ALL SELECT barcode,sku_id,product_id,'source' origin,NULL rule FROM ${SOURCE}.tplus_product_barcode`)).rows;
  const sourceSkuIds=new Set(rows.map((r:{sku_id:string})=>r.sku_id));
  if([...skuIds].some(id=>!sourceSkuIds.has(id)))throw Error(review.review+'_SOURCE_SKU_MISSING');
  const plan=planHistoricalBarcodes(rows,existing);
  const frozen=validateFreeze(review,freeze,rows,plan,existing);
  const scoped=plan.accepted.filter((r:any)=>skuIds.has(r.sku_id));
  const issues=frozen.unresolved;
  if(scoped.length+frozen.approvedExceptions.length!==expected)throw Error(review.review+'_PLAN_INCOMPLETE');
  const remaps=new Map(plan.colorRemaps.map((x:any)=>[x.product+'\0'+x.sourceColor,x]));
  const records=scoped.map((r:any)=>({
   sku_id:r.sku_id,product_id:r.product_id,barcode:r.barcode,scheme_id:segmentRules[r.scheme].id,
   evidence:{source:'存货条码方案.xlsx/条码段信息',rule:generationRule,sourceScheme:r.scheme,sourceProduct:r.code,
    ...(review.review==='C9'?{sourceReview:'C9',itemFieldDecision:'C9-user-default-barcode-20260930'}:{}),
    sourceItemField:r.sourceItemField,sourceDefaultBarcode:r.defaultBarcode,declaredItemWidth:declaredItemWidths[r.scheme],
    itemWidthIgnored:true,goods:r.goods,
    ...(r.scheme==='9'?{itemFieldDecision:'C8-user-default-barcode-20260930'}:{}),
    sourceColor:r.sourceColor,colorCode:r.color,
    sourceSize:r.sourceSize,sizeCode:r.size,colorWidth:r.colorWidth,sizeWidth:r.sizeWidth,
    colorRemap:remaps.get(r.code+'\0'+r.sourceColor)||null,confirmed2023:confirm2023}
  }));
  await tx.execute('CREATE TEMP TABLE barcode_plan_stage(sku_id uuid PRIMARY KEY,product_id uuid NOT NULL,barcode text NOT NULL,scheme_id text NOT NULL,evidence jsonb NOT NULL) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.barcode_plan_stage(sku_id,product_id,barcode,scheme_id,evidence)
   SELECT sku_id::uuid,product_id::uuid,barcode,scheme_id,evidence
   FROM jsonb_to_recordset(${literal(JSON.stringify(records))}::jsonb) AS x(sku_id text,product_id text,barcode text,scheme_id text,evidence jsonb)`);
  const staged=(await tx.query('SELECT count(*)::int n FROM pg_temp.barcode_plan_stage')).rows[0].n;
  if(staged!==scoped.length)throw Error('BARCODE_STAGE_COUNT_MISMATCH');
  const archived=(await tx.query(`SELECT count(*)::int n FROM generated_barcode g JOIN pg_temp.barcode_plan_stage p ON p.sku_id=g.sku_id
   WHERE g.barcode<>p.barcode AND g.evidence->>'rule' IN ('historical-generation-v2','historical-generation-v3','historical-generation-v3-c9')`)).rows[0].n;
  await tx.execute(`INSERT INTO generated_barcode_retired
   SELECT g.* FROM generated_barcode g JOIN pg_temp.barcode_plan_stage p ON p.sku_id=g.sku_id
   WHERE g.barcode<>p.barcode AND g.evidence->>'rule' IN ('historical-generation-v2','historical-generation-v3','historical-generation-v3-c9')`);
  const updated=(await tx.query(`SELECT count(*)::int n FROM generated_barcode g JOIN pg_temp.barcode_plan_stage p ON p.sku_id=g.sku_id
   WHERE g.evidence->>'rule' IN ('historical-generation-v2','historical-generation-v3','historical-generation-v3-c9')
   AND (g.barcode IS DISTINCT FROM p.barcode OR g.scheme_id IS DISTINCT FROM p.scheme_id OR g.evidence IS DISTINCT FROM p.evidence)`)).rows[0].n;
  await tx.execute(`UPDATE generated_barcode g
   SET barcode=p.barcode,scheme_id=p.scheme_id,evidence=p.evidence FROM pg_temp.barcode_plan_stage p
   WHERE g.sku_id=p.sku_id AND g.evidence->>'rule' IN ('historical-generation-v2','historical-generation-v3','historical-generation-v3-c9')
   AND (g.barcode IS DISTINCT FROM p.barcode OR g.scheme_id IS DISTINCT FROM p.scheme_id OR g.evidence IS DISTINCT FROM p.evidence)`);
  const inserted=(await tx.query(`SELECT count(*)::int n FROM pg_temp.barcode_plan_stage p LEFT JOIN generated_barcode g ON g.sku_id=p.sku_id WHERE g.sku_id IS NULL`)).rows[0].n;
  await tx.execute(`INSERT INTO generated_barcode(sku_id,product_id,barcode,scheme_id,evidence)
   SELECT p.sku_id,p.product_id,p.barcode,p.scheme_id,p.evidence FROM pg_temp.barcode_plan_stage p
   LEFT JOIN generated_barcode g ON g.sku_id=p.sku_id WHERE g.sku_id IS NULL`);
  const verification=(await tx.query(`SELECT count(*)::int planned,
   count(*) FILTER(WHERE g.barcode=p.barcode AND g.evidence=p.evidence)::int matched
   FROM pg_temp.barcode_plan_stage p LEFT JOIN generated_barcode g ON g.sku_id=p.sku_id`)).rows[0];
  if(verification.planned!==verification.matched)throw Error('BARCODE_READBACK_MISMATCH');
  return {total:skuIds.size,accepted:scoped.length,approvedExceptions:frozen.approvedExceptions,frozen:true,inserted,updated,archived,aliasInserted:0,aliases:0,colorRemaps:plan.colorRemaps.filter((x:any)=>rows.some((r:{code:string,sku_id:string})=>r.code===x.product&&skuIds.has(r.sku_id))),issues};
 });
}
