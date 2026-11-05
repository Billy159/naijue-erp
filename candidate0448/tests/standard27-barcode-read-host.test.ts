import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createStandard27BarcodeReadHost} from '../adapters/postgres/src/standard27-barcode-read-host.ts';
test('unadmitted host refuses before inspecting pins or connecting',()=>{
 let gets=0,connected=0;const pin=new Proxy({},{get(){gets++;throw Error('must not inspect');},ownKeys(){gets++;throw Error('must not inspect');}});
 const pool={async connect(){connected++;throw Error('must not connect');}};
 assert.throws(()=>createStandard27BarcodeReadHost(pool,pin as never),/BARCODE27_READ_HOST_NOT_READY/);assert.equal(gets,0);assert.equal(connected,0);
});

test('closed host requires category visibility and native transaction acknowledgements before any future admission',async()=>{const src=await readFile(new URL('../adapters/postgres/src/standard27-barcode-read-host.ts',import.meta.url),'utf8');assert.match(src,/'product','product_category','sku'/);assert.match(src,/getTransactionStatus\(\)/);for(const cmd of ['BEGIN','SELECT','COMMIT','ROLLBACK'])assert.ok(src.includes(cmd));assert.match(src,/lease\.checked=false;lease\.busy=true/);assert.match(src,/BARCODE27_HOST_ADMITTED: boolean = false/);});

test('pg 8.23.1 fresh ReadyForQuery can leave activeQuery undefined without any live connection',async()=>{const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),{Client}=require('pg');const c=new Client();c._handleReadyForQuery({status:'I'});assert.equal(c.readyForQuery,true);assert.equal(c.getTransactionStatus(),'I');assert.equal(c._activeQuery,undefined);const src=await readFile(new URL('../adapters/postgres/src/standard27-barcode-read-host.ts',import.meta.url),'utf8');assert.match(src,/raw\._activeQuery!=null/);});

test('identity bootstrap does not execute application publication function before catalog verification',async()=>{const src=await readFile(new URL('../adapters/postgres/src/standard27-barcode-read-host.ts',import.meta.url),'utf8');const id=src.slice(src.indexOf('const ID_SQL='),src.indexOf('const VISIBILITY_SQL='));assert.doesNotMatch(id,/naijue_erp\.standard_business_ready\(\)/);assert.ok(src.indexOf('barcode27-host:published')>src.indexOf('SOURCE49_SUPPLEMENTAL_SQL)).rows'));});
