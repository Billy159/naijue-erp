import { Button, Select } from '@arco-design/web-react';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ComponentType, type ComponentProps, type ReactNode } from 'react';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { SettingsDirectoryKind, SettingsDirectoryPage, SettingsDirectoryParameters, SettingsDirectoryReader, SettingsReference } from '../../../../src/settings/stores/maintenance-contracts.ts';

const ControlledSelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { value: string | undefined }>;
export function SmallSelect(props: { value: string; items: readonly { value: string; label: string; disabled?: boolean }[]; label: string; placeholder?: string; search?: boolean; clear?: boolean; disabled?: boolean; loading?: boolean; remote?: boolean; onChange: (value: string) => void; onOpen?: () => void; onClose?: () => void; onSearch?: (value: string) => void; footer?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [, refreshPortal] = useReducer(value => value+1, 0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  // Installed Arco's Portal loses its container ref during React19 StrictMode replay.
  useEffect(() => { if (!mounted || !open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [mounted, open, props.disabled]);
  return <div ref={host} className="ui-single-host bs-single runtime-settings-select"><ControlledSelect className="ui-flat-select" value={props.value || undefined} options={[...props.items]} aria-label={props.label} placeholder={props.placeholder ?? props.label}
    showSearch={props.search ?? false} filterOption={!props.remote} allowClear={props.clear ?? false} disabled={props.disabled ?? false} loading={props.loading ?? false} unmountOnExit
    getPopupContainer={() => host.current ?? document.body}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(host.current?.getBoundingClientRect().width ?? 180, 300), Math.max(180, window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12)) } }}
    renderFormat={() => <span className="ui-single-tag">{props.items.find(item => item.value === props.value)?.label ?? ''}</span>}
    popupVisible={mounted && open && !props.disabled} dropdownRender={menu => <>{menu}{props.footer}</>} onVisibleChange={visible => { setOpen(visible); if (visible) props.onOpen?.(); else props.onClose?.(); }} onSearch={value => props.onSearch?.(value)}
    onChange={(value: unknown) => { props.onChange(typeof value === 'string' ? value : ''); setOpen(false); props.onClose?.(); }}/></div>;
}

const idle = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
export function readMessage(error: unknown): string {
  if (error instanceof HttpQueryError) {
    if (error.kind === 'forbidden') return '无权读取此资料。';
    if (error.kind === 'unauthenticated') return '登录已失效，请重新登录。';
    if (error.kind === 'unavailable') return '资料尚未准备好，请稍后重试。';
    if (error.kind === 'not-implemented') return '此项资料读取尚未接入。';
  }
  return '资料读取失败，请重试。';
}
/** The original SmallSelect presentation; only its data source is server paged. */
export function ReferenceSelect(props: { scope: ReadScope; reader?: SettingsDirectoryReader | undefined; kind: SettingsDirectoryKind; label: string; selected: SettingsReference | null; hallId?: string | null; required?: boolean; disabled?: boolean; placeholder?: string; onChange: (value: SettingsReference | null) => void }) {
  const [binding, setBinding] = useState<{ scope: ReadScope; reader: SettingsDirectoryReader; kind: SettingsDirectoryKind; hallId: string | null; query: LatestQuery<SettingsDirectoryParameters, SettingsDirectoryPage> } | null>(null);
  useEffect(() => {
    if (!props.reader) { setBinding(null); return; }
    const reader = props.reader, query = new LatestQuery<SettingsDirectoryParameters, SettingsDirectoryPage>({ scope: props.scope, execute: read => reader.read(props.kind, read.parameters, read.signal) });
    setBinding({ scope: props.scope, reader, kind: props.kind, hallId: props.hallId ?? null, query });
    return () => query.dispose();
  }, [props.scope, props.reader, props.kind, props.hallId]);
  const query = binding?.scope === props.scope && binding.reader === props.reader && binding.kind === props.kind && binding.hallId === (props.hallId ?? null) ? binding.query : null;
  const state = useSyncExternalStore(query?.subscribe ?? noSubscribe, query?.getSnapshot ?? (() => idle), query?.getSnapshot ?? (() => idle));
  const [opened, setOpened] = useState(false);
  const current = state.phase === 'success' ? state.success : null;
  const options = new Map<string, SettingsReference>();
  if (props.selected) options.set(props.selected.id, props.selected);
  for (const item of current?.data.items ?? []) options.set(item.id, item);
  const run = (search = '', page = 1) => { if (!props.disabled && query) void query.run({ search, page, pageSize: 20, hallId: props.hallId ?? null }); };
  const unavailable = !query || props.kind === 'warehouses' && !props.hallId;
  const page = current?.data;
  return <SmallSelect value={props.selected?.id ?? ''} items={[...options.values()].map(item => ({ value: item.id, label: item.name ?? '名称未提供' }))} label={props.label} placeholder={props.placeholder ?? '请选择'} search clear={!props.required} remote disabled={props.disabled || unavailable} loading={state.phase === 'loading'}
    onOpen={() => { setOpened(true); run(); }} onClose={() => { setOpened(false); query?.cancel(); }} onSearch={search => { if (opened) run(search); }}
    onChange={id => { if (!id) props.onChange(null); else if (current?.data.items.some(item => item.id === id)) props.onChange(options.get(id) ?? null); }}
    footer={<>{state.phase === 'error' && <div className="runtime-settings-directory" role="alert">{readMessage(state.error)}<Button type="text" onMouseDown={e => e.preventDefault()} onClick={() => { if (state.request) void query?.run(state.request.parameters); }}>重试</Button></div>}
      {page && page.total > page.pageSize && <div className="runtime-settings-directory"><Button size="mini" disabled={page.page <= 1} onMouseDown={e => e.preventDefault()} onClick={() => run(current.parameters.search, page.page - 1)}>上一页</Button><span>共 {page.total} 条</span><Button size="mini" disabled={page.page * page.pageSize >= page.total} onMouseDown={e => e.preventDefault()} onClick={() => run(current.parameters.search, page.page + 1)}>下一页</Button></div>}</>}/>;
}

