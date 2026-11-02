/** T+ current-batch product source candidates. Read-only; no IDs, SQL or grant. */
import { parseImportCnyYuan } from "../../packages/application/src/import-preflight.ts";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { sourceEvidence } from "./prepare-native-bindings.mjs";

/** Price-book observations are product-level source facts; no SKU or target IDs.
 * Blank prices are preserved, pending full source/contract closure. */
export async function* projectTPlusProductPrices(events, expectedHeaders) {
  const names = ["采购价", "零售价", "五级批发价", "六级批发价", "七级批发价", "八级批发价", "九级批发价", "十级批发价", "最低售价"];
  if (!Array.isArray(expectedHeaders) || expectedHeaders[0] !== "条形码" || expectedHeaders[1] !== "存货编码" ||
      names.some(name => expectedHeaders.filter(x => x === name).length !== 1)) throw Error("TPLUS_PRICE_HEADER_CONTRACT");
  let physical = 0, last = 0, header = false, eof = false;
  for await (const event of events) {
    if (!event || event.sheet !== "存货价格本" || eof) throw Error("TPLUS_PRICE_STREAM");
    if (event.event === "eof") { if (!header || event.rows !== physical) throw Error("TPLUS_PRICE_EOF"); eof = true; yield {event:"eof", rows:physical}; continue; }
    if (event.event !== "row" || !Number.isSafeInteger(event.excelRow) || event.excelRow <= last || !event.cells) throw Error("TPLUS_PRICE_ROW");
    physical++; last = event.excelRow; const cell = i => event.cells[i];
    if (!header) {
      if (event.excelRow !== 1 || expectedHeaders.some((name,i) => cell(i)?.kind !== "text" || cell(i)?.raw !== name)) throw Error("TPLUS_PRICE_HEADER");
      header = true; continue;
    }
    const code = cell(1), prices = {}; let pending = code?.kind !== "text" || typeof code.raw !== "string" || !code.raw;
    for (const name of names) {
      const sourceCell = cell(expectedHeaders.indexOf(name)) ?? {kind:"blank",raw:null};
      if ((sourceCell.kind === "blank" && sourceCell.raw === null) || (sourceCell.kind === "text" && sourceCell.raw === "")) { prices[name] = {state:"BLANK_SOURCE",sourceCell}; continue; }
      try {
        if (!["number","text"].includes(sourceCell.kind)) throw Error("PRICE_TYPE");
        prices[name] = {state:"EXACT_VALUE",minorAmount:parseImportCnyYuan(sourceCell.raw),sourceCell};
      } catch { prices[name] = {state:"PENDING",sourceCell}; pending = true; }
    }
    yield {event:"candidate", sheet:"存货价格本", excelRow:event.excelRow, sourceProductCode:code?.raw ?? null,
      sourceBarcode:cell(0) ?? null, prices, status:pending ? "PENDING_SOURCE_FACTS" : "SOURCE_FACTS_ONLY"};
  }
  if (!eof) throw Error("TPLUS_PRICE_EOF");
}

/** Build product-to-original-barcode relations; a product can have several.
 * Product barcodes are not SKU identities or evidence of a completed import. */
export async function readTPlusProductBarcodes(events) {
  const headers = ["存货编码", "存货名称", "规格型号", "条形码", "计量单位", "是否默认条码"];
  const products = new Map(), seenBarcodes = new Set(); let physical = 0, last = 0, header = false, eof = false;
  for await (const event of events) {
    if (!event || event.sheet !== "存货条形码" || eof) throw Error("TPLUS_BARCODE_STREAM");
    if (event.event === "eof") { if (!header || event.rows !== physical) throw Error("TPLUS_BARCODE_EOF"); eof = true; continue; }
    if (event.event !== "row" || !Number.isSafeInteger(event.excelRow) || event.excelRow <= last || !event.cells) throw Error("TPLUS_BARCODE_ROW");
    physical++; last = event.excelRow; const c = i => event.cells[i];
    if (!header) {
      if (event.excelRow !== 1 || headers.some((name,i) => c(i)?.kind !== "text" || c(i)?.raw !== name)) throw Error("TPLUS_BARCODE_HEADER");
      header = true; continue;
    }
    const code=c(0), barcode=c(3), unit=c(4), flag=c(5);
    if ([code,barcode].some(x => x?.kind !== "text" || typeof x.raw !== "string" || !x.raw) ||
        flag?.kind !== "number" || !["0","1"].includes(flag.raw)) throw Error("TPLUS_BARCODE_VALUE");
    if (seenBarcodes.has(barcode.raw)) throw Error("TPLUS_BARCODE_DUPLICATE");
    seenBarcodes.add(barcode.raw);
    const relation=Object.freeze({sourceProductCode:code.raw,sourceBarcode:barcode.raw,sourceUnit:unit?.raw ?? null,sourceUnitCell:unit ?? null,
      defaultFlag:flag.raw, sheet:"存货条形码",excelRow:event.excelRow});
    if (!products.has(code.raw)) products.set(code.raw, []);
    products.get(code.raw).push(relation);
  }
  if (!eof) throw Error("TPLUS_BARCODE_EOF");
  return products;
}

