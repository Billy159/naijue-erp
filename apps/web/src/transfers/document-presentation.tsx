import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Trigger } from '@arco-design/web-react';
import type { DictionaryBrowserReader, DictionarySizeGroup } from '../product-settings/size-groups/contracts.ts';
import { validateDictionaryPage, validateDictionarySizeGroup } from '../../../../packages/application/src/dictionary-read-validation.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { UIButton } from '../components/standard-controls.tsx';

export interface TransferSizeGroupCapability {
  readonly id: string; readonly reader: Pick<DictionaryBrowserReader, 'readSizeGroups'>;
  readonly onUnauthorized?: () => void;
}
/** Read-only display axes only. An actual native SKU is still required for every
 * enabled quantity input; a dictionary member never creates a writable cell. */
export function useTransferSizeGroups(parent: ReadScope | undefined, capability: TransferSizeGroupCapability | undefined, requestedIds: readonly string[]) {
  const [state, setState] = useState<{ parent: ReadScope; capability: TransferSizeGroupCapability; phase: 'loading' | 'ready' | 'error'; groups: readonly DictionarySizeGroup[] } | null>(null), [attempt, setAttempt] = useState(0);
  const wanted = [...new Set([...(capability ? [capability.id] : []), ...requestedIds])].sort(), key = wanted.join('|');
  const cache = useRef<{ parent: ReadScope; capability: TransferSizeGroupCapability; values: Map<string, DictionarySizeGroup> } | null>(null);
  useEffect(() => {
    if (!parent?.active || !capability) return;
    const scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:transfer-size-axis:${key}`, capability.id, () => {});
    let attached = true; const abort = () => { scope.dispose(); if (cache.current?.parent === parent) cache.current = null; if (attached) setState(null); }; parent.signal.addEventListener('abort', abort, { once: true });
    const found = cache.current?.parent === parent && cache.current.capability === capability ? new Map(cache.current.values) : new Map<string, DictionarySizeGroup>();
    setState({ parent, capability, phase: 'loading', groups: [...found.values()] });
    void (async () => {
      try {
        wanted.forEach(id => entityId('sizeGroup', id));
        // Existing native dictionary is paged. A finite budget never becomes
        // an implicit first-group/default/UPPER selection or endless catalogue read.
        for (let page = 1; page <= 10 && !wanted.every(id => found.has(id)); page++) {
          const parameters = Object.freeze({ search: '', page, pageSize: 100 as const });
          const result = await capability.reader.readSizeGroups({ parameters, signal: scope.signal, identity: scope.identity, routeInstanceId: scope.routeInstanceId, entityId: capability.id });
          if (!attached || !scope.active || !parent.active) return;
          const data = validateDictionaryPage(result, parameters, validateDictionarySizeGroup);
          for (const group of data.items) if (wanted.includes(group.id)) found.set(group.id, group);
          if (page * 100 >= data.total) break;
        }
        if (!attached || !scope.active || !parent.active) return;
        cache.current = { parent, capability, values: found };
        setState({ parent, capability, phase: wanted.every(id => found.has(id)) ? 'ready' : 'error', groups: [...found.values()] });
      } catch (error) {
        if (!attached || !scope.active || !parent.active) return;
        if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { cache.current = null; found.clear(); if (error.kind === 'unauthenticated') capability.onUnauthorized?.(); }
        setState({ parent, capability, phase: 'error', groups: [...found.values()] });
      }
    })();
    return () => { attached = false; parent.signal.removeEventListener('abort', abort); scope.dispose(); };
  }, [parent, capability, key, attempt]);
  const current = state && state.parent === parent && state.capability === capability && parent?.active ? state : null;
  return { phase: current?.phase ?? 'unavailable', groups: current?.groups ?? [], retry: () => { cache.current = null; setAttempt(value => value + 1); } };
}
export interface TransferDisplaySize { readonly id: string; readonly label: string }
export function TransferMatrixTable({ sizes, children, showHeader = true, className = '', label }: {
  readonly sizes: readonly TransferDisplaySize[]; readonly children: (visible: readonly TransferDisplaySize[]) => ReactNode;
  readonly showHeader?: boolean; readonly className?: string; readonly label: string;
}) {
  const [page, setPage] = useState(0), key = sizes.map(size => size.id).join('|');
  useEffect(() => { setPage(0); }, [key]);
  const maximum = Math.max(0, Math.ceil(sizes.length / 40) - 1), current = Math.min(page, maximum), visible = sizes.slice(current * 40, (current + 1) * 40);
  return <section className={`mx-section ${className}`} style={{ '--mx-table-width': `${592 + visible.length * 56}px` } as React.CSSProperties}>
    {maximum > 0 && <nav aria-label="尺码列范围" className="mx-column-paging"><span>尺码 {current * 40 + 1}–{Math.min(sizes.length, (current + 1) * 40)} / {sizes.length}</span><UIButton disabled={current === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>上一组尺码</UIButton><UIButton disabled={current === maximum} onClick={() => setPage(value => Math.min(maximum, value + 1))}>下一组尺码</UIButton></nav>}
    <table className="mx-table"><caption className="sr-only">{label}</caption><colgroup><col style={{ width: 280 }} /><col style={{ width: 76 }} /><col style={{ width: 88 }} />{visible.map(size => <col key={size.id} style={{ width: 56 }} />)}<col style={{ width: 52 }} /><col style={{ width: 96 }} /></colgroup>
      {showHeader && <thead><tr><th className="mx-product" scope="col">款号／商品名称</th><th className="mx-color" scope="col">颜色</th><th className="mx-fit-col" scope="col">版型</th>{visible.map(size => <th key={size.id} data-size-id={size.id} scope="col" title={size.label}>{size.label}</th>)}<th className="tc-subtotal" scope="col">小计</th><th className="ui-action-cell" scope="col">操作</th></tr></thead>}
      <tbody>{children(visible)}</tbody>
    </table>
  </section>;
}
export function transferDisplayQuantity(rows: readonly { readonly quantity: string }[]): string {
  return rows.every(row => /^(?:0|[1-9]\d{0,18})$/.test(row.quantity)) ? rows.reduce((sum, row) => sum + BigInt(row.quantity), 0n).toString() : '待校验';
}
function TransferProposalSummaryTags({ items }: { readonly items: readonly { readonly id: string; readonly label: string; readonly count: string }[] }) {
  const host = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), id = useId();
  const key = JSON.stringify(items), rest = items.slice(3);
  const [state, setState] = useState({ key, open: false }), visible = rest.length > 0 && state.key === key && state.open;
  const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ node: HTMLDivElement; key: string; left: number; top: number } | null>(null);
  const attachPopup = useCallback((node: HTMLDivElement | null) => { popup.current = node; setPopupNode(node); }, []);
  useLayoutEffect(() => {
    const view = popupNode?.ownerDocument.defaultView;
    if (!popupNode || !view) { setPlacement(null); return; }
    const place = () => {
      if (!popupNode.isConnected || !opener.current?.isConnected) return;
      const anchor = opener.current.getBoundingClientRect();
      // Frozen transfer-golden.js clamps below the anchor into the viewport;
      // it deliberately allows overlap near the bottom instead of flipping above.
      const left = Math.max(8, Math.min(anchor.left, view.innerWidth - 240));
      const top = Math.max(8, Math.min(anchor.bottom + 4, view.innerHeight - popupNode.offsetHeight - 8));
      setPlacement(previous => previous?.node === popupNode && previous.key === key && previous.left === left && previous.top === top ? previous : { node: popupNode, key, left, top });
    };
    place(); const frame = view.requestAnimationFrame(place);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(popupNode); view.addEventListener('resize', place);
    return () => { view.cancelAnimationFrame(frame); observer?.disconnect(); view.removeEventListener('resize', place); };
  }, [popupNode, key]);
  useEffect(() => { setState({ key, open: false }); }, [key]);
  useEffect(() => {
    if (!visible) return;
    const doc = host.current?.ownerDocument;
    const closeOnScroll = (event: Event) => { if (!(event.target instanceof Node && popup.current?.contains(event.target))) setState({ key, open: false }); };
    doc?.addEventListener('scroll', closeOnScroll, true);
    return () => doc?.removeEventListener('scroll', closeOnScroll, true);
  }, [visible, key]);
  const escape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!visible || event.nativeEvent.isComposing || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); setState({ key, open: false }); opener.current?.focus({ preventScroll: true });
  };
  const positioned = placement?.node === popupNode && placement?.key === key ? placement : null;
  return <div ref={host} className="tc-product-tags transfer-summary-tags" aria-label="商品信息">{items.slice(0, 3).map(item => <span className="tc-product-tag" key={item.id} title={`${item.label} ${item.count}`}>{item.label} {item.count}</span>)}{rest.length > 0 && <Trigger trigger="click" position="bl" popupAlign={{ bottom: 4 }} duration={0} autoFitPosition={false} unmountOnExit escToClose style={{ position: 'fixed', zIndex: 100, left: positioned ? `${positioned.left}px` : undefined, top: positioned ? `${positioned.top}px` : undefined, visibility: positioned ? 'visible' : 'hidden' }} popupVisible={visible} onVisibleChange={open => setState({ key, open })} getPopupContainer={node => node.closest('.demo-ui') ?? node.closest('.transfer-proposal-editor') ?? host.current ?? node} popupStyle={{ width: 220, maxWidth: 'calc(100vw - 16px)' }} popup={() => <div ref={attachPopup} id={id} className="tc-more-tags-pop transfer-summary-more" role="dialog" aria-label="其余商品信息" tabIndex={-1} onKeyDown={escape}><strong>其余商品信息</strong>{rest.map(item => <span key={item.id}>{item.label}<b>{item.count}</b></span>)}</div>}><UIButton ref={opener} className="tc-product-tag tc-more-tag" aria-haspopup="dialog" aria-expanded={visible} aria-controls={id} title={rest.map(item => `${item.label} ${item.count}`).join(' · ')} onKeyDown={escape}>+{rest.length} 更多</UIButton></Trigger>}</div>;
}
export function TransferDocumentSummary({ lines, presentation }: { readonly lines: readonly { readonly productId: string | undefined; readonly quantity: string; readonly category?: { readonly id: string; readonly label: string | null } }[]; readonly presentation?: 'proposal' }) {
  const categories = new Map<string, { label: string; rows: typeof lines[number][] }>();
  for (const line of lines) {
    const id = line.category?.id ?? 'unknown', label = line.category?.label ?? '未知分类', category = categories.get(id) ?? { label, rows: [] };
    if (category.label !== label) category.label = '未知分类'; category.rows.push(line); categories.set(id, category);
  }
  if (presentation === 'proposal') {
    const facts = new Map<string, string>(), conflicts = new Set<string>();
    for (const line of lines) if (line.productId) {
      const fact = JSON.stringify([line.category?.id ?? null, line.category?.label ?? null]);
      if (facts.has(line.productId) && facts.get(line.productId) !== fact) conflicts.add(line.productId);
      facts.set(line.productId, fact);
    }
    const groups = new Map<string, { label: string; rows: typeof lines[number][] }>();
    for (const line of lines) {
      const conflict = !!line.productId && conflicts.has(line.productId), id = conflict ? 'unknown' : line.category?.id ?? 'unknown', label = conflict ? '未知分类' : line.category?.label ?? '未知分类', group = groups.get(id) ?? { label, rows: [] };
      if (group.label !== label) group.label = '未知分类'; group.rows.push(line); groups.set(id, group);
    }
    return <footer className="tc-foot tc-gold-footer transfer-document-summary transfer-document-summary-proposal"><strong>{lines.some(line => !line.productId) ? '款数待读取' : `${new Set(lines.map(line => line.productId)).size}款`}</strong><strong>数量 {transferDisplayQuantity(lines)}</strong><TransferProposalSummaryTags items={[...groups].map(([id, group]) => ({ id, label: group.label, count: group.rows.some(line => !line.productId) ? '款数待读取' : String(new Set(group.rows.map(line => line.productId)).size) }))} /></footer>;
  }
  return <footer className="tc-foot tc-gold-footer transfer-document-summary"><strong>{lines.some(line => !line.productId) ? '款数待读取' : `${new Set(lines.map(line => line.productId)).size} 款`} · 数量 {transferDisplayQuantity(lines)}</strong><div>{[...categories].map(([id, group]) => <span className="tc-product-tag" key={id}>{group.label} {transferDisplayQuantity(group.rows)}</span>)}</div></footer>;
}
