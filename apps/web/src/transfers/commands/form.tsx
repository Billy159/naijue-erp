import { DocumentProductPresentation } from '../../sales/document-presentation.tsx';
import { useDocumentLeave } from '../../demo-presentation/document-navigation.tsx';
import { TransferDocumentPage, TransferDocumentSummary } from '../document-presentation.tsx';
import type { TransferProposalPresentation } from '../../current-form/transfer-proposal-form.tsx';
import { DocumentOutputActions } from '../../components/document-output.tsx';
import { transferDocumentOutput } from '../../components/document-output-contracts.ts';
import { TransferHistoryAction, type TransferHistoryCapability } from '../history-view.tsx';
import { TransferStatusTag } from '../transfer-status-tag.tsx';
import { SourceDocumentDialog } from '../../components/standard-overlay.tsx';
import { UIDate, UIButton, UIInput } from '../../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { TransferCommandCapability, TransferFormInput } from './contracts.ts';
import { transferStatusLabels } from '../model.ts';
import { TransferEditableLines } from './editable-lines.tsx';
import { TransferSavedRecords } from '../saved-records.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';

export interface TransferCommandFormProps { readonly presentation?: TransferProposalPresentation; readonly history?: TransferHistoryCapability; readonly capability: TransferCommandCapability; readonly scope: ReadScope; readonly close: () => void; readonly existingDocumentNotice?: string | null }
/** Frozen transfer delete-doc uses the common compact confirmation surface. */
export function TransferVoidConfirmation({ number, close, confirm }: { readonly number: string; readonly close: () => void; readonly confirm: () => void }) {
  return <SourceDocumentDialog title="确认作废调拨单" label="确认作废调拨单" closeLabel="关闭弹窗" close={close} className="transfer-source-discard" initialFocus="[data-erp-keep-input]"
    footer={<><button type="button" className="btn" data-erp-keep-input onClick={close}>取消</button><button type="button" className="btn primary" onClick={confirm}>确认作废</button></>}>
    <div className="ui-confirm-body"><p>确定作废调拨单 {number} 吗？作废后不能再编辑或审核，操作记录会保留。</p></div>
  </SourceDocumentDialog>;
}
/** Source full-page editor, not a generic modal. This bounded first edit slice
 * changes only saved actual-line quantities/date/note; identities stay native. */
