import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DocumentResponsibleStaffCapability, DocumentResponsibleStaffPage, DocumentResponsibleStaffQuery } from '../application/contracts.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { DemoSingleSelectAction } from '../demo-controls/single-select-action.tsx';
import { UIButton } from './standard-controls.tsx';

export interface DocumentResponsibleSelection { readonly id: string; readonly name: string | null }
export interface DocumentIdentityPresentation {
  readonly creatorName?: string | null; readonly responsible?: DocumentResponsibleSelection | null;
  readonly capability?: DocumentResponsibleStaffCapability;
  readonly onAccessFailure?: (kind: 'unauthenticated' | 'forbidden') => void;
}
const empty = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
/** Original creator is display-only. Responsibility is an independent, explicit
 * staff UUID choice; omission and unknown never become a clear/default actor. */
export function DocumentResponsibilityFields(props: {
  readonly scope?: ReadScope; readonly saved: boolean; readonly creatorName?: string | null;
  readonly value: DocumentResponsibleSelection | null; readonly capability?: DocumentResponsibleStaffCapability;
  readonly readOnly?: boolean; readonly valueClassName?: string;
  readonly onChange?: (value: { readonly id: string; readonly name: string }) => void;
  readonly onAccessFailure?: (kind: 'unauthenticated' | 'forbidden') => void;
}) {
  const [binding, setBinding] = useState<{ scope: ReadScope; capability: DocumentResponsibleStaffCapability; query: LatestQuery<DocumentResponsibleStaffQuery, DocumentResponsibleStaffPage> } | null>(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  useEffect(() => {
    const scope = props.scope;
    if (!props.capability || !scope?.active) { setBinding(null); return; }
    const capability = props.capability, query = new LatestQuery<DocumentResponsibleStaffQuery, DocumentResponsibleStaffPage>({ scope, execute: async read => {
      const page = await capability.readCandidates(read);
      if (page.page !== read.parameters.page || page.pageSize !== 20 || !Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.items)
        || page.items.length !== Math.min(20, Math.max(0, page.total - (page.page - 1) * 20))) throw new TypeError('Invalid responsible staff page.');
      const seen = new Set<string>();
      for (const row of page.items) { entityId('staff', row.id); if (typeof row.name !== 'string' || seen.has(row.id)) throw new TypeError('Invalid responsible staff candidate.'); seen.add(row.id); }
      return page;
    } });
    setBinding({ scope, capability, query }); return () => query.dispose();
  }, [props.scope, props.capability]);
  const query = binding && binding.scope === props.scope && binding.capability === props.capability ? binding.query : null;
  const currentQuery = useRef(query); currentQuery.current = query;
  const state = useSyncExternalStore(query?.subscribe ?? noSubscribe, query?.getSnapshot ?? (() => empty), query?.getSnapshot ?? (() => empty));
  const editable = props.scope?.active === true && !props.readOnly && !!query && !!props.onChange;
  useEffect(() => { if (!editable) { setOpen(false); query?.cancel(); } }, [editable, query]);
  useEffect(() => { if (props.scope?.active && state.error instanceof HttpQueryError && (state.error.kind === 'unauthenticated' || state.error.kind === 'forbidden')) props.onAccessFailure?.(state.error.kind); }, [state.error, props.scope, props.onAccessFailure]);
  const run = (text = search, page = 1) => { if (editable && props.scope?.active && currentQuery.current === query) void query?.run({ search: text, page, pageSize: 20 }); };
  const data = state.phase === 'success' && state.success?.parameters.search === search ? state.success.data : null;
  const options = new Map((data?.items ?? []).map(row => [row.id, { value: row.id, label: row.name }]));
  if (props.value && !options.has(props.value.id)) options.set(props.value.id, { value: props.value.id, label: props.value.name ?? '未知' });
  const valueClass = props.valueClassName ?? 'transfer-read-value';
  return <><div className="tc-gold-field"><span>创建者</span><span className={valueClass}>{props.saved ? props.creatorName || '未知' : '保存后记录'}</span></div>
    <div className="tc-gold-field"><span>负责人</span>{props.readOnly || !props.capability || !props.onChange
      ? <span className={valueClass} title={!props.readOnly && !props.capability ? '当前账号暂不能选择负责人' : undefined}>{props.value?.name ?? '未知'}</span>
      : <DemoSingleSelectAction presentation="flat" popupWidth={300} label="选择负责人" placeholder="请选择负责人" value={props.value?.id ?? ''} options={[...options.values()]} disabled={!editable} open={open && editable} loading={state.phase === 'loading'}
        onOpenChange={next => { if (!editable || !props.scope?.active || currentQuery.current !== query) return; if (next) { setOpen(true); run(); } else queueMicrotask(() => { if (currentQuery.current === query) { setOpen(false); query?.cancel(); } }); }}
        onSearch={text => { if (open && editable) { setSearch(text); run(text); } }}
        onChange={id => { const row = data?.items.find(row => row.id === id); if (!editable || !props.scope?.active || currentQuery.current !== query || !open || !row) return; props.onChange?.(row); setOpen(false); query?.cancel(); }}
        dropdownRender={menu => <>{state.phase === 'error' ? <p role="alert">员工读取失败。<UIButton onClick={() => run()}>重试员工</UIButton></p> : menu}{data && data.total > 20 && <footer><UIButton disabled={data.page <= 1} onClick={() => run(search, data.page - 1)}>上一页员工</UIButton><span>第 {data.page} 页</span><UIButton disabled={data.page * 20 >= data.total} onClick={() => run(search, data.page + 1)}>下一页员工</UIButton></footer>}</>} />}</div></>;
}
