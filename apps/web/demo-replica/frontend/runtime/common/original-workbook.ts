import { InventoryOutputBudget } from '../../../../src/inventory/output-budget.ts';
import JSZip from 'jszip';
const xml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''),col=(n:number)=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
export type WorkbookRows = AsyncIterable<readonly string[]> | readonly (readonly string[])[];
const checkpoint=(signal?:AbortSignal)=>{if(signal?.aborted)throw signal.reason??new DOMException('已取消导出。','AbortError');};
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export async function createOriginalWorkbook(rows:WorkbookRows,title:string,signal?:AbortSignal):Promise<Uint8Array<ArrayBuffer>> {
checkpoint(signal);
const budget=new InventoryOutputBudget(),z=new JSZip(),head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
z.file('[Content_Types].xml',head+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
z.file('_rels/.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
z.file('xl/workbook.xml',head+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xml(title)+'" sheetId="1" r:id="rId1"/></sheets></workbook>');
z.file('xl/_rels/workbook.xml.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
z.file('xl/styles.xml',head+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
let pieces:string[]=[],index=0;
for await (const row of rows) {
 checkpoint(signal);budget.reserveRow(row);index++;
 const piece=`<row r="${index}">${row.map((value,j)=>`<c r="${col(j)}${index}" s="2" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`;budget.reserveXml(piece);pieces.push(piece);
 if(index%256===0){await yieldTask();checkpoint(signal);}
}
checkpoint(signal);budget.reserveXml(head+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="22" customWidth="1"/></cols><sheetData></sheetData></worksheet>');
z.file('xl/worksheets/sheet1.xml',head+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="22" customWidth="1"/></cols><sheetData>'+pieces.join('')+'</sheetData></worksheet>');
pieces=[];
// JSZip retains worksheet XML until completion. No DTOs or two-dimensional rows are retained here.
return new Promise((resolve,reject)=>{
 const stream=z.generateInternalStream({type:'uint8array',compression:'DEFLATE'});
 let chunks:Uint8Array[]=[],size=0,settled=false;
 const cleanup=()=>signal?.removeEventListener('abort',abort);
 const fail=(error:unknown)=>{if(settled)return;settled=true;stream.pause();chunks=[];cleanup();reject(error);};
 const abort=()=>fail(signal?.reason??new DOMException('已取消导出。','AbortError'));
 signal?.addEventListener('abort',abort,{once:true});
 stream.on('data',chunk=>{if(settled)return;try{checkpoint(signal);budget.reserveZip(chunk.byteLength);chunks.push(chunk);size+=chunk.byteLength;}catch(error){fail(error);}});
 stream.on('error',fail);
 stream.on('end',()=>{if(settled)return;if(signal?.aborted){abort();return;}settled=true;cleanup();const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}chunks=[];resolve(result);});
 if(signal?.aborted)abort();else stream.resume();
});
}
