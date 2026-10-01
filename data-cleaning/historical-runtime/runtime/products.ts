import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
export async function products(input:any){
 const {filters:f={}}=input,page=Number(input.page||1),size=Number(input.size||50);
 if(!Number.isSafeInteger(page)||page<1||![20,50,100,200].includes(size))throw Error('INVALID_PAGE');
 const args:any[]=[],terms:string[]=[];const add=(sql:string,value:any)=>{args.push(value);terms.push(sql.replaceAll('?',`$${args.length}`));};
 if(f.q)add(`(position(lower(?) in lower(p.code||' '||p.name||' '||coalesce(s.source_payload->>'defaultBarcode','')))>0 OR EXISTS(SELECT 1 FROM ${SOURCE}.tplus_product_barcode b WHERE b.product_id=p.id AND b.barcode=?))`,f.q.trim());
 if(f.years?.length)add(`coalesce(s.source_payload->>'year',substring(s.source_payload->'source'->>'所属类别' from '(19[0-9]{2}|20[0-9]{2})')) IN (SELECT jsonb_array_elements_text(?::jsonb))`,JSON.stringify(f.years));
 if(f.categories?.length)add(`c.code IN (SELECT jsonb_array_elements_text(?::jsonb))`,JSON.stringify(f.categories));
 if(f.seasons?.length)add(`EXISTS(SELECT 1 FROM jsonb_array_elements_text(?::jsonb) season WHERE position(season in coalesce(s.source_payload->>'season',s.source_payload->'source'->>'所属类别',''))>0)`,JSON.stringify(f.seasons));
 for(const key of ['supplierId','thickness','shapeCode','schemeId'])if(f[key])add((key==='supplierId'?'p.counterparty_id::text':key==='fitId'?'p.fit_id::text':`s.source_payload->>'${key}'`)+'=?',f[key]);
 if(f.fitId)add(`CASE fit.code WHEN '04' THEN 'Y' WHEN '06' THEN 'Y' WHEN '09' THEN 'Y' WHEN '02' THEN 'B' WHEN '05' THEN 'B' WHEN '10' THEN 'B' WHEN '11' THEN 'B' WHEN '03' THEN 'C' ELSE 'A' END=?`,f.fitId);
 return transaction(RUNTIME,async tx=>(await tx.query(`WITH matches AS (SELECT p.code FROM ${SOURCE}.product p JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id JOIN ${SOURCE}.category c ON c.id=p.category_id LEFT JOIN ${SOURCE}.fit fit ON fit.id=p.fit_id ${terms.length?'WHERE '+terms.join(' AND '):''}),slice AS (SELECT code FROM matches ORDER BY code LIMIT ${size} OFFSET ${(page-1)*size}) SELECT json_build_object('codes',coalesce((SELECT json_agg(code) FROM slice),'[]'::json),'total',(SELECT count(*) FROM matches)) data`,args)).rows[0].data);
}
