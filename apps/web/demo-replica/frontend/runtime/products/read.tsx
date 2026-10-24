import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import { LatestQuery,type QueryRead } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
/** One existing LatestQuery per visited source tab; no cache outside this route. */
export function useProductRead<P,D>(scope:ReadScope,execute:((read:QueryRead<P>)=>Promise<D>)|undefined,parameters:P,active:boolean,denied:(e:HttpQueryError)=>void){
 const [query]=useState(()=>new LatestQuery<P,D>({scope,execute:read=>{if(!execute)throw new HttpQueryError('not-implemented','PRODUCT_TAB_NOT_CONFIGURED');return execute(read);}}));const snapshot=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),mounted=useRef(false),latest=useRef(parameters);latest.current=parameters;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;query.cancel();queueMicrotask(()=>{if(!mounted.current)query.dispose();});};},[query]);
 useEffect(()=>{let current=true;if(active&&!query.getSnapshot().success&&query.getSnapshot().phase==='idle')queueMicrotask(()=>{if(current&&mounted.current)void query.run(latest.current);});return()=>{current=false;if(query.getSnapshot().phase==='loading')query.cancel();};},[active,query]);
 useEffect(()=>{if(snapshot.phase==='error'&&snapshot.error instanceof HttpQueryError&&(snapshot.error.kind==='unauthenticated'||snapshot.error.kind==='forbidden')){denied(snapshot.error);scope.dispose();}},[snapshot]);
 return {query,snapshot};
}
export function ReadNotice(p:{phase:string;retry:()=>void;cancel:()=>void}){return p.phase==='loading'?<p role="status">正在读取资料… <button className="btn ghost" onClick={p.cancel}>取消</button></p>:p.phase==='error'||p.phase==='idle'?<p className="inline-error" role="alert">{p.phase==='idle'?'读取已取消。':'资料读取失败。'} <button className="btn ghost" onClick={p.retry}>重试</button></p>:null;}
