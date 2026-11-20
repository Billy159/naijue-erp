import type { CurrentFormPage, CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
/** Operation data is never cached. Uncooperative cancelled reads retain their permit until settled. */
export class BoundedReadPool {
 #active=0;readonly #waiters=new Set<()=>void>();
 readonly limit:number;constructor(limit=4){this.limit=limit;}
 async read<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T>{
  signal.throwIfAborted();
  while(this.#active>=this.limit){await new Promise<void>((resolve,reject)=>{const wake=()=>{cleanup();resolve();},abort=()=>{cleanup();reject(signal.reason);},cleanup=()=>{this.#waiters.delete(wake);signal.removeEventListener('abort',abort);};this.#waiters.add(wake);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});signal.throwIfAborted();}
  signal.throwIfAborted();this.#active++;
  return new Promise<T>((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(value=>{if(!signal.aborted)resolve(value);},reject).finally(()=>{signal.removeEventListener('abort',abort);this.#active--;for(const wake of [...this.#waiters])wake();});});
 }
}
export async function runBoundedReads<T,R>(items:readonly T[],signal:AbortSignal,work:(item:T,index:number,signal:AbortSignal)=>Promise<R>):Promise<R[]>{
 const results:R[]=new Array(items.length);let next=0;const own=new AbortController(),combined=AbortSignal.any([signal,own.signal]);
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{try{for(;;){combined.throwIfAborted();const index=next++;if(index>=items.length)return;results[index]=await work(items[index]!,index,combined);combined.throwIfAborted();}}catch(error){own.abort(error);throw error;}}));return results;
}
/** Full operation-local SKU set; pages are checked even for direct synthetic readers. */
export async function readCompleteSkuPages(pool:BoundedReadPool,signal:AbortSignal,read:(page:number,signal:AbortSignal)=>Promise<CurrentFormPage<CurrentFormSku>>,firstPage:number,productId:string,sizeGroupId:string):Promise<{first:CurrentFormPage<CurrentFormSku>;items:readonly CurrentFormSku[]}>{
 const first=await pool.read(signal,()=>read(firstPage,signal));
 if(typeof first.exactTotal!=='bigint'||first.exactTotal<0n||first.exactTotal>5000n)throw new Error('SKU_READ_BUDGET_EXCEEDED');
 const pages=Math.max(1,Number((first.exactTotal+19n)/20n));if(pages>250||firstPage>pages)throw new Error('SKU_READ_BUDGET_EXCEEDED');
 const check=(data:CurrentFormPage<CurrentFormSku>,page:number)=>{if(data.page!==page||data.pageSize!==20||data.exactTotal!==first.exactTotal||data.items.length!==Math.min(20,Math.max(0,Number(first.exactTotal)-(page-1)*20)))throw new Error('SKU_PAGE_INCOMPLETE');return data;};check(first,firstPage);
 const indices=Array.from({length:pages},(_,i)=>i+1).filter(page=>page!==firstPage);
 const rest=await runBoundedReads(indices,signal,async(page,_index,operationSignal)=>check(await pool.read(operationSignal,()=>read(page,operationSignal)),page));signal.throwIfAborted();
 const all=[first,...rest].sort((a,b)=>a.page-b.page).flatMap(data=>data.items),ids=new Set<string>(),coordinates=new Set<string>();
 for(const sku of all){const key=JSON.stringify([sku.colorId,sku.fitId,sku.sizeId]);if(sku.productId!==productId||sku.sizeGroupId!==sizeGroupId||ids.has(sku.id)||coordinates.has(key))throw new Error('SKU_SET_INCONSISTENT');ids.add(sku.id);coordinates.add(key);}
 if(BigInt(all.length)!==first.exactTotal)throw new Error('SKU_SET_INCOMPLETE');return {first,items:all};
}
