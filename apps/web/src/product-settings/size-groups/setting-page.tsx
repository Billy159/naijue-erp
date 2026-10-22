import { StandardReadTable } from '../../components/standard-read-table.tsx';
import { StandardTabs } from '../../components/standard-tabs.tsx';
import { UIInput } from '../../components/standard-controls.tsx';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryRead } from '../../loading/latest-query.ts';
import { validateDictionaryPage, validateDictionarySeason, validateDictionarySizeGroup } from '../../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryListQuery, DictionaryPage, DictionarySeason, DictionarySizeGroup, ReadOnlySettingPageProps } from './contracts.ts';
import { DictionaryPagination } from './pagination.tsx';
import { DictionaryReadState } from './read-state.tsx';
import { useDictionaryOwner, type DictionaryOwner } from './read-owner.tsx';
import './source-dictionary.css';
const initial: DictionaryListQuery = Object.freeze({ search: '', page: 1, pageSize: 20 });
type Item = DictionarySizeGroup | DictionarySeason;
export function ReadOnlySettingPage(props: ReadOnlySettingPageProps & { readonly kind: 'size-groups' | 'seasons' }) {
  const execute = useMemo(() => async (read: QueryRead<DictionaryListQuery>): Promise<DictionaryPage<Item>> => props.kind === 'size-groups'
    ? validateDictionaryPage(await props.reader.readSizeGroups(read), read.parameters, validateDictionarySizeGroup)
    : validateDictionaryPage(await props.reader.readSeasons(read), read.parameters, validateDictionarySeason), [props.kind, props.reader]);
  const owner = useDictionaryOwner(props, execute, initial);
  return owner ? <SettingContent key={owner.scope.routeInstanceId + (owner.scope.active ? '' : ':closed')} {...props} owner={owner} /> : null;
}
function SettingContent(props: ReadOnlySettingPageProps & { readonly kind: 'size-groups' | 'seasons'; readonly owner: DictionaryOwner<DictionaryListQuery, DictionaryPage<Item>> }) {
  const { query, scope } = props.owner; const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [search, setSearch] = useState(''); const previousSearch = useRef(''); const [initialSize, setInitialSize] = useState<DictionaryListQuery['pageSize']>(20);
  const success = snapshot.success, result = success?.data, busy = snapshot.phase === 'loading', label = props.kind === 'size-groups' ? '尺码组' : '季节';
  const run = (parameters: DictionaryListQuery) => { if (scope.active) void query.run(parameters); };
  const displayed = success?.parameters ?? { ...initial, pageSize: initialSize };
  const retry = () => run(snapshot.request?.parameters ?? { search, page: 1, pageSize: initialSize });
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
  return <div className="dictionary-workbench pc-workbench pc-settings-page pc-readonly-settings"><div className="pc-page-head"><h1>商品设置</h1></div><section className="pc-settings"><StandardTabs className="erp-settings-tabs dictionary-entry-tabs" label="商品设置" value={(props.kind === 'size-groups' ? 'groups' : 'seasons')} restoreFocus={!!props.focusSettingTab} items={([['colors', '颜色'], ['groups', '尺码组'], ['fits', '版型'], ['seasons', '季节']] as const).map(([key,label])=>({key,label,disabled:key!==(props.kind === 'size-groups' ? 'groups' : 'seasons') && (!props.onSettingTab || !props.allowedSettingTabs?.includes(key))}))} onChange={tab=>{if(scope.active)props.onSettingTab?.(tab);}}><div className="pc-settings-body"><form className="pc-section-line" role="search" aria-label={`搜索${label}`} onSubmit={event => { event.preventDefault(); run({ search, page: 1, pageSize: displayed.pageSize }); }}><UIInput type="search" maxLength={200} aria-label={`搜索${label}名称`} placeholder={`搜索${label}名称`} value={search} onChange={nextValue => { query.cancel(); setSearch(nextValue); }} /></form><DictionaryReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} />{success && (busy || snapshot.phase === 'error' || search !== success.parameters.search) && <p role="status">以下仍为上次成功读取的资料（搜索：{success.parameters.search || '全部'}，第{success.parameters.page}页）；并非本次读取结果。</p>}<StandardReadTable<Item> label={label} rows={result?.items ?? []} onRow={item => ({ 'data-dictionary-id': item.id })} columns={[
 { title: label, dataIndex: 'name' }, ...(props.kind === 'size-groups' ? [{ title: '包含尺码', render: (_: unknown, item: Item) => 'sizes' in item && item.sizes.length ? item.sizes.map(size => size.name).join('、') : '未提供' }] : []),
]} />{result && !result.items.length && <div className="empty" role="status">{result.total > 0 ? '此页没有数据，请返回有效页。' : '没有匹配的数据'}</div>}<DictionaryPagination scope={scope} page={displayed.page} pageSize={displayed.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...displayed, page })} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else { setInitialSize(pageSize); run({ search, page: 1, pageSize }); } }} /></div></StandardTabs></section></div>;
}
