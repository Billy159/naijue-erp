import { Trigger, Select, type SelectProps } from '@arco-design/web-react';
import { useDocumentLeave } from '../demo-presentation/document-navigation.tsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { TransferStatusTag } from '../transfers/transfer-status-tag.tsx';
import { SourceDocumentDialog } from '../components/standard-overlay.tsx';
import { DocumentScan } from '../components/document-scan.tsx';
import type { DocumentScanController } from '../components/document-scan-controller.ts';
import { UIButton, UIDate, UIInput } from '../components/standard-controls.tsx';
import { TransferProposalSession, transferProposalRowKey, transferProposalLineIdentity, type TransferProposalLine, type TransferPendingEntry, type TransferWarehouseSelection, type TransferProposalSnapshot } from './transfer-proposal.ts';
import type { CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import { CurrentProductFinder, type CurrentProductFinderHandle } from './product-finder.tsx';
import { DocumentProductPresentation, type DocumentProductCapability } from '../sales/document-presentation.tsx';
import { TransferDocumentBody, TransferDocumentMatrixRow, TransferDocumentPage, TransferDocumentSummary, TransferMatrixTable, transferDisplayQuantity, useTransferSizeGroups, type TransferSizeGroupCapability, type TransferDisplaySize } from '../transfers/document-presentation.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { DemoSingleSelectAction } from '../demo-controls/single-select-action.tsx';
import '../transfers/detail.css';
import './transfer-proposal.css';

// Installed Arco 2.66.16 controls value by own-property presence, including an
// explicit undefined. Its pre-exactOptionalPropertyTypes declaration omits that
// supported empty value. [] counts as a selected single value and hides the placeholder.
const SpecSelect = Select as unknown as ComponentType<Omit<SelectProps, 'value'> & { readonly value: SelectProps['value'] }>;

export interface TransferProposalPresentation {
  readonly scope?: ReadScope; readonly productCapability?: DocumentProductCapability;
  readonly sizeGroupCapability?: TransferSizeGroupCapability; readonly creatorName?: string; readonly responsibleName?: string | null;
}
function Confirm({ title, close, children, footer, discard = false }: { readonly title: string; readonly close: () => void; readonly children: ReactNode; readonly footer: ReactNode; readonly discard?: boolean }) {
  return <SourceDocumentDialog title={title} label={title} closeLabel="关闭弹窗" close={close} className={discard ? 'transfer-source-discard' : 'transfer-source-matrix'} {...(!discard ? { initialFocus: '[data-erp-keep-input]' } : {})} footer={footer}><div className={discard ? 'ui-confirm-body' : 'mx-dialog-body'}>{children}</div></SourceDocumentDialog>;
}
/** Frozen unified-single-select transferData/Choice, fed only the native
 * direction-specific candidate page. No local warehouse/stock/permission inference. */
function TransferWarehouseField({ session, picker, visible, label, selected, opposite, open, close }: {
  readonly session: TransferProposalSession; readonly picker: TransferProposalSnapshot['picker']; readonly visible: boolean;
  readonly label: string; readonly selected: TransferWarehouseSelection | null; readonly opposite: TransferWarehouseSelection | null;
  readonly open: () => void; readonly close: () => void;
}) {
  const host = useRef<HTMLDivElement>(null), [popupWidth, setPopupWidth] = useState(300);
  useLayoutEffect(() => {
    const element = host.current, view = element?.ownerDocument.defaultView;
    if (!element || !view || !visible) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setPopupWidth(Math.min(Math.max(bounds.width, 300), Math.max(180, view.innerWidth - bounds.left - 12))); };
    measure(); view.addEventListener('resize', measure);
    return () => view.removeEventListener('resize', measure);
  }, [visible]);
  const values = visible && picker?.phase === 'ready' ? (picker.result?.items ?? []) as readonly CurrentTransferWarehouse[] : [];
  const options = values.map(item => ({ value: item.id, label: item.name, disabled: item.id === opposite?.id }));
  if (selected && !options.some(item => item.value === selected.id)) options.unshift({ value: selected.id, label: selected.name, disabled: true });
  return <div ref={host} className="transfer-reference-field"><DemoSingleSelectAction presentation="flat" label={`选择${label}`} placeholder={`搜索${label}`} value={selected?.id ?? ''} options={options} disabled={false} required open={visible} popupWidth={popupWidth}
    loading={visible && picker?.phase === 'loading'} onSearch={text => { if (visible && session.getSnapshot().picker === picker) void session.search(text); }}
    onOpenChange={next => {
      if (next) { if (!visible) open(); return; }
      // Native Select closes before onChange. Consume this exact candidate
      // snapshot first; a late callback cannot close a replacement owner.
      const current = picker; queueMicrotask(() => { if (visible && current && !session.getSnapshot().disposed && session.getSnapshot().picker === current) close(); });
    }}
    onChange={id => { if (visible && session.getSnapshot().picker === picker) void session.select(id); }}
    dropdownRender={menu => <>{picker?.phase === 'error' ? <div className="transfer-reference-state" role="alert">仓库读取失败。<UIButton onClick={() => { void session.retry(); }}>重试仓库</UIButton></div> : menu}
      {visible && picker?.phase === 'ready' && picker.result && picker.result.exactTotal > 20n && <footer className="transfer-reference-pages"><span>第 {picker.page} 页</span><UIButton disabled={picker.page <= 1} onClick={() => { void session.page(picker.page - 1); }}>上一页</UIButton><UIButton disabled={BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => { void session.page(picker.page + 1); }}>下一页</UIButton></footer>}</>} /></div>;
}
/** Final frozen transfer matrix hierarchy, using the same real product finder,
 * retained product whole page, actual SKU quantities and native write owner. */