/** React transcription of inventory-workbench.paginationMarkup, with server total. */
export function Pager(props: { total: number; page: number; size: 20 | 50 | 100; disabled?: boolean; onPage: (page: number) => void; onSize: (size: 20 | 50 | 100) => void }) {
  const pages = Math.max(1, Math.ceil(props.total / props.size)), [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const numbers = [...new Set([1, pages, props.page - 1, props.page, props.page + 1].filter(n => n >= 1 && n <= pages))].sort((a,b) => a-b);
  const go = () => { const value = Number(jump); if (/^\d+$/.test(jump) && value >= 1 && value <= pages) props.onPage(value); };
  return <div className="bs-pager"><div className="iw-pagination"><div className="runtime-settings-page-size"><SmallSelect label="每页数量" value={String(props.size)} items={[20,50,100].map(value => ({ value: String(value), label: `${value}条/页` }))} disabled={props.disabled ?? false} onChange={value => props.onSize(Number(value) as 20 | 50 | 100)}/></div>
    <span>共 {props.total.toLocaleString('zh-CN')} 条{props.total ? `，当前第 ${(props.page-1)*props.size+1}–${Math.min(props.page*props.size, props.total)} 条` : ''}</span>
    {pages > 1 && <div className="actions"><button type="button" className="btn iw-page-arrow" aria-label="上一页" disabled={props.disabled || props.page <= 1} onClick={() => props.onPage(props.page-1)}>‹</button>
      {numbers.map((page,index) => <span key={page}>{page-(numbers[index-1] ?? 0)>1 && <span className="iw-page-ellipsis">…</span>}<button type="button" className="btn iw-page-number" aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} disabled={props.disabled} onClick={() => props.onPage(page)}>{page}</button></span>)}
      <button type="button" className="btn iw-page-arrow" aria-label="下一页" disabled={props.disabled || props.page >= pages} onClick={() => props.onPage(props.page+1)}>›</button>
      <label className="iw-jump">跳至 <input type="text" inputMode="numeric" aria-label="目标页码" value={jump} disabled={props.disabled} onChange={e => setJump(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}/> 页</label><button type="button" className="btn iw-jump-go" disabled={props.disabled} onClick={go}>跳转</button></div>}
  </div></div>;
}
