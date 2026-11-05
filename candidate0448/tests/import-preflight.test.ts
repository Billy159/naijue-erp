import test from "node:test";
import assert from "node:assert/strict";
import { IMPORT_PREFLIGHT_SHEETS } from "../packages/application/src/import-preflight-contract.ts";
import { preflightImport, parseImportCnyYuan, parseImportInteger } from "../packages/application/src/import-preflight.ts";
import type { ImportPreflightInput, ImportSourceCell, ImportSourceFile, ImportSourceSheet } from "../packages/application/src/import-preflight.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";

const text = (raw: string): ImportSourceCell => ({ kind: "text", raw });
const number = (raw: string): ImportSourceCell => ({ kind: "number", raw });
const empty: ImportSourceCell = { kind: "blank", raw: null };
function sheet(name: string, values: readonly Record<string, string | ImportSourceCell | null>[] = []): ImportSourceSheet {
  const contract = IMPORT_PREFLIGHT_SHEETS.find(s => s.name === name)!;
  return { name, headerRow: 1, headers: contract.fields.map(f => text(f.header)), rows: values.map((v, i) => ({ excelRow: i + 2, cells: contract.fields.map(f => {
    const value = v[f.header] ?? v[f.header.replace(/^\*/, "")];
    return value == null ? empty : typeof value === "string" ? text(value) : value;
  }) })) };
}
const file = (sheets: readonly ImportSourceSheet[], name = "SYNTHETIC.xlsx"): ImportSourceFile => ({ fileName: name, sha256: "a".repeat(64), dateSystem: "1900", sheets });
function input(sheets: readonly ImportSourceSheet[], mode: "STAGED" | "FINAL" = "STAGED"): ImportPreflightInput {
  return { batchId: "SYNTHETIC-BATCH", fixedSourceNamespace: "synthetic.only", mode, files: [file(sheets)] };
}
const customer = (id = "000001") => ({ 来源编号: id, 原编码: "000001", 名称: "SYNTHETIC CUSTOMER", 状态: "正常" });
const product = (id = "SYN-P") => ({ 来源编号: id, 款号: "000101", 商品名称: "SYNTHETIC PRODUCT", 分类路径: "SYNTHETIC/CATEGORY", 尺码组: "SYNTHETIC SIZE GROUP", 状态: "正常" });
const sku = (id = "SYN-SKU") => ({ 来源编号: id, SKU编码: id, 商品来源编号: "SYN-P", 颜色编码: "01", 颜色名称: "SYNTHETIC COLOR", 版型编码: "A", 完整尺码: "165/S", 状态: "正常", 切换范围: "本次完整核准" });
const codes = (result: ReturnType<typeof preflightImport>) => result.issues.map(i => i.code);

