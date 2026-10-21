import { useState, useSyncExternalStore } from 'react';
import { SalesProposalSession, type SalesProposalPicker } from './sales-proposal.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import type { CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
const labels: Record<SalesProposalPicker, string> = { hall: '营业厅', customer: '客户', salesperson: '营业员', warehouse: '仓库', paymentMethod: '付款方式', paymentAccount: '收退账户', product: '商品', sku: '实际规格' };
/** Explicit opt-in proposal view; trusted preparation/native save are separate. */
export function SalesProposalForm({ session, close, preparation }: { readonly session: SalesProposalSession; readonly close: () => void; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker, totals } = state;
  const discard = (action: 'reset' | 'cancel', confirmed = false) => {
    const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed);
    if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); }
  };
  return <section aria-label="新增销售草稿" className="sale-workbench">
    <h1>新增销售草稿</h1><p role="status">本地未保存，不生成单号，不改变库存。独立退货／换货不关联原销货；正数量出库、负数量入库，整单优惠为零。</p>
    <button type="button" onClick={() => discard('cancel')}>取消新增</button><button type="button" onClick={() => discard('reset')}>重置草稿</button>
    {confirm && <div role="alert"><p>将放弃本次未保存输入，是否继续？</p><button type="button" onClick={() => setConfirm(null)}>保留输入</button><button type="button" onClick={() => discard(confirm, true)}>确认放弃</button></div>}
    <label>业务类型<select aria-label="业务类型" value={draft.businessType} onChange={event => session.setBusinessType(event.target.value as typeof draft.businessType)}><option value="SALE">销售</option><option value="RETURN">独立退货</option><option value="EXCHANGE">独立换货</option></select></label>
    <label>单据日期<input aria-label="单据日期" type="date" value={draft.businessDate} onChange={event => session.setHeader({ businessDate: event.target.value })} /></label>
    {(['hall', 'customer', 'salesperson', 'warehouse'] as const).map(kind => <div key={kind}>{labels[kind]}：{draft[kind]?.name ?? '未选择'}<button type="button" disabled={kind !== 'hall' && !draft.hall} onClick={() => { void session.openPicker(kind); }}>选择{labels[kind]}</button></div>)}
    <button type="button" disabled={!draft.salesperson} onClick={() => session.clearSalesperson()}>清除营业员</button>
    <label>备注<textarea aria-label="备注" maxLength={10000} value={draft.note} onChange={event => session.setHeader({ note: event.target.value })} /></label>
    <label>整单优惠<input aria-label="整单优惠" readOnly={draft.businessType !== 'SALE'} inputMode="decimal" value={draft.orderDiscount} onChange={event => session.setHeader({ orderDiscount: event.target.value })} /></label>
    <button type="button" disabled={!draft.hall} onClick={() => { void session.openPicker('product'); }}>添加商品规格</button>
    <button type="button" disabled={!draft.hall} onClick={() => { void session.openPicker('paymentMethod'); }}>添加收退明细</button>
    {picker && <section aria-label="当前候选"><h2>{labels[picker.kind]}{picker.product ? ` · ${picker.product.name}` : picker.method ? ` · ${picker.method.name}` : ''}</h2>
      <button type="button" onClick={() => session.closePicker()}>关闭候选</button>
      {picker.kind !== 'sku' && <label>搜索<input aria-label="搜索候选" value={picker.search} onChange={event => { void session.search(event.target.value); }} /></label>}
      {picker.phase === 'loading' && <p role="status">正在读取当前候选…</p>}
      {picker.phase === 'error' && <button type="button" onClick={() => { void session.retry(); }}>重试候选</button>}
      {picker.phase === 'ready' && <><ul>{picker.result?.items.map(item => {
        const sku = item as CurrentFormSku;
        const label = picker.kind === 'sku' ? `${sku.productCode} · ${sku.colorName} · ${sku.fitName} · ${sku.sizeName}` : 'name' in item ? item.name : '';
        return <li key={item.id}><button type="button" onClick={() => { void session.select(item.id); }}>{label}</button></li>;
      })}</ul>{picker.result?.items.length === 0 && <p>无匹配候选</p>}{picker.kind === 'paymentAccount' && <p>账户推荐：{picker.result?.recommendationAvailability === 'AVAILABLE' ? '可用（仅提示）' : '未提供，不自动选择'}</p>}
        <p>第 {picker.page} 页 · 共 {picker.result?.exactTotal.toString()} 项</p><button type="button" disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</button><button type="button" disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</button></>}
    </section>}
    <table><caption>销售实际明细</caption><thead><tr>{['商品／规格', '数量', '参考价', '计价方式', '单价／折扣', '零价／赠品', '操作'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{draft.lines.map(row => <tr key={row.key}>
      <td>{row.sku.productCode} · {row.sku.productName} · {row.sku.colorName} · {row.sku.fitName} · {row.sku.sizeName}</td>
      <td><input aria-label={`${row.sku.skuCode} 数量`} inputMode="numeric" value={row.quantity} onChange={event => session.updateLine(row.key, { quantity: event.target.value })} /></td>
      <td>{row.product.retailPrice ?? '未提供'}<small>最低价未提供</small></td>
      <td><select aria-label={`${row.sku.skuCode} 计价方式`} value={row.pricingRule} disabled={row.isGift} onChange={event => session.updateLine(row.key, { pricingRule: event.target.value as 'UNIT_PRICE' | 'DISCOUNT' })}><option value="UNIT_PRICE">成交单价</option><option value="DISCOUNT" disabled={row.product.retailPrice === null}>折扣</option></select></td>
      <td>{row.pricingRule === 'UNIT_PRICE' ? <input aria-label={`${row.sku.skuCode} 单价`} inputMode="decimal" value={row.dealPrice} disabled={row.isGift} onChange={event => session.updateLine(row.key, { dealPrice: event.target.value })} /> : <input aria-label={`${row.sku.skuCode} 折扣`} inputMode="decimal" value={row.discount} disabled={row.isGift} onChange={event => session.updateLine(row.key, { discount: event.target.value })} />}</td>
      <td><label><input type="checkbox" aria-label={`${row.sku.skuCode} 赠品`} checked={row.isGift} onChange={event => session.updateLine(row.key, { isGift: event.target.checked })} />赠品</label><label><input type="checkbox" aria-label={`${row.sku.skuCode} 确认零价`} checked={row.zeroConfirmed} disabled={row.isGift} onChange={event => session.updateLine(row.key, { zeroConfirmed: event.target.checked })} />确认普通零价</label></td>
      <td><button type="button" aria-label={`删除 ${row.sku.skuCode}`} onClick={() => session.removeLine(row.key)}>删除</button></td>
    </tr>)}</tbody></table>
    <fieldset><legend>本单收退明细</legend>{draft.settlements.map((row, index) => <div key={row.key}><span>{row.method.name} · {row.account.name}</span>
      <select aria-label={`收退方向 ${index + 1}`} value={row.direction} onChange={event => session.updateSettlement(row.key, { direction: event.target.value as 'RECEIVE' | 'REFUND' })}><option value="RECEIVE">收款</option><option value="REFUND">退款</option></select>
      <input aria-label={`收退金额 ${index + 1}`} inputMode="decimal" value={row.amount} onChange={event => session.updateSettlement(row.key, { amount: event.target.value })} /><button type="button" aria-label={`删除收退 ${index + 1}`} onClick={() => session.removeSettlement(row.key)}>删除</button></div>)}</fieldset>
    {state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}
    {totals && <p>应结 ¥{salesInputMoney(totals.netDueMinor)} · 收退 ¥{salesInputMoney(totals.settledMinor)} · {totals.balanced ? '已配平（不代表可审核）' : '未配平'}</p>}
    <button type="button" onClick={() => session.validate()}>校验草稿</button>{preparation ? <button type="button" disabled={preparation.preparing} onClick={preparation.save}>保存</button> : <button type="button" disabled title="最低价、条码及可信新单准备尚未接入">保存（尚未接入）</button>}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <button type="button" onClick={preparation.cancel}>取消新单准备</button>}
  </section>;
}
