import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
export interface OrdinaryTotalsSnapshot<F,D> {
 readonly phase:'unknown'|'loading'|'ready'|'changed'|'error'|'disposed';
 readonly data:D|null;readonly error:unknown|null;readonly filter:F|null;readonly readRevision:string|null;
}
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).sort().join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
/** One bounded, scope-bound cache. No persistent storage and no page/draft key. */
export class OrdinaryListTotals<F,D extends {readonly readRevision:string}> {
 readonly #scope:ReadScope;readonly #execute:(read:QueryRead<{filter:F;expectedRevision:string}>)=>Promise<D>;
 readonly #listeners=new Set<()=>void>();
 #snapshot:OrdinaryTotalsSnapshot<F,D>=Object.freeze({phase:'unknown',data:null,error:null,filter:null,readRevision:null});
 #generation=0;#key:string|null=null;#controller:AbortController|null=null;#pending:Promise<void>|null=null;
 readonly #abort=()=>this.dispose();
 constructor(options:{scope:ReadScope;execute:(read:QueryRead<{filter:F;expectedRevision:string}>)=>Promise<D>}){this.#scope=options.scope;this.#execute=options.execute;options.scope.signal.addEventListener('abort',this.#abort,{once:true});if(!options.scope.active)this.dispose();}
 getSnapshot=():OrdinaryTotalsSnapshot<F,D>=>this.#snapshot;
 subscribe=(listener:()=>void):(()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #publish(value:OrdinaryTotalsSnapshot<F,D>){this.#snapshot=Object.freeze(value);for(const listener of this.#listeners){try{listener();}catch{/* A view cannot interfere with lifecycle cleanup. */}}}
 load(filter:F,readRevision:string):Promise<void>{
  if(!this.#scope.active||this.#snapshot.phase==='disposed')return Promise.resolve();
  if(!/^[a-f0-9]{64}$/.test(readRevision))return Promise.reject(new TypeError('Invalid ordinary read revision.'));
  const key=canonical([this.#scope.identity,filter,readRevision]);
  if(key===this.#key){if(this.#snapshot.phase==='ready')return Promise.resolve();if(this.#snapshot.phase==='loading'&&this.#pending)return this.#pending;}
  this.#controller?.abort();const controller=new AbortController();this.#controller=controller;const generation=++this.#generation;
  const snapshot=structuredClone(filter);this.#key=key;
  this.#publish({phase:'loading',data:null,error:null,filter:snapshot,readRevision});
  const active=()=>generation===this.#generation&&this.#scope.active&&!controller.signal.aborted;
  this.#pending=(async()=>{try{
   if(!active())return;
   const data=await this.#execute({parameters:{filter:snapshot,expectedRevision:readRevision},signal:controller.signal,identity:this.#scope.identity,routeInstanceId:this.#scope.routeInstanceId,entityId:this.#scope.entityId});
   if(!active())return;
   if(data.readRevision!==readRevision)throw new HttpQueryError('conflict','DOCUMENT_READ_CHANGED',409);
   this.#publish({phase:'ready',data,error:null,filter:snapshot,readRevision});
  }catch(error){if(!active())return;this.#publish({phase:error instanceof HttpQueryError&&error.status===409?'changed':'error',data:null,error,filter:snapshot,readRevision});}
  })();return this.#pending;
 }
 /** Call at the committed receipt boundary, before any fallible detail refresh. */
 invalidate():void {if(this.#snapshot.phase==='disposed')return;++this.#generation;this.#controller?.abort();this.#controller=null;this.#key=null;this.#pending=null;this.#publish({phase:'unknown',data:null,error:null,filter:null,readRevision:null});}
 dispose():void {if(this.#snapshot.phase==='disposed')return;this.invalidate();this.#scope.signal.removeEventListener('abort',this.#abort);this.#publish({phase:'disposed',data:null,error:null,filter:null,readRevision:null});this.#listeners.clear();}
}
