import { DocumentResponsibilityFields } from '../../components/document-responsibility.tsx';
import { SalesDocumentColumns, SalesDocumentColumnHead, SalesDocumentPresentation, SalesDocumentSummary, SalesProductPresentation, salesPaymentBalance, salesPaymentKind, salesDisplayedDiscount, salesRawLinePrice, salesDocumentType, type SalesProductCapability } from '../document-presentation.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import { SourceDocumentDialog, StandardOverlay } from '../../components/standard-overlay.tsx';
import { DocumentOutputActions } from '../../components/document-output.tsx';
import { salesDocumentOutput } from '../../components/document-output-contracts.ts';
import { SalesStatusTag } from '../sales-status-tag.tsx';
import { UIDate, UIButton, UIInput } from '../../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { salesStatusLabels } from '../model.ts';
import type { SalesDetailDto } from '../contracts.ts';
import type { SalesEditorSession } from './editor-session.ts';
import { compileSalesForm, salesInputMoney, type SalesFormInput } from './form-model.ts';
import { settlementBalanced } from './validation.ts';
import { SalesHistoryAction, type SalesHistoryCapability } from '../history-view.tsx';

/** Bounded full-page editor using the frozen header/sections/columns. Current
 * identity/product/account pickers are explicitly unavailable in this slice. */
