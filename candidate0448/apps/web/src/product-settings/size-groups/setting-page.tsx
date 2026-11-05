import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DemoPageSizeSelect } from '../../demo-controls/page-size-select.tsx';
import type { QueryRead } from '../../loading/latest-query.ts';
import { validateDictionaryPage, validateDictionarySeason, validateDictionarySizeGroup } from '../../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryListQuery, DictionaryPage, DictionaryPageSize, DictionarySeason, DictionarySizeGroup, ProductSettingTab, ReadOnlySettingPageProps } from './contracts.ts';
import { DictionaryReadState } from './read-state.tsx';
import { useDictionaryOwner, type DictionaryOwner } from './read-owner.tsx';
import './source-dictionary.css';
const initial: DictionaryListQuery = Object.freeze({ search: '', page: 1, pageSize: 20 });
type Item = DictionarySizeGroup | DictionarySeason;
const settingTabs = [['colors', '颜色'], ['groups', '尺码组'], ['fits', '版型'], ['seasons', '季节']] as const;
export function ReadOnlySettingPage(props: ReadOnlySettingPageProps & { readonly kind: 'size-groups' | 'seasons' }) {
  const execute = useMemo(() => async (read: QueryRead<DictionaryListQuery>): Promise<DictionaryPage<Item>> => props.kind === 'size-groups'
    ? validateDictionaryPage(await props.reader.readSizeGroups(read), read.parameters, validateDictionarySizeGroup)
    : validateDictionaryPage(await props.reader.readSeasons(read), read.parameters, validateDictionarySeason), [props.kind, props.reader]);
  const owner = useDictionaryOwner(props, execute, initial);
  return owner ? <SettingContent key={owner.scope.routeInstanceId + (owner.scope.active ? '' : ':closed')} {...props} owner={owner} /> : null;
}
function SettingContent(props: ReadOnlySettingPageProps & { readonly kind: 'size-groups' | 'seasons'; readonly owner: DictionaryOwner<DictionaryListQuery, DictionaryPage<Item>> }) {
  const { query, scope } = props.owner; const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState(''); const previousSearch = useRef(''); const [initialSize, setInitialSize] = useState<DictionaryListQuery['pageSize']>(20);
  const success = snapshot.success, result = success?.data, busy = snapshot.phase === 'loading', label = props.kind === 'size-groups' ? '尺码组' : '季节';
  const run = (parameters: DictionaryListQuery) => { if (scope.active) void query.run(parameters); };
  const displayed = success?.parameters ?? { ...initial, pageSize: initialSize };
  const retry = () => run(snapshot.request?.parameters ?? { search, page: 1, pageSize: initialSize });
  const tab = props.kind === 'size-groups' ? 'groups' : 'seasons';
  const enabledTab = (key: ProductSettingTab) => key === tab || (!!props.onSettingTab && !!props.allowedSettingTabs?.includes(key));
  const chooseTab = (key: ProductSettingTab) => { if (scope.active && enabledTab(key) && key !== tab) props.onSettingTab?.(key); };
  useLayoutEffect(() => {
    if (!props.focusSettingTab) return;
    const frame = requestAnimationFrame(() => {
      const element = host.current; if (!element?.isConnected) return;
      const active = element.ownerDocument.activeElement;
      if (active && active !== element.ownerDocument.body && active.isConnected
        && !(element.contains(active) && active.matches('[role="tab"]'))) return;
      element.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (search === previousSearch.current) return; previousSearch.current = search;
    const timer = setTimeout(() => {
      const current = query.getSnapshot(), requested = current.request?.parameters;
      const pageSize = requested?.pageSize ?? displayed.pageSize;
      // Enter may already have executed this range; don't dispatch a duplicate debounce.
      if (requested?.search !== search || requested.page !== 1 || current.phase === 'idle') run({ search, page: 1, pageSize });
    }, 180);
    return () => clearTimeout(timer);
  }, [search, query]);
  if (snapshot.phase === 'disposed') return <div className="dictionary-workbench"><DictionaryReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} /></div>;
  // Frozen product-current.js settings()/workspaceHead, with caller-owned reads.
  // The native table receives only the returned page, never a frozen catalogue.
  return <div ref={host} className="pc-workbench pc-settings-page pc-readonly-settings">
    <div className="gold-head iw-head pc-page-head"><h1>商品设置</h1><div className="actions iw-head-actions" /></div>
    <section className="pc-settings">
      <div className="tabs" role="tablist" aria-label="商品设置">{settingTabs.map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} disabled={!enabledTab(key)} className={tab === key ? 'active' : ''} data-pc="setting" data-tab={key} onClick={() => chooseTab(key)} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        const enabled = settingTabs.filter(([key]) => enabledTab(key)), index = enabled.findIndex(([value]) => value === key);
        const next = event.key === 'ArrowRight' ? enabled[(index + 1) % enabled.length]?.[0]
          : event.key === 'ArrowLeft' ? enabled[(index + enabled.length - 1) % enabled.length]?.[0]
          : event.key === 'Home' ? enabled[0]?.[0] : event.key === 'End' ? enabled.at(-1)?.[0]
          : event.key === 'Enter' || event.key === ' ' ? key : undefined;
        if (next !== undefined) { event.preventDefault(); event.stopPropagation(); chooseTab(next); }
      }}>{text}</button>)}</div>
      <div className="pc-editor-body pc-settings-body" role="tabpanel" aria-label={label}>
        <div className="pc-section-line" role="search" aria-label={`搜索${label}`}><input id="pc-dict-search" type="search" maxLength={200} aria-label={`搜索${label}名称`} placeholder={`搜索${label}名称`} value={search} onChange={event => { query.cancel(); setSearch(event.currentTarget.value); }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); run({ search, page: 1, pageSize: displayed.pageSize }); }
        }} /></div>
        <DictionaryReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} />
        {success && (busy || snapshot.phase === 'error' || search !== success.parameters.search) && <p role="status">以下仍为上次成功读取的资料（搜索：{success.parameters.search || '全部'}，第{success.parameters.page}页）；并非本次读取结果。</p>}
        <table aria-label={label}><thead><tr><th scope="col">{label}</th>{props.kind === 'size-groups' && <th scope="col">包含尺码</th>}</tr></thead><tbody>{(result?.items ?? []).map(item => <tr key={item.id} data-dictionary-id={item.id}><td>{item.name}</td>{props.kind === 'size-groups' && <td>{'sizes' in item ? item.sizes.map(size => size.name).join('、') : '未提供'}</td>}</tr>)}</tbody></table>
        {result && !result.items.length && <div className="empty" role="status">{result.total > 0 ? '此页没有数据，请返回有效页。' : '没有匹配的数据'}</div>}
        <SettingsPagination scope={scope} page={displayed.page} pageSize={displayed.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...displayed, page })} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else { setInitialSize(pageSize); run({ search, page: 1, pageSize }); } }} />
      </div>
    </section>
  </div>;
}

