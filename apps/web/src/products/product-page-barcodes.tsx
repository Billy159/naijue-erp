import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { DictionaryBrowserReader } from '../product-settings/size-groups/contracts.ts';
import type { DictionaryBarcodeScheme, DictionarySchemeQuery } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { ProductBarcodeQuery, ProductBarcodeQueryResult, ProductBarcodeSkuPage, ProductBarcodeSkuRow, ProductBarcodeSummary } from '../../../../packages/application/src/product-details-query-ports.ts';
import { ProductPanelActivity, ProductReadState, useProductPanelActive, useProductQueryActivity } from '../inventory/product-tab-state.tsx';
import { parseProductBarcodeQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import { productBarcodesResponse } from './product-page-validation.ts';
import type { ProductPageTabProps } from './product-page-view.tsx';
import { StandardPagination } from '../components/standard-pagination.tsx';

type SchemeReader=Pick<DictionaryBrowserReader,'readBarcodeScheme'>;
type SchemeQuery=LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>;
interface SchemeTarget { readonly scope:ReadScope;readonly productId:string;readonly version:number;readonly schemeId:string }
export function View({ scope, reader }: ProductPageTabProps) {
  const [target,setTarget]=useState<SchemeTarget|null>(null),[owner,setOwner]=useState<{scope:ReadScope;reader:SchemeReader;target:SchemeTarget;query:SchemeQuery}|null>(null);
  const [fieldVisible,setFieldVisible]=useState(false),panelActive=useProductPanelActive(),schemeReader=reader.barcodes?.schemeReader;
  const receiveTarget=useCallback((next:SchemeTarget|null,visible:boolean)=>{if(visible)setTarget(previous=>previous?.scope===next?.scope&&previous?.productId===next?.productId&&previous?.version===next?.version&&previous?.schemeId===next?.schemeId?previous:next);setFieldVisible(visible);},[]);
  useLayoutEffect(()=>{
    if(!target||target.scope!==scope||!scope.active||!schemeReader){setOwner(null);return;}
    const query=createSchemeQuery(scope,schemeReader);setOwner({scope,reader:schemeReader,target,query});return()=>query.dispose();
  },[scope,schemeReader,target]);
  const current=owner?.scope===scope&&owner.reader===schemeReader&&owner.target===target&&scope.active?owner:null;
  return <><ProductPanelActivity.Provider value={panelActive&&fieldVisible}><SchemeNameActivity query={current?.query??null} schemeId={current?.target.schemeId??null}/></ProductPanelActivity.Provider>{scope.entityId&&<BarcodePagedRead scope={scope} read={reader.barcodes!.read} initial={parseProductBarcodeQuery({productId:scope.entityId,page:1,pageSize:50,view:'SKU'})} label="商品规格条码分页">{data => <>
    <DefaultSchemeTools key={`${data.productId}:${data.version}:${data.defaultScheme.state==='AVAILABLE'?data.defaultScheme.schemeId:data.defaultScheme.state}`} scope={scope} reader={reader} data={data} receiveTarget={receiveTarget} query={current&&current.target.productId===data.productId&&current.target.version===data.version&&data.defaultScheme.state==='AVAILABLE'&&current.target.schemeId===data.defaultScheme.schemeId?current.query:null}/>
    {'kind' in data&&<BarcodeSkuRows key={`${data.productId}:${data.version}:${data.page}:${data.pageSize}`} scope={scope} reader={reader} data={data}/>}
  </>}</BarcodePagedRead>}</>;
}
function SchemeNameActivity(p:{readonly query:SchemeQuery|null;readonly schemeId:string|null}){
  useProductQueryActivity(p.query,p.schemeId?{schemeId:p.schemeId}:null);return null;
}

function DefaultSchemeField(p:{readonly value:string;readonly disabled:boolean;readonly title?:string;readonly open:()=>void}){
  return <div className="pc-barcode-tools product-barcode-tools"><div className="field"><span className="pc-field-caption">主条码默认方案</span><div id="pc-detail-scheme" className="pc-arco-host"><span className="pc-read-value" title={p.title}>{p.value}</span></div></div><button type="button" className="btn ghost" disabled={p.disabled} onClick={p.open}>查看方案</button></div>;
}
function DefaultSchemeTools({ scope, reader, data,receiveTarget,query }: ProductPageTabProps & { readonly data: ProductBarcodeQueryResult;readonly receiveTarget:(target:SchemeTarget|null,visible:boolean)=>void;readonly query:SchemeQuery|null }) {
  const scheme=data.defaultScheme;
  const schemeReader=reader.barcodes?.schemeReader;
  useLayoutEffect(()=>{const target=scheme.state==='AVAILABLE'&&schemeReader?{scope,productId:data.productId,version:data.version,schemeId:scheme.schemeId}:null;receiveTarget(target,true);return()=>receiveTarget(target,false);},[scope,data.productId,data.version,scheme.state,scheme.state==='AVAILABLE'?scheme.schemeId:null,schemeReader,receiveTarget]);
  if(scheme.state==='AVAILABLE'&&schemeReader&&query)return <DefaultSchemeName scope={scope} schemeId={scheme.schemeId} reader={schemeReader} query={query}/>;
  const title=scheme.state==='NOT_SET'?'未设置默认方案':scheme.state==='AVAILABLE'&&!schemeReader?'默认方案已记录，当前无法读取方案名称':null;
  return <DefaultSchemeField value={scheme.state==='NOT_SET'?'—':scheme.state==='UNAVAILABLE'?'未提供':schemeReader?'正在读取方案…':'方案资料未提供'} {...(title?{title}:{})} disabled open={()=>{}}/>;
}
function DefaultSchemeName(p:{readonly scope:ReadScope;readonly schemeId:string;readonly reader:SchemeReader;readonly query:SchemeQuery}){
  const active=useProductPanelActive(),[viewing,setViewing]=useState(false),snapshot=useSyncExternalStore(p.query.subscribe,p.query.getSnapshot,p.query.getSnapshot);
  useEffect(()=>{if(!active)setViewing(false);},[active]);
  if(!p.scope.active||snapshot.phase==='disposed')return null;
  const data=snapshot.phase==='success'?snapshot.success?.data:null;
  const value=snapshot.phase==='success'?(data?.name??'方案资料未提供'):snapshot.phase==='error'?'方案读取失败':snapshot.phase==='idle'&&snapshot.request?'方案读取已取消':'正在读取方案…';
  const retry=()=>{if(active&&p.scope.active)void p.query.run({schemeId:p.schemeId});};
  return <>
    <DefaultSchemeField value={value} disabled={!active} open={()=>{if(active)setViewing(true);}}/>
    {snapshot.phase==='error'&&<p className="product-field-hint" role="alert">默认方案名称暂不可读取。<UIButton type="button" className="iw-link" disabled={!active} onClick={retry}>重试读取方案</UIButton></p>}
    {snapshot.phase==='idle'&&snapshot.request&&<p className="product-field-hint" role="status">方案读取已取消。<UIButton type="button" className="iw-link" disabled={!active} onClick={retry}>重新读取方案</UIButton></p>}
    {active&&viewing&&<ProductBarcodeSchemePreview scope={p.scope} schemeId={p.schemeId} reader={p.reader} query={p.query} close={()=>setViewing(false)}/>}
  </>;
}

/** SKU pages and record pages keep their own server count and exact request.
 * This owner is local to the existing barcode leaf; shared stock/prices paging stays unchanged. */
function BarcodePagedRead(p:{readonly scope:ReadScope;readonly read:NonNullable<ProductPageTabProps['reader']['barcodes']>['read'];readonly initial:ProductBarcodeQuery;readonly label:string;readonly children:(data:ProductBarcodeQueryResult)=>ReactNode}){
 const [owner,setOwner]=useState<{scope:ReadScope;read:typeof p.read;initial:ProductBarcodeQuery;query:LatestQuery<ProductBarcodeQuery,ProductBarcodeQueryResult|null>}|null>(null);
 useEffect(()=>{
  const query=new LatestQuery<ProductBarcodeQuery,ProductBarcodeQueryResult|null>({scope:p.scope,execute:async read=>productBarcodesResponse(await p.read(read),read.parameters)});
  setOwner({scope:p.scope,read:p.read,initial:p.initial,query});return()=>query.dispose();
 },[p.scope,p.read,p.initial.view,p.initial.skuId]);
 const query=owner?.scope===p.scope&&owner.read===p.read&&owner.initial.view===p.initial.view&&owner.initial.skuId===p.initial.skuId?owner.query:null;
 useProductQueryActivity(query,p.initial);
 return query&&p.scope.active?<BarcodePagedResults scope={p.scope} query={query} label={p.label}>{p.children}</BarcodePagedResults>:null;
}
function BarcodePagedResults(p:{readonly scope:ReadScope;readonly query:LatestQuery<ProductBarcodeQuery,ProductBarcodeQueryResult|null>;readonly label:string;readonly children:(data:ProductBarcodeQueryResult)=>ReactNode}){
 const active=useProductPanelActive(),snapshot=useSyncExternalStore(p.query.subscribe,p.query.getSnapshot,p.query.getSnapshot),[cancelled,setCancelled]=useState(false);
 const data=snapshot.success?.data,parameters=snapshot.request?.parameters;
 return <ProductReadState phase={snapshot.phase} cancelled={cancelled} empty={!data} cancel={()=>{setCancelled(true);p.query.cancel();}} retry={()=>{if(active&&parameters){setCancelled(false);void p.query.run(parameters);}}}>
  {data&&<>{p.children(data)}<StandardPagination label={p.label} scope={p.scope} active={active} page={data.page} pageSize={data.pageSize} total={'kind' in data?data.totalSkus:data.total} disabled={snapshot.phase==='loading'} onPage={page=>{if(active&&snapshot.success)void p.query.run({...snapshot.success.parameters,page});}}/></>}
 </ProductReadState>;
}
function BarcodeSummary({value}:{readonly value:ProductBarcodeSummary|null}){
 return value?<span data-barcode-id={value.id}><span className="product-raw-barcode">{value.barcode}</span>{!value.enabled&&<small>（停用）</small>}</span>:<>—</>;
}
function BarcodeSkuRows({scope,reader,data}:ProductPageTabProps&{readonly data:ProductBarcodeSkuPage}){
 const active=useProductPanelActive(),[viewing,setViewing]=useState<ProductBarcodeSkuRow|null>(null);
 useEffect(()=>{if(!active)setViewing(null);},[active]);
 const show=(row:ProductBarcodeSkuRow)=>{if(active&&scope.active&&row.bindingCount>0)setViewing(row);};
 return <>
  <ProductBarcodeSourceBody className="product-readonly-barcode-table" rows={data.items.map(row=>({key:row.skuId,skuId:row.skuId,color:row.colorLabel??'—',fit:row.fitLabel??'—',size:row.sizeLabel??'—',current:<BarcodeSummary value={row.main}/>,extras:row.firstConfirmedOld?<><BarcodeSummary value={row.firstConfirmedOld}/><button type="button" className="btn ghost" onClick={()=>show(row)}>{row.confirmedOldCount>1?'+'+(row.confirmedOldCount-1)+' 更多':'查看'}</button></>:<>—</>,actions:<>{!row.skuEnabled&&<span className="product-field-hint">（停用）</span>}{row.bindingCount>0&&<button type="button" className="btn ghost" onClick={()=>show(row)}>查看</button>}</>}))}/>
  {active&&viewing&&<BarcodeSkuDetails key={viewing.skuId} scope={scope} reader={reader} row={viewing} close={()=>setViewing(null)}/>}
 </>;
}
function BarcodeSkuDetails(p:ProductPageTabProps&{readonly row:ProductBarcodeSkuRow;readonly close:()=>void}){
 return <StandardOverlay presentation="catalogue" title="查看全部条码" closeLabel="关闭查看全部条码" className="pc-arco-modal pc-wide product-source-modal product-source-ui product-barcode-detail-modal" width={780} close={p.close} footer={close=><div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
  <div className="pc-modal-body"><p className="spaced">商品规格：{[p.row.colorLabel??'—',p.row.fitLabel??'—',p.row.sizeLabel??'—'].join(' / ')}</p>
   <BarcodePagedRead scope={p.scope} read={p.reader.barcodes!.read} initial={parseProductBarcodeQuery({productId:p.scope.entityId,page:1,pageSize:50,skuId:p.row.skuId})} label="当前规格条码记录分页">{data=>'kind' in data?null:<>
    <p className="product-field-hint">当前第{data.page}页，本页{data.items.length}条／共{data.total}条已保留条码记录。</p>
    <table className="pc-barcode-view-table"><thead><tr>{['条码','类型','来源','历史规格','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(record=><tr key={record.id} data-barcode-id={record.id}><td className="product-raw-barcode">{record.barcode}</td><td>{record.kind==='MAIN'?'主条码':'已确认旧条码'}{!record.enabled&&<small>（停用）</small>}</td><td>未提供</td><td>未提供</td><td/></tr>)}</tbody></table>
    {!data.items.length&&<div className="empty">当前没有已保留的条码记录</div>}
   </>}</BarcodePagedRead><p className="hint">这里展示当前规格已保留的条码记录，包含停用记录。</p>
  </div>
 </StandardOverlay>;
}

export interface ProductBarcodeSourceRow {readonly key:string;readonly skuId?:string;readonly color:ReactNode;readonly fit:ReactNode;readonly size:ReactNode;readonly current:ReactNode;readonly extras:ReactNode;readonly actions:ReactNode}
/** Frozen barcodeBody table UI; rows are supplied solely from native SKU/barcode
 * facts. The original Demo cartesian derivation/storage never enters this layer. */
export function ProductBarcodeSourceBody(p:{readonly rows:readonly ProductBarcodeSourceRow[];readonly className:string}){
 return <div className="product-source-ui"><div className="pc-section-line"><h3>当前规格条码</h3></div><div className={`pc-detail-table pc-barcode-table ${p.className}`} tabIndex={0} aria-label="商品规格条码，可横向滚动"><table><thead><tr>{['颜色','版型','尺码','当前主条码','历史 / 兼容条码','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{p.rows.map(row=><tr key={row.key} data-barcode-sku={row.key} data-sku-id={row.skuId}><td>{row.color}</td><td>{row.fit}</td><td>{row.size}</td><td className="pc-barcode-code">{row.current}</td><td className="pc-barcode-code">{row.extras}</td><td>{row.actions}</td></tr>)}</tbody></table>{!p.rows.length&&<div className="empty">当前没有可展示的 SKU 条码</div>}</div></div>;
}

/** Shared original preview: readonly uses the existing guarded page reader;
 * maintenance keeps its explicit access-failure owner callback. */
interface BarcodeSchemePreviewProps {readonly scope:ReadScope;readonly schemeId:string;readonly reader:SchemeReader;readonly onAccessFailure?:(error:HttpQueryError)=>void;readonly close:()=>void;readonly query?:SchemeQuery}
function createSchemeQuery(scope:ReadScope,reader:SchemeReader,onAccessFailure?:(error:HttpQueryError)=>void):SchemeQuery{
 const next=new LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>({scope,execute:async read=>{try{const value=await reader.readBarcodeScheme(read);if(value===null)return null;const result=validateDictionaryScheme(value);if(result.id!==read.parameters.schemeId)throw new Error('Invalid scheme target');return result;}catch(error){if(scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden')){next.dispose();onAccessFailure?.(error);}throw error;}}});return next;
}
export function ProductBarcodeSchemePreview(p:BarcodeSchemePreviewProps){
 if(p.query)return p.scope.active?<ProductBarcodeSchemeDetail {...p} query={p.query}/>:null;
 return <OwnedProductBarcodeSchemePreview {...p}/>;
}
function OwnedProductBarcodeSchemePreview(p:BarcodeSchemePreviewProps){
 const [query,setQuery]=useState<LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>|null>(null);
 useEffect(()=>{const next=createSchemeQuery(p.scope,p.reader,p.onAccessFailure);setQuery(next);return()=>next.dispose();},[p.scope,p.reader,p.schemeId]);
 return query&&p.scope.active?<ProductBarcodeSchemeDetail {...p} query={query} initialRead/>:null;
}
function ProductBarcodeSchemeDetail(p:BarcodeSchemePreviewProps&{readonly query:SchemeQuery;readonly initialRead?:boolean}){
 const snapshot=useSyncExternalStore(p.query.subscribe,p.query.getSnapshot,p.query.getSnapshot),data=snapshot.phase==='success'?snapshot.success?.data:null;
 const run=()=>{if(p.scope.active)void p.query.run({schemeId:p.schemeId});};
 return <StandardOverlay presentation="catalogue" title="查看条码方案" closeLabel="关闭查看条码方案" className="pc-arco-modal product-source-modal product-source-ui product-barcode-scheme-modal" width={640} close={p.close} onReady={()=>{if(p.initialRead&&p.query.getSnapshot().phase==='idle')run();}} footer={close=><div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
  <ProductReadState phase={snapshot.phase} retry={run} cancel={()=>p.query.cancel()} cancelled={snapshot.phase==='idle'} empty={snapshot.phase==='success'&&data===null}>
   {data&&<dl className="pc-rule"><dt>方案名称</dt><dd>{data.name}</dd><dt>条码类型</dt><dd>{data.barcodeType}</dd><dt>编码规则</dt><dd>{data.ruleDescription}</dd><dt>总长度</dt><dd>{data.codeLength===null?'未提供':`${data.codeLength} 位`}</dd></dl>}
  </ProductReadState>
 </StandardOverlay>;
}
