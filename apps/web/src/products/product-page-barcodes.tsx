import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { DictionaryBrowserReader } from '../product-settings/size-groups/contracts.ts';
import type { DictionaryBarcodeScheme, DictionarySchemeQuery } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { ProductBarcodeDetails, ProductBarcodePage } from '../../../../packages/application/src/product-details-query-ports.ts';
import type { ProductSpecifications } from '../inventory/product-contracts.ts';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { ProductReadState, useProductPanelActive, useProductRead } from '../inventory/product-tab-state.tsx';
import { productBarcodesResponse } from './product-page-validation.ts';
import { ProductPagedRead, type ProductPageTabProps } from './product-page-view.tsx';

export function View({ scope, reader }: ProductPageTabProps) {
  return <ProductPagedRead<ProductBarcodePage> scope={scope} read={reader.barcodes!.read} validate={productBarcodesResponse} label="商品条码分页">{data => <>
    <DefaultSchemeTools key={`${data.productId}:${data.version}:${data.page}:${data.pageSize}:${data.defaultScheme.state==='AVAILABLE'?data.defaultScheme.schemeId:data.defaultScheme.state}`} scope={scope} reader={reader} data={data} />
    {data.items.length && reader.specs ? <LabeledPage key={`${data.productId}:${data.version}:${data.page}:${data.pageSize}`} scope={scope} reader={reader} data={data} />
      : <BarcodeGroups data={data} specifications={null} />}
  </>}</ProductPagedRead>;
}

function DefaultSchemeTools({ scope, reader, data }: ProductPageTabProps & { readonly data: ProductBarcodePage }) {
  const active=useProductPanelActive(),[viewing,setViewing]=useState(false),scheme=data.defaultScheme;
  const schemeReader=reader.barcodes?.schemeReader;
  useEffect(()=>{if(!active)setViewing(false);},[active]);
  return <>
    <div className="pc-barcode-tools product-barcode-tools"><div className="field"><span className="pc-field-caption">主条码默认方案</span><div id="pc-detail-scheme" className="pc-arco-host"><span className="pc-read-value">{scheme.state==='AVAILABLE'?'已设置':scheme.state==='NOT_SET'?'未设置':'未提供'}</span></div></div><button type="button" className="btn ghost" disabled={!active||scheme.state!=='AVAILABLE'||!schemeReader} title={scheme.state==='AVAILABLE'&&!schemeReader?'方案资料暂不可读取':undefined} onClick={()=>{if(active&&scheme.state==='AVAILABLE'&&schemeReader)setViewing(true);}}>查看方案</button></div>
    {active&&viewing&&scheme.state==='AVAILABLE'&&schemeReader&&<ProductBarcodeSchemePreview scope={scope} schemeId={scheme.schemeId} reader={schemeReader} close={()=>setViewing(false)}/>}
  </>;
}

function LabeledPage({ scope, reader, data }: ProductPageTabProps & { readonly data: ProductBarcodePage }) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, input => reader.specs!.read(input), assertProductSpecifications);
  // The page attachment owns this label read. Loading/error/cancel never reuse
  // an earlier success, and a new product/version/page remounts the attachment.
  const specifications = scope.active && snapshot.phase === 'success' && snapshot.success?.parameters.productId === data.productId
    ? snapshot.success.data : null;
  return <>
    {snapshot.phase === 'loading' && <p className="product-field-hint" role="status">正在读取规格名称… <UIButton type="button" className="iw-link" onClick={cancel}>取消读取</UIButton></p>}
    {snapshot.phase === 'error' && <p className="product-field-hint" role="alert">规格名称暂不可读取。<UIButton type="button" className="iw-link" onClick={read}>重试</UIButton></p>}
    {snapshot.phase === 'idle' && cancelled && <p className="product-field-hint" role="status">规格名称读取已取消。<UIButton type="button" className="iw-link" onClick={read}>重新读取</UIButton></p>}
    {snapshot.phase !== 'disposed' && <BarcodeGroups data={data} specifications={specifications} />}
  </>;
}