export function TransferProposalForm({ session, close, preparation, scope, productCapability, sizeGroupCapability, creatorName, responsibleName, saved, navigationLeave }: TransferProposalPresentation & { readonly session: TransferProposalSession; readonly close: () => void; readonly navigationLeave?: { readonly canDiscard: boolean; readonly discard: () => boolean }; readonly saved?: { readonly number: string; readonly actions: ReactNode; readonly beforeSave?: ReactNode; readonly feedback?: ReactNode; readonly records?: ReactNode }; readonly preparation?: { readonly save: () => void; readonly preparing: boolean; readonly notice: string | null; readonly cancel: () => void } }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useDocumentLeave({ dirty: state.dirty || !!state.replacement, canDiscard: navigationLeave?.canDiscard ?? !preparation?.preparing, saved: !!saved,
    discard: navigationLeave?.discard ?? (() => !preparation?.preparing && session.reset(true)) });
  const [dockPinned, setDockPinned] = useState(false), [confirm, setConfirm] = useState(false), [scanner, setScanner] = useState<DocumentScanController | null>(null), [anchor, setAnchor] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), form = useRef<HTMLElement>(null), matrix = useRef<HTMLDivElement>(null), productKeys = useRef(new Map<string, CurrentProductFinderHandle>()), opener = useRef<HTMLElement | null>(null);
  const { draft, pending, picker, replacement } = state;
  const groupIds = [...draft.lines.map(row => transferProposalLineIdentity(row).sizeGroupId), ...(replacement?.previousPending.product?.sizeGroupId ? [replacement.previousPending.product.sizeGroupId] : []), ...(pending.product?.sizeGroupId ? [pending.product.sizeGroupId] : [])];
  const actualGroupId = pending.product?.sizeGroupId ?? draft.lines.find(line => line.product?.sizeGroupId)?.product?.sizeGroupId;
  const groupCapability = useMemo<TransferSizeGroupCapability | undefined>(() => sizeGroupCapability ?? (actualGroupId && session.canReadSizeGroups ? {
    id: actualGroupId, reader: { readSizeGroups: read => session.readSizeGroups(read.parameters, read.signal) }
  } : undefined), [session, sizeGroupCapability, actualGroupId]);
  const dictionary = useTransferSizeGroups(scope, groupCapability, groupIds);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    const element = matrix.current; if (!element || replacement) { setDockPinned(false); return; }
    const measure = () => setDockPinned(element.scrollHeight > element.clientHeight + 1);
    measure(); const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element); const dock = element.querySelector('.mx-draft-dock'); if (dock) observer?.observe(dock);
    return () => observer?.disconnect();
  }, [draft.lines, pending, replacement, dictionary.groups]);
  if (state.disposed) return <TransferDocumentPage ariaLabel="调拨单编辑" className="transfer-proposal-editor" title="新增调拨单"><TransferDocumentBody beforeLines={<p role="status">草稿已关闭，当前身份资料已清除。</p>} /></TransferDocumentPage>;
  const dismiss = (restore = false) => { session.closePicker(); setAnchor(null); if (restore) requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus({ preventScroll: true })); };
  const focusProduct = (active = false) => requestAnimationFrame(() => { const id = active && session.getSnapshot().replacement ? 'replacement-product' : 'pending-product'; const input = form.current?.querySelector<HTMLInputElement>(`[data-entry-control="${id}"]`); input?.focus({ preventScroll: true }); input?.select(); });
  const focusQuantity = (skuId?: string, sizeId?: string, rowKey?: string) => requestAnimationFrame(() => { const input = Array.from(form.current?.querySelectorAll<HTMLInputElement>('[data-transfer-row-size]') ?? []).find(node => skuId ? node.dataset.transferRowSku === skuId : node.dataset.transferRowSize === sizeId && node.dataset.transferRowKey === rowKey); if (input) { input.focus({ preventScroll: true }); input.select(); } else focusProduct(); });
  const commit = (confirmed = false, nextSkuId?: string, nextSizeId?: string) => { const p = session.getSnapshot().pending, first = Object.entries(p.quantities).find(([, raw]) => /^[1-9]\d*$/.test(raw))?.[0], firstSize = Object.entries(p.sizeQuantities).find(([, raw]) => /^[1-9]\d*$/.test(raw))?.[0], rowKey = p.product?.sizeGroupId && p.color && p.fit ? transferProposalRowKey({ productId: p.product.id, colorId: p.color.id, fitId: p.fit.id, sizeGroupId: p.product.sizeGroupId }) : undefined; if (session.commitPending(confirmed)) focusQuantity(nextSkuId ?? first, nextSizeId ?? firstSize, rowKey); };
  const selectProduct = (id: string) => { void session.selectPendingProduct(id).then(ok => { if (ok) { setAnchor(null); requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[data-transfer-spec="color"] input')?.focus()); } }); };
  const discard = (approved = false) => { if (saved) { close(); return; } if (session.cancel(approved)) { setConfirm(false); close(); } else setConfirm(true); };
  const openPicker = (id: string, kind: 'FROM' | 'TO' | 'PRODUCT', search = '') => { setAnchor(id); void session.openPicker(kind, search); };
  const productInput = (id: string, value: string, change: (value: string) => void, open: () => void, label: string, disabled = false, rowKey?: string) => {
    const visible = anchor === id && picker?.kind === 'PRODUCT';
    const getAnchor = () => Array.from(form.current?.querySelectorAll<HTMLElement>('[data-entry-control]') ?? []).find(node => node.dataset.entryControl === id) ?? (opener.current?.isConnected ? opener.current : null);
    return <Trigger getTargetDOMNode={() => getAnchor() ?? form.current!} getPopupContainer={node => node.closest('.demo-ui') ?? form.current ?? node.parentElement ?? node} trigger="click" position="bl" popupVisible={visible} escToClose updateOnScroll autoFitPosition unmountOnExit onVisibleChange={next => { if (next && !visible && !disabled) open(); else if (!next && visible) dismiss(); }} popup={() => picker && visible ? <CurrentProductFinder getAnchor={getAnchor} ref={handle => { if (handle) productKeys.current.set(id, handle); else productKeys.current.delete(id); }} products={(picker.result?.items ?? []) as readonly CurrentFormProduct[]} search={picker.search} phase={picker.phase} page={picker.page} exactTotal={picker.result?.exactTotal ?? null} {...(scope ? { scope } : {})} {...(productCapability ? { capability: productCapability } : {})} select={selectProduct} close={restore => dismiss(restore ?? true)} turnPage={page => { void session.page(page); }} retry={() => { void session.retry(); }} /> : <span />}>
      <input className="tc-matrix-product-input" data-entry-control={id} aria-label={label} role="combobox" aria-expanded={visible} autoComplete="off" spellCheck={false} placeholder="商品款号 / 名称 / 条码" value={value} disabled={disabled} onClick={event => { opener.current = event.currentTarget; }} onChange={event => { const next = event.currentTarget.value; opener.current = event.currentTarget; if (rowKey) { if (session.beginReplacement(rowKey)) { session.setPendingQuery(next); openPicker('replacement-product', 'PRODUCT', next); focusProduct(true); } return; } change(next); if (visible) void session.search(next); else openPicker(id, 'PRODUCT', next); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (visible && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) { if (event.key !== 'Tab') event.preventDefault(); event.stopPropagation(); const handler = productKeys.current.get(id); if (handler) handler.key(event.key); else if (event.key === 'Escape') dismiss(true); }
        else if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); opener.current = event.currentTarget; open(); }
      }} />
    </Trigger>;
  };
  const warehouse = (kind: 'FROM' | 'TO', label: string, value: TransferWarehouseSelection | null) => <div className="tc-gold-field"><span>{label} <span className="ui-required">*</span></span><TransferWarehouseField session={session} picker={picker?.kind === kind ? picker : null} visible={anchor === kind && picker?.kind === kind} label={label} selected={value} opposite={kind === 'FROM' ? draft.to : draft.from} open={() => openPicker(kind, kind)} close={() => dismiss()} /></div>;
  const known = new Map<string, CurrentFormSku>(); for (const row of draft.lines) if (row.sku) known.set(row.sku.id, row.sku); for (const sku of state.entry?.skus ?? []) known.set(sku.id, sku);
  const rows = new Map<string, { identity: ReturnType<typeof transferProposalLineIdentity>; sku: CurrentFormSku | null; lines: TransferProposalLine[] }>(); for (const line of draft.lines) { const identity = transferProposalLineIdentity(line), key = transferProposalRowKey(identity), row = rows.get(key) ?? { identity, sku: line.sku, lines: [] }; row.lines.push(line); rows.set(key, row); }
  const axes = (id: string): TransferDisplaySize[] => {
    const dictionaryGroup = dictionary.groups.find(group => group.id === id);
    if (dictionaryGroup) return [...dictionaryGroup.sizes].sort((a, b) => a.displayOrder - b.displayOrder).map(size => ({ id: size.id, label: size.name }));
    const values = new Map<string, string>(); for (const sku of [...known.values(), ...pending.skus]) if (sku.sizeGroupId === id) values.set(sku.sizeId, sku.sizeName);
    return [...values].map(([id, label]) => ({ id, label }));
  };
  const filledGroups: string[] = [...new Set(draft.lines.map(row => transferProposalLineIdentity(row).sizeGroupId))];
  const bottomPending = replacement?.previousPending ?? pending, bottomSelected = bottomPending.skus.filter(sku => sku.productId === bottomPending.product?.id && sku.colorId === bottomPending.color?.id && sku.fitId === bottomPending.fit?.id);
  const entryGroups: string[] = bottomPending.product ? [bottomPending.product.sizeGroupId ?? ''] : filledGroups.length ? [filledGroups.at(-1)!] : [groupCapability?.id ?? ''];
  const replacementGroups = pending.product?.sizeGroupId ? [pending.product.sizeGroupId] : [];
  const matrixSections: { key: string; groupId: string; rows: (typeof rows extends Map<string, infer Row> ? [string, Row] : never)[] }[] = [];
  for (const groupId of filledGroups) for (const pair of rows) {
    if (pair[1].identity.sizeGroupId !== groupId) continue;
    const groups = replacement?.key === pair[0] && replacementGroups.length ? replacementGroups : [groupId];
    for (const actualGroup of groups) {
      let section = matrixSections.at(-1);
      if (!section || section.groupId !== actualGroup) { section = { key: `matrix-section-${matrixSections.length}`, groupId: actualGroup, rows: [] }; matrixSections.push(section); }
      section.rows.push(pair);
    }
  }
  const columnCount = Math.max(0, ...matrixSections.map(section => axes(section.groupId).length), ...entryGroups.map(groupId => axes(groupId).length));
  const quantityKey = (event: React.KeyboardEvent<HTMLInputElement>, skuId: string | undefined, sizeId: string, replacing: boolean) => { if (event.nativeEvent.isComposing || event.keyCode === 229 || replacing || !['Enter', 'Tab'].includes(event.key)) return; event.preventDefault(); const fields = Array.from(form.current?.querySelectorAll<HTMLInputElement>('[data-transfer-entry-size]:not(:disabled)') ?? []), next = fields[fields.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)]; if (/^[1-9]\d*$/.test(event.currentTarget.value)) commit(false, next?.dataset.transferEntrySku ?? skuId, next?.dataset.transferEntrySize ?? sizeId); else if (next) { next.focus(); next.select(); } else focusProduct(); };
  const renderPendingRow = (p: TransferPendingEntry, groupId: string, sizes: readonly TransferDisplaySize[], id: string, readOnly = false, openProduct?: (skuId: string | null, hallId: string, target?: { readonly id: string; readonly label: string }) => void) => {
    const selected = p.skus.filter(sku => sku.productId === p.product?.id && sku.colorId === p.color?.id && sku.fitId === p.fit?.id);
    const colors = [...new Map(p.skus.map(sku => [sku.colorId, { value: sku.colorId, label: sku.colorName }])).values()], fits = [...new Map(p.skus.filter(sku => sku.colorId === p.color?.id).map(sku => [sku.fitId, { value: sku.fitId, label: sku.fitName }])).values()];
    const specPopup = { getPopupContainer: (node: HTMLElement) => node.closest('.demo-ui') ?? form.current ?? node.parentElement ?? node, triggerProps: { className: 'transfer-spec-popup', position: 'bl' as const, autoAlignPopupWidth: false, popupStyle: { width: 250, maxWidth: 'calc(100vw - 16px)' } } };
    const viewSku = p.skus.find(sku => sku.productId === p.product?.id), values = [...Object.values(p.quantities), ...Object.values(p.sizeQuantities)].filter(raw => raw !== '');
    const original = id === 'replacement-product' ? replacement?.originals[0] : undefined, sourceChanged = id === 'replacement-product' && !!replacement?.originals.some(row => !draft.lines.includes(row));
    return <tr key={`${id}:${groupId}`} className={`mx-draft-row${readOnly ? ' mx-pending-suspended' : id === 'replacement-product' ? ' mx-replacing mx-inline-replacement' : ''}`}><td className="mx-product"><div className={`mx-entry-identity${p.product ? ' has-product' : ''}`}>{productInput(id, p.query, value => session.setPendingQuery(value), () => openPicker(id, 'PRODUCT', p.query), id === 'replacement-product' ? '改选商品款号或名称' : '调拨行内找货', readOnly)}{p.product && <span className="mx-inline-name" title={p.product.name}>{p.product.name}</span>}</div>{original && <small className="mx-original-hint" title="确认前保留原行及数量">原：{original.sourceSnapshot?.productCode ?? transferProposalLineIdentity(original).productCode} / {original.sourceSnapshot?.colorName ?? transferProposalLineIdentity(original).colorName} · {transferDisplayQuantity(replacement!.originals)}</small>}{id === 'replacement-product' && p.unmapped.length > 0 && <small className="mx-replace-warning">无法对应：{p.unmapped.map(row => `${row.sizeName} ${row.quantity}`).join('、')}；请先调整原行数量或选择其他规格</small>}{sourceChanged && <small className="mx-replace-warning">原行数量已变化，请取消后重新更换；原数量已保留</small>}</td><td className="mx-color"><span title={p.color?.name ?? '颜色'} {...(!readOnly ? { 'data-transfer-spec': 'color' } : {})}><SpecSelect {...specPopup} aria-label={`${readOnly ? '暂存' : '录入'}颜色`} size="small" placeholder="颜色" value={p.color?.id} options={colors} disabled={readOnly || p.phase !== 'ready'} onChange={(id: string) => session.selectPendingSpec('color', id)} dropdownRender={menu => <div className="transfer-spec-menu"><header>选择颜色<span>{colors.length} 项</span></header>{menu}</div>} unmountOnExit /></span></td><td className="mx-fit-col"><span title={p.fit?.name ?? '版型'} {...(!readOnly ? { 'data-transfer-spec': 'fit' } : {})}><SpecSelect {...specPopup} aria-label={`${readOnly ? '暂存' : '录入'}版型`} size="small" placeholder="版型" value={p.fit?.id} options={fits} disabled={readOnly || !p.color || p.phase !== 'ready'} onChange={(id: string) => session.selectPendingSpec('fit', id)} dropdownRender={menu => <div className="transfer-spec-menu"><header>选择版型<span>{fits.length} 项</span></header>{menu}</div>} unmountOnExit /></span></td>{sizes.map(size => {
      const candidates = selected.filter(sku => sku.sizeGroupId === groupId && sku.sizeId === size.id), sku = candidates.length === 1 ? candidates[0] : null, group = dictionary.groups.find(group => group.id === groupId);
      const writable = !size.empty && !!p.product?.sizeGroupId && p.product.sizeGroupId === groupId && !!group && !!p.color && !!p.fit;
      return <td className={size.empty ? 'mx-size-gap' : writable ? 'transfer-quantity' : 'mx-size-blank'} aria-hidden={size.empty || undefined} key={size.id}>{!size.empty && writable ? <input className="mx-qty-input" {...(sku ? { 'data-transfer-entry-sku': sku.id } : {})} data-transfer-entry-size={size.id} disabled={readOnly} aria-label={`${readOnly ? '暂存' : '录入'} ${sku?.skuCode ?? size.label} 数量`} inputMode="numeric" value={sku ? p.quantities[sku.id] ?? '' : p.sizeQuantities[size.id] ?? ''} onChange={event => { if (sku) session.setPendingQuantity(sku.id, event.currentTarget.value); else session.setPendingSizeQuantity(group!, size.id, event.currentTarget.value); }} onKeyDown={event => quantityKey(event, sku?.id, size.id, id === 'replacement-product')} /> : ''}</td>;
    })}<td className="tc-subtotal">{values.length ? transferDisplayQuantity(values.map(quantity => ({ quantity }))) : ''}</td><td className="ui-action-cell">{id === 'replacement-product' ? <div className="mx-actions"><UIButton className="iw-link" disabled={!p.product || !p.color || !p.fit || p.phase !== 'ready' || p.unmapped.length > 0 || sourceChanged} onClick={() => commit()}>确认</UIButton><UIButton className="iw-link" onClick={() => { session.clearPending(); focusProduct(); }}>取消</UIButton></div> : p.product && <div className="mx-actions"><UIButton className="iw-link" disabled={readOnly || !openProduct || !p.product} onClick={() => { if (p.product) openProduct?.(viewSku?.id ?? null, 'TRANSFER', { id: p.product.id, label: `${p.product.code} · ${p.product.name}` }); }}>查看</UIButton><UIButton className="iw-link" data-transfer-pending-clear disabled={readOnly} onClick={() => { session.clearPending(); focusProduct(); }}>删除</UIButton></div>}</td></tr>;
  };
  return <DocumentProductPresentation {...(scope ? { scope } : {})} {...(productCapability ? { capability: productCapability } : {})} returnLabel="返回调拨单" viewLabel="调拨商品查看" documentLabel="调拨">{openProduct => <TransferDocumentPage sectionRef={form} headingRef={heading} ariaLabel={saved ? '调拨单编辑' : '新增调拨草稿'} className="transfer-proposal-editor"
    title={saved ? '编辑调拨单' : '新增调拨单'} status={<TransferStatusTag status="DRAFT" />} saveState={<span className="transfer-save-state">{state.dirty ? '· 有未保存修改' : saved ? '· 已保存' : '· 未保存'}</span>}
    actions={<><button type="button" className="btn tc-back-link" onClick={() => discard()}>返回列表</button>{saved?.beforeSave}<button type="button" className="btn transfer-proposal-save" disabled={!preparation || preparation.preparing} onClick={preparation?.save}>保存</button>{saved ? saved.actions : ['审核', '导出', '打印', '操作历史'].map(label => <button type="button" className="btn tc-secondary-action" key={label} disabled title="保存并读取当前单据后可用">{label}</button>)}</>}
  >
    {saved?.feedback}
    <TransferDocumentBody
      header={<div className="tc-gold-doc-fields"><label className="tc-gold-field"><span>单据日期 <span className="ui-required">*</span></span><UIDate aria-label="单据日期" value={draft.businessDate} onChange={businessDate => session.setHeader({ businessDate })} /></label>{warehouse('FROM', '调出仓库', draft.from)}{warehouse('TO', '调入仓库', draft.to)}<div className="tc-gold-field tc-gold-doc-number"><span>单号</span><span className="transfer-read-value">{saved?.number ?? '保存后生成'}</span></div><div className="tc-gold-field"><span>创建者 <span className="ui-required">*</span></span><span className="transfer-read-value" title={saved ? '原单据记录' : '由当前认证身份记录'}>{creatorName || (saved ? '未知' : '保存后记录')}</span></div><div className="tc-gold-field"><span>负责人</span><span className="transfer-read-value" title="负责人修改尚未接通">{responsibleName ?? '未知'}</span></div><div className="tc-gold-entry-actions"><UIButton className="iw-button iw-primary" disabled={!session.canScan || preparation?.preparing} title={session.canScan ? undefined : '请先选择调出和调入仓库'} onClick={() => { dismiss(); setScanner(session.createScanner()); }}>扫码录入</UIButton></div></div>}
      note={<label className="tc-note-row"><span>备注</span><UIInput aria-label="备注" className="iw-control transfer-note-input" maxLength={10000} placeholder="输入本单备注（可选）" value={draft.note} onChange={note => session.setHeader({ note })} /></label>}
      status={(state.notice || state.errors.length > 0 || preparation?.notice || preparation?.preparing) && <div className="transfer-proposal-feedback">{state.notice && <p role="status">{state.notice}</p>}{state.errors.map(error => <p role="alert" key={error}>{error}</p>)}{preparation?.notice && <p role="status">{preparation.notice}</p>}{preparation?.preparing && <p role="status">正在准备新单…<UIButton className="iw-link" onClick={preparation.cancel}>取消准备</UIButton></p>}</div>}
      lines={<div ref={matrix} className="transfer-matrix-scroll transfer-proposal-matrix" role="region" aria-label="调拨实际明细" tabIndex={0}>
        {matrixSections.map(section => <TransferMatrixTable key={section.key} sizes={axes(section.groupId)} columnCount={columnCount} label="调拨实际明细">{sizes => section.rows.map(([key, row]) => replacement?.key === key ? renderPendingRow(pending, section.groupId, sizes, 'replacement-product', false, openProduct) : <TransferDocumentMatrixRow key={key}
          productCode={row.lines[0]?.sourceSnapshot?.productCode ?? row.identity.productCode}
          productName={row.lines[0]?.sourceSnapshot?.productName ?? row.identity.productName}
          colorTitle={row.lines[0]?.sourceSnapshot?.colorName ?? row.identity.colorName}
          color={<UIButton className="mx-spec-edit" aria-label={`修改 ${row.identity.productCode} 颜色`} disabled={!!replacement} onClick={() => { if (session.beginReplacement(key)) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[data-transfer-spec="color"] input')?.focus()); }}><span className="mx-spec-edit-value">{row.lines[0]?.sourceSnapshot?.colorName ?? row.identity.colorName}</span><span className="mx-spec-edit-mark" aria-hidden="true">改</span></UIButton>}
          fitTitle={row.lines[0]?.sourceSnapshot?.fitName ?? row.identity.fitName}
          fit={<UIButton className="mx-spec-edit" aria-label={`修改 ${row.identity.productCode} 版型`} disabled={!!replacement} onClick={() => { if (session.beginReplacement(key)) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[data-transfer-spec="fit"] input')?.focus()); }}><span className="mx-spec-edit-value">{row.lines[0]?.sourceSnapshot?.fitName ?? row.identity.fitName}</span><span className="mx-spec-edit-mark" aria-hidden="true">改</span></UIButton>}
          sizeCells={sizes.map(size => {
          const matches = [...known.values()].filter(sku => transferProposalRowKey(sku) === key && sku.sizeId === size.id), sku = matches.length === 1 ? matches[0] : null, line = row.lines.find(line => transferProposalLineIdentity(line).sizeId === size.id), group = dictionary.groups.find(group => group.id === section.groupId);
          const writable = !!row.lines[0]?.product?.sizeGroupId && row.lines[0].product.sizeGroupId === section.groupId && !!group;
          const local = state.matrixQuantities[JSON.stringify([key, size.id])];
          return <td className={size.empty ? 'mx-size-gap' : sku || writable ? 'transfer-quantity' : 'mx-size-blank'} aria-hidden={size.empty || undefined} key={size.id}>{!size.empty && (sku || writable) ? <input className="mx-qty-input" {...(sku ? { 'data-transfer-row-sku': sku.id } : {})} data-transfer-row-key={key} data-transfer-row-size={size.id} aria-label={`${sku?.skuCode ?? size.label} 数量`} inputMode="numeric" value={line?.quantity ?? local?.quantity ?? ''} onChange={event => { if (sku && line?.sku !== null) session.setMatrixQuantity(sku.id, event.currentTarget.value); else session.setMatrixSizeQuantity(key, group!, size.id, event.currentTarget.value); }} onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.keyCode === 229 || !['Enter', 'Tab'].includes(event.key)) return; event.preventDefault();
            const fields = Array.from(form.current?.querySelectorAll<HTMLInputElement>('[data-transfer-row-size]:not(:disabled)') ?? []), next = fields[fields.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
            if (next) { next.focus(); next.select(); } else focusProduct();
          }} /> : '—'}</td>;
          })}
          subtotal={transferDisplayQuantity([...row.lines, ...Object.values(state.matrixQuantities).filter(cell => cell.rowKey === key && cell.quantity !== '').map(cell => ({ quantity: cell.quantity }))])}
          actions={<div className="mx-actions"><UIButton className="iw-link" disabled={!openProduct} onClick={() => openProduct?.(row.sku?.id ?? null, 'TRANSFER', { id: row.identity.productId, label: `${row.identity.productCode} · ${row.identity.productName}` })}>查看</UIButton><UIButton className="iw-link" onClick={() => session.removeGroup(key)}>删除</UIButton></div>}
          className={replacement?.key === key ? 'mx-edit-source-row' : ''}
        />)}</TransferMatrixTable>)}
        {!replacement && <div className={`mx-draft-dock${dockPinned ? ' mx-draft-pinned' : ''}`}>{entryGroups.map(groupId => <TransferMatrixTable key={groupId} sizes={axes(groupId)} columnCount={columnCount} showHeader={!filledGroups.length || groupId !== filledGroups.at(-1)} className="mx-draft-section" label="连续录入调拨行">{sizes => renderPendingRow(bottomPending, groupId, sizes, 'pending-product', false, openProduct)}</TransferMatrixTable>)}</div>}
      </div>}
      afterLines={(pending.phase === 'loading' || pending.phase === 'error' || pending.exactTotal !== null && pending.exactTotal > 20n || pending.unmapped.length > 0 || dictionary.phase === 'error' || !groupCapability) && <div className="transfer-entry-status" role="status">{pending.phase === 'loading' && <span>正在读取实际规格…</span>}{pending.phase === 'error' && <span>规格读取失败，输入保留。<UIButton className="iw-link" onClick={() => { void session.readPendingSkus(); }}>重试规格</UIButton></span>}{pending.exactTotal !== null && pending.exactTotal > 20n && <span>实际规格第 {pending.page} 页 · 共 {pending.exactTotal.toString()} 项<UIButton className="iw-link" disabled={pending.phase === 'loading' || pending.page <= 1} onClick={() => { void session.readPendingSkus(pending.page - 1); }}>上一页规格</UIButton><UIButton className="iw-link" disabled={pending.phase === 'loading' || BigInt(pending.page) * 20n >= pending.exactTotal} onClick={() => { void session.readPendingSkus(pending.page + 1); }}>下一页规格</UIButton></span>}{!replacement && pending.unmapped.length > 0 && <span>原数量尚未对应：{pending.unmapped.map(row => `${row.sizeName} × ${row.quantity}`).join('；')}</span>}{dictionary.phase === 'error' && <span>部分尺码表头未读取。<UIButton className="iw-link" onClick={dictionary.retry}>重试尺码表头</UIButton></span>}{!groupCapability && <span>商品所属尺码组资料尚未读取；选择商品后按其实际组显示。</span>}</div>}
      summary={<TransferDocumentSummary presentation="proposal" lines={[...draft.lines.map(line => ({ productId: transferProposalLineIdentity(line).productId, quantity: line.quantity, ...(line.product?.category ? { category: line.product.category } : {}) })), ...Object.values(state.matrixQuantities).filter(cell => cell.quantity !== '').map(cell => ({ productId: cell.product.id, quantity: cell.quantity, ...(cell.product.category ? { category: cell.product.category } : {}) }))]} />}
      records={saved?.records}
    />
    {scanner && <DocumentScan controller={scanner} title="调拨扫码录入" rows={draft.lines.flatMap(row => row.sku ? [{ key: row.sku.id, sku: row.sku, quantity: row.quantity }] : [])} close={() => setScanner(null)} update={(key, value) => session.setQuantity(key, value)} remove={key => session.removeLine(key)} />}
    {confirm && <Confirm discard title="有未保存的修改" close={() => setConfirm(false)} footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setConfirm(false)}>继续编辑</button><button type="button" className="btn primary" onClick={() => discard(true)}>放弃修改并离开</button></>}><p>离开后，本次未保存的修改将丢失。</p></Confirm>}
    {state.appendRequest && <Confirm title={state.appendRequest.kind === 'replace' ? '目标规格已在明细中' : '该规格已在明细中'} close={() => session.cancelAppend()} footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => session.cancelAppend()}>取消</button><button type="button" className="btn primary" onClick={() => commit(true)}>{state.appendRequest.kind === 'replace' ? '确认合并' : '确认追加'}</button></>}><p>{state.appendRequest.kind === 'replace' ? '确认后将对应尺码的数量追加到已有行；取消则保留原行。' : `确认后按实际规格追加，共 ${state.appendRequest.quantity} 件。`}</p></Confirm>}
  </TransferDocumentPage>}</DocumentProductPresentation>;
}
