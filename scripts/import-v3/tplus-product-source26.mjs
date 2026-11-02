/** T+ current-batch product source candidates. Read-only; no IDs, SQL or grant. */
import {createHash} from "node:crypto";
import {parseV2Csv} from "../../packages/application/src/import-v2.ts";
import { parseImportCnyYuan } from "../../packages/application/src/import-preflight.ts";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { sourceEvidence } from "./prepare-native-bindings.mjs";

// Exact, reviewed master-sheet price labels for this batch. The price-book
// uses its own separately validated short labels.
const MASTER_PRICE_HEADERS=Object.freeze({
  '采购价':'采购价','零售价':'零售价',
  '五级批发价':'五级批发价(工厂店供货价）', '六级批发价':'六级批发价（贴牌价）',
  '七级批发价':'七级批发价（批发价）', '八级批发价':'八级批发价（代理商供货价）',
  '九级批发价':'九级批发价（工厂店零售价）', '十级批发价':'十级批发价（葛玉珠）', '最低售价':'最低售价'
});

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
    const indexes=expectedHeaders.flatMap((v,i) => v === MASTER_PRICE_HEADERS[name] ? [i] : []);
    return [name,indexes.length === 1 ? indexes[0] : null];
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
      priceSourceCells:Object.fromEntries([...priceColumns].map(([key,i])=>[key,i === null ? {kind:"unrecognized",raw:null} : event.cells[i] ?? {kind:"blank",raw:null}])),sourceCells:event.cells});
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
    const priceKey=Object.keys(MASTER_PRICE_HEADERS).find(key=>column.name===key || column.name.startsWith(key+'（'));
    const allowedHeader=priceKey ? MASTER_PRICE_HEADERS[priceKey] : spec[0];
    const indexes=headers.flatMap((name,i)=>name===allowedHeader?[i]:[]);
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

/** Preserve the source category tree. Deeper paths stay pending for an explicit
 * approved mapping; no flattening, name matching or source reordering. */
export async function readTPlusCategoryTree26(events, expectedHeaders) {
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length !== 4 ||
      expectedHeaders[0] !== '分类编码' || expectedHeaders[1] !== '分类名称' ||
      expectedHeaders[2] !== '上级分类编码' || expectedHeaders[3] !== '上级分类') throw Error('TPLUS_CATEGORY_HEADER_CONTRACT');
  const nodes=new Map(); let header=false,eof=false,count=0,last=0;
  for await (const event of events) {
    if (!event || event.sheet !== '存货分类' || eof) throw Error('TPLUS_CATEGORY_STREAM');
    if (event.event==='eof') { if (!header || event.rows!==count) throw Error('TPLUS_CATEGORY_EOF');eof=true;continue; }
    if (event.event!=='row' || !Number.isSafeInteger(event.excelRow) || event.excelRow<=last || !event.cells) throw Error('TPLUS_CATEGORY_ROW');
    count++;last=event.excelRow;const c=i=>event.cells[i];
    if (!header) { if(event.excelRow!==1 || expectedHeaders.some((h,i)=>c(i)?.kind!=='text'||c(i)?.raw!==h)) throw Error('TPLUS_CATEGORY_HEADER');header=true;continue; }
    const code=c(0),name=c(1),parent=c(2);
    if (code?.kind!=='text' || typeof code.raw!=='string' || !code.raw || name?.kind!=='text' || typeof name.raw!=='string' || !name.raw ||
        (parent && parent.kind!=='blank' && (parent.kind!=='text' || typeof parent.raw!=='string')) || nodes.has(code.raw)) throw Error('TPLUS_CATEGORY_VALUE');
    nodes.set(code.raw,{sourceCode:code.raw,sourceName:name.raw,parentCode:parent?.raw || null,excelRow:event.excelRow,sourceCells:event.cells});
  }
  if (!eof) throw Error('TPLUS_CATEGORY_EOF');
  const paths=new Map();
  for (const code of nodes.keys()) {
    let current=code;const seen=new Set(),chain=[];
    while (current!==null) {
      if (seen.has(current)) throw Error('TPLUS_CATEGORY_CYCLE');
      const node=nodes.get(current);if(!node) throw Error('TPLUS_CATEGORY_PARENT_MISSING');
      seen.add(current);chain.push(node);current=node.parentCode;
    }
    chain.reverse();paths.set(code,{sourceCode:code,path:chain,status:chain.length<=2?'SOURCE_TREE_ONLY':'PENDING_APPROVED_CATEGORY_MAPPING'});
  }
  return paths;
}

