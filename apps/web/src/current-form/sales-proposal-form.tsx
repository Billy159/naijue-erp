import { useDocumentLeave } from '../demo-presentation/document-navigation.tsx';
/** Page DOM copied from frozen b8bcfe3 sales-current.js editor/lineTable/entryRow.
 * Final three-row funds DOM is real-data-bridge.mjs fundsField/paymentRow.
 * Native inputs keep raw text; React owns lifecycle and the current native API session only. */
import { CurrentProductFinder, type CurrentProductFinderHandle } from './product-finder.tsx';
import { SalesDocumentColumns, SalesDocumentColumnHead, SalesDocumentSummary, SalesProductPresentation, salesPaymentBalance, salesPaymentKind, salesDisplayedDiscount, type SalesProductCapability } from '../sales/document-presentation.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { Trigger, type TriggerProps } from '@arco-design/web-react';
import { SourceDocumentDialog } from '../components/standard-overlay.tsx';
import { DocumentScan } from '../components/document-scan.tsx';
import type { DocumentScanController } from '../components/document-scan-controller.ts';
import { UIDate } from '../components/standard-controls.tsx';
import { forwardRef, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { SalesProposalSession, salesProposalMoney, salesProposalLineSelection, type SalesProposalEntry, type SalesProposalLine, type SalesProposalPicker, type SalesProposalSnapshot } from './sales-proposal.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormProduct, CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import { salesBusinessMode, salesBusinessType, type SalesBusinessMode } from './sales-business-mode.ts';
import { DemoSingleSelectAction } from '../demo-controls/single-select-action.tsx';
import '../demo-controls/single-select.css';
import '../sales/detail.css';
import './sales-proposal.css';
const labels: Record<SalesProposalPicker, string> = { hall: '营业厅', customer: '客户', salesperson: '营业员', warehouse: '出库仓', paymentMethod: '付款方式', paymentAccount: '资金账户', product: '商品', sku: '实际规格' };
function cents(value: string): bigint {
  if (!/^\d{1,100}(?:\.\d{1,2})?$/.test(value.trim())) throw Error();
  const [whole, fraction = ''] = value.trim().split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function paymentAmount(raw: string, direction: 'RECEIVE' | 'REFUND'): string {
  const sign = direction === 'REFUND' ? '-' : '';
  try { return sign + salesInputMoney(cents(raw).toString()); } catch { return sign + raw; }
}
type SalesPriceRow = Pick<SalesProposalLine, 'product' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift'>;
function linePrice(row: SalesPriceRow): string | null {
  try {
    if (row.isGift) return '0.00';
    if (row.pricingRule === 'UNIT_PRICE') return salesInputMoney(cents(row.dealPrice).toString());
    if (row.product.retailPrice === null || !/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim())) return null;
    const [whole, fraction = '0'] = row.discount.trim().split('.');
    return salesInputMoney(discountUnitPrice(minorAmount(cents(row.product.retailPrice).toString()), Number(whole) * 10 + Number(fraction)).toString());
  } catch { return null; }
}
function previewAmount(row: SalesPriceRow & Pick<SalesProposalLine, 'quantity'>): string {
  try { if (!/^-?[1-9]\d{0,18}$/.test(row.quantity)) throw Error(); const price = linePrice(row); return price === null ? '待填写' : salesInputMoney((BigInt(row.quantity) * cents(price)).toString()); } catch { return '待填写'; }
}
function displayedDiscount(row: SalesPriceRow): string {
  if (row.pricingRule === 'DISCOUNT') return row.discount;
  try {
    if (row.isGift || row.product.retailPrice === null) return '';
    const reference = cents(row.product.retailPrice), price = cents(row.dealPrice);
    if (reference === 0n) return '';
    return salesDisplayedDiscount(reference.toString(), price.toString());
  } catch { return ''; }
}
function quantitySummary(rows: readonly SalesProposalLine[], absolute = false): string {
  if (rows.some(row => !/^-?[1-9]\d{0,18}$/.test(row.quantity))) return '待校验';
  return rows.reduce((sum, row) => { const n = BigInt(row.quantity); return sum + (absolute && n < 0n ? -n : n); }, 0n).toString();
}
type SpecKind = 'color' | 'fit' | 'size';
/** Frozen sales-current.js modal()/close(): route-owned native top layer. */
function SalesModeConfirmation({ cancel, confirm }: { readonly cancel: () => void; readonly confirm: () => void }) {
  return <SourceDocumentDialog className="sale-source-dialog" title="切换业务类型" label="切换业务类型" closeLabel="关闭业务类型确认" close={cancel} footer={<><button type="button" className="btn" onClick={cancel}>取消</button><button type="button" className="btn primary" onClick={confirm}>确定</button></>}>
    <div className="sale-dialog-body"><p>本单数量将统一改为所选类型的默认方向，请核对退回与换出商品。</p></div>
  </SourceDocumentDialog>;
}
function signedQuantity(raw: string, direction: string): string { return (direction === 'IN' ? '-' : '') + raw.replace(/^[+-]/, ''); }
/** Frozen direction(select) rendered by unified-single-select nativeData. */
function SalesRowDirection({ label, quantity, disabled, change }: { readonly label: string; readonly quantity: string; readonly disabled: boolean; readonly change: (direction: string) => void }) {
  const [open, setOpen] = useState(false), [popupWidth, setPopupWidth] = useState(300);
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current, view = element?.ownerDocument.defaultView; if (!open || !element || !view) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setPopupWidth(Math.min(Math.max(bounds.width, 300), Math.max(180, view.innerWidth - bounds.left - 12))); };
    measure(); view.addEventListener('resize', measure); return () => view.removeEventListener('resize', measure);
  }, [open]);
  return <div ref={host} className="sale-line-direction"><DemoSingleSelectAction presentation="tag" label={label} value={quantity.startsWith('-') ? 'IN' : 'OUT'} options={[{ value: 'IN', label: '退回 −' }, { value: 'OUT', label: '换出 ＋' }]} popupWidth={popupWidth} disabled={disabled} open={open} onOpenChange={setOpen} onChange={change} /></div>;
}
/** Same guarded Portal reattachment used by the shared native Select action.
 * A replacement row may first mount already-open under StrictMode replay. */
