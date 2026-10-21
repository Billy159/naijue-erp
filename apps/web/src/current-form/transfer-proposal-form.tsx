import { useState, useSyncExternalStore } from 'react';
import { TransferProposalSession } from './transfer-proposal.ts';
import type { CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';

/** Opt-in current proposal editor. The route owner owns session lifetime. */
export function TransferProposalForm({ session, close, preparation }: { readonly session: TransferProposalSession; readonly close: () => void; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker } = state;
  const discard = (action: 'reset' | 'cancel', confirmed = false) => {
    const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed);
    if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); }
  };
  return <section aria-label="新增调拨草稿" className="tc-workbench">
    <h1>新增调拨草稿</h1><p role="status">本地未保存草稿 · 不改变库存。{preparation ? '保存将先读取原生新单资料，再发送保存命令。' : '条码及可信新单准备尚未接入。'}</p>
    <button type="button" onClick={() => discard('cancel')}>取消新增</button><button type="button" onClick={() => discard('reset')}>重置草稿</button>
    {confirm && <div role="alert"><p>将放弃本次未保存输入，是否继续？</p><button type="button" onClick={() => setConfirm(null)}>保留输入</button><button type="button" onClick={() => discard(confirm, true)}>确认放弃</button></div>}
    <label>单据日期<input aria-label="单据日期" type="date" value={draft.businessDate} onChange={event => session.setHeader({ businessDate: event.target.value })} /></label>
    <div>调出仓库：{draft.from?.name ?? '未选择'}<button type="button" onClick={() => { void session.openPicker('FROM'); }}>选择调出仓库</button></div>
    <div>调入仓库：{draft.to?.name ?? '未选择'}<button type="button" onClick={() => { void session.openPicker('TO'); }}>选择调入仓库</button></div>
    <label>备注<textarea aria-label="备注" maxLength={10000} value={draft.note} onChange={event => session.setHeader({ note: event.target.value })} /></label>
    <button type="button" onClick={() => { void session.openPicker('PRODUCT'); }}>添加商品规格</button>
    {picker && <section aria-label="当前候选"><h2>{picker.kind === 'FROM' ? '调出仓库' : picker.kind === 'TO' ? '调入仓库' : picker.kind === 'PRODUCT' ? '当前商品' : `${picker.product?.name} · 实际规格`}</h2>
      <button type="button" onClick={() => session.closePicker()}>关闭候选</button>
      {picker.kind !== 'SKU' && <label>搜索<input aria-label="搜索候选" value={picker.search} onChange={event => { void session.search(event.target.value); }} /></label>}
      {picker.phase === 'loading' && <p role="status">正在读取当前候选…</p>}
      {picker.phase === 'error' && <button type="button" onClick={() => { void session.retry(); }}>重试候选</button>}
      {picker.phase === 'ready' && <><ul>{picker.result?.items.map(item => {
        const sku = item as CurrentFormSku, warehouse = item as CurrentTransferWarehouse;
        const label = picker.kind === 'SKU' ? `${sku.productCode} · ${sku.colorName} · ${sku.fitName} · ${sku.sizeName}`
          : 'name' in item ? item.name + ('hallName' in item ? ` · ${warehouse.hallName}${warehouse.enabled ? '' : '（已停用，有库存）'}` : '') : '';
        return <li key={item.id}><button type="button" disabled={picker.kind === 'SKU' && draft.lines.some(row => row.sku.id === item.id)} onClick={() => { void session.select(item.id); }}>{label}</button></li>;
      })}</ul>{picker.result?.items.length === 0 && <p>无匹配候选</p>}<p>第 {picker.page} 页 · 共 {picker.result?.exactTotal.toString()} 项</p>
        <button type="button" disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</button><button type="button" disabled={!picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</button></>}
    </section>}
    <table><caption>调拨实际明细</caption><thead><tr>{['商品', '颜色', '版型', '尺码', '数量', '操作'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{draft.lines.map(({ sku, quantity }) => <tr key={sku.id}>
      <td>{sku.productCode} · {sku.productName}</td><td>{sku.colorName}</td><td>{sku.fitName}</td><td>{sku.sizeName}</td><td><input aria-label={`${sku.skuCode} 数量`} inputMode="numeric" value={quantity} onChange={event => session.setQuantity(sku.id, event.target.value)} /></td><td><button type="button" aria-label={`删除 ${sku.skuCode}`} onClick={() => session.removeLine(sku.id)}>删除</button></td>
    </tr>)}</tbody></table>
    {state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}
    <button type="button" onClick={() => session.validate()}>校验草稿</button>{preparation ? <button type="button" disabled={preparation.preparing} onClick={preparation.save}>保存</button> : <button type="button" disabled title="需要可信准备服务提供已批准编号及原生快照事实">保存（尚未接入）</button>}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <button type="button" onClick={preparation.cancel}>取消新单准备</button>}
  </section>;
}
