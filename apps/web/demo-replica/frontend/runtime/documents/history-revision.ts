import type { HistoryRevisionCommand,HistoryRevisionReceipt } from '../../../../../../packages/application/src/history-revision-contracts.ts';
import { parseHistoryRevisionCommand } from '../../../../../../packages/application/src/history-revision-service.ts';
import { createHttpJsonQuery,HttpQueryError,type HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { HistoryTarget } from './history-reader.ts';
export interface HistoryWriteState {readonly phase:'idle'|'submitting'|'uncertain'|'rejected'|'committed'|'disposed';readonly command:HistoryRevisionCommand|null;readonly receipt:HistoryRevisionReceipt|null;readonly notice:string|null}
function immutable<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(immutable);Object.freeze(value);}return value;}
function invalid():never{throw new TypeError('Invalid historical revision receipt.');}
function uuid(value:unknown):asserts value is string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))invalid();}
function receipt(value:unknown,command:HistoryRevisionCommand):HistoryRevisionReceipt{
 const fields=['operationId','dataset','kind','documentId','revisionId','version','ledgerEntryIds'];if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))invalid();const row=value as Record<string,unknown>;
 uuid(row.operationId);uuid(row.revisionId);if(row.dataset!=='HISTORY'||row.kind!==command.kind||row.documentId!==command.documentId||row.version!==command.expectedVersion+1||!Array.isArray(row.ledgerEntryIds))invalid();row.ledgerEntryIds.forEach(uuid);if(new Set(row.ledgerEntryIds).size!==row.ledgerEntryIds.length)invalid();return immutable(value as HistoryRevisionReceipt);
}
/** Existing HISTORY POST/key/CAS only. Unknown outcomes never allocate a second request. */
export class HistoryRevisionOwner {
 readonly #scope:ReadScope;readonly #target:HistoryTarget;readonly #http:HttpQueryOptions;readonly #denied:(error:HttpQueryError)=>void;readonly #listeners=new Set<()=>void>();
 #state:HistoryWriteState=Object.freeze({phase:'idle',command:null,receipt:null,notice:null});#request:AbortController|null=null;#serial=0;#dispatched=false;
 constructor(options:{scope:ReadScope;target:HistoryTarget;http:HttpQueryOptions;denied:(error:HttpQueryError)=>void}){this.#scope=options.scope;this.#target=options.target;this.#http=options.http;this.#denied=options.denied;this.#scope.signal.addEventListener('abort',this.dispose,{once:true});if(!this.#scope.active)this.dispose();}
 readonly getSnapshot=()=>this.#state;
 readonly subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #publish(patch:Partial<HistoryWriteState>){this.#state=Object.freeze({...this.#state,...patch});for(const listener of [...this.#listeners]){try{listener();}catch{/* Preserve operation ownership. */}}}
 get unresolved(){return this.#state.phase==='submitting'||this.#state.phase==='uncertain';}
 submit(input:HistoryRevisionCommand):Promise<boolean>{if(!this.#scope.active||this.unresolved||this.#state.phase==='committed')return Promise.resolve(false);let command:HistoryRevisionCommand;try{command=immutable(parseHistoryRevisionCommand(input));if(command.kind!==this.#target.kind||command.documentId!==this.#target.documentId||command.expectedVersion!==this.#target.effectiveVersion)throw Error();}catch{this.#publish({phase:'rejected',notice:'修订内容未通过校验，未发送请求。'});return Promise.resolve(false);}if(this.#state.command?.requestKey===command.requestKey&&JSON.stringify(this.#state.command)!==JSON.stringify(command)){this.#publish({notice:'原请求标识不能用于不同的修订内容，未发送请求。'});return Promise.resolve(false);}return this.#send(command);}
 replayOriginal():Promise<boolean>{return this.#scope.active&&this.#state.phase==='uncertain'&&this.#state.command?this.#send(this.#state.command):Promise.resolve(false);}
 async #send(command:HistoryRevisionCommand):Promise<boolean>{
  const serial=++this.#serial,request=new AbortController();this.#request=request;this.#dispatched=false;this.#publish({phase:'submitting',command,receipt:null,notice:null});
  try{const http=createHttpJsonQuery({...this.#http,fetch:(url,init)=>{this.#dispatched=true;return this.#http.fetch(url,init);}},4*1024*1024);const result=await http.post('/imported-history/'+command.kind+'/revise',command,AbortSignal.any([request.signal,this.#scope.signal]),value=>receipt(value,command));if(serial!==this.#serial||!this.#scope.active)return false;this.#publish({phase:'committed',receipt:result,notice:'修订已确认，尚需重新读取当前单据。'});return true;}
  catch(error){if(serial!==this.#serial||!this.#scope.active)return false;const rejected=!this.#dispatched||error instanceof HttpQueryError&&error.status!==null&&error.status>=400&&error.status<500&&![408,429].includes(error.status);this.#publish({phase:rejected?'rejected':'uncertain',notice:rejected?'修订请求未被接受，输入与原请求已保留。':'修订结果尚未确认，请保留原请求，使用原请求重试核实；不要另建修订。'});if(error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(error.kind))this.#denied(error);return false;}
  finally{if(this.#request===request)this.#request=null;}
 }
 cancelWaiting(){if(this.#state.phase!=='submitting')return;this.#serial++;this.#request?.abort();this.#request=null;this.#publish({phase:this.#dispatched?'uncertain':'rejected',notice:this.#dispatched?'已停止等待，服务端可能已经提交，原请求已保留。':'请求尚未发出，已停止等待。'});}
 readonly dispose=()=>{if(this.#state.phase==='disposed')return;this.#serial++;this.#request?.abort();this.#request=null;this.#scope.signal.removeEventListener('abort',this.dispose);this.#publish({phase:'disposed',command:null,receipt:null,notice:null});this.#listeners.clear();};
}
