import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Selection } from '../inventory/contracts.ts';
import type { ProductFullPageConfiguration } from '../products/product-page-contracts.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { UIButton } from '../components/standard-controls.tsx';
import type { ProductFullPageHost } from '../products/product-page-host.tsx';
import { guardedProductPageReader } from '../products/product-page-reader.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../../packages/domain/src/values.ts';
import { salesInputMoney } from './commands/form-model.ts';

/** Frozen sales-current.js lineTable/summary geometry, shared by the actual
 * proposal, saved editor and read-only branches. No authority or identity merge. */
export const SALES_DOCUMENT_COLUMNS = ['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', '成交单价', '金额', '操作'] as const;
export function salesDocumentType(value: string): 'SALE' | 'RETURN' | 'EXCHANGE' {
  if (value !== 'SALE' && value !== 'RETURN' && value !== 'EXCHANGE') throw new TypeError('Invalid sales business type.');
  return value;
}
export function SalesDocumentColumns() {
  return <colgroup>{[270, 100, 122, 84, 80, 95, 90, 108, 99, 142].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>;
}
export function SalesDocumentColumnHead({ incoming = false }: { readonly incoming?: boolean }) {
  return <thead><tr>{SALES_DOCUMENT_COLUMNS.map(label => <th key={label} scope="col" className={label === '操作' ? 'ui-action-cell' : undefined}>{label === '成交单价' && incoming ? '退货单价' : label}</th>)}</tr></thead>;
}
export function salesExactQuantity(rows: readonly { readonly quantity: string }[], absolute = false): string | null {
  try {
    return rows.reduce((sum, row) => { if (!/^-?[1-9]\d{0,18}$/.test(row.quantity)) throw Error(); const q = BigInt(row.quantity); return sum + (absolute && q < 0n ? -q : q); }, 0n).toString();
  } catch { return null; }
}
/** A displayed discount ratio never changes UNIT_PRICE intent. */
export function salesDisplayedDiscount(referenceMinor: string | null, priceMinor: string | null): string {
  try {
    if (referenceMinor === null || priceMinor === null || !/^\d+$/.test(referenceMinor) || !/^\d+$/.test(priceMinor)) return '';
    const reference = BigInt(referenceMinor); if (reference === 0n) return '';
    const tenths = (BigInt(priceMinor) * 100n + reference / 2n) / reference;
    return `${tenths / 10n}.${tenths % 10n}`;
  } catch { return ''; }
}
export function salesSignedYuanMinor(raw: string): string | null {
  if (!/^-?\d{1,100}(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const negative = raw.trim().startsWith('-'), [whole, fraction = ''] = raw.trim().replace(/^-/, '').split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return (negative ? -minor : minor).toString();
}
export function salesRawLinePrice(referenceMinor: string | null, raw: { readonly isGift: boolean; readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT'; readonly discount: string; readonly dealPrice: string }): string | null {
  if (raw.isGift) return '0';
  try {
    if (raw.pricingRule === 'UNIT_PRICE') { const value = salesSignedYuanMinor(raw.dealPrice); return value !== null && BigInt(value) >= 0n ? value : null; }
    if (referenceMinor === null || !/^\d{1,2}(?:\.\d)?$/.test(raw.discount.trim())) return null;
    const [whole, fraction = '0'] = raw.discount.trim().split('.');
    return discountUnitPrice(minorAmount(referenceMinor), Number(whole) * 10 + Number(fraction)).toString();
  } catch { return null; }
}
export function salesPaymentBalance(netDueMinor: string | null, settledMinor: string | null, lineCount?: number): string {
  if (netDueMinor === null || settledMinor === null) return '收退款待填写';
  try {
    const due = BigInt(netDueMinor), paid = BigInt(settledMinor);
    if (lineCount === 0 && due === 0n && paid === 0n) return '';
    if (due === 0n && paid !== 0n) return `${paid < 0n ? '已退' : '已收'} ¥${salesInputMoney((paid < 0n ? -paid : paid).toString())} · ${paid < 0n ? '多退' : '超收'} ¥${salesInputMoney((paid < 0n ? -paid : paid).toString())}`;
    const difference = due - paid, magnitude = difference < 0n ? -difference : difference;
    const refunded = due < 0n, suffix = difference === 0n ? '已结清' : refunded ? difference < 0n ? '待退' : '多退' : difference > 0n ? '待收' : '超收';
    return `${refunded ? '已退' : '已收'} ¥${salesInputMoney((refunded ? -paid : paid).toString())} · ${suffix}${difference === 0n ? '' : ` ¥${salesInputMoney(magnitude.toString())}`}`;
  } catch { return '收退款待填写'; }
}
export function salesPaymentKind(netDueMinor: string | null, settledMinor: string | null, lineCount: number): string {
  if (netDueMinor === null || settledMinor === null) return '';
  try {
    const due = BigInt(netDueMinor), paid = BigInt(settledMinor);
    if (lineCount === 0 && due === 0n && paid === 0n) return '';
    if (due === 0n && paid !== 0n) return 'is-over';
    const gap = due < 0n ? -due + paid : due - paid;
    return gap === 0n ? 'is-settled' : gap > 0n ? 'is-under' : 'is-over';
  } catch { return ''; }
}
interface SummaryLine {
  readonly quantity: string; readonly isGift: boolean;
  /** Canonical product ID when supplied; saved snapshots otherwise use their
   * original product code for a labelled snapshot-code count only. */
  readonly styleKey: string;
  readonly category?: { readonly id: string; readonly label: string | null };
}
export function SalesDocumentSummary({ businessType, lines, grossMinor, discountMinor, netDueMinor, snapshotCodes = false, extra }: {
  readonly businessType: 'SALE' | 'RETURN' | 'EXCHANGE'; readonly lines: readonly SummaryLine[];
  readonly grossMinor: string | null; readonly discountMinor: string | null; readonly netDueMinor: string | null;
  readonly snapshotCodes?: boolean; readonly extra?: ReactNode;
}) {
  const money = (value: string | null) => value === null ? '待填写' : salesInputMoney(value);
  const units = (rows: readonly SummaryLine[]) => { const value = salesExactQuantity(rows); return value === null ? '待校验' : `${value}件`; };
  if (businessType !== 'SALE') {
    const incoming = lines.filter(row => !row.isGift && row.quantity.startsWith('-')), outgoing = lines.filter(row => !row.isGift && !row.quantity.startsWith('-'));
    return <footer className="tc-foot tc-gold-footer sale-summary"><div className="sale-summary-primary" data-sales-quantity-summary><strong>退回 {salesExactQuantity(incoming, true) ?? '待校验'}</strong><strong>换出 {salesExactQuantity(outgoing, true) ?? '待校验'}</strong><strong>{netDueMinor === '0' ? '差额' : netDueMinor?.startsWith('-') ? '应退' : '应收'} ¥{money(netDueMinor?.replace(/^-/, '') ?? null)}</strong>{extra}</div></footer>;
  }
  const gifts = lines.filter(row => row.isGift), categories = new Map<string, { label: string; rows: SummaryLine[] }>();
  for (const line of lines) {
    // A current terminal-category label is explicitly optional. Never create a
    // hierarchy/name from an ID, or bind historical rows to today's category.
    if (line.isGift) continue;
    const key = line.category?.id ?? 'unknown', label = line.category?.label ?? '未知分类', current = categories.get(key) ?? { label, rows: [] };
    if (current.label !== label) current.label = '未知分类';
    current.rows.push(line); categories.set(key, current);
  }
  return <footer className="tc-foot tc-gold-footer sale-summary"><div className="sale-summary-detail"><strong data-sales-quantity-summary>{new Set(lines.map(row => row.styleKey)).size}{snapshotCodes ? '款号' : '款'} {units(lines)}</strong>{gifts.length > 0 && <span>其中赠品{units(gifts)}</span>}{[...categories].map(([id, category]) => <span className="tc-product-tag" key={id}>{category.label}{salesExactQuantity(category.rows) ?? '待校验'}</span>)}{extra}</div><div className="sale-summary-primary"><strong>销售金额 ¥{money(grossMinor)}</strong><strong>优惠 ¥{money(discountMinor)}</strong><strong>应结 ¥{money(netDueMinor)}</strong></div></footer>;
}

/** Ephemeral document owner, never a Products-list return context or DTO. */
export interface DocumentProductInventoryRequest {
  readonly product: Selection;
  readonly targetScope: ReadScope;
  readonly isCurrent: () => boolean;
  readonly restore: (refresh: boolean) => boolean;
}
export type DocumentProductInventoryNavigation = (request: DocumentProductInventoryRequest) => Promise<boolean>;
export type DocumentProductInventoryNavigationFactory = (scope: ReadScope) => DocumentProductInventoryNavigation | undefined;
export interface SalesProductCapability {
  readonly configuration: ProductFullPageConfiguration;
  readonly onUnauthorized?: () => void;
  readonly openInventory?: DocumentProductInventoryNavigation;
  /** Actual SKU -> product relation, requested only by the user's 查看 action. */
  readonly resolveTarget: (skuId: string, hallId: string, signal: AbortSignal) => Promise<Selection>;
}
export interface SalesProductPresentationProps {
  readonly scope?: ReadScope; readonly capability?: SalesProductCapability;
  readonly returnLabel?: string; readonly viewLabel?: string; readonly documentLabel?: string;
  readonly children: (open: ((skuId: string | null, hallId: string, target?: Selection) => void) | undefined) => ReactNode;
}
/** The same real product whole-page leaf used by Products. The document stays
 * mounted while hidden, retaining input, scroll and its native command owner. */
export function SalesProductPresentation({ scope, capability, children, returnLabel = '返回销货单', viewLabel = '销货商品查看', documentLabel = '销货' }: SalesProductPresentationProps) {
  type Active = { scope: ReadScope; parent: ReadScope; capability: SalesProductCapability; target: Selection | null; configuration: ProductFullPageConfiguration | null; View: typeof ProductFullPageHost | null; failed: boolean; skuId: string | null; hallId: string };
  const [active, setActive] = useState<Active | null>(null), serial = useRef(0), activeRef = useRef<Active | null>(null), opener = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const restore = useRef(false), frame = useRef<HTMLDivElement>(null);
  const productFrame = useRef<HTMLElement>(null), returnFrames = useRef(new Set<number>());
  const current = active && active.parent === scope && active.capability === capability && active.scope.active ? active : null;
  const dismiss = () => { activeRef.current?.scope.dispose(); activeRef.current = null; restore.current = true; setActive(null); };
  const open = scope?.active && capability ? (skuId: string | null, hallId: string, target?: Selection) => {
    if (skuId === null && !target) return;
    activeRef.current?.scope.dispose(); setNotice(null); opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const child = new ReadScope(scope.identity, `${scope.routeInstanceId}:sales-product:${++serial.current}`, skuId ?? target!.id, () => {});
    const next: Active = { scope: child, parent: scope, capability, target: null, configuration: null, View: null, failed: false, skuId, hallId }; activeRef.current = next; setActive(next);
    void Promise.all([import('../products/product-page-host.tsx'), target ? Promise.resolve(target) : capability.resolveTarget(skuId!, hallId, child.signal)]).then(([module, resolved]) => {
      if (child.active && scope.active && activeRef.current?.scope === child) {
        const reader = guardedProductPageReader(child, capability.configuration.reader, error => {
          if (activeRef.current?.scope !== child) return;
          activeRef.current = null; restore.current = true; setActive(null); setNotice(`商品查看权限或登录状态已变化，原${documentLabel}输入仍保留。`);
          if (error.kind === 'unauthenticated') capability.onUnauthorized?.();
        });
        const ready = { ...next, configuration: { ...capability.configuration, reader }, target: resolved, View: module.ProductFullPageHost };
        activeRef.current = ready; setActive(ready);
      }
    }, () => { if (child.active && scope.active && activeRef.current?.scope === child) { const failed = { ...next, failed: true }; activeRef.current = failed; setActive(failed); } });
  } : undefined;
  const openInventory = current?.target && current.configuration && capability?.openInventory ? async () => {
    const owner = current, product = Object.freeze({ ...current.target! });
    const isCurrent = () => activeRef.current === owner && owner.scope.active && owner.parent.active;
    if (!isCurrent()) return false;
    const scroll: { element: Element; top: number; left: number }[] = [];
    for (let element: Element | null = productFrame.current; element; element = element.parentElement) scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
    const scrolling = document.scrollingElement;
    if (scrolling && !scroll.some(item => item.element === scrolling)) scroll.push({ element: scrolling, top: scrolling.scrollTop, left: scrolling.scrollLeft });
    const tables = Array.from(productFrame.current?.querySelectorAll('.erp-read-table') ?? []).map(element => ({ top: element.scrollTop, left: element.scrollLeft }));
    const restoreScroll = (next: Active) => {
      if (activeRef.current !== next || !next.scope.active || !next.parent.active) return;
      const apply = () => {
        if (activeRef.current !== next || !next.scope.active || !next.parent.active || productFrame.current?.closest('[hidden],[inert]')) return;
        if (document.activeElement === document.body || !document.activeElement?.isConnected) {
          Array.from(productFrame.current?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(button => button.textContent === '查看详细库存')?.focus({ preventScroll: true });
        }
        for (const saved of scroll) if (saved.element.isConnected) { saved.element.scrollTop = saved.top; saved.element.scrollLeft = saved.left; }
        productFrame.current?.querySelectorAll('.erp-read-table').forEach((element, index) => { const saved = tables[index]; if (saved) { element.scrollTop = saved.top; element.scrollLeft = saved.left; } });
      };
      const schedule = (work: () => void) => { const id = requestAnimationFrame(() => { returnFrames.current.delete(id); work(); }); returnFrames.current.add(id); };
      schedule(() => { apply(); schedule(apply); });
    };
    return capability.openInventory!(Object.freeze({ product, targetScope: owner.scope, isCurrent, restore: (refresh: boolean) => {
      if (!isCurrent()) return false;
      if (!refresh) { setNotice('库存页面暂不可查看，原单据输入已保留。'); restoreScroll(owner); return true; }
      const child = new ReadScope(owner.parent.identity, `${owner.parent.routeInstanceId}:sales-product-return:${++serial.current}`, owner.skuId ?? owner.target!.id, () => {});
      let next: Active;
      const baseReader = capability.configuration.reader, stock = baseReader.stock;
      const refreshed = { ...baseReader, ...(stock ? { stock: { read: async (read: Parameters<typeof stock.read>[0]) => { try { return await stock.read(read); } finally { if (next) restoreScroll(next); } }, ...(stock.readOverview ? { readOverview: async (read: Parameters<NonNullable<typeof stock.readOverview>>[0]) => { try { return await stock.readOverview!(read); } finally { if (next) restoreScroll(next); } } } : {}) } } : {}) };
      const reader = guardedProductPageReader(child, refreshed, error => {
        if (activeRef.current?.scope !== child) return;
        activeRef.current = null; restore.current = true; setActive(null); setNotice(`商品查看权限或登录状态已变化，原${documentLabel}输入仍保留。`);
        if (error.kind === 'unauthenticated') capability.onUnauthorized?.();
      });
      next = { ...owner, scope: child, configuration: { ...capability.configuration, initialTab: 'stock', reader } };
      activeRef.current = next; owner.scope.dispose(); setActive(next); setNotice(null); restoreScroll(next); return true;
    } }));
  } : undefined;
  useEffect(() => {
    const parent = scope;
    const abort = () => { activeRef.current?.scope.dispose(); activeRef.current = null; setActive(null); };
    parent?.signal.addEventListener('abort', abort, { once: true });
    return () => { parent?.signal.removeEventListener('abort', abort); activeRef.current?.scope.dispose(); activeRef.current = null; returnFrames.current.forEach(cancelAnimationFrame); returnFrames.current.clear(); };
  }, [scope, capability]);
  useEffect(() => {
    if (!restore.current || current) return; restore.current = false;
    const target = opener.current; opener.current = null;
    if (target?.isConnected && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true });
    else frame.current?.querySelector<HTMLElement>('button:not(:disabled),h1')?.focus({ preventScroll: true });
  }, [current]);
  return <><div ref={frame} style={{ width: '100%', minWidth: 0 }} hidden={!!current}>{children(open)}{notice && <p role="status">{notice}</p>}</div>{current && <section ref={productFrame} style={{ flex: '1 1 0%', width: '100%', minWidth: 0 }} aria-label={viewLabel} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } }}>
    {notice && <p role="status">{notice}</p>}{current.View && current.target && current.configuration ? <current.View parent={current.scope} target={current.target} configuration={current.configuration} reader={current.configuration.reader} close={dismiss} returnLabel={returnLabel} {...(openInventory ? { openInventory } : {})} />
      : current.failed ? <p role="alert">商品资料或规格关系暂不可读取，原单据输入已保留。<UIButton onClick={() => open?.(current.skuId, current.hallId)}>重试商品查看</UIButton><UIButton onClick={dismiss}>{returnLabel}</UIButton></p>
      : <p role="status">正在读取商品关系并准备商品页…<UIButton onClick={dismiss}>{returnLabel}</UIButton></p>}
  </section>}</>;
}

/** Same retained-document product view for the transfer consumer. */
export { SalesProductPresentation as DocumentProductPresentation };
export type DocumentProductCapability = SalesProductCapability;
