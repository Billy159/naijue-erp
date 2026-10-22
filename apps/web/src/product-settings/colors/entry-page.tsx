import { StandardReadTable } from '../../components/standard-read-table.tsx';
import { StandardTabs } from '../../components/standard-tabs.tsx';
import { UIButton, UIInput } from '../../components/standard-controls.tsx';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryRead } from '../../loading/latest-query.ts';
import { validateCatalogueSettingsPage } from '../../../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueEntryPageProps, CatalogueSettingsEntry, CatalogueSettingsListQuery, CatalogueSettingsPage } from './contracts.ts';
import { CataloguePagination } from './pagination.tsx';
import { CatalogueReadState } from './read-state.tsx';
import { useCatalogueReadOwner, type CatalogueReadOwner } from './read-owner.tsx';
import { CatalogueEntryEditor } from './entry-view.tsx';
import './source-catalogue-settings.css';

const initial: CatalogueSettingsListQuery = Object.freeze({ search: '', page: 1, pageSize: 20 });
type Kind = 'colors' | 'fits';
type Owner = CatalogueReadOwner<CatalogueSettingsListQuery, CatalogueSettingsPage<CatalogueSettingsEntry>>;
export function CatalogueEntryPage(props: CatalogueEntryPageProps & { readonly kind: Kind }) {
  const execute = useMemo(() => async (read: QueryRead<CatalogueSettingsListQuery>) => validateCatalogueSettingsPage(await (props.kind === 'colors' ? props.reader.readColors(read) : props.reader.readFits(read)), { ...read.parameters }), [props.kind, props.reader]);
  const owner = useCatalogueReadOwner(props, execute, initial);
  return owner ? <EntryContent key={owner.scope.routeInstanceId} {...props} owner={owner} /> : null;
}
function EntryContent(props: CatalogueEntryPageProps & { readonly kind: Kind; readonly owner: Owner }) {
  const { query, scope } = props.owner, snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [search, setSearch] = useState(''), previousSearch = useRef('');
  const [initialSize, setInitialSize] = useState<CatalogueSettingsListQuery['pageSize']>(20);
  const trigger = useRef<HTMLElement | null>(null);
  const [editTarget,setEditTarget]=useState<{entry:CatalogueSettingsEntry|null;sequence:number}|null>(null),sequence=useRef(0),leaveGuard=useRef<(()=>boolean)|null>(null),[notice,setNotice]=useState('');
  const maintenance=props.maintenance&&props.onCanLeaveChange?props.maintenance:undefined;
  if(maintenance&&maintenance.kind!==(props.kind==='colors'?'COLOR':'FIT'))throw new TypeError('Catalogue maintenance kind does not match the page.');
  const receiveGuard=useCallback((guard:(()=>boolean)|null)=>{leaveGuard.current=guard;props.onCanLeaveChange?.(guard);},[props.onCanLeaveChange]);
  const openEditor=(entry:CatalogueSettingsEntry|null,element:HTMLElement)=>{if(!scope.active||!maintenance)return;trigger.current=element;setNotice('');setEditTarget({entry,sequence:++sequence.current});};
  const closeEditor=()=>{setEditTarget(null);if(scope.active&&trigger.current?.isConnected)trigger.current.focus();};

  const success = snapshot.success, result = success?.data, busy = snapshot.phase === 'loading', label = props.kind === 'colors' ? '颜色' : '版型';
  const displayed = success?.parameters ?? { ...initial, pageSize: initialSize };
  const run = (parameters: CatalogueSettingsListQuery) => { if (scope.active) { void query.run(parameters); } };
  const retry = () => run(snapshot.request?.parameters ?? { search, page: 1, pageSize: initialSize });
  useEffect(() => {
    if (search === previousSearch.current) return;
    previousSearch.current = search;
    const timer = setTimeout(() => {
      const current = query.getSnapshot(), requested = current.request?.parameters;
      if (requested?.search !== search || requested.page !== 1 || current.phase === 'idle') run({ search, page: 1, pageSize: requested?.pageSize ?? displayed.pageSize });
    }, 180);
    return () => clearTimeout(timer);
  }, [search, query]);
  const state = <CatalogueReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} />;
  if (snapshot.phase === 'disposed') return <div className="catalogue-workbench">{state}</div>;
  const canCreate=!!maintenance?.allowedActions.includes('CREATE'),canEdit=!!maintenance?.allowedActions.some(action=>action!=='CREATE');
  const unavailable=`${label}维护暂不可用。`;
  return <div className="catalogue-workbench pc-workbench pc-settings-page">
    <div className="pc-page-head"><h1>商品设置</h1></div>
    <section className="pc-settings"><StandardTabs className="erp-settings-tabs catalogue-entry-tabs" label="商品设置" value={props.kind} restoreFocus={!!props.focusSettingTab}
      items={([['colors', '颜色'], ['groups', '尺码组'], ['fits', '版型'], ['seasons', '季节']] as const).map(([key,label])=>({key,label,disabled:key!==props.kind && (!props.onSettingTab || !props.allowedSettingTabs?.includes(key))}))}
      onChange={tab=>{if(leaveGuard.current&&!leaveGuard.current()){setNotice('请先保存或取消当前编辑。');return;}if(scope.active)props.onSettingTab?.(tab);}}>
      <div className="pc-settings-body">
        <form className="pc-section-line" role="search" aria-label={`搜索${label}`} onSubmit={event=>{event.preventDefault();run({search,page:1,pageSize:displayed.pageSize});}}>
          <UIInput type="search" maxLength={200} aria-label={`搜索${label}名称或编码`} placeholder={`搜索${label}名称或编码`} value={search} onChange={nextValue=>{query.cancel();setSearch(nextValue);}}/>
          <UIButton className="primary" type="button" disabled={!canCreate} title={!maintenance?unavailable:!canCreate?'暂无新增权限':undefined} aria-description={!maintenance?unavailable:undefined} onClick={event=>openEditor(null,event.currentTarget)}>新增{label}</UIButton>
        </form>
        {notice&&<p role="status">{notice}</p>}{state}
        {success&&(busy||snapshot.phase==='error'||search!==success.parameters.search)&&<p role="status">以下仍为上次成功读取的资料（搜索：{success.parameters.search||'全部'}，第{success.parameters.page}页）；并非本次读取结果。</p>}
        <StandardReadTable<CatalogueSettingsEntry> label={label} tableClassName="catalogue-entry-table" rows={result?.items??[]} onRow={item=>({'data-catalogue-id':item.id})} columns={[
          {title:'名称',dataIndex:'name'},{title:'编码',dataIndex:'code'},
          {title:'操作',width:100,render:(_,item)=><UIButton type="button" className="view-action" aria-label={`编辑${label}：${item.name}`} disabled={busy||snapshot.phase!=='success'||search!==success?.parameters.search||!canEdit} title={!maintenance?unavailable:!canEdit?'暂无编辑权限':undefined} aria-description={!maintenance?unavailable:undefined} onClick={event=>openEditor(item,event.currentTarget)}>编辑</UIButton>},
        ]}/>
        {result&&!result.items.length&&<div className="empty" role="status">{result.total?'此页没有数据，请返回有效页。':'没有匹配的数据'}</div>}
        <CataloguePagination scope={scope} page={displayed.page} pageSize={displayed.pageSize} total={result?.total??null} busy={busy} onPage={page=>run({...displayed,page})} onPageSize={pageSize=>{setInitialSize(pageSize);run({...displayed,search:success?displayed.search:search,page:1,pageSize});}}/>
      </div>
    </StandardTabs></section>
    {editTarget&&maintenance&&<CatalogueEntryEditor key={editTarget.sequence} scope={scope} capability={maintenance} entry={editTarget.entry} label={label} close={closeEditor} onAccessFailure={props.onAccessFailure} onCanLeaveChange={receiveGuard} reload={()=>run(success?.parameters??displayed)} onCommitted={()=>{closeEditor();setNotice('已保存。');run(success?.parameters??displayed);}}/>}
  </div>;

}