/** Frozen inventory-workbench.js paginationMarkup, used by settings(). The page
 * size selector keeps the existing action-only public single-select owner. */
function SettingsPagination(props: { readonly scope: ReadOnlySettingPageProps['scope']; readonly page: number; readonly pageSize: DictionaryPageSize; readonly total: number | null; readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: DictionaryPageSize) => void }) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const pages = props.total === null ? null : Math.max(1, Math.ceil(props.total / props.pageSize));
  const numbers = pages === null ? [] : [...new Set([1, pages, props.page - 1, props.page, props.page + 1].filter(page => page >= 1 && page <= pages))].sort((a, b) => a - b);
  const unavailable = props.busy || !props.scope.active;
  const go = (page: number) => { if (!unavailable && Number.isSafeInteger(page) && pages !== null && page >= 1 && page <= pages) props.onPage(page); };
  const target = /^[1-9]\d{0,15}$/.test(jump) ? Number(jump) : 0;
  const start = props.total !== null && props.total > 0 ? (props.page - 1) * props.pageSize + 1 : 0;
  return <div className="iw-pagination pc-pagination pc-settings-pagination">
    <DemoPageSizeSelect scope={props.scope} label="商品设置每页条数" value={String(props.pageSize)} disabled={unavailable} options={[20, 50, 100].map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => props.onPageSize(Number(value) as DictionaryPageSize)} />
    <span>{props.total === null ? (props.busy ? '正在读取' : '尚未读取') : `共 ${props.total.toLocaleString('zh-CN')} 条${start && start <= props.total ? `，当前第 ${start}–${Math.min(props.page * props.pageSize, props.total)} 条` : ''}`}</span>
    {pages !== null && pages > 1 && <div className="actions" aria-label="商品字典分页">
      <button type="button" className="btn iw-page-arrow" aria-label="上一页" disabled={unavailable || props.page <= 1} onClick={() => go(props.page - 1)}>‹</button>
      {numbers.map((page, index) => <Fragment key={page}>{index > 0 && page - numbers[index - 1]! > 1 && <span className="iw-page-ellipsis">…</span>}<button type="button" className="btn iw-page-number" aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} disabled={unavailable} onClick={() => go(page)}>{page}</button></Fragment>)}
      <button type="button" className="btn iw-page-arrow" aria-label="下一页" disabled={unavailable || props.page >= pages} onClick={() => go(props.page + 1)}>›</button>
      <label className="iw-jump">跳至 <input id="pc-setting-jump" type="text" inputMode="numeric" aria-label="目标页码" value={jump} disabled={unavailable} onChange={event => setJump(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(target); } }} /> 页</label>
      <button type="button" className="btn iw-jump-go" disabled={unavailable || !Number.isSafeInteger(target) || target < 1 || target > pages} onClick={() => go(target)}>跳转</button>
    </div>}
    {pages !== null && props.page > pages && <button type="button" className="btn" disabled={unavailable} onClick={() => go(1)}>返回第一页</button>}
  </div>;
}
