import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";import { createHash } from "node:crypto";
import { NATIVE_PAYMENT_SCHEMA17_MIGRATIONS } from "./migration-manifest.ts";
import { openFreshHistoryTypedDatabase } from "./history-typed-database.ts";
import type { IntegrationSettings } from "./safety.ts";
export async function openFreshNativePaymentDatabase(settings:IntegrationSettings){
 const sources=await Promise.all(NATIVE_PAYMENT_SCHEMA17_MIGRATIONS.map(async([,file,pin])=>{const bytes=await readFile(new URL(`../../adapters/postgres/migrations/${file}`,import.meta.url));assert.equal(createHash("sha256").update(bytes).digest("hex"),pin,`Reviewed ${file} changed before Pool`);return bytes.toString("utf8");}));
 const database=await openFreshHistoryTypedDatabase(settings),client=await database.pool.connect().catch(async error=>{await database.close();throw error;});
 try{await client.query(sources[16]!);assert.deepEqual((await client.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(r=>r.version),Array.from({length:17},(_,i)=>i+1));client.release();return database;}
 catch(error){try{await client.query("ROLLBACK");}catch{}client.release(true);await database.close();throw error;}
}
