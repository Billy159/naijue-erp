import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CurrentFormProduct } from '../../../../packages/application/src/current-form-ports.ts';
import { UIButton } from '../components/standard-controls.tsx';
import { ProductCandidatePreview } from '../components/product-candidate-preview.tsx';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { guardedProductPageReader } from '../products/product-page-reader.ts';
import type { ProductFullPageConfiguration } from '../products/product-page-contracts.ts';
export interface ProductFinderPreviewCapability { readonly configuration: ProductFullPageConfiguration; readonly onUnauthorized?: () => void }
import './product-finder.css';
export interface CurrentProductFinderHandle { key(key: string): void }
interface Props {
  readonly products: readonly CurrentFormProduct[]; readonly phase: 'loading' | 'ready' | 'error';
  readonly search: string; readonly page: number; readonly exactTotal: bigint | null;
  readonly scope?: ReadScope; readonly capability?: ProductFinderPreviewCapability;
  readonly select: (id: string) => void; readonly close: (restoreFocus?: boolean) => void;
  readonly turnPage: (page: number) => void; readonly retry: () => void;
}
function Highlight({ text, query }: { text: string; query: string }) {
  const start = text.toLowerCase().indexOf(query.trim().toLowerCase()), length = query.trim().length;
  return start < 0 || !length ? <>{text}</> : <>{text.slice(0, start)}<mark>{text.slice(start, start + length)}</mark>{text.slice(start + length)}</>;
}
function CandidateProductData({ product, scope, capability }: { readonly product: CurrentFormProduct; readonly scope?: ReadScope; readonly capability?: ProductFinderPreviewCapability }) {
  const [owned, setOwned] = useState<{ parent: ReadScope; capability: ProductFinderPreviewCapability; productId: string; scope: ReadScope; reader: ProductReadOnlyReader } | null>(null), [denied, setDenied] = useState(false);
  useEffect(() => {
    const configured = capability?.configuration.reader;
    if (!scope?.active || !capability || !configured?.base || !configured.specs || !configured.images) return;
    let attached = true; const child = new ReadScope(scope.identity, `${scope.routeInstanceId}:sales-finder:${product.id}`, product.id, () => {});
    const abort = () => child.dispose(); scope.signal.addEventListener('abort', abort, { once: true }); setDenied(false);
    const guarded = guardedProductPageReader(child, configured, error => {
      if (!attached) return; setOwned(null); setDenied(true);
      if (error.kind === 'unauthenticated') capability.onUnauthorized?.();
    });
    const reader: ProductReadOnlyReader = { readProductBasics: read => guarded.base!.read(read), readProductSpecifications: read => guarded.specs!.read(read),
      readProductImages: read => guarded.images!.read(read), readProductImage: read => guarded.images!.readImage(read) };
    setOwned({ parent: scope, capability, productId: product.id, scope: child, reader });
    return () => { attached = false; scope.signal.removeEventListener('abort', abort); child.dispose(); };
  }, [scope, capability, product.id]);
  const current = owned && owned.parent === scope && owned.capability === capability && owned.productId === product.id && owned.scope.active ? owned : null;
  if (denied) return <aside className="pf-preview" role="alert">商品资料暂不可读取。</aside>;
  if (current) return <aside className="pf-preview"><ProductCandidatePreview parent={current.scope} productId={product.id} reader={current.reader} /></aside>;
  return <aside className="pf-preview" aria-label="当前候选商品资料"><div className="pf-transfer-title">商品资料</div><div className="pf-transfer-no-photo">图片资料未提供</div><div className="pf-transfer-info">{[['款号', product.code], ['商品名称', product.name], ['颜色', '未提供'], ['商品分类', product.category?.label ?? '未知分类'], ['季节', '未提供'], ['版型', '未提供'], ['供应商', '未提供'], ['零售价', product.retailPrice ?? '未提供']].map(([label, value]) => <span key={label}><small>{label}</small> {value}</span>)}</div></aside>;
}
/** Frozen product-finder.js paint/highlight/key + golden-consistency.css finder
 * structure. Arco Trigger owns positioning in the caller; raw search stays in
 * the original table input. Native pages and exact target reads stay separate. */
export const CurrentProductFinder = forwardRef<CurrentProductFinderHandle, Props>(function CurrentProductFinder(props, ref) {
  const [index, setIndex] = useState(-1), list = useRef<HTMLDivElement>(null);
  useEffect(() => { setIndex(-1); }, [props.search, props.page]);
  const active = props.products[Math.max(0, index)];
  const key = (value: string) => {
    if (value === 'Escape' || value === 'Tab') { props.close(value === 'Escape'); return; }
    if (props.phase !== 'ready') return;
    if (value === 'Enter') { const choice = index >= 0 ? props.products[index] : props.products.length === 1 && props.exactTotal === 1n ? props.products[0] : null; if (choice) props.select(choice.id); return; }
    if ((value === 'ArrowDown' || value === 'ArrowUp') && props.products.length) {
      const next = (index + (value === 'ArrowDown' ? 1 : props.products.length - 1) + props.products.length) % props.products.length;
      setIndex(next); list.current?.querySelectorAll<HTMLElement>('[data-finder-option]')[next]?.scrollIntoView?.({ block: 'nearest' });
    }
  };
  useImperativeHandle(ref, () => ({ key }));
  return <div className="sales-product-finder pf-inventory-style" role="dialog" aria-label="商品候选" onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) { if (event.key !== 'Tab') event.preventDefault(); event.stopPropagation(); key(event.key); } }} onMouseDown={event => event.preventDefault()}>
    <div className="pf-layout"><div className="pf-list" ref={list} role="listbox" aria-label="商品搜索结果">
      <div className="pf-heading"><span>商品款号</span><span>商品名称</span></div>
      {props.phase === 'loading' ? <p role="status">正在查找…</p> : props.phase === 'error' ? <p role="alert">查询失败。<UIButton onClick={props.retry}>重试商品</UIButton></p> : <>
        {props.products.map((product, position) => <UIButton key={product.id} data-finder-option={position} role="option" aria-selected={position === index} tabIndex={-1} title={`${product.code} ${product.name}`} onMouseEnter={() => setIndex(position)} onClick={() => props.select(product.id)}><strong><Highlight text={product.code} query={props.search} /></strong><span><Highlight text={product.name} query={props.search} /></span></UIButton>)}
        {!props.products.length ? <p>没有匹配结果，请继续输入</p> : <small className="pf-result-count">共 {props.exactTotal?.toString()} 项 · 回车或点击确认</small>}
        {props.exactTotal !== null && props.exactTotal > 20n && <div className="pf-pagination"><span>第 {props.page} 页</span><UIButton disabled={props.page <= 1} onClick={() => props.turnPage(props.page - 1)}>上一页</UIButton><UIButton disabled={BigInt(props.page) * 20n >= props.exactTotal} onClick={() => props.turnPage(props.page + 1)}>下一页</UIButton></div>}
      </>}
    </div>{props.phase === 'ready' && active && <CandidateProductData key={active.id} product={active} {...(props.scope ? { scope: props.scope } : {})} {...(props.capability ? { capability: props.capability } : {})} />}</div>
  </div>;
});