/** Join only the explicit product code from the two source files. Results remain
 * provisional until the price stream ends and unmatched barcode codes are counted. */
export async function* joinTPlusProductFacts(priceEvents, barcodeIndex) {
  if (!(barcodeIndex instanceof Map)) throw Error("TPLUS_PRODUCT_BARCODE_INDEX");
  const seen = new Set(); let eof = false;
  for await (const event of priceEvents) {
    if (!event || eof) throw Error("TPLUS_PRODUCT_STREAM");
    if (event.event === "eof") {
      eof = true; let barcodeProductsWithoutPrice = 0;
      for (const code of barcodeIndex.keys()) if (!seen.has(code)) barcodeProductsWithoutPrice++;
      yield {event:"eof",priceSourceRows:event.rows,productCodes:seen.size,barcodeProductsWithoutPrice}; continue;
    }
    if (event.event !== "candidate") throw Error("TPLUS_PRODUCT_STREAM");
    const code = event.sourceProductCode;
    if (typeof code !== "string" || !code || seen.has(code)) throw Error("TPLUS_PRODUCT_CODE_INVALID_OR_DUPLICATE");
    seen.add(code);
    const relations = barcodeIndex.get(code) ?? [];
    yield {...event, barcodeRelations:relations,
      status:event.status === "SOURCE_FACTS_ONLY" && relations.length ? "SOURCE_FACTS_ONLY" : "PENDING_SOURCE_FACTS"};
  }
  if (!eof) throw Error("TPLUS_PRODUCT_EOF");
}

/** Preserve the original product row by its actual code and source position. */
export async function readTPlusProductMaster(events, expectedHeaders) {
  if (!Array.isArray(expectedHeaders) || expectedHeaders[0] !== "存货编码" || expectedHeaders[1] !== "存货名称" ||
      expectedHeaders.filter(x => x === "尺码所属取值组编码").length !== 1) throw Error("TPLUS_MASTER_HEADER_CONTRACT");
  const priceNames = ["采购价", "零售价", "五级批发价", "六级批发价", "七级批发价", "八级批发价", "九级批发价", "十级批发价", "最低售价"];
  const priceColumns = new Map(priceNames.map(name => {
    const indexes=expectedHeaders.flatMap((v,i) => v === name || v.startsWith(name+"（") || v.startsWith(name+"(") ? [i] : []);
    if (indexes.length !== 1) throw Error("TPLUS_MASTER_PRICE_HEADER");
    return [name,indexes[0]];
  }));
  const products = new Map(); let physical=0, last=0, header=false, eof=false;
  for await (const event of events) {
    if (!event || event.sheet !== "存货" || eof) throw Error("TPLUS_MASTER_STREAM");
    if (event.event === "eof") { if (!header || event.rows !== physical) throw Error("TPLUS_MASTER_EOF"); eof=true; continue; }
    if (event.event !== "row" || !Number.isSafeInteger(event.excelRow) || event.excelRow <= last || !event.cells) throw Error("TPLUS_MASTER_ROW");
    physical++; last=event.excelRow;
    if (event.excelRow < 2) continue;
    if (event.excelRow === 2) {
      if (header || expectedHeaders.some((name,i)=>event.cells[i]?.kind !== "text" || event.cells[i]?.raw !== name)) throw Error("TPLUS_MASTER_HEADER");
      header=true; continue;
    }
    if (!header) throw Error("TPLUS_MASTER_HEADER");
    const code=event.cells[0];
    if (code?.kind !== "text" || typeof code.raw !== "string" || !code.raw || products.has(code.raw)) throw Error("TPLUS_MASTER_CODE_INVALID_OR_DUPLICATE");
    const groupCol=expectedHeaders.indexOf("尺码所属取值组编码"), name=event.cells[1], group=event.cells[groupCol];
    products.set(code.raw,{sheet:"存货",excelRow:event.excelRow,sourceProductCode:code.raw,
      sourceProductName:name ?? null,sourceSizeGroup:group ?? null,sourceHeaders:[...expectedHeaders],
      priceSourceCells:Object.fromEntries([...priceColumns].map(([key,i])=>[key,event.cells[i] ?? {kind:"blank",raw:null}])),sourceCells:event.cells});
  }
  if (!eof) throw Error("TPLUS_MASTER_EOF");
  return products;
}

