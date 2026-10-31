import { useEffect, useRef, useState } from 'react';
import { UIButton } from './standard-controls.tsx';
import { StandardOverlay } from './standard-overlay.tsx';
import type { DocumentOutput } from './document-output-contracts.ts';
import './document-output.css';

const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function escape(value: string): string {
  // Invalid XML must fail visibly, never silently alter an original barcode.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value)) throw new TypeError('Unsupported output text.');
  for (const character of value) { const point = character.codePointAt(0)!; if (point >= 0xd800 && point <= 0xdfff) throw new TypeError('Unpaired output surrogate.'); }
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!).replace(/\r/g, '&#13;');
}
const cellText = (value: string | null) => value === null ? '未记录' : value;
function rowsOf(document: DocumentOutput): readonly (readonly (string | null)[])[] {
  if (!document.id || !Number.isSafeInteger(document.version) || document.version < 1) throw new TypeError('Saved document required.');
  for (const section of document.sections) if (section.rows.some(row => row.length !== section.columns.length)) throw new TypeError('Incomplete output row.');
  return [[document.title], ...document.metadata, [], ...document.sections.flatMap(section => [[section.title], section.columns, ...section.rows, []]), ...document.totals, [], ...document.notes.map(note => [note])];
}
function column(index: number): string {
  let name = ''; for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
}
const worksheetStart = xmlHeader + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="32" width="22" customWidth="1"/></cols><sheetData>';
const worksheetEnd = '</sheetData></worksheet>';
function workbookCell(value: string | null, col: number, row: number): string {
  const text = cellText(value); if (text.length > 32_767) throw new TypeError('Workbook cell text exceeded.');
  // Exact text preserves leading zeros, precision and literal formula-looking values.
  return `<c r="${column(col)}${row}" t="inlineStr"><is><t xml:space="preserve">${escape(text)}</t></is></c>`;
}
function workbookFiles(data: string): readonly (readonly [string, string])[] {
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return [
    ['[Content_Types].xml', xmlHeader + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', xmlHeader + `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', xmlHeader + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="已保存单据" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', xmlHeader + `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', worksheetStart + data + worksheetEnd],
  ];
}
function zipHeader(length: number) { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; }
/** The original ZIP STORE checksum can also consume bounded byte chunks. */
function zipChecksum(bytes: Uint8Array, value = 0xffffffff): number {
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return value;
}
function zipEntry(name: Uint8Array, size: number, checksum: number, offset: number) {
  const local = zipHeader(30), entry = zipHeader(46);
  local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true); local.view.setUint16(12, 33, true);
  local.view.setUint32(14, checksum, true); local.view.setUint32(18, size, true); local.view.setUint32(22, size, true); local.view.setUint16(26, name.length, true);
  entry.view.setUint32(0, 0x02014b50, true); entry.view.setUint16(4, 20, true); entry.view.setUint16(6, 20, true); entry.view.setUint16(8, 0x0800, true); entry.view.setUint16(14, 33, true);
  entry.view.setUint32(16, checksum, true); entry.view.setUint32(20, size, true); entry.view.setUint32(24, size, true); entry.view.setUint16(28, name.length, true); entry.view.setUint32(42, offset, true);
  return { local: local.bytes, entry: entry.bytes };
}
function zipEnd(count: number, directorySize: number, offset: number): Uint8Array<ArrayBuffer> {
  const end = zipHeader(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, count, true); end.view.setUint16(10, count, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  return end.bytes;
}
/** Genuine XLSX ZIP STORE; the synchronous document API keeps its original bytes. */
function zip(files: readonly (readonly [string, string])[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [filename, content] of files) {
    const name = encoder.encode(filename), data = encoder.encode(content), checksum = (zipChecksum(data) ^ 0xffffffff) >>> 0;
    const headers = zipEntry(name, data.length, checksum, offset);
    locals.push(headers.local, name, data); central.push(headers.entry, name); offset += 30 + name.length + data.length;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0), end = zipEnd(files.length, directorySize, offset);
  const result = new Uint8Array(offset + directorySize + end.length); let at = 0;
  for (const part of [...locals, ...central, end]) { result.set(part, at); at += part.length; }
  return result;
}
export function createDocumentWorkbook(document: DocumentOutput): Uint8Array<ArrayBuffer> {
  return createWorkbookRows(rowsOf(document));
}
/** A list-page owner assembles its authorized range; this never fetches or totals it. */
export function createWorkbookRows(rows: readonly (readonly (string | null)[])[]): Uint8Array<ArrayBuffer> {
  if (rows.length > 1_048_576 || rows.some(row => row.length > 16_384)) throw new TypeError('Workbook dimensions exceeded.');
  const data = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, col) => workbookCell(value, col, index + 1)).join('')}</row>`).join('');
  return zip(workbookFiles(data));
}
/** Abort an asynchronous producer wait without waiting for another row to arrive. */
function nextWorkbookRow(iterator: AsyncIterator<readonly (string | null)[]>, signal: AbortSignal): Promise<IteratorResult<readonly (string | null)[]>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return iterator.next(); }).then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
/** Same workbook cells and ZIP entries, with lazy input and bounded encoding,
 * checksum and final-copy work. Cancellation never returns a partial workbook. */
export async function createWorkbookRowsAsync(
  rows: Iterable<readonly (string | null)[]> | AsyncIterable<readonly (string | null)[]>,
  options: { readonly signal: AbortSignal },
): Promise<Uint8Array<ArrayBuffer>> {
  const { signal } = options; signal.throwIfAborted();
  let deadline = performance.now() + 8;
  const checkpoint = async (force = false) => {
    signal.throwIfAborted();
    if (force || performance.now() >= deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted(); deadline = performance.now() + 8;
    }
  };
  await checkpoint(true);
  const asyncIterator = (rows as Partial<AsyncIterable<readonly (string | null)[]>>)[Symbol.asyncIterator]?.();
  const iterator = asyncIterator ?? (rows as Iterable<readonly (string | null)[]>)[Symbol.iterator]();
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0, rowNumber = 0, inputDone = false;
  const files = workbookFiles('');
  try {
    for (const [filename, content] of files) {
      const chunks: Uint8Array[] = []; let buffered = '', size = 0, checksum = 0xffffffff;
      const encode = async (text: string) => {
        signal.throwIfAborted(); const data = encoder.encode(text);
        size += data.length; if (size > 0xffffffff) throw new TypeError('Workbook ZIP size exceeded.');
        checksum = zipChecksum(data, checksum); chunks.push(data); await checkpoint();
      };
      const append = async (text: string) => {
        buffered += text;
        while (buffered.length >= 16_384) {
          // Keep a valid surrogate pair in the same UTF-8 encoding chunk.
          const last = buffered.charCodeAt(16_383), end = last >= 0xd800 && last <= 0xdbff ? 16_383 : 16_384;
          await encode(buffered.slice(0, end)); buffered = buffered.slice(end);
        }
      };
      if (filename === 'xl/worksheets/sheet1.xml') {
        await append(worksheetStart);
        for (;;) {
          signal.throwIfAborted();
          const next = asyncIterator ? await nextWorkbookRow(asyncIterator, signal) : (iterator as Iterator<readonly (string | null)[]>).next();
          signal.throwIfAborted();
          if (next.done) { inputDone = true; break; }
          const row = next.value;
          if (++rowNumber > 1_048_576 || row.length > 16_384) throw new TypeError('Workbook dimensions exceeded.');
          await append(`<row r="${rowNumber}">`);
          for (let col = 0; col < row.length; col++) { signal.throwIfAborted(); await append(workbookCell(row[col]!, col, rowNumber)); }
          await append('</row>'); await checkpoint();
        }
        await append(worksheetEnd);
      } else await append(content);
      if (buffered) await encode(buffered);
      const name = encoder.encode(filename), headers = zipEntry(name, size, (checksum ^ 0xffffffff) >>> 0, offset);
      locals.push(headers.local, name); for (const chunk of chunks) locals.push(chunk);
      central.push(headers.entry, name); offset += 30 + name.length + size;
      if (offset > 0xffffffff) throw new TypeError('Workbook ZIP size exceeded.');
      await checkpoint();
    }
    const directorySize = central.reduce((sum, item) => sum + item.length, 0), end = zipEnd(files.length, directorySize, offset);
    if (offset + directorySize + end.length > 0xffffffff) throw new TypeError('Workbook ZIP size exceeded.');
    await checkpoint(true);
    const result = new Uint8Array(offset + directorySize + end.length); let at = 0;
    for (const parts of [locals, central, [end]]) for (const part of parts) {
      for (let index = 0; index < part.length; index += 65_536) {
        signal.throwIfAborted(); const chunk = part.subarray(index, index + 65_536); result.set(chunk, at); at += chunk.length; await checkpoint();
      }
    }
    signal.throwIfAborted(); return result;
  } finally {
    if (!inputDone) {
      // A producer with a pending asynchronous next() may finish later; request
      // cleanup without making cancellation wait for an unresponsive producer.
      try { const closing = iterator.return?.(); if (closing) void Promise.resolve(closing).catch(() => {}); } catch { /* Preserve the original output failure. */ }
    }
  }
}
export function createDocumentPrintHtml(document: DocumentOutput): string {
  rowsOf(document);
  const html = (value: string | null) => escape(cellText(value));
  const transfer = document.kind === 'transfer';
  const summary = transfer ? document.printSummary : undefined, categories = summary?.categorySummary;
  const productCountHtml = !summary ? '' : `<span data-print-styles>${summary.productCount === null ? '历史未记录款数' : `${escape(summary.productCount)}款`}</span>`;
  const categoriesHtml = !summary ? '' : `<span class="product-tags" aria-label="商品信息"${categories?.basis === 'CURRENT' ? ' title="按当前商品分类统计"' : ''}>${!categories ? '分类统计未提供' : categories.basis === 'UNKNOWN' ? '历史未记录分类' : categories.metric !== 'PRODUCT_COUNT' || categories.hasMore ? '分类统计未提供' : categories.items.map(item => `<span class="product-tag"${item.categoryId === null ? '' : ` data-print-category-id="${escape(item.categoryId)}"`}>${escape(item.categoryName ?? '待确认分类')} ${escape(item.value)}</span>`).join('')}</span>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(document.number)} · ${escape(document.title)}</title><style>