interface BarcodeGroup {
  /** First actual barcode record is the render key, never a new SKU identity. */
  readonly id: string; readonly skuId: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string;
  readonly records: ProductBarcodeDetails[];
}
function currentPageGroups(items: readonly ProductBarcodeDetails[]): readonly BarcodeGroup[] {
  const groups = new Map<string, BarcodeGroup>();
  for (const item of items) {
    const key = JSON.stringify([item.skuId, item.colorId, item.fitId, item.sizeId]);
    const group = groups.get(key);
    if (group) group.records.push(item);
    else groups.set(key, { id: item.id, skuId: item.skuId, colorId: item.colorId, fitId: item.fitId, sizeId: item.sizeId, records: [item] });
  }
  return [...groups.values()];
}
function Codes({ records }: { readonly records: readonly ProductBarcodeDetails[] }) {
  return records.length ? <div className="product-barcode-read-codes">{records.map(record => <span key={record.id} data-barcode-id={record.id}>
    <span className="product-raw-barcode">{record.barcode}</span>{!record.enabled && <small>（停用）</small>}
  </span>)}</div> : <span className="product-field-hint">当前页未提供</span>;
}
function BarcodeGroups({ data, specifications }: { readonly data: ProductBarcodePage; readonly specifications: ProductSpecifications | null }) {
  const rows = currentPageGroups(data.items);
  const skus = new Map(specifications?.skus.map(sku => [sku.id, sku]));
  const labels = { colors: new Map(specifications?.colors.map(value => [value.id, value.label])),
    fits: new Map(specifications?.fits.map(value => [value.id, value.label])), sizes: new Map(specifications?.sizes.map(value => [value.id, value.label])) };
  const label = (group: BarcodeGroup, axis: keyof typeof labels) => {
    const sku = skus.get(group.skuId);
    // Labels do not supply or repair bindings. A changed/missing SKU in the
    // independently read specifications leaves its native barcode names unknown.
    if (!sku || sku.colorId !== group.colorId || sku.fitId !== group.fitId || sku.sizeId !== group.sizeId) return '未提供';
    return labels[axis].get(axis === 'colors' ? group.colorId : axis === 'fits' ? group.fitId : group.sizeId) ?? '未提供';
  };
  return <>
    <p className="product-field-hint product-barcode-page-note">当前第{data.page}页，本页{data.items.length}条／共{data.total}条条码记录；按本页规格坐标展示，其他页可能包含同一规格的条码。</p>
    <ProductBarcodeSourceBody className="product-readonly-barcode-table" rows={rows.map(group=>({key:group.id,skuId:group.skuId,color:label(group,'colors'),fit:label(group,'fits'),size:label(group,'sizes'),current:<Codes records={group.records.filter(record=>record.kind==='MAIN')}/>,extras:<Codes records={group.records.filter(record=>record.kind==='CONFIRMED_OLD')}/>,actions:<button type="button" className="btn ghost" disabled>查看</button>}))}/>
  </>;
}

export interface ProductBarcodeSourceRow {readonly key:string;readonly skuId?:string;readonly color:ReactNode;readonly fit:ReactNode;readonly size:ReactNode;readonly current:ReactNode;readonly extras:ReactNode;readonly actions:ReactNode}
/** Frozen barcodeBody table UI; rows are supplied solely from native SKU/barcode
 * facts. The original Demo cartesian derivation/storage never enters this layer. */
export function ProductBarcodeSourceBody(p:{readonly rows:readonly ProductBarcodeSourceRow[];readonly className:string}){
 return <div className="product-source-ui"><div className="pc-section-line"><h3>当前规格条码</h3></div><div className={`pc-detail-table pc-barcode-table ${p.className}`} tabIndex={0} aria-label="商品规格条码，可横向滚动"><table><thead><tr>{['颜色','版型','尺码','当前主条码','历史 / 兼容条码','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{p.rows.map(row=><tr key={row.key} data-barcode-sku={row.key} data-sku-id={row.skuId}><td>{row.color}</td><td>{row.fit}</td><td>{row.size}</td><td className="pc-barcode-code">{row.current}</td><td className="pc-barcode-code">{row.extras}</td><td>{row.actions}</td></tr>)}</tbody></table>{!p.rows.length&&<div className="empty">当前没有可展示的 SKU 条码</div>}</div></div>;
}

/** Shared original preview: readonly uses the existing guarded page reader;
 * maintenance keeps its explicit access-failure owner callback. */
interface BarcodeSchemePreviewProps {readonly scope:ReadScope;readonly schemeId:string;readonly reader:Pick<DictionaryBrowserReader,'readBarcodeScheme'>;readonly onAccessFailure?:(error:HttpQueryError)=>void;readonly close:()=>void}
export function ProductBarcodeSchemePreview(p:BarcodeSchemePreviewProps){
 const [query,setQuery]=useState<LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>|null>(null);
 useEffect(()=>{const next=new LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>({scope:p.scope,execute:async read=>{try{const value=await p.reader.readBarcodeScheme(read);if(value===null)return null;const result=validateDictionaryScheme(value);if(result.id!==read.parameters.schemeId)throw new Error('Invalid scheme target');return result;}catch(error){if(p.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden')){next.dispose();p.onAccessFailure?.(error);}throw error;}}});setQuery(next);return()=>next.dispose();},[p.scope,p.reader,p.schemeId]);
 return query&&p.scope.active?<ProductBarcodeSchemeDetail {...p} query={query}/>:null;
}
function ProductBarcodeSchemeDetail(p:BarcodeSchemePreviewProps&{readonly query:LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>}){
 const snapshot=useSyncExternalStore(p.query.subscribe,p.query.getSnapshot,p.query.getSnapshot),data=snapshot.phase==='success'?snapshot.success?.data:null;
 const run=()=>{if(p.scope.active)void p.query.run({schemeId:p.schemeId});};
 return <StandardOverlay presentation="catalogue" title="查看条码方案" closeLabel="关闭查看条码方案" className="pc-arco-modal product-source-modal product-source-ui product-barcode-scheme-modal" width={640} close={p.close} onReady={()=>{if(p.query.getSnapshot().phase==='idle')run();}} footer={close=><div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
  <ProductReadState phase={snapshot.phase} retry={run} cancel={()=>p.query.cancel()} cancelled={snapshot.phase==='idle'} empty={snapshot.phase==='success'&&data===null}>
   {data&&<dl className="pc-rule"><dt>方案名称</dt><dd>{data.name}</dd><dt>条码类型</dt><dd>{data.barcodeType}</dd><dt>编码规则</dt><dd>{data.ruleDescription}</dd><dt>总长度</dt><dd>{data.codeLength===null?'未提供':`${data.codeLength} 位`}</dd></dl>}
  </ProductReadState>
 </StandardOverlay>;
}
