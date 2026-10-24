import type { InventoryFilter, InventoryOutputData, InventoryOutputReader, InventoryOutputChunk, InventoryProduct, StockTotal } from './contracts.ts';
import type { InventoryDisplaySettings } from './inventory-matrix.tsx';
import { projectInventoryColors } from './display-projection.ts';
import { assertQuantity } from './model.ts';
import { inventoryProductResponse } from '../transport/response-validation.ts';
import { HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { INVENTORY_OUTPUT_FRAME_MAX_BYTES } from '../../../../packages/application/src/inventory-query-contracts.ts';
import { parseInventoryOutputQuery } from '../../../../packages/application/src/inventory-query-validation.ts';

const invalid = (): never => { throw new HttpQueryError('malformed-response', 'INVALID_INVENTORY_OUTPUT'); };
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function count(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
function total(value: unknown): StockTotal {
  const row = record(value, ['knownQuantity', 'completeness', 'unknownCells']);
  if (typeof row.knownQuantity !== 'string' || row.knownQuantity.length > 100 || row.completeness !== 'complete' || row.unknownCells !== 0) return invalid();
  try { assertQuantity(row.knownQuantity); } catch { return invalid(); }
  return row as unknown as StockTotal;
}
function wait<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new HttpQueryError('aborted', 'OUTPUT_ABORTED')); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}
/** One operation-local cooperative budget; it never changes a read's facts. */
function outputCheckpoint(signal:AbortSignal){
  let started=performance.now();
  return async(force=false)=>{
    if(signal.aborted)throw new HttpQueryError('aborted','OUTPUT_ABORTED');
    if(force||performance.now()-started>=8){await wait(new Promise<void>(resolve=>setTimeout(resolve,0)),signal);started=performance.now();if(signal.aborted)throw new HttpQueryError('aborted','OUTPUT_ABORTED');}
  };
}
/** One authenticated full-filter read. No page loop, aggregate-as-row substitute,
 * global cache or JSON whole-response byte cap. Only committed, complete EOF escapes. */
