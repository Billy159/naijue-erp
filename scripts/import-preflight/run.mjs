#!/usr/bin/env node
/** Offline dev/operator tool. Requires Node 24 + Python 3 stdlib; not a server adapter. */
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { resolve, extname } from "node:path";
import { preflightImport } from "../../packages/application/src/import-preflight.ts";
function run() {
const usage = "Usage: node scripts/import-preflight/run.mjs --batch <id> --namespace <fixed-source> --mode STAGED|FINAL [--prior-manifest <json>] <xlsx file or directory> ...\nWrites JSON report to stdout only; no DB access and no input changes.";
const args = process.argv.slice(2), options = {}, paths = [];
for (let i = 0; i < args.length; i++) {
  const argument = args[i];
  if (["--batch", "--namespace", "--mode", "--prior-manifest"].includes(argument)) {
    if (!args[i + 1] || args[i + 1].startsWith("--") || options[argument]) throw new Error(usage);
    options[argument] = args[++i];
  } else if (argument.startsWith("--")) throw new Error(usage);
  else paths.push(argument);
}
if (!options["--batch"] || !options["--namespace"] || !["STAGED", "FINAL"].includes(options["--mode"]) || !paths.length) throw new Error(usage);
const files = [];
for (const input of paths) {
  const path = resolve(input), info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`OFFLINE_SYMLINK_INPUT_REJECTED:${path}`);
  if (info.isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      // A caller selects the input directory. Never recurse into incidental attachments.
      if (extname(entry.name).toLowerCase() === ".xlsx") files.push(resolve(path, entry.name));
      else if ([".xls", ".xlsm", ".xlsb"].includes(extname(entry.name).toLowerCase())) throw new Error(`UNSUPPORTED_SPREADSHEET_FILE:${entry.name}`);
    }
  } else files.push(path);
}
if (files.length > 64 || new Set(files).size !== files.length) throw new Error("OFFLINE_FILE_LIMIT_OR_DUPLICATE_INPUT");
const reader = spawnSync("python3", [fileURLToPath(new URL("read-xlsx.py", import.meta.url)), ...files], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (reader.error || ![0, 2].includes(reader.status)) throw new Error(`XLSX_READER_FAILED:${reader.error?.message ?? reader.stderr}`);
const bridge = JSON.parse(reader.stdout);
let priorManifest;
if (options["--prior-manifest"]) {
  const priorPath = resolve(options["--prior-manifest"]), info = lstatSync(priorPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error("INVALID_PRIOR_MANIFEST_FILE");
  const prior = JSON.parse(readFileSync(priorPath, "utf8"));
  priorManifest = prior.identityManifest ?? prior;
}
const report = preflightImport({ batchId: options["--batch"], fixedSourceNamespace: options["--namespace"], mode: options["--mode"], files: bridge.files,
  ...(priorManifest === undefined ? {} : { priorManifest }) });
report.readerIssues = bridge.readerIssues;
report.inputReadStatus = bridge.readerIssues.length ? "INCOMPLETE_TOOL_OR_PACKAGE_BLOCKER" : "COMPLETE_WITHIN_PROFILE";
if (bridge.readerIssues.length) {
  // A blocked workbook may contain these missing objects. Do not turn unread input
  // into a fabricated business defect or ask the user to re-clean for tool limits.
  for (const problem of report.issues) if (["INPUT_SHEET_NOT_PRESENT", "SOURCE_REFERENCE_NOT_PRESENT", "DOCUMENT_HAS_NO_SOURCE_LINES", "NO_BUSINESS_RECORDS"].includes(problem.code)) {
    problem.severity = "CAPABILITY";
    problem.reason = "有输入文件尚未完整读取，本项存在性/依赖闭包尚不能验证；不是已确认的来源缺失或业务错误。";
    problem.minimalAction = "开发处理工具资源/格式/访问限制后重做完整预检，保留原件，不要求用户重清洗数据来绕过限制。";
  }
  report.dataStatus = report.issues.some(i => i.severity === "ERROR") || bridge.readerIssues.some(i => i.severity === "ERROR") ? "INVALID" : "PENDING";
  report.identityManifest.identities = []; // Never export partial-read evidence for subsequent batches.
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.dataStatus === "INVALID" ? 2 : bridge.readerIssues.length ? 3 : 0;
}
/** Finite sales nonblank-key census. Not a row join, source proof or import grant.
 * Callers pass exact raw document-number strings and close each stream only after
 * their source reader's verified EOF. Blank continuation rows remain unresolved.
 */
export function createSalesDocumentKeyIndex() {
  const streams = new Map(["report", "detail", "settlement"].map(name => [name, { keys: new Map(), rows: 0, blank: 0, closed: false }]));
  let completed = false;
  function get(name) { const value = streams.get(name); if (!value || completed) throw Error("SALES_KEY_INDEX_STATE"); return value; }
  return Object.freeze({
    add(name, rawKey) {
      const s = get(name); if (s.closed || rawKey !== null && typeof rawKey !== "string") throw Error("SALES_KEY_INDEX_INPUT");
      s.rows++; if (rawKey === null || rawKey === "") { s.blank++; return; }
      s.keys.set(rawKey, (s.keys.get(rawKey) ?? 0) + 1);
    },
    close(name, eof) {
      const s = get(name); if (s.closed || eof?.event !== "eof" || !Number.isSafeInteger(eof.dataRows) || eof.dataRows !== s.rows) throw Error("SALES_KEY_INDEX_EOF_REQUIRED");
      s.closed = true;
    },
    finish() {
      if (completed || [...streams.values()].some(s => !s.closed)) throw Error("SALES_KEY_INDEX_EOF_REQUIRED");
      completed = true; const report = streams.get("report"), detail = streams.get("detail"), settlement = streams.get("settlement");
      const missing = (from, to) => [...from.keys.keys()].filter(k => !to.keys.has(k)).length;
      const summarize = s => ({ rows: s.rows, blankKeys: s.blank, distinctNonblankKeys: s.keys.size,
        repeatedKeyRows: [...s.keys.values()].reduce((sum, n) => sum + n - 1, 0) });
      return { status: "NONBLANK_KEY_CENSUS_NOT_ROW_CLOSURE", report: summarize(report), detail: summarize(detail), settlement: summarize(settlement),
        reportKeysAbsentFromDetail: missing(report, detail), detailKeysAbsentFromReport: missing(detail, report),
        settlementKeysAbsentFromDetail: missing(settlement, detail), unresolvedBlankRows: report.blank + detail.blank + settlement.blank };
    }
  });
}

/** Read one reviewed T+ dimension dictionary. Raw codes and labels remain
 * separate; this creates source facts only, not target IDs or import authority. */
export async function readTPlusDimensionDictionary(events, sheet) {
  const dimensions = new Set(["颜色", "尺码", "版型"]);
  if (!dimensions.has(sheet)) throw Error("TPLUS_DICTIONARY_SHEET");
  const rows = new Map(); let header = false, eof = false, physicalRows = 0, last = 0;
  for await (const event of events) {
    if (!event || event.sheet !== sheet || eof) throw Error("TPLUS_DICTIONARY_STREAM");
    if (event.event === "eof") {
      if (!header || event.rows !== physicalRows) throw Error("TPLUS_DICTIONARY_EOF");
      eof = true; continue;
    }
    if (event.event !== "row" || !Number.isSafeInteger(event.excelRow) || event.excelRow <= last || !event.cells) throw Error("TPLUS_DICTIONARY_ROW");
    physicalRows++; last = event.excelRow;
    const read = col => event.cells[col];
    if (!header) {
      if (event.excelRow !== 1 || ["编码", "名称", "停用"].some((name, i) => read(i)?.kind !== "text" || read(i)?.raw !== name)) throw Error("TPLUS_DICTIONARY_HEADER");
      header = true; continue;
    }
    const code = read(0), name = read(1), disabled = read(2);
    if (!code || code.kind !== "text" || typeof code.raw !== "string" || !code.raw ||
        !name || name.kind !== "text" || typeof name.raw !== "string" || !name.raw ||
        !disabled || disabled.kind !== "number" || !["0", "1"].includes(disabled.raw)) throw Error("TPLUS_DICTIONARY_VALUE");
    if (rows.has(code.raw)) throw Error("TPLUS_DICTIONARY_DUPLICATE_CODE");
    rows.set(code.raw, Object.freeze({ sourceCode: code.raw, sourceName: name.raw, disabled: disabled.raw === "1", sheet, excelRow: event.excelRow }));
  }
  if (!eof) throw Error("TPLUS_DICTIONARY_EOF");
  return rows;
}

/** Project observed T+ matrix cells without inventing missing stock or SKU IDs.
 * Caller supplies the exact already-reviewed row-7 header labels, beginning at B. */
export async function* projectTPlusInventoryMatrix(events, expectedHeaders) {
  const prefix = ["仓库", "存货分类 (1级)", "存货编码", "存货", "主计量", "颜色", "版型1"];
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length < 9 || expectedHeaders.length > 255 ||
      prefix.some((v, i) => expectedHeaders[i] !== v) || expectedHeaders.at(-1) !== "合计" ||
      expectedHeaders.some(v => typeof v !== "string" || !v) || new Set(expectedHeaders).size !== expectedHeaders.length) throw Error("TPLUS_MATRIX_HEADER_CONTRACT");
  const totalColumn = expectedHeaders.length; let header = false, eof = false, physical = 0, last = 0;
  for await (const event of events) {
    if (!event || event.sheet !== "第一页" || eof) throw Error("TPLUS_MATRIX_STREAM");
    if (event.event === "eof") {
      if (!header || event.rows !== physical) throw Error("TPLUS_MATRIX_EOF");
      eof = true; yield {event: "eof", sheet: "第一页", rows: physical}; continue;
    }
    if (event.event !== "row" || !Number.isSafeInteger(event.excelRow) || event.excelRow <= last || !event.cells) throw Error("TPLUS_MATRIX_ROW");
    physical++; last = event.excelRow;
    const cell = col => event.cells[col], raw = col => cell(col)?.raw ?? null;
    if (event.excelRow < 7) continue;
    if (event.excelRow === 7) {
      if (header || expectedHeaders.some((v,i) => cell(i+1)?.kind !== "text" || raw(i+1) !== v)) throw Error("TPLUS_MATRIX_HEADER");
      header = true; continue;
    }
    if (!header) throw Error("TPLUS_MATRIX_HEADER");
    const fields = Array.from({length: 7}, (_,i) => raw(i+1));
    // The inspected export has a second measure header on row 8. Only skip it
    // when all dimension cells are genuinely blank and all measures agree.
    const measure = cell(8);
    if (event.excelRow === 8 && Array.from({length:7}, (_,i) => cell(i+1)).every(x => !x || (x.kind === "blank" && x.raw === null)) &&
        measure?.kind === "text" && typeof measure.raw === "string" && measure.raw.includes("现存") && measure.raw.includes("量") &&
        Array.from({length:totalColumn-7}, (_,i) => cell(i+8)).every(x => x?.kind === "text" && x.raw === measure.raw)) continue;
    const possibleSummary = fields.some(value => typeof value === "string" && (value.includes("合计") || value.includes("小计")));
    const quantities = [], unresolvedCells = []; let sum = 0n, invalid = false;
    const exactInteger = value => {
      if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
      const [whole, fraction = ""] = value.split(".");
      return /^0*$/.test(fraction) ? BigInt(whole) : null;
    };
    for (let col = 8; col < totalColumn; col++) {
      const entry = cell(col), value = raw(col);
      if (!entry || (entry.kind === "blank" && value === null)) continue;
      const integer = exactInteger(value);
      if (!entry || !["number", "text"].includes(entry.kind) || integer === null) { invalid = true; unresolvedCells.push({sourceSize: expectedHeaders[col-1], sourceColumn: col, sourceCell: entry}); continue; }
      sum += integer; quantities.push({sourceSize: expectedHeaders[col-1], rawQuantity: value, sourceColumn: col});
    }
    const total = cell(totalColumn), value = raw(totalColumn);
    const totalInteger = exactInteger(value);
    const totalValid = total && ["number", "text"].includes(total.kind) && totalInteger !== null;
    const totalsMatch = Boolean(!invalid && totalValid && sum === totalInteger);
    yield {event: "candidate", sheet: "第一页", excelRow: event.excelRow,
      warehouse: fields[0], classification: fields[1], productCode: fields[2], productName: fields[3], sourceUnit: fields[4], color: fields[5], style: fields[6],
      sourceDimensions: Array.from({length:7}, (_,i) => cell(i+1) ?? null), quantities, unresolvedCells, sourceTotal: total ?? null, possibleSummary,
      status: !possibleSummary && totalsMatch && [1, 3, 6, 7].every(i => cell(i)?.kind === "text" && typeof raw(i) === "string" && raw(i) !== "") ? "ROW_ARITHMETIC_ONLY" : "PENDING_SOURCE_FACTS",
      rowTotalMatched: totalsMatch, omittedBlankCellsAreUnknown: true};
  }
  if (!eof) throw Error("TPLUS_MATRIX_EOF");
}

async function stream() {
  const args = process.argv.slice(3);
  if (args.length !== 3 || !/^[0-9]+(?:,[0-9]+)*$/.test(args[2])) throw Error("STREAM_ARGUMENTS");
  const path = resolve(args[0]), info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw Error("STREAM_SOURCE_INVALID");
  const child = spawn("python3", [fileURLToPath(new URL("read-xlsx.py", import.meta.url)), "--stream", path, args[1], args[2]], { stdio: ["ignore", "pipe", "ignore"] });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
  let rows = 0, finished = false, failed = false, cancelled = false, eofLine;
  let releaseBackpressure = null, childSignalled = false;
  const stopChild = () => { if (!childSignalled) { childSignalled = true; child.kill("SIGTERM"); } };
  const cancel = () => { cancelled = true; stopChild(); releaseBackpressure?.(); process.stdout.destroy(); };
  const outputError = () => { failed = true; stopChild(); releaseBackpressure?.(); };
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel); process.stdout.on("error", outputError);
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      let event; try { event = JSON.parse(line); } catch { failed = true; break; }
      if (finished || !event || !["row", "eof", "error"].includes(event.event)) { failed = true; break; }
      if (event.event === "row") rows++;
      if (event.event === "eof") { if (event.rows !== rows || event.sheet !== args[1]) { failed = true; break; } finished = true; eofLine = line; continue; }
      if (event.event === "error") { failed = true; break; }
      if (!process.stdout.write(line + "\n")) await new Promise(resolve => {
        const done = () => { process.stdout.off("drain", done); process.stdout.off("error", done); releaseBackpressure = null; resolve(); };
        releaseBackpressure = done;
        process.stdout.once("drain", done); process.stdout.once("error", done);
        if (failed || cancelled) done();
      });
      if (failed || cancelled) break;
    }
  } catch { failed = true; }
  finally {
    if (failed || cancelled || !finished) { stopChild(); child.stdout.resume(); }
    const code = await done;
    process.off("SIGINT", cancel); process.off("SIGTERM", cancel);
    if (cancelled) process.exit(143); // Child has exited; discard blocked partial output.
    if (code !== 0 || !finished || failed || cancelled) {
      if (!process.stdout.destroyed && !process.stdout.errored) process.stdout.write(JSON.stringify({event:"error",code:"XLSX_STREAM_INCOMPLETE",rows}) + "\n");
      process.exitCode = cancelled ? 143 : 3;
    } else if (!process.stdout.destroyed) process.stdout.write(eofLine + "\n");
    process.stdout.off("error", outputError);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--stream") {
  stream().catch(() => { process.stdout.write(JSON.stringify({event:"error",code:"XLSX_STREAM_FAILED"}) + "\n"); process.exitCode = 3; });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try { run(); }
catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const capability = /(?:_LIMIT|MAXBUFFER|ENOBUFS|XLSX_READER_FAILED)/i.test(reason);
  process.stdout.write(JSON.stringify({ databaseExecuted: false, importReady: false, publishReady: false, priceCompletenessVerified: false,
    dataStatus: "NOT_CHECKED", inputReadStatus: "BLOCKED", readerIssues: [{ code: reason.split(":")[0], reason,
      severity: capability ? "CAPABILITY" : "ERROR", category: capability ? "TOOL_RESOURCE_OR_EXECUTION_LIMIT" : "OPERATOR_INPUT_OR_PACKAGE_BLOCKER" }],
    minimalAction: capability ? "开发按真实体量补分块/流式支持，不要求用户重清洗；原始数据尚未判为业务无效。" : "核对输入路径、工具参数或原件包安全；未执行导入。" }, null, 2) + "\n");
  process.exitCode = capability ? 3 : 2;
}
