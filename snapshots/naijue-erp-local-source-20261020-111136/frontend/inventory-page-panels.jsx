import React, {useRef, useState} from 'react';
import {Button, DatePicker, Drawer, Empty, Select, Table} from '@arco-design/web-react';
import {LoadState, ProductPicker, usePageRequest, usePageServices} from './page-foundation.jsx';
import {correctionChoices} from './inventory-correction-service.mjs';
import {originalMemberKey, sourceCaption} from './inventory-matrix-view.mjs';

const value = item => item == null || item === '' ? '未知' : String(item);
const dimension = (member, name) => value(member.original?.[name]?.sourceName ?? member.original?.[name]?.name);
const memberLabel = member => [member.productCode, dimension(member, 'color'), dimension(member, 'fit'), dimension(member, 'size'), member.unit || '单位待核实'].filter(Boolean).join(' · ');
export function pickerOptions(result) {
  return result.items.map((row, index) => ({value: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.productIds[index]) ? 'product:' + result.productIds[index] : row.code,
    label: row.code + (row.name ? ' · ' + row.name : '')}));
}
function Panel({title, children, onClose, footer = null, width = 760}) {
  return <Drawer visible className="erp-foundation-popup erp-inventory-detail" title={title} width={`min(${width}px, calc(100vw - 24px))`}
    footer={footer} getPopupContainer={() => document.body} unmountOnExit onCancel={onClose}>{children}</Drawer>;
}
function Facts({items}) {
  return <dl className="erp-inventory-facts">{items.map(([label, fact]) => <div key={label}><dt>{label}</dt><dd>{value(fact)}</dd></div>)}</dl>;
}
export function MemberPanel({members, onClose, onLedger, onProduct, onCorrect, canCorrect}) {
  const columns = [
    {title: '仓库', render: (_, member) => value(member.warehouseName || member.warehouseId), width: 180},
    {title: '原规格', render: (_, member) => memberLabel(member), width: 230},
    {title: '原 SKU', dataIndex: 'skuId', width: 270},
    {title: '单位', render: (_, member) => member.unit || '单位待核实', width: 90},
    {title: '数量', render: (_, member) => value(member.quantity), width: 100},
    {title: '操作', width: 180, render: (_, member) => <div className="erp-inventory-panel-actions">
      <Button type="text" disabled={!member.unit} onClick={() => onLedger(member)}>流水</Button>
      <Button type="text" onClick={() => onProduct(member)}>资料</Button>
      {canCorrect && <Button type="text" disabled={!member.unit} onClick={() => onCorrect(member)}>校正</Button>}
    </div>},
  ];
  return <Panel title="选择原库存单元" onClose={onClose}>
    <p className="erp-inventory-detail-caption">当前显示数量包含 {members.length} 个原仓库／SKU／单位单元。分别查看来源或校正，不改写展示组身份。</p>
    {members.some(member => !member.unit) && <p className="erp-inventory-unresolved">单位未知的原 SKU 保留展示；按单位的流水与校正暂不可用。</p>}
    <Table rowKey={originalMemberKey} columns={columns} data={members} size="small" pagination={{pageSize: 20}} scroll={{x: 1000}}/>
  </Panel>;
}
export function LedgerPanel({scope, member, source, page = 1, filters = {}, onState, onSource, onClose, onCorrect, canCorrect}) {
  const services = usePageServices(), context = services.getContext();
  const [dateDraft, setDateDraft] = useState(filters.start || filters.end ? [filters.start || '', filters.end || ''] : []);
  const requestKey = JSON.stringify(['inventory-ledger', scope, originalMemberKey(member), page, filters]);
  const read = usePageRequest(requestKey, async () => {
    const result = await context.ledger({w: member.warehouseId, skuId: member.skuId, unit: member.unit}, page, filters);
    if (result.cell?.basis?.runId && source?.runId && result.cell.basis.runId !== source.runId) throw new Error('库存来源批次已变化，请刷新库存后再查看');
    return result;
  });
  const data = read.requestKey === requestKey ? read.data : null;
  const columns = [
    {title: '业务日期／时间', render: (_, row) => value(row.businessDay || row.time), width: 180},
    {title: '类型', dataIndex: 'type', width: 120},
    {title: '来源', render: (_, row) => row.sourceTarget?.available ? <Button type="text" onClick={() => onSource(row)}>{value(row.source)}</Button> : value(row.source), width: 200},
    {title: '变动', render: (_, row) => value(row.delta), align: 'right', width: 90},
    {title: '变动前', render: (_, row) => value(row.before), align: 'right', width: 90},
    {title: '变动后', render: (_, row) => value(row.after), align: 'right', width: 90},
    {title: '人员', render: (_, row) => value(row.user), width: 180},
  ];
  return <Panel title="原规格库存流水" onClose={onClose} footer={canCorrect && <Button disabled={!member.unit} onClick={() => onCorrect(member)}>校正此原库存单元</Button>}>
    <Facts items={[["仓库", member.warehouseName || member.warehouseId], ["商品／原规格", memberLabel(member)], ["原 SKU", member.skuId], ["查询单元账面", `${value(member.quantity)} ${member.unit || '单位待核实'}`]]}/>
    <p className="erp-inventory-detail-caption">{sourceCaption(source)}</p>
    <div className="erp-inventory-ledger-filters"><DatePicker.RangePicker value={dateDraft} onChange={setDateDraft} format="YYYY-MM-DD" allowClear/>
      <Button onClick={() => onState({page: 1, filters: {start: dateDraft?.[0] || '', end: dateDraft?.[1] || ''}})}>查询</Button>
      <Button onClick={() => {setDateDraft([]); onState({page: 1, filters: {}});}}>重置</Button></div>
    <LoadState loading={read.loading} error={read.error} retry={read.retry}>{data && <>
      <p>当前账面：{value(data.cell?.quantity)} {member.unit} · 共 {data.total} 条流水。缺失人员或时间保持未知。</p>
      <Table rowKey="id" columns={columns} data={data.items} size="small" scroll={{x: 1050}}
        pagination={{current: page, pageSize: data.size, total: data.total, showTotal: true, onChange: next => onState({page: next})}}
        noDataElement={<Empty description="当前范围没有可回读的库存流水"/>}/>
    </>}</LoadState>
  </Panel>;
}
export function SourcePanel({scope, entry, onClose, onBack}) {
  const services = usePageServices(), context = services.getContext(), [raw, setRaw] = useState(false);
  const requestKey = JSON.stringify(['inventory-source', scope, entry.sourceTarget]);
  const read = usePageRequest(requestKey, () => context.ledgerSource(entry));
  const data = read.requestKey === requestKey ? read.data : null;
  const document = data?.document, body = document?.body || {}, lines = Array.isArray(body.lines) ? body.lines : [];
  const keys = [...new Set(lines.flatMap(line => Object.keys(line)))].filter(key => ['source_id','product_id','variant_id','warehouse_id','quantity','source_quantity','unit','price','amount'].includes(key));
  return <Panel title="库存来源修订" onClose={onClose} footer={<Button onClick={onBack}>返回流水</Button>}>
    <LoadState loading={read.loading} error={read.error} retry={read.retry}>{document && <>
      <Facts items={[["单据身份", document.documentId], ["修订号", document.revision], ["单号", document.number ?? body.number],
        ["业务类型", document.documentType ?? body.type], ["人员", document.actorId], ["记录时间", document.createdAt]]}/>
      {lines.length > 0 && <Table rowKey="__sourceKey" columns={keys.map(key => ({title: key, width: 160, render: (_, row) => value(row[key])}))}
        data={lines.map((line,index)=>({...line,__sourceKey:String(index)}))} size="small" pagination={{pageSize: 20}} scroll={{x: 'max-content'}}/>}
      <Button type="text" onClick={() => setRaw(previous => !previous)}>{raw ? '收起' : '查看'}原始来源凭据</Button>
      {raw && <pre className="erp-inventory-source-evidence">{JSON.stringify(data, null, 2)}</pre>}
    </>}</LoadState>
  </Panel>;
}
export function ProductPanel({scope, identity, catalogVersion, onClose}) {
  const services = usePageServices(), context = services.getContext();
  const requestKey = JSON.stringify(['inventory-product-detail', scope, identity.productId, identity.skuId]);
  const read = usePageRequest(requestKey, async()=>{const data=await context.productDetail(identity);
    if(catalogVersion&&data.catalogVersion!==catalogVersion)throw new Error('商品资料版本已变化，请刷新库存后查看');return data;});
  const data = read.requestKey === requestKey ? read.data : null;
  const product = data?.product, skus = data?.catalog?.skus || [];
  const barcodes = new Map();
  for(const row of [...(data?.catalog?.sourceBarcodes||[]),...(data?.catalog?.barcodes||[])]){
    const sku=row.skuId??row.sku_id??row.variant_id,code=row.barcode??row.code;
    if(sku&&typeof code==='string'){const values=barcodes.get(sku)||new Set();values.add(code);barcodes.set(sku,values);}
  }
  const columns = [
    {title: '原 SKU', dataIndex: 'id', width: 280},
    {title: '原颜色', render: (_, sku) => value(sku.options?.COLOR?.sourceName || sku.options?.COLOR?.name), width: 110},
    {title: '版型', render: (_, sku) => value(sku.fit_id ?? sku.fitId), width: 90},
    {title: '原尺码', render: (_, sku) => value(sku.options?.SIZE?.sourceName || sku.options?.SIZE?.name), width: 120},
    {title: '原尺码码', render: (_, sku) => value(sku.options?.SIZE?.sourceCode || sku.options?.SIZE?.code), width: 120},
    {title: '已登记主码／原码', render: (_, sku) => [...(barcodes.get(sku.id)||[])].join(' / ') || '未登记', width: 190},
  ];
  return <Panel title="商品与原规格资料" onClose={onClose}>
    <LoadState loading={read.loading} error={read.error} retry={read.retry}>{data && <>
      <Facts items={[["款号", product?.sourceProductId || product?.styleNumber || identity.productCode], ["商品名称", product?.name || identity.productName],
        ["商品身份", identity.productId], ["资料版本", data.catalogVersion]]}/>
      {product?.images?.length > 0 && <div className="erp-inventory-product-images">{product.images.map((image, index) => {
        const url = typeof image === 'string' ? image : image.url;
        return url ? <figure key={url + index}><img src={url} alt={typeof image === 'object' ? image.color || '商品图片' : '商品图片'} loading="lazy" decoding="async"/>
          <figcaption>{typeof image === 'object' ? image.color || '' : ''}</figcaption></figure> : null;
      })}</div>}
      <Table rowKey="id" columns={columns} data={skus} size="small" pagination={{pageSize: 20}} scroll={{x: 800}} noDataElement={<Empty description="没有已回读的原规格资料"/>}/>
      {data.unresolved?.length > 0 && <p className="erp-inventory-unresolved">部分原规格身份仍待核实。</p>}
    </>}</LoadState>
  </Panel>;
}
export function CorrectionTargetPanel({scope, warehouses, onClose, onCorrect}) {
  const services = usePageServices(), context = services.getContext();
  const [selected, setSelected] = useState([]), [labels, setLabels] = useState([]), [skuId, setSkuId] = useState(''), [warehouseId, setWarehouseId] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const options = useRef(new Map());
  const requestKey=JSON.stringify(['correction-target', scope, selected]);
  const read = usePageRequest(requestKey, () => context.productReader.ensureDetails(selected[0]?.startsWith('product:')
    ? {productIds: [selected[0].slice(8)]} : {codes: selected}), [], {enabled: selected.length === 1});
  const data=read.requestKey===requestKey?read.data:null;
  const choices = data ? correctionChoices(data.identities, {items: warehouses}) : {warehouses: warehouses.filter(row => row.enabled !== false), skus: []};
  async function continueToCorrection() {
    setBusy(true); setError(null);
    try {await onCorrect({warehouseId, skuId, productId: choices.skus.find(row => row.id === skuId)?.productId, unit: null});}
    catch (failure) {setError(failure);} finally {setBusy(false);}
  }
  return <Panel title="选择需要校正的原库存单元" onClose={onClose} footer={<Button type="primary" disabled={!skuId || !warehouseId || busy} loading={busy} onClick={continueToCorrection}>核对当前账面</Button>}>
    <p>按商品搜索后选择原 SKU 和仓库；实际单位、账面与版本由原校正服务再次核对。</p>
    <ProductPicker value={selected} selectedOptions={labels} cacheKey={'correction-products:' + scope}
      loadPage={async ({q, page, size, signal}) => {
        const result = await context.productReader.list({filters: {q}, page, size, purpose: 'picker'});
        if (signal.aborted) throw Object.assign(new Error('商品选择已取消'), {stale: true});
        const items = pickerOptions(result); options.current = new Map(items.map(item => [item.value, item])); return {items, total: result.total};
      }} onChange={next => {const one = next.slice(-1); setSelected(one); setLabels(one.map(id => options.current.get(id) || {value: id, label: '已选商品'})); setSkuId('');}}/>
    <LoadState loading={read.loading} error={read.error || error} retry={read.retry}>
      <div className="erp-inventory-target-fields"><Select aria-label="校正原 SKU" value={skuId || undefined} options={choices.skus.map(row => ({value: row.id, label: row.label}))} allowSearch placeholder="选择原规格" onChange={setSkuId}/>
        <Select aria-label="校正仓库" value={warehouseId || undefined} options={choices.warehouses.map(row => ({value: row.id, label: row.name}))} allowSearch placeholder="选择仓库" onChange={setWarehouseId}/></div>
    </LoadState>
  </Panel>;
}
export function OutputPanel({job, onChange, onRun, onClose, frameRef}) {
  return <Panel title={job.kind === 'print' ? '库存打印预览' : '导出库存'} width={1100} onClose={onClose}
    footer={<><Button onClick={onClose}>{job.busy ? '取消输出' : '关闭'}</Button>{job.html
      ? <Button type="primary" onClick={() => {frameRef.current?.contentWindow?.focus(); frameRef.current?.contentWindow?.print();}}>打印</Button>
      : <Button type="primary" loading={job.busy} disabled={job.busy} onClick={onRun}>{job.kind === 'print' ? '生成全部结果预览' : '导出全部结果'}</Button>}</>}>
    <p>输出上一次成功查询的全部匹配结果，不受商品分页和当前折叠影响；读取范围变化或取消时停止。</p>
    {job.kind === 'export' && <Select aria-label="导出模板" disabled={job.busy} value={job.template || 'matrix'} onChange={template => onChange({template})}
      options={[{value: 'matrix', label: '默认库存矩阵（附原数量身份）'}, {value: 'yintai', label: '银泰库存模板'}]}/>}
    <LoadState loading={job.busy} error={job.error} retry={onRun}>{job.html ? <iframe ref={frameRef} className="erp-inventory-print-frame" title="全部匹配库存矩阵打印预览" srcDoc={job.html}/> : null}</LoadState>
  </Panel>;
}