// Trigger moves a disabled native button's class onto a generated span. Keep
// the frozen button as the actual leaf; forward Trigger's events and node ref.
const SalesCandidateButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function SalesCandidateButton(props, ref) {
  return <button {...props} ref={ref} />;
});
function SalesCandidateTrigger({ sourceSpecAnchor, ...props }: TriggerProps & { readonly sourceSpecAnchor?: () => HTMLElement | null | undefined }) {
  const [mounted, setMounted] = useState(false), [specNode, setSpecNode] = useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ node: HTMLDivElement; left: number; top: number; width: number } | null>(null);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || !props.popupVisible) return;
    let active = true; queueMicrotask(() => { if (active) refresh(); });
    return () => { active = false; };
  }, [mounted, props.popupVisible]);
  useLayoutEffect(() => {
    const box = specNode?.querySelector<HTMLElement>('.sale-spec-menu'), view = specNode?.ownerDocument.defaultView;
    if (!box || !view || !sourceSpecAnchor || !props.popupVisible) return;
    const place = () => {
      const anchor = sourceSpecAnchor(); if (!anchor?.isConnected || !specNode?.isConnected) return;
      // Frozen interaction-common.js specMenu.position: choose the side with
      // more available space, even when the other side could fit the menu.
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > view.innerHeight) { props.onVisibleChange?.(false); return; }
      const width = Math.min(250, view.innerWidth - 16), belowSpace = view.innerHeight - bounds.bottom - 8, aboveSpace = bounds.top - 8;
      const below = belowSpace >= aboveSpace, maximum = Math.max(80, Math.min(288, Math.max(belowSpace, aboveSpace)));
      box.style.maxHeight = `${maximum}px`;
      const options = box.querySelector<HTMLElement>('.mx-spec-menu-options'); if (options) options.style.maxHeight = `${Math.max(44, maximum - 43)}px`;
      const height = Math.min(box.scrollHeight, maximum), left = Math.max(8, Math.min(bounds.left, view.innerWidth - width - 8));
      const top = below ? bounds.bottom + 4 : Math.max(8, bounds.top - height - 4);
      setPlacement(previous => previous?.node === specNode && previous.left === left && previous.top === top && previous.width === width ? previous : { node: specNode, left, top, width });
    };
    place(); const frame = view.requestAnimationFrame(place), observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(box); view.addEventListener('resize', place); specNode.ownerDocument.addEventListener('scroll', place, true);
    return () => { view.cancelAnimationFrame(frame); observer?.disconnect(); view.removeEventListener('resize', place); specNode.ownerDocument.removeEventListener('scroll', place, true); };
  }, [specNode, sourceSpecAnchor, props.popupVisible]);
  const position = placement?.node === specNode ? placement : null;
  return <Trigger {...props} {...(sourceSpecAnchor ? { autoFitPosition: false, autoAlignPopupWidth: false, style: { position: 'fixed', left: position?.left, top: position?.top, visibility: position ? 'visible' : 'hidden' }, popupStyle: { ...props.popupStyle, width: position?.width ?? 250 } } : {})} popupVisible={mounted && !!props.popupVisible} popup={() => sourceSpecAnchor ? <div ref={setSpecNode}>{props.popup?.() ?? null}</div> : props.popup?.() ?? null} />;
}
/** Frozen unified-single-select Choice presentation. Data/selection still belong
 * to the native proposal; only the current bounded page becomes options. */
function SalesReferenceField({ session, picker, visible, label, value, selected, disabled, open, close, clear, account = false }: {
  readonly session: SalesProposalSession; readonly picker: SalesProposalSnapshot['picker']; readonly visible: boolean;
  readonly label: string; readonly value: string; readonly selected: { readonly id: string; readonly name: string; readonly code?: string | null } | null;
  readonly disabled: boolean; readonly open: () => void; readonly close: () => void; readonly clear?: () => void; account?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), [popupWidth, setPopupWidth] = useState(300);
  useLayoutEffect(() => {
    const element = host.current, view = element?.ownerDocument.defaultView;
    if (!element || !view || !visible) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setPopupWidth(Math.min(Math.max(bounds.width, 300), Math.max(180, view.innerWidth - bounds.left - 12))); };
    measure(); view.addEventListener('resize', measure);
    return () => view.removeEventListener('resize', measure);
  }, [visible]);
  const options: { value: string; label: string; disabled?: boolean; groupLabel?: string }[] = visible && picker?.phase === 'ready' ? (picker.result?.items ?? []).map(item => ({ value: item.id as string, label: 'name' in item ? account && 'code' in item && item.code && !item.name.trimStart().startsWith(item.code) ? `${item.code} ${item.name}` : item.name : item.skuCode })) : [];
  const recommendationRows = visible && picker?.phase === 'ready' && picker.kind === 'paymentAccount' && picker.result?.recommendationAvailability === 'AVAILABLE' ? picker.result.items : [];
  if (account && recommendationRows.length && recommendationRows.every(item => 'isRecommended' in item && typeof item.isRecommended === 'boolean') && recommendationRows.some(item => 'isRecommended' in item && item.isRecommended === true)) {
    for (const option of options) {
      const item = recommendationRows.find(item => item.id === option.value)!;
      option.groupLabel = 'isRecommended' in item && item.isRecommended === true ? '推荐' : '全部账户';
    }
  }
  if (selected && !options.some(option => option.value === selected.id)) options.unshift({ value: selected.id, label: account && selected.code && !selected.name.trimStart().startsWith(selected.code) ? `${selected.code} ${selected.name}` : selected.name, disabled: true });
  return <div ref={host} className="sale-reference-field"><DemoSingleSelectAction presentation="flat" label={label} placeholder={value} value={selected?.id ?? ''} options={options} disabled={disabled} open={visible} popupWidth={popupWidth} {...(clear ? { allowClear: true, onClear: clear } : {})}
    loading={visible && picker?.phase === 'loading'} onSearch={text => { if (visible && session.getSnapshot().picker === picker) void session.search(text); }}
    onOpenChange={next => {
      if (next) { if (!visible) open(); return; }
      // The source Select notifies close before onChange. Let the native
      // selection consume this exact candidate snapshot before dismissing it.
      const current = picker; queueMicrotask(() => { if (current && !session.getSnapshot().disposed && session.getSnapshot().picker === current) close(); });
    }}
    onChange={id => { if (visible && session.getSnapshot().picker === picker) void session.select(id); }}
    dropdownRender={menu => <>{picker?.phase === 'error' ? <div className="sale-reference-state" role="alert">读取失败。<button type="button" className="btn" onClick={() => { void session.retry(); }}>重试</button></div> : menu}
      {visible && picker?.phase === 'ready' && picker.result && picker.result.exactTotal > 20n && <div className="sale-reference-pages"><span>第 {picker.page} 页</span><button type="button" className="btn" disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</button><button type="button" className="btn" disabled={BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</button></div>}</>} /></div>;
}
/** One anchored Arco popup for native paged candidates. No second modal picker,
 * no all-catalog fetch and no derived SKU identity. */