export interface SalesCommandFormProps { readonly scope?: ReadScope; readonly product?: SalesProductCapability; readonly session: SalesEditorSession; readonly close: () => void; readonly history?: SalesHistoryCapability }
export function SalesCommandForm(props: SalesCommandFormProps) {
  const state = useSyncExternalStore(props.session.subscribe, props.session.getSnapshot, props.session.getSnapshot);
  const [bridge, setBridge] = useState<{ readonly owner: SalesEditorSession; readonly View: typeof import('../../current-form/sales-existing-document-form.tsx').SalesExistingDocumentForm } | null>(null);
  const [failedOwner, setFailedOwner] = useState<SalesEditorSession | null>(null);
  const enabled = props.session.canUseExistingProposal;
  useEffect(() => { if (!enabled) return; let live = true; void import('../../current-form/sales-existing-document-form.tsx').then(module => { if (live) setBridge({ owner: props.session, View: module.SalesExistingDocumentForm }); }, () => { if (live) setFailedOwner(props.session); }); return () => { live = false; }; }, [props.session, enabled]);
  if (enabled && bridge?.owner === props.session) return <bridge.View {...props} />;
  // Keep raw input inactive until the saved proposal has captured it. A user
  // cannot edit a fallback concurrently with the cold SKU relation read.
  if (enabled && props.session.editable && failedOwner !== props.session) return <SalesDocumentPresentation status={<p role="status">正在准备完整旧单编辑页…</p>} />;
  return <SalesNativeCommandForm {...props} key={state.command.editor?.salesId} />;
}
export function SalesNativeCommandForm({ session, close, history, scope, product }: SalesCommandFormProps) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  const [zeroLine, setZeroLine] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'leave' | 'cancel-edit' | 'adopt' | 'APPROVE' | 'UNAPPROVE' | 'VOID' | null>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { command } = state, { editor, write } = command;
  const committedRead = useRef<{ owner: SalesEditorSession; operationId: string } | null>(null);
  useEffect(() => {
    if (write.phase !== 'committed' || !write.result || !editor || editor.current || editor.readError || editor.phase === 'loading') return;
    if (committedRead.current?.owner === session && committedRead.current.operationId === write.result.operationId) return;
    committedRead.current = { owner: session, operationId: write.result.operationId };
    // Confirmed writes get one read-only refresh. Keep the original command,
    // CAS and raw input until the user explicitly adopts the current document.
    void session.commands.readCurrent();
  }, [session, write.phase, write.result, editor?.salesId, editor?.current, editor?.readError, editor?.phase]);
  const savedReadback = write.phase === 'committed' ? editor?.current : null;
  const detail = savedReadback ?? editor?.detail, input = savedReadback || state.viewOnly ? null : state.input;
  useEffect(() => { setConfirm(null); }, [editor?.salesId, editor?.detail?.document.header.version, editor?.current, write.phase, input]);
  if (command.disposed) return <SalesDocumentPresentation status={<p role="status">身份或权限已改变，旧身份单据输入已清除。</p>} />;
  const unresolved = session.commands.hasUnresolvedWrite, working = ['submitting', 'checking', 'replaying'].includes(write.phase);
  const header = detail?.document.header ?? editor?.draft?.header, status = detail?.document.header.status ?? 'DRAFT';
  const base = editor?.draft, preview = base && input ? compileSalesForm(base, input) : null;
  const draft = preview?.ok ? preview.draft : null;
  const due = draft?.header.netDue ?? (input ? null : header?.netDue ?? null);
  const lines = savedReadback?.document.lines ?? draft?.lines ?? (input && base ? base.lines.filter(line => input.lines.some(row => row.id === line.id)) : base?.lines) ?? detail?.document.lines ?? [];
  const settlements = savedReadback?.document.settlements ?? draft?.settlements ?? (input && base ? base.settlements.filter(row => input.settlements.some(item => item.id === row.id)) : base?.settlements) ?? detail?.document.settlements ?? [];
  const lock = !session.editable, stable = !!editor?.detail && editor.phase === 'ready' && !editor.current && !command.stale && !unresolved
    && write.phase !== 'committed' && editor.detail.stockBasis === 'RUNTIME_LEDGER';
  const names = detail?.referenceNames, settlementNames = new Map<string, SalesDetailDto['settlementNames'][number]>(detail?.settlementNames.map(row => [row.settlementId, row]));
  const responsibleId = savedReadback ? savedReadback.document.header.responsibleStaffId : base?.header.responsibleStaffId ?? detail?.document.header.responsibleStaffId ?? null;
  const selectedResponsible = session.existingDocument?.getSnapshot().proposal?.getSnapshot().draft.responsible;
  const responsibleLabel = !savedReadback && selectedResponsible?.id === responsibleId ? selectedResponsible.name : responsibleId === detail?.document.header.responsibleStaffId ? names?.responsibleName ?? null : null;
  const change = (next: SalesFormInput) => { session.updateInput(next); };
  const changeLine = (id: string, patch: Partial<SalesFormInput['lines'][number]>) => { if (input) change({ ...input, lines: input.lines.map(row => row.id === id ? { ...row, ...patch } : row) }); };
  const field = (label: string, content: ReactNode, className = '') => <div className={`tc-gold-field ${className}`}><span className="sale-field-label">{label}</span>{content}</div>;
  const read = (value: string | null | undefined) => <span className="sale-read-value">{value ?? '当前资料名称未提供'}</span>;
  const leave = () => { if (unresolved) return; if (session.hasDirtyDraft) setConfirm('leave'); else if (session.discardEditor()) close(); };
  const confirmAction = () => {
    const action = confirm; setConfirm(null);
    if (action === 'leave') { if (session.discardEditor(true)) close(); }
    else if (action === 'cancel-edit') void session.cancelEditing(true);
    else if (action === 'adopt') session.adoptCurrent(true);
    else if (action) void session.submit(action);
  };
  const save = () => {
    const zero = input?.lines.find(raw => !raw.isGift && !raw.zeroConfirmed && salesRawLinePrice(base?.lines.find(line => line.id === raw.id)?.referencePrice ?? null, raw) === '0');
    if (zero) setZeroLine(zero.id); else void session.save();
  };
  const zero = input?.lines.find(row => row.id === zeroLine);
  const sections = [{ title: '商品明细', incoming: false, rows: lines }];
  return <SalesProductPresentation {...(scope ? { scope } : {})} {...(product ? { capability: product } : {})}>{openProduct => <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor sales-command-editor" aria-label="销货单编辑"><SalesDocumentPresentation header={<>
    <div className="tc-head sale-head sales-document-state"><h1 ref={heading} tabIndex={-1}>{editor?.mode === 'CREATE' && write.phase !== 'committed' ? '新增销货单' : session.editable ? '编辑销货单' : '查看销货单'}</h1>
      <SalesStatusTag status={status} />
      <span className="sale-muted">{session.hasDirtyDraft ? '· 有未保存输入' : '· 已保存'}</span><div className="actions">
        <button type="button" className="btn" disabled={unresolved} onClick={leave}>返回列表</button>
        {session.canCancelEditing && <button type="button" className="btn" onClick={() => { if (session.hasDirtyDraft) setConfirm('cancel-edit'); else void session.cancelEditing(); }}>取消修改</button>}
        {status === 'DRAFT' && <button type="button" className="btn sale-delete-action" disabled={!stable || session.hasDirtyDraft || !session.actionAllowed('VOID')} onClick={() => setConfirm('VOID')}>作废</button>}
        {session.canBeginEditing && <button type="button" className="btn" onClick={() => session.beginEditing()}>修改</button>}
        {(editor?.mode === 'CREATE' || !lock) && <button type="button" className="btn" disabled={lock || !session.hasDirtyDraft} onClick={save}>保存</button>}
        {status === 'DRAFT' && <button type="button" className="btn primary" disabled={!stable || session.hasDirtyDraft || !session.actionAllowed('APPROVE') || !base || !settlementBalanced(base)} title="审核须先保存并读取当前单据，收款减退款与应结金额精确配平" onClick={() => setConfirm('APPROVE')}>审核</button>}
        {status === 'APPROVED' && <button type="button" className="btn" disabled={!stable || !session.actionAllowed('UNAPPROVE')} title={session.actionAllowed('UNAPPROVE') ? undefined : '业务员不能弃审'} onClick={() => setConfirm('UNAPPROVE')}>弃审</button>}
        <DocumentOutputActions sourceKey={detail ? `${detail.document.header.id}:${detail.document.header.version}` : "unsaved"} {...(detail && (write.phase !== 'committed' || !!savedReadback) && !unresolved && (!command.stale || !!savedReadback) && (!session.hasDirtyDraft || !!savedReadback) ? { getDocument: () => salesDocumentOutput(detail) } : {})} unavailableReason="请先完成保存并读取当前单据" />
        <SalesHistoryAction {...(history ? { capability: history } : {})} {...(detail ? { salesId: detail.document.header.id } : {})} />
      </div></div>
    {(confirm === 'leave' || confirm === 'cancel-edit') && <SourceDocumentDialog title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setConfirm(null)} className="source-discard-dialog" initialFocus="[data-erp-keep-input]" footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setConfirm(null)}>继续编辑</button><button type="button" className="btn primary" onClick={confirmAction}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>离开后，本次未保存的修改将丢失。</p></div></SourceDocumentDialog>}
    {confirm && confirm !== 'leave' && confirm !== 'cancel-edit' && <StandardOverlay role="alertdialog" title="确认操作" label="确认销货单操作" closeLabel="关闭销货单操作确认" close={() => setConfirm(null)} width={620}><p>{confirm === 'adopt' ? '采用当前单据将替换本次未保存输入，原单据不会被强制覆盖。' : confirm === 'APPROVE' ? '审核将按本单实际明细追加库存效果，并计入收退统计。允许负库存。' : confirm === 'UNAPPROVE' ? '弃审将追加原审核库存效果的反向流水，并退出收退统计；确认后还需读取当前单据。' : '作废仅作用于已保存未审核单据，不改库存，作废后不能继续编辑。'}</p><UIButton type="button" className="iw-button" onClick={() => setConfirm(null)}>取消</UIButton><UIButton type="button" className="iw-button iw-primary" onClick={confirmAction}>{confirm === 'adopt' ? '确认采用当前单据' : `确认${confirm === 'APPROVE' ? '审核' : confirm === 'UNAPPROVE' ? '弃审' : '作废'}`}</UIButton></StandardOverlay>}
    {state.preparing && <p role="status">{editor?.mode === 'EXISTING' ? '正在重新读取当前单据，输入已保留…' : '正在准备当前授权新单资料…'}<UIButton type="button" className="iw-link" onClick={() => { session.suspend(); if (editor?.mode !== 'EXISTING') close(); }}>{editor?.mode === 'EXISTING' ? '取消读取' : '取消准备'}</UIButton></p>}
    {editor?.phase === 'loading' && <p role="status">正在读取销货单…</p>}
    {editor?.readError && <p className="iw-alert" role="alert">当前单据未能读取。<UIButton type="button" className="iw-link" disabled={unresolved} onClick={() => { void session.commands.readCurrent(); }}>重新读取当前单据</UIButton></p>}
  </>}
    facts={header && <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      {field('单据日期', input ? <UIDate aria-label="单据日期" value={input.businessDate} disabled={lock} onChange={value => change({ ...input, businessDate: value })} /> : <UIDate aria-label="单据日期" value={header.businessDate} disabled onChange={() => {}} />, 'sale-date-field')}
      {field('业务类型', read(header.businessType === 'SALE' ? '销售' : '退货/换货'))}
      {field('营业厅', read(names?.hallName))}{field('营业员', read(names?.salespersonName ?? (header.salespersonId === null ? '未指定' : null)))}
      {field('客户', read(names?.customerName))}{field('出库仓', read(names?.warehouseName))}
      {field('单号', <strong className="sale-number-value">{detail ? header.number : write.phase === 'committed' ? '已保存，待读取单号' : header.number}</strong>, 'sale-number-field')}
      <DocumentResponsibilityFields {...(scope ? { scope } : {})} saved={!!detail || write.phase === 'committed'} creatorName={names?.createdByName ?? null} value={responsibleId ? { id: responsibleId, name: responsibleLabel } : null} readOnly valueClassName="sale-read-value" />
      {field('整单优惠 / 抹零', input ? <UIInput className="iw-control" aria-label="整单优惠 / 抹零" inputMode="decimal" value={input.orderDiscount} disabled={lock || header.businessType !== 'SALE'} onChange={nextValue => change({ ...input, orderDiscount: nextValue })} /> : read(salesInputMoney(header.orderDiscount)), 'sale-discount-field')}
      {field('应结金额', <strong className="sale-due-value">{due === null ? '输入尚未校验' : `${due.startsWith('-') ? '-¥' : '¥'}${salesInputMoney(due.replace(/^-/, ''))}`}</strong>, 'sale-due-field')}
      {field('收款', <><div className="sale-payment-rows">{settlements.map(row => {
        const raw = input?.settlements.find(item => item.id === row.id), labels = settlementNames.get(row.id);
        return <div key={row.id} className={raw ? 'sale-payment-row' : 'sale-payment-read'}><span className="sale-read-value" title={labels?.methodNameSnapshot ?? '原付款方式未知'}>{labels?.methodNameSnapshot ?? '原付款方式未知'}</span><span className="sale-read-value" title={labels?.accountNameSnapshot ?? '原账户未知'}>{labels?.accountNameSnapshot ?? '原账户未知'}</span>
          {raw ? <UIInput aria-label={`收退金额 ${row.lineNo}`} inputMode="decimal" value={(raw.direction === 'REFUND' ? '-' : '') + raw.amount} disabled={lock} onChange={value => change({ ...input!, settlements: input!.settlements.map(item => item.id === row.id ? { ...item, direction: value.startsWith('-') ? 'REFUND' : 'RECEIVE', amount: value.startsWith('-') ? value.slice(1) : value } : item) })} /> : <strong>{row.direction === 'REFUND' ? '-' : ''}{salesInputMoney(row.amount)}</strong>}
          {raw && <div className="sale-payment-actions"><UIButton className="sale-link" disabled={lock} aria-label={`删除收退 ${row.lineNo}`} onClick={() => change({ ...input!, settlements: input!.settlements.filter(item => item.id !== row.id) })}>删除</UIButton></div>}</div>;
      })}{!settlements.length && <span className="sale-read-value">本单没有收退明细</span>}</div><span className={`sale-payment-balance ${salesPaymentKind(draft?.header.netDue ?? (input ? null : header.netDue), input && !draft ? null : settlements.reduce((sum, row) => sum + (row.direction === 'REFUND' ? -1n : 1n) * BigInt(row.amount), 0n).toString(), lines.length)}`}>{salesPaymentBalance(draft?.header.netDue ?? (input ? null : header.netDue), input && !draft ? null : settlements.reduce((sum, row) => sum + (row.direction === 'REFUND' ? -1n : 1n) * BigInt(row.amount), 0n).toString(), lines.length)}</span></>, 'sale-payment-field')}
    </div></div>}
    note={header && <label className="sale-note-row"><span className="sale-field-label">备注</span>{input ? <UIInput className="iw-control" aria-label="备注" value={input.note} disabled={lock} onChange={nextValue => change({ ...input, note: nextValue })} /> : <span className="sale-note-read">{header.note ?? '未填写'}</span>}</label>}
    status={editor?.detail?.stockBasis === 'CUTOFF_HISTORY' ? <p role="status">历史单据仅可查看。</p> : status === 'APPROVED' ? <p role="status">已审核单据须先弃审再修改。</p> : status === 'VOID' ? <p role="status">作废单据仅可查看。</p> : !base && editor?.detail ? <p role="status">原价格或付款方式资料不完整，暂不能保存或审核。</p> : null}
    beforeLines={<>
    {(state.notice || command.notice) && <p className="iw-alert" role={Object.keys(state.errors).length || write.phase === 'rejected' ? 'alert' : 'status'}>{state.notice ?? command.notice}</p>}
    {Object.entries(state.errors).map(([key, message]) => <p className="iw-alert" role="alert" key={key}>{message}</p>)}
    {working && <p role="status">正在处理原操作…<UIButton type="button" className="iw-link" onClick={() => session.commands.cancelWaiting()}>停止等待</UIButton></p>}
    {write.phase === 'uncertain' && <div className="iw-alert" role="status"><strong>原操作结果不确定，不能另建重复操作。</strong><p>原操作键：{write.command?.requestKey}</p><UIButton type="button" className="iw-button" onClick={() => { void session.commands.checkReceipt(); }}>核实原操作回执</UIButton><UIButton type="button" className="iw-button" onClick={() => { void session.commands.replayOriginal(); }}>重放原请求</UIButton></div>}
    {write.phase === 'committed' && <p role="status">原操作已确认：版本 {write.result?.version}，{write.result ? salesStatusLabels[write.result.status as 'DRAFT' | 'APPROVED' | 'VOID'] : ''}。{savedReadback ? '下方显示重新读取的已保存单据；继续操作前请采用当前单据。' : '正在核对已保存内容；读取失败可重试，保存不会重复提交。'}</p>}
    {!unresolved && editor && (command.stale || editor.readError || write.phase === 'committed' && !editor.current) && <UIButton type="button" className="iw-button" disabled={editor.phase === 'loading'} onClick={() => { void session.commands.readCurrent(); }}>读取当前单据</UIButton>}
    {editor?.current && <p role="status">当前版本 {editor.current.document.header.version} 已读取，原操作和输入仍保留。<UIButton type="button" className="iw-button" onClick={() => { if (session.hasDirtyDraft) setConfirm('adopt'); else session.adoptCurrent(); }}>采用当前单据</UIButton></p>}
  </>}
    lines={<>{sections.map(section => <section className="sale-entry-section" key={section.title}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong></div><div className="sale-lines sales-table-scroll"><table className="sales-table sale-lines-table" aria-label={`销货明细 · ${section.title}`}><SalesDocumentColumns /><SalesDocumentColumnHead incoming={section.incoming} /><tbody>{section.rows.map(line => {
      const raw = input?.lines.find(row => row.id === line.id), prefix = `${line.snapshot.productCode} ${line.lineNo}`, price = raw ? salesRawLinePrice(line.referencePrice, raw) : line.dealPrice;
      return <tr key={line.id}><td><div className="sale-product-cell"><strong>{line.snapshot.productCode}</strong><span className="sale-product-name">{line.snapshot.productName}</span></div></td><td>{line.snapshot.colorName}</td><td>{line.snapshot.fitName}</td><td>{line.snapshot.sizeName}</td>
        <td>{raw ? <UIInput className="iw-control" aria-label={`${prefix} 数量`} inputMode="numeric" value={raw.quantity} disabled={lock} onChange={nextValue => changeLine(line.id, { quantity: nextValue })} /> : line.quantity}</td><td className="sale-muted">{line.referencePrice === null ? '未记录' : salesInputMoney(line.referencePrice)}</td>
        <td>{raw && line.referencePrice !== null && !raw.isGift ? <span className="sale-discount-control"><UIInput aria-label={`${prefix} 折扣（折）`} inputMode="decimal" value={raw.pricingRule === 'DISCOUNT' ? raw.discount : salesDisplayedDiscount(line.referencePrice, price)} disabled={lock} onChange={value => changeLine(line.id, { pricingRule: 'DISCOUNT', discount: value, zeroConfirmed: false })} /><span>折</span></span> : line.discountTenths === null ? '' : `${Math.trunc(line.discountTenths / 10)}.${line.discountTenths % 10}折`}</td>
        <td>{raw ? <UIInput aria-label={`${prefix} 成交单价`} inputMode="decimal" value={raw.isGift ? '0.00' : raw.pricingRule === 'DISCOUNT' ? price === null ? '' : salesInputMoney(price) : raw.dealPrice} disabled={lock || raw.isGift} onChange={value => changeLine(line.id, { pricingRule: 'UNIT_PRICE', dealPrice: value, zeroConfirmed: false })} /> : salesInputMoney(line.dealPrice)}</td><td>{raw && (!/^-?[1-9]\d{0,18}$/.test(raw.quantity) || price === null) ? '待校验' : raw ? salesInputMoney((BigInt(raw.quantity) * BigInt(price!)).toString()) : salesInputMoney(line.lineAmount)}</td>
        <td className="ui-action-cell"><div className="sale-row-actions"><UIButton className="sale-link" disabled={!openProduct || !header} onClick={() => { if (header) openProduct?.(line.skuId, header.hallId); }}>查看</UIButton>{raw && <><UIButton className="sale-link" disabled={lock} onClick={() => changeLine(line.id, { isGift: !raw.isGift })}>{raw.isGift ? '取消赠品' : '赠品'}</UIButton><UIButton className="sale-link" disabled={lock} aria-label={`删除明细 ${line.lineNo}`} onClick={() => { if (input) change({ ...input, lines: input.lines.filter(row => row.id !== line.id) }); }}>删除</UIButton></>}</div></td></tr>;
    })}</tbody></table></div></section>)}</>}
    summary={header && <SalesDocumentSummary businessType={salesDocumentType(header.businessType)} snapshotCodes lines={lines.map(line => ({ styleKey: line.snapshot.productCode, quantity: input?.lines.find(row => row.id === line.id)?.quantity ?? line.quantity, isGift: input?.lines.find(row => row.id === line.id)?.isGift ?? line.isGift }))} grossMinor={draft?.header.grossAmount ?? (input ? null : header.grossAmount)} discountMinor={draft?.header.orderDiscount ?? (input ? null : header.orderDiscount)} netDueMinor={draft?.header.netDue ?? (input ? null : header.netDue)} />}
    afterSummary={zero && <SourceDocumentDialog title="确认普通零价商品" label="确认普通零价商品" closeLabel="关闭弹窗" close={() => setZeroLine(null)} className="source-confirm-dialog" footer={<><button type="button" className="btn" onClick={() => setZeroLine(null)}>取消</button><button type="button" className="btn primary" onClick={() => { const original = base?.lines.find(line => line.id === zero.id); if (salesRawLinePrice(original?.referencePrice ?? null, zero) === '0') changeLine(zero.id, { zeroConfirmed: true }); setZeroLine(null); }}>确认零价</button></>}><div className="ui-confirm-body"><p>此行单价为0.00元，不标为赠品，审核时仍按业务类型处理商品数量。</p></div></SourceDocumentDialog>}
  /></section>}</SalesProductPresentation>;
}