test("SYNTHETIC offline contract: exactly original 18 sheets / 154 ordered fields", () => {
  assert.equal(IMPORT_PREFLIGHT_SHEETS.length, 18);
  assert.equal(IMPORT_PREFLIGHT_SHEETS.reduce((n, s) => n + s.fields.length, 0), 154);
  assert.deepEqual(IMPORT_PREFLIGHT_SHEETS.find(s => s.name === "07仓库")!.fields.map(f => f.header), ["*来源编号", "*仓库名称", "*所属厅来源编号", "*状态", "*切换范围"]);
  assert.equal(IMPORT_PREFLIGHT_SHEETS.find(s => s.name === "01商品")!.fields.filter(f => f.type === "MONEY").length, 9);
});
test("SYNTHETIC exact yuan parser: no float, rounding, exponent, or blank-to-zero", () => {
  for (const [raw, expected] of [["128.50", "12850"], ["0", "0"], ["-85.00", "-8500"], ["0.01", "1"], ["9999999999999999.99", "999999999999999999"], ["0001.2", "120"]]) assert.equal(parseImportCnyYuan(raw!), expected);
  for (const raw of ["", " ", " 1.00", "1.001", "1.000", "1e2", "1,000", "￥1", "NaN", ".5", "+1", "1."]) assert.throws(() => parseImportCnyYuan(raw), /CNY_YUAN_PRECISION_OR_FORMAT/);
  assert.throws(() => parseImportCnyYuan("10000000000000000"), /OVERFLOW/);
  assert.equal(parseImportInteger("-9223372036854775808"), "-9223372036854775808");
  assert.equal(parseImportInteger("9223372036854775807"), "9223372036854775807");
  for (const raw of ["1.1", "1e3", "1.0", "+1"]) assert.throws(() => parseImportInteger(raw), /FORMAT/);
  assert.throws(() => parseImportInteger("9223372036854775808"), /OVERFLOW/);
});
test("SYNTHETIC intake: stable identities preserve leading zeros and do not depend on file/row order", () => {
  const one = preflightImport(input([sheet("04客户", [customer()])]));
  const moved = sheet("04客户", [customer()]);
  const two = preflightImport({ ...input([]), files: [file([{ ...moved, rows: moved.rows.map(r => ({ ...r, excelRow: 903 })) }], "RENAMED.xlsx")] });
  assert.equal(one.records[0]!.sourceId, "000001");
  assert.equal(one.records[0]!.sourceKey, "src:000001");
  assert.equal(one.records[0]!.targetId, stableImportId("entity", "synthetic.only", "CUSTOMER", "src:000001"));
  assert.equal(one.records[0]!.targetId, two.records[0]!.targetId);
  assert.equal(one.records[0]!.sourceRecordHash, two.records[0]!.sourceRecordHash);
  assert.equal(one.importReady, false); assert.equal(one.publishReady, false); assert.equal(one.databaseExecuted, false);
});
test("SYNTHETIC intake: namespace and entity category isolate same source ID", () => {
  const a = preflightImport(input([sheet("04客户", [customer()]), sheet("05供应商", [customer()])]));
  const b = preflightImport({ ...input([sheet("04客户", [customer()])]), fixedSourceNamespace: "synthetic.other" });
  assert.notEqual(a.records[0]!.targetId, a.records[1]!.targetId);
  assert.notEqual(a.records[0]!.targetId, b.records[0]!.targetId);
});
test("SYNTHETIC intake: schema checks report changed headers and mistyped input sheets, skip exact guides only", () => {
  const changed = sheet("04客户", [customer()]);
  const report = preflightImport(input([{ ...changed, headers: [...changed.headers].reverse() }, { ...sheet("07仓库"), name: "07仓庫" },
    { name: "示例勿导入", headerRow: 1, headers: [text("FAKE")], rows: [{ excelRow: 2, cells: [text("DO NOT INTAKE")] }] }]));
  assert.ok(codes(report).includes("INPUT_HEADER_MISMATCH")); assert.ok(codes(report).includes("UNKNOWN_INPUT_SHEET"));
  assert.equal(report.records.length, 0); assert.ok(!report.issues.some(i => i.sheet === "示例勿导入"));
});
test("SYNTHETIC precision: nine prices/raw blanks preserved; numeric precision risks do not silently normalize", () => {
  const report = preflightImport(input([sheet("01商品", [{ ...product(), 采购价: "40.00", 零售价: "0", 最低售价: number("9999999999999999.99"), "十级批发价（葛玉珠）": null }])]));
  const r = report.records[0]!;
  assert.equal(r.normalizedValues["采购价"], "4000"); assert.equal(r.normalizedValues["零售价"], "0");
  assert.equal(r.normalizedValues["十级批发价（葛玉珠）"], null); assert.equal(r.normalizedValues["最低售价"], null);
  assert.equal(r.rawValues["最低售价"]!.raw, "9999999999999999.99");
  assert.ok(codes(report).includes("EXCEL_NUMERIC_PRECISION_UNVERIFIED"));
  const issue = report.issues.find(i => i.code === "EXCEL_NUMERIC_PRECISION_UNVERIFIED")!;
  assert.deepEqual([issue.fileName, issue.sheet, issue.excelRow, issue.sourceId, issue.field], ["SYNTHETIC.xlsx", "01商品", 2, "SYN-P", "最低售价"]);
});
test("SYNTHETIC formula and numeric IDs: preserve values and isolate affected facts, no guessed text conversion", () => {
  const report = preflightImport(input([sheet("04客户", [{ ...customer(), 来源编号: number("1"), 名称: { kind: "formula", raw: null, formula: 'CONCAT("SYN", " NAME")' } }])]));
  assert.ok(codes(report).includes("TEXT_IDENTITY_OR_VALUE_UNVERIFIED")); assert.ok(codes(report).includes("FORMULA_NOT_VERIFIED"));
  assert.equal(report.records[0]!.sourceKey, null); assert.equal(report.records[0]!.rawValues["*名称"]!.formula, 'CONCAT("SYN", " NAME")');
});
test("SYNTHETIC cross-file references: forward/circular references resolve without row order or labels", () => {
  const report = preflightImport({ ...input([]), files: [file([sheet("07仓库", [{ 来源编号: "SYN-W", 仓库名称: "SYNTHETIC", 所属厅来源编号: "SYN-H", 状态: "停用", 切换范围: "本次完整核准" }])], "WAREHOUSE.xlsx"),
    file([sheet("06厅", [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC", 默认销货仓来源编号: "SYN-W", 状态: "正常" }])], "HALL.xlsx")] });
  assert.ok(!codes(report).includes("SOURCE_REFERENCE_NOT_PRESENT")); assert.ok(!codes(report).includes("CUTOFF_SCOPE_NOT_APPROVED"));
});
test("SYNTHETIC staged/final: missing later-batch references are pending, final unresolved references errors", () => {
  const data = [sheet("02合法SKU", [sku()])];
  const staged = preflightImport(input(data)); const final = preflightImport(input(data, "FINAL"));
  assert.equal(staged.issues.find(i => i.code === "SOURCE_REFERENCE_NOT_PRESENT")!.severity, "PENDING");
  assert.equal(final.issues.find(i => i.code === "SOURCE_REFERENCE_NOT_PRESENT")!.severity, "ERROR");
  assert.equal(staged.importReady, false); assert.equal(final.importReady, false);
});
test("SYNTHETIC prior manifest: same namespace resolves later refs; wrong namespace/content remain blocked", () => {
  const p = preflightImport(input([sheet("01商品", [product()])]));
  const report = preflightImport({ ...input([sheet("02合法SKU", [sku()])]), priorManifest: p.identityManifest });
  assert.ok(!codes(report).includes("SOURCE_REFERENCE_NOT_PRESENT"));
  const wrong = preflightImport({ ...input([sheet("02合法SKU", [sku()])]), priorManifest: { ...p.identityManifest, fixedSourceNamespace: "other" } });
  assert.ok(codes(wrong).includes("PRIOR_NAMESPACE_MISMATCH")); assert.ok(codes(wrong).includes("SOURCE_REFERENCE_NOT_PRESENT"));
  const changed = preflightImport({ ...input([sheet("01商品", [{ ...product(), 商品名称: "SYNTHETIC CHANGED" }])]), priorManifest: p.identityManifest });
  assert.ok(codes(changed).includes("PRIOR_SOURCE_CONTENT_CONFLICT"));
});
test("SYNTHETIC uniqueness: source IDs, actual SKU tuple, original line numbers and same-valued balances all reject duplicates", () => {
  const report = preflightImport(input([sheet("02合法SKU", [sku(), { ...sku("OTHER") }]), sheet("04客户", [customer(), customer()]),
    sheet("12切换库存", [{ 来源编号: "SYN-B1", 仓库来源编号: "SYN-W", SKU来源编号: "SYN-SKU", 核准库存数量: "7", 核准依据: "SYNTHETIC ONLY" }, { 来源编号: "SYN-B2", 仓库来源编号: "SYN-W", SKU来源编号: "SYN-SKU", 核准库存数量: "7", 核准依据: "SYNTHETIC ONLY" }]),
    sheet("17历史调拨明细", [{ 来源编号: "SYN-L1", 单据来源编号: "SYN-T", 原行号: "1", SKU来源编号: "SYN-SKU", 原数量: "2" }, { 来源编号: "SYN-L2", 单据来源编号: "SYN-T", 原行号: "1", SKU来源编号: "SYN-SKU", 原数量: "1" }])]));
  for (const code of ["DUPLICATE_SOURCE_IDENTITY", "DUPLICATE_SKU_COMBINATION", "DUPLICATE_WAREHOUSE_SKU_BALANCE", "DUPLICATE_TRANSFER_LINE"]) assert.ok(codes(report).includes(code), code);
  assert.equal(report.records.filter(r => r.entityType === "INVENTORY_BASELINE").length, 2);
});
test("SYNTHETIC historical barcode: preserve leading zeros, disabled bindings still conflict across SKUs", () => {
  const report = preflightImport(input([sheet("03历史条码", [{ 来源编号: "SYN-BC1", 条码: "000000001", SKU来源编号: "SYN-SKU1", 条码性质: "主码", 状态: "停用" },
    { 来源编号: "SYN-BC2", 条码: "000000001", SKU来源编号: "SYN-SKU2", 条码性质: "已确认旧码", 状态: "正常" }])]));
  assert.ok(codes(report).includes("BARCODE_BINDS_MULTIPLE_SKUS")); assert.equal(report.records[0]!.rawValues["*条码"]!.raw, "000000001");
});
test("SYNTHETIC inventory: negative/zero explicit quantities retained, no absent-is-zero or Cartesian rows", () => {
  const report = preflightImport(input([sheet("12切换库存", [{ 来源编号: "SYN-B1", 仓库来源编号: "SYN-W", SKU来源编号: "SYN-1", 核准库存数量: "-1", 核准依据: "SYNTHETIC" },
    { 来源编号: "SYN-B2", 仓库来源编号: "SYN-W", SKU来源编号: "SYN-2", 核准库存数量: "0", 核准依据: "SYNTHETIC" }])]));
  assert.deepEqual(report.records.map(r => r.normalizedValues["*核准库存数量"]), ["-1", "0"]); assert.equal(report.records.length, 2); assert.equal(report.publishReady, false);
});
test("SYNTHETIC histories: preserve approved state/unknown identity and raw Excel date, isolate whole document", () => {
  const report = preflightImport(input([sheet("13历史销货单头", [{ 来源编号: "SYN-HISTORY", 原单号: "000001", 单据类型: "销售", 业务日期: number("46315"), 客户来源编号: "SYN-C", 仓库来源编号: "SYN-W", 原审核状态: "已审核", 优惠前金额: "100", 整单优惠: "0", 应结金额: "100" }])]));
  assert.equal(report.records[0]!.rawValues["*业务日期"]!.raw, "46315"); assert.equal(report.records[0]!.normalizedValues["原制单账号编号"], null);
  assert.ok(codes(report).includes("DATE_SEMANTICS_NOT_IMPLEMENTED")); assert.ok(codes(report).includes("DOCUMENT_HAS_NO_SOURCE_LINES"));
  assert.equal(report.isolatedDocuments[0]!.sourceStatusPreserved, "已审核"); assert.equal(report.importReady, false);
});
test("SYNTHETIC safety: checking every supplied sheet is still not DB execution/import/publish acceptance", () => {
  const all = IMPORT_PREFLIGHT_SHEETS.map(c => sheet(c.name, c.name === "04客户" ? [customer()] : []));
  const report = preflightImport(input(all, "FINAL"));
  assert.equal(report.dataStatus, "CHECKED_WITHIN_SCOPE"); assert.equal(report.issues.length, 0);
  assert.deepEqual([report.databaseExecuted, report.importReady, report.publishReady], [false, false, false]);
  assert.ok(report.capabilityBlockers.includes("HISTORY_IMPORT_AND_BASELINE_AWARE_EDIT_NOT_IMPLEMENTED"));
});
test("SYNTHETIC bounds: precise overlong cell and malformed JS numeric input fail rather than truncate/coerce", () => {
  assert.throws(() => preflightImport(input([sheet("04客户", [{ ...customer(), 名称: "X".repeat(32769) }])])), /OFFLINE_CELL_TEXT_LIMIT:SYNTHETIC.xlsx:04客户:2/);
  const source = input([sheet("04客户", [customer()])]);
  (source.files[0]!.sheets[0]!.rows[0]!.cells[0] as unknown as { raw: unknown }).raw = 1;
  assert.throws(() => preflightImport(source), /INVALID_OFFLINE_IMPORT_CELL/);
});

test("SYNTHETIC manifest safety: both unique-key conflict participants and dependent records are blocked", () => {
  const report = preflightImport(input([sheet("04客户", [customer("SYN-C1"), customer("SYN-C2")]), sheet("06厅", [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC", 默认客户来源编号: "SYN-C1", 状态: "正常" }])]));
  assert.equal(report.issues.filter(i => i.code === "DUPLICATE_CUSTOMER_CODE").length, 2);
  assert.ok(codes(report).includes("SOURCE_REFERENCE_TARGET_NOT_VALIDATED"));
  assert.equal(report.identityManifest.identities.length, 0);
  assert.ok(report.recordChecks.every(r => r.sourceValidation === "PENDING_OR_INVALID"));
});
test("SYNTHETIC manifest safety: duplicate prior identities are all poisoned, not resolved to the first", () => {
  const p = preflightImport(input([sheet("01商品", [product()])]));
  const entry = p.identityManifest.identities[0]!;
  const report = preflightImport({ ...input([sheet("02合法SKU", [sku()])]), priorManifest: { fixedSourceNamespace: "synthetic.only", identities: [entry, entry] } });
  assert.ok(codes(report).includes("INVALID_PRIOR_IDENTITY")); assert.ok(codes(report).includes("SOURCE_REFERENCE_NOT_PRESENT"));
  assert.equal(report.identityManifest.identities.length, 0);
});
test("SYNTHETIC source issue: unresolved original issue blocks the actual target and is never exported as imported identity", () => {
  const report = preflightImport(input([sheet("04客户", [customer("SYN-C")]), sheet("18待处理", [{ 问题编号: "SYN-ISSUE", 涉及页签: "04客户", 来源编号: "SYN-C", 问题字段: "名称", 问题说明: "SYNTHETIC unresolved source issue", 核对结果: "待核" }])]));
  assert.equal(report.dataStatus, "PENDING"); assert.equal(report.identityManifest.identities.length, 0);
  assert.equal(report.issues.filter(i => i.code === "UNRESOLVED_SOURCE_ISSUE").length, 2);
});
test("SYNTHETIC barcode conflict: first and later bindings all remain excluded from prior identity evidence", () => {
  const report = preflightImport(input([sheet("03历史条码", [{ 来源编号: "SYN-BC1", 条码: "001", SKU来源编号: "SYN-SKU1", 条码性质: "主码", 状态: "正常" }, { 来源编号: "SYN-BC2", 条码: "001", SKU来源编号: "SYN-SKU2", 条码性质: "已确认旧码", 状态: "正常" }])]));
  assert.equal(report.issues.filter(i => i.code === "BARCODE_BINDS_MULTIPLE_SKUS").length, 2);
  assert.equal(report.identityManifest.identities.length, 0);
});

test("SYNTHETIC whole-document closure: one invalid child blocks header and all siblings from prior identities", () => {
  const report = preflightImport(input([sheet("07仓库", [{ 来源编号: "SYN-W1", 仓库名称: "SYNTHETIC", 所属厅来源编号: "SYN-H", 状态: "正常", 切换范围: "本次完整核准" }, { 来源编号: "SYN-W2", 仓库名称: "SYNTHETIC", 所属厅来源编号: "SYN-H", 状态: "正常", 切换范围: "本次完整核准" }]),
    sheet("06厅", [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC", 状态: "正常" }]), sheet("01商品", [product()]), sheet("02合法SKU", [sku()]),
    sheet("16历史调拨单头", [{ 来源编号: "SYN-T", 原单号: "0001", 业务日期: number("46315"), 调出仓来源编号: "SYN-W1", 调入仓来源编号: "SYN-W2", 原审核状态: "已审核" }]),
    sheet("17历史调拨明细", [{ 来源编号: "SYN-L1", 单据来源编号: "SYN-T", 原行号: "1", SKU来源编号: "SYN-SKU", 原数量: "0" }, { 来源编号: "SYN-L2", 单据来源编号: "SYN-T", 原行号: "2", SKU来源编号: "SYN-SKU", 原数量: "2" }])]));
  assert.ok(codes(report).includes("SOURCE_DOCUMENT_MEMBER_NOT_VALIDATED"));
  for (const r of report.recordChecks.filter(r => r.sheet === "16历史调拨单头" || r.sheet === "17历史调拨明细")) assert.equal(r.sourceValidation, "PENDING_OR_INVALID");
  assert.ok(!report.identityManifest.identities.some(r => ["TRANSFER_HEADER", "TRANSFER_LINE"].includes(r.entityType)));
  assert.equal(report.isolatedDocuments[0]!.sourceValidation, "PENDING_OR_INVALID");
});

test("SYNTHETIC unresolved source issue poisons prior-only target before current references resolve", () => {
  const previous = preflightImport(input([sheet("04客户", [customer("SYN-C")])]));
  const report = preflightImport({ ...input([sheet("06厅", [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC", 默认客户来源编号: "SYN-C", 状态: "正常" }]),
    sheet("18待处理", [{ 问题编号: "SYN-I", 涉及页签: "04客户", 来源编号: "SYN-C", 问题字段: "名称", 问题说明: "SYNTHETIC unresolved", 核对结果: "待核" }])]), priorManifest: previous.identityManifest });
  assert.ok(codes(report).includes("SOURCE_REFERENCE_NOT_PRESENT")); assert.equal(report.identityManifest.identities.length, 0);
});
test("SYNTHETIC barcode conflict related evidence remains bounded per affected row", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ 来源编号: `SYN-BC${i}`, 条码: "0001", SKU来源编号: i % 2 ? "SYN-SKU1" : "SYN-SKU2", 条码性质: "已确认旧码", 状态: "正常" }));
  const report = preflightImport(input([sheet("03历史条码", rows)]));
  const conflicts = report.issues.filter(i => i.code === "BARCODE_BINDS_MULTIPLE_SKUS");
  assert.equal(conflicts.length, 20); assert.ok(conflicts.every(i => i.relatedSourceKeys.length === 2));
});

test("SYNTHETIC source location aliases: duplicate basenames/row positions cannot validate the wrong record", () => {
  const report = preflightImport({ ...input([]), files: [file([sheet("04客户", [{ ...customer("SYN-C1"), 名称: null }])], "SAME.xlsx"), file([sheet("04客户", [{ ...customer("SYN-C2"), 原编码: "000002" }])], "SAME.xlsx")] });
  assert.ok(codes(report).includes("DUPLICATE_INPUT_FILE_NAME"));
  assert.ok(report.recordChecks.every(r => r.sourceValidation === "PENDING_OR_INVALID")); assert.equal(report.identityManifest.identities.length, 0);
  const duplicatedRows = sheet("04客户", [customer("SYN-C1"), { ...customer("SYN-C2"), 原编码: "000002" }]);
  const samePosition = { ...duplicatedRows, rows: duplicatedRows.rows.map(r => ({ ...r, excelRow: 2 })) };
  const second = preflightImport(input([samePosition]));
  assert.ok(codes(second).includes("DUPLICATE_OR_INVALID_EXCEL_ROW")); assert.equal(second.identityManifest.identities.length, 0);
});
test("SYNTHETIC nine-price contract: verified v0.3 blanks are UNSET, zero distinct, formulas UNKNOWN, never native authority", () => {
  const report = preflightImport(input([sheet("01商品", [{ ...product(), 零售价: "0", 采购价: { kind: "formula", raw: "0", formula: "1-1" } }])]));
  assert.equal(report.priceCompletenessVerified, false); assert.equal(report.blankPriceMeaning, "VERIFIED_V03_PRICE_COLUMN_BLANK_IS_UNSET");
  const facts = report.records[0]!.productPriceFacts!;
  assert.equal(Object.keys(facts).length, 9);
  assert.equal(facts.minimumPrice.state, "UNSET"); assert.equal(facts.minimumPrice.yuan, null); assert.equal(facts.minimumPrice.provenance, "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET");
  assert.equal(facts.price.state, "VALUE"); assert.equal(facts.price.minorAmount, "0"); assert.equal(facts.purchasePrice.state, "UNKNOWN");
  assert.equal(report.records[0]!.normalizedValues["最低售价"], null);
});

test("SYNTHETIC final pending capability/source issue does not turn dependent data into invented source errors", () => {
  const all = IMPORT_PREFLIGHT_SHEETS.map(c => sheet(c.name, c.name === "04客户" ? [customer("SYN-C")] : c.name === "06厅" ? [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC", 默认客户来源编号: "SYN-C", 状态: "正常" }] : c.name === "18待处理" ? [{ 问题编号: "SYN-I", 涉及页签: "04客户", 来源编号: "SYN-C", 问题字段: "名称", 问题说明: "SYNTHETIC pending review", 核对结果: "待核" }] : []));
  const report = preflightImport(input(all, "FINAL"));
  assert.equal(report.dataStatus, "PENDING"); assert.ok(!report.issues.some(i => i.severity === "ERROR"));
  assert.equal(report.issues.find(i => i.code === "SOURCE_REFERENCE_TARGET_NOT_VALIDATED")!.severity, "PENDING");
  assert.equal(report.identityManifest.identities.length, 0);
});

test("SYNTHETIC account/hall contract: original two headers remain optional historical recommendations, never permissions", () => {
  const contract = IMPORT_PREFLIGHT_SHEETS.find(s => s.name === "11账户适用厅")!;
  assert.deepEqual(contract.fields.map(f => f.header), ["*账户来源编号", "*厅来源编号"]);
  assert.equal(contract.intakeOptional, true);
  assert.equal(contract.relationshipUse, "HISTORICAL_RECOMMENDATION_ONLY_NOT_PERMISSION");
  assert.equal(IMPORT_PREFLIGHT_SHEETS.filter(s => s.intakeOptional).length, 1);
});
function accountMasterSheets(includeRecommendations: boolean): ImportSourceSheet[] {
  return IMPORT_PREFLIGHT_SHEETS.filter(s => includeRecommendations || s.name !== "11账户适用厅").map(s => sheet(s.name,
    s.name === "09收款方式" ? [{ 来源编号: "SYN-PM", 方式名称: "SYNTHETIC METHOD", 状态: "正常" }]
      : s.name === "10收款账户" ? [{ 来源编号: "SYN-PA", 账户显示名称: "SYNTHETIC ACCOUNT", 收款方式来源编号: "SYN-PM", 状态: "正常" }] : []));
}
test("SYNTHETIC optional account/hall sheet: omitted or empty in STAGED/FINAL never creates missing master/permission blockers", () => {
  for (const mode of ["STAGED", "FINAL"] as const) for (const provided of [false, true]) {
    const report = preflightImport(input(accountMasterSheets(provided), mode));
    assert.equal(report.dataStatus, "CHECKED_WITHIN_SCOPE");
    assert.equal(report.issues.length, 0);
    assert.equal(report.records.find(r => r.entityType === "PAYMENT_ACCOUNT")!.sourceId, "SYN-PA");
    assert.equal(report.recordChecks.find(r => r.sheet === "10收款账户")!.sourceValidation, "CHECKED_WITHIN_SCOPE");
    assert.ok(report.identityManifest.identities.some(r => r.entityType === "PAYMENT_ACCOUNT" && r.sourceKey === "src:SYN-PA"));
    assert.ok(!report.issues.some(i => /PERMISSION|AUTHORIZATION/.test(i.code)));
    assert.deepEqual([report.databaseExecuted, report.importReady, report.publishReady], [false, false, false]);
  }
});
test("SYNTHETIC provided historical account/hall recommendation is retained without changing account identity or demanding reassignment", () => {
  const baseline = preflightImport(input(accountMasterSheets(false), "FINAL"));
  const supplied = accountMasterSheets(false).map(s => s.name === "06厅" ? sheet("06厅", [{ 来源编号: "SYN-H", 厅名称: "SYNTHETIC HALL", 状态: "正常" }]) : s);
  const report = preflightImport(input([...supplied, sheet("11账户适用厅", [{ 账户来源编号: "SYN-PA", 厅来源编号: "SYN-H" }])], "FINAL"));
  assert.equal(report.issues.length, 0);
  const relationship = report.records.find(r => r.entityType === "PAYMENT_ACCOUNT_HALL")!;
  assert.equal(relationship.rawValues["*账户来源编号"]!.raw, "SYN-PA");
  assert.equal(relationship.rawValues["*厅来源编号"]!.raw, "SYN-H");
  assert.equal(report.records.find(r => r.entityType === "PAYMENT_ACCOUNT")!.targetId, baseline.records.find(r => r.entityType === "PAYMENT_ACCOUNT")!.targetId);
});
test("SYNTHETIC malformed optional recommendation reports only its source relation, not a false account permission failure", () => {
  const report = preflightImport(input([...accountMasterSheets(false), sheet("11账户适用厅", [{ 账户来源编号: "SYN-PA", 厅来源编号: "SYN-MISSING-HALL" }])], "FINAL"));
  assert.ok(report.issues.some(i => i.sheet === "11账户适用厅" && i.code === "SOURCE_REFERENCE_NOT_PRESENT"));
  assert.equal(report.recordChecks.find(r => r.sheet === "10收款账户")!.sourceValidation, "CHECKED_WITHIN_SCOPE");
  assert.ok(report.identityManifest.identities.some(r => r.entityType === "PAYMENT_ACCOUNT"));
  assert.ok(!report.issues.some(i => i.sheet === "10收款账户" || /PERMISSION|AUTHORIZATION/.test(i.code)));
});

const originalSettlementHeaders = ["*来源编号", "*单据来源编号", "*原收退行号", "*账户来源编号", "*方向", "*金额", "原账户显示名", "原方式显示名"];
const snapshotSourceHeader = "原收款方式来源编号";
const syntheticSettlement = () => ({ 来源编号: "SYN-SETTLEMENT", 单据来源编号: "SYN-SALE", 原收退行号: "1", 账户来源编号: "SYN-PA", 方向: "收款", 金额: "10.00", 原账户显示名: "SYNTHETIC OLD ACCOUNT", 原方式显示名: "SYNTHETIC DISPLAY ONLY" });
function settlementSnapshotSheet(method: ImportSourceCell | string | null, extended = true): ImportSourceSheet {
  const original = sheet("15历史收退记录", [syntheticSettlement()]);
  return extended ? { ...original, headers: [...original.headers, text(snapshotSourceHeader)], rows: original.rows.map(r => ({ ...r, cells: [...r.cells, method === null ? empty : typeof method === "string" ? text(method) : method] })) } : original;
}
test("SYNTHETIC payment-method snapshot contract: original 18 sheets/154 columns and old eight headers unchanged, one optional trailing fact only", () => {
  const contract = IMPORT_PREFLIGHT_SHEETS.find(s => s.name === "15历史收退记录")!;
  assert.deepEqual(contract.fields.map(f => f.header), originalSettlementHeaders);
  assert.equal(IMPORT_PREFLIGHT_SHEETS.reduce((n, s) => n + s.fields.length, 0), 154);
  assert.equal(IMPORT_PREFLIGHT_SHEETS.flatMap(s => s.optionalTrailingFields ?? []).length, 1);
  assert.deepEqual(contract.optionalTrailingFields, [{ header: snapshotSourceHeader, type: "TEXT", required: false, referenceEntity: "PAYMENT_METHOD", nativeTarget: "sales_settlement.payment_method_id_snapshot" }]);
});
test("SYNTHETIC old settlement: absent method ID is permitted unknown, never inferred from matching display name or current account method", () => {
  const report = preflightImport(input([settlementSnapshotSheet(null, false), sheet("09收款方式", [{ 来源编号: "SYN-PM", 方式名称: "SYNTHETIC DISPLAY ONLY", 状态: "正常" }]),
    sheet("10收款账户", [{ 来源编号: "SYN-PA", 账户显示名称: "SYNTHETIC OLD ACCOUNT", 收款方式来源编号: "SYN-PM", 状态: "正常" }])]));
  const record = report.records.find(r => r.entityType === "SETTLEMENT")!;
  assert.equal(record.normalizedValues[snapshotSourceHeader], null);
  assert.equal(record.rawValues[snapshotSourceHeader], undefined);
  assert.equal(Object.keys(record.rawValues).length, 8);
  assert.ok(!report.issues.some(i => i.field === snapshotSourceHeader || i.code === "INPUT_HEADER_MISMATCH"));
  assert.equal(report.historicalPaymentMethodSnapshotPolicy.absentValue, "UNKNOWN_NOT_A_RECENT_RECOMMENDATION_FACT");
  assert.equal(report.historicalPaymentMethodSnapshotPolicy.inferredFromDisplayNameOrCurrentAccount, false);
  assert.equal(report.historicalPaymentMethodSnapshotPolicy.providedReferenceAloneGrantsRecommendation, false);
});
test("SYNTHETIC extended settlement: appended original method reference maps by source ID and preserves source values/identity", () => {
  const previous = preflightImport(input([settlementSnapshotSheet(null, false)]));
  const report = preflightImport(input([settlementSnapshotSheet("000009"), sheet("09收款方式", [{ 来源编号: "000009", 方式名称: "SYNTHETIC METHOD", 状态: "正常" }])]));
  const record = report.records.find(r => r.entityType === "SETTLEMENT")!;
  assert.equal(record.normalizedValues[snapshotSourceHeader], "000009"); assert.equal(record.rawValues[snapshotSourceHeader]!.raw, "000009");
  assert.equal(record.targetId, previous.records[0]!.targetId);
  assert.ok(!report.issues.some(i => i.field === snapshotSourceHeader));
  assert.ok(!codes(report).includes("INPUT_HEADER_MISMATCH"));
});
test("SYNTHETIC appended method ID: blank remains unknown; bad explicit reference has exact location; pending staged vs unresolved final", () => {
  const blankReport = preflightImport(input([settlementSnapshotSheet(null)]));
  assert.equal(blankReport.records[0]!.normalizedValues[snapshotSourceHeader], null);
  assert.ok(!blankReport.issues.some(i => i.field === snapshotSourceHeader));
  for (const mode of ["STAGED", "FINAL"] as const) {
    const report = preflightImport(input([settlementSnapshotSheet("SYN-NOT-PRESENT")], mode));
    const problem = report.issues.find(i => i.field === snapshotSourceHeader)!;
    assert.equal(problem.code, "SOURCE_REFERENCE_NOT_PRESENT"); assert.equal(problem.severity, mode === "STAGED" ? "PENDING" : "ERROR");
    assert.deepEqual([problem.fileName, problem.sheet, problem.excelRow, problem.sourceId, problem.rawValue], ["SYNTHETIC.xlsx", "15历史收退记录", 2, "SYN-SETTLEMENT", "SYN-NOT-PRESENT"]);
  }
});
test("SYNTHETIC snapshot extension exactness: no inserted/reordered/renamed columns, numeric or formula IDs never inferred", () => {
  const valid = settlementSnapshotSheet("SYN-PM");
  const badHeaders = [ [...valid.headers.slice(0, 7), text(snapshotSourceHeader), valid.headers[7]!], [...valid.headers.slice(0, 8), text("原收款方式名称")], [...valid.headers, text("UNAPPROVED EXTRA FIELD")] ];
  for (const headers of badHeaders) assert.ok(codes(preflightImport(input([{ ...valid, headers }]))).includes("INPUT_HEADER_MISMATCH"));
  for (const method of [number("9"), { kind: "formula", raw: "000009", formula: '"000009"' } as ImportSourceCell]) {
    const report = preflightImport(input([settlementSnapshotSheet(method)]));
    assert.equal(report.records[0]!.normalizedValues[snapshotSourceHeader], null);
    assert.ok(report.issues.some(i => i.field === snapshotSourceHeader && ["TEXT_IDENTITY_OR_VALUE_UNVERIFIED", "FORMULA_NOT_VERIFIED"].includes(i.code)));
  }
});
