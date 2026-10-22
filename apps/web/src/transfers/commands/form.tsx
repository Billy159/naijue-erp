import { DocumentOutputActions } from '../../components/document-output.tsx';
import { transferDocumentOutput } from '../../components/document-output-contracts.ts';
import { TransferHistoryAction, type TransferHistoryCapability } from '../history-view.tsx';
import { TransferStatusTag } from '../transfer-status-tag.tsx';
import { UIDate, UIButton, UITextArea } from '../../components/standard-controls.tsx';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { TransferCommandCapability, TransferFormInput } from './contracts.ts';
import { transferCount } from '../format.ts';
import { transferStatusLabels } from '../model.ts';
import { TransferEditableLines } from './editable-lines.tsx';
import { TransferSavedRecords } from '../saved-records.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';

export interface TransferCommandFormProps { readonly history?: TransferHistoryCapability; readonly capability: TransferCommandCapability; readonly scope: ReadScope; readonly close: () => void }
/** Source full-page editor, not a generic modal. This bounded first edit slice
 * changes only saved actual-line quantities/date/note; identities stay native. */
export function TransferCommandForm({ capability, scope, close, history }: TransferCommandFormProps) {
  const { workspace } = capability, state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const editor = state.editor, write = state.write;
  const committedRead = useRef<{ owner: typeof workspace; operationId: string } | null>(null);
  useEffect(() => {
    if (!scope.active || write.phase !== 'committed' || !write.result || !editor || editor.current || editor.readError || editor.phase === 'loading') return;
    if (committedRead.current?.owner === workspace && committedRead.current.operationId === write.result.operationId) return;
    committedRead.current = { owner: workspace, operationId: write.result.operationId };
    void workspace.readCurrent();
  }, [workspace, scope, write.phase, write.result, editor?.transferId, editor?.current, editor?.readError, editor?.phase]);
  if (!scope.active || state.disposed || !editor) return null;
  const savedReadback = write.phase === 'committed' ? editor.current : null;
  const detail = savedReadback ?? editor.detail;
  const header = detail?.document.header ?? editor.draft?.header, input = savedReadback ? null : editor.input;
  const working = ['submitting', 'checking', 'replaying'].includes(write.phase), unresolved = workspace.hasUnresolvedWrite;
  const status = detail?.document.header.status ?? 'DRAFT';
  const editable = editor.phase === 'ready' && !!editor.draft && !!input && !unresolved && !state.stale && !editor.current && write.phase !== 'committed';
  const locked = !editable, dirty = workspace.hasDirtyDraft;
  const update = (next: TransferFormInput) => { workspace.updateInput(next); };
  const leave = () => { if (workspace.canLeave()) { workspace.suspend(); close(); } };
  const lines = savedReadback?.document.lines ?? editor.draft?.lines ?? detail?.document.lines ?? [];
  const total = lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n);
  const names = detail?.references;
  return <section className="tc-workbench tc-editor transfer-editor transfer-command-editor" aria-label="调拨单编辑">
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>{editor.detail || write.phase === 'committed' ? '调拨单' : editor.mode === 'CREATE' ? '新增调拨单' : '调拨单'}</h1><TransferStatusTag status={status} /><div className="actions">
      <UIButton type="button" className="iw-text-button tc-back-link" onClick={leave} disabled={!workspace.canLeave()}>返回列表</UIButton>
      {status === 'DRAFT' && <><UIButton type="button" className="iw-text-button" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('VOID'); }}>作废</UIButton>
        <UIButton type="button" className="iw-text-button" disabled={locked || !dirty || editor.inputError} onClick={() => { void workspace.submit('SAVE'); }}>保存</UIButton>
        <UIButton type="button" className="iw-text-button" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('APPROVE'); }}>审核</UIButton></>}
      {status === 'APPROVED' && <UIButton type="button" className="iw-text-button" disabled={unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail?.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('UNAPPROVE'); }}>弃审</UIButton>}
      <DocumentOutputActions sourceKey={detail ? `${detail.document.header.id}:${detail.document.header.version}` : "unsaved"} {...(detail && (write.phase !== 'committed' || !!savedReadback) && !unresolved && (!state.stale || !!savedReadback) && (!dirty || !!savedReadback) ? { getDocument: () => transferDocumentOutput(detail) } : {})} unavailableReason="请先完成保存并读取当前单据" />
      <TransferHistoryAction {...(history ? { capability: history } : {})} {...(detail ? { transferId: detail.document.header.id } : {})} />
    </div></div>
    {editor.phase === 'loading' && <p className="transfer-command-notice" role="status">正在读取调拨单…</p>}
    {editor.readError && <p className="transfer-command-notice" role="alert">单据读取未完成。<UIButton type="button" className="iw-link" disabled={unresolved} onClick={() => { void workspace.readCurrent(); }}>重新读取当前单据</UIButton></p>}
    {header && <><div className="tc-doc-header"><div className="tc-gold-doc-fields">
      <div className="tc-gold-field"><span>单据日期 *</span>{input ? <UIDate aria-label="单据日期" value={input.businessDate} disabled={locked} onChange={value => update({ ...input, businessDate: value })} /> : <span className="transfer-read-value">{header.businessDate}</span>}</div>
      <div className="tc-gold-field"><span>调出仓库</span><span className="transfer-read-value" title={names?.fromWarehouseName ?? undefined}>{names?.fromWarehouseName ?? '仓库名称未提供'}</span></div>
      <div className="tc-gold-field"><span>调入仓库</span><span className="transfer-read-value" title={names?.toWarehouseName ?? undefined}>{names?.toWarehouseName ?? '仓库名称未提供'}</span></div>
      <div className="tc-gold-field"><span>单号</span><strong className="transfer-read-value">{detail ? header.number : write.phase === 'committed' ? '已保存，待读取单号' : header.number}</strong></div>
      <div className="tc-gold-field"><span>创建者</span><span className="transfer-read-value">{names?.createdByName ?? (detail ? '未知' : '保存后记录')}</span></div>
      <div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled title="当前商品选择及原生条码读取尚未接入">扫码录入</UIButton></div>
    </div></div>
    <label className="tc-note-row"><span>备注</span>{input ? <UITextArea aria-label="备注" className="iw-control transfer-note-input" rows={1} maxLength={10000} value={input.note} disabled={locked} onChange={nextValue => update({ ...input, note: nextValue })} /> : <span className="tc-note-read">{header.note || '—'}</span>}</label></>}
    <div className="transfer-readonly-note">{editor.detail?.stockBasis === 'CUTOFF_HISTORY' ? '历史单据未开放写入。' : status === 'APPROVED' ? '已审核，弃审后才能修改。' : status === 'VOID' ? '此单已作废，仅可查看。' : '本步仅编辑原有实际明细的数量、日期与备注，仓库、SKU 和保存名称／条码保持不变。'} 数量不是实时库存；不会按负库存拦截调拨。</div>
    {state.notice && <p className="transfer-command-notice" role={editor.inputError || write.phase === 'rejected' ? 'alert' : 'status'}>{state.notice}</p>}
    {working && <p className="transfer-command-notice" role="status">{write.phase === 'checking' ? '正在核实原操作回执…' : '正在提交原操作…'}<UIButton type="button" className="iw-link" onClick={() => workspace.cancelWaiting()}>停止等待</UIButton></p>}
    {write.phase === 'uncertain' && <div className="transfer-command-recovery" role="status"><strong>原操作结果不确定，请勿重复新建操作。</strong><span>操作键：{write.command?.requestKey}</span><UIButton type="button" className="iw-button" onClick={() => { void workspace.checkReceipt(); }}>核实原操作回执</UIButton><UIButton type="button" className="iw-button" onClick={() => { void workspace.replayOriginal(); }}>重放原请求</UIButton></div>}
    {write.phase === 'committed' && <p className="transfer-command-notice" role="status">原操作已确认：版本 {write.result?.version}，{write.result ? transferStatusLabels[write.result.status] : ''}。库存流水 {write.result?.ledgerEntryIds.length} 条。{savedReadback ? '下方显示重新读取的已保存单据；继续操作前请采用当前单据。' : '正在核对已保存内容；读取失败可重试，保存不会重复提交。'}</p>}
    {!unresolved && (editor.detail && write.phase !== 'idle' || write.phase === 'committed') && <UIButton type="button" className="iw-button transfer-read-current" disabled={editor.phase === 'loading'} onClick={() => { void workspace.readCurrent(); }}>读取当前单据</UIButton>}
    {editor.current && <p className="transfer-command-notice" role="status">已读取当前版本 {editor.current.document.header.version}，尚未替换原草稿。<UIButton type="button" className="iw-button" onClick={() => workspace.adoptCurrent()}>采用当前单据</UIButton></p>}
    <div className="tc-section-head"><strong>调拨明细</strong><span className="transfer-muted">原保存规格</span></div>
    <TransferEditableLines detail={detail} draft={savedReadback ? null : editor.draft} input={input} locked={locked} invalid={savedReadback ? false : editor.inputError} update={update} />
    <footer className="tc-foot tc-gold-footer"><strong>{lines.length}行</strong><strong>数量 {editor.inputError ? '输入未校验' : transferCount(total.toString())}</strong>{dirty && !unresolved && write.phase !== 'committed' && <UIButton type="button" className="iw-text-button" onClick={() => { if (workspace.discardEditor()) close(); }}>放弃未保存修改</UIButton>}</footer>
    {detail && <TransferSavedRecords data={detail} />}
  </section>;
}
