import {createPortal} from 'react-dom';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {CategoryTags} from './category-tags.tsx';
import {documentRowKey,type NormalTransferRow} from './normal-list-reader.ts';
import type {ReplicaTransferSession} from './transfers-session.ts';
import {HttpQueryError} from '../../../../src/transport/http-query.ts';
/** One popover/one read owner for the visible list, never one detail request per row. */
export function useTransferCategoryPopover(session:ReplicaTransferSession,listRevision:unknown,denied:(error:HttpQueryError)=>void){
 const query=session.categoryDetails,state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const [target,setTarget]=useState<{row:NormalTransferRow;anchor:HTMLButtonElement}|null>(null),[position,setPosition]=useState({left:8,top:8});
 const pop=useRef<HTMLDivElement>(null),cache=useRef<{key:string;data:NonNullable<typeof state.success>['data']}|null>(null);
 const key=(row:NormalTransferRow)=>documentRowKey(row)+JSON.stringify(row.categorySummary);
 const close=()=>{setTarget(null);query.cancel();};
 useEffect(()=>{close();cache.current=null;},[listRevision]);
 useEffect(()=>()=>query.cancel(),[query]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))denied(state.error);},[state.error]);
 const valid=target&&state.phase==='success'&&state.success?.parameters.transferId===target.row.documentId&&state.success.data.effectiveVersion===target.row.effectiveVersion?state.success.data:null;
 if(target&&valid&&valid.summary?.basis==='CURRENT'&&valid.summary.categoryCount===target.row.categorySummary?.categoryCount&&JSON.stringify(valid.summary.items.slice(0,3))===JSON.stringify(target.row.categorySummary?.items)){cache.current={key:key(target.row),data:valid};}
 const data=target&&cache.current?.key===key(target.row)?cache.current.data:null;
 useLayoutEffect(()=>{if(!target||!pop.current)return;const r=target.anchor.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.left,innerWidth-240)),top:Math.max(8,Math.min(r.bottom+4,innerHeight-pop.current.offsetHeight-8))});},[target,data,state.phase]);
 useEffect(()=>{if(!target)return;const click=(event:MouseEvent)=>{if(!pop.current?.contains(event.target as Node)&&!target.anchor.contains(event.target as Node))close();};const scroll=(event:Event)=>{if(!pop.current?.contains(event.target as Node))close();};const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){close();target.anchor.focus();}};document.addEventListener('pointerdown',click);document.addEventListener('scroll',scroll,true);document.addEventListener('keydown',keydown);window.addEventListener('resize',close);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('scroll',scroll,true);document.removeEventListener('keydown',keydown);window.removeEventListener('resize',close);};},[target]);
 function open(row:NormalTransferRow,anchor:HTMLButtonElement){if(target?.anchor===anchor){close();return;}query.cancel();setTarget({row,anchor});if(cache.current?.key!==key(row)){cache.current=null;void query.run({transferId:row.documentId});}}
 const firstIds=new Set(target?.row.categorySummary?.items.map(item=>item.categoryId));
 const body=target?createPortal(<div ref={pop} id="tc-more-tags-pop" className="tc-more-tags-pop" role="dialog" aria-label="其余商品信息" style={position}><strong>其余商品信息</strong>{data?.summary?data.summary.items.filter(item=>!firstIds.has(item.categoryId)).map((item,index)=><span key={item.categoryId??index}>{item.categoryName??'待确认分类'} <b>{item.value}</b></span>):state.phase==='loading'?<span role="status">正在读取商品信息…</span>:<div role="alert">{state.phase==='success'?'单据或分类信息已变化，请刷新列表。':'商品信息读取失败。'}{state.phase!=='success'&&<button type="button" className="btn" onClick={()=>void query.run({transferId:target.row.documentId})}>重试</button>}</div>}</div>,document.body):null;
 return {tags:(row:NormalTransferRow)=><CategoryTags summary={row.categorySummary} {...(row.dataset==='LIVE'&&row.categorySummary?.hasMore?{more:(anchor:HTMLButtonElement)=>open(row,anchor)}:{})}/>,body};
}
