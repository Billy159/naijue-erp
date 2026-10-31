import { Button, Select } from '@arco-design/web-react';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ComponentType, type ComponentProps, type ReactNode } from 'react';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { SettingsDirectoryKind, SettingsDirectoryPage, SettingsDirectoryParameters, SettingsDirectoryReader, SettingsReference } from '../../../../src/settings/stores/maintenance-contracts.ts';

import { Pagination } from '../common/ui/pagination.tsx';
import { SourceControl } from '../common/ui/source-control.tsx';
import { filterCss } from '../inventory/source-control-css.ts';
import { singleCss } from '../common/ui/control-css.ts';
import { ALL_FILTER_VALUE } from '../inventory/filter-selection.ts';

export const settingsSingleCss=singleCss+'\n.runtime-settings-directory{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 4px;font-size:12px}';
const ControlledSelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { value: string | undefined }>;
type SmallSelectProps = { selectedLabel?: string; value: string; items: readonly { value: string; label: string; disabled?: boolean }[]; label: string; placeholder?: string; search?: boolean; clear?: boolean; disabled?: boolean; loading?: boolean; remote?: boolean; onChange: (value: string) => void; onOpen?: () => void; onClose?: () => void; onSearch?: (value: string) => void; footer?: ReactNode };
export function SmallSelect(props:SmallSelectProps) {
 return <SourceControl css={settingsSingleCss} attributes={{className:'ui-single-host bs-single runtime-settings-select'}}>{(portal,host)=><SmallSelectContent {...props} portal={portal} host={host}/>}</SourceControl>;
}
function SmallSelectContent(props:SmallSelectProps & {portal:HTMLElement;host:HTMLElement}) {
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [, refreshPortal] = useReducer(value => value+1, 0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  // Installed Arco's Portal loses its container ref during React19 StrictMode replay.
  useEffect(() => { if (!mounted || !open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [mounted, open, props.disabled]);
  return <ControlledSelect className="ui-flat-select" value={props.value || undefined} options={[...props.items]} aria-label={props.label} placeholder={props.placeholder ?? props.label}
    showSearch={props.search ?? false} filterOption={!props.remote} allowClear={props.clear ?? false} disabled={props.disabled ?? false} loading={props.loading ?? false} unmountOnExit
    onFocus={event => {
      // Non-search controls still need their wrapper tab stop.
      if (!props.search) return;
      const input=event.target;if(input instanceof HTMLInputElement){const view=input.closest<HTMLElement>('[role="combobox"]');if(view)view.tabIndex=-1;}
    }}
    getPopupContainer={() => props.portal}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(props.host.getBoundingClientRect().width ?? 180, 300), Math.max(180, window.innerWidth - (props.host.getBoundingClientRect().left ?? 0) - 12)) } }}
    renderFormat={() => <span className="ui-single-tag">{props.selectedLabel ?? props.items.find(item => item.value === props.value)?.label ?? ''}</span>}
    popupVisible={mounted && open && !props.disabled} dropdownRender={menu => <>{menu}{props.footer}</>} onVisibleChange={visible => { setOpen(visible); if (visible) props.onOpen?.(); else props.onClose?.(); }} onSearch={value => props.onSearch?.(value)}
    onChange={(value: unknown) => { props.onChange(typeof value === 'string' ? value : (props.items.find(item=>item.value===''||item.value==='all'||item.value==='ALL')?.value ?? '')); setOpen(false); props.onClose?.(); }}/>;
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
export function ReferenceSelect(props: { scope: ReadScope; reader?: SettingsDirectoryReader | undefined; kind: SettingsDirectoryKind; label: string; selected: SettingsReference | null; hallId?: string | null; required?: boolean; includeAll?: boolean; allLabel?: string; disabled?: boolean; placeholder?: string; onChange: (value: SettingsReference | null) => void }) {
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
  for (const item of current?.data.items ?? []) options.set(item.id, item);

  const run = (search = '', page = 1) => { if (!props.disabled && query) void query.run({ search, page, pageSize: 20, hallId: props.hallId ?? null }); };
  const unavailable = !query || props.kind === 'warehouses' && !props.hallId;
  const page = current?.data;
  const items=[...options.values()].map(item=>({value:item.id,label:item.name??'名称未提供'}));
  const searching=!!(state.request?.parameters.search??current?.parameters.search??'').trim();
  if(props.includeAll&&!props.required&&!searching)items.unshift({value:ALL_FILTER_VALUE,label:props.allLabel??props.placeholder??props.label});
  return <SmallSelect selectedLabel={props.selected?.name??(props.includeAll&&!props.required?props.allLabel??props.placeholder??props.label:'')} value={props.selected?.id ?? (props.includeAll&&!props.required?ALL_FILTER_VALUE:'')} items={items} label={props.label} placeholder={props.placeholder ?? '请选择'} search clear={!props.required} remote disabled={props.disabled || unavailable} loading={state.phase === 'loading'}
    onOpen={() => { setOpened(true); run(); }} onClose={() => { setOpened(false); query?.cancel(); }} onSearch={search => { if (opened) run(search); }}
    onChange={id => { if (!id || id===ALL_FILTER_VALUE&&props.includeAll&&!props.required) props.onChange(null); else if (current?.data.items.some(item => item.id === id)) props.onChange(options.get(id) ?? null); }}
    footer={<>{state.phase === 'error' && <div className="runtime-settings-directory" role="alert">{readMessage(state.error)}<Button type="text" onMouseDown={e => e.preventDefault()} onClick={() => { if (state.request) void query?.run(state.request.parameters); }}>重试</Button></div>}
      {page && page.total > page.pageSize && <div className="runtime-settings-directory"><Button size="mini" disabled={page.page <= 1} onMouseDown={e => e.preventDefault()} onClick={() => run(current.parameters.search, page.page - 1)}>上一页</Button><span>共 {page.total} 条</span><Button size="mini" disabled={page.page * page.pageSize >= page.total} onMouseDown={e => e.preventDefault()} onClick={() => run(current.parameters.search, page.page + 1)}>下一页</Button></div>}</>}/>;
}

/** The same source pagination used by inventory; settings retain their existing page-size contract. */
export function Pager(props: { total: number; page: number; size: 20 | 50 | 100; disabled?: boolean; onPage: (page: number) => void; onSize: (size: 20 | 50 | 100) => void }) {
 return <div className="bs-pager"><Pagination total={props.total} page={props.page} size={props.size} busy={props.disabled ?? false} unit="条" pageSizes={[20,50,100]} selectLabel="每页数量" change={props.onPage} sizeChange={size=>{if(size===20||size===50||size===100)props.onSize(size);}}/></div>;
}
