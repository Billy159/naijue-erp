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
/** ZIP STORE is sufficient for small, complete document workbooks. UTF-8,
 * CRC32 and a central directory produce genuine XLSX without a new dependency. */
function zip(files: readonly (readonly [string, string])[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  const crc = (bytes: Uint8Array) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const header = (length: number) => { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; };
  for (const [filename, content] of files) {
    const name = encoder.encode(filename), data = encoder.encode(content), checksum = crc(data), local = header(30), entry = header(46);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true); local.view.setUint16(12, 33, true);
    local.view.setUint32(14, checksum, true); local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, name.length, true);
    entry.view.setUint32(0, 0x02014b50, true); entry.view.setUint16(4, 20, true); entry.view.setUint16(6, 20, true); entry.view.setUint16(8, 0x0800, true); entry.view.setUint16(14, 33, true);
    entry.view.setUint32(16, checksum, true); entry.view.setUint32(20, data.length, true); entry.view.setUint32(24, data.length, true); entry.view.setUint16(28, name.length, true); entry.view.setUint32(42, offset, true);
    locals.push(local.bytes, name, data); central.push(entry.bytes, name); offset += 30 + name.length + data.length;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0), end = header(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + 22); let at = 0;
  for (const part of [...locals, ...central, end.bytes]) { result.set(part, at); at += part.length; }
  return result;
}
export function createDocumentWorkbook(document: DocumentOutput): Uint8Array<ArrayBuffer> {
  return createWorkbookRows(rowsOf(document));
}
/** Reusable XLSX serializer. A list-page owner must explicitly assemble and
 * label its authorized export range; this function never fetches or totals it. */
export function createWorkbookRows(rows: readonly (readonly (string | null)[])[]): Uint8Array<ArrayBuffer> {
  if (rows.length > 1_048_576 || rows.some(row => row.length > 16_384)) throw new TypeError('Workbook dimensions exceeded.');
  const data = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, col) => {
    const text = cellText(value); if (text.length > 32_767) throw new TypeError('Workbook cell text exceeded.');
    // All values remain exact text: leading zeros, long IDs/quantities, money
    // and strings beginning with = cannot become Excel formulas or rounding.
    return `<c r="${column(col)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(text)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
    ['[Content_Types].xml', xmlHeader + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', xmlHeader + `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', xmlHeader + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="已保存单据" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', xmlHeader + `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', xmlHeader + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="32" width="22" customWidth="1"/></cols><sheetData>${data}</sheetData></worksheet>`],
  ]);
}
export function createDocumentPrintHtml(document: DocumentOutput): string {
  rowsOf(document);
  const html = (value: string | null) => escape(cellText(value));
  const transfer = document.kind === 'transfer';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(document.number)} · ${escape(document.title)}</title><style>
@page{size:${transfer ? '552mm 241mm' : 'A4 landscape'};margin:${transfer ? '0' : '12mm'}}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:${transfer ? '"Songti SC","SimSun",serif' : 'Arial,"PingFang SC",sans-serif'};font-size:11pt;line-height:1.3}.paper{padding:${transfer ? '8.9mm 5.5mm 9.4mm' : '8mm'}}h1{font-size:20pt;text-align:center;margin:0 0 5mm}h2{font-size:12pt;margin:5mm 0 2mm}.meta,.totals{display:flex;flex-wrap:wrap;gap:2mm 8mm}.meta span,.totals span{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.2mm solid #000;padding:.8mm 1mm;overflow-wrap:anywhere;white-space:pre-wrap;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.totals{margin-top:4mm;font-weight:bold}.notes{font-size:9pt}p{white-space:pre-wrap;overflow-wrap:anywhere}@media print{.paper{max-width:none}}
</style></head><body><main class="paper"><h1>${escape(document.title)}</h1><div class="meta">${(document.printMetadata ?? document.metadata).map(([key, value]) => `<span>${escape(key)}：${html(value)}</span>`).join('')}</div>${(document.printSections ?? document.sections).map(section => `<section><h2>${escape(section.title)}</h2><table><thead><tr>${section.columns.map(label => `<th>${escape(label)}</th>`).join('')}</tr></thead><tbody>${section.rows.length ? section.rows.map(row => `<tr>${row.map(value => `<td>${html(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${section.columns.length}">没有已记录明细</td></tr>`}</tbody></table></section>`).join('')}<div class="totals">${document.totals.map(([key, value]) => `<span>${escape(key)}：${escape(value)}</span>`).join('')}</div><div class="notes">${document.notes.map(note => `<p>${escape(note)}</p>`).join('')}</div></main></body></html>`;
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
  return <><UIButton type="button" className="iw-text-button" disabled={!getDocument} title={!getDocument ? unavailableReason : undefined} onClick={download}>导出</UIButton>
    <UIButton type="button" className="iw-text-button" disabled={!getDocument} title={!getDocument ? unavailableReason : undefined} onClick={() => {
      if (!current.current.getDocument) return;
      try { const data = current.current.getDocument(); setReady(false); setPreview({ key: sourceKey, html: createDocumentPrintHtml(data), kind: data.kind }); setError(false); } catch { setError(true); }
    }}>打印</UIButton>
    {error && <span className="document-output-error" role="alert">单据输出未完成，请检查当前单据后重试。</span>}
    {visible && preview && <StandardOverlay title="已保存单据打印预览" label="单据打印预览" closeLabel="关闭打印预览" width={1180} close={() => { setPreview(null); setReady(false); }}>
      <div className="document-output-toolbar"><span>{preview.kind === 'transfer' ? '横向纸张 552 × 241 mm' : '横向 A4'} · 已保存内容</span><UIButton type="button" className="iw-button iw-primary" disabled={!ready} onClick={() => {
        if (!current.current.getDocument || current.current.sourceKey !== preview.key || !ready) return;
        try { if (!frame.current?.contentWindow) throw new Error(); frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError(true); }
      }}>浏览器打印</UIButton></div>
      <iframe ref={frame} className="document-output-frame" title="已保存单据打印内容" sandbox="allow-same-origin allow-modals" srcDoc={preview.html} onLoad={() => { if (current.current.sourceKey === preview.key && current.current.getDocument) setReady(true); }} />
    </StandardOverlay>}
  </>;
}
