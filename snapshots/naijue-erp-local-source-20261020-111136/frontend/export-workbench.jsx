import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert, Button, Empty, Input, Pagination, Select, Spin, Table, Tabs, Tag} from '@arco-design/web-react';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import workbenchCss from './export-workbench.css?inline';
import {renderTransferPrint, transferPaper} from './export-transfer-print.js';
import {cleanupStaleStreamingWorkbookSpools,createStreamingWorkbook,outputSpoolStaleAfterMs,removeStreamingWorkbookSpool} from './export-workbook-stream.js';
import {correctionDimensions, correctionWorkbookLine, productSheets, workbookJsonCell, workbookJsonHeader} from './output-projections.js';

for (const css of [arcoCss, workbenchCss]) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

const pageSize = 200;
const exportPageSize = 200;
const streamThreshold = 200;
const outputJobRefreshMs = 60_000;
const outputJobHeartbeatMs = 60_000;
const correctionDetailLimit = 1_000_000;
const text = value => value == null ? '' : String(value);
const clean = value => text(value).trim();
const safeName = value => text(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 70) || 'ERP-导出';
const xml = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const colName = index => { let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; };
const api = (path) => window.ERP_API.request(path, undefined, {mode: 'query', expire: false});

async function fetchAllPages(path, params = {}) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= 1000000; page++) {
    const query = new URLSearchParams({...params, page: String(page), size: String(pageSize)});
    const result = await api(`${path}?${query}`);
    const batch = Array.isArray(result?.items) ? result.items : [];
    if (rows.length + batch.length > 10000) throw new Error('基础资料超过安全读取上限；请联系管理员检查授权范围');
    rows.push(...batch);
    total = Number(result?.total ?? rows.length);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('服务返回的总行数无效');
    if (rows.length >= total) break;
    if (!batch.length) throw new Error(`服务声称共 ${total} 行，但第 ${page} 页为空；本次没有导出`);
  }
  if (total === null || rows.length !== total) throw new Error(`实际读取 ${rows.length} 行，与授权查询总数 ${text(total)} 不一致；本次没有导出`);
  return rows;
}

async function* pagedItems(path,params={},size=exportPageSize){
  let total=null,received=0;
  for(let page=1;page<=1000000;page++){
    const query=new URLSearchParams({...params,page:String(page),size:String(size)}),result=await api(`${path}?${query}`);
    const batch=Array.isArray(result?.items)?result.items:[],reported=Number(result?.total);
    if(!Number.isSafeInteger(reported)||reported<0)throw new Error('服务返回的总行数无效');
    if(total===null)total=reported;else if(total!==reported)throw new Error('导出期间查询总数发生变化；本次文件未完成，请重新查询后重试');
    if(result?.page!==undefined&&Number(result.page)!==page)throw new Error(`服务返回第 ${text(result.page)} 页，与请求页不符`);
    if(batch.length>size||batch.length===0&&received<total)throw new Error(`第 ${page} 页行数不完整；本次文件未完成`);
    received+=batch.length;
    if(received>total)throw new Error('实际读取行数超过服务端总数；本次文件未完成');
    yield {items:batch,total,page};
    if(received===total)return;
  }
  throw new Error('导出分页超过安全上限');
}

async function readFirstPage(path,params={},size=pageSize){
  for await(const result of pagedItems(path,params,size))return result;
  return {items:[],total:0,page:1};
}

async function collectPagedItems(path,params,maximum){
  const rows=[];
  for await(const page of pagedItems(path,params)){
    if(rows.length+page.items.length>maximum)throw new Error('查询范围已超过客户端小批量上限，请使用流式导出');
    rows.push(...page.items);
  }
  return rows;
}

function catalogIndexes(data){
  const index=()=>new Map(),skus=index(),barcodes=index(),aliases=index();
  for(const row of data?.skus||[]){const list=skus.get(row.product_id)||[];list.push(row);skus.set(row.product_id,list);}
  for(const row of data?.barcodes||[]){const list=barcodes.get(row.product_id)||[];list.push(row);barcodes.set(row.product_id,list);}
  for(const row of data?.aliases||[]){const list=aliases.get(row.product_id)||[];list.push(row);aliases.set(row.product_id,list);}
  return {skus,barcodes,aliases};
}
function* chunks(iterable,size){
  let current=[];for(const item of iterable){current.push(item);if(current.length===size){yield current;current=[];}}
  if(current.length)yield current;
}
function productMatches(product,data,filter,index){
  if(filter.status==='enabled'&&product.enabled===false||filter.status==='disabled'&&product.enabled!==false)return false;
  const q=clean(filter.q).toLocaleLowerCase();if(!q)return true;
  const skus=index.skus.get(product.id)||[],codes=[...(index.barcodes.get(product.id)||[]),...(index.aliases.get(product.id)||[])].map(row=>row.barcode);
  return [product.code,product.name,product.category_name,...codes,...skus.flatMap(row=>[row.id,row.options?.COLOR?.name,row.options?.SIZE?.name,row.options?.SIZE?.code])].join(' ').toLocaleLowerCase().includes(q);
}

function optionRows(rows, labelOf) {
  return rows.map(row => ({value: row.id, label: labelOf(row)}));
}

function statusName(value) {
  return ({APPROVED:'已审核', UNAUDITED:'未审核', DRAFT:'草稿', DELETED:'已作废', CONFIRMED:'已确认'}[value] || text(value) || '未知');
}

