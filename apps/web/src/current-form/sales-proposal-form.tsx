import { SalesStatusTag } from '../sales/sales-status-tag.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { UIButton, UICheckbox, UIDate, UIInput, UISelect, UITextArea } from '../components/standard-controls.tsx';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SalesProposalSession, salesProposalMoney, type SalesProposalLine, type SalesProposalPicker } from './sales-proposal.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import './sales-proposal.css';
import { salesBusinessMode, type SalesBusinessMode } from './sales-business-mode.ts';
const labels: Record<SalesProposalPicker, string> = { hall: '营业厅', customer: '客户', salesperson: '营业员', warehouse: '仓库', paymentMethod: '付款方式', paymentAccount: '收退账户', product: '商品', sku: '实际规格' };
// Display only. Validation, price authority and the native SAVE stay in the session.
function previewAmount(row: SalesProposalLine): string {
  try {
    if (!/^-?[1-9]\d{0,18}$/.test(row.quantity)) return '待填写';
    const cents = (value: string): bigint => {
      if (!/^\d{1,100}(?:\.\d{1,2})?$/.test(value.trim())) throw Error();
      const [whole, fraction = ''] = value.trim().split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
    };
    let price = 0n;
    if (!row.isGift) {
      if (row.pricingRule === 'UNIT_PRICE') price = cents(row.dealPrice);
      else {
        if (row.product.retailPrice === null || !/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim())) return '待填写';
        const [whole, fraction = '0'] = row.discount.trim().split('.');
        price = discountUnitPrice(minorAmount(cents(row.product.retailPrice).toString()), Number(whole) * 10 + Number(fraction));
      }
    }
    return salesInputMoney((BigInt(row.quantity) * price).toString());
  } catch { return '待填写'; }
}
/** Frozen sales-current editor hierarchy with proposal-backed controls. Trusted
 * preparation and native SAVE are unchanged; no local IDs or barcode facts. */
