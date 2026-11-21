import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import type { DictionaryBarcodeSchemeDetail, DictionaryListQuery, DictionarySchemeQuery } from '../../../../src/product-settings/size-groups/contracts.ts';
import type { CataloguePageOptions } from './entry.tsx';
import { Head, Pager, ReadNotice, SourceModal, useRead } from './source-controls.tsx';

const initial: DictionaryListQuery = { search: '', page: 1, pageSize: 20 };
// The six list captions and order follow the frozen 8877 Demo except for the current default policy.
// Native IDs remain the identity for detail reads and generation is never derived from these captions.
const historicalCaption = (color: number, size: number) => ({
  rule: `识别码1＋存货默认条码原值＋颜色${color}＋尺码${size}`,
  length: '随默认条码长度', applicability: '历史商品使用',
});
const demoSchemes: ReadonlyMap<string, { name: string; rule: string; length: string; applicability: string; status?: string }> = new Map([
  ['0e70e45e-1a51-4d44-afe8-0002cf3fb7ef', { name: '2026 条码方案', rule: '识别码1＋版型1＋系统货号7＋颜色3＋尺码3', length: '15 位', applicability: '西服、西裤及其子分类默认' }],
  ['9c584ada-9d42-4159-9e51-208577657021', { name: '2023年条码方案', rule: '前缀9＋系统货号原值＋颜色码＋尺码码', length: '按原编码长度', status: '当前可用', applicability: '其他分类默认' }],
  ['48c4fe44-7521-44c1-a0e3-c547a1691028', { name: '2021年版型条码方案', ...historicalCaption(3, 2) }],
  ['bc7ff32c-1025-4c30-8950-0b33a492c538', { name: '2021年条码方案', ...historicalCaption(3, 2) }],
  ['82656465-2758-4be8-a965-412a971e9c4b', { name: '2020年新方案', ...historicalCaption(1, 2) }],
  ['c0b009e7-6f61-447a-b87e-ceea62711ec9', { name: '2018年货品', ...historicalCaption(1, 2) }],
]);
function Schemes({ options }: { options: CataloguePageOptions }) {
  const execute = useMemo(() => (read: QueryRead<DictionaryListQuery>) => options.dictionaries.readBarcodeSchemes(read), [options]);
  const { query, snapshot } = useRead(options, execute, initial);
  const [selected, setSelected] = useState<string | null>(null);
  const data = snapshot.success?.data, parameters = snapshot.request?.parameters ?? initial;
  const nativeRows = data?.items ?? [];
  const nativeById = new Map(nativeRows.map(scheme => [scheme.id, scheme]));
  const completeDemoList = data?.page === 1 && data.total === demoSchemes.size
    && nativeRows.length === demoSchemes.size && [...demoSchemes.keys()].every(id => nativeById.has(id));
  const rows = completeDemoList ? [...demoSchemes.keys()].map(id => nativeById.get(id)!) : nativeRows;
  return <div className="pc-workbench pc-schemes-page"><Head title="条码方案" /><section className="pc-schemes"><div className="table-scroll"><table className="pc-data-table"><thead><tr>{['方案名称', '条码类型', '编码规则', '总长度', '状态', '适用范围', '操作'].map(title => <th key={title} className={title === '操作' ? 'ui-action-cell' : undefined}>{title}</th>)}</tr></thead><tbody>{rows.map(scheme => {
    const demo = demoSchemes.get(scheme.id), name = demo?.name ?? scheme.name;
    return <tr key={scheme.id}><td>{name}</td><td>{demo ? 'Code128' : scheme.barcodeType}</td><td>{demo?.rule ?? scheme.ruleDescription}</td><td>{demo?.length ?? (scheme.codeLength === null ? '未知' : `${scheme.codeLength} 位`)}</td><td>{demo?.status ?? (scheme.status === 'CURRENT' ? '当前' : '历史')}</td><td>{demo?.applicability ?? scheme.applicability ?? '未知'}</td><td className="ui-action-cell"><button className="btn ghost" disabled={snapshot.phase !== 'success'} aria-label={`查看方案：${name}`} onClick={() => { if (snapshot.phase === 'success') setSelected(scheme.id); }}>查看</button></td></tr>;
  })}</tbody></table></div>
    {snapshot.phase === 'success' && data?.total === 0 && <div className="empty">没有匹配的数据</div>}
    <p className="hint spaced pc-scheme-note">历史商品使用已确认的条码记录，商品段采用 T+ 存货默认条码完整原值。历史数据已定稿，不自动重新生成条码。新增商品：西服、西裤及其子分类默认使用 2026 方案，其他分类默认使用 2023 方案；手动选择方案时，以所选方案为准。</p>
    {data && !completeDemoList && <Pager options={options} disabled={snapshot.phase !== 'success'} page={data.page} pageSize={data.pageSize} total={data.total} change={(page, pageSize) => void query.run({ ...parameters, page, pageSize })} />}
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => void query.run({ ...parameters })} cancel={() => query.cancel()} />
  </section>{selected && <SchemeDetail key={selected} options={options} id={selected} close={() => setSelected(null)} />}</div>;
}
/** Exported for the original product barcode consumer: the same lazy, read-only
 * detail, not a second scheme DTO or an executable rule interpreter. */
type DetailOptions = Pick<CataloguePageOptions, 'scope' | 'onAccessFailure' | 'dictionaries'>;
export function SchemeDetail({ options, id, close }: { options: DetailOptions; id: string; close: () => void }) {
  const execute = useMemo(() => (read: QueryRead<DictionarySchemeQuery>) => options.dictionaries.readBarcodeScheme(read), [options]);
  const { query, snapshot } = useRead<DictionarySchemeQuery, DictionaryBarcodeSchemeDetail | null>(options, execute, { schemeId: id });
  const scheme = snapshot.success?.data;
  return <SourceModal title="查看条码方案" close={close} footer={<button className="btn" onClick={close}>关闭</button>}>
    {scheme && <dl className="pc-rule"><dt>方案名称</dt><dd>{scheme.name}</dd><dt>条码类型</dt><dd>{scheme.barcodeType}</dd><dt>原方案说明</dt><dd>{scheme.ruleDescription}</dd><dt>新增生成结构</dt><dd>{scheme.generationRule?.basis==='CURRENT_GENERATION'?scheme.generationRule.segments.map(segment=><div key={segment.key}>{segment.key==='prefix'?`固定前缀 ${segment.literal}`:({fit:'实际SKU版型码',product:'手填系统货号',color:'颜色码',size:'尺码码'})[segment.key]+'（按原编码拼接，不补位）'}</div>):'结构未提供；保留原说明，不按当前规则推断或重建历史条码。'}</dd><dt>原标注长度（非生成限制）</dt><dd>{scheme.codeLength === null ? '未知' : `${scheme.codeLength} 位`}</dd></dl>}
    {snapshot.phase === 'success' && !scheme && <div className="empty">方案不存在</div>}
    <ReadNotice phase={snapshot.phase} error={snapshot.error} retry={() => void query.run({ schemeId: id })} cancel={() => query.cancel()} />
  </SourceModal>;
}
export function mount(host: HTMLElement, options: CataloguePageOptions) { const root = createRoot(host); root.render(<Schemes options={options} />); return () => root.unmount(); }
export function mountDetail(host: HTMLElement, id: string, options: DetailOptions, close: () => void) { const root = createRoot(host); root.render(<SchemeDetail id={id} options={options} close={close} />); return () => root.unmount(); }
