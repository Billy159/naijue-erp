import { DatePicker } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { salesStatusLabels, salesTypeLabels } from '../model.ts';
import type { SalesDetailDto } from '../contracts.ts';
import type { SalesEditorSession } from './editor-session.ts';
import { compileSalesForm, salesInputMoney, type SalesFormInput } from './form-model.ts';
import { settlementBalanced } from './validation.ts';

/** Bounded full-page editor using the frozen header/sections/columns. Current
 * identity/product/account pickers are explicitly unavailable in this slice. */
export function SalesCommandForm({ session, close }: { readonly session: SalesEditorSession; readonly close: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null), dateHost = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<'leave' | 'adopt' | 'APPROVE' | 'UNAPPROVE' | 'VOID' | null>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { command, input } = state, { editor, write } = command;
  useEffect(() => { setConfirm(null); }, [editor?.salesId, editor?.detail?.document.header.version, editor?.current, write.phase, input]);
  if (command.disposed) return <p role="status">身份或权限已改变，旧身份单据输入已清除。</p>;
  const unresolved = session.commands.hasUnresolvedWrite, working = ['submitting', 'checking', 'replaying'].includes(write.phase);
  const header = editor?.detail?.document.header ?? editor?.draft?.header, status = editor?.detail?.document.header.status ?? 'DRAFT';
  const base = editor?.draft, preview = base && input ? compileSalesForm(base, input) : null;
  const draft = preview?.ok ? preview.draft : null;
  const lines = draft?.lines ?? base?.lines ?? editor?.detail?.document.lines ?? [];
  const settlements = draft?.settlements ?? base?.settlements ?? editor?.detail?.document.settlements ?? [];
  const lock = !session.editable, stable = !!editor?.detail && editor.phase === 'ready' && !editor.current && !command.stale && !unresolved
    && write.phase !== 'committed' && editor.detail.stockBasis === 'RUNTIME_LEDGER';
  const names = editor?.detail?.referenceNames, settlementNames = new Map<string, SalesDetailDto['settlementNames'][number]>(editor?.detail?.settlementNames.map(row => [row.settlementId, row]));
  const change = (next: SalesFormInput) => { session.updateInput(next); };
  const changeLine = (id: string, patch: Partial<SalesFormInput['lines'][number]>) => { if (input) change({ ...input, lines: input.lines.map(row => row.id === id ? { ...row, ...patch } : row) }); };
  const field = (label: string, content: ReactNode, className = '') => <div className={`tc-gold-field ${className}`}><span className="sale-field-label">{label}</span>{content}</div>;
  const read = (value: string | null | undefined) => <span className="sale-read-value">{value ?? '当前资料名称未提供'}</span>;
  const leave = () => { if (unresolved) return; if (session.hasDirtyDraft) setConfirm('leave'); else if (session.discardEditor()) close(); };
  const confirmAction = () => {
    const action = confirm; setConfirm(null);
    if (action === 'leave') { if (session.discardEditor(true)) close(); }
    else if (action === 'adopt') session.adoptCurrent(true);
    else if (action) void session.submit(action);
  };
  const sections = header?.businessType === 'EXCHANGE'
    ? [{ title: '退回商品', incoming: true, rows: lines.filter(line => BigInt(line.quantity) < 0n) }, { title: '换出商品', incoming: false, rows: lines.filter(line => BigInt(line.quantity) >= 0n) }]
    : [{ title: header?.businessType === 'RETURN' ? '退回商品' : '商品明细', incoming: header?.businessType === 'RETURN', rows: lines }];
  return <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor sales-command-editor" aria-label="销货单编辑">
    <div className="tc-head sale-head sales-document-state"><h1 ref={heading} tabIndex={-1}>{editor?.mode === 'CREATE' ? '新增销货单' : session.editable ? '编辑销货单' : '查看销货单'}</h1>
      <span className="tc-status" data-document-status={status === 'APPROVED' ? 'effective' : status === 'VOID' ? 'void' : 'pending'}>{salesStatusLabels[status]}</span>
      <span className="sale-muted">{session.hasDirtyDraft ? '· 有未保存输入' : '· 已保存'}</span><div className="actions">
        <button type="button" className="iw-text-button" disabled={unresolved} onClick={leave}>返回列表</button>
        <button type="button" className="iw-text-button" disabled={lock || !session.hasDirtyDraft} onClick={() => { void session.save(); }}>保存</button>
        {status === 'DRAFT' && <><button type="button" className="iw-text-button" disabled={!stable || session.hasDirtyDraft || !session.actionAllowed('APPROVE') || !base || !settlementBalanced(base)} title="审核须先保存并读取当前单据，收款减退款与应结金额精确配平" onClick={() => setConfirm('APPROVE')}>审核</button>
          <button type="button" className="iw-text-button" disabled={!stable || session.hasDirtyDraft || !session.actionAllowed('VOID')} onClick={() => setConfirm('VOID')}>作废</button></>}
        {status === 'APPROVED' && <button type="button" className="iw-text-button" disabled={!stable || !session.actionAllowed('UNAPPROVE')} title={session.actionAllowed('UNAPPROVE') ? undefined : '业务员不能弃审'} onClick={() => setConfirm('UNAPPROVE')}>弃审</button>}
        {['导出', '打印', '操作历史'].map(label => <button key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</button>)}
      </div></div>
    {confirm && <div className="iw-alert" role="alert"><p>{confirm === 'leave' ? '离开将放弃本次未保存输入，已保存单据不变。' : confirm === 'adopt' ? '采用当前单据将替换本次未保存输入，原单据不会被强制覆盖。' : confirm === 'APPROVE' ? '审核将按本单实际明细追加库存效果，并计入收退统计。允许负库存。' : confirm === 'UNAPPROVE' ? '弃审将追加原审核库存效果的反向流水，并退出收退统计；确认后还需读取当前单据。' : '作废仅作用于已保存未审核单据，不改库存，作废后不能继续编辑。'}</p><button type="button" className="iw-button" onClick={() => setConfirm(null)}>取消</button><button type="button" className="iw-button iw-primary" onClick={confirmAction}>{confirm === 'leave' ? '放弃修改并返回' : confirm === 'adopt' ? '确认采用当前单据' : `确认${confirm === 'APPROVE' ? '审核' : confirm === 'UNAPPROVE' ? '弃审' : '作废'}`}</button></div>}
    {state.preparing && <p role="status">正在准备当前授权新单资料…<button type="button" className="iw-link" onClick={() => { session.suspend(); close(); }}>取消准备</button></p>}
    {editor?.phase === 'loading' && <p role="status">正在读取销货单…</p>}
    {editor?.readError && <p className="iw-alert" role="alert">当前单据未能读取。<button type="button" className="iw-link" disabled={unresolved} onClick={() => { void session.commands.readCurrent(); }}>重新读取当前单据</button></p>}
    {header && <><div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      {field('单据日期', input ? <div ref={dateHost} onInputCapture={event => { if (!lock && event.target instanceof HTMLInputElement) change({ ...input, businessDate: event.target.value }); }}><DatePicker aria-label="单据日期" value={input.businessDate} disabled={lock} allowClear format="YYYY-MM-DD" getPopupContainer={() => dateHost.current ?? document.body} onChange={value => change({ ...input, businessDate: value || '' })} /></div> : read(header.businessDate), 'sale-date-field')}
      {field('业务类型', read(salesTypeLabels[header.businessType as 'SALE' | 'RETURN' | 'EXCHANGE']))}
      {field('营业厅', read(names?.hallName))}{field('营业员', read(names?.salespersonName ?? (header.salespersonId === null ? '未指定' : null)))}
      {field('客户', read(names?.customerName))}{field('出库仓', read(names?.warehouseName))}
      {field('单号', <strong className="sale-number-value">{header.number}</strong>, 'sale-number-field')}
      {field('整单优惠 / 抹零', input ? <input className="iw-control" aria-label="整单优惠 / 抹零" inputMode="decimal" value={input.orderDiscount} disabled={lock || header.businessType !== 'SALE'} onChange={event => change({ ...input, orderDiscount: event.target.value })} /> : read(salesInputMoney(header.orderDiscount)), 'sale-discount-field')}
      {field('应结金额', <strong className="sale-due-value">{draft ? `¥${salesInputMoney(draft.header.netDue)}` : input ? '输入尚未校验' : `¥${salesInputMoney(header.netDue)}`}</strong>, 'sale-due-field')}
      {field('本单收退明细', <div className="sale-payment-rows">{settlements.map(row => {
        const raw = input?.settlements.find(item => item.id === row.id), labels = settlementNames.get(row.id);
        return <div key={row.id} className="sale-payment-read">{raw ? <select className="iw-control" aria-label={`收退方向 ${row.lineNo}`} disabled={lock} value={raw.direction} onChange={event => change({ ...input!, settlements: input!.settlements.map(item => item.id === row.id ? { ...item, direction: event.target.value as 'RECEIVE' | 'REFUND' } : item) })}><option value="RECEIVE">收款</option><option value="REFUND">退款</option></select> : <span>{row.direction === 'RECEIVE' ? '收款' : '退款'}</span>}
          <span title="当前账户选择器尚未接入，保持原账户">{labels ? `${labels.methodNameSnapshot} · ${labels.accountNameSnapshot}` : '当前账户名称未提供'}</span>
          {raw ? <input className="iw-control" aria-label={`收退金额 ${row.lineNo}`} inputMode="decimal" value={raw.amount} disabled={lock} onChange={event => change({ ...input!, settlements: input!.settlements.map(item => item.id === row.id ? { ...item, amount: event.target.value } : item) })} /> : <strong>{salesInputMoney(row.amount)}</strong>}</div>;
      })}{!settlements.length && <span className="sale-read-value">本单没有收退明细</span>}</div>, 'sale-payment-field')}
    </div></div><label className="sale-note-row"><span className="sale-field-label">备注</span>{input ? <textarea className="iw-control" aria-label="备注" rows={1} value={input.note} disabled={lock} onChange={event => change({ ...input, note: event.target.value })} /> : <span className="sale-note-read">{header.note ?? '未填写'}</span>}</label></>}
    <p className="sale-muted">本步只修改原有实际行及收退金额。当前商品、规格、营业厅、客户、仓库及账户选择尚未接入，原身份和条码保持不变。{editor?.detail?.stockBasis === 'CUTOFF_HISTORY' ? '历史单据未开放写入。' : status === 'APPROVED' ? '已审核单据须先弃审再修改。' : status === 'VOID' ? '作废单据仅可查看。' : !base && editor?.detail ? '原单缺少明确价格事实或原付款方式编号，不能推断为新保存或审核意图。' : ''}</p>
    {(state.notice || command.notice) && <p className="iw-alert" role={Object.keys(state.errors).length || write.phase === 'rejected' ? 'alert' : 'status'}>{state.notice ?? command.notice}</p>}
    {Object.entries(state.errors).map(([key, message]) => <p className="iw-alert" role="alert" key={key}>{message}</p>)}
    {working && <p role="status">正在处理原操作…<button type="button" className="iw-link" onClick={() => session.commands.cancelWaiting()}>停止等待</button></p>}
    {write.phase === 'uncertain' && <div className="iw-alert" role="status"><strong>原操作结果不确定，不能另建重复操作。</strong><p>原操作键：{write.command?.requestKey}</p><button type="button" className="iw-button" onClick={() => { void session.commands.checkReceipt(); }}>核实原操作回执</button><button type="button" className="iw-button" onClick={() => { void session.commands.replayOriginal(); }}>重放原请求</button></div>}
    {write.phase === 'committed' && <p role="status">原操作已确认：版本 {write.result?.version}，{write.result ? salesStatusLabels[write.result.status as 'DRAFT' | 'APPROVED' | 'VOID'] : ''}。当前表单仍是原内容。</p>}
    {!unresolved && editor && (editor.detail || write.phase === 'committed') && <button type="button" className="iw-button" disabled={editor.phase === 'loading'} onClick={() => { void session.commands.readCurrent(); }}>读取当前单据</button>}
    {editor?.current && <p role="status">当前版本 {editor.current.document.header.version} 已读取，尚未替换本次输入。<button type="button" className="iw-button" onClick={() => { if (session.hasDirtyDraft) setConfirm('adopt'); else session.adoptCurrent(); }}>采用当前单据</button></p>}
    {sections.map(section => <section className="sale-entry-section" key={section.title}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong></div><div className="sale-lines sales-table-scroll"><table className="sales-table sale-lines-table"><caption className="sr-only">销货明细 · {section.title}</caption><colgroup>{[270, 100, 122, 84, 80, 95, 90, 108, 99, 142].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', section.incoming ? '退货单价' : '成交单价', '金额', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{section.rows.map(line => {
      const raw = input?.lines.find(row => row.id === line.id), prefix = `${line.snapshot.productCode} ${line.lineNo}`;
      return <tr key={line.id}><td><div className="sale-product-cell"><strong>{line.snapshot.productCode}</strong><span className="sale-product-name">{line.snapshot.productName}</span></div></td><td>{line.snapshot.colorName}</td><td>{line.snapshot.fitName}</td><td>{line.snapshot.sizeName}</td>
        <td>{raw ? <input className="iw-control" aria-label={`${prefix} 数量`} inputMode="numeric" value={raw.quantity} disabled={lock} onChange={event => changeLine(line.id, { quantity: event.target.value })} /> : line.quantity}</td><td className="sale-muted">{line.referencePrice === null ? '未记录' : salesInputMoney(line.referencePrice)}</td>
        <td>{raw ? <><select className="iw-control" aria-label={`${prefix} 计价方式`} value={raw.pricingRule} disabled={lock || raw.isGift} onChange={event => changeLine(line.id, { pricingRule: event.target.value as 'UNIT_PRICE' | 'DISCOUNT' })}><option value="UNIT_PRICE">成交单价</option><option value="DISCOUNT" disabled={line.referencePrice === null}>折扣</option></select>{raw.pricingRule === 'DISCOUNT' && <input className="iw-control" aria-label={`${prefix} 折扣（折）`} inputMode="decimal" value={raw.discount} disabled={lock || raw.isGift} onChange={event => changeLine(line.id, { discount: event.target.value })} />}</> : line.discountTenths === null ? '未记录' : `${line.discountTenths / 10}折`}</td>
        <td>{raw ? <input className="iw-control" aria-label={`${prefix} 成交单价`} inputMode="decimal" value={raw.isGift ? '0.00' : raw.pricingRule === 'DISCOUNT' && draft ? salesInputMoney(line.dealPrice) : raw.dealPrice} disabled={lock || raw.isGift || raw.pricingRule === 'DISCOUNT'} onChange={event => changeLine(line.id, { dealPrice: event.target.value })} /> : salesInputMoney(line.dealPrice)}</td><td>{preview && !preview.ok ? '待校验' : salesInputMoney(line.lineAmount)}</td>
        <td className="ui-action-cell">{raw ? <><label><input type="checkbox" aria-label={`${prefix} 赠品`} checked={raw.isGift} disabled={lock} onChange={event => changeLine(line.id, { isGift: event.target.checked })} />赠品</label><label><input type="checkbox" aria-label={`${prefix} 确认普通零价`} checked={raw.zeroConfirmed} disabled={lock || raw.isGift} onChange={event => changeLine(line.id, { zeroConfirmed: event.target.checked })} />确认零价</label></> : line.isGift ? '赠品' : ''}</td></tr>;
    })}</tbody></table></div></section>)}
    <footer className="tc-foot tc-gold-footer sale-summary"><div className="sale-summary-detail"><strong>{lines.length} 行</strong>{input && !draft && <span>本次输入待校验</span>}</div><div className="sale-summary-primary"><strong>应结 ¥{draft ? salesInputMoney(draft.header.netDue) : header && !input ? salesInputMoney(header.netDue) : '待校验'}</strong>{draft && <strong>收退{settlementBalanced(draft) ? '已配平' : '未配平，不能审核'}</strong>}</div></footer>
  </section>;
}
