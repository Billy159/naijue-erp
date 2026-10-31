import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type { NormalSalesRow } from './normal-list-reader.ts';
/** Explicit CURRENT read projection; never implies a saved historical category. */
export function CategoryTags({summary,more}:{summary:NormalSalesRow['categorySummary'];more?:(anchor:HTMLButtonElement)=>void}){
 if(!summary)return <span className="tc-product-tags">分类统计未提供</span>;
 if(summary.basis==='UNKNOWN')return <span className="tc-product-tags" title="历史单据未记录分类；未按当前商品资料推断">历史未记录分类</span>;
 const text=(item:typeof summary.items[number])=>(item.categoryName??'待确认分类')+' '+item.value;
 const remaining=summary.categoryCount==null?null:BigInt(summary.categoryCount)-BigInt(summary.items.length),label=remaining===null?'更多分类':'+'+remaining+' 更多';
 return <span className="tc-product-tags" title={'按当前商品分类统计 · '+summary.items.map(text).join(' · ')}>{summary.items.map((item,index)=><span className="tc-product-tag" key={item.categoryId??index}>{text(item)}</span>)}{summary.hasMore&&(more?<button type="button" className="tc-product-tag tc-more-tag" onClick={event=>{event.stopPropagation();more(event.currentTarget);}} aria-haspopup="dialog">{label}</button>:<span className="tc-product-tag">{label}</span>)}</span>;
}

/** Detail already owns the bounded full projection; expanding never refetches or
 * substitutes a current catalogue for an unknown historical category. */
export function FullCategoryTags({summary}:{summary:NormalSalesRow['categorySummary']}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),pop=useRef<HTMLDivElement>(null);
 const close=(focus=false)=>{if(focus)anchor?.focus();setAnchor(null);};
 useEffect(()=>{setAnchor(null);},[summary]);
 useEffect(()=>{if(!anchor)return;const pointer=(e:PointerEvent)=>{if(!anchor.contains(e.target as Node)&&!pop.current?.contains(e.target as Node))close();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close(true);};const scroll=(e:Event)=>{if(!pop.current?.contains(e.target as Node))close();};document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};},[anchor]);
 const preview=summary?.basis==='CURRENT'?{...summary,items:summary.items.slice(0,3),hasMore:summary.items.length>3}:summary,r=anchor?.getBoundingClientRect();
 return <><CategoryTags summary={preview} more={target=>setAnchor(anchor===target?null:target)}/>{anchor&&r&&summary&&createPortal(<div ref={pop} className="tc-more-tags-pop" role="dialog" aria-label="其余商品信息" style={{left:Math.max(8,Math.min(r.left,innerWidth-240)),top:Math.max(8,Math.min(r.bottom+4,innerHeight-250))}}><strong>其余商品信息</strong>{summary.items.slice(3).map((item,index)=><span key={item.categoryId??index}>{item.categoryName??'待确认分类'} <b>{item.value}</b></span>)}</div>,document.body)}</>;
}