function CandidatePopup({ session, picker, spec, selection, choose, close, keyboardRef, scope, capability, getAnchor }: { readonly getAnchor: () => HTMLElement | null | undefined; readonly keyboardRef: React.Ref<CurrentProductFinderHandle>; readonly scope?: ReadScope; readonly capability?: SalesProductCapability;
  session: SalesProposalSession; picker: NonNullable<SalesProposalSnapshot['picker']>;
  spec?: SpecKind; selection?: { color: { id: string } | null; fit: { id: string } | null; size?: { id: string } | null; sku?: { id: string } | null };
  choose: (id: string) => void; close: (restoreFocus?: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (picker.kind === 'product') return;
    const element = host.current; if (!element) return;
    const doc = element.ownerDocument, previous = doc.activeElement;
    // Trigger can attach its portal after this child's layout effect. Focus
    // only the connected layer, and never steal a subsequent user focus move.
    const frame = requestAnimationFrame(() => {
      const active = doc.activeElement;
      if (!element.isConnected || element.contains(active) || active !== previous && active !== doc.body && active?.isConnected) return;
      (element.querySelector<HTMLElement>('[aria-selected="true"]') ?? element.querySelector<HTMLElement>('input,button:not(:disabled)') ?? element).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [picker.kind, picker.phase, picker.page]);
  if (picker.kind === 'product') return <CurrentProductFinder getAnchor={getAnchor} ref={keyboardRef} products={(picker.result?.items ?? []) as readonly CurrentFormProduct[]} phase={picker.phase} search={picker.search} page={picker.page} exactTotal={picker.result?.exactTotal ?? null} {...(scope ? { scope } : {})} {...(capability ? { capability } : {})} select={choose} close={close} turnPage={page => { void session.page(page); }} retry={() => { void session.retry(); }} />;
  let options = (picker.result?.items ?? []).map(item => ({ id: item.id as string, text: 'name' in item ? `${'code' in item && item.code ? `${item.code} · ` : ''}${item.name}` : (item as CurrentFormSku).skuCode }));
  if (spec) {
    const rows = picker.specSkus ?? (picker.result?.items ?? []) as readonly CurrentFormSku[];
    const matching = rows.filter(row => spec === 'color' || row.colorId === selection?.color?.id && (spec === 'fit' || row.fitId === selection?.fit?.id));
    options = matching.map(row => ({ id: spec === 'color' ? row.colorId : spec === 'fit' ? row.fitId : row.sizeId, text: spec === 'color' ? row.colorName : spec === 'fit' ? row.fitName : row.sizeName }));
    options = options.filter((item, index) => options.findIndex(other => other.id === item.id) === index);
  }
  const sizeGroups = spec === 'size' ? session.getSnapshot().sizeGroups.groups : [];
  const selected = spec === 'color' ? selection?.color?.id : spec === 'fit' ? selection?.fit?.id : selection?.size?.id ?? selection?.sku?.id;
  return <div ref={host} className={`sales-inline-candidates${spec ? ' sale-spec-menu mx-spec-menu' : ''}`} role="dialog" aria-label={`${spec ? { color: '颜色', fit: '版型', size: '尺码' }[spec] : labels[picker.kind]}候选`} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const nodes = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-candidate-option]') ?? []), current = nodes.indexOf(event.target as HTMLElement);
      if (nodes.length) { event.preventDefault(); nodes[(current + (event.key === 'ArrowDown' ? 1 : nodes.length - 1) + nodes.length) % nodes.length]?.focus(); }
    }
  }}>
    {spec && <div className="mx-spec-menu-head">选择{{ color: '颜色', fit: '版型', size: '尺码' }[spec]}<span>{spec === 'size' && sizeGroups.length ? sizeGroups.reduce((sum, group) => sum + group.sizes.length, 0) : options.length} 项</span></div>}
    <div className={`sales-inline-options${spec ? ' mx-spec-menu-options' : ''}`} {...(spec ? { role: 'listbox', 'aria-label': `可选${{ color: '颜色', fit: '版型', size: '尺码' }[spec]}` } : {})}>{picker.phase === 'loading' ? <p role="status">正在读取…</p> : picker.phase === 'error' ? <p role="alert">读取失败。<button type="button" className="btn" onClick={() => { void session.retry(); }}>重试</button></p> : <>
      {sizeGroups.length ? sizeGroups.map(group => <div role="group" aria-label={group.name} data-size-group={group.id} key={group.id}>{group.sizes.map(size => <button type="button" className="btn" data-candidate-option data-mx-spec-option={size.id} role="option" aria-selected={size.id === selected} key={size.id} onClick={() => choose(size.id)}><span>{size.name}</span>{size.id === selected && <span aria-hidden="true">✓</span>}</button>)}</div>) : options.map(option => <button className="btn" key={option.id} data-candidate-option {...(spec ? { 'data-mx-spec-option': option.id } : {})} {...(spec ? { role: 'option', 'aria-selected': option.id === selected } : {})} type="button" onClick={() => choose(option.id)}><span>{option.text}</span>{spec && option.id === selected && <span aria-hidden="true">✓</span>}</button>)}
      {(sizeGroups.length ? sizeGroups.every(group => !group.sizes.length) : !options.length) && <p>{spec === 'size' ? '本组暂无可用尺码' : '本页无匹配项'}{picker.result && picker.result.exactTotal > 20n ? '，可翻页继续选择' : ''}</p>}
    </>}</div>
    {picker.phase === 'ready' && picker.result && !spec && picker.result.exactTotal > 20n && <footer><span>第 {picker.page} 页 / 共 {picker.result?.exactTotal.toString()} 个{spec ? '实际规格' : '候选'}</span><button type="button" className="btn" disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</button><button type="button" className="btn" disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</button></footer>}
  </div>;
}
export function SalesProposalForm({ session, close, preparation, scope, product: productCapability, saved, navigationLeave }: { readonly navigationLeave?: { readonly canDiscard: boolean; readonly discard: () => boolean }; readonly scope?: ReadScope; readonly product?: SalesProductCapability; readonly session: SalesProposalSession; readonly close: () => void; readonly saved?: { readonly number: string; readonly actions: ReactNode; readonly feedback?: ReactNode }; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useDocumentLeave({ dirty: state.dirty || !!state.lineEdit, canDiscard: navigationLeave?.canDiscard ?? !preparation?.preparing, saved: !!saved, discard: navigationLeave?.discard ?? (() => session.reset(true)) });
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null), [pendingMode, setPendingMode] = useState<SalesBusinessMode | null>(null);
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const businessField = useRef<HTMLLabelElement>(null), [businessPopupWidth, setBusinessPopupWidth] = useState(300);
  const modeToConfirm = useRef<SalesBusinessMode | null>(null);
  const [scanner, setScanner] = useState<{ controller: DocumentScanController; direction: 'IN' | 'OUT' } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [zeroLine, setZeroLine] = useState<string | null>(null), [focusedPayment, setFocusedPayment] = useState<number | null>(null);
  const formRef = useRef<HTMLElement>(null), triggerRef = useRef<HTMLElement | null>(null);
  const productKeys = useRef(new Map<string, CurrentProductFinderHandle>());
  useLayoutEffect(() => {
    const element = businessField.current, view = element?.ownerDocument.defaultView;
    if (!element || !view || !businessMenuOpen || state.disposed) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setBusinessPopupWidth(Math.min(Math.max(bounds.width, 300), Math.max(180, view.innerWidth - bounds.left - 12))); };
    measure(); view.addEventListener('resize', measure);
    return () => view.removeEventListener('resize', measure);
  }, [businessMenuOpen, state.disposed]);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker } = state, combined = draft.businessType !== 'SALE', pricingLines = session.pricingLines;
  // Frozen chooseEntry adds selected work to doc.lines; an unselected query
  // stays outside it. SAVE readiness still uses the strict session projection.
  const displayedLines = [...draft.lines.map(row => state.lineEdit?.original === row ? state.lineEdit : row),
    ...Object.values(state.entries).flat().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .flatMap(entry => entry.product ? [{ ...entry, product: entry.product }] : [])];
  const displayedType = salesBusinessType(salesBusinessMode(draft.businessType), displayedLines.map(row => row.quantity)), totals = salesProposalMoney({ ...draft, businessType: displayedType, lines: displayedLines });
  const pendingPricing = displayedLines.filter(row => linePrice(row) === null).length;
  const restorePickerFocus = () => {
    const live = triggerRef.current?.isConnected ? triggerRef.current : Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-entry-control]') ?? []).find(node => node.dataset.entryControl === anchor);
    live?.focus({ preventScroll: true });
  };
  const dismissPicker = (restore = false) => { session.closePicker(); setAnchor(null); if (restore) restorePickerFocus(); };
  const candidate = (id: string, label: string, value: ReactNode, open: () => void, disabled = false, spec?: SpecKind, selection?: { color: { id: string } | null; fit: { id: string } | null; size?: { id: string } | null; sku?: { id: string } | null }, input?: { value: string; change: (value: string) => void; placeholder: string; openUsesInputValue?: boolean }) => {
    const visible = anchor === id && !!picker;
    const show = (target?: HTMLElement) => { if (disabled) return; if (target) triggerRef.current = target; setAnchor(id); open(); };
    const keyboard = (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (visible && picker?.kind === 'product' && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
        if (event.key !== 'Tab') event.preventDefault(); event.stopPropagation();
        const handler = productKeys.current.get(id);
        if (handler) handler.key(event.key); else if (event.key === 'Escape') dismissPicker(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') { if (input && event.key === ' ') return; event.preventDefault(); show(event.currentTarget); }
    };
    const getAnchor = () => Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-entry-control]') ?? []).find(node => node.dataset.entryControl === id) ?? (triggerRef.current?.isConnected ? triggerRef.current : null);
    return <SalesCandidateTrigger {...(spec ? { sourceSpecAnchor: getAnchor } : {})} getPopupContainer={node => node.closest('.demo-ui') ?? formRef.current ?? node.parentElement ?? node} trigger="click" position="bl" {...(spec ? { popupStyle: { width: 250, maxWidth: 'calc(100vw - 16px)' } } : {})} popupVisible={visible} escToClose updateOnScroll autoFitPosition unmountOnExit
      onVisibleChange={next => { if (next) { if (!visible) show(); } else if (visible) dismissPicker(); }}
      popup={() => picker && visible ? <CandidatePopup getAnchor={getAnchor} session={session} picker={picker} keyboardRef={handle => { if (handle) productKeys.current.set(id, handle); else productKeys.current.delete(id); }} {...(scope ? { scope } : {})} {...(productCapability ? { capability: productCapability } : {})} {...(spec ? { spec } : {})} {...(selection ? { selection } : {})} close={restore => dismissPicker(restore ?? true)} choose={selected => {
        if (session.getSnapshot().picker !== picker) return;
        if (spec) { session.selectSpec(spec, selected); setAnchor(null); restorePickerFocus(); }
        else { void session.select(selected).then(() => { if (!session.getSnapshot().picker) { setAnchor(null); restorePickerFocus(); } }); }
      }} /> : <span />}>
      {input ? <input className="sale-product-input" data-entry-control={id} spellCheck={false} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={visible} autoComplete="off" placeholder={input.placeholder} value={input.value} disabled={disabled}
        onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }} onChange={event => { const value = event.currentTarget.value;  triggerRef.current = event.currentTarget; input.change(value); if (!visible) { show(); if (!input.openUsesInputValue) void session.search(value); } else void session.search(value);  }} />
        : <SalesCandidateButton type="button" className={"btn " + (`sale-select-trigger${spec ? ` mx-spec-picker${selection?.[spec === 'size' ? 'size' : spec] ? ' has-value' : ''}` : ''}`)} data-entry-control={id} aria-label={label} aria-haspopup={spec ? 'listbox' : 'dialog'} aria-expanded={visible} disabled={disabled} onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }}><span>{value}</span>{spec ? <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg> : <span aria-hidden="true">⌄</span>}</SalesCandidateButton>}
    </SalesCandidateTrigger>;
  };
  const reference = (id: string, label: string, placeholder: string, selected: { readonly id: string; readonly name: string } | null, open: () => void, disabled = false, clear?: () => void) => <SalesReferenceField session={session} picker={anchor === id ? picker : null} visible={anchor === id && !!picker} label={label} value={placeholder} selected={selected} disabled={disabled} account={id.startsWith('account-')}
    {...(clear ? { clear } : {})} open={() => { setAnchor(id); open(); }} close={() => { if (anchor === id) dismissPicker(); }} />;
  const cancelMode = () => { modeToConfirm.current = null; setPendingMode(null); };
  const chooseMode = (mode: SalesBusinessMode) => {
    if (mode === salesBusinessMode(draft.businessType) || state.lineEdit) return;
    // Frozen chooseEntry already counts a selected, spec-unfinished product as
    // a document line; this session retains that same working state in entries.
    if (draft.lines.length || Object.values(state.entries).flat().some(entry => !!entry.product)) { modeToConfirm.current = mode; setPendingMode(mode); }
    else session.setBusinessMode(mode);
  };
  const discard = (action: 'reset' | 'cancel', confirmed = false) => { const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed); if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); } };
  const completeEntry = (direction: 'IN' | 'OUT', key: string) => {
    const appended = session.appendEntry(direction, key);
    if (appended) requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLInputElement>('[data-entry-empty] .sale-product-input');
      input?.focus({ preventScroll: true }); input?.select();
    });
    return appended;
  };
  const finishIdentity = (key: string, confirmChange: boolean) => {
    if (confirmChange && !session.confirmLineEdit()) return;
    if (!confirmChange) { dismissPicker(); session.cancelLineEdit(); }
    requestAnimationFrame(() => Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-line-identity]') ?? []).find(node => node.dataset.lineIdentity === key)?.focus({ preventScroll: true }));
  };
  const save = () => { if (!session.hasSpecificationInputs && !session.flushEntries()) return; const row = session.pricingLines?.find(row => !row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00'); if (row) setZeroLine(row.key); else preparation?.save(); };
  // Frozen businessType='退货/换货' uses entrySections' one-table path.
  // Native RETURN/EXCHANGE stay internal; row controls edit explicit signs.
  const sections = [{ key: 'OUT' as const, title: '商品明细', rows: draft.lines }];
  const entryDirection = combined ? 'IN' : 'OUT';
  const pendingRows = (['IN', 'OUT'] as const).flatMap(direction => state.entries[direction].filter(entry => entry.product || entry.query.trim()).map(entry => ({ direction, entry }))).sort((a, b) => a.entry.order! - b.entry.order!);
  const entryRows: { readonly direction: 'IN' | 'OUT'; readonly entry: SalesProposalEntry }[] = [...pendingRows, { direction: entryDirection, entry: state.entries[entryDirection].find(entry => !entry.product && !entry.query.trim())! }];
  const paymentRows = draft.settlements.length ? draft.settlements : [{ key: null, method: null, account: null, direction: 'RECEIVE' as const, amount: '' }];
  const zero = pricingLines?.find(row => row.key === zeroLine);
  const confirmZero = () => {
    if (!zero) return;
    if (state.lineEdit?.key === zero.key) session.updateLineEdit({ zeroConfirmed: true });
    else if (draft.lines.some(row => row.key === zero.key)) session.updateLine(zero.key, { zeroConfirmed: true });
    else for (const direction of ['IN', 'OUT'] as const) if (state.entries[direction].some(row => row.key === zero.key)) session.updateEntry(direction, { zeroConfirmed: true }, zero.key);
    setZeroLine(null);
  };
  return <SalesProductPresentation {...(scope ? { scope } : {})} {...(productCapability ? { capability: productCapability } : {})}>{openProduct => <section ref={formRef} aria-label={saved ? '销货单编辑' : '新增销售草稿'} className="tc-workbench tc-editor sale-workbench sale-editor sales-proposal-editor" onKeyDown={event => {
    if (event.key === 'Escape' && state.lineEdit && !picker) { event.preventDefault(); finishIdentity(state.lineEdit.key, false); }
  }}>
    <div className="tc-head sale-head"><h1>{saved ? '编辑销货单' : '新增销货单'}</h1><span className="tc-status doc-pending">未审核</span><span id="sale-save-state" className="sale-muted">· {state.dirty ? '有未保存修改' : saved ? '已保存' : '未保存'}</span><div className="actions">
      <button type="button" className="btn" data-sale="list" onClick={() => saved ? close() : discard('cancel')}>返回列表</button><button type="button" className="btn" data-sale="save" disabled={!preparation || preparation.preparing || !!state.lineEdit && !session.hasSpecificationInputs || !!pendingMode} onClick={save}>保存</button>
      {saved ? saved.actions : ['审核', '导出', '打印'].map(label => <button type="button" className="btn" disabled key={label} title="请先保存单据">{label}</button>)}
    </div></div>
    {saved?.feedback}
    <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      <label className="tc-gold-field sale-date-field"><span className="sale-field-label">单据日期 <span className="ui-required">*</span></span><input type="hidden" data-sale-field="date" value={draft.businessDate} /><span className="tc-arco-date-host" data-sales-date="document"><UIDate aria-label="单据日期" value={draft.businessDate} onChange={value => session.setHeader({ businessDate: value })} /></span></label>
      <label ref={businessField} className="tc-gold-field"><span className="sale-field-label">业务类型 <em>*</em></span><DemoSingleSelectAction presentation="flat" label="业务类型" disabled={!!state.lineEdit} value={salesBusinessMode(draft.businessType)} options={[{ value: 'SALE', label: '销售' }, { value: 'RETURN_EXCHANGE', label: '退货/换货' }]} popupWidth={businessPopupWidth} open={businessMenuOpen} onOpenChange={open => { if (open) dismissPicker(); setBusinessMenuOpen(open); }} onChange={value => { setBusinessMenuOpen(false); chooseMode(value as SalesBusinessMode); }} /></label>
      {(['hall', 'salesperson', 'customer', 'warehouse'] as const).map(kind => <label className="tc-gold-field" key={kind}><span className="sale-field-label">{labels[kind]}{kind !== 'salesperson' && <span className="ui-required"> *</span>}</span>{reference(kind, `选择${labels[kind]}`, `请选择${labels[kind]}`, draft[kind], () => { void session.openPicker(kind); }, !!state.lineEdit || kind !== 'hall' && !draft.hall, kind === 'salesperson' && draft.salesperson ? () => session.clearSalesperson() : undefined)}</label>)}
      <label className="tc-gold-field tc-gold-meta sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">{saved?.number ?? '保存后生成'}</strong></label>
      <label className="tc-gold-field sale-discount-field"><span className="sale-field-label">整单优惠 / 抹零</span>{combined ? <span className="sale-read-value" /> : <input data-document-adjustment aria-label="整单优惠" inputMode="decimal" value={draft.orderDiscount} onChange={event => { const value = event.currentTarget.value; return session.setHeader({ orderDiscount: value }); }} />}</label>
      <label className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value" data-sale-due>{totals ? `${totals.netDueMinor.startsWith('-') ? '-¥' : '¥'}${salesInputMoney(totals.netDueMinor.replace(/^-/, ''))}` : '待填写'}</strong></label>
      <div className="tc-gold-field sale-payment-field" data-funds-field aria-label="本单收退明细"><span className="sale-field-label">收款</span><div className="sale-payment-rows">
        {paymentRows.map((row, index) => <div className="sale-payment-row" data-funds-row={index} key={index === 0 ? 'source-first-funds-row' : row.key!}>
          {reference(`method-${index}`, `付款方式 ${index + 1}`, '支付方式', row.method, () => { void session.openPaymentPicker(row.key, 'paymentMethod'); }, !draft.hall || !!state.lineEdit, row.key && paymentRows.length === 1 ? () => { dismissPicker(); session.removeSettlement(row.key!); } : undefined)}
          {reference(`account-${index}`, `资金账户 ${index + 1}`, '资金账户', row.account, () => { void session.openPaymentPicker(row.key, 'paymentAccount'); }, !row.method || !!state.lineEdit)}
          <input data-rf="amount" aria-label={`第${index + 1}笔收款金额`} inputMode="decimal" placeholder="金额" disabled={!draft.hall} value={row.key === null ? salesInputMoney(totals?.netDueMinor ?? '0') : focusedPayment === index ? (row.direction === 'REFUND' ? '-' : '') + row.amount : paymentAmount(row.amount, row.direction)} onFocus={() => setFocusedPayment(index)} onBlur={() => setFocusedPayment(null)} onChange={event => { const value = event.currentTarget.value; return session.updateSignedSettlement(row.key, value); }} />
          <span className="sale-payment-actions">{index === paymentRows.length - 1 && paymentRows.length < 3 && <button type="button" className="btn sale-link" data-rf-add disabled={!draft.hall || !row.method || !row.account || !/^\d+(?:\.\d{1,2})?$/.test(row.amount)} onClick={() => session.addSettlement()}>添加</button>}{row.key && paymentRows.length > 1 && <button type="button" className="btn sale-link" data-rf-remove={index} aria-label={`删除收退 ${index + 1}`} onClick={() => session.removeSettlement(row.key!)}>删除</button>}</span>
        </div>)}
      </div><small data-funds-balance className={`sale-payment-balance ${salesPaymentKind(totals?.netDueMinor ?? null, totals?.settledMinor ?? null, displayedLines.length)}`}>{salesPaymentBalance(totals?.netDueMinor ?? null, totals?.settledMinor ?? null, displayedLines.length)}</small></div>
    </div></div>
    <label className="sale-note-row"><span className="sale-field-label">备注</span><input data-sale-field="note" aria-label="备注" placeholder="输入本单备注（可选）" maxLength={10000} value={draft.note} onChange={event => { const value = event.currentTarget.value; return session.setHeader({ note: value }); }} /></label>
    <div id="sale-error" className="sales-proposal-feedback">{state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <button type="button" className="btn" onClick={preparation.cancel}>{saved ? '取消准备' : '取消新单准备'}</button>}</div>
    {sections.map(section => {
      const active = true;
      return <section className="sale-entry-section" key={section.key} data-business-section="out"><div className="tc-section-head sale-section-head"><strong>{section.title}</strong><div>
        {active && <button type="button" className="btn sale-link" disabled={!session.canScan || preparation?.preparing || !!state.lineEdit} title={session.canScan ? undefined : '请先选择营业厅和仓库'} onClick={() => { dismissPicker(); setScanner({ controller: session.createScanner(section.key), direction: section.key }); }}>扫码录入</button>}
      </div></div><div id="sale-lines" className="sale-lines"><table className="sale-lines-table" aria-label={section.title}><SalesDocumentColumns /><SalesDocumentColumnHead incoming={false} /><tbody>
      {section.rows.map(row => {
        const editing = state.lineEdit?.key === row.key ? state.lineEdit : null, product = editing?.product ?? row.product, selection = salesProposalLineSelection(row);
        const rowLabel = row.sku?.skuCode ?? `${row.product.code} / ${selection.size.name}`;
        const editOpen = (kind: 'product' | 'sku') => { void session.openLinePicker(row.key, kind); };
        const identity = (part: 'product' | SpecKind, value: ReactNode) => !active ? value : <button type="button" className="btn sale-identity-trigger mx-spec-edit" data-line-identity={row.key} aria-label={`修改${part === 'product' ? '商品' : { color: '颜色', fit: '版型', size: '尺码' }[part]} ${rowLabel}`} disabled={!active || !!state.lineEdit} onClick={event => {
          triggerRef.current = event.currentTarget;
          if (!session.beginLineEdit(row.key)) return;
          setAnchor(null);
          requestAnimationFrame(() => { const doc = formRef.current?.ownerDocument; if (doc?.activeElement === doc?.body) formRef.current?.querySelector<HTMLElement>(`[data-entry-control="edit-${row.key}-${part}"]`)?.focus({ preventScroll: true }); }); }}><span className="mx-spec-edit-value">{value}</span><span className="sale-edit-mark mx-spec-edit-mark" aria-hidden="true">改</span></button>;
        const editablePrice = editing ?? row;
        const rawPrice = editablePrice.isGift ? '0.00' : editablePrice.pricingRule === 'DISCOUNT' ? linePrice(editablePrice) ?? '' : editablePrice.dealPrice;
        return <tr key={row.key} className={editing ? 'sale-identity-editing sale-identity-edit mx-replacing mx-inline-replacement' : ''}>
          <td>{editing ? <>{candidate(`edit-${row.key}-product`, '修改商品款号 / 名称', `${product.code} · ${product.name}`, () => editOpen('product'), false, undefined, undefined, { value: anchor === `edit-${row.key}-product` && picker?.kind === 'product' ? picker.search : product.code, change: () => {}, placeholder: '款号 / 名称 · 条码请扫码录入' })}<small className="mx-original-hint">原：{row.sourceSnapshot?.productCode ?? row.product.code} / {row.sourceSnapshot?.colorName ?? selection.color.name} / {row.sourceSnapshot?.fitName ?? selection.fit.name} / {row.sourceSnapshot?.sizeName ?? selection.size.name} · {row.quantity}</small></> : <div className="sale-product-cell">{identity('product', <><strong>{row.sourceSnapshot?.productCode ?? row.product.code}</strong><span className="sale-product-name">{row.sourceSnapshot?.productName ?? row.product.name}</span></>)}{row.isGift && <span className="sale-gift">赠品</span>}</div>}</td>
          {(['color', 'fit', 'size'] as const).map(kind => <td key={kind}>{editing ? candidate(`edit-${row.key}-${kind}`, `修改${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, kind === 'color' ? editing.color?.name ?? '颜色' : kind === 'fit' ? editing.fit?.name ?? '版型' : editing.size?.name ?? editing.sku?.sizeName ?? '尺码', () => editOpen('sku'), kind === 'fit' && !editing.color || kind === 'size' && (!editing.color || !editing.fit), kind, editing) : identity(kind, kind === 'color' ? row.sourceSnapshot?.colorName ?? selection.color.name : kind === 'fit' ? row.sourceSnapshot?.fitName ?? selection.fit.name : row.sourceSnapshot?.sizeName ?? selection.size.name)}</td>)}
          <td>{combined && <SalesRowDirection label={`退回或换出 ${rowLabel}`} quantity={editing?.quantity ?? row.quantity} disabled={false} change={value => { const patch = { quantity: signedQuantity(editing?.quantity ?? row.quantity, value) }; if (editing) session.updateLineEdit(patch); else session.updateLine(row.key, patch); }} />}<input data-proposal-quantity={row.key} aria-label={`${rowLabel} 数量`} className={(editing?.quantity ?? row.quantity).startsWith('-') ? 'negative' : ''} inputMode="numeric" value={editing?.quantity ?? row.quantity} onChange={event => { const patch = { quantity: event.currentTarget.value }; if (editing) session.updateLineEdit(patch); else session.updateLine(row.key, patch); }} /></td>
          <td className="sale-num sale-muted">{product.retailPrice ?? '未记录'}</td>
          <td>{product.retailPrice !== null && !row.isGift && (active ? <span className="sale-discount-control"><input aria-label={`${rowLabel} 折扣`} inputMode="decimal" value={displayedDiscount(editablePrice)} placeholder="折扣" disabled={!active} onChange={event => { const patch = { pricingRule: 'DISCOUNT' as const, discount: event.currentTarget.value, zeroConfirmed: false }; if (editing) session.updateLineEdit(patch); else session.updateLine(row.key, patch); }} /><span>折</span></span> : displayedDiscount(row) ? `${displayedDiscount(row)}折` : '')}</td>
          <td>{active ? <input aria-label={`${rowLabel} 单价`} placeholder="待填写" inputMode="decimal" value={rawPrice} disabled={!active || editablePrice.isGift} onChange={event => { const patch = { pricingRule: 'UNIT_PRICE' as const, dealPrice: event.currentTarget.value, zeroConfirmed: false }; if (editing) session.updateLineEdit(patch); else session.updateLine(row.key, patch); }} onBlur={() => { if (!editing && !row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00') setZeroLine(row.key); }} /> : linePrice(row) ?? '待填写'}</td>
          <td className="sale-num">{previewAmount(editablePrice)}</td><td className="ui-action-cell"><div className="sale-row-actions">{editing ? <><button type="button" className="btn sale-link" disabled={!session.canConfirmLineEdit || !!picker} onClick={() => finishIdentity(row.key, true)}>确认</button><button type="button" className="btn sale-link" onClick={() => finishIdentity(row.key, false)}>取消</button></> : <><button type="button" className="btn sale-link" disabled={!openProduct || !draft.hall} title={openProduct ? undefined : '商品只读页尚未接入'} onClick={() => { if (draft.hall) openProduct?.(row.sku?.id ?? null, draft.hall.id, { id: row.product.id, label: `${row.product.code} · ${row.product.name}` }); }}>查看</button>{active && <><button type="button" className="btn sale-link" onClick={() => session.updateLine(row.key, { isGift: !row.isGift })}>{row.isGift ? '取消赠品' : '赠品'}</button><button type="button" className="btn sale-link sale-remove-line" aria-label={`删除 ${rowLabel}`} onClick={() => session.removeLine(row.key)}>删除</button></>}</>}</div></td>
        </tr>;
      })}
      {entryRows.map(({ direction, entry }) => {
        const id = `entry-${entry.key}`, empty = !entry.product && !entry.query.trim(), priceRow = entry.product ? { ...entry, product: entry.product } : null;
        const ready = session.canAppendEntry(direction, entry.key) && /^-?[1-9]\d{0,18}$/.test(entry.quantity) && !!priceRow && linePrice(priceRow) !== null;
        const entryOpen = (kind: 'product' | 'sku') => { void session.openEntryPicker(direction, kind, entry.key); };
        return <tr key={entry.key} className="sale-entry-row" data-entry-row={entry.key} data-entry-direction={direction} {...(empty ? { 'data-entry-empty': direction } : {})}>
          <td>{active ? candidate(`${id}-product`, `${section.title}款号 / 名称`, entry.product ? `${entry.product.code} · ${entry.product.name}` : '商品款号 / 名称', () => entryOpen('product'), !draft.hall || !!state.lineEdit, undefined, undefined, { value: entry.query, openUsesInputValue: true, change: value => session.updateEntry(direction, { query: value }, entry.key), placeholder: '款号 / 名称 · 条码请扫码录入' }) : <strong>{entry.product?.code ?? entry.query}</strong>}{entry.product && <span className="sale-entry-name" title={entry.product.name}>{entry.product.name}</span>}{entry.isGift && <span className="sale-gift">赠品</span>}</td>
          {(['color', 'fit', 'size'] as const).map(kind => {
            const value = kind === 'color' ? entry.color?.name : kind === 'fit' ? entry.fit?.name : entry.size?.name ?? entry.sku?.sizeName;
            return <td key={kind}>{active ? candidate(`${id}-${kind}`, `${section.title}${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, value ?? { color: '颜色', fit: '版型', size: '尺码' }[kind], () => entryOpen('sku'), !entry.product || !!state.lineEdit || kind === 'fit' && !entry.color || kind === 'size' && (!entry.color || !entry.fit), kind, entry) : value}</td>;
          })}
          <td>{combined && entry.product && <SalesRowDirection label={`退回或换出待录商品 ${entry.product.code}`} quantity={entry.quantity} disabled={!!state.lineEdit} change={value => session.updateEntry(direction, { quantity: signedQuantity(entry.quantity, value) }, entry.key)} />}{active ? <input data-entry={entry.key} data-entry-field="quantity" aria-label={`${section.title}本行数量`} className={entry.quantity.startsWith('-') ? 'negative' : ''} inputMode="numeric" value={entry.product ? entry.quantity : ''} disabled={!entry.product || !!state.lineEdit} onChange={event => { const value = event.currentTarget.value; return session.updateEntry(direction, { quantity: value }, entry.key); }} onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.key !== 'Enter') return;
            event.preventDefault(); if (entry.isGift) completeEntry(direction, entry.key); else formRef.current?.querySelector<HTMLInputElement>(`[data-entry-control="${id}-price"]`)?.focus({ preventScroll: true });
          }} /> : <span className={entry.quantity.startsWith('-') ? 'negative' : undefined}>{entry.quantity}</span>}</td>
          <td className="sale-num sale-muted">{entry.product?.retailPrice ?? ''}</td>
          <td>{priceRow && entry.product?.retailPrice !== null && !entry.isGift && (active ? <span className="sale-discount-control"><input aria-label={`${section.title}本行折扣`} inputMode="decimal" value={displayedDiscount(priceRow)} placeholder="折扣" disabled={!!state.lineEdit} onChange={event => { const value = event.currentTarget.value; return session.updateEntry(direction, { pricingRule: 'DISCOUNT', discount: value, zeroConfirmed: false }, entry.key); }} /><span>折</span></span> : displayedDiscount(priceRow) ? `${displayedDiscount(priceRow)}折` : '')}</td>
          <td>{active ? <input data-entry={entry.key} data-entry-field="price" data-entry-control={`${id}-price`} aria-label={`${section.title}本行成交单价`} placeholder="待填写" inputMode="decimal" value={entry.isGift ? '0.00' : entry.pricingRule === 'DISCOUNT' && priceRow ? linePrice(priceRow) ?? '' : entry.dealPrice} disabled={!entry.product || entry.isGift || !!state.lineEdit} onChange={event => { const value = event.currentTarget.value; return session.updateEntry(direction, { pricingRule: 'UNIT_PRICE', dealPrice: value, zeroConfirmed: false }, entry.key); }} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') { event.preventDefault(); completeEntry(direction, entry.key); }
            else if (event.key === 'Tab' && !event.shiftKey && ready && completeEntry(direction, entry.key)) event.preventDefault();
          }} /> : priceRow ? linePrice(priceRow) ?? '待填写' : ''}</td>
          <td className="sale-num">{priceRow ? previewAmount({ ...priceRow, quantity: entry.quantity }) : ''}</td>
          <td className="ui-action-cell">{entry.product && <div className="tc-row-actions sale-row-actions"><button type="button" className="btn sale-link" disabled={!openProduct || !draft.hall} title={openProduct ? undefined : '商品只读页尚未接入'} onClick={() => { if (draft.hall && entry.product) openProduct?.(entry.sku?.id ?? null, draft.hall.id, { id: entry.product!.id, label: `${entry.product!.code} · ${entry.product!.name}` }); }}>查看</button>{active && <><button type="button" className="btn sale-link" disabled={!!state.lineEdit} onClick={() => session.updateEntry(direction, { isGift: !entry.isGift }, entry.key)}>{entry.isGift ? '取消赠品' : '赠品'}</button><button type="button" className="btn sale-link sale-remove-entry" disabled={!!state.lineEdit} aria-label={`删除待录商品 ${entry.product.code}`} onClick={() => session.clearEntry(direction, entry.key)}>删除</button></>}</div>}</td>
        </tr>;
      })}
      </tbody></table></div></section>;
    })}
    <SalesDocumentSummary businessType={displayedType} lines={displayedLines.map(row => ({ quantity: row.quantity, isGift: row.isGift, styleKey: row.product.id, ...(row.product.category ? { category: row.product.category } : {}) }))} grossMinor={totals?.grossMinor ?? null} discountMinor={totals?.orderDiscountMinor ?? null} netDueMinor={totals?.netDueMinor ?? null} extra={!combined && pendingPricing > 0 ? <span>{pendingPricing}条待定价</span> : undefined} />
    {scanner && <DocumentScan controller={scanner.controller} title={scanner.direction === 'IN' ? '退回商品扫码录入' : combined ? '换出商品扫码录入' : '销货扫码录入'} rows={draft.lines.filter((row): row is Extract<SalesProposalLine, { readonly sku: CurrentFormSku }> => row.sku !== null && row.quantity.startsWith('-') === (scanner.direction === 'IN'))} close={() => setScanner(null)} update={(key, value) => session.updateLine(key, { quantity: value })} remove={key => session.removeLine(key)} />}
    {zero && <SourceDocumentDialog className="source-confirm-dialog" title="确认普通零价商品" label="确认普通零价商品" closeLabel="关闭弹窗" close={() => setZeroLine(null)} initialFocus="[data-erp-keep-input]" footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setZeroLine(null)}>取消</button><button type="button" className="btn primary" onClick={confirmZero}>确认零价</button></>}><div className="ui-confirm-body"><p>此行单价为0.00元，不标为赠品，审核时仍按业务类型处理商品数量。</p></div></SourceDocumentDialog>}
    {pendingMode && <SalesModeConfirmation cancel={cancelMode} confirm={() => { const next = modeToConfirm.current; if (!next) return; cancelMode(); session.setBusinessMode(next); }} />}
    {confirm && <SourceDocumentDialog className="source-discard-dialog" title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setConfirm(null)} footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setConfirm(null)}>继续录单</button><button type="button" className="btn primary" onClick={() => discard(confirm, true)}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>此新单尚未保存。离开将放弃本次录入，不会产生销货单或库存变动。</p></div></SourceDocumentDialog>}
  </section>}</SalesProductPresentation>;
}
