import {transaction,SOURCE} from './db.ts';
import {writeFile} from 'node:fs/promises';
const tables=['tplus_history_document','tplus_history_line','tplus_sales_fund','tplus_source_lineage','tplus_inventory_balance_source','tplus_fund_account','inventory_balance','inventory_posting','inventory_movement'];
const proof:any={at:new Date().toISOString(),tables:{}};
for(const table of tables){proof.tables[table]=await transaction('v2_runtime_stage03c',async tx=>(await tx.query(`SELECT count(*) count,md5(string_agg(hash,'' ORDER BY hash)) hash FROM (SELECT md5(row_to_json(t)::text) hash FROM ${SOURCE}.${table} t)s`)).rows[0]);}
await writeFile(new URL('../source-proof-'+(process.argv[2]||'before')+'.json',import.meta.url),JSON.stringify(proof,null,2));console.log('Source facts fingerprinted',tables.length);
