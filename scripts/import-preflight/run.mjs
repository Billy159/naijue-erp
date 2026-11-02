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
