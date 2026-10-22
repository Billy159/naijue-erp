import { TransferStatusTag } from '../transfers/transfer-status-tag.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { DocumentScan } from '../components/document-scan.tsx';
import type { DocumentScanController } from '../components/document-scan-controller.ts';
import { UIButton, UIDate, UIInput, UITextArea } from '../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { TransferProposalSession, type TransferProposal } from './transfer-proposal.ts';
import type { CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import './transfer-proposal.css';

const chevron = <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
type Line = TransferProposal['lines'][number];
type MatrixLine = Line & { readonly selected: boolean };
/** Presentation-only grouping. Each input still edits its original native SKU;
 * similarly named sizes are never merged into one writable quantity. */
function matrixGroups(lines: TransferProposal['lines'], candidates: readonly CurrentFormSku[]) {
  const groups = new Map<string, { sizes: Map<string, string>; rows: Map<string, { sku: CurrentFormSku; lines: MatrixLine[] }> }>();
  const known = new Map(candidates.map(sku => [sku.id, sku]));
  for (const line of lines) if (!known.has(line.sku.id)) known.set(line.sku.id, line.sku);
  const values = new Map(lines.map(line => [line.sku.id, line]));
  for (const current of known.values()) {
    const selected = values.get(current.id), line: MatrixLine = selected ? { ...selected, selected: true } : { sku: current, quantity: '', selected: false };
    const sku = line.sku;
    let group = groups.get(sku.sizeGroupId);
    if (!group) { group = { sizes: new Map(), rows: new Map() }; groups.set(sku.sizeGroupId, group); }
    group.sizes.set(sku.sizeId, sku.sizeName);
    const key = `${sku.productId}|${sku.colorId}|${sku.fitId}`;
    let row = group.rows.get(key);
    if (!row) { row = { sku, lines: [] }; group.rows.set(key, row); }
    row.lines.push(line);
  }
  return [...groups].map(([id, group]) => ({ id, sizes: [...group.sizes].map(([id, name]) => ({ id, name })), rows: [...group.rows].map(([id, row]) => ({ id, ...row })) }));
}
function totalOf(lines: readonly Line[]): string {
  return lines.every(line => /^\d+$/.test(line.quantity)) ? lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n).toLocaleString('zh-CN') : '待校验';
}
function TransferDialog({ title, close, children, confirmation = false }: { readonly title: string; readonly close: () => void; readonly children: ReactNode; readonly confirmation?: boolean }) {
  return <StandardOverlay title={title} label={title} closeLabel="关闭弹窗" close={close} role={confirmation ? 'alertdialog' : 'dialog'}
    className={`transfer-proposal-dialog${confirmation ? ' transfer-proposal-confirm' : ''}`} width={confirmation ? 420 : 540}
    maskClosable initialFocus={confirmation ? '[data-erp-keep-input]' : '.transfer-proposal-search input'}>{children}</StandardOverlay>;
}
/** Frozen transfer-golden.js header + transfer-matrix-experiment.js matrix
 * hierarchy, backed by the existing opt-in proposal session, not demo commands. */
