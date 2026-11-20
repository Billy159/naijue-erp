import { useMemo, useState, useSyncExternalStore } from 'react';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import { validateDictionaryPage, validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryBarcodeScheme, DictionaryListQuery, DictionaryPage, DictionaryPageProps } from '../product-settings/size-groups/contracts.ts';
import { useDictionaryOwner, type DictionaryOwner } from '../product-settings/size-groups/read-owner.tsx';
import { DictionaryReadState } from '../product-settings/size-groups/read-state.tsx';
import { DictionaryPagination } from '../product-settings/size-groups/pagination.tsx';
import { BarcodeSchemeView } from './barcode-scheme-view.tsx';
import '../product-settings/size-groups/source-dictionary.css';
import './barcode-schemes.css';
const initial: DictionaryListQuery = Object.freeze({ search: '', page: 1, pageSize: 20 });
export function BarcodeSchemesPage(props: DictionaryPageProps) {
  const execute = useMemo(() => async (read: QueryRead<DictionaryListQuery>) => validateDictionaryPage(await props.reader.readBarcodeSchemes(read), read.parameters, validateDictionaryScheme), [props.reader]);
  const owner = useDictionaryOwner(props, execute, initial);
  return owner ? <SchemeContent key={owner.scope.routeInstanceId} {...props} owner={owner} /> : null;
}
function SchemeContent(props: DictionaryPageProps & { readonly owner: DictionaryOwner<DictionaryListQuery, DictionaryPage<DictionaryBarcodeScheme>> }) {
  const { scope, query } = props.owner; const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [target, setTarget] = useState<string | null>(null); const focusReturn = useDialogFocusReturn(scope, target !== null);
  const success = snapshot.success, result = success?.data, busy = snapshot.phase === 'loading', displayed = success?.parameters ?? initial;
  // A complete first page follows the frozen directory layout. Keep the real
  // pager for larger results, a chosen page size, and out-of-range recovery.
  const paginated = (result?.total ?? 0) > initial.pageSize || displayed.page > 1 || displayed.pageSize !== initial.pageSize;
  const run = (parameters: DictionaryListQuery) => { if (scope.active) void query.run(parameters); };
  const onAccessFailure = useMemo(() => (kind: 'unauthenticated' | 'forbidden') => { props.owner.invalidateAccess(kind); props.onAccessFailure(kind); }, [props.owner, props.onAccessFailure]);
  const close = () => { focusReturn.request(); setTarget(null); };
  const retry = () => run(snapshot.request?.parameters ?? initial);
  if (snapshot.phase === 'disposed') return <div className="dictionary-workbench"><DictionaryReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} /></div>;
  return <div className={`dictionary-workbench pc-workbench pc-schemes-page pc-native-schemes${paginated ? ' pc-schemes-paginated' : ''}`}>
    <div className="gold-head iw-head pc-page-head"><h1>条码方案</h1><div className="actions iw-head-actions" /></div>
    <DictionaryReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={retry} cancel={() => query.cancel()} />
    {success && (busy || snapshot.phase === 'error') && <p role="status">以下仍为上次成功读取的第{success.parameters.page}页，并非本次读取结果。</p>}
    <section className="pc-schemes"><div className="table-scroll" tabIndex={0} aria-label="条码方案列表，可横向滚动">
      <table className="pc-data-table" aria-label="条码方案"><thead><tr>{['方案名称','条码类型','编码规则','总长度','状态','适用范围','操作'].map(title=><th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{(result?.items??[]).map(item=><tr key={item.id} data-dictionary-id={item.id}><td>{item.name}</td><td>{item.barcodeType}</td><td>{item.ruleDescription}</td><td>{item.codeLength===null?'未提供':`${item.codeLength} 位`}</td><td>{item.status==='CURRENT'?'当前':'历史'}</td><td>{item.applicability??'未提供'}</td><td><button type="button" className="btn ghost" aria-label={`查看方案：${item.name}`} onClick={event=>{if(scope.active&&query.getSnapshot().success===success){focusReturn.capture(event.currentTarget);setTarget(item.id);}}}>查看</button></td></tr>)}</tbody>
      </table>
      {result&&!result.items.length&&<div className="empty" role="status">{result.total?'此页没有数据，请返回有效页。':'没有匹配的数据'}</div>}
    </div><p className="hint spaced pc-scheme-note">已有条码保持原值，不在此处重新生成。未提供的方案长度及适用范围不可从名称推算。</p></section>
    {paginated&&<DictionaryPagination scope={scope} page={displayed.page} pageSize={displayed.pageSize} total={result?.total??null} busy={busy} onPage={page=>run({...displayed,page})} onPageSize={pageSize=>run({...displayed,page:1,pageSize})}/>}
    {target&&<BarcodeSchemeView key={target} scope={scope} reader={props.reader} onAccessFailure={onAccessFailure} schemeId={target} close={close}/>} 
  </div>;
}
