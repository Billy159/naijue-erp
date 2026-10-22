import { TransferStatusTag } from '../transfer-status-tag.tsx';
import { UIDate, UIButton, UITextArea } from '../../components/standard-controls.tsx';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { TransferCommandCapability, TransferFormInput } from './contracts.ts';
import { transferCount } from '../format.ts';
import { transferStatusLabels } from '../model.ts';
import { TransferEditableLines } from './editable-lines.tsx';
import { TransferSavedRecords } from '../saved-records.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';

export interface TransferCommandFormProps { readonly capability: TransferCommandCapability; readonly scope: ReadScope; readonly close: () => void }
/** Source full-page editor, not a generic modal. This bounded first edit slice
 * changes only saved actual-line quantities/date/note; identities stay native. */
export function TransferCommandForm({ capability, scope, close }: TransferCommandFormProps) {
  const { workspace } = capability, state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const editor = state.editor, write = state.write;
  if (!scope.active || state.disposed || !editor) return null;
  const header = editor.detail?.document.header ?? editor.draft?.header, input = editor.input;
  const working = ['submitting', 'checking', 'replaying'].includes(write.phase), unresolved = workspace.hasUnresolvedWrite;
  const status = editor.detail?.document.header.status ?? 'DRAFT';
  const editable = editor.phase === 'ready' && !!editor.draft && !!input && !unresolved && !state.stale && !editor.current && write.phase !== 'committed';
  const locked = !editable, dirty = workspace.hasDirtyDraft;
  const update = (next: TransferFormInput) => { workspace.updateInput(next); };
  const leave = () => { if (workspace.canLeave()) { workspace.suspend(); close(); } };
  const lines = editor.draft?.lines ?? editor.detail?.document.lines ?? [];
  const total = lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n);
  const names = editor.detail?.references;
  return <section className="tc-workbench tc-editor transfer-editor transfer-command-editor" aria-label="调拨单编辑">
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>{editor.mode === 'CREATE' ? '新增调拨单' : '调拨单'}</h1><TransferStatusTag status={status} /><div className="actions">
      <UIButton type="button" className="iw-text-button tc-back-link" onClick={leave} disabled={!workspace.canLeave()}>返回列表</UIButton>
      {status === 'DRAFT' && <><UIButton type="button" className="iw-text-button" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('VOID'); }}>作废</UIButton>
        <UIButton type="button" className="iw-text-button" disabled={locked || !dirty || editor.inputError} onClick={() => { void workspace.submit('SAVE'); }}>保存</UIButton>
        <UIButton type="button" className="iw-text-button" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('APPROVE'); }}>审核</UIButton></>}
      {status === 'APPROVED' && <UIButton type="button" className="iw-text-button" disabled={unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail?.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('UNAPPROVE'); }}>弃审</UIButton>}
      {['导出', '打印', '操作历史'].map(label => <UIButton key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</UIButton>)}
    </div></div>
    {editor.phase === 'loading' && <p className="transfer-command-notice" role="status">正在读取调拨单…</p>}
    {editor.readError && <p className="transfer-command-notice" role="alert">单据读取未完成。<UIButton type="button" className="iw-link" disabled={unresolved} onClick={() => { void workspace.readCurrent(); }}>重新读取当前单据</UIButton></p>}
    {header && <><div className="tc-doc-header"><div className="tc-gold-doc-fields">
      <div className="tc-gold-field"><span>单据日期 *</span>{input ? <UIDate aria-label="单据日期" value={input.businessDate} disabled={locked} onChange={value => update({ ...input, businessDate: value })} /> : <span className="transfer-read-value">{header.businessDate}</span>}</div>
      <div className="tc-gold-field"><span>调出仓库</span><span className="transfer-read-value" title={header.fromWarehouseId}>{names?.fromWarehouseName ?? `原生仓库 ${header.fromWarehouseId}`}</span></div>
      <div className="tc-gold-field"><span>调入仓库</span><span className="transfer-read-value" title={header.toWarehouseId}>{names?.toWarehouseName ?? `原生仓库 ${header.toWarehouseId}`}</span></div>
      <div className="tc-gold-field"><span>单号</span><strong className="transfer-read-value">{header.number}</strong></div>
      <div className="tc-gold-field"><span>创建者</span><span className="transfer-read-value">{names?.createdByName ?? '保存时由当前认证身份确定'}</span></div>
      <div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled title="当前商品选择及原生条码读取尚未接入">扫码录入</UIButton></div>
    </div></div>
    <label className="tc-note-row"><span>备注</span>{input ? <UITextArea aria-label="备注" className="iw-control transfer-note-input" rows={1} maxLength={10000} value={input.note} disabled={locked} onChange={nextValue => update({ ...input, note: nextValue })} /> : <span className="tc-note-read">{editor.detail?.document.header.note || '—'}</span>}</label></>}
    <div className="transfer-readonly-note">{editor.detail?.stockBasis === 'CUTOFF_HISTORY' ? '历史单据未开放写入。' : status === 'APPROVED' ? '已审核，弃审后才能修改。' : status === 'VOID' ? '此单已作废，仅可查看。' : '本步仅编辑原有实际明细的数量、日期与备注，仓库、SKU 和保存名称／条码保持不变。'} 数量不是实时库存；不会按负库存拦截调拨。</div>
    {state.notice && <p className="transfer-command-notice" role={editor.inputError || write.phase === 'rejected' ? 'alert' : 'status'}>{state.notice}</p>}
    {working && <p className="transfer-command-notice" role="status">{write.phase === 'checking' ? '正在核实原操作回执…' : '正在提交原操作…'}<UIButton type="button" className="iw-link" onClick={() => workspace.cancelWaiting()}>停止等待</UIButton></p>}
    {write.phase === 'uncertain' && <div className="transfer-command-recovery" role="status"><strong>原操作结果不确定，请勿重复新建操作。</strong><span>操作键：{write.command?.requestKey}</span><UIButton type="button" className="iw-button" onClick={() => { void workspace.checkReceipt(); }}>核实原操作回执</UIButton><UIButton type="button" className="iw-button" onClick={() => { void workspace.replayOriginal(); }}>重放原请求</UIButton></div>}
    {write.phase === 'committed' && <p className="transfer-command-notice" role="status">原操作已确认：版本 {write.result?.version}，{write.result ? transferStatusLabels[write.result.status] : ''}。库存流水 {write.result?.ledgerEntryIds.length} 条。当前表单仍是原内容。</p>}
    {!unresolved && editor.detail && write.phase !== 'idle' && <UIButton type="button" className="iw-button transfer-read-current" disabled={editor.phase === 'loading'} onClick={() => { void workspace.readCurrent(); }}>读取当前单据</UIButton>}
    {!unresolved && editor.mode === 'CREATE' && write.phase === 'committed' && <UIButton type="button" className="iw-button transfer-read-current" disabled={editor.phase === 'loading'} onClick={() => { void workspace.readCurrent(); }}>读取当前单据</UIButton>}
    {editor.current && <p className="transfer-command-notice" role="status">已读取当前版本 {editor.current.document.header.version}，尚未替换原草稿。<UIButton type="button" className="iw-button" onClick={() => workspace.adoptCurrent()}>采用当前单据</UIButton></p>}
    <div className="tc-section-head"><strong>调拨明细</strong><span className="transfer-muted">原保存规格</span></div>
    <TransferEditableLines detail={editor.detail} draft={editor.draft} input={input} locked={locked} invalid={editor.inputError} update={update} />
    <footer className="tc-foot tc-gold-footer"><strong>{lines.length}行</strong><strong>数量 {editor.inputError ? '输入未校验' : transferCount(total.toString())}</strong>{dirty && !unresolved && write.phase !== 'committed' && <UIButton type="button" className="iw-text-button" onClick={() => { if (workspace.discardEditor()) close(); }}>放弃未保存修改</UIButton>}</footer>
    {editor.detail && <TransferSavedRecords data={editor.detail} />}
  </section>;
}