export function TransferProposalForm({ session, close, preparation }: { readonly session: TransferProposalSession; readonly close: () => void; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null);
  const [scanner, setScanner] = useState<DocumentScanController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  if (state.disposed) return <p role="status">草稿已关闭，当前身份资料已清除。</p>;
  const { draft, picker } = state;
  const groups = matrixGroups(draft.lines, state.entry?.skus ?? []);
  const discard = (action: 'reset' | 'cancel', confirmed = false) => {
    const ok = action === 'reset' ? session.reset(confirmed) : session.cancel(confirmed);
    if (!ok) setConfirm(action); else { setConfirm(null); if (action === 'cancel') close(); }
  };
  return <section aria-label="新增调拨草稿" className="tc-workbench tc-editor transfer-editor transfer-proposal-editor">
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>新增调拨单</h1><TransferStatusTag status="DRAFT" /><span className="transfer-proposal-save-state">未保存</span><div className="actions">
      <UIButton type="button" className="iw-text-button tc-back-link" onClick={() => discard('cancel')}>返回列表</UIButton>
      {preparation ? <UIButton type="button" className="iw-text-button transfer-proposal-save" disabled={preparation.preparing} onClick={preparation.save}>保存</UIButton> : <UIButton type="button" className="iw-text-button" disabled title="需要可信准备服务提供已批准编号及原生快照事实">保存（尚未接入）</UIButton>}
      {['审核', '导出', '打印', '操作历史'].map(label => <UIButton type="button" className="iw-text-button" key={label} disabled title={label === '审核' ? '保存并读取当前单据后才能审核' : `${label}尚未接入`}>{label}</UIButton>)}
    </div></div>
    <div className="tc-doc-header"><div className="tc-gold-doc-fields">
      <label className="tc-gold-field"><span>单据日期 <span className="ui-required">*</span></span><UIDate className="iw-control" aria-label="单据日期"  value={draft.businessDate} onChange={nextValue => session.setHeader({ businessDate: nextValue })} /></label>
      <div className="tc-gold-field"><span>调出仓库 <span className="ui-required">*</span></span><UIButton type="button" className="iw-control transfer-proposal-select" aria-label="选择调出仓库" aria-haspopup="dialog" aria-expanded={picker?.kind === 'FROM'} onClick={() => { void session.openPicker('FROM'); }}><span>{draft.from?.name ?? '选择调出仓库'}</span>{chevron}</UIButton></div>
      <div className="tc-gold-field"><span>调入仓库 <span className="ui-required">*</span></span><UIButton type="button" className="iw-control transfer-proposal-select" aria-label="选择调入仓库" aria-haspopup="dialog" aria-expanded={picker?.kind === 'TO'} onClick={() => { void session.openPicker('TO'); }}><span>{draft.to?.name ?? '选择调入仓库'}</span>{chevron}</UIButton></div>
      <div className="tc-gold-field tc-gold-meta"><span>单号</span><strong className="transfer-read-value">保存后生成</strong></div>
      <div className="tc-gold-field tc-gold-meta"><span>创建者</span><span className="transfer-read-value" title="保存时由当前认证身份确定，不在草稿伪造创建者">当前认证身份</span></div>
      <div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled={!session.canScan || preparation?.preparing} title={session.canScan ? undefined : '请先选择调出和调入仓库'} onClick={() => { session.closePicker(); setScanner(session.createScanner()); }}>扫码录入</UIButton></div>
    </div></div>
    <label className="tc-note-row"><span>备注</span><UITextArea aria-label="备注" className="iw-control transfer-note-input" rows={1} maxLength={10000} placeholder="填写单据备注" value={draft.note} onChange={nextValue => session.setHeader({ note: nextValue })} /></label>
    <p role="status" className="transfer-proposal-context">本地未保存草稿 · 不改变库存。{preparation ? '保存将先读取原生新单资料，再发送保存命令。' : '条码及可信新单准备尚未接入。'}</p>
    {(state.notice || state.errors.length > 0 || preparation?.notice || preparation?.preparing) && <div className="transfer-proposal-feedback">
      {state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}
      {preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <p role="status">正在准备新单…<UIButton type="button" className="iw-link" onClick={preparation.cancel}>取消新单准备</UIButton></p>}
    </div>}
    <div className="tc-section-head"><strong>调拨明细</strong><span className="transfer-muted">按实际规格录入数量</span><UIButton type="button" className="iw-button" onClick={() => { void session.openPicker('PRODUCT'); }}>添加商品规格</UIButton></div>
    {state.entry && <p className="transfer-proposal-context" role="status">{state.entry.product.name} · 实际规格第 {state.entry.page} 页，共 {state.entry.exactTotal.toString()} 项。空白数量未加入单据；更多规格可在候选中翻页。</p>}
    <div className="transfer-matrix-scroll transfer-proposal-matrix" role="region" aria-label="调拨实际明细" tabIndex={0}>
      {groups.length ? groups.map(group => <section className="mx-section" key={group.id} data-size-group-id={group.id} style={{ '--mx-table-width': `${592 + group.sizes.length * 64}px` } as import('react').CSSProperties}>
        <table className="mx-table"><caption className="sr-only">调拨实际明细</caption><colgroup><col style={{ width: 280 }} /><col style={{ width: 76 }} /><col style={{ width: 88 }} />{group.sizes.map(size => <col key={size.id} style={{ width: 64 }} />)}<col style={{ width: 52 }} /><col style={{ width: 96 }} /></colgroup>
          <thead><tr><th className="mx-product" scope="col">款号／商品名称</th><th className="mx-color" scope="col">颜色</th><th className="mx-fit-col" scope="col">版型</th>{group.sizes.map(size => <th key={size.id} scope="col" title={size.name}>{size.name}</th>)}<th className="tc-subtotal" scope="col">小计</th><th className="ui-action-cell" scope="col">操作</th></tr></thead>
          <tbody>{group.rows.map(row => <tr key={row.id}><td className="mx-product"><div className="mx-product-line"><strong title={row.sku.productCode}>{row.sku.productCode}</strong><span title={row.sku.productName}>{row.sku.productName}</span></div></td><td className="mx-color">{row.sku.colorName}</td><td className="mx-fit-col">{row.sku.fitName}</td>
            {group.sizes.map(size => { const lines = row.lines.filter(line => line.sku.sizeId === size.id); return <td className={lines.length ? 'transfer-quantity' : 'mx-size-blank'} key={size.id}>{lines.map(line => <UIInput className="transfer-proposal-quantity" key={line.sku.id} aria-label={`${line.sku.skuCode} 数量`} title={line.sku.skuCode} inputMode="numeric" value={line.quantity} onChange={nextValue => session.setMatrixQuantity(line.sku.id, nextValue)} />)}</td>; })}
            <td className="tc-subtotal">{totalOf(row.lines.filter(line => line.selected))}</td><td className="ui-action-cell"><div className="mx-actions">{row.lines.filter(line => line.selected).map(line => <UIButton key={line.sku.id} type="button" className="iw-link" aria-label={`删除 ${line.sku.skuCode}`} title={`删除 ${line.sku.sizeName} 实际规格`} onClick={() => session.removeLine(line.sku.id)}>删除{row.lines.filter(line => line.selected).length > 1 ? ` ${line.sku.sizeName}` : ''}</UIButton>)}</div></td></tr>)}</tbody>
        </table>
      </section>) : <table className="mx-table transfer-proposal-empty-table"><colgroup><col style={{ width: 280 }} /><col style={{ width: 76 }} /><col style={{ width: 88 }} /><col /><col style={{ width: 52 }} /><col style={{ width: 96 }} /></colgroup><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码 / 数量', '小计', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody><tr className="mx-draft-row"><td><UIButton type="button" className="iw-control transfer-proposal-find" aria-label="调拨行内找货" onClick={() => { void session.openPicker('PRODUCT'); }}><span>商品款号 / 名称 / 条码</span>{chevron}</UIButton></td><td className="transfer-muted">选择颜色</td><td className="transfer-muted">选择版型</td><td className="transfer-muted">选择商品实际规格后显示尺码</td><td>—</td><td>—</td></tr></tbody></table>}
    </div>
    <footer className="tc-foot tc-gold-footer"><strong>{new Set(draft.lines.map(row => `${row.sku.productId}|${row.sku.colorId}|${row.sku.fitId}`)).size}行</strong><span>{draft.lines.length} 个实际规格</span><strong>数量 {totalOf(draft.lines)}</strong><span className="transfer-muted">数量不是实时库存</span></footer>
    {scanner && <DocumentScan controller={scanner} title="调拨扫码录入" rows={draft.lines.map(row => ({ key: row.sku.id, ...row }))} close={() => setScanner(null)} update={(key, value) => session.setQuantity(key, value)} remove={key => session.removeLine(key)} />}
    {picker && <TransferDialog title={picker.kind === 'FROM' ? '调出仓库' : picker.kind === 'TO' ? '调入仓库' : picker.kind === 'PRODUCT' ? '选择商品' : `${picker.product?.name} · 实际规格`} close={() => session.closePicker()}>
      <section aria-label="当前候选" className="transfer-proposal-candidates">
        {picker.kind !== 'SKU' && <label className="transfer-proposal-search"><span>搜索</span><UIInput className="iw-search" aria-label="搜索候选" placeholder={picker.kind === 'PRODUCT' ? '搜索商品款号或名称' : '搜索仓库名称'} value={picker.search} onChange={nextValue => { void session.search(nextValue); }} /></label>}
        <div className="transfer-proposal-options" aria-busy={picker.phase === 'loading'}>
          {picker.phase === 'loading' && <p className="iw-inline-state" role="status">正在读取当前候选…</p>}
          {picker.phase === 'error' && <p className="iw-inline-state" role="alert">候选读取失败。<UIButton type="button" className="iw-link" onClick={() => { void session.retry(); }}>重试候选</UIButton></p>}
          {picker.phase === 'ready' && <><ul>{picker.result?.items.map(item => {
            const sku = item as CurrentFormSku, warehouse = item as CurrentTransferWarehouse;
            const label = picker.kind === 'SKU' ? `${sku.productCode} · ${sku.colorName} · ${sku.fitName} · ${sku.sizeName}` : 'name' in item ? item.name + ('hallName' in item ? ` · ${warehouse.hallName}${warehouse.enabled ? '' : '（已停用，有库存）'}` : '') : '';
            return <li key={item.id}><UIButton type="button" className="iw-option" disabled={picker.kind === 'SKU' && draft.lines.some(row => row.sku.id === item.id)} onClick={() => { void session.select(item.id); }}>{label}</UIButton></li>;
          })}</ul>{picker.result?.items.length === 0 && <p className="iw-inline-state">无匹配候选</p>}</>}
        </div>
        {state.notice && <p className="transfer-proposal-picker-notice" role="status">{state.notice}</p>}
        <footer><span>第 {picker.page} 页 · 共 {picker.result?.exactTotal.toString() ?? '—'} 项</span><div><UIButton type="button" className="iw-text-button" disabled={picker.phase !== 'ready' || picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton type="button" className="iw-text-button" disabled={picker.phase !== 'ready' || !picker.result || BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton><UIButton type="button" className="iw-button" onClick={() => session.closePicker()}>关闭候选</UIButton></div></footer>
      </section>
    </TransferDialog>}
    {confirm && <TransferDialog title="放弃未保存输入？" confirmation close={() => setConfirm(null)}><p className="transfer-proposal-confirm-message">将放弃本次未保存输入，是否继续？</p><footer><UIButton type="button" className="iw-button" data-erp-keep-input onClick={() => setConfirm(null)}>保留输入</UIButton><UIButton type="button" className="iw-button iw-primary" onClick={() => discard(confirm, true)}>确认放弃</UIButton></footer></TransferDialog>}
  </section>;
}
