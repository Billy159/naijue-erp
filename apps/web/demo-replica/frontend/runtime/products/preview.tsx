import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from '@arco-design/web-react/es/Image';
import Popover from '@arco-design/web-react/es/Popover';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductParameters, ProductImageParameters, ProductBasics, ProductImages, ProductSpecifications, ProductImage, ProductReadOnlyReader, ProductImageSummary } from '../../../../src/inventory/product-contracts.ts';
import { candidatePreviewCss } from './candidate-preview-css.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
interface Props {productId:string;reader:ProductReadOnlyReader;scope:ReadScope;portal:HTMLElement;onAccessFailure:(e:HttpQueryError)=>void}
/** Source inventory-select.jsx PreviewPanel. Only the active popup product is read. */
export function ProductCandidatePreview(p:Props){
 const [query]=useState(()=>new LatestQuery<ProductParameters,readonly[ProductBasics|null,ProductImages|null,ProductSpecifications|null]>({scope:p.scope,execute:async read=>Promise.all([p.reader.readProductBasics(read),p.reader.readProductImages(read),p.reader.readProductSpecifications(read)])}));
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),mounted=useRef(false);
 const run=()=>void query.run({productId:p.productId});
 useEffect(()=>{let active=true;mounted.current=true;queueMicrotask(()=>{if(active&&mounted.current)run();});return()=>{active=false;mounted.current=false;query.cancel();queueMicrotask(()=>{if(!mounted.current)query.dispose();});};},[query,p.productId]);
 useEffect(()=>{if(state.phase==='error'&&state.error instanceof HttpQueryError&&(state.error.kind==='forbidden'||state.error.kind==='unauthenticated')){p.onAccessFailure(state.error);p.scope.dispose();}},[state]);
 const [basic,media,specs]=state.success?.data??[null,null,null];const list=media?.images??[];
 const byColor=[...new Map(list.filter(image=>image.role==='COLOR'&&image.colorId).map(image=>[image.colorId,image])).values()];const photos=byColor.length?byColor:list.length?[list.find(image=>image.role==='MAIN')??list[0]!]:[];
 const fields=basic?[['款号',basic.code],['商品名称',basic.name],['颜色',specs?new Set(specs.colors.map(color=>color.id)).size+' 色':'资料未提供'],['商品分类',basic.categoryLabel??'资料未提供'],['季节',basic.seasonLabel??'资料未提供'],['版型',specs?(specs.fits.map(fit=>fit.label).join('、')||'未设置'):'资料未提供'],['供应商',basic.supplierLabel??'资料未提供'],['零售价',basic.retailPrice??'资料未提供'],['厚薄',basic.thickness],['领型 / 裤型',basic.collarPantsType]].filter((row):row is [string,string]=>typeof row[1]==='string'&&!!row[1]):[];
 return <aside className="inv-preview" data-product-candidate-preview><style>{candidatePreviewCss}</style><div className="inv-preview-title">商品资料</div>{state.phase==='error'?<div className="inv-preview-no-photo" role="alert">商品资料读取失败 <button className="btn ghost" onClick={run}>重试</button></div>:state.phase==='loading'?<div className="inv-preview-no-photo" role="status">正在读取商品资料…</div>:<>{media?(photos.length?<div className="inv-photo-grid">{photos.map(image=><PreviewPhoto key={image.id} {...p} image={image}/>)}</div>:<div className="inv-preview-no-photo">该商品尚未提供图片</div>):<div className="inv-preview-no-photo">图片资料尚未取得</div>}<div className="inv-preview-info">{fields.map(([name,value])=><div className="inv-preview-field" key={name}><small>{name}</small> {value}</div>)}</div></>}</aside>;
}
function PreviewPhoto(p:Props&{image:ProductImageSummary}){
 const [query]=useState(()=>new LatestQuery<ProductImageParameters,ProductImage>({scope:p.scope,execute:read=>p.reader.readProductImage(read)})),[visible,setVisible]=useState(false),mounted=useRef(false);const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;query.cancel();queueMicrotask(()=>{if(!mounted.current)query.dispose();});};},[query]);
 useEffect(()=>{if(visible)void query.run({productId:p.productId,imageId:p.image.id});else query.cancel();},[visible]);
 useEffect(()=>{if(state.phase==='error'&&state.error instanceof HttpQueryError&&(state.error.kind==='forbidden'||state.error.kind==='unauthenticated')){p.onAccessFailure(state.error);p.scope.dispose();}},[state]);
 return <Popover className="inv-photo-zoom" trigger={['hover','focus']} position="right" popupVisible={visible} onVisibleChange={setVisible} getPopupContainer={()=>p.portal} content={<div className="inv-photo-zoom-content">{state.phase==='success'?<Image src={state.success!.data.url} alt={p.image.label+'商品图片放大图'} width={260} height={260} preview={false} tabIndex={-1}/>:<span role={state.phase==='error'?'alert':'status'}>{state.phase==='error'?'图片读取失败':'正在读取图片…'}</span>}<span className="inv-photo-zoom-label">{p.image.label}</span></div>}><div className="inv-photo-item" tabIndex={0} aria-label={'悬停或聚焦查看'+p.image.label+'商品图片'}><span className="inv-photo-tile"><Image src={p.image.thumbnailUrl} alt={p.image.label+'商品图片'} preview={false} tabIndex={-1} lazyload loading="lazy" decoding="async"/></span><span className="inv-photo-label" title={p.image.label}>{p.image.label}</span></div></Popover>;
}
