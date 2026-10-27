import { isValidElement, cloneElement, useRef, useLayoutEffect, useState, type ReactNode, type ComponentType } from 'react';
import Select from '@arco-design/web-react/es/Select';
import type { SelectProps } from '@arco-design/web-react/es/Select';
import Trigger from '@arco-design/web-react/es/Trigger';
import { SourceControl } from '../inventory/candidates.tsx';
import { singleCss } from '../inventory/source-control-css.ts';
import type { SalesProposalSession, SalesProposalSnapshot, SalesProposalEntry } from '../../../../src/current-form/sales-proposal.ts';
import type { CurrentFormProduct, CurrentFormSku, CurrentSalesReferenceItem } from '../../../../../../packages/application/src/current-form-ports.ts';
import type { ProductReadOnlyReader } from '../../../../src/inventory/product-contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { ProductCandidatePreview } from '../products/preview.tsx';

const ReferenceSelect=Select as unknown as ComponentType<Omit<SelectProps,'value'>&{value:SelectProps['value']|undefined}>;
export function ProposalReference(p:{session:SalesProposalSession;picker:SalesProposalSnapshot['picker'];active:boolean;label:string;selected:CurrentSalesReferenceItem|null;disabled:boolean;open:()=>void;close:()=>void;account?:boolean;recommendedId?:string;clear?:()=>void;afterSelect?:()=>void}) {
 const picker=p.active?p.picker:null,items:CurrentSalesReferenceItem[]=(picker?.result?.items??[]).flatMap(item=>'paymentMethodId'in item?[item]:[]);
 const choices=[...items];if(p.selected&&!choices.some(x=>x.id===p.selected!.id))choices.unshift(p.selected);
 const label=(row:CurrentSalesReferenceItem)=>p.account&&row.code&&!row.name.trimStart().startsWith(row.code)?row.code+' '+row.name:row.name;
 const isRecommended=(row:CurrentSalesReferenceItem)=>p.account?picker?.result?.recommendationAvailability==='AVAILABLE'&&row.isRecommended===true:row.id===p.recommendedId;
 const recommended=items.filter(isRecommended),grouped=recommended.length>0;
 return <SourceControl css={singleCss}>{(portal,host)=><ReferenceSelect className="ui-flat-select" aria-label={p.label} value={p.selected?.id} allowClear={!!p.clear} {...(p.clear?{onClear:p.clear}:{})} placeholder={'请选择'+p.label} disabled={p.disabled} showSearch filterOption={false} popupVisible={p.active&&!!picker} loading={picker?.phase==='loading'} getPopupContainer={()=>portal} triggerProps={{position:'bl',autoAlignPopupWidth:false,popupStyle:{width:Math.min(Math.max(host.getBoundingClientRect().width,300),Math.max(180,innerWidth-host.getBoundingClientRect().left-12))}}} renderFormat={()=> <span className="ui-single-tag">{p.selected?label(p.selected):''}</span>} onVisibleChange={visible=>{if(visible)p.open();else {const prior=p.picker;queueMicrotask(()=>{if(p.session.getSnapshot().picker===prior)p.close();});}}} onSearch={search=>p.active&&void p.session.search(search)} onChange={id=>{if(p.active&&typeof id==='string')void p.session.select(id).then(ok=>{if(ok)p.afterSelect?.();});}} dropdownRender={menu=><>{picker?.phase==='error'?<div className="sale-reference-state" role="alert">读取失败 <button className="btn" onMouseDown={e=>e.preventDefault()} onClick={()=>void p.session.retry()}>重试</button></div>:menu}{picker?.result&&picker.result.exactTotal>20n&&<div className="sale-reference-state"><button className="btn" disabled={picker.page<=1} onMouseDown={e=>e.preventDefault()} onClick={()=>void p.session.page(picker.page-1)}>上一页</button><span>共 {picker.result.exactTotal.toString()} 项</span><button className="btn" disabled={BigInt(picker.page)*20n>=picker.result.exactTotal} onMouseDown={e=>e.preventDefault()} onClick={()=>void p.session.page(picker.page+1)}>下一页</button></div>}</>}>
 {grouped?<><Select.OptGroup label={p.account?'推荐':'当前用户（推荐）'}>{choices.filter(isRecommended).map(row=><Select.Option key={row.id} value={row.id}>{label(row)}</Select.Option>)}</Select.OptGroup><Select.OptGroup label={p.account?'全部账户':'全部人员'}>{choices.filter(x=>!isRecommended(x)).map(row=><Select.Option key={row.id} value={row.id} disabled={!items.includes(row)}>{label(row)}</Select.Option>)}</Select.OptGroup></>:choices.map(row=><Select.Option key={row.id} value={row.id} disabled={!items.some(x=>x.id===row.id)}>{label(row)}</Select.Option>)}
 </ReferenceSelect>}</SourceControl>;
}
export function ProposalPopup(p:{session:SalesProposalSession;picker:NonNullable<SalesProposalSnapshot['picker']>;spec?:'color'|'fit'|'size';selection?:Pick<SalesProposalEntry,'color'|'fit'|'size'>;scope:ReadScope;productReader:ProductReadOnlyReader;denied:(error:HttpQueryError)=>void;choose:(id:string)=>void}) {
 const [preview,setPreview]=useState<string|null>(null),picker=p.picker,products=(picker.result?.items??[]).flatMap(item=>'code'in item&&'retailPrice'in item?[item as CurrentFormProduct]:[]);
 const skus=picker.specSkus??[],groups=p.session.getSnapshot().sizeGroups.groups;
 const options: {id:string;name:string}[]=p.spec==='size'?groups.flatMap(group=>group.sizes.map(size=>({id:size.id,name:size.name}))) : p.spec?[...new Map<string,{id:string;name:string}>(skus.filter(row=>p.spec==='color'||row.colorId===p.selection?.color?.id).map(row=>p.spec==='color'?[row.colorId,{id:row.colorId,name:row.colorName}]:[row.fitId,{id:row.fitId,name:row.fitName}])).values()]:[];
 const keydown=(event:React.KeyboardEvent<HTMLDivElement>)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();p.session.closePicker();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-sale-candidate]')),index=buttons.indexOf(event.target as HTMLButtonElement);if(buttons.length){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1)+buttons.length)%buttons.length]?.focus();}}};
 return <div id={p.spec?undefined:'sale-inline-popup'} style={p.spec?undefined:{position:'relative',width:'100%','--pf-list-width':'280px'} as React.CSSProperties} className={p.spec?'sale-spec-menu mx-spec-menu':'product-finder sale-inline-popup pf-inventory-style'} role="dialog" aria-label={p.spec?'选择'+({color:'颜色',fit:'版型',size:'尺码'}[p.spec]):'商品候选'} onKeyDown={keydown}>
 {picker.phase==='loading'?<p role="status">正在查找…</p>:picker.phase==='error'?<p role="alert">查询失败 <button className="btn" onClick={()=>void p.session.retry()}>重试</button></p>:p.spec?<><div className="mx-spec-menu-head">选择{{color:'颜色',fit:'版型',size:'尺码'}[p.spec]}<span>{options.length} 项</span></div><div className="mx-spec-menu-options" role="listbox">{options.map(option=><button type="button" className="btn" role="option" aria-selected={p.selection?.[p.spec!]?.id===option.id} data-sale-candidate data-mx-spec-option={option.id} key={option.id} onClick={()=>p.choose(option.id)}><span>{option.name}</span>{p.selection?.[p.spec!]?.id===option.id&&<span aria-hidden>✓</span>}</button>)}{!options.length&&<p>本组暂无可用规格</p>}</div></>:<div className="pf-layout"><div className="pf-list" role="listbox"><div className="pf-heading"><span>商品款号</span><span>商品名称</span></div>{products.map(row=><button type="button" data-sale-candidate data-finder-option={row.id} data-inline-option={row.id} key={row.id} role="option" aria-selected={preview===row.id} onMouseEnter={()=>setPreview(row.id)} onFocus={()=>setPreview(row.id)} onMouseDown={e=>e.preventDefault()} onClick={()=>p.choose(row.id)}><strong>{row.code}</strong><span>{row.name}</span></button>)}{!products.length&&<p>没有匹配结果，请继续输入</p>}{picker.result&&picker.result.exactTotal>20n&&<footer><button className="btn" disabled={picker.page<=1} onClick={()=>void p.session.page(picker.page-1)}>上一页</button><small>共{picker.result.exactTotal.toString()}项</small><button className="btn" disabled={BigInt(picker.page)*20n>=picker.result.exactTotal} onClick={()=>void p.session.page(picker.page+1)}>下一页</button></footer>}</div>{(preview??products[0]?.id)&&<aside className="pf-preview"><ProductCandidatePreview key={preview??products[0]!.id} productId={preview??products[0]!.id} reader={p.productReader} scope={p.scope} portal={document.body} onAccessFailure={p.denied}/></aside>}</div>}
 </div>;
}
export function ProposalTrigger(p:{visible:boolean;popup:()=>ReactNode;close:()=>void;children:ReactNode;spec?:boolean;width?:number}) {
 const trigger=useRef<HTMLElement|null>(null),menu=useRef<HTMLDivElement|null>(null),pending=useRef<'first'|'last'|null>(null);
 const focusOption=()=>{if(!p.visible||!pending.current)return;const options=menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)');if(options?.length){options[pending.current==='first'?0:options.length-1]?.focus();pending.current=null;}};
 useLayoutEffect(()=>{if(!p.visible)pending.current=null;else focusOption();});
 const escape=(event:React.KeyboardEvent)=>{event.preventDefault();event.stopPropagation();pending.current=null;p.close();if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});};
 const popupKey=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){escape(event);return;}
  const options=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();const index=options.indexOf(event.target as HTMLButtonElement),next=index<0?(event.key==='ArrowDown'?0:options.length-1):(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next]?.focus();}
  else if(event.key==='Enter'&&options.includes(event.target as HTMLButtonElement)){event.preventDefault();event.stopPropagation();(event.target as HTMLButtonElement).click();}
 };
 type ChildProps={disabled?:boolean;onKeyDown?:(event:React.KeyboardEvent<HTMLElement>)=>void;onClickCapture?:(event:React.MouseEvent<HTMLElement>)=>void};
 let child=p.children;
 if(p.spec&&isValidElement<ChildProps>(child)){
  const original=child.props;
  child=cloneElement(child,{onClickCapture:event=>{trigger.current=event.currentTarget;original.onClickCapture?.(event);},onKeyDown:event=>{
   trigger.current=event.currentTarget;
   if(event.nativeEvent.isComposing||event.keyCode===229)return;
   if(p.visible&&event.key==='Escape'){escape(event);return;}
   if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){
    event.preventDefault();pending.current=event.key==='ArrowUp'?'last':'first';
    if(p.visible)focusOption();else event.currentTarget.click();
    return;
   }
   original.onKeyDown?.(event);
  }});
 }
 // Arco moves a disabled button class to a wrapper span; retain the original
 // disabled source button instead. It has no popup action until available.
 if(isValidElement<{disabled?:boolean}>(p.children)&&p.children.props.disabled)return <>{p.children}</>;
 return <Trigger popupVisible={p.visible} trigger={[]} position="bl" popup={p.spec?()=> <div ref={node=>{menu.current=node;focusOption();}} onKeyDownCapture={popupKey}>{p.popup()}</div>:p.popup} unmountOnExit autoAlignPopupWidth={false} popupStyle={{width:p.width??(p.spec?250:660),maxWidth:'calc(100vw - 16px)'}} onVisibleChange={visible=>{if(!visible)p.close();}}>{child}</Trigger>;
}
