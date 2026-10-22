import { Trigger } from '@arco-design/web-react';
import { SalesStatusTag } from '../sales/sales-status-tag.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { DocumentScan } from '../components/document-scan.tsx';
import type { DocumentScanController } from '../components/document-scan-controller.ts';
import { UIButton, UIDate, UIInput, UISelect } from '../components/standard-controls.tsx';
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SalesProposalSession, salesProposalMoney, type SalesProposalLine, type SalesProposalPicker, type SalesProposalSnapshot } from './sales-proposal.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import { salesBusinessMode, type SalesBusinessMode } from './sales-business-mode.ts';
import './sales-proposal.css';
const labels: Record<SalesProposalPicker, string> = { hall: '营业厅', customer: '客户', salesperson: '营业员', warehouse: '出库仓', paymentMethod: '付款方式', paymentAccount: '资金账户', product: '商品', sku: '实际规格' };
const columns = ['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', '成交单价', '金额', '操作'];
const widths = [270, 100, 122, 84, 80, 95, 90, 108, 99, 142];
function cents(value: string): bigint {
  if (!/^\d{1,100}(?:\.\d{1,2})?$/.test(value.trim())) throw Error();
  const [whole, fraction = ''] = value.trim().split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
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
    const tenths = (price * 100n + reference / 2n) / reference;
    return `${tenths / 10n}.${tenths % 10n}`;
  } catch { return ''; }
}
function quantitySummary(rows: readonly SalesProposalLine[], absolute = false): string {
  if (rows.some(row => !/^-?[1-9]\d{0,18}$/.test(row.quantity))) return '待校验';
  return rows.reduce((sum, row) => { const n = BigInt(row.quantity); return sum + (absolute && n < 0n ? -n : n); }, 0n).toString();
}
function paymentHint(totals: ReturnType<typeof salesProposalMoney>): string {
  if (!totals || totals.settledMinor === null || totals.differenceMinor === null) return '收退款待填写';
  const due = BigInt(totals.netDueMinor), paid = BigInt(totals.settledMinor), difference = BigInt(totals.differenceMinor), abs = (n: bigint) => n < 0n ? -n : n;
  const refunded = due < 0n; const suffix = difference === 0n ? '已结清' : refunded ? difference < 0n ? '待退' : '多退' : difference > 0n ? '待收' : '超收';
  return `${refunded ? '已退' : '已收'} ¥${salesInputMoney((refunded ? -paid : paid).toString())} · ${suffix}${difference === 0n ? '' : ` ¥${salesInputMoney(abs(difference).toString())}`}`;
}
type SpecKind = 'color' | 'fit' | 'size';
/** One anchored Arco popup for native paged candidates. No second modal picker,
 * no all-catalog fetch and no derived SKU identity. */