export function TransferCommandForm(props: TransferCommandFormProps) {
  const workspace = props.capability.workspace, state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const [bridge, setBridge] = useState<{ readonly owner: typeof workspace; readonly View: typeof import('../../current-form/transfer-existing-document-form.tsx').TransferExistingDocumentForm } | null>(null);
  const [failedOwner, setFailedOwner] = useState<typeof workspace | null>(null), enabled = workspace.canUseExistingProposal;
  useEffect(() => { if (!enabled) return; let live = true; void import('../../current-form/transfer-existing-document-form.tsx').then(module => { if (live) setBridge({ owner: workspace, View: module.TransferExistingDocumentForm }); }, () => { if (live) setFailedOwner(workspace); }); return () => { live = false; }; }, [workspace, enabled]);
  if (enabled && bridge?.owner === workspace) return <bridge.View {...props} />;
  if (enabled && workspace.editableExistingProposal && failedOwner !== workspace) return <TransferDocumentPage ariaLabel="调拨单编辑" className="transfer-command-editor" title="编辑调拨单"><p role="status">正在准备完整旧单编辑页…</p></TransferDocumentPage>;
  return <TransferNativeCommandForm {...props} key={state.editor?.transferId} />;
}
function TransferCommandRecovery({ workspace }: { readonly workspace: TransferCommandCapability['workspace'] }) {
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot), write = state.write;
  return <>{['submitting', 'checking', 'replaying'].includes(write.phase) && <p className="transfer-command-notice" role="status">{write.phase === 'checking' ? '正在核实原操作回执…' : '正在提交原操作…'}<UIButton type="button" className="iw-link" onClick={() => workspace.cancelWaiting()}>停止等待</UIButton></p>}
    {write.phase === 'uncertain' && <div className="transfer-command-recovery" role="status"><strong>原操作结果不确定，请勿重复新建操作。</strong><span>操作键：{write.command?.requestKey}</span><UIButton type="button" className="iw-button" onClick={() => { void workspace.checkReceipt(); }}>核实原操作回执</UIButton><UIButton type="button" className="iw-button" onClick={() => { void workspace.replayOriginal(); }}>重放原请求</UIButton></div>}</>;
}
export function TransferNativeCommandForm({ capability, scope, close, history, presentation, existingDocumentNotice }: TransferCommandFormProps) {
  const { workspace } = capability, state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  const [discard, setDiscard] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ readonly id: string; readonly version: number } | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const editor = state.editor, write = state.write;
  useDocumentLeave({ dirty: workspace.hasDirtyDraft || workspace.hasUnresolvedWrite, canDiscard: scope.active && !workspace.hasUnresolvedWrite,
    saved: !!editor?.detail || write.phase === 'committed', discard: () => scope.active && workspace.discardEditor() });
  const committedRead = useRef<{ owner: typeof workspace; operationId: string } | null>(null);
  useEffect(() => {
    if (!scope.active || write.phase !== 'committed' || !write.result || !editor || editor.current || editor.readError || editor.phase === 'loading') return;
    if (committedRead.current?.owner === workspace && committedRead.current.operationId === write.result.operationId) return;
    committedRead.current = { owner: workspace, operationId: write.result.operationId };
    void workspace.readCurrent();
  }, [workspace, scope, write.phase, write.result, editor?.transferId, editor?.current, editor?.readError, editor?.phase]);
  useEffect(() => { setDiscard(false); }, [workspace, editor?.transferId, write.phase]);
  useEffect(() => { setVoidTarget(null); }, [workspace, editor?.transferId, editor?.detail?.document.header.version, editor?.phase, editor?.input, state.stale, write.phase]);
  if (!scope.active || state.disposed) return null;
  if (!editor) return <TransferDocumentPage headingRef={heading} ariaLabel="调拨单编辑" className="transfer-command-editor" title="新增调拨单"><TransferCommandRecovery workspace={workspace} />{state.notice && <p className="transfer-command-notice" role="status">{state.notice}</p>}</TransferDocumentPage>;
  const savedReadback = write.phase === 'committed' ? editor.current : null;
  const detail = savedReadback ?? editor.detail;
  const header = detail?.document.header ?? editor.draft?.header, input = savedReadback ? null : editor.input;
  const unresolved = workspace.hasUnresolvedWrite;
  const status = detail?.document.header.status ?? 'DRAFT';
  const editable = editor.phase === 'ready' && !!editor.draft && !!input && !unresolved && !state.stale && !editor.current && write.phase !== 'committed';
  const locked = !editable, dirty = workspace.hasDirtyDraft;
  const update = (next: TransferFormInput) => { workspace.updateInput(next); };
  const leave = () => { if (unresolved) return; if (dirty) setDiscard(true); else if (workspace.canLeave()) { workspace.suspend(); close(); } };
  const lines = savedReadback?.document.lines ?? editor.draft?.lines ?? detail?.document.lines ?? [];
  const names = detail?.references;
  return <DocumentProductPresentation scope={scope} {...(presentation?.productCapability ? { capability: presentation.productCapability } : {})} returnLabel="返回调拨单" viewLabel="调拨商品查看" documentLabel="调拨">{openProduct => <TransferDocumentPage headingRef={heading} ariaLabel="调拨单编辑" className="transfer-command-editor"
    title={editor.mode === 'CREATE' && !detail && write.phase !== 'committed' ? '新增调拨单' : locked ? '查看调拨单' : '编辑调拨单'} status={<TransferStatusTag status={status} />}
    saveState={(detail || write.phase === 'committed') && <span className="transfer-save-state">{status === 'APPROVED' ? '' : dirty ? '· 有未保存修改' : '· 已保存'}</span>}
    actions={<>
      <button type="button" className="btn tc-back-link" onClick={leave} disabled={unresolved || !workspace.canLeave() && !dirty}>返回列表</button>
      {status === 'DRAFT' && <><button type="button" className="btn" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { if (editor.detail) setVoidTarget({ id: editor.transferId, version: editor.detail.document.header.version }); }}>作废</button>
        <button type="button" className="btn" disabled={locked || !dirty || editor.inputError} onClick={() => { void workspace.submit('SAVE'); }}>保存</button>
        <button type="button" className="btn" disabled={!editor.detail || dirty || unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('APPROVE'); }}>审核</button></>}
      {status === 'APPROVED' && <button type="button" className="btn" disabled={unresolved || state.stale || !!editor.current || editor.phase !== 'ready' || editor.detail?.stockBasis !== 'RUNTIME_LEDGER'} onClick={() => { void workspace.submit('UNAPPROVE'); }}>弃审</button>}
      <DocumentOutputActions sourceKey={detail ? `${detail.document.header.id}:${detail.document.header.version}` : "unsaved"} {...(detail && (write.phase !== 'committed' || !!savedReadback) && !unresolved && (!state.stale || !!savedReadback) && (!dirty || !!savedReadback) ? { getDocument: () => transferDocumentOutput(detail) } : {})} unavailableReason="请先完成保存并读取当前单据" />
      <TransferHistoryAction {...(history ? { capability: history } : {})} {...(detail ? { transferId: detail.document.header.id } : {})} />
    </>}
  >
    {existingDocumentNotice && <p className="transfer-command-notice" role="status">{existingDocumentNotice}</p>}
    {editor.phase === 'loading' && <p className="transfer-command-notice" role="status">正在读取调拨单…</p>}
    {editor.readError && <p className="transfer-command-notice" role="alert">单据读取未完成。<UIButton type="button" className="iw-link" disabled={unresolved} onClick={() => { void workspace.readCurrent(); }}>重新读取当前单据</UIButton></p>}
    {header && <><div className="tc-doc-header"><div className="tc-gold-doc-fields">
      <div className="tc-gold-field"><span>单据日期 *</span>{input ? <UIDate aria-label="单据日期" value={input.businessDate} disabled={locked} onChange={value => update({ ...input, businessDate: value })} /> : <UIDate aria-label="单据日期" value={header.businessDate} disabled onChange={() => {}} />}</div>
      <div className="tc-gold-field"><span>调出仓库</span><span className="transfer-read-value" title={names?.fromWarehouseName ?? undefined}>{names?.fromWarehouseName ?? '仓库名称未提供'}</span></div>
      <div className="tc-gold-field"><span>调入仓库</span><span className="transfer-read-value" title={names?.toWarehouseName ?? undefined}>{names?.toWarehouseName ?? '仓库名称未提供'}</span></div>
      <div className="tc-gold-field tc-gold-doc-number"><span>单号</span><strong className="transfer-read-value">{detail ? header.number : write.phase === 'committed' ? '已保存，待读取单号' : header.number}</strong></div>
      <div className="tc-gold-field"><span>创建者</span><span className="transfer-read-value">{names?.createdByName ?? (detail ? '未知' : '保存后记录')}</span></div>
      <div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled title="当前商品选择及原生条码读取尚未接入">扫码录入</UIButton></div>
    </div></div>
    <label className="tc-note-row"><span>备注</span>{input ? <UIInput aria-label="备注" className="iw-control transfer-note-input" maxLength={10000} value={input.note} disabled={locked} onChange={nextValue => update({ ...input, note: nextValue })} /> : <span className="tc-note-read">{header.note || '—'}</span>}</label></>}
    {(detail?.stockBasis === 'CUTOFF_HISTORY' || status === 'APPROVED' || status === 'VOID') && <p className="transfer-readonly-note">{detail?.stockBasis === 'CUTOFF_HISTORY' ? '历史修订尚未接通，当前仅可查看。' : status === 'APPROVED' ? '已审核，弃审后才能修改。' : '此单已作废，仅可查看。'}</p>}
    {state.notice && <p className="transfer-command-notice" role={editor.inputError || write.phase === 'rejected' ? 'alert' : 'status'}>{state.notice}</p>}
    <TransferCommandRecovery workspace={workspace} />
    {write.phase === 'committed' && <p className="transfer-command-notice" role="status">原操作已确认：版本 {write.result?.version}，{write.result ? transferStatusLabels[write.result.status] : ''}。库存流水 {write.result?.ledgerEntryIds.length} 条。{savedReadback ? '下方显示重新读取的已保存单据；继续操作前请采用当前单据。' : '正在核对已保存内容；读取失败可重试，保存不会重复提交。'}</p>}
    {!unresolved && (editor.detail && write.phase !== 'idle' || write.phase === 'committed') && <UIButton type="button" className="iw-button transfer-read-current" disabled={editor.phase === 'loading'} onClick={() => { void workspace.readCurrent(); }}>读取当前单据</UIButton>}
    {editor.current && <p className="transfer-command-notice" role="status">已读取当前版本 {editor.current.document.header.version}，尚未替换原草稿。<UIButton type="button" className="iw-button" onClick={() => workspace.adoptCurrent()}>采用当前单据</UIButton></p>}
    <div className="tc-section-head"><strong>调拨明细</strong></div>
    <TransferEditableLines {...(openProduct ? { onOpenProduct: (skuId, target) => openProduct(skuId, 'TRANSFER', target) } : {})} detail={detail} draft={savedReadback ? null : editor.draft} input={input} locked={locked} invalid={savedReadback ? false : editor.inputError} update={update} />
    <TransferDocumentSummary lines={lines.map(line => ({ productId: detail?.catalog.skus.find(sku => sku.skuId === line.skuId)?.productId, quantity: input ? input.quantities[line.id] ?? '' : line.quantity }))} />
    {discard && <SourceDocumentDialog title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setDiscard(false)} className="source-discard-dialog" initialFocus="[data-erp-keep-input]" footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setDiscard(false)}>继续编辑</button><button type="button" className="btn primary" onClick={() => { setDiscard(false); if (workspace.discardEditor()) close(); }}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>离开后，本次未保存的修改将丢失。</p></div></SourceDocumentDialog>}
    {voidTarget && detail && voidTarget.id === editor.transferId && voidTarget.version === detail.document.header.version && !unresolved && !dirty && !state.stale && !editor.current && editor.phase === 'ready' && <TransferVoidConfirmation number={detail.document.header.number} close={() => setVoidTarget(null)} confirm={() => {
      const target = voidTarget, current = workspace.getSnapshot().editor; setVoidTarget(null);
      if (scope.active && current?.transferId === target.id && current.detail?.document.header.version === target.version) void workspace.submit('VOID');
    }} />}
    {detail && <TransferSavedRecords data={detail} />}
  </TransferDocumentPage>}</DocumentProductPresentation>;
}
