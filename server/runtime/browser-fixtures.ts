import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {command,RUNTIME} from './runtime.ts';
import {transaction} from './db.ts';
const q=(s:string)=>transaction(RUNTIME,tx=>tx.query(s));
const sale=(await q(`SELECT r.body FROM revision r JOIN document d ON d.id=r.document_id WHERE d.number='SA-2026-09-0146' AND r.revision=1`)).rows[0].body;
const transfer=(await q(`SELECT r.body FROM revision r JOIN document d ON d.id=r.document_id WHERE d.document_type='TRANSFER' AND r.revision=1 LIMIT 1`)).rows[0].body;
const files:any={};
for(const [type,raw] of [['SALE',sale],['TRANSFER',transfer]] as const){const id=randomUUID(),body=structuredClone(raw),number='V2-03C-BROWSER-'+type+'-'+Date.now();body.header={...body.header,source_number:number,business_date:'2026-09-23',adjustment:0,note:'③C浏览器验证新单；验证完成后弃审，不影响最终库存'};body.lines=[{...body.lines[0],source_id:randomUUID(),source_quantity:'10',unit_price:'100',amount:'1000'}];body.fundsRecords=type==='SALE'?body.fundsRecords.map((f:any,i:number)=>({...f,amount:i?'600':'400',direction:'receipt'})):[];await command({documentId:id,documentType:type,operation:'create',expectedVersion:0,requestKey:randomUUID(),body});await command({documentId:id,operation:'approve',expectedVersion:1,requestKey:randomUUID()});files[type]={id,number,sku:body.lines[0].sku_id,warehouse:body.lines[0].warehouse_id,from:body.lines[0].from_warehouse_id,to:body.lines[0].to_warehouse_id};}
await writeFile(new URL('../browser-fixtures.json',import.meta.url),JSON.stringify(files,null,2));console.log(files);
