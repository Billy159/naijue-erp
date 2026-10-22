/** Synthetic source files and explicit native prerequisite plans. No private input or target adoption. */
import type { TestContext } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { engineFixtures, id } from "./native-import-accounting-fixture.ts";
import type { NativePartyImportInput } from "../../packages/application/src/native-party-import.ts";
import type { JsonObject } from "../../packages/application/src/history-storage-contract.ts";
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Row = Record<string, string>;
interface Occurrence { entity: string; sourceId: string; file: string; sheet: string; row: number; sourceSha256: string; data: Row }
const run = promisify(execFile);
const table = (entity: string) => IMPORT_V2_TABLES.find(t => t.entity === entity)!;
const csv = (columns: readonly string[], rows: readonly Row[]) => columns.join(",") + "\n" + rows.map(r => columns.map(c => '"' + (r[c] ?? "").replaceAll('"', '""') + '"').join(",")).join("\n") + (rows.length ? "\n" : "");
const row = (entity: string, overrides: Row): Row => Object.assign(Object.fromEntries(table(entity).columns.map(c => [c.name, c.required ? c.logicalType === "INTEGER" ? "1" : c.logicalType === "MONEY" ? "1.00" : "synthetic" : ""])), overrides);
const original = (raw: JsonObject): JsonObject => ({ schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { origin: "ORIGINAL", reason: "Literal independent synthetic prerequisite", raw: v }])) });
async function workbook(path: string, entity: string, rows: Row[]) {
 const input = path + ".json"; await writeFile(input, JSON.stringify({ entity, rows }), { mode: 0o600 });
 await run("/usr/bin/python3", ["-c", String.raw`
import json,sys,zipfile
from xml.sax.saxutils import escape
p=json.load(open(sys.argv[1]));rows=p['rows'];headers=list(rows[0]);ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';pkg='http://schemas.openxmlformats.org/package/2006/relationships'
sheet='13历史销货单头' if p['entity']=='SALES_HEADER' else '16历史调拨单头'
def col(i):
 s=''
 while i:i,n=divmod(i-1,26);s=chr(65+n)+s
 return s
def cell(ref,v,numeric=False):
 if numeric and v:return '<c r="'+ref+'" t="n" s="1"><v>'+escape(v)+'</v></c>'
 return '<c r="'+ref+'" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>'
body='<row r="1">'+''.join(cell(col(i+1)+'1',h) for i,h in enumerate(headers))+'</row>'
for n,r in enumerate(rows,2):body+='<row r="'+str(n)+'">'+''.join(cell(col(i+1)+str(n),r[h],h in ('业务日期','原创建时间','原修改时间','原审核时间')) for i,h in enumerate(headers))+'</row>'
parts={'xl/workbook.xml':f'<workbook xmlns="{ns}" xmlns:r="{rel}"><workbookPr date1904="false"/><sheets><sheet name="{sheet}" sheetId="1" r:id="sheet1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':f'<Relationships xmlns="{pkg}"><Relationship Id="sheet1" Type="{rel}/worksheet" Target="worksheets/header.xml"/><Relationship Id="styles" Type="{rel}/styles" Target="styles.xml"/></Relationships>','xl/styles.xml':f'<styleSheet xmlns="{ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>','xl/worksheets/header.xml':f'<worksheet xmlns="{ns}"><sheetData>{body}</sheetData></worksheet>'}
with zipfile.ZipFile(sys.argv[2],'x',compression=zipfile.ZIP_DEFLATED) as z:
 for k,v in parts.items():z.writestr(k,v)
`, input, path]); await rm(input);
}
async function seal(directory: string, files: Map<string, string>, extra: Record<string, unknown> = {}) {
 const payloadFiles = [];
 for (const [file, content] of files) { const p = join(directory, file); await mkdir(dirname(p), { recursive: true, mode: 0o700 }); await writeFile(p, content, { flag: "wx", mode: 0o600 }); payloadFiles.push({ file, bytes: Buffer.byteLength(content), sha256: sha(content) }); }
 const manifest = JSON.stringify({ importReady: false, payloadFiles, payloadBytes: payloadFiles.reduce((n, x) => n + x.bytes, 0), ...extra });
 await writeFile(join(directory, "manifest.json"), manifest, { flag: "wx", mode: 0o600 }); await writeFile(join(directory, "manifest.sha256"), sha(manifest) + "  manifest.json\n", { flag: "wx", mode: 0o600 });
 return { manifestSha: sha(manifest), payloadFiles };
}
export async function sealedHistory17Fixture(t: TestContext) {
 const root = await realpath(await mkdtemp(join(tmpdir(), "sealed-history17-synthetic-"))); t.after(() => rm(root, { recursive: true, force: true }));
 const base = join(root, "base"), amendment = join(root, "amendment"), sourceRoot = join(root, "originals"), spoolParent = join(root, "spool");
 for (const p of [base, amendment, sourceRoot, spoolParent]) await mkdir(p, { mode: 0o700 });
 const f = engineFixtures(), namespace = "synthetic.sealed-history17", files = new Map<string, string>(), datasets = new Map<string, Row[]>();
 for (const contract of IMPORT_V2_TABLES) datasets.set(contract.entity, []);
 const secondWarehouse = structuredClone(f.parties[1]!); secondWarehouse.source.id = id(1071); secondWarehouse.source.sourceKey = "WH-2"; secondWarehouse.source.rowNo = "33";
 secondWarehouse.source.rawFields = { ...secondWarehouse.source.rawFields, 来源编号: "WH-2", 仓库名称: "Synthetic second warehouse" }; secondWarehouse.source.normalizedFields = structuredClone(secondWarehouse.source.rawFields); secondWarehouse.source.fieldProvenance = original(secondWarehouse.source.rawFields);
 secondWarehouse.nativeSnapshot = { ...secondWarehouse.nativeSnapshot, id: id(41), name: "Synthetic second warehouse" }; secondWarehouse.warehouseRecord = { ...secondWarehouse.warehouseRecord!, id: id(531) };
 const customerFields = row("CUSTOMER", { 来源编号: "CUSTOMER-1", 原编码: "SYNTHETIC-CUSTOMER", 名称: "Synthetic original customer", 状态: "正常" });
 const customer: NativePartyImportInput = { batchId: id(1), fixedSourceNamespace: namespace, selection: { ...f.parties[0]!.selection, entity: "CUSTOMER", path: table("CUSTOMER").file },
  source: { ...f.parties[0]!.source, id: id(1070), entityType: "CUSTOMER", sourceKey: "CUSTOMER-1", sheet: "CUSTOMER", rawFields: customerFields, normalizedFields: customerFields, fieldProvenance: original(customerFields) },
  nativeSnapshot: { id: id(70), code: "SYNTHETIC-CUSTOMER", name: "Synthetic original customer", enabled: true, version: 1, created_at: null, updated_at: null }, enumMappings: { 状态: { raw: "正常", native: true, evidenceRef: "synthetic-reviewed-state" } }, bindings: {} };
 for (const p of [...f.parties, secondWarehouse, customer]) datasets.get(p.source.entityType)!.push(p.source.normalizedFields as Row);
 datasets.set("PRODUCT", [f.product.rows[0]!.source.normalizedFields as Row]); datasets.set("SKU", [f.sku.canonicalSource.normalizedFields as Row]); datasets.set("INVENTORY_BASELINE", [f.stock.canonicalStock as Row]);
 const common = { 原审核状态: "未审核", 业务日期: "45614", 原创建时间: "", 原修改时间: "", 原审核时间: "", 原创建厅编号: "", 创建厅归属来源: "UNKNOWN" };
 const sales = ["SALE", "RETURN"].map((kind, i) => row("SALES_HEADER", { ...common, 来源编号: "header-" + kind, 原单号: "SYNTHETIC-" + kind, 单据类型: i ? "退货" : "销售", 所属厅来源编号: "HALL-1", 客户来源编号: "CUSTOMER-1", 仓库来源编号: "WH-1", 营业员来源编号: "", 原制单账号编号: "", 原审核账号编号: "", 优惠前金额: "10.00", 整单优惠: "1.00", 应结金额: "8.50", 创建厅归属原因: "UNKNOWN_NO_SALESPERSON_ID" }));
 const transfer = row("TRANSFER_HEADER", { ...common, 来源编号: "header-TRANSFER", 原单号: "SYNTHETIC-TRANSFER", 调出仓来源编号: "WH-1", 调入仓来源编号: "WH-2", 原制单账号编号: "", 原制单角色: "", 原审核账号编号: "", 创建厅归属原因: "UNKNOWN_ORIGINAL_CREATOR_UNMATCHED" });
 datasets.set("SALES_HEADER", sales); datasets.set("TRANSFER_HEADER", [transfer]);
 const saleFile = "历史销货.synthetic.xlsx", transferFile = "历史调拨.synthetic.xlsx", dataFile = "synthetic-lines-and-catalogue.json";
 await workbook(join(sourceRoot, saleFile), "SALES_HEADER", sales); await workbook(join(sourceRoot, transferFile), "TRANSFER_HEADER", [transfer]); await writeFile(join(sourceRoot, dataFile), '{"synthetic":true}', { mode: 0o600 });
 const sourceHashes = Object.fromEntries(await Promise.all([saleFile, transferFile, dataFile].map(async x => [x, sha(await readFile(join(sourceRoot, x)))])));
 const occurrences: Occurrence[] = [];
 const add = (entity: string, data: Row, file = dataFile, sheet = entity, n = 2) => occurrences.push({ entity, sourceId: data.来源编号 ?? "", file, sheet, row: n, sourceSha256: sourceHashes[file]!, data: structuredClone(data) });
 add("PRODUCT", datasets.get("PRODUCT")![0]!); sales.forEach((s, i) => add("SALES_HEADER", s, saleFile, "13历史销货单头", i + 2)); add("TRANSFER_HEADER", transfer, transferFile, "16历史调拨单头");
 const moneyColumns = ["file", "sheet", "row", "sourceId", "entity", "documentSourceId", "field", "rawValue", "excessFromNearestCent", "candidateExactCentValue", "sourceFileSha256", "decision", "provenance", "toleranceCurrencyUnits", "corroboratingDocumentSourceId"];
 const approvals: Row[] = [], lines: Row[] = [];
 for (let i = 0; i < 32; i++) {
  const kind = i < 16 ? "SALE" : "RETURN", sourceId = "line-" + i;
  const normalized = row("SALES_LINE", { 来源编号: sourceId, 单据来源编号: "header-" + kind, 原行号: String(i % 16 + 1), SKU来源编号: f.sku.canonicalSource.sourceKey, 原数量: kind === "SALE" ? "2" : "-2", 原参考价: "", 原成交单价: "1.00", 原行金额: kind === "SALE" ? "2.06" : "-2.06", 原赠品标记: "否", 原款号: "0007" });
  lines.push(normalized); add("SALES_LINE", { ...normalized, SKU来源编号: f.sku.aliases[1]!.source.sourceKey, 原成交单价: "1.00000000000001" }, dataFile, "SALES_LINE", i + 2);
  approvals.push({ file: dataFile, sheet: "SALES_LINE", row: String(i + 2), sourceId, entity: "SALES_LINE", documentSourceId: "header-" + kind, field: "原成交单价", rawValue: "1.00000000000001", excessFromNearestCent: "0.00000000000001", candidateExactCentValue: "1.00", sourceFileSha256: sourceHashes[dataFile]!, decision: "CORROBORATED_TAIL_ONLY_CANDIDATE", provenance: "MIGRATION_DERIVED_CENT_NORMALIZATION", toleranceCurrencyUnits: "1E-8", corroboratingDocumentSourceId: "header-" + kind });
 }
 datasets.set("SALES_LINE", lines);
 const transferLine = row("TRANSFER_LINE", { 来源编号: "transfer-line", 单据来源编号: "header-TRANSFER", 原行号: "1", SKU来源编号: f.sku.canonicalSource.sourceKey, 原数量: "-3", 原款号: "0007" }); datasets.set("TRANSFER_LINE", [transferLine]); add("TRANSFER_LINE", { ...transferLine, SKU来源编号: f.sku.aliases[1]!.source.sourceKey });
 datasets.set("PAYMENT_METHOD", [row("PAYMENT_METHOD", { 来源编号: "method-A", 方式名称: "Original method A", 状态: "正常" }), row("PAYMENT_METHOD", { 来源编号: "method-B", 方式名称: "Original method B", 状态: "正常" })]);
 datasets.set("PAYMENT_ACCOUNT", [row("PAYMENT_ACCOUNT", { 来源编号: "account", 账户显示名称: "Original account", 收款方式来源编号: "method-A", 状态: "正常" })]);
 datasets.set("PAYMENT_ACCOUNT_HALL", [{ 账户来源编号: "account", 厅来源编号: "HALL-1" }]);
 for (const entity of ["PAYMENT_METHOD", "PAYMENT_ACCOUNT", "PAYMENT_ACCOUNT_HALL"]) datasets.get(entity)!.forEach((x, i) => add(entity, x, dataFile, entity, i + 2)); // relation's original envelope placeholder remains exactly empty
 const settlements = [row("SETTLEMENT", { 来源编号: "settlement-refund", 单据来源编号: "header-RETURN", 原收退行号: "9", 账户来源编号: "account", 方向: "退款", 金额: "7.03", 原账户显示名: "Historical account name", 原方式显示名: "Historical method name", 原收款方式来源编号: "method-B" }), row("SETTLEMENT", { 来源编号: "settlement-zero", 单据来源编号: "header-SALE", 原收退行号: "10", 账户来源编号: "account", 方向: "收款", 金额: "0.00", 原账户显示名: "", 原方式显示名: "", 原收款方式来源编号: "" })];
 datasets.set("SETTLEMENT", settlements); settlements.forEach((x, i) => { const raw = { ...x }; if (i === 1) delete raw.原收款方式来源编号; add("SETTLEMENT", raw, dataFile, "SETTLEMENT", i + 2); });
 const barcodes = Array.from({ length: 17976 }, (_, i) => row("BARCODE", { 来源编号: "barcode-" + i.toString().padStart(5, "0"), 条码: i.toString().padStart(13, "0"), SKU来源编号: i < 2958 ? "" : f.sku.canonicalSource.sourceKey, 条码性质: "synthetic", 状态: "synthetic", 绑定范围: i < 2958 ? "PRODUCT" : "SKU", 商品来源编号: f.product.rows[0]!.source.sourceKey })); datasets.set("BARCODE", barcodes);
 for (const contract of IMPORT_V2_TABLES) files.set(contract.file, csv(contract.columns.map(c => c.name), datasets.get(contract.entity)!));
 files.set("schema/normalized-business-columns.json", JSON.stringify(IMPORT_V2_TABLES)); files.set("dictionaries/historical-customers.json", "[]");
 const aliasCols = ["oldSourceSkuId", "canonicalSourceSkuId", "productSourceId", "colorCodeIdentity", "fitCode", "newSizeDictionaryId"];
 files.set("mappings/old-to-canonical-sku-15121.csv", csv(aliasCols, f.sku.aliases.map(x => ({ ...x.mapping }))));
 const lineageCols = ["oldStockSourceId", "canonicalStockRowSourceId", "warehouseSourceId", "oldSkuSourceId", "canonicalSkuSourceId", "productSourceId", "signedQuantity", "sourceUnit"];
 files.set("mappings/stock-contributor-lineage-38314.csv", csv(lineageCols, f.stock.contributors.map(x => ({ ...x.lineage }))));
 files.set("audit/independent-verification/warehouse-unit-reconciliation.csv", "warehouse,unit,before,after,difference\nWH-1,件,-7,-7,0\n");
 files.set("audit/warehouse-product-stock-conservation.csv", "warehouseSourceId,productSourceId,inputSignedQuantity,outputSignedQuantity,exactDifference\nWH-1," + f.product.rows[0]!.source.sourceKey + ",-7,-7,0\n");
 files.set("audit/independent-verification/all-53-warehouses.csv", "warehouse,name,before,after,difference\nWH-1,Synthetic,-7,-7,0\nWH-2,Synthetic second,0,0,0\n");
 files.set("provenance/approved-money-tail-overlay.csv", csv(moneyColumns, approvals));
 const overlayColumns = ["file", "sheet", "row", "sourceId", "documentNumber", "personField", "personId", "matchedStaffId", "currentEmployeeHall", "uploadedWarehouseDerivedHall", "candidateCreatorHall", "provenance", "reason", "comparison", "rawCreatorDisplay", "rawPeopleSupportRow"];
 const overlays = occurrences.filter(x => ["SALES_HEADER", "TRANSFER_HEADER"].includes(x.entity)).map(x => ({ file: x.file, sheet: x.sheet, row: String(x.row), sourceId: x.sourceId, documentNumber: x.data.原单号!, personField: x.entity === "SALES_HEADER" ? "营业员来源编号" : "原制单账号编号", personId: "", matchedStaffId: "", currentEmployeeHall: "", uploadedWarehouseDerivedHall: "", candidateCreatorHall: "", provenance: "UNKNOWN", reason: x.data.创建厅归属原因!, comparison: "same", rawCreatorDisplay: "", rawPeopleSupportRow: String(x.row) }));
 files.set("provenance/creator-hall-approved-overlay.csv", csv(overlayColumns, overlays)); files.set("snapshots/all-business-source-rows.jsonl", occurrences.map(x => JSON.stringify(x) + (x.sourceId === "settlement-refund" ? "\r" : "")).join("\n") + "\n");
 const excluded = barcodes.slice(0, 2958), effective = barcodes.slice(2958), excludedIds = excluded.map(x => x.来源编号!).sort(), supplement = JSON.stringify({ productLevelBarcodes: excludedIds.map(sourceKey => ({ sourceKey })) });
 files.set("snapshots/supplement09-original.json", supplement); sourceHashes["synthetic-supplement.json"] = sha(supplement);
 const baseManifest = await seal(base, files, { bundleVersion: "synthetic-sealed-history17", sourceInputSha256: sourceHashes });
 const barcodePath = table("BARCODE").file, excludedPath = "exclusions/商品级条码_2958_不导入.csv", idsPath = "exclusions/excluded-source-ids.json", setHash = sha(JSON.stringify(excludedIds)), archiveHash = "b".repeat(64);
 const v3Files = new Map([[barcodePath, csv(table("BARCODE").columns.map(c => c.name), effective)], [excludedPath, csv(table("BARCODE").columns.map(c => c.name), excluded)], [idsPath, JSON.stringify(excludedIds) + "\n"]]);
 const counts = Object.fromEntries(IMPORT_V2_TABLES.map(x => [x.entity, x.entity === "BARCODE" ? 15018 : datasets.get(x.entity)!.length]));
 const selection = { schemaVersion: "NAIJUE_V3_EXPLICIT_BARCODE_EXCLUSION_SELECTION_20261021", baseBundleVersion: "synthetic-sealed-history17", baseManifestSha256: baseManifest.manifestSha, baseArchiveSha256: archiveHash, baseBarcodeCsvSha256: sha(files.get(barcodePath)!), mode: "REPLACE_BARCODE_IMPORT_INPUT_NOT_APPEND", effectiveBarcodeCsv: { path: barcodePath, sha256: sha(v3Files.get(barcodePath)!), count: 15018, columns: table("BARCODE").columns.map(c => c.name) }, excludedEvidenceCsv: { path: excludedPath, sha256: sha(v3Files.get(excludedPath)!), count: 2958, columns: table("BARCODE").columns.map(c => c.name), role: "EVIDENCE_ONLY_DO_NOT_IMPORT" }, excludedSourceIdsFile: idsPath, excludedSourceIdsSetSha256: setHash, excludedCount: 2958, effectiveCount: 15018, idSetHashAlgorithm: "SHA256_UTF8_JSON_COMPACT_SORTED_ARRAY_NO_TRAILING_NEWLINE", exclusionDecisionFile: "approval.json", approvalDecisionId: "synthetic-sealed17-explicit-decision", importFiles: IMPORT_V2_TABLES.map(x => ({ entity: x.entity, source: x.entity === "BARCODE" ? "AMENDMENT_V3" : "BASE_V2", path: x.file, sha256: sha(x.entity === "BARCODE" ? v3Files.get(x.file)! : files.get(x.file)!), count: counts[x.entity] })), effectiveEntityCounts: counts, notImportTargets: ["exclusions/**", "audit/**", "snapshots/**", "BASE_V2/business/03历史条码.csv"], sourceRawSnapshotsRemainEvidenceOnly: true, other17BusinessFilesUnchanged: true, allEffectiveBarcodeSkuRefsNonempty: true, importReady: false, nativeDatabaseImportPerformed: false };
 const selectionText = JSON.stringify(selection); v3Files.set("effective-import-selection.json", selectionText);
 const approval = { decisionId: selection.approvalDecisionId, decisionText: "Independent synthetic exact exclusion only", scope: "EXCLUDE_EXACT_PRODUCT_BOUND_BARCODE_ARCHIVE_ROWS_FROM_THIS_IMPORT_ONLY", excludedBindingScope: "PRODUCT", excludedCount: 2958, excludedSourceIdsSetSha256: setHash, idSetHashAlgorithm: selection.idSetHashAlgorithm, authoritativeTraceSource: { originalSupplementFile: "synthetic-supplement.json", sha256: sha(supplement), jsonArray: "productLevelBarcodes", sourceKeyField: "sourceKey" }, baseManifestSha256: selection.baseManifestSha256, baseArchiveSha256: archiveHash, baseBarcodeCsvSha256: selection.baseBarcodeCsvSha256, businessDatabaseDeletionApproved: false, sourceEvidenceDeletionApproved: false, nativeDbImportAuthorizedByThisFile: false, selectionSha256: sha(selectionText), effectiveBarcodeCsvSha256: selection.effectiveBarcodeCsv.sha256, excludedEvidenceCsvSha256: selection.excludedEvidenceCsv.sha256, excludedSourceIdsFileSha256: sha(v3Files.get(idsPath)!) };
 const approvalText = JSON.stringify(approval), v3Approval = join(root, "external-approval.json"); v3Files.set("approval.json", approvalText); await writeFile(v3Approval, approvalText, { flag: "wx", mode: 0o600 }); await seal(amendment, v3Files);
 for (const p of [...f.parties, secondWarehouse, customer]) { p.fixedSourceNamespace = namespace; p.selection.selectionSha256 = sha(selectionText); }
 const selectionSha256 = sha(selectionText), selected = { ...f, catalogue: { ...f.catalogue, fixedSourceNamespace: namespace, selection: { ...f.catalogue.selection, selectionSha256 } }, product: { ...f.product, fixedSourceNamespace: namespace, selection: { ...f.product.selection, selectionSha256 } }, sku: { ...f.sku, fixedSourceNamespace: namespace, selection: { ...f.sku.selection, selectionSha256 } }, stock: { ...f.stock, fixedSourceNamespace: namespace, selection: { ...f.stock.selection, selectionSha256 } } };
 return { options: { base, v3Amendment: amendment, v3Approval, sourceRoot, spoolParent, batchId: id(1), fixedSourceNamespace: namespace, trustedApprovalSha256: sha(approvalText), approvedMoneyOverlaySha256: sha(files.get("provenance/approved-money-tail-overlay.csv")!) }, f: selected, parties: [...f.parties, secondWarehouse, customer], counts, selectionSha256 };
}
