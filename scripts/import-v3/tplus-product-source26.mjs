/** T+ current-batch product source candidates. Read-only; no IDs, SQL or grant. */
import { parseImportCnyYuan } from "../../packages/application/src/import-preflight.ts";

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
      sourceProductName:name ?? null,sourceSizeGroup:group ?? null,
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