function CandidatePopup({ session, picker, spec, selection, choose, close }: {
  session: SalesProposalSession; picker: NonNullable<SalesProposalSnapshot['picker']>;
  spec?: SpecKind; selection?: { color: { id: string } | null; fit: { id: string } | null };
  choose: (id: string) => void; close: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const doc = element.ownerDocument, previous = doc.activeElement;
    // Trigger can attach its portal after this child's layout effect. Focus
    // only the connected layer, and never steal a subsequent user focus move.
    const frame = requestAnimationFrame(() => {
      const active = doc.activeElement;
      if (!element.isConnected || element.contains(active) || active !== previous && active !== doc.body && active?.isConnected) return;
      (element.querySelector<HTMLElement>('input,button:not(:disabled)') ?? element).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [picker.phase, picker.page]);
  let options = (picker.result?.items ?? []).map(item => ({ id: item.id as string, text: 'name' in item ? `${'code' in item && item.code ? `${item.code} · ` : ''}${item.name}` : (item as CurrentFormSku).skuCode }));
  if (spec) {
    const rows = (picker.result?.items ?? []) as readonly CurrentFormSku[];
    const matching = rows.filter(row => spec === 'color' || row.colorId === selection?.color?.id && (spec === 'fit' || row.fitId === selection?.fit?.id));
    options = matching.map(row => ({ id: spec === 'color' ? row.colorId : spec === 'fit' ? row.fitId : row.id, text: spec === 'color' ? row.colorName : spec === 'fit' ? row.fitName : `${row.sizeName} · ${row.skuCode}` }));
    options = options.filter((item, index) => options.findIndex(other => other.id === item.id) === index);
  }
  return <div ref={host} className="sales-inline-candidates" role="dialog" aria-label={`${spec ? { color: '颜色', fit: '版型', size: '尺码' }[spec] : labels[picker.kind]}候选`} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const nodes = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-candidate-option]') ?? []), current = nodes.indexOf(event.target as HTMLElement);
      if (nodes.length) { event.preventDefault(); nodes[(current + (event.key === 'ArrowDown' ? 1 : nodes.length - 1) + nodes.length) % nodes.length]?.focus(); }
    }
  }}>
    {picker.kind !== 'sku' && <UIInput aria-label={`搜索${labels[picker.kind]}候选`} placeholder={`搜索${labels[picker.kind]}名称或编码`} value={picker.search} onChange={value => { void session.search(value); }} />}
    <div className="sales-inline-options">{picker.phase === 'loading' ? <p role="status">正在读取…</p> : picker.phase === 'error' ? <p role="alert">读取失败。<UIButton onClick={() => { void session.retry(); }}>重试</UIButton></p> : <>
      {options.map(option => <UIButton key={option.id} data-candidate-option type="button" onClick={() => choose(option.id)}>{option.text}</UIButton>)}
      {!options.length && <p>本页无匹配项{picker.result && picker.result.exactTotal > 20n ? '，可翻页继续选择' : ''}</p>}
    </>}</div>
    {picker.phase === 'ready' && <footer><span>第 {picker.page} 页 / 共 {picker.result?.exactTotal.toString()} 个{spec ? '实际规格' : '候选'}</span><UIButton disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton></footer>}
  </div>;
}
export function SalesProposalForm({ session, close, preparation }: { readonly session: SalesProposalSession; readonly close: () => void; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null), [pendingMode, setPendingMode] = useState<SalesBusinessMode | null>(null);
  const modeToConfirm = useRef<SalesBusinessMode | null>(null);
  const [scanner, setScanner] = useState<{ controller: DocumentScanController; direction: 'IN' | 'OUT' } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null), [activeSection, setActiveSection] = useState<'IN' | 'OUT'>('OUT');
  const [viewLine, setViewLine] = useState<string | null>(null), [zeroLine, setZeroLine] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null), triggerRef = useRef<HTMLElement | null>(null);
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
  const candidate = (id: string, label: string, value: ReactNode, open: () => void, disabled = false, spec?: SpecKind, selection?: { color: { id: string } | null; fit: { id: string } | null }, input?: { value: string; change: (value: string) => void; placeholder: string }) => {
    const visible = anchor === id && !!picker;
    const show = (target?: HTMLElement) => { if (disabled) return; if (target) triggerRef.current = target; setAnchor(id); open(); };
    const keyboard = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === 'ArrowDown' || event.key === 'Enter' && input) { event.preventDefault(); show(event.currentTarget); } };
    return <Trigger trigger="click" position="bl" popupVisible={visible} escToClose updateOnScroll autoFitPosition unmountOnExit
      onVisibleChange={next => { if (next) { if (!visible) show(); } else if (visible) dismissPicker(); }}
      popup={() => picker ? <CandidatePopup session={session} picker={picker} {...(spec ? { spec } : {})} {...(selection ? { selection } : {})} close={() => dismissPicker(true)} choose={selected => {
        if (spec) { session.selectSpec(spec, selected); setAnchor(null); restorePickerFocus(); }
        else { void session.select(selected).then(() => { if (!session.getSnapshot().picker) { setAnchor(null); restorePickerFocus(); } }); }
      }} /> : <span />}>
      {input ? <UIInput className="sale-product-input" data-entry-control={id} aria-label={label} role="combobox" aria-expanded={visible} autoComplete="off" placeholder={input.placeholder} value={input.value} disabled={disabled}
        onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }} onChange={value => { input.change(value); if (!visible) show(); else void session.search(value); }} />
        : <UIButton className="sale-select-trigger" data-entry-control={id} aria-label={label} aria-haspopup="dialog" aria-expanded={visible} disabled={disabled} onKeyDown={keyboard} onClick={event => { triggerRef.current = event.currentTarget; }}><span>{value}</span><span aria-hidden="true">⌄</span></UIButton>}
    </Trigger>;
  };
  const cancelMode = () => { modeToConfirm.current = null; setPendingMode(null); };
  const chooseMode = (mode: SalesBusinessMode) => {
    if (mode === salesBusinessMode(draft.businessType) || state.lineEdit) return;
    if (draft.lines.length || Object.values(state.entries).some(entry => entry.product || entry.query.trim())) { modeToConfirm.current = mode; setPendingMode(mode); }
    else session.setBusinessMode(mode);
  };
  const discard = (action: 'reset' | 'cancel', confirmed = false) => { const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed); if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); } };
  const completeEntry = (direction: 'IN' | 'OUT') => {
    if (session.appendEntry(direction)) requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLInputElement>(`[data-entry-control="entry-${direction}-product"]`);
      input?.focus({ preventScroll: true }); input?.select();
    });
  };
  const finishIdentity = (key: string, confirmChange: boolean) => {
    if (confirmChange && !session.confirmLineEdit()) return;
    if (!confirmChange) { dismissPicker(); session.cancelLineEdit(); }
    requestAnimationFrame(() => Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-line-identity]') ?? []).find(node => node.dataset.lineIdentity === key)?.focus({ preventScroll: true }));
  };
  const save = () => { const row = draft.lines.find(row => !row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00'); if (row) setZeroLine(row.key); else preparation?.save(); };
  const sections = combined ? [{ key: 'IN' as const, title: '退回商品', rows: draft.lines.filter(row => row.quantity.startsWith('-')) }, { key: 'OUT' as const, title: '换出商品', rows: draft.lines.filter(row => !row.quantity.startsWith('-')) }] : [{ key: 'OUT' as const, title: '商品明细', rows: draft.lines }];
  const paymentRows = draft.settlements.length ? draft.settlements : [{ key: null, method: null, account: null, direction: 'RECEIVE' as const, amount: '' }];
  const view = draft.lines.find(row => row.key === viewLine), zero = draft.lines.find(row => row.key === zeroLine);
  return <section ref={formRef} aria-label="新增销售草稿" className="tc-workbench tc-editor sale-workbench sale-editor sales-proposal-editor" onKeyDown={event => {
    if (event.key === 'Escape' && state.lineEdit && !picker) { event.preventDefault(); finishIdentity(state.lineEdit.key, false); }
  }}>
    <div className="tc-head sale-head"><h1>新增销货单</h1><SalesStatusTag status="DRAFT" /><span className="sale-muted">· {state.dirty ? '有未保存修改' : '未保存'}</span><div className="actions">
      <UIButton onClick={() => discard('cancel')}>返回列表</UIButton><UIButton disabled={!preparation || preparation.preparing || !!state.lineEdit || !!pendingMode} onClick={save}>保存</UIButton>
      {['审核', '导出', '打印'].map(label => <UIButton disabled key={label} title="请先保存单据">{label}</UIButton>)}
    </div></div>
    <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      <div className="tc-gold-field sale-date-field"><span className="sale-field-label">单据日期 <em>*</em></span><UIDate aria-label="单据日期" value={draft.businessDate} onChange={value => session.setHeader({ businessDate: value })} /></div>
      <div className="tc-gold-field"><span className="sale-field-label">业务类型 <em>*</em></span><UISelect aria-label="业务类型" disabled={!!state.lineEdit} value={salesBusinessMode(draft.businessType)} onChange={value => chooseMode(value as SalesBusinessMode)}><UISelect.Option value="SALE">销售</UISelect.Option><UISelect.Option value="RETURN_EXCHANGE">退货/换货</UISelect.Option></UISelect></div>
      {(['hall', 'salesperson', 'customer', 'warehouse'] as const).map(kind => <div className="tc-gold-field" key={kind}><span className="sale-field-label">{labels[kind]}{kind !== 'salesperson' && <em> *</em>}</span><div className="sale-reference-control">{candidate(kind, `选择${labels[kind]}`, draft[kind]?.name ?? `请选择${labels[kind]}`, () => { void session.openPicker(kind); }, !!state.lineEdit || kind !== 'hall' && !draft.hall)}{kind === 'salesperson' && draft.salesperson && <UIButton className="sale-clear-reference" aria-label="清除营业员" onClick={() => session.clearSalesperson()}>×</UIButton>}</div></div>)}
      <div className="tc-gold-field sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">保存后生成</strong></div>
      <div className="tc-gold-field sale-discount-field"><span className="sale-field-label">整单优惠 / 抹零</span>{combined ? <span className="sale-read-value" /> : <UIInput aria-label="整单优惠" inputMode="decimal" value={draft.orderDiscount} onChange={value => session.setHeader({ orderDiscount: value })} />}</div>
      <div className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value">{totals ? `¥${salesInputMoney(totals.netDueMinor)}` : '待填写'}</strong></div>
      <div className="tc-gold-field sale-payment-field" aria-label="本单收退明细"><span className="sale-field-label">收款</span><div className="sale-payment-rows">
        {paymentRows.map((row, index) => <div className="sale-payment-row" key={row.key ?? 'empty'}>
          {candidate(`method-${index}`, `付款方式 ${index + 1}`, row.method?.name ?? '付款方式', () => { void session.openPaymentPicker(row.key, 'paymentMethod'); }, !draft.hall || !!state.lineEdit)}
          {candidate(`account-${index}`, `资金账户 ${index + 1}`, row.account?.name ?? '资金账户', () => { void session.openPaymentPicker(row.key, 'paymentAccount'); }, !row.method || !!state.lineEdit)}
          <UIInput aria-label={`收退金额 ${index + 1}`} inputMode="decimal" placeholder="金额" disabled={!draft.hall} value={(row.direction === 'REFUND' ? '-' : '') + row.amount} onChange={value => session.updateSignedSettlement(row.key, value)} />
          <div className="sale-payment-actions">{index === paymentRows.length - 1 && paymentRows.length < 3 && <UIButton className="sale-link" disabled={!draft.hall || !row.method || !row.account || !/^\d+(?:\.\d{1,2})?$/.test(row.amount)} onClick={() => session.addSettlement()}>添加</UIButton>}{row.key && <UIButton className="sale-link" aria-label={`删除收退 ${index + 1}`} onClick={() => session.removeSettlement(row.key!)}>删除</UIButton>}</div>
        </div>)}
      </div><span className={`sale-payment-balance ${totals?.balanced ? 'is-settled' : ''}`}>{paymentHint(totals)}</span></div>
    </div></div>
    <div className="sale-note-row"><span className="sale-field-label">备注</span><UIInput aria-label="备注" placeholder="输入本单备注（可选）" maxLength={10000} value={draft.note} onChange={value => session.setHeader({ note: value })} /></div>
    {sections.map(section => {
      const active = !combined || activeSection === section.key, entry = state.entries[section.key];
      const entryOpen = (kind: 'product' | 'sku') => { void session.openEntryPicker(section.key, kind); };
      return <section className="sale-entry-section" key={section.key} data-business-section={section.key === 'IN' ? 'in' : 'out'}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong><div>
        {!active && <UIButton className="sale-link" disabled={!!state.lineEdit} onClick={() => { dismissPicker(); setActiveSection(section.key); }}>录入{section.title}</UIButton>}
        {active && <UIButton className="sale-link" disabled={!session.canScan || preparation?.preparing || !!state.lineEdit} title={session.canScan ? undefined : '请先选择营业厅和仓库'} onClick={() => { dismissPicker(); setScanner({ controller: session.createScanner(section.key), direction: section.key }); }}>扫码录入</UIButton>}
      </div></div><div className="sale-lines"><table className="sale-lines-table"><caption className="sr-only">{section.title}</caption><colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead><tr>{columns.map(name => <th key={name} className={name === '操作' ? 'ui-action-cell' : undefined}>{name}</th>)}</tr></thead><tbody>
      {section.rows.map(row => {
        const editing = state.lineEdit?.key === row.key ? state.lineEdit : null, product = editing?.product ?? row.product;
        const editOpen = (kind: 'product' | 'sku') => { void session.openLinePicker(row.key, kind); };
        const identity = (part: 'product' | SpecKind, value: ReactNode) => <UIButton className="sale-identity-trigger" data-line-identity={row.key} aria-label={`修改${part === 'product' ? '商品' : { color: '颜色', fit: '版型', size: '尺码' }[part]} ${row.sku.skuCode}`} disabled={!active || !!state.lineEdit} onClick={event => { triggerRef.current = event.currentTarget; setAnchor(`edit-${row.key}-${part}`); editOpen(part === 'product' ? 'product' : 'sku'); }}><span>{value}</span><span className="sale-edit-mark">改</span></UIButton>;
        const rawPrice = row.isGift ? '0.00' : row.pricingRule === 'DISCOUNT' ? linePrice(row) ?? '' : row.dealPrice;
        return <tr key={row.key} className={editing ? 'sale-identity-editing' : ''}>
          <td>{editing ? <>{candidate(`edit-${row.key}-product`, '修改商品款号 / 名称', `${product.code} · ${product.name}`, () => editOpen('product'))}<small className="mx-original-hint">原：{row.product.code} / {row.sku.colorName} / {row.sku.fitName} / {row.sku.sizeName} · {row.quantity}</small></> : <div className="sale-product-cell">{identity('product', <><strong>{row.product.code}</strong><span className="sale-product-name">{row.product.name}</span></>)}{row.isGift && <span className="sale-gift">赠品</span>}</div>}</td>
          {(['color', 'fit', 'size'] as const).map(kind => <td key={kind}>{editing ? candidate(`edit-${row.key}-${kind}`, `修改${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, kind === 'color' ? editing.color?.name ?? '颜色' : kind === 'fit' ? editing.fit?.name ?? '版型' : editing.sku?.sizeName ?? '尺码', () => editOpen('sku'), kind === 'fit' && !editing.color || kind === 'size' && (!editing.color || !editing.fit), kind, editing) : identity(kind, kind === 'color' ? row.sku.colorName : kind === 'fit' ? row.sku.fitName : row.sku.sizeName)}</td>)}
          <td><UIInput data-proposal-quantity={row.key} aria-label={`${row.sku.skuCode} 数量`} className={row.quantity.startsWith('-') ? 'negative' : ''} inputMode="numeric" value={row.quantity} disabled={!active || !!editing} onChange={value => { movedQuantity.current = { key: row.key, previous: formRef.current?.ownerDocument.activeElement ?? null }; session.updateLine(row.key, { quantity: value }); }} /></td>
          <td className="sale-num sale-muted">{product.retailPrice ?? '未记录'}</td>
          <td>{product.retailPrice !== null && !row.isGift && <span className="sale-discount-control"><UIInput aria-label={`${row.sku.skuCode} 折扣`} inputMode="decimal" value={displayedDiscount(row)} placeholder="折扣" disabled={!active || !!editing} onChange={value => session.updateLine(row.key, { pricingRule: 'DISCOUNT', discount: value, zeroConfirmed: false })} /><span>折</span></span>}</td>
          <td><UIInput aria-label={`${row.sku.skuCode} 单价`} placeholder="待填写" inputMode="decimal" value={rawPrice} disabled={!active || row.isGift || !!editing} onChange={value => session.updateLine(row.key, { pricingRule: 'UNIT_PRICE', dealPrice: value, zeroConfirmed: false })} onBlur={() => { if (!row.isGift && !row.zeroConfirmed && linePrice(row) === '0.00') setZeroLine(row.key); }} /></td>
          <td className="sale-num">{previewAmount(row)}</td><td className="ui-action-cell"><div className="sale-row-actions">{editing ? <><UIButton className="sale-link" disabled={!editing.sku || !!picker} onClick={() => finishIdentity(row.key, true)}>确认改选</UIButton><UIButton className="sale-link" onClick={() => finishIdentity(row.key, false)}>取消改选</UIButton></> : <><UIButton className="sale-link" onClick={() => setViewLine(row.key)}>查看</UIButton>{active && <><UIButton className="sale-link" onClick={() => session.updateLine(row.key, { isGift: !row.isGift })}>{row.isGift ? '取消赠品' : '赠品'}</UIButton><UIButton className="sale-link" aria-label={`删除 ${row.sku.skuCode}`} onClick={() => session.removeLine(row.key)}>删除</UIButton></>}</>}</div></td>
        </tr>;
      })}
      {active && <tr className="sale-entry-row" data-entry-direction={section.key}>
        <td>{candidate(`entry-${section.key}-product`, `${section.title}款号 / 名称`, entry.product ? `${entry.product.code} · ${entry.product.name}` : '商品款号 / 名称', () => entryOpen('product'), !draft.hall || !!state.lineEdit, undefined, undefined, { value: entry.query, change: value => session.updateEntry(section.key, { query: value }), placeholder: '商品款号 / 名称' })}{entry.product && <small>{entry.product.name}</small>}</td>
        {(['color', 'fit', 'size'] as const).map(kind => <td key={kind}>{candidate(`entry-${section.key}-${kind}`, `${section.title}${{ color: '颜色', fit: '版型', size: '尺码' }[kind]}`, kind === 'color' ? entry.color?.name ?? '颜色' : kind === 'fit' ? entry.fit?.name ?? '版型' : entry.sku?.sizeName ?? '尺码', () => entryOpen('sku'), !entry.product || !!state.lineEdit || kind === 'fit' && !entry.color || kind === 'size' && (!entry.color || !entry.fit), kind, entry)}</td>)}
        <td><UIInput aria-label={`${section.title}本行数量`} className={entry.quantity.startsWith('-') ? 'negative' : ''} inputMode="numeric" value={entry.product ? entry.quantity : ''} disabled={!entry.product || !!state.lineEdit} onChange={value => session.updateEntry(section.key, { quantity: value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); completeEntry(section.key); } }} /></td>
        <td className="sale-num sale-muted">{entry.product?.retailPrice ?? ''}</td><td />
        <td><UIInput aria-label={`${section.title}本行成交单价`} placeholder="待填写" inputMode="decimal" value={entry.dealPrice} disabled={!entry.product || !!state.lineEdit} onChange={value => session.updateEntry(section.key, { dealPrice: value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); completeEntry(section.key); } }} /></td><td />
        <td className="ui-action-cell">{entry.product || entry.query ? <div className="sale-row-actions"><UIButton className="sale-link" disabled={!entry.sku || !!state.lineEdit} onClick={() => completeEntry(section.key)}>完成</UIButton><UIButton className="sale-link" onClick={() => session.clearEntry(section.key)}>清除</UIButton></div> : null}</td>
      </tr>}
      </tbody></table></div></section>;
    })}
    <div className="sales-proposal-feedback">{state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <UIButton onClick={preparation.cancel}>取消新单准备</UIButton>}</div>
    <footer className="sale-summary">{combined ? <div className="sale-summary-primary" data-sales-quantity-summary><strong>退回 {quantitySummary(sections[0]!.rows.filter(row => !row.isGift), true)}</strong><strong>换出 {quantitySummary(sections[1]!.rows.filter(row => !row.isGift), true)}</strong><strong>{totals?.netDueMinor === '0' ? '差额' : totals?.netDueMinor.startsWith('-') ? '应退' : '应收'} ¥{totals ? salesInputMoney(totals.netDueMinor.replace(/^-/, '')) : '待填写'}</strong></div> : <><div className="sale-summary-detail"><strong data-sales-quantity-summary>{new Set(draft.lines.map(row => row.sku.productId)).size} 款 · 数量 {quantitySummary(draft.lines)}</strong>{draft.lines.some(row => row.isGift) && <span>其中赠品 {quantitySummary(draft.lines.filter(row => row.isGift))}</span>}</div><div className="sale-summary-primary"><strong>销售金额 ¥{totals ? salesInputMoney(totals.grossMinor) : '待填写'}</strong><strong>优惠 ¥{totals ? salesInputMoney(totals.orderDiscountMinor) : draft.orderDiscount}</strong><strong>应结 ¥{totals ? salesInputMoney(totals.netDueMinor) : '待填写'}</strong></div></>}</footer>
    {scanner && <DocumentScan controller={scanner.controller} title={scanner.direction === 'IN' ? '退回商品扫码录入' : combined ? '换出商品扫码录入' : '销货扫码录入'} rows={draft.lines.filter(row => row.quantity.startsWith('-') === (scanner.direction === 'IN'))} close={() => setScanner(null)} update={(key, value) => session.updateLine(key, { quantity: value })} remove={key => session.removeLine(key)} />}
    {view && <StandardOverlay title="商品规格" label="商品规格" closeLabel="关闭商品规格" close={() => setViewLine(null)} width={560}><dl className="sale-spec-facts">{[['款号', view.product.code], ['商品名称', view.product.name], ['颜色', view.sku.colorName], ['版型', view.sku.fitName], ['尺码', view.sku.sizeName], ['规格编码', view.sku.skuCode], ['参考零售价', view.product.retailPrice ?? '未提供']].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></StandardOverlay>}
    {zero && <StandardOverlay role="alertdialog" title="确认普通零价" label="确认普通零价" closeLabel="关闭零价确认" close={() => setZeroLine(null)} width={420}>{dismiss => <><p>{zero.product.code} 的成交单价为零。确认按普通商品零价处理？保存仍须通过最低价校验。</p><div className="sales-proposal-confirm-actions"><UIButton onClick={dismiss}>返回修改</UIButton><UIButton onClick={() => { session.updateLine(zero.key, { zeroConfirmed: true }); setZeroLine(null); }}>确认零价</UIButton></div></>}</StandardOverlay>}
    {pendingMode && <StandardOverlay className="sales-proposal-confirm" role="alertdialog" title="切换业务类型" label="切换业务类型" closeLabel="关闭业务类型确认" close={cancelMode} initialFocus="[data-erp-keep-mode]" width={700}>{dismiss => <><p>切换为{pendingMode === 'SALE' ? '销售' : '退货/换货'}后，整单优惠将归零。商品数量、单价和收退记录将保留，请核对商品方向与应结金额。</p><div className="sales-proposal-confirm-actions"><UIButton data-erp-keep-mode onClick={dismiss}>取消</UIButton><UIButton onClick={() => { const next = modeToConfirm.current; if (!next) return; cancelMode(); session.setBusinessMode(next); }}>确定</UIButton></div></>}</StandardOverlay>}
    {confirm && <StandardOverlay className="sales-proposal-confirm" role="alertdialog" title="放弃未保存输入？" label="放弃未保存输入" closeLabel="关闭放弃输入确认" close={() => setConfirm(null)} initialFocus="[data-erp-keep-input]" width={420}>{dismiss => <><p>将放弃本次未保存输入，是否继续？</p><div className="sales-proposal-confirm-actions"><UIButton data-erp-keep-input onClick={dismiss}>保留输入</UIButton><UIButton onClick={() => discard(confirm, true)}>确认放弃</UIButton></div></>}</StandardOverlay>}
  </section>;
}
