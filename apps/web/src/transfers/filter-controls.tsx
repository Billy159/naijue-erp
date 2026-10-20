import { DatePicker, TreeSelect } from '@arco-design/web-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferFilterDraft, TransferWarehouse, TransferWarehousePage, TransferWarehouseParameters, TransferWarehouseReader } from './contracts.ts';
import { guardedTransferRead, transferStatusLabels } from './model.ts';
import { useTransferOwnedScope } from './owned-scope.ts';
import { transferCount } from './format.ts';
import { transferWarehousesResponse } from './response-validation.ts';

const ALL = '__transfer_all__';
export function TransferDate(props: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className="transfer-date-control" ref={host}><DatePicker value={props.value} format="YYYY-MM-DD" placeholder={props.label} aria-label={props.label} allowClear getPopupContainer={() => host.current ?? document.body} onChange={value => props.onChange(value || '')} /></div>;
}
export function TransferStatusSelect(props: { readonly value: TransferFilterDraft['statuses']; readonly onChange: (value: TransferFilterDraft['statuses']) => void }) {
  return <MultiSelect label="状态" allLabel="全部状态" options={Object.entries(transferStatusLabels).map(([id, name]) => ({ id, name }))} value={props.value}
    onChange={ids => props.onChange(ids as TransferFilterDraft['statuses'])} />;
}
interface MultiOption { readonly id: string; readonly name: string }
function MultiSelect(props: { readonly label: string; readonly allLabel: string; readonly options: readonly MultiOption[]; readonly value: readonly string[];
  readonly onChange: (ids: readonly string[]) => void; readonly open?: boolean; readonly onOpen?: (open: boolean) => void;
  readonly search?: string; readonly onSearch?: (search: string) => void; readonly renderMenu?: (menu: ReactNode) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null); const names = new Map([[ALL, props.allLabel], ...props.options.map(item => [item.id, item.name] as const)]);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width); update();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  // Frozen inventory-filters.jsx fit calculation, not a fixed one-tag redesign.
  const visibleTagLimit = useMemo(() => {
    if (props.value.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d'); if (!context) return 1;
    context.font = '13px Arial';
    const widths = props.value.slice(0, 3).map(id => Math.min(context.measureText(names.get(id) ?? id).width + 37, width - 50));
    for (let count = Math.min(3, props.value.length); count > 1; count--) {
      const reserve = props.value.length > count ? 92 : 42;
      if (widths.slice(0, count).reduce((sum, value) => sum + value, 0) + (count - 1) * 4 + reserve <= width) return count;
    }
    return 1;
  }, [props.value, width, names]);
  return <div ref={host} className="transfer-multi-control"><TreeSelect {...(props.value.length === 0 ? { className: 'inv-all-selected' } : {})}
    aria-label={`${props.label}，多选`} treeData={[{ key: ALL, value: ALL, title: props.allLabel }, ...props.options.map(item => ({ key: item.id, value: item.id, title: item.name }))]}
    value={props.value.length ? [...props.value] : [ALL]} multiple treeCheckable treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL}
    showSearch={{ retainInputValueWhileSelect: false }} placeholder={`搜索${props.label === '状态' ? '状态' : '仓库'}`} allowClear={false} unmountOnExit
    {...(props.open === undefined ? {} : { popupVisible: props.open })}
    {...(props.onOpen ? { onVisibleChange: props.onOpen } : {})}
    {...(props.search === undefined ? {} : { inputValue: props.search })}
    {...(props.onSearch ? { onInputValueChange: props.onSearch, filterTreeNode: () => true } : { filterTreeNode: (text: string, node: { props: { title: string; value: string } }) => node.props.value === ALL || node.props.title.includes(text) })}
    maxTagCount={{ count: props.value.length === 0 ? 1 : visibleTagLimit, render: count => <span className="inv-filter-count" title={props.value.slice(visibleTagLimit).map(id => names.get(id)).join('、')}>+{count} 更多</span>, showPopover: false }}
    renderFormat={(_option, value) => names.get(typeof value === 'string' ? value : value.value) ?? ''}
    getPopupContainer={() => host.current ?? document.body}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(width, 300), window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12) } }}
    {...(props.renderMenu ? { dropdownRender: props.renderMenu } : {})}
    onChange={(values: unknown, extra) => {
      const key = extra.trigger?._key;
      if (key === ALL) { props.onChange([]); return; }
      if (typeof key === 'string' && names.has(key)) {
        const selected = new Set(props.value); if (extra.checked) selected.add(key); else selected.delete(key);
        props.onChange([...selected]); return;
      }
      const ids = (Array.isArray(values) ? values : [values]).map((item: unknown) => typeof item === 'string' ? item : item && typeof item === 'object' && 'value' in item ? item.value : null)
        .filter((id): id is string => typeof id === 'string' && id !== ALL && names.has(id));
      props.onChange(ids);
    }} /></div>;
}

