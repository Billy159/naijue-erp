import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import type { CatalogueSettingsEntry, CatalogueSettingsPage } from '../../../../src/product-settings/colors/contracts.ts';
import type { DictionaryPage, DictionarySeason, DictionarySizeGroup, ProductSettingTab } from '../../../../src/product-settings/size-groups/contracts.ts';
import type { CatalogueMaintenanceCommand, CatalogueMaintenanceResult } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import type { CataloguePageOptions } from './entry.tsx';
import { EntryEditor, Head, MaintenanceNotice, Pager, ReadNotice, SourceModal, maintenanceUnavailable, tabs, useRead } from './source-controls.tsx';

type Query = { search: string; page: number; pageSize: 20 | 50 | 100 };
type Page = CatalogueSettingsPage<CatalogueSettingsEntry> | DictionaryPage<DictionarySeason> | DictionaryPage<DictionarySizeGroup>;
const initial: Query = { search: '', page: 1, pageSize: 20 };
function Settings({ options }: { options: CataloguePageOptions }) {
  const [tab, setTab] = useState<ProductSettingTab>(() => {
    for (const [kind, target] of [['COLOR', 'colors'], ['FIT', 'fits']] as const) if (['submitting', 'checking', 'uncertain', 'committed'].includes(options.commandOwners?.[kind]?.getSnapshot().phase ?? '')) return target;
    return options.initialSettingTab ?? 'colors';
  }), [deferred, setDeferred] = useState<ProductSettingTab | null>(null);
  const guard = useRef<(() => boolean) | null>(null);
  const [locked, setLocked] = useState(false);
  const receiveGuard = useCallback((value: (() => boolean) | null, pending = false) => { guard.current = value; setLocked(pending); }, []);
  useEffect(() => { options.onCanLeaveChange(() => guard.current?.() ?? true); return () => options.onCanLeaveChange(null); }, [options]);
  const choose = (next: ProductSettingTab) => { if (next === tab) return; if (guard.current && !guard.current()) setDeferred(next); else setTab(next); };
  return <div className="pc-workbench pc-settings-page"><Head title="商品设置" /><section className="pc-settings">
    <div className="tabs" role="tablist">{tabs.map(([key, title]) => <button key={key} role="tab" aria-selected={key === tab} className={key === tab ? 'active' : ''} onClick={() => choose(key)}>{title}</button>)}</div>
    <Dictionary key={tab} options={options} tab={tab} guard={receiveGuard} />
    {deferred && <SourceModal title="有未保存的修改" close={() => setDeferred(null)} footer={<><button className="btn" onClick={() => setDeferred(null)}>继续编辑</button><button className="btn primary" disabled={locked} onClick={() => { setTab(deferred); setDeferred(null); }}>放弃修改并离开</button></>}><p>离开后，本次未保存的修改将丢失。</p></SourceModal>}
  </section></div>;
}
function Dictionary({ options, tab, guard }: { options: CataloguePageOptions; tab: ProductSettingTab; guard: (value: (() => boolean) | null, locked?: boolean) => void }) {
  const execute = useMemo(() => (read: QueryRead<Query>): Promise<Page> => tab === 'colors' ? options.catalogue.readColors(read) : tab === 'fits' ? options.catalogue.readFits(read) : tab === 'groups' ? options.dictionaries.readSizeGroups(read) : options.dictionaries.readSeasons(read), [tab, options]);
  const { query, snapshot } = useRead(options, execute, initial);
  const [search, setSearch] = useState(''), [editing, setEditing] = useState<{ entry: CatalogueSettingsEntry | null; resumeCommand?: CatalogueMaintenanceCommand } | null>(null);
  const [notice, setNotice] = useState('');
  const changedOperations = useRef(new Set<string>());
  const parameters = snapshot.request?.parameters ?? initial, data = snapshot.success?.data;
  const fresh = snapshot.phase === 'success';
  const kind = tab === 'colors' ? 'COLOR' : tab === 'fits' ? 'FIT' : null;
  const capability = kind ? options.maintenance?.[kind] : undefined;
  const owner = kind ? options.commandOwners?.[kind] : undefined;
  const commandState = useSyncExternalStore(owner?.subscribe ?? (() => () => {}), owner?.getSnapshot ?? (() => null), owner?.getSnapshot ?? (() => null));
  useEffect(() => {
    const command = commandState?.command;
    if (editing || !command || !['submitting', 'checking', 'uncertain', 'committed'].includes(commandState.phase)) return;
    if (command.action === 'CREATE') { setEditing({ entry: null, resumeCommand: command }); return; }
    if (command.action === 'EDIT' && 'code' in command.values) setEditing({ entry: { id: command.id, version: command.expectedVersion, ...command.values }, resumeCommand: command });
    else if (command.action === 'DELETE') {
      const target = data?.items.find(item => item.id === command.id);
      setEditing({ entry: target && 'code' in target && typeof target.code === 'string' && 'version' in target && typeof target.version === 'number' && 'enabled' in target && typeof target.enabled === 'boolean'
        ? { id: target.id, name: target.name, code: target.code, version: target.version, enabled: target.enabled } : null, resumeCommand: command });
    }
  }, [commandState, editing, data]);
  const label = tabs.find(([key]) => key === tab)![1];
  const read = (next: Query) => { void query.run(next); };
  async function saved(result: CatalogueMaintenanceResult, action: string, code: string) {
    if (!kind || !options.scope.active) return false;
    if (!changedOperations.current.has(result.operationId)) { changedOperations.current.add(result.operationId); options.onChanged(kind); }
    // A changed name/code may leave the current searched page. Confirm its version
    // through the same authorized reader before closing the original modal.
    if (action !== 'DELETE') {
      const verify = { search: code, page: 1, pageSize: 20 as const };
      try {
        const target = await execute({ parameters: verify, signal: options.scope.signal, identity: options.scope.identity, routeInstanceId: options.scope.routeInstanceId, entityId: null });
        if (!target.items.some(item => item.id === result.targetId && 'version' in item && typeof item.version === 'number' && item.version >= result.version)) { setNotice('保存已提交，最新资料版本尚未读回。'); return false; }
      } catch (error) { const kind = (error as { kind?: string }).kind; if (kind === 'unauthenticated' || kind === 'forbidden') { options.scope.dispose(); options.onAccessFailure(kind); return false; } setNotice('保存已提交，最新资料读取失败，请重试读取。'); return false; }
    }
    let outcome = await query.run({ ...parameters });
    if (outcome.status === 'success' && outcome.data.page > Math.max(1, Math.ceil(outcome.data.total / outcome.data.pageSize))) outcome = await query.run({ ...parameters, page: Math.max(1, Math.ceil(outcome.data.total / outcome.data.pageSize)) });
    if (outcome.status !== 'success') { setNotice('保存已提交，当前列表尚未读回。'); return false; }
    setNotice(action === 'DELETE' ? '已删除' : '已保存'); return true;
  }
  return <div className="pc-editor-body pc-settings-body">
    <div className="pc-section-line"><input id="pc-dict-search" type="search" placeholder={`搜索${label}名称${kind ? '或编码' : ''}`} value={search} onChange={event => { const value = event.target.value; setSearch(value); read({ search: value, page: 1, pageSize: parameters.pageSize }); }} />{kind && <MaintenanceNotice capability={capability} inline />} {kind && <button className="btn primary" title={!capability ? maintenanceUnavailable : !capability.allowedActions.includes('CREATE') ? '当前账号未获新增权限' : undefined} disabled={!fresh || !capability?.allowedActions.includes('CREATE')} onClick={() => { if (fresh && capability?.allowedActions.includes('CREATE')) setEditing({ entry: null }); }}>新增{label}</button>}</div>
    <table data-has-operations={kind ? '' : undefined}><thead><tr>{(tab === 'groups' ? ['尺码组', '包含尺码'] : tab === 'seasons' ? ['季节'] : ['名称', '编码', '操作']).map(text => <th key={text} className={kind && text === '操作' ? 'ui-action-cell' : undefined}>{text}</th>)}</tr></thead><tbody>{data?.items.map(item => <tr key={item.id}><td>{item.name}</td>{'sizes' in item ? <td>{item.sizes.map(size => size.name).join('、')}</td> : 'code' in item ? <><td>{item.code}</td><td className="ui-action-cell"><button className="btn ghost" title={!capability ? maintenanceUnavailable : undefined} disabled={!fresh || !capability?.allowedActions.some(action => action === 'EDIT' || action === 'DELETE')} onClick={() => { if (fresh && capability?.allowedActions.some(action => action === 'EDIT' || action === 'DELETE')) setEditing({ entry: item }); }}>编辑</button></td></> : null}</tr>)}</tbody></table>
    {fresh && data?.total === 0 && <div className="empty">没有匹配的数据</div>}
    {data && <Pager options={options} disabled={!fresh} page={data.page} pageSize={data.pageSize} total={data.total} change={(page, pageSize) => read({ search: parameters.search, page, pageSize })} />}
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => read({ ...parameters })} cancel={() => query.cancel()} /><div role="status" className="hint spaced">{notice}</div>
    {editing && capability && <EntryEditor options={options} capability={capability} entry={editing.entry} {...(editing.resumeCommand ? { resumeCommand: editing.resumeCommand } : {})} guard={guard} close={() => setEditing(null)} saved={saved} />}
  </div>;
}
export function mount(host: HTMLElement, options: CataloguePageOptions) { const root = createRoot(host); root.render(<Settings options={options} />); return () => root.unmount(); }
