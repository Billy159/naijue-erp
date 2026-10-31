// Extracted categoryEditor/mountCategoryTree UI, with native IDs/counts and the
// existing authoritative order commands replacing Demo mutation of arrays.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Input, Tree } from '@arco-design/web-react';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import type { CatalogueSettingsCategory, CatalogueSettingsTreeQuery } from '../../../../src/product-settings/colors/contracts.ts';
import type { CatalogueEditorDraft } from '../../../../src/product-settings/catalogue-maintenance-state.ts';
import type { CategoryOrderResult } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import { categoryPath, categoryReorderDraft, categoryTreeIndex, visibleCategoryRows } from '../../../../src/product-categories/tree-model.ts';
import type { CataloguePageOptions } from './entry.tsx';
import { Head, MaintenanceNotice, ReadNotice, Recovery, SourceModal, maintenanceUnavailable, useCommand, useRead } from './source-controls.tsx';

type Draft = { name: string; parentId: string | null; displayOrder: number; original: CatalogueSettingsCategory | null };
type CategoryNotice = { kind: 'status'; message: string } | { kind: 'error'; message: string };
interface NativeTreeNode { key: string; title: string; children: NativeTreeNode[] }
function SourceTree({ css, children }: { css: string; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null), [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { const shadow = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' }); const style = document.createElement('style'); style.textContent = css; const root = document.createElement('div'); root.id = 'root'; shadow.replaceChildren(style, root); setTarget(root); }, [css]);
  return <div id="pc-arco-tree" className="pc-category-tree-host" ref={host}>{target && createPortal(children, target)}</div>;
}
function SourceEmpty({ options, empty }: { options: CataloguePageOptions; empty: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const release = options.mountEmpty(host.current!); return () => { queueMicrotask(release); }; }, [options]);
  return <div id="pc-category-empty" ref={host} className="iw-empty-host" data-state={empty ? 'empty' : 'idle'} data-title={empty ? '暂无分类' : '选择分类'} data-description={empty ? '当前可读取范围内没有分类。' : '从左侧选择分类查看资料，或新增一级分类。'} />;
}
function Categories({ options }: { options: CataloguePageOptions }) {
  const execute = useMemo(() => (read: QueryRead<CatalogueSettingsTreeQuery>) => options.catalogue.readCategories(read), [options]);
  const { query, snapshot } = useRead(options, execute, {});
  const capability = options.maintenance?.CATEGORY;
  const { controller, state } = useCommand(options, capability);
  const [selected, setSelected] = useState<string | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState(''), [expanded, setExpanded] = useState<string[]>([]);
  const [notice, setNotice] = useState<CategoryNotice | null>(null), [deleting, setDeleting] = useState(false), [deferred, setDeferred] = useState<(() => void) | null>(null);
  const [lastOrder, setLastOrder] = useState<CategoryOrderResult | null>(null);
  const finishing = useRef(false), notified = useRef(new Set<string>()), submittedRead = useRef<unknown>(null);
  const data = snapshot.success?.data;
  const index = useMemo(() => categoryTreeIndex(data?.items ?? []), [data]);
  const fresh = snapshot.phase === 'success';
  const empty = fresh && data?.items.length === 0;
  const busy = !!state && !['idle', 'rejected'].includes(state.phase);
  const dirty = !!draft && (draft.original === null || draft.name !== draft.original.name);
  const canWrite = (action: 'CREATE' | 'EDIT' | 'DELETE' | 'REORDER' | 'UNDO_REORDER') => options.scope.active && fresh && !busy && capability?.allowedActions.includes(action) === true;
  const setRecord = useCallback((item: CatalogueSettingsCategory | undefined) => { setSelected(item?.id ?? null); setDraft(item ? { name: item.name, parentId: item.parentId, displayOrder: item.displayOrder, original: item } : null); }, []);
  useEffect(() => {
    if (!fresh || !data || draft) return;
    const command = state?.command;
    if (command && ['submitting', 'checking', 'uncertain', 'committed'].includes(state.phase)) {
      if ((command.action === 'CREATE' || command.action === 'EDIT') && 'parentId' in command.values) {
        const original = command.action === 'EDIT' ? data.items.find(item => item.id === command.id) : undefined;
        if (command.action === 'CREATE' || original) {
          setSelected(original?.id ?? null); setDraft({ ...command.values, original: original ? { ...original, version: command.action === 'EDIT' ? command.expectedVersion : original.version } : null }); return;
        }
      }
      if (command.action === 'DELETE') { setRecord(data.items.find(item => item.id === command.id)); setDeleting(true); return; }
    }
    setRecord(data.items.find(item => item.id === selected) ?? index.children.get(null)?.[0]);
  }, [data, fresh, draft, selected, setRecord, index, state]);
  useEffect(() => { options.onCanLeaveChange(() => !dirty && !busy); return () => options.onCanLeaveChange(null); }, [options, dirty, busy]);
  const request = (action: () => void) => { if (busy) return; if (dirty) setDeferred(() => action); else action(); };
  const sameOrder = (saved: CategoryOrderResult) => !!data && saved.order.members.every(member => {
    const current = index.byId.get(member.id); return current?.parentId === saved.order.parentId && current.version === member.version && current.displayOrder === member.displayOrder;
  }) && (index.children.get(saved.order.parentId) ?? []).length === saved.order.members.length;
  async function finish() {
    const current = controller?.getSnapshot();
    if (!controller || current?.phase !== 'committed' || !current.result || !current.command || finishing.current) return;
    finishing.current = true;
    const { result, command } = current;
    if (!notified.current.has(result.operationId)) { notified.current.add(result.operationId); options.onChanged('CATEGORY'); }
    setNotice({ kind: 'status', message: '已提交，正在读取最新目录。' });
    const outcome = await query.run({});
    if (outcome.status === 'success' && options.scope.active) {
      if ('order' in result) {
        const members = outcome.data.items.filter(item => item.parentId === result.order.parentId);
        const matches = members.length === result.order.members.length && result.order.members.every(member => members.some(item => item.id === member.id && item.version === member.version && item.displayOrder === member.displayOrder));
        setLastOrder(command.action === 'REORDER' && matches ? result : null);
        controller.resetAfterOrderReload();
        const item = outcome.data.items.find(item => item.id === selected); if (!dirty) setRecord(item);
        setNotice({ kind: 'status', message: matches ? command.action === 'REORDER' ? '同级顺序已调整，可撤销最近一次排序。' : '已撤销最近一次排序。' : '排序已提交，目录随后发生变化；请按当前目录继续操作。' });
      } else {
        const item = outcome.data.items.find(item => item.id === result.targetId);
        if (command.action === 'DELETE' ? !item : item && item.version >= result.version) {
          // DELETE has no surviving target version. Recreate the controller only
          // after this modal/page read confirms absence (the command stays bound).
          controller.resetAfterReload(result.targetId, item?.version ?? result.version);
          setDeleting(false); setRecord(item); setNotice({ kind: 'status', message: command.action === 'DELETE' ? '已删除' : '分类已保存' });
        } else setNotice({ kind: 'error', message: '保存已提交，最新目录版本尚未确认，请重新读取目录。' });
      }
    } else setNotice({ kind: 'error', message: '操作已提交，最新目录读取失败，请重新读取目录。' });
    finishing.current = false;
  }
  useEffect(() => { if (state?.phase === 'committed') void finish(); }, [state]);
  async function submit(command: CatalogueEditorDraft) {
    if (!controller) return;
    submittedRead.current = snapshot.success;
    setNotice(null); try { await controller.submit(command); } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : '请求未发送' }); }
  }
  const create = (parentId: string | null) => request(() => {
    if (!canWrite('CREATE')) return;
    const siblings = index.children.get(parentId) ?? [];
    setDraft({ name: '', parentId, displayOrder: siblings.reduce((max, item) => Math.max(max, item.displayOrder + 1), 0), original: null });
  });
  const save = () => {
    if (!draft || !draft.name.trim() || !canWrite(draft.original ? 'EDIT' : 'CREATE')) { setNotice({ kind: 'error', message: '分类名称必填' }); return; }
    const values = { name: draft.name.trim(), parentId: draft.parentId, displayOrder: draft.displayOrder };
    void submit(draft.original ? { action: 'EDIT', id: draft.original.id, expectedVersion: draft.original.version, values } : { action: 'CREATE', values });
  };
  const conflictNeedsRead = state?.phase === 'rejected' && ['CATEGORY_ORDER_CONFLICT', 'CATEGORY_UNDO_CONFLICT', 'VERSION_CONFLICT'].includes(state.error?.code ?? '') && snapshot.success === submittedRead.current;
  const readyOrder = capability?.kind === 'CATEGORY' && capability.categoryOrderReady === true && canWrite('REORDER') && capability.allowedActions.includes('UNDO_REORDER') && state?.error?.code !== 'CATALOGUE_ORDER_NOT_READY' && !conflictNeedsRead;
  const treeData = useMemo(() => {
    const rows = new Map<string, NativeTreeNode>((data?.items ?? []).map(item => [item.id, { key: item.id, title: item.name, children: [] }]));
    const roots: NativeTreeNode[] = [];
    for (const [parent, children] of index.children) for (const item of children) {
      const row = rows.get(item.id)!;
      if (parent === null) roots.push(row); else rows.get(parent)?.children.push(row);
    }
    return roots;
  }, [data, index]);
  const matching = useMemo(() => {
    if (!search.trim()) return null;
    return new Set(visibleCategoryRows(index, new Set(), search).map(row => row.item.id));
  }, [data, index, search]);
  // Native hierarchy is iterative; the original shared Demo tree is only two
  // levels. Keep its Arco control/classes while retaining every native level.
  const visibleTree = useMemo(() => {
    if (!matching) return treeData;
    const copies = new Map<string, NativeTreeNode>();
    for (const item of data?.items ?? []) if (matching.has(item.id)) copies.set(item.id, { key: item.id, title: item.name, children: [] });
    const roots: NativeTreeNode[] = [];
    for (const [parent, children] of index.children) for (const item of children) { const row = copies.get(item.id); if (row) parent === null ? roots.push(row) : copies.get(parent)?.children.push(row); }
    return roots;
  }, [data, treeData, matching, index]);
  const selectedItem = selected ? index.byId.get(selected) : undefined;
  return <div className="pc-workbench pc-categories"><Head title="商品分类">
    {lastOrder && <button className="btn ghost" disabled={!readyOrder || !sameOrder(lastOrder)} onClick={() => request(() => void submit({ action: 'UNDO_REORDER', originalOperationId: lastOrder.operationId, expectedSiblings: (index.children.get(lastOrder.order.parentId) ?? []).map(item => ({ id: item.id, expectedVersion: item.version })) }))}>撤销排序</button>}
    <button className="btn ghost" title={!capability ? maintenanceUnavailable : undefined} disabled={!canWrite('CREATE')} onClick={() => create(null)}>新增一级分类</button><button className="btn ghost" title={!capability ? maintenanceUnavailable : undefined} disabled={!canWrite('CREATE') || !selectedItem || selectedItem.parentId !== null} onClick={() => create(selectedItem!.id)}>新增下级分类</button>
  </Head><div className="pc-category-layout"><aside className="pc-filter-tree"><SourceTree css={options.categoryControlCss}>
    <Input.Search className="product-tree-search" placeholder="搜索分类" value={search} onChange={setSearch} allowClear />
    {/* Controlled search can replace branches during Arco's expand transition.
        Render the live accessible nodes directly, rather than leaving a stale
        aria-hidden animation copy. Layout and selection/dirty guards stay native. */}
    <Tree animation={false} blockNode draggable={readyOrder === true && !dirty} selectedKeys={selected ? [selected] : []} expandedKeys={matching ? [...matching] : expanded} treeData={visibleTree} onSelect={keys => { if (keys[0]) request(() => { setRecord(index.byId.get(String(keys[0]))); setSearch(''); }); }} onExpand={keys => setExpanded(keys.map(String))}
      allowDrop={({ dragNode, dropNode, dropPosition }) => !!readyOrder && !dirty && dropPosition !== 0 && index.byId.get(String(dragNode?.key))?.parentId === index.byId.get(String(dropNode?.key))?.parentId}
      onDrop={({ dragNode, dropNode, dropPosition }) => { if (!readyOrder || dirty || !dragNode || !dropNode || dropPosition === 0) return; const next = categoryReorderDraft(index, String(dragNode.key), String(dropNode.key), dropPosition < 0 ? 'before' : 'after'); if (next) void submit(next); }} />
  </SourceTree></aside><section className="pc-editor-body pc-category-detail">{draft ? <form id="pc-category-form" onSubmit={event => { event.preventDefault(); save(); }}><div className="pc-category-detail-head"><h2>{draft.original ? '分类资料' : '新增分类'}</h2><div><button type="button" className="btn ghost" disabled={busy} onClick={() => setRecord(selectedItem)}>取消</button><button className="btn primary" disabled={!canWrite(draft.original ? 'EDIT' : 'CREATE')}>保存</button></div></div>
    <div className="pc-category-facts"><div className="field"><span>分类路径</span><p className="pc-text-block">{draft.parentId === null ? '一级分类' : categoryPath(index, draft.original?.id ?? draft.parentId).map(item => item.name).join(' / ')}</p></div><div className="field"><span className="pc-field-caption">分类名称</span><input data-cat="name" value={draft.name} required maxLength={40} title={!capability ? maintenanceUnavailable : undefined} disabled={!canWrite(draft.original ? 'EDIT' : 'CREATE')} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div><div className="field"><span>商品数量</span><p className="pc-text-block">{draft.original?.productCount === null ? '未知' : `${draft.original?.productCount ?? 0} 款`}</p></div><div className="field"><span>下级分类数量</span><p className="pc-text-block">{draft.original?.childCount ?? 0} 个</p></div></div>
    {draft.original && <div className="pc-delete-zone"><button type="button" className="btn ghost pc-danger" title={!capability ? maintenanceUnavailable : undefined} disabled={!canWrite('DELETE')} onClick={() => { if (canWrite('DELETE')) setDeleting(true); }}>删除分类</button></div>}
  </form> : <><h2>分类资料</h2><SourceEmpty key={empty ? 'empty' : 'selection'} options={options} empty={empty} /></>}
    <div id="pc-category-error" className={notice?.kind === 'error' ? 'inline-error' : 'hint'} role={notice?.kind === 'error' ? 'alert' : 'status'}>{notice?.message}</div><MaintenanceNotice capability={capability} />{controller && <Recovery controller={controller} />}
    {state?.phase === 'rejected' && <button className="btn ghost" onClick={() => request(() => { setDraft(null); void query.run({}); })}>读取最新目录</button>}
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => state?.phase === 'committed' ? void finish() : void query.run({})} cancel={() => query.cancel()} />
    {state?.phase === 'committed' && <button className="btn ghost" onClick={() => void finish()}>重新读取目录</button>}
  </section></div>
    {deleting && <SourceModal title="确认删除分类" close={() => { if (!busy) setDeleting(false); }} footer={<><button className="btn" disabled={busy} onClick={() => setDeleting(false)}>取消</button><button className="btn pc-danger-solid" disabled={busy} onClick={() => { if (draft?.original && canWrite('DELETE')) void submit({ action: 'DELETE', id: draft.original.id, expectedVersion: draft.original.version }); }}>确认删除</button></>}><p>删除该分类后无法恢复，确定继续吗？</p>{controller && <Recovery controller={controller} />}</SourceModal>}
    {deferred && <SourceModal title="有未保存的修改" close={() => setDeferred(null)} footer={<><button className="btn" onClick={() => setDeferred(null)}>继续编辑</button><button className="btn primary" disabled={busy} onClick={() => { const action = deferred; setDeferred(null); action(); }}>放弃修改并离开</button></>}><p>离开后，本次未保存的修改将丢失。</p></SourceModal>}
  </div>;
}
export function mount(host: HTMLElement, options: CataloguePageOptions) { const root = createRoot(host); root.render(<Categories options={options} />); return () => root.unmount(); }