export function TransferWarehouseSelect(props: { readonly scope: ReadScope; readonly reader: TransferWarehouseReader; readonly label: string;
  readonly value: readonly TransferWarehouse[]; readonly onChange: (value: readonly TransferWarehouse[]) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(''); const [candidates, setCandidates] = useState<readonly TransferWarehouse[]>([]);
  const options = new Map([...props.value, ...candidates].map(item => [item.id, item]));
  return <MultiSelect label={props.label} allLabel="全部仓库" options={[...options.values()].map(item => ({ id: item.id, name: item.name }))}
    value={props.value.map(item => item.id)} onChange={ids => props.onChange(ids.flatMap(id => { const item = options.get(id as TransferWarehouse['id']); return item ? [item] : []; }))}
    open={open} onOpen={next => { setOpen(next); if (!next) { setCandidates([]); setSearch(''); } }} search={search} onSearch={setSearch}
    renderMenu={menu => open ? <WarehouseOptions parent={props.scope} reader={props.reader} search={search} setCandidates={setCandidates} menu={menu} /> : null} />;
}
function WarehouseOptions(props: { readonly parent: ReadScope; readonly reader: TransferWarehouseReader; readonly search: string;
  readonly setCandidates: (items: readonly TransferWarehouse[]) => void; readonly menu: ReactNode }) {
  const scope = useTransferOwnedScope(props.parent, 'warehouse-candidates', null);
  return scope ? <WarehouseRead {...props} scope={scope} /> : null;
}
function WarehouseRead(props: { readonly parent: ReadScope; readonly scope: ReadScope; readonly reader: TransferWarehouseReader; readonly search: string;
  readonly setCandidates: (items: readonly TransferWarehouse[]) => void; readonly menu: ReactNode }) {
  const [query] = useState(() => new LatestQuery<TransferWarehouseParameters, TransferWarehousePage>({ scope: props.scope,
    execute: read => guardedTransferRead(props.parent, async () => transferWarehousesResponse(await props.reader.readWarehouses(read), read.parameters)) }));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot); const search = props.search.trim();
  useEffect(() => {
    props.setCandidates([]);
    const timer = setTimeout(() => { if (props.scope.active) void query.run({ search, selectedIds: [], page: 1, pageSize: 20 }); }, search ? 160 : 0);
    return () => { clearTimeout(timer); query.cancel(); };
  }, [query, search, props.scope, props.setCandidates]);
  const data = snapshot.phase === 'success' && snapshot.success?.parameters.search === search ? snapshot.success.data : null;
  useEffect(() => { props.setCandidates(data?.items ?? []); }, [data, props.setCandidates]);
  if (!props.scope.active) return null;
  const busy = snapshot.phase === 'loading' || snapshot.phase === 'idle';
  return <div className="transfer-warehouse-menu"><div className="inv-filter-tools">{data ? `匹配 ${transferCount(data.exactTotal)} 项` : '按名称搜索仓库'} · 每次最多 20 项</div>
    {busy ? <p className="iw-inline-state" role="status">正在读取仓库…</p> : snapshot.phase === 'error' ? <p className="iw-inline-state" role="alert">仓库读取失败。<button type="button" className="iw-link" onClick={() => { if (snapshot.request) void query.run(snapshot.request.parameters); }}>重试仓库</button></p> : props.menu}
    {data && <footer><span>第 {data.page} 页</span><span><button type="button" className="iw-text-button" disabled={data.page <= 1} onClick={() => { if (snapshot.success) void query.run({ ...snapshot.success.parameters, page: data.page - 1 }); }}>上一页</button><button type="button" className="iw-text-button" disabled={BigInt(data.page) * 20n >= BigInt(data.exactTotal) || !Number.isSafeInteger((data.page + 1) * 20)} onClick={() => { if (snapshot.success) void query.run({ ...snapshot.success.parameters, page: data.page + 1 }); }}>下一页</button></span></footer>}
    {data?.items.length === 0 && <p className="iw-inline-state">没有匹配的仓库</p>}
  </div>;
}