/** Explicit source-code join; caller must pin files and exhaust all streams.
 * These are review candidates, not native SKU bindings or authorization. */
export async function* assembleTPlusProductSource26({master, barcodes, prices}) {
  if (!(master instanceof Map) || !(barcodes instanceof Map)) throw Error("TPLUS_PRODUCT_SOURCE_INPUT");
  const seen=new Set(); let eof=false, priceWithoutMaster=0;
  for await (const event of joinTPlusProductFacts(prices,barcodes)) {
    if (event.event === "eof") {
      eof=true; let masterWithoutPrice=0;
      for (const code of master.keys()) if (!seen.has(code)) masterWithoutPrice++;
      yield {...event,masterWithoutPrice,priceWithoutMaster,scope:"SOURCE_CANDIDATES_ONLY",importReady:false}; continue;
    }
    const code=event.sourceProductCode, source=master.get(code) ?? null; seen.add(code); if (!source) priceWithoutMaster++;
    const priceChecks={}; let consistent=Boolean(source);
    if (source) for (const [name,book] of Object.entries(event.prices)) {
      const original=source.priceSourceCells[name]; let state="PENDING";
      if ((original?.kind === "blank" && original.raw === null) || (original?.kind === "text" && original.raw === "")) state=book.state === "BLANK_SOURCE" ? "BOTH_BLANK" : "MISMATCH";
      else if (["number","text"].includes(original?.kind) && book.state === "EXACT_VALUE") {
        try { state=parseImportCnyYuan(original.raw) === book.minorAmount ? "EXACT_MATCH" : "MISMATCH"; } catch { state="PENDING"; }
      }
      priceChecks[name]=state; if (!["BOTH_BLANK","EXACT_MATCH"].includes(state)) consistent=false;
    }
    yield {...event,productSource:source,priceChecks,status:consistent && event.status === "SOURCE_FACTS_ONLY" ? "SOURCE_FACTS_ONLY" : "PENDING_SOURCE_FACTS",
      readiness:"REFERENCE_EVIDENCE_PENDING",importReady:false};
  }
  if (!eof) throw Error("TPLUS_PRODUCT_SOURCE_EOF");
}

/** Construct one non-authoritative BASE_V2 PRODUCT row from an explicit mapping
 * sidecar. The caller must independently pin/verify the workbook and projection;
 * this does not create a target ID, grant, cutoff, or complete batch manifest. */
