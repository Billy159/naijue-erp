import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import type { DictionaryBarcodeScheme, DictionaryListQuery, DictionarySchemeQuery } from '../../../../src/product-settings/size-groups/contracts.ts';
import type { CataloguePageOptions } from './entry.tsx';
import { Head, Pager, ReadNotice, SourceModal, useRead } from './source-controls.tsx';

const initial: DictionaryListQuery = { search: '', page: 1, pageSize: 20 };
function Schemes({ options }: { options: CataloguePageOptions }) {
  const execute = useMemo(() => (read: QueryRead<DictionaryListQuery>) => options.dictionaries.readBarcodeSchemes(read), [options]);
  const { query, snapshot } = useRead(options, execute, initial);
  const [selected, setSelected] = useState<string | null>(null);
  const data = snapshot.success?.data, parameters = snapshot.request?.parameters ?? initial;
  return <div className="pc-workbench pc-schemes-page"><Head title="条码方案" /><section className="pc-schemes"><div className="table-scroll"><table className="pc-data-table"><thead><tr>{['方案名称', '条码类型', '编码规则', '总长度', '状态', '适用范围', '操作'].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{data?.items.map(scheme => <tr key={scheme.id}><td>{scheme.name}</td><td>{scheme.barcodeType}</td><td>{scheme.ruleDescription}</td><td>{scheme.codeLength === null ? '未知' : `${scheme.codeLength} 位`}</td><td>{scheme.status === 'CURRENT' ? '当前' : '历史'}</td><td>{scheme.applicability ?? '未知'}</td><td><button className="btn ghost" aria-label={`查看方案：${scheme.name}`} onClick={() => setSelected(scheme.id)}>查看</button></td></tr>)}</tbody></table></div>
    {snapshot.phase === 'success' && data?.total === 0 && <div className="empty">没有匹配的数据</div>}
    {data && data.total > data.pageSize && <Pager options={options} disabled={snapshot.phase !== 'success'} page={data.page} pageSize={data.pageSize} total={data.total} change={(page, pageSize) => void query.run({ ...parameters, page, pageSize })} />}
    <p className="hint spaced pc-scheme-note">历史商品使用已确认的条码记录，商品段采用 T+ 存货默认条码完整原值。历史数据已定稿，不自动重新生成条码。2026 方案用于新增商品。</p>
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => void query.run({ ...parameters })} cancel={() => query.cancel()} />
  </section>{selected && <SchemeDetail key={selected} options={options} id={selected} close={() => setSelected(null)} />}</div>;
}
/** Exported for the original product barcode consumer: the same lazy, read-only
 * detail, not a second scheme DTO or an executable rule interpreter. */
type DetailOptions = Pick<CataloguePageOptions, 'scope' | 'onAccessFailure' | 'dictionaries'>;
export function SchemeDetail({ options, id, close }: { options: DetailOptions; id: string; close: () => void }) {
  const execute = useMemo(() => (read: QueryRead<DictionarySchemeQuery>) => options.dictionaries.readBarcodeScheme(read), [options]);
  const { query, snapshot } = useRead<DictionarySchemeQuery, DictionaryBarcodeScheme | null>(options, execute, { schemeId: id });
  const scheme = snapshot.success?.data;
  return <SourceModal title="查看条码方案" close={close} footer={<button className="btn" onClick={close}>关闭</button>}>
    {scheme && <dl className="pc-rule"><dt>方案名称</dt><dd>{scheme.name}</dd><dt>条码类型</dt><dd>{scheme.barcodeType}</dd><dt>编码规则</dt><dd>{scheme.ruleDescription}</dd><dt>总长度</dt><dd>{scheme.codeLength === null ? '未知' : `${scheme.codeLength} 位`}</dd></dl>}
    {snapshot.phase === 'success' && !scheme && <div className="empty">方案不存在</div>}
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => void query.run({ schemeId: id })} cancel={() => query.cancel()} />
  </SourceModal>;
}
export function mount(host: HTMLElement, options: CataloguePageOptions) { const root = createRoot(host); root.render(<Schemes options={options} />); return () => root.unmount(); }
export function mountDetail(host: HTMLElement, id: string, options: DetailOptions, close: () => void) { const root = createRoot(host); root.render(<SchemeDetail id={id} options={options} close={close} />); return () => root.unmount(); }
