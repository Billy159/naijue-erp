import { Select } from '@arco-design/web-react';
import { Fragment, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type ComponentProps, type ComponentType } from 'react';
import { DemoPageSizeSelect } from '../demo-controls/page-size-select.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import '../demo-controls/page-size-shell.css';
import './demo-settings-ui.css';

// Arco runtime supports a controlled undefined; extend only its narrow published type.
const SourceSingleSelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { readonly value: ComponentProps<typeof Select>['value'] }>;
type SettingsPageSize = 20 | 50 | 100;

/** Frozen App native nav; domain owners retain dirty/permission decisions. */
export function DemoSettingsTabs<Key extends string>(props: {
  readonly scope: ReadScope; readonly label: string; readonly value: Key;
  readonly items: readonly { readonly value: Key; readonly label: string; readonly disabled?: boolean }[];
  readonly onChange: (key: Key) => void; readonly restoreFocus?: boolean;
}) {
  const host = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!props.restoreFocus) return;
    const frame = requestAnimationFrame(() => {
      const node = host.current, active = node?.ownerDocument.activeElement;
      if (!props.scope.active || !node?.isConnected || active && active !== node.ownerDocument.body && active.isConnected && !node.contains(active)) return;
      node.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const choose = (key: Key) => { if (props.scope.active && key !== props.value && props.items.some(item => item.value === key && !item.disabled)) props.onChange(key); };
  return <nav ref={host} className="bs-tabs" role="tablist" aria-label={props.label}>{props.items.map(item => <button type="button" role="tab" key={item.value} aria-selected={item.value === props.value} disabled={!!item.disabled} tabIndex={item.value === props.value ? 0 : -1} onClick={() => choose(item.value)} onKeyDown={event => {
    const enabled = props.items.filter(item => !item.disabled), index = enabled.findIndex(next => next.value === item.value);
    const next = event.key === 'ArrowRight' ? enabled[(index + 1) % enabled.length] : event.key === 'ArrowLeft' ? enabled[(index + enabled.length - 1) % enabled.length] : event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : undefined;
    if (next) { event.preventDefault(); choose(next.value); }
  }}>{item.label}</button>)}</nav>;
}

/** SmallSelect / unified-single-select: local React host replaces global mounts
 * and ShadowRoot; directory fetching and real pagination remain explicit props. */
export function DemoSettingsSingleSelect(props: {
  readonly scope: ReadScope; readonly label: string; readonly placeholder: string; readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly disabled?: boolean; readonly loading?: boolean; readonly search?: boolean; readonly clear?: boolean;
  readonly onOpen?: () => void; readonly onSearch?: (search: string) => void;
  readonly onChange: (value: string) => void; readonly footer?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
    const close = () => setOpen(false); props.scope.signal.addEventListener('abort', close, { once: true });
    if (props.disabled || !props.scope.active) close();
    return () => props.scope.signal.removeEventListener('abort', close);
  }, [props.scope, props.disabled]);
  useEffect(() => { if (!mounted || !open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [mounted, open, props.disabled]);
  const anchor = host.current?.getBoundingClientRect(), viewportWidth = host.current?.ownerDocument.defaultView?.innerWidth;
  const popupWidth = anchor && viewportWidth
    ? Math.min(Math.max(anchor.width, 300), Math.max(180, viewportWidth - anchor.left - 12))
    : 300;
  return <div ref={host} className="ui-single-host bs-single demo-settings-single demo-store-single" style={{ position: 'relative' }}><SourceSingleSelect className="ui-flat-select" aria-label={props.label} placeholder={props.placeholder} value={props.value || undefined} options={[...props.options]} showSearch={!!props.search} filterOption={props.search ? false : true} allowClear={!!props.clear} disabled={!!props.disabled || !props.scope.active} loading={props.loading ?? false}
    popupVisible={mounted && open && !props.disabled && props.scope.active} unmountOnExit getPopupContainer={() => { if (!host.current) throw new Error('Store select host not mounted'); return host.current; }}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: popupWidth } }}
    renderFormat={(_, selected) => <span className="ui-single-tag">{props.options.find(item => item.value === selected)?.label ?? '名称未提供'}</span>}
    dropdownRender={menu => <>{menu}{props.footer}</>}
    onVisibleChange={visible => { if (!props.scope.active || props.disabled) return; setOpen(visible); if (visible) props.onOpen?.(); }}
    onSearch={search => { if (props.scope.active && open && !props.disabled) props.onSearch?.(search); }}
    onChange={(value: string | undefined) => {
      if (!props.scope.active || props.disabled || value === undefined && !props.clear || value !== undefined && (!open || !props.options.some(option => option.value === value))) return;
      setOpen(false); props.onChange(value ?? '');
    }} /></div>;
}

/** inventory-workbench.paginationMarkup + basic-settings.Pager, translated as
 * React markup/events. Unknown totals and out-of-range recovery are formal data adaptations. */
export function DemoSettingsPager(props: { readonly scope: ReadScope; readonly page: number; readonly size: SettingsPageSize; readonly total: number | null; readonly busy: boolean; readonly disabled?: boolean; readonly label?: string; readonly onPage: (page: number) => void; readonly onSize: (size: SettingsPageSize) => void }) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const pages = props.total === null ? null : Math.max(1, Math.ceil(props.total / props.size));
  const numbers = pages === null ? [] : [...new Set([1, pages, props.page - 1, props.page, props.page + 1].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const disabled = props.busy || !!props.disabled || !props.scope.active, start = (props.page - 1) * props.size + 1;
  const go = (next: number) => { if (!disabled && pages !== null && Number.isSafeInteger(next) && next >= 1 && next <= pages) props.onPage(next); };
  return <div className="bs-pager"><div className="iw-pagination" aria-label={props.label ?? '基础设置列表分页'}><DemoPageSizeSelect scope={props.scope} label="每页数量" value={String(props.size)} disabled={disabled} options={[20, 50, 100].map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => { if (!disabled && ['20', '50', '100'].includes(value)) props.onSize(Number(value) as SettingsPageSize); }} />
    <span>{props.total === null ? props.busy ? '正在读取' : '尚未读取' : `共 ${props.total.toLocaleString('zh-CN')} 条${props.total && start <= props.total ? `，当前第 ${start}–${Math.min(props.page * props.size, props.total)} 条` : ''}`}</span>
    {pages !== null && pages > 1 && <div className="actions"><button type="button" className="btn iw-page-arrow" disabled={disabled || props.page <= 1} aria-label="上一页" onClick={() => go(props.page - 1)}>‹</button>{numbers.map((page, index) => <Fragment key={page}>{index > 0 && page - numbers[index - 1]! > 1 && <span className="iw-page-ellipsis">…</span>}<button type="button" className="btn iw-page-number" disabled={disabled} aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} onClick={() => go(page)}>{page}</button></Fragment>)}<button type="button" className="btn iw-page-arrow" disabled={disabled || props.page >= pages} aria-label="下一页" onClick={() => go(props.page + 1)}>›</button><label className="iw-jump">跳至 <input type="text" inputMode="numeric" aria-label="目标页码" value={jump} disabled={disabled} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(Number(jump)); } }} /> 页</label><button type="button" className="btn iw-jump-go" disabled={disabled} onClick={() => go(Number(jump))}>跳转</button></div>}
    {pages !== null && props.page > pages && <button type="button" className="btn" disabled={disabled} onClick={() => go(1)}>返回第一页</button>}
  </div></div>;
}