export function buildTPlusProductCanonicalEvidence26({candidate, canonicalFields, mappingEvidence, sourceFile, sourceSha256, selectedColumns, binding}) {
  const product=candidate?.productSource, headers=product?.sourceHeaders, columns=IMPORT_V2_TABLES.find(x=>x.entity==='PRODUCT').columns;
  const names=['采购价','零售价','五级批发价','六级批发价','七级批发价','八级批发价','九级批发价','十级批发价','最低售价'];
  if (candidate?.status !== 'SOURCE_FACTS_ONLY' || !candidate.priceChecks || Object.keys(candidate.priceChecks).length !== names.length ||
      names.some(name=>!['EXACT_MATCH','BOTH_BLANK'].includes(candidate.priceChecks[name])) || !product || !Array.isArray(headers) || !Array.isArray(selectedColumns) ||
      selectedColumns.length !== headers.length || selectedColumns.some((v,i)=>v!==i) ||
      typeof sourceFile !== 'string' || !sourceFile || !/^[a-f0-9]{64}$/.test(sourceSha256 ?? '') ||
      !canonicalFields || Object.keys(canonicalFields).length !== columns.length ||
      columns.some(x=>typeof canonicalFields[x.name] !== 'string') || canonicalFields['来源编号'] !== product.sourceProductCode)
    throw Error('TPLUS_CANONICAL_SOURCE');
  for (const column of columns) {
    const desc=mappingEvidence?.proof?.fields?.[column.name]?.source, index=desc?.column;
    if (!Number.isSafeInteger(index) || index < 0 || index >= headers.length ||
        desc.file !== sourceFile || desc.sha256 !== sourceSha256 || desc.sheet !== product.sheet || desc.row !== product.excelRow ||
        desc.header !== headers[index]) throw Error('TPLUS_CANONICAL_MAPPING_SOURCE');
    const cell=product.sourceCells[index];
    if (cell && !['text','number','blank'].includes(cell.kind)) throw Error('TPLUS_CANONICAL_SOURCE_CELL');
    const value=cell?.raw ?? '';
    if (typeof value !== 'string' || desc.value !== value) throw Error('TPLUS_CANONICAL_SOURCE_CELL');
  }
  const raw={entity:'PRODUCT',sourceId:product.sourceProductCode,file:sourceFile,sheet:product.sheet,
    row:product.excelRow,sourceSha256,data:structuredClone(canonicalFields)};
  const line=JSON.stringify(raw), source=sourceEvidence(raw,line,canonicalFields,binding,mappingEvidence);
  return {raw,line,source,canonicalFields:structuredClone(canonicalFields),scope:'SOURCE_CANDIDATE_ONLY',importReady:false};
}

/** Prepare only directly evidenced PRODUCT fields. Missing references and source
 * semantics stay explicit; this draft is not a canonical import row. */
export function draftTPlusProductFields26(candidate) {
  const product=candidate?.productSource, headers=product?.sourceHeaders;
  if (!product || !Array.isArray(headers) || !product.sourceCells || candidate.status !== 'SOURCE_FACTS_ONLY')
    throw Error('TPLUS_PRODUCT_DRAFT_SOURCE');
  const specs={
    '来源编号':['存货编码','COPY'], '款号':['存货编码','COPY'], '商品名称':['存货名称','COPY'],
    '采购价':['采购价','COPY'], '零售价':['零售价','COPY'],
    '五级批发价（工厂店供货价）':['五级批发价（工厂店供货价）','COPY'],
    '六级批发价（贴牌价）':['六级批发价（贴牌价）','COPY'],
    '七级批发价（批发价）':['七级批发价（批发价）','COPY'],
    '八级批发价（代理商供货价）':['八级批发价（代理商供货价）','COPY'],
    '九级批发价（工厂店零售价）':['九级批发价（工厂店零售价）','COPY'],
    '十级批发价（葛玉珠）':['十级批发价（葛玉珠）','COPY'],
    '最低售价':['最低售价','COPY'], '状态':['停用','DISABLED_0_1_TO_STATUS']
  };
  const fields={}, pending=[];
  for (const column of IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT').columns) {
    const spec=specs[column.name];
    if (!spec) { pending.push(column.name); continue; }
    const pricePrefix=spec[0].match(/^(五级|六级|七级|八级|九级|十级)批发价/);
    const indexes=headers.flatMap((name,i)=>name===spec[0] || (pricePrefix && name.startsWith(pricePrefix[0]+'(')) || (pricePrefix && name.startsWith(pricePrefix[0]+'（')) ? [i] : []);
    if (indexes.length !== 1) { pending.push(column.name); continue; }
    const index=indexes[0], cell=product.sourceCells[index];
    if (cell && !['text','number','blank'].includes(cell.kind)) { pending.push(column.name); continue; }
    const raw=cell?.raw ?? '';
    if (typeof raw !== 'string') { pending.push(column.name); continue; }
    const value=spec[1]==='COPY' ? raw : raw==='0' ? '正常' : raw==='1' ? '停用' : null;
    if (value===null || (column.required && value==='')) { pending.push(column.name); continue; }
    fields[column.name]={value,rule:spec[1],sourceColumn:index,sourceHeader:headers[index],sourceCell:cell ?? {kind:'blank',raw:null}};
  }
  return {sheet:product.sheet,excelRow:product.excelRow,sourceProductCode:product.sourceProductCode,
    fields,pending,scope:'PARTIAL_SOURCE_DRAFT',importReady:false};
}
