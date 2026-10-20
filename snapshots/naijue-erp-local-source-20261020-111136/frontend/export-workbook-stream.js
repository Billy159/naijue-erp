const encoder=new TextEncoder();
const xml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const columnName=index=>{let result='';for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
const crcTable=(()=>{const out=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;out[n]=c>>>0;}return out;})();
function crcUpdate(crc,bytes){let value=crc;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return value>>>0;}
function u16(value){const out=new Uint8Array(2);new DataView(out.buffer).setUint16(0,value,true);return out;}
function u32(value){const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value>>>0,true);return out;}
function cat(...parts){const size=parts.reduce((n,p)=>n+p.byteLength,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;}

class ZipWriter {
  constructor(destination){this.destination=destination;this.offset=0;this.entries=[];}
  async write(bytes){
    if(this.offset+bytes.byteLength>0xffffffff)throw new Error('Excel 压缩包超过 4 GB 上限，请缩小筛选范围');
    await this.destination.write(bytes);this.offset+=bytes.byteLength;
  }
  async entry(name,source){
    const nameBytes=encoder.encode(name),start=this.offset,flags=0x0808,method=8;
    await this.write(cat(u32(0x04034b50),u16(20),u16(flags),u16(method),u16(0),u16(0x0021),u32(0),u32(0),u32(0),u16(nameBytes.length),u16(0),nameBytes));
    let crc=0xffffffff,plainSize=0,compressedSize=0;
    const compressor=new CompressionStream('deflate-raw'),reader=compressor.readable.getReader(),input=compressor.writable.getWriter();
    const pump=(async()=>{while(true){const item=await reader.read();if(item.done)break;compressedSize+=item.value.byteLength;await this.write(item.value);}})();
    try{
      const stream=typeof source==='string'?new Blob([source]).stream():source;
      const sourceReader=stream.getReader();
      while(true){const item=await sourceReader.read();if(item.done)break;const chunk=item.value instanceof Uint8Array?item.value:new Uint8Array(item.value);crc=crcUpdate(crc,chunk);plainSize+=chunk.byteLength;await input.write(chunk);}
      await input.close();await pump;
    }catch(cause){try{await input.abort(cause);}catch{}try{reader.releaseLock();}catch{}throw cause;}
    const finalCrc=(crc^0xffffffff)>>>0;
    await this.write(cat(u32(0x08074b50),u32(finalCrc),u32(compressedSize),u32(plainSize)));
    this.entries.push({nameBytes,flags,method,crc:finalCrc,compressedSize,plainSize,offset:start});
  }
  async close(){
    const centralStart=this.offset;
    for(const item of this.entries){
      await this.write(cat(u32(0x02014b50),u16(20),u16(20),u16(item.flags),u16(item.method),u16(0),u16(0x0021),u32(item.crc),u32(item.compressedSize),u32(item.plainSize),
        u16(item.nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(item.offset),item.nameBytes));
    }
    const size=this.offset-centralStart;
    if(this.entries.length>65535||size>0xffffffff)throw new Error('Excel 工作簿目录超过 ZIP 标准上限');
    await this.write(cat(u32(0x06054b50),u16(0),u16(0),u16(this.entries.length),u16(this.entries.length),u32(size),u32(centralStart),u16(0)));
  }
}

function uniqueNames(sheets){
  const used=new Set();
  return sheets.map((sheet,index)=>{
    const base=String(sheet.name||`Sheet${index+1}`).replace(/[\\/*?:\[\]]/g,' ').slice(0,31)||`Sheet${index+1}`;
    let name=base,serial=2;while(used.has(name.toLocaleLowerCase())){const suffix=` (${serial++})`;name=base.slice(0,31-suffix.length)+suffix;}
    used.add(name.toLocaleLowerCase());return name;
  });
}
function sheetPrelude(width){
  const cols=Array.from({length:width},(_,i)=>`<col min="${i+1}" max="${i+1}" width="22" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>`;
}
function sheetRow(row,rowNumber){
  const values=Array.isArray(row)?row:[];
  return `<row r="${rowNumber}">${values.map((value,index)=>{
    const cell=String(value??'');if(cell.length>32767)throw new Error(`第 ${rowNumber} 行的单元格超过 Excel 文本上限`);
    return `<c r="${columnName(index)}${rowNumber}" s="0" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
  }).join('')}</row>`;
}
export const outputSpoolStaleAfterMs=5*60*1000;
const outputTaskIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function writeSpoolLease(directory,taskId){
  const handle=await directory.getFileHandle('lease.json',{create:true}),writer=await handle.createWritable();
  try{await writer.write(JSON.stringify({taskId,lastTouchedAt:Date.now()}));await writer.close();}
  catch(cause){try{await writer.abort(cause);}catch{}throw cause;}
}
async function spoolLastTouchedAt(directory,taskId){
  try{
    const file=await directory.getFileHandle('lease.json').then(handle=>handle.getFile()),lease=JSON.parse(await file.text());
    if(lease?.taskId===taskId&&Number.isSafeInteger(lease.lastTouchedAt))return lease.lastTouchedAt;
  }catch{}
  let latest=0;
  try{
    for await(const [name,entry] of directory.entries()){
      if(entry.kind!=='file'||name==='lease.json')continue;
      const file=await entry.getFile();latest=Math.max(latest,Number(file.lastModified)||0);
    }
  }catch{return null;}
  return latest||null;
}
export async function cleanupStaleStreamingWorkbookSpools({storage=globalThis.navigator?.storage,now=Date.now(),staleAfterMs=outputSpoolStaleAfterMs}={}){
  if(typeof storage?.getDirectory!=='function'||!Number.isSafeInteger(now)||!Number.isSafeInteger(staleAfterMs)||staleAfterMs<1)return [];
  let parent;
  try{parent=await storage.getDirectory().then(root=>root.getDirectoryHandle('t27-output-spools'));}catch{return [];}
  const removed=[];
  try{
    for await(const [taskId,entry] of parent.entries()){
      if(entry.kind!=='directory'||!outputTaskIdPattern.test(taskId))continue;
      const touched=await spoolLastTouchedAt(entry,taskId);
      if(touched!==null&&now-touched>=staleAfterMs){
        try{await parent.removeEntry(taskId,{recursive:true});removed.push(taskId);}catch{}
      }
    }
  }catch{}
  return removed;
}
export async function removeStreamingWorkbookSpool(taskId,storage=globalThis.navigator?.storage){
  if(typeof taskId!=='string'||!outputTaskIdPattern.test(taskId)||typeof storage?.getDirectory!=='function')return false;
  try{
    const root=await storage.getDirectory(),parent=await root.getDirectoryHandle('t27-output-spools');
    await parent.removeEntry(taskId,{recursive:true});return true;
  }catch{return false;}
}
function workbookPartXml(names){
  const head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const overrides=names.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return [
    ['[Content_Types].xml',head+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`],
    ['_rels/.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',head+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,index)=>`<sheet name="${xml(name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',head+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${names.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',head+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ];
}

export async function createStreamingWorkbook({taskId,sheets,saveHandle,storage=navigator.storage}){
  if(typeof CompressionStream!=='function'||typeof storage?.getDirectory!=='function')throw new Error('当前浏览器不支持有界内存导出，请使用新版 Chrome 或 Edge');
  const taskName=String(taskId).replace(/[^a-zA-Z0-9-]/g,'');
  if(!taskName)throw new Error('导出任务编号无效');
  const root=await storage.getDirectory(),parent=await root.getDirectoryHandle('t27-output-spools',{create:true});
  try{await parent.removeEntry(taskName,{recursive:true});}catch{}
  const directory=await parent.getDirectoryHandle(taskName,{create:true}),names=uniqueNames(sheets),spools=[];
  try{
    await writeSpoolLease(directory,taskName);
    for(let index=0;index<sheets.length;index++){
      const headers=Array.isArray(sheets[index].headers)?sheets[index].headers:[];
      if(!headers.length)throw new Error(`工作表“${names[index]}”缺少表头`);
      const width=headers.length;if(width>16384)throw new Error('工作表列数超过 Excel 上限');
      const file=await directory.getFileHandle(`sheet-${index+1}.xml`,{create:true}),writer=await file.createWritable();
      await writer.write(sheetPrelude(width));await writer.write(sheetRow(headers,1));
      spools.push({file,writer,width,nextRow:2,rows:0});
    }
  }catch(cause){try{await parent.removeEntry(taskName,{recursive:true});}catch{}throw cause;}
  let closed=false,leaseTail=Promise.resolve();
  const touchLease=()=>{
    const pending=leaseTail.then(()=>writeSpoolLease(directory,taskName));
    leaseTail=pending.catch(()=>{});return pending;
  };
  return {
    get rowCounts(){return spools.map(spool=>spool.rows);},
    async append(sheetIndex,rows){
      if(closed)throw new Error('工作簿写入器已关闭');
      if(!Number.isInteger(sheetIndex)||sheetIndex<0||sheetIndex>=spools.length||!Array.isArray(rows))throw new Error('工作表批次无效');
      const spool=spools[sheetIndex];
      for(let start=0;start<rows.length;start+=25){
        const batch=rows.slice(start,start+25);
        if(spool.nextRow+batch.length-1>1048576)throw new Error(`工作表“${names[sheetIndex]}”超过 Excel 行上限`);
        await spool.writer.write(batch.map((row,index)=>sheetRow(row,spool.nextRow+index)).join(''));
        spool.nextRow+=batch.length;spool.rows+=batch.length;
      }
      await touchLease();
    },
    async touch(){if(!closed)await touchLease();},
    async finish(){
      if(closed)throw new Error('工作簿写入器已关闭');closed=true;
      let output=null;
      try{
        await leaseTail;
        output=await saveHandle.createWritable();
        for(const spool of spools)await spool.writer.write('</sheetData></worksheet>');
        for(const spool of spools)await spool.writer.close();
        const zip=new ZipWriter(output);
        for(const [name,source]of workbookPartXml(names))await zip.entry(name,source);
        for(let index=0;index<spools.length;index++)await zip.entry(`xl/worksheets/sheet${index+1}.xml`,await spools[index].file.getFile().then(file=>file.stream()));
        await zip.close();await output.close();
        try{await parent.removeEntry(taskName,{recursive:true});}catch{}
        return spools.map(spool=>spool.rows);
      }catch(cause){try{await output?.abort(cause);}catch{}for(const spool of spools)try{await spool.writer.abort(cause);}catch{}try{await parent.removeEntry(taskName,{recursive:true});}catch{}throw cause;}
    },
    async abort(cause=new Error('export cancelled')){
      if(closed)return;closed=true;
      try{await leaseTail;}catch{}
      for(const spool of spools)try{await spool.writer.abort(cause);}catch{}
      try{await parent.removeEntry(taskName,{recursive:true});}catch{}
    },
  };
}

export const streamingWorkbookInternals={crcUpdate,sheetRow,workbookPartXml};