function exactMoney(cents) {
  if (cents == null || !/^-?\d+$/.test(String(cents))) return '';
  const amount = BigInt(String(cents));
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function detailSnapshots(detail) {
  if (detail?.documentType === 'CORRECTION' || detail?.correction) {
    const correction=detail.correction||detail.body?.correction||{};
    return [{revision: detail.revision || 1, version: detail.version || 1, operation: '校正确认',
      actor_id:detail.actorId??correction.actorId,actor_name:detail.actorName??detail.actor_name,
      created_at:correction.confirmedAt??detail.createdAt??detail.created_at,
      body: detail.body || {}, current: true, correction}];
  }
  const currentRevision = Number(detail?.current_revision || detail?.revision || 0);
  const byRevision = new Map();
  for (const row of Array.isArray(detail?.history) ? detail.history : []) {
    const revision = Number(row.revision);
    if (row?.body && Number.isSafeInteger(revision) && revision > 0) byRevision.set(revision, {...row, revision, current: revision === currentRevision});
  }
  if (detail?.body && currentRevision > 0 && !byRevision.has(currentRevision)) {
    byRevision.set(currentRevision, {revision: currentRevision, version: detail.version, operation: '当前修订', body: detail.body, current: true});
  }
  return [...byRevision.values()].sort((a, b) => a.revision - b.revision);
}

function bodyHeader(body) { return body?.header && typeof body.header === 'object' ? body.header : {}; }
function rowValue(row, ...keys) { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return row[key]; return ''; }
function documentType(detail) { return detail?.documentType || detail?.document_type || ''; }
function correctionRecord(detail,snapshot){return detail?.correction||snapshot?.correction||detail?.body?.correction||snapshot?.body?.correction||null;}
function documentIdentity(detail,snapshot){
  return rowValue(detail,'id','documentId','document_id','correctionId')||rowValue(correctionRecord(detail,snapshot),'id','documentId','correctionId')||'UNKNOWN';
}
function snapshotActorName(detail,snapshot){
  return rowValue(snapshot,'actor_name','actorName')||rowValue(detail,'actor_name','actorName')||snapshotActorId(detail,snapshot)||
    ((documentType(detail)==='CORRECTION'||detail?.correction)?'UNKNOWN':'');
}
function snapshotActorId(detail,snapshot){
  return rowValue(snapshot,'actor_id','actorId')||rowValue(detail,'actor_id','actorId')||rowValue(correctionRecord(detail,snapshot),'actorId')||
    ((documentType(detail)==='CORRECTION'||detail?.correction)?'UNKNOWN':'');
}
function snapshotOperationTime(detail,snapshot){
  return rowValue(snapshot,'created_at','imported_at','createdAt','confirmedAt')||rowValue(detail,'operationTime','confirmedAt','createdAt','created_at')||
    rowValue(correctionRecord(detail,snapshot),'confirmedAt')||((documentType(detail)==='CORRECTION'||detail?.correction)?'UNKNOWN':'');
}
function documentKind(detail) {
  const type = documentType(detail);
  if (type === 'TRANSFER') return '调拨';
  if (type === 'CORRECTION' || detail?.correction) return '校正';
  if (type === 'SALE') return bodyHeader(detail.body).business_type === 'RETURN_EXCHANGE' ? '退换货' : '销货';
  return '未知';
}
function printWithKind(kind) {
  const surface=document.querySelector(kind==='labels'?'.t27-label-grid':'.t27-print-view');
  if(!surface) return Promise.reject(new Error('当前没有可打印的内容'));
  // A cloned output document has no hidden tab ancestors or page-layout transforms.
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.title=kind==='labels'?'批量标签打印':'单据打印';
    frame.dataset.t27OutputPrintKind=kind;
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    frame.addEventListener('load',()=>{
      try{
        if(!frame.contentWindow)throw new Error('打印页面无法加载');
        frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
        frame.contentWindow.focus();frame.contentWindow.print();resolve();
      }catch(cause){frame.remove();reject(cause);}
    },{once:true});
    frame.srcdoc=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${kind==='labels'?'批量标签':'单据'}打印</title><style>${arcoCss}\n${workbenchCss}</style></head><body data-print-kind="${kind}">${surface.outerHTML}</body></html>`;
    document.body.append(frame);
  });
}

function versionLabel(detail, snapshot) {
  if (snapshot.current) return `当前版本 · V${text(detail.version || snapshot.version || '—')} / R${text(snapshot.revision)}`;
  return `历史版本（只读） · R${text(snapshot.revision)} · ${text(snapshot.operation || '历史修订')}`;
}

function documentWorkbookRows(records) {
  const documents = [['单据类型','单据 ID','单号','营业日','版本状态','业务状态','版本号','修订号','操作','操作人','操作人 ID','操作时间','营业厅 / 仓库','明细行数','结算行数','修订快照(JSON)']];
  const lines = [['单据类型','单据 ID','单号','版本状态','业务状态','修订号','操作人','操作人 ID','操作时间','明细序号','商品 / 款号','SKU ID','颜色','版型','原始尺码','标准尺码','数量','单位','单价','金额','赠品','校正前数量','校正后数量','校正原因','明细原文(JSON)']];
  const settlements = [['单据类型','单据 ID','单号','版本状态','业务状态','修订号','结算序号','收退款方向','收款方式 ID','收款方式','资金账户 ID','资金账户','金额','原始结算行(JSON)']];
  const history = [['单据类型','单据 ID','单号','版本状态','修订号','业务版本','操作','操作人','操作人 ID','操作时间','业务状态']];
  const raw=[workbookJsonHeader];
  for (const record of records) {
    const detail = record.detail;
    const kind = record._kind || record.kind || documentKind(detail);
    const currentStatus = statusName(detail.status);
    const snapshots = detailSnapshots(detail);
    for (const snapshot of snapshots) {
      const body = snapshot.body || {};
      const header = bodyHeader(body);
      const linesInVersion = Array.isArray(body.lines) ? body.lines : [];
      const funds = Array.isArray(body.fundsRecords) ? body.fundsRecords : [];
      const correction = detail?.documentType === 'CORRECTION' || detail?.correction ? correctionRecord(detail,snapshot) : null;
      const id=documentIdentity(detail,snapshot),actorName=snapshotActorName(detail,snapshot),actorId=snapshotActorId(detail,snapshot),operationTime=snapshotOperationTime(detail,snapshot);
      const outputLines = correction ? [correctionWorkbookLine(correction,{documentId:id,actorId,operationTime})] : linesInVersion;
      const state = snapshot.current ? currentStatus : `历史版本（只读） · ${text(snapshot.operation || '修订')}`;
      const context = rowValue(header, 'hall_name','store_name','warehouse_name','source_warehouse_id','source_from_warehouse_id');
      const revisionJson=workbookJsonCell(body,{id,number:detail.number,kind:'修订',revision:snapshot.revision,source:'完整快照'},raw);
      documents.push([kind,id,detail.number,rowValue(header,'business_date') || detail.business_day || detail.businessDay,state,
        snapshot.current ? currentStatus : '历史版本',snapshot.version ?? '',snapshot.revision,snapshot.operation || '',actorName,actorId,operationTime,
        context,outputLines.length,funds.length,revisionJson]);
      history.push([kind,id,detail.number,state,snapshot.revision,snapshot.version ?? '',snapshot.operation || '',actorName,actorId,operationTime,snapshot.current ? currentStatus : '历史版本']);
      outputLines.forEach((line,index) => lines.push([kind,id,detail.number,state,snapshot.current ? currentStatus : '历史版本',snapshot.revision,
        actorName,actorId,operationTime,index+1,
        rowValue(line,'product_code','source_product_code','productCode','product_name','source_product_name','name'),rowValue(line,'sku_id','skuId'),rowValue(line,'color_name','source_color_name','color'),
        rowValue(line,'fit_name','fit'),rowValue(line,'source_size','source_size_name','sourceSize','size'),rowValue(line,'standard_size','standardSize'),
        rowValue(line,'source_quantity','quantity'),rowValue(line,'unit','quantity_unit'),rowValue(line,'unit_price','price'),
        exactMoney(rowValue(line,'net_cents','amount_cents','gross_cents')) || rowValue(line,'amount'),rowValue(line,'gift') === true ? '是' : rowValue(line,'gift'),
        rowValue(line,'book_quantity'),rowValue(line,'actual_quantity'),rowValue(line,'reason'),workbookJsonCell(line,{id:detail.id,number:detail.number,kind:'明细',revision:snapshot.revision,source:'单据明细',index:index+1},raw)]));
      funds.forEach((fund,index) => settlements.push([kind,detail.id,detail.number,state,snapshot.current ? currentStatus : '历史版本',snapshot.revision,index+1,
        rowValue(fund,'direction'),rowValue(fund,'payment_method_id','methodId'),rowValue(fund,'source_payment_method_name','methodName'),
        rowValue(fund,'fund_account_id','accountId'),rowValue(fund,'source_fund_account_name','accountName'),
        rowValue(fund,'amount'),workbookJsonCell(fund,{id:detail.id,number:detail.number,kind:'结算',revision:snapshot.revision,source:'结算明细',index:index+1},raw)]));
    }
    if (!snapshots.length) documents.push([kind,documentIdentity(detail),detail.number,detail.business_day || detail.businessDay,`当前版本 · ${currentStatus}`,currentStatus,detail.version || '',detail.current_revision || detail.revision || '', '', '', '', '', '',0,0,'']);
  }
  return {documents,lines,settlements,history,raw};
}

function inventoryRows(rows) {
  return [['仓库','仓库 ID','仓库状态','商品编码','商品名称','商品 ID','原 SKU ID','原颜色码','原颜色','原尺码码','原尺码','单位','数量','商品版本','SKU 版本','仓库版本','尺码映射状态','映射修订','来源类型','对账差额','已对账'],
    ...rows.map(row => [row.warehouseName,row.warehouseId,row.warehouseEnabled === false ? '已停用' : '正常',row.productCode,row.productName,row.productId,row.skuId,
      row.original?.color?.code,row.original?.color?.name,row.original?.size?.code,row.original?.size?.name,row.unit,row.quantity,
      row.versions?.product,row.versions?.sku,row.versions?.warehouse,row.standard?.mappingStatus,row.standard?.mappingRevision,
      row.basis?.kind,row.basis?.difference,row.basis?.reconciled === true ? '是' : '否'])];
}

function ledgerScopeUnit(balance, warehouseId, skuId) {
  if (Array.isArray(balance?.items)) {
    const matches = balance.items.filter(item => item?.warehouseId === warehouseId && item?.skuId === skuId);
    if (matches.length !== 1) return '单位未知';
    if (matches[0].unitConflict === true) return '单位冲突';
    return clean(matches[0].unit) || '单位未知';
  }
  return clean(balance?.unit) || '单位未知';
}

function ledgerRows(result) {
  const context = result?.exportContext || {};
  return [['仓库 ID','原 SKU ID','单位','发生时间','业务日','类型','流水 ID','单据 ID','版本修订','行号','数量','库存差额','期初余额','期末余额','是否仅历史','历史来源'],
    ...(result?.items || []).map(row => {
      const has = key => Object.prototype.hasOwnProperty.call(row, key);
      const unit = has('unit') ? (row.unitConflict === true ? '单位冲突' : clean(row.unit) || '单位未知') : context.unit || '单位未知';
      return [has('warehouseId') ? text(row.warehouseId) || '未知' : context.warehouseId || '未知',
        has('skuId') ? text(row.skuId) || '未知' : context.skuId || '未知',unit,
        row.time,row.businessDay,row.kind,row.id,row.documentId,row.revision,row.lineIndex,row.quantity,row.stockDelta,row.before,row.after,
        row.historicalOnly === true ? '是' : '否',row.source ? JSON.stringify(row.source) : ''];
    })];
}

async function makeWorkbook(sheets) {
  if (!window.JSZip) throw new Error('Excel 导出组件未加载');
  const rows = sheets.filter(sheet => Array.isArray(sheet.rows) && sheet.rows.length);
  if (!rows.length) throw new Error('没有可导出的行');
  const zip = new window.JSZip();
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const names = rows.map((sheet,index) => text(sheet.name).replace(/[\\/*?:\[\]]/g,' ').slice(0,31) || `Sheet${index+1}`);
  const overrides = names.map((_,index) => `<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  zip.file('[Content_Types].xml',head+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`);
  zip.file('_rels/.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml',head+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,index)=>`<sheet name="${xml(name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',head+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${names.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml',head+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  rows.forEach((sheet,index) => {
    if (sheet.rows.length > 1048576) throw new Error(`工作表“${sheet.name}”超过 Excel 行上限；请缩小筛选范围`);
    const width = sheet.rows.reduce((max,row)=>Math.max(max,Array.isArray(row)?row.length:1),1);
    const columns = Array.from({length:width},(_,i)=>`<col min="${i+1}" max="${i+1}" width="22" customWidth="1"/>`).join('');
    const data = sheet.rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${(Array.isArray(row)?row:[]).map((value,columnIndex)=>{
      const cell=text(value);if(cell.length>32767)throw new Error(`工作表“${sheet.name}”第 ${rowIndex+1} 行的单元格超过 Excel 文本上限`);
      return `<c r="${colName(columnIndex)}${rowIndex+1}" s="0" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
    }).join('')}</row>`).join('');
    zip.file(`xl/worksheets/sheet${index+1}.xml`,head+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${data}</sheetData></worksheet>`);
  });
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

async function downloadWorkbook(sheets, filename) {
  const bytes = await makeWorkbook(sheets);
  const href = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link = document.createElement('a');
  link.href = href;
  link.download = safeName(filename) + '.xlsx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function printDocument(detail, snapshot) {
  const body = snapshot.body || {};
  const header = bodyHeader(body);
  const type = documentType(detail);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const funds = Array.isArray(body.fundsRecords) ? body.fundsRecords : [];
  const correction = type === 'CORRECTION' || detail?.correction ? (detail.correction || body.correction) : null;
  const originalDimensions=correctionDimensions(correction);
  const returnExchange = header.business_type === 'RETURN_EXCHANGE';
  return <article className="t27-print-view">
    <header className="t27-print-heading"><div><strong>奈爵服饰</strong><span>单据打印</span></div><Tag color={snapshot.current?'arcoblue':'orange'}>{versionLabel(detail,snapshot)}</Tag></header>
    <h1>{type==='TRANSFER'?'调拨单':type==='CORRECTION'?'库存校正单':returnExchange?'退换货单':'销货单'}</h1>
    <div className="t27-print-meta">
      <span>单号：{text(detail.number||detail.id)}</span><span>状态：{snapshot.current?statusName(detail.status):'历史版本（只读）'}</span>
      <span>业务日：{text(header.business_date||detail.business_day||detail.businessDay)}</span><span>修订：R{text(snapshot.revision||detail.revision||1)}</span>
      {detail.version!==undefined&&<span>版本：V{text(detail.version)}</span>}
      {header.hall_name&&<span>营业厅：{text(header.hall_name)}</span>}
      {header.source_from_warehouse_id&&<span>调出仓：{text(header.source_from_warehouse_id)}</span>}
      {header.source_to_warehouse_id&&<span>调入仓：{text(header.source_to_warehouse_id)}</span>}
      {header.source_warehouse_id&&<span>仓库：{text(header.source_warehouse_id)}</span>}
      {header.source_party_id&&<span>往来单位 ID：{text(header.source_party_id)}</span>}
    </div>
    {snapshot.current===false&&<Alert className="t27-history-alert" type="warning" content="这是历史版本，只用于核对；打印不会改变当前单据或库存。" />}
    {correction ? <section><h2>校正记录</h2><table><tbody>
      <tr><th>商品 / SKU</th><td>{text(correction.productCode)} / {text(correction.skuId)}</td></tr>
      <tr><th>原颜色</th><td>{text(originalDimensions.color||'未知')}</td></tr><tr><th>原版型</th><td>{text(originalDimensions.fit||'未知')}</td></tr>
      <tr><th>原尺码</th><td>{text(originalDimensions.size||'未知')}</td></tr><tr><th>仓库</th><td>{text(correction.warehouseId)}</td></tr>
      <tr><th>账面数量</th><td>{text(correction.bookQuantity)}</td></tr><tr><th>实际数量</th><td>{text(correction.actualQuantity)}</td></tr>
      <tr><th>校正差额</th><td>{text(correction.delta)} {text(correction.unit)}</td></tr><tr><th>原因</th><td>{text(correction.reason)}</td></tr><tr><th>确认人</th><td>{text(correction.actorId||detail.actorId)}</td></tr>
    </tbody></table></section> : <>
      <section><h2>商品明细（{lines.length} 行）</h2><table className="t27-print-table"><thead><tr><th>#</th><th>款号 / 商品</th><th>颜色 / 版型 / 尺码</th><th>SKU</th><th>数量</th><th>单位</th><th>单价</th><th>金额</th><th>赠品</th></tr></thead><tbody>{lines.map((line,index)=><tr key={text(line.source_id||line.id||index)}>
        <td>{index+1}</td><td>{text(rowValue(line,'product_code','source_product_code','productCode','product_name','source_product_name','name'))}</td><td>{[rowValue(line,'color_name','source_color_name','color'),rowValue(line,'fit_name','fit'),rowValue(line,'source_size','source_size_name','sourceSize','size')].filter(Boolean).map(text).join(' / ')}</td>
        <td>{text(rowValue(line,'sku_id','skuId'))}</td><td>{text(rowValue(line,'source_quantity','quantity'))}</td><td>{text(rowValue(line,'unit','quantity_unit'))}</td>
        <td>{text(rowValue(line,'unit_price','price'))}</td><td>{exactMoney(rowValue(line,'net_cents','amount_cents','gross_cents'))||text(line.amount)}</td><td>{line.gift===true?'是':''}</td>
      </tr>)}</tbody></table></section>
      <section><h2>结算明细（{funds.length} 笔，逐笔保留）</h2>{funds.length?<table className="t27-print-table"><thead><tr><th>#</th><th>方向</th><th>收款方式</th><th>资金账户</th><th>金额</th><th>来源 ID</th></tr></thead><tbody>{funds.map((fund,index)=><tr key={text(fund.source_id||fund.id||index)}><td>{index+1}</td><td>{text(fund.direction)}</td><td>{text(fund.source_payment_method_name||fund.payment_method_name||fund.payment_method_id)}</td><td>{text(fund.source_fund_account_name||fund.fund_account_name||fund.fund_account_id)}</td><td>{text(fund.amount)}</td><td>{text(fund.source_id||fund.settlement_id)}</td></tr>)}</tbody></table>:<p>无结算行</p>}</section>
    </>}
    {header.note&&<section><h2>备注</h2><p>{text(header.note)}</p></section>}
    <footer>奈爵服饰 · 受权读取输出 · 打印不写入业务</footer>
  </article>;
}

function readT27Launch() {
  const tabsByContext={products:['products','labels'],inventory:['inventory','ledger'],transfer:['documents'],sales:['documents']};
  const defaultTabByContext={products:'products',inventory:'inventory',transfer:'documents',sales:'documents'};
  const routes={products:'products',inventory:'inventory',transfer:'transfer',sales:'sales'};
  const params=new URLSearchParams(window.location.search),candidateContext=params.get('context');
  const context=Object.prototype.hasOwnProperty.call(tabsByContext,candidateContext)?candidateContext:'';
  const requestedTab=params.get('tab'),tab=tabsByContext[context]?.includes(requestedTab)?requestedTab:(defaultTabByContext[context]||'products');
  const candidateReturn=params.get('returnTo'),returnTo=candidateReturn===context&&Object.prototype.hasOwnProperty.call(routes,candidateReturn)?candidateReturn:'';
  return {tab,context,returnHref:returnTo?`index.html#${routes[returnTo]}`:'index.html',documentKind:context==='transfer'?'transfer':context==='sales'?'sale':'all'};
}

function T27App() {
  const launch=readT27Launch();
  const [activeTab,setActiveTab] = useState(()=>launch.tab);
  const [employee,setEmployee] = useState(null);
  const [booting,setBooting] = useState(true);
  const [catalog,setCatalog] = useState(null);
  const [warehouses,setWarehouses] = useState([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [notice,setNotice] = useState('');
  const [products,setProducts] = useState([]);
  const [productTotal,setProductTotal] = useState(0);
  const [productRowsEstimate,setProductRowsEstimate] = useState(0);
  const [productFilter,setProductFilter] = useState({q:'',status:'all'});
  const [productQuery,setProductQuery] = useState(null);
  const [inventory,setInventory] = useState([]);
  const [inventoryInfo,setInventoryInfo] = useState(null);
  const [inventoryFilter,setInventoryFilter] = useState({q:'',warehouseId:'',productId:'',unit:'',nonzero:false});
  const [documents,setDocuments] = useState([]);
  const [mobileDocumentPage,setMobileDocumentPage] = useState(1);
  const [documentSources,setDocumentSources] = useState([]);
  const [documentTotal,setDocumentTotal] = useState(0);
  const [docFilter,setDocFilter] = useState(()=>({kind:launch.documentKind,q:'',status:'all',start:'',end:'',warehouseId:'',skuId:''}));
  const [ledger,setLedger] = useState(null);
  const [ledgerFilter,setLedgerFilter] = useState({warehouseId:'',skuId:'',start:'',end:''});
  const [ledgerQuery,setLedgerQuery] = useState(null);
  const [exportJobId,setExportJobId] = useState(()=>{try{return sessionStorage.getItem('t27-export-job-id')||'';}catch{return '';}});
  const [exportJob,setExportJob] = useState(null);
  const [queryingExportJob,setQueryingExportJob] = useState(false);
  const [skuId,setSkuId] = useState('');
  const [barcode,setBarcode] = useState('');
  const [labelCount,setLabelCount] = useState(1);
  const [labelQueue,setLabelQueue] = useState([]);
  const [barcodeError,setBarcodeError] = useState('');
  const [preview,setPreview] = useState(null);
  const printRoot = useRef(null);
  const transferFrame = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const session = await api('/runtime/session');
        if (!session?.employee) { if (live) setError('当前没有有效登录。请返回 ERP 登录后重新打开导出/打印。'); return; }
        if (live) setEmployee(session.employee);
        const [catalogResult, warehouseResult] = await Promise.all([
          api('/runtime/catalog'),
          fetchAllPages('/reference/warehouses'),
        ]);
        if (live) { setCatalog(catalogResult); setWarehouses(warehouseResult); }
      } catch (cause) { if (live) setError(cause?.message || '无法读取当前账号可访问的数据'); }
      finally { if (live) setBooting(false); }
    })();
    return () => { live = false; };
  }, []);

  useEffect(()=>{
    const sweep=()=>{void cleanupStaleStreamingWorkbookSpools({staleAfterMs:outputSpoolStaleAfterMs}).catch(()=>{});};
    sweep();
    const timer=window.setInterval(sweep,outputJobRefreshMs);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!exportJobId)return undefined;
    let live=true,timer=null;
    const poll=async()=>{
      try{
        const job=await api(`/outputs/export-jobs/${encodeURIComponent(exportJobId)}`);
        if(!live)return;
        setExportJob(job);
        if(job.status==='failed')await removeStreamingWorkbookSpool(exportJobId);
        else if(job.status==='queued'||job.status==='running')timer=window.setTimeout(poll,outputJobRefreshMs);
      }catch(cause){
        if(!live)return;
        if(cause?.status===404){
          setExportJob({id:exportJobId,status:'failed',phase:'任务记录已过期',completedUnits:0,totalUnits:0,rows:{},error:'任务记录已不存在；临时工作文件已回收'});
          await removeStreamingWorkbookSpool(exportJobId);
        }else{
          setError(cause?.message||'导出任务状态暂不可查');
          timer=window.setTimeout(poll,outputJobRefreshMs);
        }
      }
    };
    void poll();
    return()=>{live=false;if(timer!==null)window.clearTimeout(timer);};
  },[exportJobId]);

  const productById = useMemo(() => new Map((catalog?.products||[]).map(row=>[row.id,row])),[catalog]);
  const skuById = useMemo(() => new Map((catalog?.skus||[]).map(row=>[row.id,row])),[catalog]);
  const catalogIndex = useMemo(()=>catalogIndexes(catalog),[catalog]);
  const productOptions = useMemo(() => optionRows(catalog?.products||[],row=>`${row.code} · ${row.name}`),[catalog]);
  const warehouseOptions = useMemo(() => optionRows(warehouses,row=>`${row.name||row.code} · ${row.code||row.id}`),[warehouses]);
  const skuOptions = useMemo(() => optionRows(catalog?.skus||[],row=>{
    const product=productById.get(row.product_id)||{},color=row.options?.COLOR||{},size=row.options?.SIZE||{};
    return `${product.code||''} ${product.name||''} · ${text(color.name)} / ${text(size.sourceName||size.name)} · ${row.id}`;
  }),[catalog,productById]);
  const codesForSku = useMemo(() => {
    const rows=[...(catalog?.barcodes||[]),...(catalog?.aliases||[])].filter(row=>row.sku_id===skuId&&row.barcode);
    return [...new Map(rows.map(row=>[String(row.barcode),{value:String(row.barcode),label:`${String(row.barcode)}${row.origin==='MANUAL'?' · 人工旧码':''}`}])).values()];
  },[catalog,skuId]);

  const setProductDraft=(key,value)=>setProductFilter(old=>({...old,[key]:value}));
  const setInventoryDraft=(key,value)=>setInventoryFilter(old=>({...old,[key]:value}));
  const setDocDraft=(key,value)=>setDocFilter(old=>({...old,[key]:value}));
  const setLedgerDraft=(key,value)=>setLedgerFilter(old=>({...old,[key]:value}));

  async function outputCommand(path,body,taskId){
    return window.ERP_API.request(path,body,{mode:'command',operationId:'outputs.export',objectId:taskId,requestId:crypto.randomUUID(),expire:false});
  }
  async function registerOutputJob(kind,totalUnits){
    const taskId=crypto.randomUUID();
    const row=await outputCommand('/outputs/export-jobs',{taskId,kind,totalUnits},taskId);
    try{sessionStorage.setItem('t27-export-job-id',taskId);}catch{}
    setExportJob(row);setExportJobId(taskId);return taskId;
  }
  async function publishOutputJob(taskId,progress){
    const row=await outputCommand(`/outputs/export-jobs/${encodeURIComponent(taskId)}/progress`,progress,taskId);
    setExportJob(row);return row;
  }
  async function refreshOutputJob(){
    if(!exportJobId)return;
    setQueryingExportJob(true);
    try{setExportJob(await api(`/outputs/export-jobs/${encodeURIComponent(exportJobId)}`));}
    catch(cause){setError(cause?.message||'导出任务状态暂不可查');}
    finally{setQueryingExportJob(false);}
  }
  async function streamLargeWorkbook(kind,totalUnits,filename,sheetSpecs,produce){
    if(typeof window.showSaveFilePicker!=='function')throw new Error('大导出需要新版 Chrome 或 Edge 才能直接写入文件');
    const saveHandle=await window.showSaveFilePicker({suggestedName:`${safeName(filename)}.xlsx`,types:[{description:'Excel 工作簿',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
    const taskId=await registerOutputJob(kind,totalUnits);
    let workbook=null,units=0,pagesSincePublish=0;
    const rowsBySheet={};
    let heartbeatTimer=null,heartbeatBusy=false,publishTail=Promise.resolve();
    const queueProgress=progress=>{
      const pending=publishTail.then(()=>publishOutputJob(taskId,typeof progress==='function'?progress():progress));
      publishTail=pending.catch(()=>{});return pending;
    };
    try{
      workbook=await createStreamingWorkbook({taskId,sheets:sheetSpecs,saveHandle});
      await queueProgress({completedUnits:0,phase:'读取并写入分批数据',status:'running'});
      heartbeatTimer=window.setInterval(()=>{
        if(heartbeatBusy||!workbook)return;
        heartbeatBusy=true;
        void (async()=>{
          try{
            await workbook?.touch();
            await queueProgress(()=>({completedUnits:units,phase:'导出心跳续租',rows:rowsBySheet,status:'running'}));
          }catch{}finally{heartbeatBusy=false;}
        })();
      },outputJobHeartbeatMs);
      setNotice(`导出任务 ${taskId}：准备读取 ${totalUnits} 项；每批读取后会直接写入本地临时文件。`);
      await produce({
        append:async(sheetIndex,rows)=>{await workbook.append(sheetIndex,rows);rowsBySheet[`sheet${sheetIndex+1}`]=workbook.rowCounts[sheetIndex];},
        advance:async(count,phase)=>{
          units+=count;pagesSincePublish++;setNotice(`任务 ${taskId} · ${phase} · ${units}/${totalUnits}`);
          if(pagesSincePublish>=5||units===totalUnits){pagesSincePublish=0;await queueProgress({completedUnits:units,phase,rows:rowsBySheet,status:'running'});}
        },
      });
      if(units!==totalUnits)throw new Error(`已读取 ${units} 项，与授权查询总数 ${totalUnits} 不一致；文件没有完成`);
      const rowCounts=await workbook.finish();workbook=null;
      for(let i=0;i<rowCounts.length;i++)rowsBySheet[`sheet${i+1}`]=rowCounts[i];
      const completed=await queueProgress({completedUnits:totalUnits,phase:'文件已写入并完成行数核对',rows:rowsBySheet,status:'completed'});
      setNotice(`导出完成：${totalUnits} 项，任务编号 ${completed.id}。工作簿已写入所选位置。`);
    }catch(cause){
      const incompleteWorkbook=workbook;workbook=null;
      await incompleteWorkbook?.abort(cause);
      try{await queueProgress({completedUnits:units,phase:'导出失败',rows:rowsBySheet,status:'failed',error:cause?.message||'导出失败'});}catch{}
      throw cause;
    }finally{if(heartbeatTimer!==null)window.clearInterval(heartbeatTimer);}
  }

  async function runProducts() {
    if (!catalog) return;
    setBusy('商品');setError('');setNotice('');
    const query={...productFilter},preview=[];let total=0,estimatedRows=0;
    for(const product of catalog.products||[])if(productMatches(product,catalog,query,catalogIndex)){
      total++;if(preview.length<pageSize)preview.push(product);
      estimatedRows+=1+(catalogIndex.skus.get(product.id)||[]).length+(catalogIndex.barcodes.get(product.id)||[]).length+(catalogIndex.aliases.get(product.id)||[]).length;
    }
    setProducts(preview);setProductTotal(total);setProductRowsEstimate(estimatedRows);setProductQuery(query);
    setNotice(`商品查询完成：${total} 个商品；当前最多显示 ${preview.length} 个，导出仍按授权分页读取全部匹配结果。`);setBusy('');
  }

  async function exportProducts() {
    if(!productTotal||!catalog||!productQuery)return;
    setBusy('导出商品');setError('');setNotice('正在按商品分批复核输出权限…');
    try {
      const matches=function*(){for(const product of catalog.products||[])if(productMatches(product,catalog,productQuery,catalogIndex))yield product;};
      const sampleSheets=productSheets([], {products:[],skus:[],barcodes:[],aliases:[]});
      if(productRowsEstimate<=streamThreshold){
        let completed=0;
        for(const candidates of chunks(matches(),100)){
          const batch=await loadOutputProductBatch(candidates.map(row=>row.id));
          const data={products:batch.map(row=>row.product),skus:batch.flatMap(row=>row.skus||[]),barcodes:batch.flatMap(row=>row.barcodes||[]),aliases:batch.flatMap(row=>row.aliases||[])};
          const projected=productSheets(data.products,data);
          for(let i=0;i<sampleSheets.length;i++)sampleSheets[i].rows.push(...projected[i].rows.slice(1));
          completed+=batch.length;
        }
        if(completed!==productTotal)throw new Error(`商品实际读取 ${completed} 个，与查询总数 ${productTotal} 不一致；没有导出`);
        await downloadWorkbook(sampleSheets,`T27-商品-${productTotal}个`);
        setNotice(`已导出 ${productTotal} 个受权商品及原 SKU、条码绑定。`);
      }else{
        const specs=sampleSheets.map(sheet=>({name:sheet.name,headers:sheet.rows[0]}));let completed=0;
        await streamLargeWorkbook('products',productTotal,`T27-商品-${productTotal}个`,specs,async({append,advance})=>{
          for(const candidates of chunks(matches(),100)){
            const batch=await loadOutputProductBatch(candidates.map(row=>row.id));
            const data={products:batch.map(row=>row.product),skus:batch.flatMap(row=>row.skus||[]),barcodes:batch.flatMap(row=>row.barcodes||[]),aliases:batch.flatMap(row=>row.aliases||[])};
            const projected=productSheets(data.products,data);
            for(let i=0;i<projected.length;i++)await append(i,projected[i].rows.slice(1));
            completed+=batch.length;await advance(batch.length,'商品、原 SKU 与条码分批写入');
          }
          if(completed!==productTotal)throw new Error(`商品实际读取 ${completed} 个，与查询总数 ${productTotal} 不一致`);
        });
      }
    } catch(cause) { setError(cause?.message||'商品导出失败'); }
    finally { setBusy(''); }
  }

  async function loadOutputProductBatch(ids){
    if(!ids.length||ids.length>100)throw new Error('商品导出批次超出 100 个商品');
    const query=new URLSearchParams({ids:ids.join(',')}),result=await api(`/outputs/products?${query}`),rows=Array.isArray(result?.records)?result.records:[];
    if(rows.length!==ids.length||rows.some(row=>!row?.product))throw new Error('商品授权分页读取不完整；本次没有生成文件');
    return rows;
  }

async function runInventory() {
    setBusy('库存');setError('');setNotice('');
    try {
      const params={view:'original',...(inventoryFilter.warehouseId?{warehouseId:inventoryFilter.warehouseId}:{}),...(inventoryFilter.productId?{productId:inventoryFilter.productId}:{}),
        ...(clean(inventoryFilter.q)?{q:clean(inventoryFilter.q)}:{}),...(clean(inventoryFilter.unit)?{unit:clean(inventoryFilter.unit)}:{}),...(inventoryFilter.nonzero?{nonzero:'true'}:{})};
      const page=await readFirstPage('/runtime/inventory',params,pageSize),rows=page.items;
      const units=[...new Set(rows.map(row=>clean(row.unit)||'单位未知'))];
      setInventory(rows);setInventoryInfo({total:page.total,shown:rows.length,units,params});
      setNotice(`库存查询完成：共 ${page.total} 行，预览 ${rows.length} 行；导出按授权分页读取全部，保留原 SKU 和计量单位。`);
    } catch(cause){setError(cause?.message||'库存查询失败');setInventory([]);setInventoryInfo(null)} finally {setBusy('')}
  }

  async function exportInventory(){
    if(!inventoryInfo?.params||!inventoryInfo.total)return;
    setBusy('库存导出');setError('');
    try{
      if(inventoryInfo.total<=streamThreshold){
        const rows=await collectPagedItems('/runtime/inventory',inventoryInfo.params,streamThreshold);
        if(rows.length!==inventoryInfo.total)throw new Error(`库存实际读取 ${rows.length} 行，与查询总数 ${inventoryInfo.total} 不一致`);
        await downloadWorkbook([{name:'原 SKU 库存',rows:inventoryRows(rows)}],`T27-库存-${rows.length}行`);
        setNotice(`已导出 ${rows.length} 行原 SKU 库存，各单位分别保留。`);return;
      }
      const headers=inventoryRows([])[0],specs=[{name:'原 SKU 库存',headers}];
      await streamLargeWorkbook('inventory',inventoryInfo.total,`T27-库存-${inventoryInfo.total}行`,specs,async({append,advance})=>{
        for await(const page of pagedItems('/runtime/inventory',inventoryInfo.params)){
          if(page.total!==inventoryInfo.total)throw new Error('库存总数在查询与导出间发生变化；本次文件未完成');
          const rows=inventoryRows(page.items).slice(1);await append(0,rows);await advance(page.items.length,'原 SKU 库存分批写入');
        }
      });
    }catch(cause){setError(cause?.message||'库存导出失败');}finally{setBusy('');}
  }

  async function runDocuments() {
    setBusy('单据');setError('');setNotice('');
    try {
      const filter={...(clean(docFilter.q)?{q:clean(docFilter.q)}:{}),...(docFilter.start?{start:docFilter.start}:{}),...(docFilter.end?{end:docFilter.end}:{}),
        ...(docFilter.status!=='all'?{status:[docFilter.status]}:{})};
      const sources=[];
      if(docFilter.kind==='all'||docFilter.kind==='sale')sources.push({key:'sale',path:'/sales/documents',params:{type:'SALE',filters:JSON.stringify(filter)}});
      if(docFilter.kind==='all'||docFilter.kind==='transfer')sources.push({key:'transfer',path:'/runtime/documents',params:{type:'TRANSFER',filters:JSON.stringify(filter)}});
      if(docFilter.kind==='correction') {
        if(!docFilter.warehouseId||!docFilter.skuId) throw new Error('库存校正输出需要先选择仓库和原 SKU');
        if(docFilter.status==='all'||docFilter.status==='CONFIRMED')sources.push({key:'correction',path:'/corrections',params:{warehouseId:docFilter.warehouseId,skuId:docFilter.skuId,
          ...(filter.start?{start:filter.start}:{}),...(filter.end?{end:filter.end}:{}),...(filter.q?{q:filter.q}:{})}});
      }
      const first=await Promise.all(sources.map(async source=>({...source,...await readFirstPage(source.path,source.params,pageSize)})));
      const rows=[];let total=0;
      for(const source of first){total+=source.total;for(const row of source.items){
        if(source.key==='sale')rows.push({...row,_kind:bodyHeader(row.body).business_type==='RETURN_EXCHANGE'?'退换货':'销货'});
        else if(source.key==='transfer')rows.push({...row,_kind:'调拨'});
        else rows.push({...row,id:row.correctionId,version:row.version,current_revision:1,status:'CONFIRMED',business_day:row.businessDay,_kind:'校正'});
      }}
      rows.sort((a,b)=>text(b.business_day||b.businessDay).localeCompare(text(a.business_day||a.businessDay))||text(a.number).localeCompare(text(b.number),'zh-CN',{numeric:true}));
      setDocuments(rows);setMobileDocumentPage(1);setDocumentSources(first.map(({key,path,params,total})=>({key,path,params,total})));setDocumentTotal(total);
      setNotice(`单据查询完成：符合条件 ${total} 张，当前预览 ${rows.length} 张；导出会逐页读取全部匹配单据及版本。`);
    } catch(cause){setError(cause?.message||'单据查询失败');setDocuments([]);setMobileDocumentPage(1);setDocumentSources([]);setDocumentTotal(0)} finally {setBusy('')}
  }

  async function loadDocument(row,intent='print') {
    const data=await api(`/outputs/documents/${encodeURIComponent(row.id)}?intent=${intent}`);
    return {...row,detail:data};
  }

  function documentRow(source,row){
    if(source.key==='sale')return {...row,_kind:bodyHeader(row.body).business_type==='RETURN_EXCHANGE'?'退换货':'销货'};
    if(source.key==='transfer')return {...row,_kind:'调拨'};
    return {...row,id:row.correctionId,version:row.version,current_revision:1,status:'CONFIRMED',business_day:row.businessDay,_kind:'校正'};
  }

  async function readDocumentForExport(row){
    const loaded=await loadDocument(row,'export'),encoded=JSON.stringify(loaded.detail);
    if(typeof encoded!=='string'||encoded.length>correctionDetailLimit)throw new Error(`单据 ${text(row.number||row.id)} 的修订快照超过单条安全上限；请缩小筛选范围`);
    return loaded;
  }

  async function showPrint(row) {
    setBusy('打印');setError('');setNotice('');
    try { const loaded=await loadDocument(row,'print');setPreview({record:loaded,snapshots:detailSnapshots(loaded.detail),selectedRevision:''}); }
    catch(cause){setError(cause?.message||'单据读取失败');}
    finally{setBusy('')}
  }

  async function exportDocuments() {
    if(!documentTotal||!documentSources.length)return;
    setBusy('导出单据');setError('');setNotice('正在逐张复核授权并读取单据版本…');
    try {
      const headers=documentWorkbookRows([]),smallLimit=20;
      if(documentTotal<=smallLimit){
        const rows=[];
        for(const source of documentSources)for await(const page of pagedItems(source.path,source.params)){
          if(page.total!==source.total)throw new Error('单据总数在查询与导出间发生变化；请重新查询后重试');
          for(const item of page.items)rows.push(documentRow(source,item));
        }
        if(rows.length!==documentTotal)throw new Error(`单据分页读取 ${rows.length} 张，与查询总数 ${documentTotal} 不一致`);
        const keys=['documents','lines','settlements','history','raw'];
        const tables=Object.fromEntries(keys.map(key=>[key,[headers[key][0]]]));
        let aggregateCharacters=0;
        for(const row of rows){
          const loaded=await readDocumentForExport(row),encoded=JSON.stringify(loaded.detail);aggregateCharacters+=encoded.length;
          if(aggregateCharacters>correctionDetailLimit)throw new Error('本次单据内容超出小批量内存上限；请按日期或单据类型缩小范围后重试');
          const projected=documentWorkbookRows([loaded]);
          for(const key of keys)tables[key].push(...projected[key].slice(1));
        }
        await downloadWorkbook([{name:'单据版本',rows:tables.documents},{name:'单据明细',rows:tables.lines},{name:'结算明细',rows:tables.settlements},{name:'历史版本',rows:tables.history},{name:'JSON 原文',rows:tables.raw}],`T27-单据-${documentTotal}张`);
        setNotice(`已导出 ${documentTotal} 张单据，共 ${tables.lines.length-1} 条明细、${tables.settlements.length-1} 笔结算；历史版本已逐版标记。`);return;
      }
      const specs=[{name:'单据版本',headers:headers.documents[0]},{name:'单据明细',headers:headers.lines[0]},
        {name:'结算明细',headers:headers.settlements[0]},{name:'历史版本',headers:headers.history[0]},{name:'JSON 原文',headers:headers.raw[0]}];
      await streamLargeWorkbook('documents',documentTotal,`T27-单据-${documentTotal}张`,specs,async({append,advance})=>{
        let completed=0;
        for(const source of documentSources)for await(const page of pagedItems(source.path,source.params)){
          if(page.total!==source.total)throw new Error('单据总数在查询与导出间发生变化；本次文件未完成');
          for(const item of page.items){
            const loaded=await readDocumentForExport(documentRow(source,item)),projected=documentWorkbookRows([loaded]);
            const keys=['documents','lines','settlements','history','raw'];
            for(let index=0;index<keys.length;index++)await append(index,projected[keys[index]].slice(1));
            completed++;await advance(1,'单据、历史版本、明细与结算分批写入');
          }
        }
        if(completed!==documentTotal)throw new Error(`单据实际读取 ${completed} 张，与查询总数 ${documentTotal} 不一致`);
      });
    } catch(cause){setError(cause?.message||'单据导出失败');}
    finally{setBusy('')}
  }

  async function runLedger() {
    if(!ledgerFilter.warehouseId||!ledgerFilter.skuId){setError('流水查询需要选择一个仓库和一个原 SKU');return}
    setBusy('流水');setError('');setNotice('');
    try {
      const params={warehouseId:ledgerFilter.warehouseId,skuId:ledgerFilter.skuId,view:'original',...(ledgerFilter.start?{start:ledgerFilter.start}:{}),...(ledgerFilter.end?{end:ledgerFilter.end}:{})};
      const first=await readFirstPage('/runtime/ledger',params,pageSize);
      const exportContext={warehouseId:params.warehouseId,skuId:params.skuId,unit:ledgerScopeUnit(first.balance,params.warehouseId,params.skuId)};
      setLedger({...first,exportContext});setLedgerQuery(params);setNotice(`流水查询完成：共 ${first.total} 行，当前预览 ${first.items.length} 行；导出会按授权分页读取，期初/当期/历史来源分别保留。`);
    } catch(cause){setError(cause?.message||'流水查询失败');setLedger(null)} finally{setBusy('')}
  }

  async function exportLedger(){
    if(!ledgerQuery||!ledger?.total)return;
    setBusy('流水导出');setError('');
    try{
      if(ledger.total<=streamThreshold){
        const items=await collectPagedItems('/runtime/ledger',ledgerQuery,streamThreshold),result={...ledger,items};
        if(items.length!==ledger.total)throw new Error(`流水实际读取 ${items.length} 行，与查询总数 ${ledger.total} 不一致`);
        await downloadWorkbook([{name:'库存流水',rows:ledgerRows(result)}],`T27-流水-${items.length}行`);
        setNotice(`已导出 ${items.length} 行原 SKU 库存流水；期初、当期与历史来源保持逐行记录。`);return;
      }
      const specs=[{name:'库存流水',headers:ledgerRows({...ledger,items:[]})[0]}];
      await streamLargeWorkbook('ledger',ledger.total,`T27-流水-${ledger.total}行`,specs,async({append,advance})=>{
        for await(const page of pagedItems('/runtime/ledger',ledgerQuery)){
          if(page.total!==ledger.total)throw new Error('流水总数在查询与导出间发生变化；本次文件未完成');
          await append(0,ledgerRows({...ledger,items:page.items}).slice(1));await advance(page.items.length,'原 SKU 库存流水分批写入');
        }
      });
    }catch(cause){setError(cause?.message||'流水导出失败');}finally{setBusy('');}
  }

  async function validateAndQueueLabel() {
    if(!skuId||!barcode)return;
    const count=Number(labelCount),already=labelQueue.reduce((sum,row)=>sum+row.count,0);
    if(!Number.isSafeInteger(count)||count<1||count>100||already+count>300){setError('每批每个 SKU 可设 1–100 张，当前批次总量上限 300 张');return}
    const sku=skuById.get(skuId),product=sku&&productById.get(sku.product_id);
    if(!sku||!product){setError('所选商品规格已不可用，请重新选择');return}
    setBusy('校验标签');setError('');setNotice('');setBarcodeError('');
    try {
      const query=new URLSearchParams({code:barcode,skuId});
      const verified=await api(`/outputs/barcode-labels/${encodeURIComponent(product.id)}?${query}`);
      const size=sku.options?.SIZE||{},color=sku.options?.COLOR||{};
      setLabelQueue(old=>[...old,{key:crypto.randomUUID(),...verified,productName:product.name,fitName:product.fit_name||sku.fit_id,sourceSize:size.sourceName||size.name,colorName:color.name,count}]);
      setNotice(`已将 ${product.code} / ${text(color.name)} / ${text(size.sourceName||size.name)} 的 ${count} 张唯一 SKU 标签加入批次。`);
    } catch(cause){setError(cause?.message||'条码校验失败；没有生成标签');}
    finally{setBusy('')}
  }

  useEffect(()=>{
    setBarcodeError('');
    if(!labelQueue.length)return;
    if(typeof window.JsBarcode!=='function'){setBarcodeError('Code 128 组件未加载，不能打印标签');return}
    try {
      for(const svg of printRoot.current?.querySelectorAll('svg[data-barcode]')||[]) window.JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',width:1.25,height:35,margin:2,fontSize:9,textMargin:1,displayValue:true});
    } catch(cause) { setBarcodeError(cause?.message||'条码内容不符合 Code 128，不能打印标签'); }
  },[labelQueue]);

  async function printLabels() {
    if(!labelQueue.length||barcodeError)return;
    setBusy('复核标签');setError('');setNotice('打印前正在重新检查每个条码的当前唯一绑定…');
    try {
      for(const row of labelQueue){
        const query=new URLSearchParams({code:row.code,skuId:row.skuId});
        const latest=await api(`/outputs/barcode-labels/${encodeURIComponent(row.productId)}?${query}`);
        if(latest.skuId!==row.skuId||latest.productId!==row.productId||latest.code!==row.code)throw new Error('条码绑定已变化；请重新核对标签批次');
      }
      await printWithKind('labels');setNotice(`已打开打印预览：${labelQueue.reduce((sum,row)=>sum+row.count,0)} 张标签；业务数据未写入。`);
    } catch(cause){setError(cause?.message||'标签复核失败；没有打开打印');}
    finally{setBusy('')}
  }

  async function printCurrentDocument() {
    if(!preview)return;
    if(documentType(preview.record.detail)==='TRANSFER'){
      const frame=transferFrame.current;
      if(!frame?.contentWindow||frame.contentDocument?.readyState!=='complete'||frame.contentDocument?.querySelector('[data-print-revision]')?.dataset.printRevision!==String(selectedSnapshot?.revision)){
        setError('调拨打印预览仍在加载，请稍候再打印');return;
      }
      frame.contentWindow.focus();frame.contentWindow.print();return;
    }
    try{await printWithKind('document');}catch(cause){setError(cause?.message||'单据打印页面无法加载');}
  }

  const docColumns=[
    {title:'类型',dataIndex:'_kind',width:78},
    {title:'单号',dataIndex:'number',width:150,ellipsis:true},
    {title:'业务日',render:(_,row)=>text(row.business_day||row.businessDay||bodyHeader(row.body).business_date)},
    {title:'状态',width:96,render:(_,row)=><Tag color={row.status==='APPROVED'?'green':row.status==='DELETED'?'red':'arcoblue'}>{statusName(row.status)}</Tag>},
    {title:'版本 / 修订',width:120,render:(_,row)=>`V${text(row.version||1)} / R${text(row.current_revision||row.revision||1)}`},
    {title:'明细行',width:82,render:(_,row)=>row.body?.lines?.length ?? (row.correction ? 1 : 0)},
    {title:'操作',width:100,render:(_,row)=><Button size="small" type="text" onClick={()=>showPrint(row)}>查看与打印</Button>},
  ];
  const mobileDocumentRows=documents.slice((mobileDocumentPage-1)*20,mobileDocumentPage*20);

  const inventoryColumns=[
    {title:'商品',dataIndex:'productName',width:170,ellipsis:true},
    {title:'商品码',dataIndex:'productCode',width:110},
    {title:'原 SKU',dataIndex:'skuId',width:125,ellipsis:true},
    {title:'仓库',dataIndex:'warehouseName',width:120},
    {title:'颜色',render:(_,row)=>row.original?.color?.name||'未知'},
    {title:'原尺码',render:(_,row)=>row.original?.size?.sourceName||row.original?.size?.name||'未知'},
    {title:'单位',dataIndex:'unit',width:75,render:value=>value||'单位未知'},
    {title:'数量',dataIndex:'quantity',width:100,align:'right'},
    {title:'版本',width:100,render:(_,row)=>`商品 ${text(row.versions?.product)} · SKU ${text(row.versions?.sku)}`},
  ];

  const ledgerColumns=[{title:'业务日',dataIndex:'businessDay',width:100},{title:'类型',dataIndex:'kind',width:130},{title:'数量',dataIndex:'quantity',width:100},{title:'库存差额',dataIndex:'stockDelta',width:100},{title:'变动前',dataIndex:'before',width:100},{title:'变动后',dataIndex:'after',width:100},{title:'版本',dataIndex:'revision',width:85},{title:'来源',width:100,render:(_,row)=>row.historicalOnly?'仅历史':'当前流水'}];

  const selectedSnapshot=preview&&(preview.snapshots.find(row=>String(row.revision)===String(preview.selectedRevision))||preview.snapshots.find(row=>row.current)||preview.snapshots.at(-1));
  const transferPreview=useMemo(()=>{
    if(!selectedSnapshot||documentType(preview?.record.detail)!=='TRANSFER')return null;
    try{return {html:renderTransferPrint(preview.record.detail,selectedSnapshot,{versionLabel:versionLabel(preview.record.detail,selectedSnapshot),statusLabel:selectedSnapshot.current?statusName(preview.record.detail.status):'历史版本（只读）'})};}
    catch(cause){return {error:cause?.message||'调拨快照无法生成打印预览'};}
  },[preview,selectedSnapshot]);

  if(booting)return <div className="t27-loading"><Spin tip="正在读取当前账号与授权数据…"/></div>;
  if(error&&!employee)return <div className="t27-page"><Alert type="error" content={error}/><Button type="secondary" href="index.html">返回 ERP 登录</Button></div>;

  const correctionSkuId=docFilter.skuId;
  const correctionOptions=skuOptions;
  const selectedSku=skuById.get(skuId),selectedSkuProduct=selectedSku&&productById.get(selectedSku.product_id);
  const selectedCodeMatches=barcode?(catalog?.skus||[]).filter(row=>[...(catalog?.barcodes||[]),...(catalog?.aliases||[])].some(code=>code.sku_id===row.id&&String(code.barcode)===barcode)):[];
  const labelTotal=labelQueue.reduce((sum,row)=>sum+row.count,0);

  return <div className="t27-page" ref={printRoot}>
    <header className="t27-page-head"><div><div className="t27-eyebrow">公共能力 · T27</div><h1>导出、打印与批量标签</h1><p>当前账号：{employee?.name||employee?.loginName||employee?.id} · {employee?.role||'已登录'} · 输出只读业务资料</p></div><Button href={launch.returnHref}>返回原页面</Button></header>
    <Alert className="t27-scope-alert" type="info" content="筛选和读取由已授权接口执行。商品码按文本写入 Excel；原 SKU、数量单位、单据状态、版本和每笔结算均单独保留。打印不会提交或修改业务。" />
    {error&&<Alert className="t27-feedback" type="error" content={error} closable onClose={()=>setError('')}/>}
    {notice&&<Alert className="t27-feedback" type="success" content={notice} closable onClose={()=>setNotice('')}/>}
    {exportJobId&&<section className="t27-export-job" aria-live="polite">
      <div><strong>最近一次大导出任务</strong><div className="t27-export-job-id">任务编号：{exportJob?.id||exportJobId}</div></div>
      {exportJob&&<div className="t27-export-job-progress">
        <Tag color={exportJob.status==='completed'?'green':exportJob.status==='failed'?'red':exportJob.status==='running'?'arcoblue':'gray'}>{({queued:'排队中',running:'处理中',completed:'已完成',failed:'失败'})[exportJob.status]||exportJob.status}</Tag>
        <span>{exportJob.phase}</span><span>{exportJob.completedUnits}/{exportJob.totalUnits} 项</span>
        {Object.keys(exportJob.rows||{}).length>0&&<span>工作表行数：{Object.entries(exportJob.rows).map(([name,count])=>`${name} ${count}`).join(' · ')}</span>}
        {exportJob.error&&<span>{exportJob.error}</span>}
      </div>}
      <Button size="small" loading={queryingExportJob} onClick={refreshOutputJob}>查询进度</Button>
    </section>}
    <Tabs className="t27-tabs" type="line" lazyload={false} activeTab={activeTab} onChange={setActiveTab}>
      <Tabs.TabPane key="products" title="商品与条码">
        <div className="t27-panel">
          <div className="t27-toolbar">
            <Input aria-label="商品筛选" placeholder="搜索商品码、名称、SKU 或条码" value={productFilter.q} onChange={value=>setProductDraft('q',value)} allowClear />
            <Select aria-label="商品状态" value={productFilter.status} onChange={value=>setProductDraft('status',value||'all')} options={[{label:'全部状态',value:'all'},{label:'正常',value:'enabled'},{label:'已停用',value:'disabled'}]} />
            <div className="t27-toolbar-actions"><Button type="primary" loading={busy==='商品'} onClick={runProducts}>查询</Button><Button disabled={!productTotal||!!busy} loading={busy==='导出商品'} onClick={exportProducts}>导出 Excel</Button></div>
          </div>
          <div className="t27-summary">符合条件 {productTotal} 个商品 · 关联条目约 {productRowsEstimate} 行 · 预览 {products.length} 个</div>
          <Table rowKey="id" size="small" data={products} pagination={{pageSize:20,showTotal:true}} noDataElement={<Empty description="查询后显示商品"/>} columns={[
            {title:'商品编码',dataIndex:'code',width:130},{title:'商品名称',dataIndex:'name',ellipsis:true},{title:'分类',dataIndex:'category_name',width:140},{title:'单位',dataIndex:'unit',width:80},
            {title:'原 SKU',width:100,render:(_,row)=>catalogIndex.skus.get(row.id)?.length||0},{title:'条码绑定',width:105,render:(_,row)=>(catalogIndex.barcodes.get(row.id)?.length||0)+(catalogIndex.aliases.get(row.id)?.length||0)},
            {title:'状态',width:90,render:(_,row)=><Tag color={row.enabled===false?'gray':'green'}>{row.enabled===false?'已停用':'正常'}</Tag>},
          ]}/>
        </div>
      </Tabs.TabPane>

      <Tabs.TabPane key="inventory" title="库存">
        <div className="t27-panel">
          <div className="t27-toolbar t27-toolbar-wide">
            <Input aria-label="库存关键词" placeholder="商品码 / 名称 / 原颜色 / 原尺码" value={inventoryFilter.q} onChange={value=>setInventoryDraft('q',value)} allowClear />
            <Select aria-label="仓库" placeholder="全部仓库" allowClear showSearch value={inventoryFilter.warehouseId||undefined} onChange={value=>setInventoryDraft('warehouseId',value||'')} options={warehouseOptions}/>
            <Select aria-label="商品" placeholder="全部商品" allowClear showSearch value={inventoryFilter.productId||undefined} onChange={value=>setInventoryDraft('productId',value||'')} options={productOptions}/>
            <Input aria-label="计量单位" placeholder="单位" value={inventoryFilter.unit} onChange={value=>setInventoryDraft('unit',value)} allowClear />
            <Select aria-label="数量范围" value={inventoryFilter.nonzero?'nonzero':'all'} onChange={value=>setInventoryDraft('nonzero',value==='nonzero')} options={[{label:'含零库存',value:'all'},{label:'仅非零库存',value:'nonzero'}]}/>
            <Button type="primary" loading={busy==='库存'} onClick={runInventory}>查询库存</Button>
            <Button disabled={!inventoryInfo?.total||!!busy} loading={busy==='库存导出'} onClick={exportInventory}>导出 Excel</Button>
          </div>
          {inventoryInfo&&<div className="t27-summary">符合条件 {inventoryInfo.total} 行 · 预览 {inventoryInfo.shown} 行（预览单位：{inventoryInfo.units.join('、')||'未知'}）· 导出不跨原 SKU 合并</div>}
          <Table rowKey={row=>`${row.warehouseId}|${row.skuId}`} size="small" data={inventory} pagination={{pageSize:20,showTotal:true}} scroll={{x:1150}} noDataElement={<Empty description="查询后显示授权范围内的库存"/>} columns={inventoryColumns}/>
        </div>
      </Tabs.TabPane>

      <Tabs.TabPane key="documents" title="单据">
        <div className="t27-panel">
          <div className="t27-toolbar t27-toolbar-docs">
            <Select aria-label="单据类型" value={docFilter.kind} onChange={value=>setDocDraft('kind',value)} options={[{label:'销货与调拨',value:'all'},{label:'销货单',value:'sale'},{label:'调拨单',value:'transfer'},{label:'库存校正',value:'correction'}]}/>
            <Input aria-label="单据搜索" placeholder="单号或备注" value={docFilter.q} onChange={value=>setDocDraft('q',value)} allowClear/>
            <Select aria-label="单据状态" value={docFilter.status} onChange={value=>setDocDraft('status',value)} options={[{label:'全部状态',value:'all'},{label:'已审核',value:'APPROVED'},{label:'未审核',value:'UNAUDITED'},{label:'已作废',value:'DELETED'},...(docFilter.kind==='correction'?[{label:'已确认',value:'CONFIRMED'}]:[])]}/>
            <label className="t27-date-field">开始日<input type="date" value={docFilter.start} onChange={event=>setDocDraft('start',event.target.value)}/></label>
            <label className="t27-date-field">结束日<input type="date" value={docFilter.end} onChange={event=>setDocDraft('end',event.target.value)}/></label>
            {docFilter.kind==='correction'&&<>
              <Select aria-label="校正仓库" placeholder="选择校正仓库" showSearch value={docFilter.warehouseId||undefined} onChange={value=>setDocDraft('warehouseId',value||'')} options={warehouseOptions}/>
              <Select aria-label="校正原 SKU" placeholder="选择校正原 SKU" showSearch value={correctionSkuId||undefined} onChange={value=>setDocDraft('skuId',value||'')} options={correctionOptions}/>
            </>}
            <div className="t27-toolbar-actions"><Button type="primary" loading={busy==='单据'} onClick={runDocuments}>查询单据</Button><Button disabled={!documentTotal||!!busy} loading={busy==='导出单据'} onClick={exportDocuments}>导出全部版本</Button></div>
          </div>
          <div className="t27-summary">符合条件 {documentTotal} 张 · 当前预览 {documents.length} 张 · 导出包含历史版本、状态、明细和全部结算行</div>
          <div className="t27-document-table"><Table rowKey={row=>row.id} size="small" data={documents} pagination={{pageSize:20,showTotal:true}} scroll={{x:800}} noDataElement={<Empty description="查询后显示单据；校正单按仓库和原 SKU 筛选"/>} columns={docColumns}/></div>
          <div className="t27-document-mobile-list" role="list" aria-label="单据列表">
            {mobileDocumentRows.map(row=><article key={row.id} className="t27-document-mobile-card" role="listitem">
              <div><span>类型</span><strong>{row._kind||'未知'}</strong></div>
              <div><span>单号</span><strong>{text(row.number||row.id)||'未知'}</strong></div>
              <div><span>业务日</span><strong>{text(row.business_day||row.businessDay||bodyHeader(row.body).business_date)||'未知'}</strong></div>
              <div><span>状态</span><strong>{statusName(row.status)}</strong></div>
              <div><span>版本 / 修订</span><strong>V{text(row.version||1)} / R{text(row.current_revision||row.revision||1)}</strong></div>
              <div><span>明细行</span><strong>{row.body?.lines?.length ?? (row.correction ? 1 : 0)}</strong></div>
              <Button className="t27-document-mobile-action" type="primary" onClick={()=>showPrint(row)}>查看与打印</Button>
            </article>)}
            {!documents.length&&<Empty description="查询后显示单据；校正单按仓库和原 SKU 筛选"/>}
            {documents.length>20&&<Pagination size="mini" simple total={documents.length} current={mobileDocumentPage} pageSize={20} onChange={page=>setMobileDocumentPage(page)}/>}
          </div>
          {preview&&<section className="t27-preview-card">
            <div className="t27-preview-controls"><div><strong>打印预览</strong><p>单号 {text(preview.record.detail.number||preview.record.detail.id)} · 共 {preview.snapshots.length} 个可读版本</p></div>
              <Select aria-label="选择打印版本" value={preview.selectedRevision||String(preview.snapshots.find(row=>row.current)?.revision||preview.snapshots.at(-1)?.revision||'')} onChange={value=>setPreview(old=>({...old,selectedRevision:value}))} options={preview.snapshots.map(row=>({value:String(row.revision),label:versionLabel(preview.record.detail,row)}))}/>
              <Button type="primary" disabled={!selectedSnapshot||!!transferPreview?.error} onClick={printCurrentDocument}>浏览器打印</Button><Button onClick={()=>setPreview(null)}>关闭预览</Button>
            </div>
            {transferPreview ? <>
              <div className="t27-summary">横向纸张 {transferPaper.widthMm} × {transferPaper.heightMm} 毫米 · 沿用调拨打印模板</div>
              {transferPreview.error?<Alert type="error" content={transferPreview.error}/>:<iframe key={`${preview.record.detail.id}-${selectedSnapshot.revision}`} ref={transferFrame} className="t27-transfer-print-frame" title="调拨单打印预览" srcDoc={transferPreview.html}/>}
            </> : selectedSnapshot&&printDocument(preview.record.detail,selectedSnapshot)}
          </section>}
        </div>
      </Tabs.TabPane>

      <Tabs.TabPane key="ledger" title="流水">
        <div className="t27-panel">
          <div className="t27-toolbar t27-toolbar-ledger">
            <Select aria-label="流水仓库" placeholder="选择仓库" showSearch value={ledgerFilter.warehouseId||undefined} onChange={value=>setLedgerDraft('warehouseId',value||'')} options={warehouseOptions}/>
            <Select aria-label="流水原 SKU" placeholder="选择原 SKU" showSearch value={ledgerFilter.skuId||undefined} onChange={value=>setLedgerDraft('skuId',value||'')} options={skuOptions}/>
            <label className="t27-date-field">开始日<input type="date" value={ledgerFilter.start} onChange={event=>setLedgerDraft('start',event.target.value)}/></label>
            <label className="t27-date-field">结束日<input type="date" value={ledgerFilter.end} onChange={event=>setLedgerDraft('end',event.target.value)}/></label>
            <Button type="primary" loading={busy==='流水'} onClick={runLedger}>查询流水</Button>
            <Button disabled={!ledger?.total||!ledgerQuery||!!busy} loading={busy==='流水导出'} onClick={exportLedger}>导出 Excel</Button>
          </div>
          {ledger&&<div className="t27-summary">符合条件 {ledger.total} 行 · 预览 {ledger.items.length} 行 · 重建期末数量 {text(ledger.reconstructedQuantity)} {text(ledger.exportContext?.unit)} · 仅查询当前选中的仓库和原 SKU</div>}
          <Table rowKey="id" size="small" data={ledger?.items||[]} pagination={{pageSize:20,showTotal:true}} scroll={{x:1050}} noDataElement={<Empty description="选择一个仓库和原 SKU 后查询流水"/>} columns={ledgerColumns}/>
        </div>
      </Tabs.TabPane>

      <Tabs.TabPane key="labels" title="批量标签">
        <div className="t27-panel">
          <div className="t27-label-form">
            <Select aria-label="标签商品 SKU" placeholder="选择商品及原 SKU" showSearch value={skuId||undefined} onChange={value=>{setSkuId(value||'');setBarcode('');setBarcodeError('')}} options={skuOptions}/>
            <Select aria-label="标签条码" placeholder="选择已登记条码" showSearch value={barcode||undefined} onChange={value=>setBarcode(value||'')} options={codesForSku}/>
            <label className="t27-count-field">打印张数<input type="number" min="1" max="100" value={labelCount} onChange={event=>setLabelCount(event.target.value)}/></label>
            <Button type="primary" loading={busy==='校验标签'} disabled={!skuId||!barcode} onClick={validateAndQueueLabel}>校验并加入批次</Button>
          </div>
          {selectedSku&&selectedSkuProduct&&<div className="t27-label-identity"><Tag>{selectedSkuProduct.enabled===false||selectedSku.enabled===false?'已停用':'原 SKU'}</Tag><span>{selectedSkuProduct.code} · {selectedSkuProduct.name}</span><span>{text(selectedSku.options?.COLOR?.name)} / {text(selectedSku.options?.SIZE?.sourceName||selectedSku.options?.SIZE?.name)}</span><span>SKU ID {selectedSku.id}</span>
            {barcode&&selectedCodeMatches.length>1&&<Tag color="red">歧义码：{selectedCodeMatches.length} 个候选，禁止生成</Tag>}
          </div>}
          <div className="t27-label-batch-head"><div><strong>当前批次 {labelTotal} 张</strong><p>每条码由服务端核对绑定；加入与打印前都会重新校验。</p></div><div className="t27-toolbar-actions"><Button disabled={!labelQueue.length} onClick={()=>setLabelQueue([])}>清空批次</Button><Button type="primary" disabled={!labelQueue.length||!!barcodeError} loading={busy==='复核标签'} onClick={printLabels}>复核并打印 {labelTotal} 张</Button></div></div>
          {barcodeError&&<Alert type="error" content={barcodeError}/>}
          {labelQueue.length===0?<Empty description="选择 SKU、条码和张数后加入批次"/>:<>
            <div className="t27-label-queue">{labelQueue.map(row=><div className="t27-label-queue-row" key={row.key}><span>{row.productCode} · {row.productName} · {row.colorName} / {row.sourceSize}</span><code>{row.code}</code><Tag>{row.count} 张</Tag><Button type="text" status="danger" onClick={()=>setLabelQueue(old=>old.filter(item=>item.key!==row.key))}>移除</Button></div>)}</div>
            <div className="t27-label-grid">{labelQueue.flatMap(row=>Array.from({length:row.count},(_,index)=><article className="t27-label-card" key={`${row.key}-${index}`}>
              <div className="t27-label-top"><strong>{row.productCode}</strong><span>{row.productName}</span></div><div className="t27-label-variant">{[row.colorName,row.fitName,row.sourceSize].filter(Boolean).join(' / ')}</div>
              <svg data-barcode={row.code} aria-label={`条码 ${row.code}`}/><div className="t27-label-sku">原 SKU {row.skuId}</div>
            </article>))}</div>
          </>}
        </div>
      </Tabs.TabPane>
    </Tabs>
    {busy&&<div className="t27-busy" role="status"><Spin size={18}/><span>{busy}中，请稍候…</span></div>}
  </div>;
}

const host=document.getElementById('t27-root');
if(host){const root=createRoot(host);root.render(<T27App/>);window.T27_EXPORT_WORKBENCH={unmount:()=>root.unmount()};}