export function SalesProposalForm({ session, close, preparation }: { readonly session: SalesProposalSession; readonly close: () => void; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null), formRef = useRef<HTMLElement>(null);
  const entryDirection = useRef<'IN' | 'OUT'>('OUT');
  const movedQuantity = useRef<{ key: string; previous: Element | null } | null>(null);
  useLayoutEffect(() => {
    const target = movedQuantity.current; movedQuantity.current = null;
    if (!target || !formRef.current) return;
    const doc = formRef.current.ownerDocument, active = doc.activeElement;
    if (active && active !== doc.body && active !== target.previous && active.isConnected) return;
    const input = Array.from(formRef.current.querySelectorAll<HTMLInputElement>('[data-proposal-quantity]')).find(node => node.dataset.proposalQuantity === target.key);
    input?.focus({ preventScroll: true });
  }, [state.draft.lines]);
  const openPicker = (kind: Parameters<SalesProposalSession['openPicker']>[0], _trigger: HTMLElement) => { void session.openPicker(kind); };
  useLayoutEffect(() => {
    const dialog = pickerRef.current;
    if (!state.picker || !dialog || dialog.contains(dialog.ownerDocument.activeElement)) return;
    // A selected first-level candidate or retry/page button can unmount while
    // the same dialog stays open. Re-home only lost focus, never a surviving
    // search input/candidate. This also covers batched loading→ready updates.
    const input = dialog.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)');
    const button = dialog.querySelector<HTMLElement>('button:not(:disabled)');
    (input ?? button ?? dialog).focus({ preventScroll: true });
  }, [state.picker]);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker } = state;
  const totals = salesProposalMoney(draft), combined = draft.businessType !== 'SALE';
  const sections = combined ? [
    { key: 'IN' as const, title: '退回商品', rows: draft.lines.filter(row => row.quantity.startsWith('-')) },
    { key: 'OUT' as const, title: '换出商品', rows: draft.lines.filter(row => !row.quantity.startsWith('-')) },
  ] : [{ key: 'OUT' as const, title: '商品明细', rows: draft.lines }];
  const addProduct = (direction: 'IN' | 'OUT', trigger: HTMLElement) => { entryDirection.current = direction; openPicker('product', trigger); };
  const discard = (action: 'reset' | 'cancel', confirmed = false) => {
    const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed);
    if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); }
  };
  return <section ref={formRef} aria-label="新增销售草稿" className="tc-workbench tc-editor sale-workbench sale-editor sales-proposal-editor">
    <div className="tc-head sale-head"><h1>新增销货单</h1><SalesStatusTag status="DRAFT" /><span className="sale-muted">· {state.dirty ? '有未保存修改' : '未保存'}</span><div className="actions">
      <UIButton type="button" onClick={() => discard('cancel')}>返回列表</UIButton>{preparation ? <UIButton type="button" disabled={preparation.preparing} onClick={preparation.save}>保存</UIButton> : <UIButton type="button" disabled title="最低价、条码及可信新单准备尚未接入">保存（尚未接入）</UIButton>}
      {['审核', '导出', '打印'].map(label => <UIButton type="button" disabled key={label} title={`${label}尚未接入；本地草稿未保存`}>{label}</UIButton>)}
    </div></div>
    <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      <label className="tc-gold-field sale-date-field"><span className="sale-field-label">单据日期 <em>*</em></span><UIDate aria-label="单据日期"  value={draft.businessDate} onChange={nextValue => session.setHeader({ businessDate: nextValue })} /></label>
      <label className="tc-gold-field"><span className="sale-field-label">业务类型 <em>*</em></span><UISelect aria-label="业务类型" value={salesBusinessMode(draft.businessType)} onChange={nextValue => session.setBusinessMode(nextValue as SalesBusinessMode)}><UISelect.Option value="SALE">销售</UISelect.Option><UISelect.Option value="RETURN_EXCHANGE">退换货</UISelect.Option></UISelect></label>
      {(['hall', 'salesperson', 'customer', 'warehouse'] as const).map(kind => <div className="tc-gold-field" key={kind}><span className="sale-field-label">{kind === 'warehouse' ? '出库仓' : labels[kind]}{kind !== 'salesperson' && <em> *</em>}</span><div className="sale-reference-control"><UIButton className="sale-select-trigger" type="button" aria-label={`选择${labels[kind]}`} disabled={kind !== 'hall' && !draft.hall} onClick={event => openPicker(kind, event.currentTarget)}><span>{draft[kind]?.name ?? `选择${labels[kind]}`}</span><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></UIButton>{kind === 'salesperson' && <UIButton className="sale-clear-reference" type="button" aria-label="清除营业员" title="清除营业员" disabled={!draft.salesperson} onClick={() => session.clearSalesperson()}>×</UIButton>}</div></div>)}
      <div className="tc-gold-field sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">保存后生成</strong></div>
      <label className="tc-gold-field sale-discount-field"><span className="sale-field-label">整单优惠 / 抹零</span><UIInput aria-label="整单优惠" readOnly={draft.businessType !== 'SALE'} inputMode="decimal" value={draft.orderDiscount} onChange={nextValue => session.setHeader({ orderDiscount: nextValue })} /></label>
      <div className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value">{totals ? `¥${salesInputMoney(totals.netDueMinor)}` : '待校验'}</strong></div>
      <section className="tc-gold-field sale-payment-field" aria-label="本单收退明细"><div className="sale-payment-caption"><span className="sale-field-label">收退账户 / 金额</span><UIButton className="sale-link" type="button" disabled={!draft.hall} onClick={event => openPicker('paymentMethod', event.currentTarget)}>添加收退明细</UIButton></div>
        <div className="sale-payment-rows">{draft.settlements.length === 0 && <span className="sale-payment-empty">尚未添加收退记录</span>}{draft.settlements.map((row, index) => <div className="sale-payment-row" key={row.key}><UIButton className="sale-select-trigger sale-payment-account" type="button" aria-label={`收退账户 ${index + 1}`} title={`${row.method.name} · ${row.account.name}`} onClick={() => { void session.openSettlementPicker(row.key); }}><span>{row.method.name} · {row.account.name}</span><span aria-hidden="true">⌄</span></UIButton>
          <UISelect aria-label={`收退方向 ${index + 1}`} value={row.direction} onChange={nextValue => session.updateSettlement(row.key, { direction: nextValue as 'RECEIVE' | 'REFUND' })}><UISelect.Option value="RECEIVE">收款</UISelect.Option><UISelect.Option value="REFUND">退款</UISelect.Option></UISelect>
          <UIInput aria-label={`收退金额 ${index + 1}`} placeholder="请输入金额" inputMode="decimal" value={row.amount} onChange={nextValue => session.updateSettlement(row.key, { amount: nextValue })} /><UIButton className="sale-link" type="button" aria-label={`删除收退 ${index + 1}`} onClick={() => session.removeSettlement(row.key)}>删除</UIButton></div>)}</div>
      </section>
    </div></div>
    <label className="sale-note-row"><span className="sale-field-label">备注</span><UITextArea aria-label="备注" rows={1} placeholder="输入本单备注（可选）" maxLength={10000} value={draft.note} onChange={nextValue => session.setHeader({ note: nextValue })} /></label>
    <p className="sales-proposal-note" role="status">{draft.businessType !== 'SALE' ? '退回商品填负数量，换出商品填正数量；退换货不关联原单，收退金额需与应结金额一致。' : '请填写商品数量、成交价格及本单收款。'}</p>
    {sections.map(section => <section className="sale-entry-section" key={section.key} data-business-section={section.key === 'IN' ? 'in' : 'out'}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong><span className="sale-muted">{section.rows.length} 行</span><UIButton type="button" className="sale-link" disabled={!draft.hall} onClick={event => addProduct(section.key, event.currentTarget)}>{combined ? `添加${section.title}` : '添加商品规格'}</UIButton><UIButton type="button" disabled title="条码读取尚未接入，不能生成或猜测条码">扫码录入</UIButton></div>
      <div className="sale-lines"><table className="sale-lines-table" aria-label={`销售实际明细 · ${section.title}`}><colgroup>{[270,100,122,84,80,95,90,108,99,142].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', section.key === 'IN' ? '退货单价' : '成交单价', '金额', '操作'].map(label => <th className={label === '操作' ? 'ui-action-cell' : undefined} key={label}>{label}</th>)}</tr></thead><tbody>{section.rows.map(row => <tr key={row.key}>
        <td><div className="sale-product-cell"><strong>{row.sku.productCode}</strong><span className="sale-product-name" title={row.sku.productName}>{row.sku.productName}</span>{row.isGift && <span className="sale-gift">赠品</span>}</div></td><td>{row.sku.colorName}</td><td>{row.sku.fitName}</td><td>{row.sku.sizeName}</td>
        <td><UIInput className={row.quantity.startsWith('-') ? 'negative' : undefined} aria-label={`${row.sku.skuCode} 数量`} data-proposal-quantity={row.key} inputMode="numeric" value={row.quantity} onChange={nextValue => { if (row.quantity.startsWith('-') !== nextValue.startsWith('-')) movedQuantity.current = { key: row.key, previous: formRef.current?.ownerDocument.activeElement ?? null }; session.updateLine(row.key, { quantity: nextValue }); }} /></td>
        <td className="sale-num sale-muted">{row.product.retailPrice ?? '未提供'}<small>最低价未提供</small></td>
        <td><UISelect className="sale-pricing-rule" aria-label={`${row.sku.skuCode} 计价方式`} value={row.pricingRule} disabled={row.isGift} onChange={nextValue => session.updateLine(row.key, { pricingRule: nextValue as 'UNIT_PRICE' | 'DISCOUNT' })}><UISelect.Option value="UNIT_PRICE">成交单价</UISelect.Option><UISelect.Option value="DISCOUNT" disabled={row.product.retailPrice === null}>折扣</UISelect.Option></UISelect>{row.pricingRule === 'DISCOUNT' && <span className="sale-discount-control"><UIInput aria-label={`${row.sku.skuCode} 折扣`} inputMode="decimal" value={row.discount} disabled={row.isGift} onChange={nextValue => session.updateLine(row.key, { discount: nextValue })} /><span>折</span></span>}</td>
        <td>{row.pricingRule === 'UNIT_PRICE' ? <UIInput aria-label={`${row.sku.skuCode} 单价`} placeholder="待填写" inputMode="decimal" value={row.dealPrice} disabled={row.isGift} onChange={nextValue => session.updateLine(row.key, { dealPrice: nextValue })} /> : <span className="sale-muted">按折扣计价</span>}</td>
        <td className="sale-num">{previewAmount(row)}</td>
        <td className="ui-action-cell"><UIButton className="sale-link" type="button" aria-label={`删除 ${row.sku.skuCode}`} onClick={() => session.removeLine(row.key)}>删除</UIButton><div className="sale-row-flags"><UICheckbox aria-label={`${row.sku.skuCode} 赠品`} checked={row.isGift} onChange={nextValue => session.updateLine(row.key, { isGift: nextValue })}>赠品</UICheckbox><UICheckbox aria-label={`${row.sku.skuCode} 确认零价`} checked={row.zeroConfirmed} disabled={row.isGift} onChange={nextValue => session.updateLine(row.key, { zeroConfirmed: nextValue })}>确认普通零价</UICheckbox></div></td>
      </tr>)}{section.rows.length === 0 && <tr className="sale-entry-row sales-proposal-empty-row"><td><UIButton className="sale-entry-add" type="button" disabled={!draft.hall} onClick={event => addProduct(section.key, event.currentTarget)}>选择商品款号 / 名称</UIButton></td><td>—</td><td>—</td><td>—</td><td colSpan={6}>{draft.hall ? '点击添加商品规格，填写数量与价格' : '请先选择营业厅，再添加商品实际规格'}</td></tr>}</tbody></table></div>
    </section>)}
    <div className="sales-proposal-feedback">{state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <UIButton type="button" onClick={preparation.cancel}>取消新单准备</UIButton>}</div>
    <footer className="sale-summary"><div className="sale-summary-detail"><strong>{new Set(draft.lines.map(row => row.sku.productId)).size} 款 · {draft.lines.length} 行</strong><span className="sale-muted">数量按实际明细保存</span></div><div className="sale-summary-primary">{totals ? <><strong>销售金额 ¥{salesInputMoney(totals.grossMinor)}</strong><strong>应结 ¥{salesInputMoney(totals.netDueMinor)}</strong><strong>收退 {totals.settledMinor === null ? '待填写' : `¥${salesInputMoney(totals.settledMinor)}`}</strong><span>{totals.balanced ? '已配平' : totals.differenceMinor === null ? '收退金额待填写' : `待结 ¥${salesInputMoney(totals.differenceMinor)}`}</span></> : <span className="sale-muted">数量或价格待填写</span>}</div></footer>
    {picker && <StandardOverlay className="sales-proposal-picker" title={`${labels[picker.kind]}${picker.product ? ` · ${picker.product.name}` : picker.method ? ` · ${picker.method.name}` : ''}`} label="当前候选" closeLabel="关闭当前候选弹窗" close={() => session.closePicker()} initialFocus=".sales-proposal-search input" width={620}>
      {dismiss => <div ref={pickerRef} className="sales-proposal-candidates">
      {picker.kind !== 'sku' && <label className="sales-proposal-search">搜索<UIInput autoFocus aria-label="搜索候选" placeholder={`搜索${labels[picker.kind]}名称或编码`} value={picker.search} onChange={nextValue => { void session.search(nextValue); }} /></label>}
      <div className="sales-proposal-options">{picker.phase === 'loading' && <p role="status">正在读取当前候选…</p>}{picker.phase === 'error' && <p role="alert">候选读取失败。<UIButton type="button" onClick={() => { void session.retry(); }}>重试候选</UIButton></p>}{picker.phase === 'ready' && <><ul>{picker.result?.items.map(item => {
        const sku = item as CurrentFormSku; const label = picker.kind === 'sku' ? `${sku.productCode} · ${sku.colorName} · ${sku.fitName} · ${sku.sizeName}` : 'name' in item ? item.name : '';
        return <li key={item.id}><UIButton type="button" onClick={() => { void session.select(item.id, entryDirection.current === 'IN' ? '-1' : '1'); }}>{label}</UIButton></li>;
      })}</ul>{picker.result?.items.length === 0 && <p>无匹配候选</p>}</>}</div>
      {picker.kind === 'paymentAccount' && picker.phase === 'ready' && <p className="sale-muted">账户推荐：{picker.result?.recommendationAvailability === 'AVAILABLE' ? '可用（仅提示）' : '未提供，不自动选择'}</p>}
      {picker.phase === 'ready' && <footer><span>第 {picker.page} 页 · 共 {picker.result?.exactTotal.toString()} 项</span><div><UIButton type="button" disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton type="button" disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton></div></footer>}
      <UIButton type="button" onClick={dismiss}>关闭候选</UIButton>
      </div>}
    </StandardOverlay>}
    {confirm && <StandardOverlay className="sales-proposal-confirm" role="alertdialog" title="放弃未保存输入？" label="放弃未保存输入" closeLabel="关闭放弃输入确认" close={() => setConfirm(null)} initialFocus="[data-erp-keep-input]" width={420}>
      {dismiss => <><p>将放弃本次未保存输入，是否继续？</p><div className="sales-proposal-confirm-actions"><UIButton data-erp-keep-input type="button" onClick={dismiss}>保留输入</UIButton><UIButton type="button" onClick={() => discard(confirm, true)}>确认放弃</UIButton></div></>}
    </StandardOverlay>}
  </section>;
}