/** Attach only the explicit source category code. This does not convert a path
 * or claim a native category; unreviewed and over-depth paths remain pending. */
export function attachTPlusCategorySource26(candidate, categoryPaths) {
  const product=candidate?.productSource, headers=product?.sourceHeaders;
  if (!(categoryPaths instanceof Map) || !Array.isArray(headers) || headers.filter(x=>x==='所属类别编码').length!==1) throw Error('TPLUS_CATEGORY_REFERENCE_INPUT');
  const cell=product.sourceCells[headers.indexOf('所属类别编码')], category=cell?.kind==='text' ? categoryPaths.get(cell.raw) : undefined;
  return {...candidate, categorySource:category ?? null, categoryReferenceStatus:category ? category.status : 'PENDING_CATEGORY_SOURCE',importReady:false};
}

/** Independently pinned historic per-product decisions are evidence, not an
 * automatic permission to reuse target IDs or infer a new category hierarchy. */
export async function readTPlusPriorCategoryDecisions26(bytes, trustedSha256) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/.test(trustedSha256 ?? '') || createHash('sha256').update(bytes).digest('hex')!==trustedSha256)
    throw Error('TPLUS_CATEGORY_DECISION_PIN');
  const records=new Map();let header;
  for await (const cells of parseV2Csv((async function*(){yield new TextDecoder('utf-8',{fatal:true}).decode(bytes)})())) {
    if (!header) {
      header=cells;const required=['code','name','target_id','target_name','target_parent_name','decision_status','decision_source','decision_basis','old_category_for_review_only','original_description','original_size_group','original_invoice_name'];
      if (new Set(header).size!==header.length || required.some(k=>header.filter(x=>x===k).length!==1)) throw Error('TPLUS_CATEGORY_DECISION_HEADER');
      continue;
    }
    if (cells.length!==header.length) throw Error('TPLUS_CATEGORY_DECISION_WIDTH');
    const record=Object.fromEntries(header.map((h,i)=>[h,cells[i]]));
    if (!record.code || !record.target_id || records.has(record.code)) throw Error('TPLUS_CATEGORY_DECISION_IDENTITY');
    records.set(record.code,record);
  }
  if (!header) throw Error('TPLUS_CATEGORY_DECISION_HEADER');
  return {records,sha256:trustedSha256};
}

/** Match an individual decision against source evidence, retaining missing or
 * changed facts. Matching is a reference candidate, never target authorization. */
