import { CurrentProductFinder, type CurrentProductFinderHandle } from './product-finder.tsx';
import { SalesDocumentColumns, SalesDocumentColumnHead, SalesDocumentSummary, SalesProductPresentation, salesPaymentBalance, salesPaymentKind, salesDisplayedDiscount, type SalesProductCapability } from '../sales/document-presentation.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { Trigger, type TriggerProps } from '@arco-design/web-react';
import { SalesStatusTag } from '../sales/sales-status-tag.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { DocumentScan } from '../components/document-scan.tsx';
import type { DocumentScanController } from '../components/document-scan-controller.ts';
import { UIButton, UIDate, UIInput, UISelect } from '../components/standard-controls.tsx';
import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SalesProposalSession, salesProposalMoney, type SalesProposalLine, type SalesProposalPicker, type SalesProposalSnapshot } from './sales-proposal.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormProduct, CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import { salesBusinessMode, type SalesBusinessMode } from './sales-business-mode.ts';
import { DemoSingleSelectAction } from '../demo-controls/single-select-action.tsx';
import '../demo-controls/single-select.css';
import './sales-proposal.css';
import '../sales/detail.css';
const labels: Record<SalesProposalPicker, string> = { hall: '营业厅', customer: '客户', salesperson: '营业员', warehouse: '出库仓', paymentMethod: '付款方式', paymentAccount: '资金账户', product: '商品', sku: '实际规格' };
function cents(value: string): bigint {
  if (!/^\d{1,100}(?:\.\d{1,2})?$/.test(value.trim())) throw Error();
  const [whole, fraction = ''] = value.trim().split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function paymentAmount(raw: string, direction: 'RECEIVE' | 'REFUND'): string {
  const sign = direction === 'REFUND' ? '-' : '';
  try { return sign + salesInputMoney(cents(raw).toString()); } catch { return sign + raw; }
}
function linePrice(row: SalesProposalLine): string | null {
  try {
    if (row.isGift) return '0.00';
    if (row.pricingRule === 'UNIT_PRICE') return salesInputMoney(cents(row.dealPrice).toString());
    if (row.product.retailPrice === null || !/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim())) return null;
    const [whole, fraction = '0'] = row.discount.trim().split('.');
    return salesInputMoney(discountUnitPrice(minorAmount(cents(row.product.retailPrice).toString()), Number(whole) * 10 + Number(fraction)).toString());
  } catch { return null; }
}
function previewAmount(row: SalesProposalLine): string {
  try { if (!/^-?[1-9]\d{0,18}$/.test(row.quantity)) throw Error(); const price = linePrice(row); return price === null ? '待填写' : salesInputMoney((BigInt(row.quantity) * cents(price)).toString()); } catch { return '待填写'; }
}
function displayedDiscount(row: SalesProposalLine): string {
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
/** Same guarded Portal reattachment used by the shared native Select action.
 * A replacement row may first mount already-open under StrictMode replay. */
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
function SalesReferenceField({ session, picker, visible, label, value, selected, disabled, open, close, clear }: {
  readonly session: SalesProposalSession; readonly picker: SalesProposalSnapshot['picker']; readonly visible: boolean;
  readonly label: string; readonly value: string; readonly selected: { readonly id: string; readonly name: string } | null;
  readonly disabled: boolean; readonly open: () => void; readonly close: () => void; readonly clear?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null), [popupWidth, setPopupWidth] = useState(300);
  useLayoutEffect(() => {
    const element = host.current, view = element?.ownerDocument.defaultView;
    if (!element || !view || !visible) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setPopupWidth(Math.min(Math.max(bounds.width, 300), Math.max(180, view.innerWidth - bounds.left - 12))); };
    measure(); view.addEventListener('resize', measure);
    return () => view.removeEventListener('resize', measure);
  }, [visible]);
  const options: { value: string; label: string; disabled?: boolean }[] = visible && picker?.phase === 'ready' ? (picker.result?.items ?? []).map(item => ({ value: item.id as string, label: 'name' in item ? item.name : item.skuCode })) : [];
  if (selected && !options.some(option => option.value === selected.id)) options.unshift({ value: selected.id, label: selected.name, disabled: true });
  return <div ref={host} className="sale-reference-field"><DemoSingleSelectAction presentation="flat" label={label} placeholder={value} value={selected?.id ?? ''} options={options} disabled={disabled} open={visible} popupWidth={popupWidth} {...(clear ? { allowClear: true, onClear: clear } : {})}
    loading={visible && picker?.phase === 'loading'} onSearch={text => { if (visible && session.getSnapshot().picker === picker) void session.search(text); }}
    onOpenChange={next => {
      if (next) { if (!visible) open(); return; }
      // The source Select notifies close before onChange. Let the native
      // selection consume this exact candidate snapshot before dismissing it.
      const current = picker; queueMicrotask(() => { if (current && !session.getSnapshot().disposed && session.getSnapshot().picker === current) close(); });
    }}
    onChange={id => { if (visible && session.getSnapshot().picker === picker) void session.select(id); }}
    dropdownRender={menu => <>{picker?.phase === 'error' ? <div className="sale-reference-state" role="alert">读取失败。<UIButton onClick={() => { void session.retry(); }}>重试</UIButton></div> : menu}
      {visible && picker?.phase === 'ready' && picker.result && picker.result.exactTotal > 20n && <div className="sale-reference-pages"><span>第 {picker.page} 页</span><UIButton disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton disabled={BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton></div>}</>} /></div>;
}
/** One anchored Arco popup for native paged candidates. No second modal picker,
 * no all-catalog fetch and no derived SKU identity. */
function CandidatePopup({ session, picker, spec, selection, choose, close, keyboardRef, scope, capability, getAnchor }: { readonly getAnchor: () => HTMLElement | null | undefined; readonly keyboardRef: React.Ref<CurrentProductFinderHandle>; readonly scope?: ReadScope; readonly capability?: SalesProductCapability;
  session: SalesProposalSession; picker: NonNullable<SalesProposalSnapshot['picker']>;
  spec?: SpecKind; selection?: { color: { id: string } | null; fit: { id: string } | null; sku?: { id: string } | null };
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
    const rows = (picker.result?.items ?? []) as readonly CurrentFormSku[];
    const matching = rows.filter(row => spec === 'color' || row.colorId === selection?.color?.id && (spec === 'fit' || row.fitId === selection?.fit?.id));
    options = matching.map(row => ({ id: spec === 'color' ? row.colorId : spec === 'fit' ? row.fitId : row.id, text: spec === 'color' ? row.colorName : spec === 'fit' ? row.fitName : row.sizeName }));
    options = options.filter((item, index) => options.findIndex(other => other.id === item.id) === index);
  }
  const selected = spec === 'color' ? selection?.color?.id : spec === 'fit' ? selection?.fit?.id : selection?.sku?.id;
  return <div ref={host} className={`sales-inline-candidates${spec ? ' sale-spec-menu mx-spec-menu' : ''}`} role="dialog" aria-label={`${spec ? { color: '颜色', fit: '版型', size: '尺码' }[spec] : labels[picker.kind]}候选`} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const nodes = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-candidate-option]') ?? []), current = nodes.indexOf(event.target as HTMLElement);
      if (nodes.length) { event.preventDefault(); nodes[(current + (event.key === 'ArrowDown' ? 1 : nodes.length - 1) + nodes.length) % nodes.length]?.focus(); }
    }
  }}>
    {spec && <div className="mx-spec-menu-head">选择{{ color: '颜色', fit: '版型', size: '尺码' }[spec]}<span>{options.length} 项</span></div>}
    <div className={`sales-inline-options${spec ? ' mx-spec-menu-options' : ''}`} {...(spec ? { role: 'listbox', 'aria-label': `可选${{ color: '颜色', fit: '版型', size: '尺码' }[spec]}` } : {})}>{picker.phase === 'loading' ? <p role="status">正在读取…</p> : picker.phase === 'error' ? <p role="alert">读取失败。<UIButton onClick={() => { void session.retry(); }}>重试</UIButton></p> : <>
      {options.map(option => <UIButton key={option.id} data-candidate-option {...(spec ? { 'data-mx-spec-option': option.id } : {})} {...(spec ? { role: 'option', 'aria-selected': option.id === selected } : {})} type="button" onClick={() => choose(option.id)}><span>{option.text}</span>{spec && option.id === selected && <span aria-hidden="true">✓</span>}</UIButton>)}
      {!options.length && <p>本页无匹配项{picker.result && picker.result.exactTotal > 20n ? '，可翻页继续选择' : ''}</p>}
    </>}</div>
    {picker.phase === 'ready' && picker.result && picker.result.exactTotal > 20n && <footer><span>第 {picker.page} 页 / 共 {picker.result?.exactTotal.toString()} 个{spec ? '实际规格' : '候选'}</span><UIButton disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton></footer>}
  </div>;
}
export function SalesProposalForm({ session, close, preparation, scope, product: productCapability, saved }: { readonly scope?: ReadScope; readonly product?: SalesProductCapability; readonly session: SalesProposalSession; readonly close: () => void; readonly saved?: { readonly number: string; readonly actions: ReactNode; readonly feedback?: ReactNode }; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null), [pendingMode, setPendingMode] = useState<SalesBusinessMode | null>(null);
  const modeToConfirm = useRef<SalesBusinessMode | null>(null);
  const [scanner, setScanner] = useState<{ controller: DocumentScanController; direction: 'IN' | 'OUT' } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null), [activeSection, setActiveSection] = useState<'IN' | 'OUT'>('OUT');
  const [quantitySections, setQuantitySections] = useState<{ readonly session: SalesProposalSession; readonly values: ReadonlyMap<string, 'IN' | 'OUT'> }>(() => ({ session, values: new Map() }));
  const [zeroLine, setZeroLine] = useState<string | null>(null), [focusedPayment, setFocusedPayment] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null), triggerRef = useRef<HTMLElement | null>(null);
  const productKeys = useRef(new Map<string, CurrentProductFinderHandle>());
  const movedQuantity = useRef<{ key: string; previous: Element | null } | null>(null);
  useLayoutEffect(() => {
    const target = movedQuantity.current; movedQuantity.current = null;
    if (!target || !formRef.current) return;
    const doc = formRef.current.ownerDocument, active = doc.activeElement;
    if (active && active !== doc.body && active !== target.previous && active.isConnected) return;
    Array.from(formRef.current.querySelectorAll<HTMLInputElement>('[data-proposal-quantity]')).find(node => node.dataset.proposalQuantity === target.key)?.focus({ preventScroll: true });
  }, [state.draft.lines]);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker } = state, combined = draft.businessType !== 'SALE', totals = salesProposalMoney(draft);
  const restorePickerFocus = () => {
    const live = triggerRef.current?.isConnected ? triggerRef.current : Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-entry-control]') ?? []).find(node => node.dataset.entryControl === anchor);
    live?.focus({ preventScroll: true });
  };
  const dismissPicker = (restore = false) => { session.closePicker(); setAnchor(null); if (restore) restorePickerFocus(); };
  const candidate = (id: string, label: string, value: ReactNode, open: () => void, disabled = false, spec?: SpecKind, selection?: { color: { id: string } | null; fit: { id: string } | null; sku?: { id: string } | null }, input?: { value: string; change: (value: string) => void; placeholder: string; openUsesInputValue?: boolean }) => {
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
      {input ? <UIInput className="sale-product-input" data-entry-control={id} spellCheck={false} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={visible} autoComplete="off" placeholder={input.placeholder} value={input.value} disabled={disabled}
        onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }} onChange={(value, event) => { triggerRef.current = event.currentTarget; input.change(value); if (!visible) { show(); if (!input.openUsesInputValue) void session.search(value); } else void session.search(value); }} />
        : <UIButton className={`sale-select-trigger${spec ? ` mx-spec-picker${selection?.[spec === 'size' ? 'sku' : spec] ? ' has-value' : ''}` : ''}`} data-entry-control={id} aria-label={label} aria-haspopup={spec ? 'listbox' : 'dialog'} aria-expanded={visible} disabled={disabled} onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }}><span>{value}</span>{spec ? <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg> : <span aria-hidden="true">⌄</span>}</UIButton>}
    </SalesCandidateTrigger>;
  };
  const reference = (id: string, label: string, placeholder: string, selected: { readonly id: string; readonly name: string } | null, open: () => void, disabled = false, clear?: () => void) => <SalesReferenceField session={session} picker={anchor === id ? picker : null} visible={anchor === id && !!picker} label={label} value={placeholder} selected={selected} disabled={disabled}
    {...(clear ? { clear } : {})} open={() => { setAnchor(id); open(); }} close={() => { if (anchor === id) dismissPicker(); }} />;
  const cancelMode = () => { modeToConfirm.current = null; setPendingMode(null); };
  const chooseMode = (mode: SalesBusinessMode) => {
    if (mode === salesBusinessMode(draft.businessType) || state.lineEdit) return;
    if (draft.lines.length || Object.values(state.entries).some(entry => entry.product || entry.query.trim())) { modeToConfirm.current = mode; setPendingMode(mode); }
    else session.setBusinessMode(mode);
  };
  const discard = (action: 'reset' | 'cancel', confirmed = false) => { const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed); if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); } };
  const completeEntry = (direction: 'IN' | 'OUT') => {
    const appended = session.appendEntry(direction);
    if (appended) requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLInputElement>(`[data-entry-control="entry-${direction}-product"]`);
      input?.focus({ preventScroll: true }); input?.select();
    });
    return appended;
  };
  const finishIdentity = (key: string, confirmChange: boolean) => {
    if (confirmChange && !session.confirmLineEdit()) return;
    if (!confirmChange) { dismissPicker(); session.cancelLineEdit(); }
    requestAnimationFrame(() => Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-line-identity]') ?? []).find(node => node.dataset.lineIdentity === key)?.focus({ preventScroll: true }));
  };
  const save = () => { const row = draft.lines.find(row => !row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00'); if (row) setZeroLine(row.key); else preparation?.save(); };
  // Grouping only: incomplete raw input retains the section where it was edited.
  // A complete signed value follows its sign; final validation stays in the session.
  const quantitySection = (row: SalesProposalLine): 'IN' | 'OUT' => /^-?[1-9]\d{0,18}$/.test(row.quantity) ? row.quantity.startsWith('-') ? 'IN' : 'OUT' : (quantitySections.session === session ? quantitySections.values.get(row.key) : undefined) ?? (row.quantity.startsWith('-') ? 'IN' : 'OUT');
  const sections = combined ? [{ key: 'IN' as const, title: '退回商品', rows: draft.lines.filter(row => quantitySection(row) === 'IN') }, { key: 'OUT' as const, title: '换出商品', rows: draft.lines.filter(row => quantitySection(row) === 'OUT') }] : [{ key: 'OUT' as const, title: '商品明细', rows: draft.lines }];
  const paymentRows = draft.settlements.length ? draft.settlements : [{ key: null, method: null, account: null, direction: 'RECEIVE' as const, amount: '' }];
  const zero = draft.lines.find(row => row.key === zeroLine);
  return <SalesProductPresentation {...(scope ? { scope } : {})} {...(productCapability ? { capability: productCapability } : {})}>{openProduct => <section ref={formRef} aria-label={saved ? '销货单编辑' : '新增销售草稿'} className="tc-workbench tc-editor sale-workbench sale-editor sales-proposal-editor" onKeyDown={event => {
    if (event.key === 'Escape' && state.lineEdit && !picker) { event.preventDefault(); finishIdentity(state.lineEdit.key, false); }
  }}>
    <div className="tc-head sale-head"><h1>{saved ? '编辑销货单' : '新增销货单'}</h1><SalesStatusTag status="DRAFT" /><span className="sale-muted">· {state.dirty ? '有未保存修改' : saved ? '已保存' : '未保存'}</span><div className="actions">
      <UIButton onClick={() => saved ? close() : discard('cancel')}>返回列表</UIButton><UIButton disabled={!preparation || preparation.preparing || !!state.lineEdit || !!pendingMode} onClick={save}>保存</UIButton>
      {saved ? saved.actions : ['审核', '导出', '打印'].map(label => <UIButton disabled key={label} title="请先保存单据">{label}</UIButton>)}
    </div></div>
    {saved?.feedback}
    <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      <div className="tc-gold-field sale-date-field"><span className="sale-field-label">单据日期 <em>*</em></span><UIDate aria-label="单据日期" value={draft.businessDate} onChange={value => session.setHeader({ businessDate: value })} /></div>
      <div className="tc-gold-field"><span className="sale-field-label">业务类型 <em>*</em></span><UISelect aria-label="业务类型" disabled={!!state.lineEdit} value={salesBusinessMode(draft.businessType)} onChange={value => chooseMode(value as SalesBusinessMode)}><UISelect.Option value="SALE">销售</UISelect.Option><UISelect.Option value="RETURN_EXCHANGE">退货/换货</UISelect.Option></UISelect></div>
      {(['hall', 'salesperson', 'customer', 'warehouse'] as const).map(kind => <div className="tc-gold-field" key={kind}><span className="sale-field-label">{labels[kind]}{kind !== 'salesperson' && <em> *</em>}</span><div className="sale-reference-control">{reference(kind, `选择${labels[kind]}`, `请选择${labels[kind]}`, draft[kind], () => { void session.openPicker(kind); }, !!state.lineEdit || kind !== 'hall' && !draft.hall)}{kind === 'salesperson' && draft.salesperson && <UIButton className="sale-clear-reference" aria-label="清除营业员" onClick={() => session.clearSalesperson()}>×</UIButton>}</div></div>)}
      <div className="tc-gold-field sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">{saved?.number ?? '保存后生成'}</strong></div>
      <div className="tc-gold-field sale-discount-field"><span className="sale-field-label">整单优惠 / 抹零</span>{combined ? <span className="sale-read-value" /> : <UIInput aria-label="整单优惠" inputMode="decimal" value={draft.orderDiscount} onChange={value => session.setHeader({ orderDiscount: value })} />}</div>
      <div className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value">{totals ? `¥${salesInputMoney(totals.netDueMinor)}` : '待填写'}</strong></div>
      <div className="tc-gold-field sale-payment-field" aria-label="本单收退明细"><span className="sale-field-label">收款</span><div className="sale-payment-rows">
        {paymentRows.map((row, index) => <div className="sale-payment-row" key={row.key ?? 'empty'}>
          {reference(`method-${index}`, `付款方式 ${index + 1}`, '付款方式', row.method, () => { void session.openPaymentPicker(row.key, 'paymentMethod'); }, !draft.hall || !!state.lineEdit, row.key && paymentRows.length === 1 ? () => { dismissPicker(); session.removeSettlement(row.key!); } : undefined)}
          {reference(`account-${index}`, `资金账户 ${index + 1}`, '资金账户', row.account, () => { void session.openPaymentPicker(row.key, 'paymentAccount'); }, !row.method || !!state.lineEdit)}
          <UIInput aria-label={`收退金额 ${index + 1}`} inputMode="decimal" placeholder="金额" disabled={!draft.hall} value={focusedPayment === (row.key ?? 'empty') ? (row.direction === 'REFUND' ? '-' : '') + row.amount : paymentAmount(row.amount, row.direction)} onFocus={() => setFocusedPayment(row.key ?? 'empty')} onBlur={() => setFocusedPayment(null)} onChange={value => session.updateSignedSettlement(row.key, value)} />
          <div className="sale-payment-actions">{index === paymentRows.length - 1 && paymentRows.length < 3 && <UIButton className="sale-link" disabled={!draft.hall || !row.method || !row.account || !/^\d+(?:\.\d{1,2})?$/.test(row.amount)} onClick={() => session.addSettlement()}>添加</UIButton>}{row.key && paymentRows.length > 1 && <UIButton className="sale-link" aria-label={`删除收退 ${index + 1}`} onClick={() => session.removeSettlement(row.key!)}>删除</UIButton>}</div>
        </div>)}
      </div><span className={`sale-payment-balance ${salesPaymentKind(totals?.netDueMinor ?? null, totals?.settledMinor ?? null, draft.lines.length)}`}>{salesPaymentBalance(totals?.netDueMinor ?? null, totals?.settledMinor ?? null, draft.lines.length)}</span></div>
    </div></div>
    <div className="sale-note-row"><span className="sale-field-label">备注</span><UIInput aria-label="备注" placeholder="输入本单备注（可选）" maxLength={10000} value={draft.note} onChange={value => session.setHeader({ note: value })} /></div>
    {sections.map(section => {
      const active = !combined || activeSection === section.key, entry = state.entries[section.key];
      const entryOpen = (kind: 'product' | 'sku') => { void session.openEntryPicker(section.key, kind); };
      return <section className="sale-entry-section" key={section.key} data-business-section={section.key === 'IN' ? 'in' : 'out'}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong><div>
        {!active && <UIButton className="sale-link" disabled={!!state.lineEdit} onClick={() => { dismissPicker(); setActiveSection(section.key); }}>录入{section.title}</UIButton>}
        {active && <UIButton className="sale-link" disabled={!session.canScan || preparation?.preparing || !!state.lineEdit} title={session.canScan ? undefined : '请先选择营业厅和仓库'} onClick={() => { dismissPicker(); setScanner({ controller: session.createScanner(section.key), direction: section.key }); }}>扫码录入</UIButton>}
      </div></div><div className="sale-lines"><table className="sale-lines-table"><caption className="sr-only">{section.title}</caption><SalesDocumentColumns /><SalesDocumentColumnHead incoming={section.key === 'IN'} /><tbody>
      {section.rows.map(row => {
        const editing = state.lineEdit?.key === row.key ? state.lineEdit : null, product = editing?.product ?? row.product;
        const editOpen = (kind: 'product' | 'sku') => { void session.openLinePicker(row.key, kind); };
        const identity = (part: 'product' | SpecKind, value: ReactNode) => !active ? value : <UIButton className="sale-identity-trigger mx-spec-edit" data-line-identity={row.key} aria-label={`修改${part === 'product' ? '商品' : { color: '颜色', fit: '版型', size: '尺码' }[part]} ${row.sku.skuCode}`} disabled={!active || !!state.lineEdit} onClick={event => {
          triggerRef.current = event.currentTarget;
          if (!session.beginLineEdit(row.key)) return;
          setAnchor(null);
          requestAnimationFrame(() => { const doc = formRef.current?.ownerDocument; if (doc?.activeElement === doc?.body) formRef.current?.querySelector<HTMLElement>(`[data-entry-control="edit-${row.key}-${part}"]`)?.focus({ preventScroll: true }); }); }}><span>{value}</span><span className="sale-edit-mark mx-spec-edit-mark" aria-hidden="true">改</span></UIButton>;
        const rawPrice = row.isGift ? '0.00' : row.pricingRule === 'DISCOUNT' ? linePrice(row) ?? '' : row.dealPrice;
        return <tr key={row.key} className={editing ? 'sale-identity-editing sale-identity-edit mx-replacing mx-inline-replacement' : ''}>
          <td>{editing ? <>{candidate(`edit-${row.key}-product`, '修改商品款号 / 名称', `${product.code} · ${product.name}`, () => editOpen('product'), false, undefined, undefined, { value: anchor === `edit-${row.key}-product` && picker?.kind === 'product' ? picker.search : product.code, change: () => {}, placeholder: '款号 / 名称 · 条码请扫码录入' })}<small className="mx-original-hint">原：{row.sourceSnapshot?.productCode ?? row.product.code} / {row.sourceSnapshot?.colorName ?? row.sku.colorName} / {row.sourceSnapshot?.fitName ?? row.sku.fitName} / {row.sourceSnapshot?.sizeName ?? row.sku.sizeName} · {row.quantity}</small></> : <div className="sale-product-cell">{identity('product', <><strong>{row.sourceSnapshot?.productCode ?? row.product.code}</strong><span className="sale-product-name">{row.sourceSnapshot?.productName ?? row.product.name}</span></>)}{row.isGift && <span className="sale-gift">赠品</span>}</div>}</td>
          {(['color', 'fit', 'size'] as const).map(kind => <td key={kind}>{editing ? candidate(`edit-${row.key}-${kind}`, `修改${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, kind === 'color' ? editing.color?.name ?? '颜色' : kind === 'fit' ? editing.fit?.name ?? '版型' : editing.sku?.sizeName ?? '尺码', () => editOpen('sku'), kind === 'fit' && !editing.color || kind === 'size' && (!editing.color || !editing.fit), kind, editing) : identity(kind, kind === 'color' ? row.sourceSnapshot?.colorName ?? row.sku.colorName : kind === 'fit' ? row.sourceSnapshot?.fitName ?? row.sku.fitName : row.sourceSnapshot?.sizeName ?? row.sku.sizeName)}</td>)}
          <td>{active ? <UIInput data-proposal-quantity={row.key} aria-label={`${row.sku.skuCode} 数量`} className={row.quantity.startsWith('-') ? 'negative' : ''} inputMode="numeric" value={row.quantity} disabled={!active || !!editing} onChange={value => {
            const complete = /^-?[1-9]\d{0,18}$/.test(value);
            setQuantitySections(current => {
              const keys = new Set(draft.lines.map(line => line.key)), values = new Map(current.session === session ? current.values : []);
              for (const key of values.keys()) if (!keys.has(key)) values.delete(key);
              if (complete) values.delete(row.key); else values.set(row.key, section.key);
              return { session, values };
            });
            if (combined && complete) setActiveSection(value.startsWith('-') ? 'IN' : 'OUT');
            movedQuantity.current = { key: row.key, previous: formRef.current?.ownerDocument.activeElement ?? null }; session.updateLine(row.key, { quantity: value });
          }} /> : <span className={row.quantity.startsWith('-') ? 'negative' : undefined}>{combined ? section.key === 'IN' ? '退回 ' : '换出 ' : ''}{row.quantity}</span>}</td>
          <td className="sale-num sale-muted">{product.retailPrice ?? '未记录'}</td>
          <td>{product.retailPrice !== null && !row.isGift && (active ? <span className="sale-discount-control"><UIInput aria-label={`${row.sku.skuCode} 折扣`} inputMode="decimal" value={displayedDiscount(row)} placeholder="折扣" disabled={!active || !!editing} onChange={value => session.updateLine(row.key, { pricingRule: 'DISCOUNT', discount: value, zeroConfirmed: false })} /><span>折</span></span> : displayedDiscount(row) ? `${displayedDiscount(row)}折` : '')}</td>
          <td>{active ? <UIInput aria-label={`${row.sku.skuCode} 单价`} placeholder="待填写" inputMode="decimal" value={rawPrice} disabled={!active || row.isGift || !!editing} onChange={value => session.updateLine(row.key, { pricingRule: 'UNIT_PRICE', dealPrice: value, zeroConfirmed: false })} onBlur={() => { if (!row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00') setZeroLine(row.key); }} /> : linePrice(row) ?? '待填写'}</td>
          <td className="sale-num">{previewAmount(row)}</td><td className="ui-action-cell"><div className="sale-row-actions">{editing ? <><UIButton className="sale-link" disabled={!editing.sku || !!picker} onClick={() => finishIdentity(row.key, true)}>确认</UIButton><UIButton className="sale-link" onClick={() => finishIdentity(row.key, false)}>取消</UIButton></> : <><UIButton className="sale-link" disabled={!openProduct || !draft.hall} title={openProduct ? undefined : '商品只读页尚未接入'} onClick={() => { if (draft.hall) openProduct?.(row.sku.id, draft.hall.id, { id: row.product.id, label: `${row.product.code} · ${row.product.name}` }); }}>查看</UIButton>{active && <><UIButton className="sale-link" onClick={() => session.updateLine(row.key, { isGift: !row.isGift })}>{row.isGift ? '取消赠品' : '赠品'}</UIButton><UIButton className="sale-link sale-remove-line" aria-label={`删除 ${row.sku.skuCode}`} onClick={() => session.removeLine(row.key)}>删除</UIButton></>}</>}</div></td>
        </tr>;
      })}
      {active && <tr className="sale-entry-row" data-entry-direction={section.key}>
        <td>{candidate(`entry-${section.key}-product`, `${section.title}款号 / 名称`, entry.product ? `${entry.product.code} · ${entry.product.name}` : '商品款号 / 名称', () => entryOpen('product'), !draft.hall || !!state.lineEdit, undefined, undefined, { value: entry.query, openUsesInputValue: true, change: value => session.updateEntry(section.key, { query: value }), placeholder: '款号 / 名称 · 条码请扫码录入' })}{entry.product && <span className="sale-entry-name" title={entry.product.name}>{entry.product.name}</span>}</td>
        {(['color', 'fit', 'size'] as const).map(kind => <td key={kind}>{candidate(`entry-${section.key}-${kind}`, `${section.title}${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, kind === 'color' ? entry.color?.name ?? '颜色' : kind === 'fit' ? entry.fit?.name ?? '版型' : entry.sku?.sizeName ?? '尺码', () => entryOpen('sku'), !entry.product || !!state.lineEdit || kind === 'fit' && !entry.color || kind === 'size' && (!entry.color || !entry.fit), kind, entry)}</td>)}
        <td><UIInput aria-label={`${section.title}本行数量`} className={entry.quantity.startsWith('-') ? 'negative' : ''} inputMode="numeric" value={entry.product ? entry.quantity : ''} disabled={!entry.product || !!state.lineEdit} onChange={value => session.updateEntry(section.key, { quantity: value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); completeEntry(section.key); } }} /></td>
        <td className="sale-num sale-muted">{entry.product?.retailPrice ?? ''}</td><td />
        <td><UIInput aria-label={`${section.title}本行成交单价`} placeholder="待填写" inputMode="decimal" value={entry.dealPrice} disabled={!entry.product || !!state.lineEdit} onChange={value => session.updateEntry(section.key, { dealPrice: value })} onKeyDown={event => { if (!event.nativeEvent.isComposing && event.key === 'Enter') { event.preventDefault(); completeEntry(section.key); } else if (!event.nativeEvent.isComposing && event.key === 'Tab' && !event.shiftKey && completeEntry(section.key)) event.preventDefault(); }} /></td><td className="sale-num">{entry.product && /^-?[1-9]\d{0,18}$/.test(entry.quantity) && /^\d{1,100}(?:\.\d{1,2})?$/.test(entry.dealPrice) ? salesInputMoney((BigInt(entry.quantity) * cents(entry.dealPrice)).toString()) : ''}</td>
        <td className="ui-action-cell">{entry.product || entry.query ? <div className="sale-row-actions"><UIButton className="sale-link" disabled={!entry.sku || !!state.lineEdit} onClick={() => completeEntry(section.key)}>完成</UIButton><UIButton className="sale-link" onClick={() => session.clearEntry(section.key)}>清除</UIButton></div> : null}</td>
      </tr>}
      </tbody></table></div></section>;
    })}
    <div className="sales-proposal-feedback">{state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <UIButton onClick={preparation.cancel}>{saved ? '取消准备' : '取消新单准备'}</UIButton>}</div>
    <SalesDocumentSummary businessType={draft.businessType} lines={draft.lines.map(row => ({ quantity: row.quantity, isGift: row.isGift, styleKey: row.sku.productId, ...(row.product.category ? { category: row.product.category } : {}) }))} grossMinor={totals?.grossMinor ?? null} discountMinor={totals?.orderDiscountMinor ?? null} netDueMinor={totals?.netDueMinor ?? null} />
    {scanner && <DocumentScan controller={scanner.controller} title={scanner.direction === 'IN' ? '退回商品扫码录入' : combined ? '换出商品扫码录入' : '销货扫码录入'} rows={draft.lines.filter(row => row.quantity.startsWith('-') === (scanner.direction === 'IN'))} close={() => setScanner(null)} update={(key, value) => session.updateLine(key, { quantity: value })} remove={key => session.removeLine(key)} />}
    {zero && <StandardOverlay role="alertdialog" title="确认普通零价" label="确认普通零价" closeLabel="关闭零价确认" close={() => setZeroLine(null)} width={420}>{dismiss => <><p>{zero.product.code} 的成交单价为零。确认按普通商品零价处理？保存仍须通过最低价校验。</p><div className="sales-proposal-confirm-actions"><UIButton onClick={dismiss}>返回修改</UIButton><UIButton onClick={() => { session.updateLine(zero.key, { zeroConfirmed: true }); setZeroLine(null); }}>确认零价</UIButton></div></>}</StandardOverlay>}
    {pendingMode && <StandardOverlay className="sales-proposal-confirm" role="alertdialog" title="切换业务类型" label="切换业务类型" closeLabel="关闭业务类型确认" close={cancelMode} initialFocus="[data-erp-keep-mode]" width={700}>{dismiss => <><p>切换为{pendingMode === 'SALE' ? '销售' : '退货/换货'}后，整单优惠将归零。商品数量、单价和收退记录将保留，请核对商品方向与应结金额。</p><div className="sales-proposal-confirm-actions"><UIButton data-erp-keep-mode onClick={dismiss}>取消</UIButton><UIButton onClick={() => { const next = modeToConfirm.current; if (!next) return; cancelMode(); session.setBusinessMode(next); }}>确定</UIButton></div></>}</StandardOverlay>}
    {confirm && <StandardOverlay className="sales-proposal-confirm" role="alertdialog" title="放弃未保存输入？" label="放弃未保存输入" closeLabel="关闭放弃输入确认" close={() => setConfirm(null)} initialFocus="[data-erp-keep-input]" width={420}>{dismiss => <><p>将放弃本次未保存输入，是否继续？</p><div className="sales-proposal-confirm-actions"><UIButton data-erp-keep-input onClick={dismiss}>保留输入</UIButton><UIButton onClick={() => discard(confirm, true)}>确认放弃</UIButton></div></>}</StandardOverlay>}
  </section>}</SalesProductPresentation>;
}
