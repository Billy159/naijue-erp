import { useEffect, useReducer, useState, Fragment } from 'react';
import Select from '@arco-design/web-react/es/Select';
import { SourceControl } from './candidates.tsx';
import { singleCss } from './source-control-css.ts';
interface SingleChoiceProps {label:string;value:string;items:readonly {value:string;label:string}[];change:(value:string)=>void;pagination?:boolean;disabled?:boolean}
export function SingleChoice(p:SingleChoiceProps){return <SourceControl css={singleCss}>{portal=><SingleChoiceContent {...p} portal={portal}/>}</SourceControl>;}
function SingleChoiceContent(p:SingleChoiceProps&{portal:HTMLElement}){
 const [open,setOpen]=useState(false),[mounted,setMounted]=useState(false),[,refreshPortal]=useReducer(value=>value+1,0);
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{if(p.disabled)setOpen(false);},[p.disabled]);
 // Installed Arco Portal needs a render after StrictMode replays its container ref.
 useEffect(()=>{if(!mounted||!open||p.disabled)return;let active=true;queueMicrotask(()=>{if(active)refreshPortal();});return()=>{active=false;};},[mounted,open,p.disabled]);
 return <Select disabled={!!p.disabled} className={p.pagination?'ui-page-size-select':'ui-flat-select'} aria-label={p.label} value={p.value} options={p.items.map(x=>({...x}))} showSearch={false} getPopupContainer={()=>p.portal} triggerProps={{position:'bl'}} popupVisible={mounted&&open&&!p.disabled} onVisibleChange={setOpen} unmountOnExit onChange={value=>{p.change(value);setOpen(false);}}/>;
}
export interface PaginationProps {page:number;size:number;total:number|bigint;change:(page:number)=>void;sizeChange?:(size:number)=>void;ledger?:boolean;busy?:boolean;unit?:'款'|'张'|'条';pageSizes?:readonly number[];className?:string;selectLabel?:string}
export function Pagination(p:PaginationProps){
 const unit=p.unit??'款',sizes=p.pageSizes??[100,200,500];
 const total=BigInt(p.total),pages=(total+BigInt(p.size)-1n)/BigInt(p.size)||1n;const [jump,setJump]=useState(String(p.page));useEffect(()=>setJump(String(p.page)),[p.page]);const nums=[...new Set([1,p.page-1,p.page,p.page+1,...(pages<=BigInt(Number.MAX_SAFE_INTEGER)?[Number(pages)]:[])])].filter(x=>x>=1&&BigInt(x)<=pages).sort((a,b)=>a-b);let previous=0;
 return <div className={['iw-pagination',p.className].filter(Boolean).join(' ')}>
 {!p.ledger&&<div className="ui-single-host"><SingleChoice pagination label={p.selectLabel??'每页商品款数'} disabled={p.busy||!p.sizeChange} value={String(p.size)} items={sizes.map(x=>({value:String(x),label:x+unit+'/页'}))} change={x=>p.sizeChange?.(Number(x))}/></div>}
 {!p.ledger&&<span>共 {String(total)} {unit}{total>0n?`，当前第 ${(p.page-1)*p.size+1}–${String(BigInt(p.page*p.size)<total?BigInt(p.page*p.size):total)} ${unit}`:''}</span>}
 {pages>1n&&<div className="actions"><button className="btn iw-page-arrow" aria-label="上一页" disabled={p.busy||p.page<=1} onClick={()=>p.change(p.page-1)}>‹</button>{nums.map(n=>{const gap=n-previous>1;previous=n;return <Fragment key={n}>{gap&&<span className="iw-page-ellipsis">…</span>}<button className="btn iw-page-number" aria-label={'第'+n+'页'} aria-current={n===p.page?'page':undefined} disabled={p.busy} onClick={()=>p.change(n)}>{n}</button></Fragment>;})}<button className="btn iw-page-arrow" aria-label="下一页" disabled={p.busy||BigInt(p.page)>=pages} onClick={()=>p.change(p.page+1)}>›</button>{!p.ledger&&<><label className="iw-jump">跳至 <input type="text" inputMode="numeric" aria-label="目标页码" value={jump} onChange={e=>setJump(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const n=Number(jump);if(Number.isSafeInteger(n)&&n>=1&&BigInt(n)<=pages)p.change(n);}}}/> 页</label><button className="btn iw-jump-go" disabled={p.busy} onClick={()=>{const n=Number(jump);if(Number.isSafeInteger(n)&&n>=1&&BigInt(n)<=pages)p.change(n);}}>跳转</button></>}</div>}
 </div>;
}