@page{size:${transfer ? '552mm 241mm' : 'A4 landscape'};margin:${transfer ? '0' : '12mm'}}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:${transfer ? '"Songti SC","SimSun",serif' : 'Arial,"PingFang SC",sans-serif'};font-size:11pt;line-height:1.3}.paper{padding:${transfer ? '8.9mm 5.5mm 9.4mm' : '8mm'}}h1{font-size:20pt;text-align:${transfer?'center':'left'};margin:0 0 5mm}h2{font-size:12pt;margin:5mm 0 2mm}.meta,.totals{display:flex;flex-wrap:wrap;gap:2mm 8mm}.meta span,.totals span{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.2mm solid #000;padding:.8mm 1mm;overflow-wrap:anywhere;white-space:pre-wrap;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.totals{margin-top:4mm;font-weight:bold}.notes{font-size:9pt}p{white-space:pre-wrap;overflow-wrap:anywhere}.transfer-summary{align-items:center;gap:3mm;font-weight:400;break-inside:avoid}.transfer-summary .product-tags{display:flex;flex-wrap:wrap;gap:2mm}.transfer-summary .product-tag{padding:.6mm 1.5mm;border-radius:1mm;background:#f2f3f5;color:#444;print-color-adjust:exact;-webkit-print-color-adjust:exact}@media print{.paper{max-width:none}}
</style></head><body><main class="paper"><h1>${escape(document.title)}</h1><div class="meta">${(document.printMetadata ?? document.metadata).map(([key, value]) => `<span>${escape(key)}：${html(value)}</span>`).join('')}</div>${(document.printSections ?? document.sections).map(section => `<section><h2>${escape(section.title)}</h2><table><thead><tr>${section.columns.map(label => `<th>${escape(label)}</th>`).join('')}</tr></thead><tbody>${section.rows.length ? section.rows.map(row => `<tr>${row.map(value => `<td>${html(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${section.columns.length}">没有已记录明细</td></tr>`}</tbody></table></section>`).join('')}<div class="totals${summary ? ' transfer-summary' : ''}"${summary ? ' aria-label="商品汇总"' : ''}>${productCountHtml}${document.totals.map(([key, value]) => `<span>${escape(key)}：${escape(value)}</span>`).join('')}${categoriesHtml}</div><div class="notes">${document.notes.map(note => `<p>${escape(note)}</p>`).join('')}</div></main></body></html>`;
}
function filename(document: DocumentOutput): string {
  return `${document.kind === 'sales' ? '销货单' : '调拨单'}-${document.number.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100)}-v${document.version}.xlsx`;
}
export function DocumentOutputActions({ sourceKey, getDocument, unavailableReason = '保存并读取单据后可导出和打印' }: {
  readonly sourceKey: string; readonly getDocument?: () => DocumentOutput; readonly unavailableReason?: string;
}) {
  const current = useRef({ sourceKey, getDocument }); current.current = { sourceKey, getDocument };
  const [preview, setPreview] = useState<{ key: string; html: string; kind: DocumentOutput['kind'] } | null>(null);
  const [error, setError] = useState(false), [ready, setReady] = useState(false); const frame = useRef<HTMLIFrameElement>(null);
  const visible = !!getDocument && preview?.key === sourceKey;
  useEffect(() => { if (!getDocument || preview && preview.key !== sourceKey) { setPreview(null); setReady(false); setError(false); } }, [!!getDocument, sourceKey, preview]);
  useEffect(() => {
    if (!visible || !ready) return;
    const content = frame.current?.contentDocument;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setPreview(null); setReady(false); } };
    content?.addEventListener('keydown', escape);
    return () => content?.removeEventListener('keydown', escape);
  }, [visible, ready, preview]);
  const download = () => {
    if (!current.current.getDocument) return;
    let url: string | null = null;
    try {
      const data = current.current.getDocument(), bytes = createDocumentWorkbook(data);
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = filename(data); link.hidden = true; document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      const completed = url; setTimeout(() => URL.revokeObjectURL(completed), 1000); url = null; setError(false);
    } catch { setError(true); } finally { if (url) URL.revokeObjectURL(url); }
  };
  const printButton=preview?<UIButton type="button" className="iw-button iw-primary" disabled={!ready} onClick={() => {
        if (!current.current.getDocument || current.current.sourceKey !== preview.key || !ready) return;
        try { if (!frame.current?.contentWindow) throw new Error(); frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError(true); }
      }}>浏览器打印</UIButton>:null;
  return <><UIButton type="button" className="iw-text-button" disabled={!getDocument} title={!getDocument ? unavailableReason : undefined} onClick={download}>导出</UIButton>
    <UIButton type="button" className="iw-text-button" disabled={!getDocument} title={!getDocument ? unavailableReason : undefined} onClick={() => {
      if (!current.current.getDocument) return;
      try { const data = current.current.getDocument(); setReady(false); setPreview({ key: sourceKey, html: createDocumentPrintHtml(data), kind: data.kind }); setError(false); } catch { setError(true); }
    }}>打印</UIButton>
    {error && <span className="document-output-error" role="alert">单据输出未完成，请检查当前单据后重试。</span>}
    {visible && preview && <StandardOverlay title={preview.kind==='transfer'?'调拨单打印预览':'已保存单据打印预览'} footer={preview.kind==='sales'?printButton:undefined} label="单据打印预览" closeLabel="关闭打印预览" width={1180} close={() => { setPreview(null); setReady(false); }}>
      {preview.kind==='transfer'&&<div className="document-output-toolbar"><span>横向纸张 552 × 241 mm · 已保存内容</span>{printButton}</div>}
      <iframe ref={frame} className="document-output-frame" title="已保存单据打印内容" sandbox="allow-same-origin allow-modals" srcDoc={preview.html} onLoad={() => { if (current.current.sourceKey === preview.key && current.current.getDocument) setReady(true); }} />
    </StandardOverlay>}
  </>;
}