export function compareTPlusPriorCategoryDecision26(candidate, decisions) {
  const p=candidate?.productSource,headers=p?.sourceHeaders;
  if (!(decisions?.records instanceof Map) || !/^[a-f0-9]{64}$/.test(decisions?.sha256 ?? '') || !Array.isArray(headers)) throw Error('TPLUS_CATEGORY_DECISION_INPUT');
  const record=decisions.records.get(p.sourceProductCode);
  if (!record) return {status:'PENDING_NO_PRIOR_PRODUCT_DECISION',decisionEvidenceSha256:decisions.sha256,importReady:false};
  const specs=[['存货名称','name',true],['所属类别','old_category_for_review_only',true],['存货描述','original_description',false],
    ['尺码所属取值组编码','original_size_group',true],['开票名称','original_invoice_name',false]];
  const comparisons=[];
  for (const [field,oldField,required] of specs) {
    const index=headers.indexOf(field);if(index<0 || headers.lastIndexOf(field)!==index) throw Error('TPLUS_CATEGORY_DECISION_SOURCE_HEADER');
    const cell=p.sourceCells[index],old=record[oldField];
    if (cell && !['text','number','blank'].includes(cell.kind)) {comparisons.push({field,status:'SOURCE_UNREADABLE'});continue;}
    const value=cell?.raw ?? '';
    comparisons.push({field,status:!old && !required?'PRIOR_NOT_RECORDED':old===value?'EQUAL':'DIFFERENT'});
  }
  const materialChange=comparisons.some(x=>['DIFFERENT','SOURCE_UNREADABLE'].includes(x.status));
  return {status:materialChange?'PENDING_SOURCE_FACTS_CHANGED':'PRIOR_DECISION_MATCHED_REFERENCE_ONLY',
    decisionEvidenceSha256:decisions.sha256,sourceProductCode:p.sourceProductCode,sourceRow:p.excelRow,comparisons,
    ...(!materialChange ? {priorTargetId:record.target_id,priorTargetName:record.target_name} : {}),importReady:false};
}

/** Prior reviewed normalized PRODUCT rows supply reference evidence only.
 * Their identity is pinned separately; no prior business value is imported. */
export async function readPriorCanonicalProducts26(bytes, trustedSha256) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/.test(trustedSha256 ?? '') || createHash('sha256').update(bytes).digest('hex')!==trustedSha256)
    throw Error('TPLUS_PRIOR_PRODUCT_PIN');
  const columns=IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT').columns.map(c=>c.name), products=new Map();let header;
  for await (const cells of parseV2Csv((async function*(){yield new TextDecoder('utf-8',{fatal:true}).decode(bytes)})())) {
    if (!header) {
      header=cells;if(header.length!==columns.length || columns.some((name,i)=>header[i]!==name)) throw Error('TPLUS_PRIOR_PRODUCT_HEADER');
      continue;
    }
    if (cells.length!==header.length) throw Error('TPLUS_PRIOR_PRODUCT_WIDTH');
    const row=Object.fromEntries(header.map((h,i)=>[h,cells[i]])),code=row['款号'];
    if (!code || products.has(code)) throw Error('TPLUS_PRIOR_PRODUCT_IDENTITY');
    products.set(code,row);
  }
  if (!header) throw Error('TPLUS_PRIOR_PRODUCT_HEADER');
  return {products,sha256:trustedSha256};
}

/** Propose a category path only when the same-product decision and the pinned
 * previously reviewed normalized row agree. This is not native-ID authority. */
export function proposePriorCategoryCanonical26(candidate, decisions, priorProducts) {
  const comparison=compareTPlusPriorCategoryDecision26(candidate,decisions),code=candidate?.productSource?.sourceProductCode;
  if (comparison.status!=='PRIOR_DECISION_MATCHED_REFERENCE_ONLY') return {...comparison,canonicalCategory:null};
  if (!(priorProducts?.products instanceof Map) || !/^[a-f0-9]{64}$/.test(priorProducts?.sha256 ?? '')) throw Error('TPLUS_PRIOR_PRODUCT_INPUT');
  const decision=decisions.records.get(code), prior=priorProducts.products.get(code);
  if (!prior || prior['商品名称']!==decision.name) return {...comparison,status:'PENDING_PRIOR_PRODUCT_MISMATCH',canonicalCategory:null};
  const path=prior['分类路径'], leaf=decision.target_name, parent=decision.target_parent_name;
  if (!path || !(path===leaf || (parent && path===parent+'/'+leaf)))
    return {...comparison,status:'PENDING_CATEGORY_PATH_PROOF',canonicalCategory:null};
  return {...comparison,status:'PRIOR_CATEGORY_CANONICAL_REFERENCE',canonicalCategory:path,
    priorProductEvidenceSha256:priorProducts.sha256,importReady:false};
}
