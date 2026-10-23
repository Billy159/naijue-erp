import type { ReactNode } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import type { ProductBarcodeDetails, ProductBarcodePage } from '../../../../packages/application/src/product-details-query-ports.ts';
import type { ProductSpecifications } from '../inventory/product-contracts.ts';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { useProductRead } from '../inventory/product-tab-state.tsx';
import { productBarcodesResponse } from './product-page-validation.ts';
import { ProductPagedRead, type ProductPageTabProps } from './product-page-view.tsx';

export function View({ scope, reader }: ProductPageTabProps) {
  return <ProductPagedRead<ProductBarcodePage> scope={scope} read={reader.barcodes!.read} validate={productBarcodesResponse} label="商品条码分页">{data => <>
    <div className="pc-barcode-tools product-barcode-tools"><div className="field"><span className="pc-field-caption">主条码默认方案</span><div id="pc-detail-scheme" className="pc-arco-host"><span className="pc-read-value">未提供</span></div></div><button type="button" className="btn ghost" disabled>查看方案</button></div>
    {data.items.length && reader.specs ? <LabeledPage key={`${data.productId}:${data.version}:${data.page}:${data.pageSize}`} scope={scope} reader={reader} data={data} />
      : <BarcodeGroups data={data} specifications={null} />}
  </>}</ProductPagedRead>;
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
