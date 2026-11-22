import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { BoundedReadPool, runBoundedReads } from '../../../../src/loading/bounded-read-pool.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';

type CategoryCandidate = { readonly id:string;readonly label:string;readonly parentId?:string|null;readonly parentLabel?:string;readonly depth?:0|1;readonly disabled?:boolean };
type ParentProbe = {readonly id:string;readonly label:string};
type Lookup<T> = (parent:ParentProbe,page:number,signal:AbortSignal)=>Promise<{readonly items:readonly T[];readonly page:number;readonly exactTotal:number}>;
const noParents:readonly never[]=[];
export function missingCategoryParents(items:readonly CategoryCandidate[]):readonly ParentProbe[]{
 const known=new Set(items.map(item=>item.id)), parents=new Map<string,string>();
 for(const row of items)if(row.parentId&&!known.has(row.parentId)&&row.parentLabel?.trim())parents.set(row.parentId,row.parentLabel);
 // An unusually large tree still works via ordinary user-driven paging.
 return [...parents].slice(0,20).map(([id,label])=>({id,label}));
}
export async function readVerifiedCategoryParent<T extends CategoryCandidate>(probe:ParentProbe,read:Lookup<T>,signal:AbortSignal):Promise<T|undefined>{
 const visited=new Set<string>();let total:number|undefined;
 for(let page=1;page<=3;page++){
  signal.throwIfAborted();const result=await read(probe,page,signal);signal.throwIfAborted();
  if(result.page!==page||!Number.isSafeInteger(result.exactTotal)||result.exactTotal<0||total!==undefined&&result.exactTotal!==total
    ||result.items.length!==Math.min(20,Math.max(0,result.exactTotal-(page-1)*20)))return;
  total=result.exactTotal;
  for(const row of result.items){if(visited.has(row.id))return;visited.add(row.id);}
  const actual=result.items.find(row=>row.id===probe.id);
  if(actual)return actual.parentId===null&&(actual.depth===undefined||actual.depth===0)&&!actual.disabled?actual:undefined;
  if(page*20>=total)return;
 }
}
/** Provisional ancestors are layout facts only until independently returned as actual
 * enabled candidates by the same authenticated reader. Never widen base matches. */
export function useVerifiedCategoryParents<T extends CategoryCandidate>(options:{readonly scope:ReadScope;readonly items:readonly T[];readonly active:boolean;readonly intent:string;readonly lookup:Lookup<T>;readonly denied:(error:HttpQueryError)=>void}):readonly T[]{
 const {scope,active,intent,items}=options;
 const [pool]=useState(()=>new BoundedReadPool()), latest=useRef(options);latest.current=options;
 const probes=active?missingCategoryParents(items):noParents, key=JSON.stringify(probes);
 const [verified,setVerified]=useState<{scope:ReadScope;intent:string;key:string;rows:readonly T[]}|null>(null);
 useLayoutEffect(()=>{if(!active)setVerified(null);},[active]);
 useEffect(()=>{
  if(!active||key==='[]'||!scope.active)return;
  const own=new AbortController(),signal=AbortSignal.any([own.signal,scope.signal]);
  const requested=JSON.parse(key) as readonly ParentProbe[],lookup=latest.current.lookup;
  void runBoundedReads(requested,signal,(probe,_index,operationSignal)=>
   readVerifiedCategoryParent(probe,(target,page)=>pool.read(operationSignal,()=>lookup(target,page,operationSignal)),operationSignal)
   .catch(error=>{if(error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))throw error;return undefined;})
  ).then(rows=>{
   if(!signal.aborted&&scope.active) setVerified({scope,intent,key,rows:rows.filter((row):row is T=>row!==undefined)});
  }).catch(error=>{
   if(signal.aborted||!scope.active||!(error instanceof HttpQueryError))return;
   if(error.kind==='unauthenticated'||error.kind==='forbidden'){latest.current.denied(error);scope.dispose();}
  });
  return()=>own.abort();
 },[active,intent,key,pool,scope]);
 return active&&verified?.scope===scope&&verified.intent===intent&&verified.key===key?verified.rows:noParents;
}

type Node={key:string;value:string;title:string;disabled?:boolean;children?:Node[]};
export function categoryFilterRoots(items:readonly CategoryCandidate[],verifiedParents:readonly CategoryCandidate[],category:boolean):readonly Node[]{
 const nodes=items.map(item=>({key:item.id,value:item.id,title:item.label,...(item.disabled?{disabled:true}:{})} satisfies Node));
 if(!category)return nodes;
 const roots:Node[]=[],byId=new Map<string,Node>(nodes.map(n=>[n.key,n])),verified=new Map(verifiedParents.map(row=>[row.id,row]));
 for(const item of items){
  const node=byId.get(item.id)!;
  if(!item.parentId){roots.push(node);continue;}
  let parent=byId.get(item.parentId);
  if(!parent){
   const actual=verified.get(item.parentId);
   parent={key:item.parentId,value:item.parentId,title:actual?.label??item.parentLabel??'',...(!actual?{disabled:true}:{}),children:[]};
   byId.set(parent.key,parent);roots.push(parent);
  }
  (parent.children??=[]).push(node);
 }
 return roots;
}