export function createInventoryOutputReader(options: HttpQueryOptions): InventoryOutputReader {
  const origin = new URL(options.origin);
  if (typeof options.fetch !== 'function' || !['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.basePath !== 'string' || options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath)) throw new TypeError('Explicit same-origin inventory output transport required.');
  const url = `${origin.origin}${options.basePath.replace(/\/$/, '')}/inventory/output/query`;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new TypeError('Invalid output read timeout.');
  async function* streamOutput(read:Parameters<InventoryOutputReader['readOutput']>[0]):AsyncGenerator<InventoryOutputChunk> {
    const filter: InventoryFilter = Object.fromEntries((Object.keys(filterNames) as (keyof InventoryFilter)[]).map(key => [key, read.parameters[key].map(item => ({ id: item.id, label: item.label }))])) as unknown as InventoryFilter;
    let body: string;
    try { parseInventoryOutputQuery({ filter }); body = JSON.stringify({ filter }); }
    catch { throw new HttpQueryError('invalid-request', 'INVALID_INVENTORY_INPUT'); }
    if (new TextEncoder().encode(body).byteLength > 65_536) throw new HttpQueryError('too-large', 'REQUEST_TOO_LARGE');
    const controller = new AbortController(), signal = AbortSignal.any([read.signal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, ended = false;
    let release=()=>{};
    const checkpoint=outputCheckpoint(signal);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const active = () => {
      if (read.signal.aborted) throw new HttpQueryError('aborted', 'OUTPUT_ABORTED');
      if (timedOut || performance.now() >= deadline) { timedOut = true; controller.abort(); throw new HttpQueryError('timeout', 'OUTPUT_TIMEOUT'); }
      if (signal.aborted) throw new HttpQueryError('aborted', 'OUTPUT_ABORTED');
    };
    const cancel = () => { try { void reader?.cancel().catch(() => {}); } catch { /* Preserve the original failure. */ } };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      active();
      const pending = Promise.resolve().then(() => { active(); return options.fetch(url, { method: 'POST', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' }, body, signal }); });
      void pending.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
      const response = await wait(pending, signal); active();
      if (response.redirected || response.type === 'opaqueredirect' || response.url && response.url !== url) { void response.body?.cancel().catch(() => {}); return invalid(); }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        const kinds = { 400: 'invalid-request', 401: 'unauthenticated', 403: 'forbidden', 408: 'aborted', 413: 'too-large', 415: 'invalid-request', 503: 'unavailable' } as const;
        throw new HttpQueryError(kinds[response.status as keyof typeof kinds] ?? 'http', 'INVENTORY_OUTPUT_REJECTED', response.status);
      }
      if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-ndjson' || !response.body) { void response.body?.cancel().catch(() => {}); return invalid(); }
      reader = response.body.getReader();
      let summary: Omit<InventoryOutputData, 'products'> | null = null, complete = false, sum = 0n;
      let emittedProducts=0;const ids = new Set<string>(), skus = new Set<string>();
      release=()=>{ids.clear();skus.clear();};
      let warehouseIds: readonly string[] | null = null;
      const consume = (parts: readonly Uint8Array[], bytes: number):InventoryOutputChunk|undefined => {
        active(); if (complete || !bytes) return invalid();
        const joined = new Uint8Array(bytes); let offset = 0;
        for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
        let value: unknown;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); } catch { return invalid(); }
        const kind = (value as { kind?: unknown } | null)?.kind;
        if (!['summary', 'product', 'complete'].includes(kind as string) || bytes > INVENTORY_OUTPUT_FRAME_MAX_BYTES[kind as keyof typeof INVENTORY_OUTPUT_FRAME_MAX_BYTES]) return invalid();
        if (!summary) {
          const row = record(value, ['kind', 'readReference', 'exactTotalProducts', 'warehouseLabels', 'allMatchesTotal']);
          if (kind !== 'summary' || typeof row.readReference !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(row.readReference) || !Array.isArray(row.warehouseLabels) || row.warehouseLabels.some(label => typeof label !== 'string' || !label.trim())) return invalid();
          const exactTotalProducts = count(row.exactTotalProducts);
          if (filter.products.length && exactTotalProducts > filter.products.length) return invalid();
          summary = { readReference: row.readReference, exactTotalProducts, warehouseLabels: row.warehouseLabels as string[], allMatchesTotal: total(row.allMatchesTotal) }; return {kind:'summary',...summary};
        }
        if (kind === 'product') {
          const row = record(value, ['kind', 'product']);
          let product: InventoryProduct;
          try { product = inventoryProductResponse(row.product, filter, summary.warehouseLabels); } catch { return invalid(); }
          if (ids.has(product.id) || emittedProducts >= summary.exactTotalProducts) return invalid();
          const productSkus = new Set<string>();
          for (const group of product.colorFits) {
            const groupWarehouses = group.rows.map(row => row.warehouse.id);
            if (!warehouseIds) warehouseIds = groupWarehouses;
            if (groupWarehouses.some((id, index) => warehouseIds![index] !== id)) return invalid();
            for (const row of group.rows) for (const cell of Object.values(row.cells)) if (cell.state === 'known') productSkus.add(cell.skuId);
          }
          for (const sku of productSkus) { if (skus.has(sku)) return invalid(); skus.add(sku); }
          ids.add(product.id); emittedProducts++; sum += BigInt(product.total.knownQuantity); return {kind:'product',product};
        }
        const row = record(value, ['kind', 'readReference', 'exactTotalProducts', 'emittedProducts', 'allMatchesTotal']);
        if (kind !== 'complete' || row.readReference !== summary.readReference || count(row.exactTotalProducts) !== summary.exactTotalProducts || count(row.emittedProducts) !== emittedProducts || emittedProducts !== summary.exactTotalProducts
          || total(row.allMatchesTotal).knownQuantity !== summary.allMatchesTotal.knownQuantity || sum.toString() !== summary.allMatchesTotal.knownQuantity) return invalid();
        complete = true;
      };
      let parts: Uint8Array[] = [], bytes = 0;
      for (;;) {
        const part = await wait(reader.read(), signal); active();
        if (part.done) { ended = true; break; }
        for (let start = 0; start < part.value.byteLength;) {
          const newline = part.value.indexOf(10, start), end = newline === -1 ? part.value.byteLength : newline;
          const fragment = part.value.subarray(start, end); bytes += fragment.byteLength;
          if (bytes > INVENTORY_OUTPUT_FRAME_MAX_BYTES.product) throw new HttpQueryError('too-large', 'INVENTORY_OUTPUT_FRAME_TOO_LARGE');
          if (fragment.byteLength) parts.push(fragment);
          if (newline === -1) break;
          const chunk=consume(parts, bytes); parts = []; bytes = 0; start = newline + 1;if(chunk)yield chunk;
          await checkpoint();active();
        }
      }
      if(bytes){const chunk=consume(parts,bytes);if(chunk)yield chunk;}
      active(); if (!summary || !complete) return invalid();
      yield {kind:'complete',...(summary as Omit<InventoryOutputData,'products'>)};
    } catch (error) { active(); if (error instanceof HttpQueryError) throw error; throw new HttpQueryError('network', 'INVENTORY_OUTPUT_FAILED'); }
    finally { release();clearTimeout(timer); signal.removeEventListener('abort', cancel); if (!ended) cancel(); try { reader?.releaseLock(); } catch { /* A failed stream cannot retain its consumer. */ } }
  }
  return Object.freeze({streamOutput,async readOutput(read):Promise<InventoryOutputData>{
    let summary:Omit<InventoryOutputData,'products'>|null=null;const products:InventoryProduct[]=[];let committed=false;
    try{for await(const chunk of streamOutput(read)){if(chunk.kind==='summary'){const {kind:_,...data}=chunk;summary=data;}else if(chunk.kind==='product')products.push(chunk.product);else committed=true;}
      if(!summary||!committed)return invalid();return Object.freeze({...summary,products:Object.freeze(products)});
    }finally{if(!committed)products.length=0;}
  }} satisfies InventoryOutputReader);
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const filterNames = { products: '商品', categories: '商品分类', warehouses: '仓库', suppliers: '供应商', fits: '版型', seasons: '季节' };
export function inventoryOutputScope(filter: InventoryFilter, data: Pick<InventoryOutputData,'warehouseLabels'>): string {
  return (Object.keys(filterNames) as (keyof InventoryFilter)[]).map(key => {
    const labels = key === 'warehouses' ? data.warehouseLabels : filter[key].map(item => item.label);
    return `${filterNames[key]}：${labels.length ? labels.join('、') : key === 'warehouses' ? '无可用仓库' : '全部'}`;
  }).join(' · ');
}
function sections(data: InventoryOutputData): readonly (readonly InventoryProduct[])[] {
  const groups = new Map<string, InventoryProduct[]>();
  for (const product of data.products) {
    const key = JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
    const group = groups.get(key);
    if (group) group.push(product); else groups.set(key, [product]);
  }
  return [...groups.values()];
}
const colors = (product: InventoryProduct, settings: InventoryDisplaySettings) => settings.fit ? product.colorFits : projectInventoryColors(product);

/** Frozen inventory-matrix-experiment.js report(): native full-scope rows, not a DOM/page export. */
function* workbookRows(data:InventoryOutputData,filter:InventoryFilter,settings:InventoryDisplaySettings):Generator<readonly string[]>{
  yield ['奈爵服饰 库存状况'];yield ['查询范围',inventoryOutputScope(filter,data)];
  for (const products of sections(data)) {
    const first = products[0]!;
    yield [first.sizeGroup.label];yield ['货号', '商品名称', ...(settings.fit ? ['版型'] : []), '颜色', '仓库', ...first.sizes.map(size => size.label)];
    for (const product of products) for (const group of colors(product, settings)) for (const row of group.rows) {
      yield [product.code, product.name, ...(settings.fit ? [group.fit?.label ?? ''] : []), group.color.label, row.warehouse.label,
        ...product.sizes.map(size => { const cell = row.cells[size.id]!; return cell.state === 'known' ? cell.quantity : '—'; })];
    }
  }
}
export function inventoryWorkbookRows(data: InventoryOutputData, filter: InventoryFilter, settings: InventoryDisplaySettings): readonly (readonly string[])[] {return Array.from(workbookRows(data,filter,settings));}
/** Pull one full-model row at a time after complete authorized EOF, never DOM rows. */
export async function* inventoryWorkbookRowsAsync(data:InventoryOutputData,filter:InventoryFilter,settings:InventoryDisplaySettings,signal:AbortSignal):AsyncGenerator<readonly string[]>{
  const checkpoint=outputCheckpoint(signal);await checkpoint(true);
  for(const row of workbookRows(data,filter,settings)){await checkpoint();yield row;}
}

/** Preserve original global size-group order even when the server stream is
 * code-sorted A/B/A. Only compact final row projections are retained, never all
 * product DTOs plus a second table. This is not a constant-memory ZIP pipeline. */
export async function* inventoryWorkbookRowsStream(reader:InventoryOutputReader,read:Parameters<InventoryOutputReader['readOutput']>[0],settings:InventoryDisplaySettings):AsyncGenerator<readonly string[]>{
 if(!reader.streamOutput)throw new HttpQueryError('not-implemented','INVENTORY_OUTPUT_STREAM_NOT_CONFIGURED');
 const checkpoint=outputCheckpoint(read.signal),groups=new Map<string,string[]>();let summary:Omit<InventoryOutputData,'products'>|null=null,complete=false;
 try{
  for await(const chunk of reader.streamOutput(read)){
   await checkpoint();
   if(chunk.kind==='summary'){const {kind:_,...data}=chunk;summary=data;continue;}
   if(chunk.kind==='complete'){complete=true;continue;}
   if(!summary)return invalid();
   const product=chunk.product,key=JSON.stringify([product.sizeGroup.id,product.sizes.map(size=>[size.id,size.label])]);let group=groups.get(key);const first=!group;if(!group){group=[];groups.set(key,group);}
   let index=0;for(const row of workbookRows({...summary,products:[product]},read.parameters,settings)){if(index++<2)continue;if(!first&&index<=4)continue;group.push(JSON.stringify(row));await checkpoint();}
  }
  if(!summary||!complete)return invalid();await checkpoint();
  yield ['奈爵服饰 库存状况'];yield ['查询范围',inventoryOutputScope(read.parameters,summary)];
  for(const [key,rows] of groups){for(let index=0;index<rows.length;index++){await checkpoint();const encoded=rows[index]!;rows[index]='';yield JSON.parse(encoded) as string[];}rows.length=0;groups.delete(key);}
 }finally{for(const rows of groups.values())rows.length=0;groups.clear();}
}

/** Same native print fragments, grouped as before; no retained product matrix.
 * The final preview document still occupies memory and is published after EOF. */
export async function createInventoryPrintHtmlStream(reader:InventoryOutputReader,read:Parameters<InventoryOutputReader['readOutput']>[0],settings:InventoryDisplaySettings):Promise<string>{
 if(!reader.streamOutput)throw new HttpQueryError('not-implemented','INVENTORY_OUTPUT_STREAM_NOT_CONFIGURED');
 const checkpoint=outputCheckpoint(read.signal),groups=new Map<string,{head:string;parts:string[]}>();let summary:Omit<InventoryOutputData,'products'>|null=null,complete=false,detailRows=0;
 try{
  for await(const chunk of reader.streamOutput(read)){
   await checkpoint();if(chunk.kind==='summary'){const {kind:_,...data}=chunk;summary=data;continue;}if(chunk.kind==='complete'){complete=true;continue;}if(!summary)return invalid();
   const product=chunk.product,key=JSON.stringify([product.sizeGroup.id,product.sizes.map(size=>[size.id,size.label])]);const fragments=printTables({...summary,products:[product]},settings);let first=fragments.next();if(first.done)return invalid();let group=groups.get(key);if(!group){group={head:first.value,parts:[]};groups.set(key,group);}
   let previous:string|null=null,next=fragments.next();while(!next.done){if(previous!==null)group.parts.push(previous);previous=next.value;await checkpoint();next=fragments.next();}detailRows+=next.value;
   // The last yielded fragment closes the section; close once after all products.
  }
  if(!summary||!complete)return invalid();const parts:string[]=[];for(const [key,group] of groups){parts.push(group.head,group.parts.join(''),'</tbody></table></section>');group.parts.length=0;groups.delete(key);await checkpoint();}
  const html=printDocument(summary,read.parameters,detailRows,parts.join(''));parts.length=0;await checkpoint();return html;
 }finally{for(const group of groups.values())group.parts.length=0;groups.clear();}
}

/** Original table(...,{print:true}) and printDocument(), using the existing native
 * FIT display projection. No fold state, action column, business handlers or old global readers. */
function* printTables(data:InventoryOutputData,settings:InventoryDisplaySettings):Generator<string,number>{
  let detailRows = 0;
  for(const products of sections(data)){
    const first = products[0]!;
    const aggregate = (product: InventoryProduct, label: string, kind: string, totals: Readonly<Record<string, StockTotal>>, total: StockTotal) => `<tr class="mx-${kind}"><td class="mx-product">${escape(label)}</td><td class="mx-color"></td><td class="mx-warehouse"></td>${product.sizes.map(size => `<td>${escape(totals[size.id]!.knownQuantity)}</td>`).join('')}<td class="mx-total-cell">${escape(total.knownQuantity)}</td></tr>`;
    yield `<section class="mx-section" data-size-system="${escape(first.sizeGroup.id)}"><h3${settings.sizeDescription ? '' : ' hidden'}>${escape(first.sizeGroup.label)} <small>${first.sizes.map(size => escape(size.label)).join(' / ')}</small></h3><table class="mx-table"><colgroup><col style="width:19%"><col style="width:8%"><col style="width:10%">${first.sizes.map(() => `<col style="width:${57 / first.sizes.length}%">`).join('')}<col style="width:6%"></colgroup><thead><tr><th class="mx-product">款号／商品名称</th><th class="mx-color">颜色</th><th class="mx-warehouse">仓库</th>${first.sizes.map(size => `<th data-size-id="${escape(size.id)}">${escape(size.label)}</th>`).join('')}<th class="mx-total-cell">合计</th></tr></thead><tbody>`;
    for (const product of products) {
      for (const group of colors(product, settings)) {
        for (const row of group.rows) {
          detailRows++;
          yield `<tr data-inventory-product="${escape(product.id)}"><td class="mx-product"><div class="mx-product-identity"><strong>${escape(product.code)}</strong><span title="${escape(product.name)}">${escape(product.name)}</span></div></td><td class="mx-color"><div class="mx-indent"><span class="mx-fold-spacer"></span>${escape(group.color.label)}</div></td><td class="mx-warehouse"><div class="mx-indent"><span class="mx-fold-spacer"></span>${escape(row.warehouse.label)}</div></td>${product.sizes.map(size => { const cell = row.cells[size.id]!; const value = cell.state === 'known' ? cell.quantity : '—'; return `<td class="${value === '0' ? 'mx-zero' : value.startsWith('-') ? 'minus' : ''}">${escape(value)}</td>`; }).join('')}<td class="mx-total-cell">${escape(row.total.knownQuantity)}</td></tr>`;
        }
        if (settings.subtotal) yield aggregate(product, '颜色小计', 'subtotal', group.sizeTotals, group.total);
      }
      if (settings.total) yield aggregate(product, '商品合计', 'total', product.sizeTotals, product.total);
    }

    yield `</tbody></table></section>`;
  }
  return detailRows;
}
function printDocument(data:Omit<InventoryOutputData,'products'>,filter:InventoryFilter,detailRows:number,tables:string):string{
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>库存状况打印</title><style>@page{size:A4 landscape;margin:9mm}body{font:11px Arial,"PingFang SC",sans-serif;color:#263440}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:4px;overflow-wrap:break-word;border:1px solid #dce1e5;text-align:right}th{background:#f3f5f7}thead{display:table-header-group}tr{break-inside:avoid}.mx-product,.mx-color,.mx-warehouse,.mx-sum-label{text-align:left}.mx-product strong{white-space:nowrap}.mx-product span{display:block}.mx-color,.mx-warehouse{word-break:keep-all}.mx-meta{display:block;color:#52616f}.mx-section h3{font-size:12px}.mx-section{break-inside:auto;margin-bottom:12px}.mx-subtotal,.mx-total{background:#f3f5f7}small{font-weight:normal}</style></head><body><h1>库存状况</h1><p>${escape(inventoryOutputScope(filter, data))}</p><p>共 ${detailRows} 条数据行 · 全量库存 ${escape(data.allMatchesTotal.knownQuantity)}。遵循颜色小计、商品合计及尺码组说明设置；打印全部展开。</p>${tables}</body></html>`;
}

export function createInventoryPrintHtml(data: InventoryOutputData, filter: InventoryFilter, settings: InventoryDisplaySettings): string {
  const iterator=printTables(data,settings),parts:string[]=[];let next=iterator.next();
  while(!next.done){parts.push(next.value);next=iterator.next();}
  return printDocument(data,filter,next.value,parts.join(''));
}
export async function createInventoryPrintHtmlAsync(data:InventoryOutputData,filter:InventoryFilter,settings:InventoryDisplaySettings,signal:AbortSignal):Promise<string>{
  const checkpoint=outputCheckpoint(signal);await checkpoint(true);
  const iterator=printTables(data,settings),parts:string[]=[];let finished=false;
  try{
    let next=iterator.next();
    while(!next.done){parts.push(next.value);await checkpoint();next=iterator.next();}
    await checkpoint();finished=true;return printDocument(data,filter,next.value,parts.join(''));
  }finally{if(!finished){iterator.return(0);parts.length=0;}}
}
