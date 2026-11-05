import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedReadPool,runBoundedReads,readCompleteSkuPages } from '../../../../src/loading/bounded-read-pool.ts';
import { InventoryOutputBudget,InventoryOutputTooLargeError,inventoryOutputLimits } from '../../../../src/inventory/output-budget.ts';
import { createOriginalWorkbook } from './original-workbook.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cancelled uncooperative reads retain four shared permits; replacement cannot dispatch until settle',async()=>{
 const pool=new BoundedReadPool(),old=new AbortController(),next=new AbortController(),pending=[];let active=0,peak=0;
 const work=signal=>pool.read(signal,()=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;resolve(1);}));});
 const reads=runBoundedReads([1,2,3,4,5],old.signal,(_x,_i,signal)=>work(signal));await tick();assert.equal(pending.length,4);const rejected=assert.rejects(reads);old.abort();await rejected;
 const newer=work(next.signal);await tick();assert.equal(pending.length,4);pending.shift()();await tick();assert.equal(pending.length,4);pending.shift()();pending.shift()();pending.shift()();pending.shift()();await newer;assert.equal(peak,4);
});
test('SKU pages are complete ordered and limited; repeated IDs/coordinates, total drift and oversize reject',async()=>{
 const sku=n=>({id:String(n),productId:'p',sizeGroupId:'g',colorId:'c',fitId:'f',sizeId:String(n)});
 for(const total of [20,21,200,1000,5000]){let active=0,peak=0;const seen=[];const result=await readCompleteSkuPages(new BoundedReadPool(),new AbortController().signal,async page=>{seen.push(page);active++;peak=Math.max(peak,active);await tick();active--;return {page,pageSize:20,exactTotal:BigInt(total),items:Array.from({length:Math.min(20,total-(page-1)*20)},(_,i)=>sku((page-1)*20+i))};},1,'p','g');assert.equal(result.items.length,total);assert.equal(new Set(seen).size,Math.ceil(total/20));assert.ok(peak<=4);}
 for(const mode of ['oversize','duplicate','drift','group','missing'])await assert.rejects(readCompleteSkuPages(new BoundedReadPool(),new AbortController().signal,async page=>({page,pageSize:20,exactTotal:mode==='oversize'?5001n:mode==='drift'&&page===2?22n:21n,items:Array.from({length:page===1?20:mode==='missing'?0:1},(_,i)=>({...sku(mode==='duplicate'?0:(page-1)*20+i),...(mode==='group'?{sizeGroupId:'wrong'}:{})}))}),1,'p','g'));
});
test('row/cell/XML/ZIP bounds accept exact size then reject plus one; workbook overlimit emits no bytes',async()=>{
 const rows=new InventoryOutputBudget();for(let i=0;i<10000;i++)rows.reserveRow(['x']);assert.throws(()=>rows.reserveRow(['x']),InventoryOutputTooLargeError);
 const cells=new InventoryOutputBudget();cells.reserveRow(Array(250000).fill(''));assert.throws(()=>cells.reserveRow(['']),InventoryOutputTooLargeError);
 const xml=new InventoryOutputBudget();xml.reserveXml('x'.repeat(inventoryOutputLimits.xmlBytes));assert.throws(()=>xml.reserveXml('x'),InventoryOutputTooLargeError);
 const zip=new InventoryOutputBudget();zip.reserveZip(inventoryOutputLimits.zipBytes);assert.throws(()=>zip.reserveZip(1),InventoryOutputTooLargeError);
 await assert.rejects(createOriginalWorkbook((async function*(){for(let i=0;i<10001;i++)yield ['x'];})(),'bound'),InventoryOutputTooLargeError);
 await assert.rejects(createOriginalWorkbook([['&'.repeat(4000000)]],'escaped'),InventoryOutputTooLargeError);
 const controller=new AbortController();await assert.rejects(createOriginalWorkbook((async function*(){yield ['0001','-9007199254740993'];controller.abort();yield ['late'];})(),'cancel',controller.signal));
});
test('incompressible ZIP over 8MiB fails before a final download buffer is returned',async()=>{
 const {randomBytes}=await import('node:crypto');const text=randomBytes(9*1024*1024).toString('base64');await assert.rejects(createOriginalWorkbook([[text]],'low-compression'),InventoryOutputTooLargeError);
});
