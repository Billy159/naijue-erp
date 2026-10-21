import { stableImportId } from "./inventory-cutoff-import.ts";
import { requestHash } from "./request-hash.ts";
import { IMPORT_PREFLIGHT_CONTRACT_VERSION, IMPORT_PREFLIGHT_GUIDE_SHEETS, IMPORT_PREFLIGHT_SHEETS, IMPORT_PREFLIGHT_SUPPORT_SHEETS } from "./import-preflight-contract.ts";
import type { ImportSheetContract } from "./import-preflight-contract.ts";

/** Operator-only, offline input. Numeric XML lexemes are strings, NEVER JS numbers. */
export interface ImportSourceCell {
  readonly kind: "blank" | "text" | "number" | "formula" | "boolean" | "error" | "date";
  readonly raw: string | null;
  readonly formula?: string;
  readonly styleIndex?: string;
}
export interface ImportSourceRow { readonly excelRow: number; readonly cells: readonly ImportSourceCell[] }
export interface ImportSourceSheet {
  readonly name: string; readonly headerRow: 1; readonly headers: readonly ImportSourceCell[]; readonly rows: readonly ImportSourceRow[];
}
export interface ImportSourceFile {
  readonly fileName: string; readonly sha256: string; readonly dateSystem: "1900" | "1904";
  readonly sheets: readonly ImportSourceSheet[];
}
export interface ImportPriorIdentity {
  readonly entityType: string; readonly sourceKey: string; readonly targetId: string; readonly sourceRecordHash: string;
}
export interface ImportPriorManifest { readonly fixedSourceNamespace: string; readonly identities: readonly ImportPriorIdentity[] }
export interface ImportPreflightInput {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly mode: "STAGED" | "FINAL";
  readonly files: readonly ImportSourceFile[]; readonly priorManifest?: ImportPriorManifest;
}
export interface ImportPreflightIssue {
  readonly batchId: string; readonly fileName: string; readonly sheet: string; readonly excelRow: number | null;
  readonly sourceId: string | null; readonly field: string; readonly rawValue: string | null;
  readonly code: string; readonly severity: "ERROR" | "PENDING" | "CAPABILITY";
  readonly reason: string; readonly relatedSourceKeys: readonly string[]; readonly minimalAction: string;
}
export const IMPORT_PREFLIGHT_PRODUCT_PRICE_FIELDS = Object.freeze({
  purchasePrice: "采购价", price: "零售价", wholesale5: "五级批发价（工厂店供货价）", wholesale6: "六级批发价（贴牌价）",
  wholesale7: "七级批发价（批发价）", wholesale8: "八级批发价（代理商供货价）", wholesale9: "九级批发价（工厂店零售价）",
  wholesale10: "十级批发价（葛玉珠）", minimumPrice: "最低售价",
});
export interface ImportProductPriceFact {
  readonly state: "VALUE" | "UNSET" | "UNKNOWN"; readonly yuan: string | null; readonly minorAmount: string | null;
  readonly sourceHeader: string; readonly sourceCell: ImportSourceCell;
  readonly provenance: "V03_EXACT_PRICE_COLUMN_VALUE" | "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" | "SOURCE_FACT_NOT_VERIFIED";
}
export interface ImportPreflightRecord {
  readonly fileName: string; readonly sheet: string; readonly excelRow: number; readonly entityType: string;
  readonly sourceId: string | null; readonly sourceKey: string | null; readonly targetId: string | null;
  readonly sourceRecordHash: string; readonly rawValues: Readonly<Record<string, ImportSourceCell>>;
  /** Amounts are integer CNY minor-unit text; quantities are integer text. Price null semantics are explicit below. */
  readonly normalizedValues: Readonly<Record<string, string | null>>;
  readonly productPriceFacts: Readonly<Record<keyof typeof IMPORT_PREFLIGHT_PRODUCT_PRICE_FIELDS, ImportProductPriceFact>> | null;
}
export const IMPORT_PREFLIGHT_LIMITS = Object.freeze({ files: 64, sheets: 128, rows: 100_000, cells: 2_000_000, textCharacters: 32_768, aggregateCharacters: 32_000_000, issues: 50_000 });
const blankCell: ImportSourceCell = Object.freeze({ kind: "blank", raw: null });
const blank = (cell: ImportSourceCell): boolean => cell.kind !== "formula" && (cell.kind === "blank" || cell.raw === null || cell.raw === "");
const fullField = (contract: ImportSheetContract, name: string): string => contract.fields.find(f => f.header.replace(/^\*/, "") === name)?.header ?? name;
const identityKey = (entity: string, key: string): string => JSON.stringify([entity, key]);
const sourceKeyFor = (sourceId: string): string => `src:${sourceId}`;
const amountLimit = 999999999999999999n;
const quantityMinimum = -9223372036854775808n;
const quantityMaximum = 9223372036854775807n;

export function parseImportCnyYuan(raw: string): string {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error("CNY_YUAN_PRECISION_OR_FORMAT");
  const sign = raw.startsWith("-") ? -1n : 1n;
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const minor = sign * (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (minor < -amountLimit || minor > amountLimit) throw new Error("CNY_YUAN_OVERFLOW");
  return minor.toString();
}
export function parseImportInteger(raw: string): string {
  if (!/^-?\d+$/.test(raw)) throw new Error("INTEGER_PRECISION_OR_FORMAT");
  const integer = BigInt(raw);
  if (integer < quantityMinimum || integer > quantityMaximum) throw new Error("INTEGER_OVERFLOW");
  return integer.toString();
}
function numericPrecisionUnsafe(cell: ImportSourceCell): boolean {
  return cell.kind === "number" && (cell.raw ?? "").replace(/^-/, "").replace(".", "").replace(/^0+/, "").length > 15;
}
function validateBounds(input: ImportPreflightInput): void {
  if (!input || typeof input !== "object" || typeof input.batchId !== "string" || !input.batchId.trim()
    || typeof input.fixedSourceNamespace !== "string" || !/^[a-z][a-z0-9_.:-]{0,127}$/.test(input.fixedSourceNamespace)
    || !["STAGED", "FINAL"].includes(input.mode) || !Array.isArray(input.files)) throw new Error("INVALID_OFFLINE_IMPORT_ENVELOPE");
  if (input.files.length > IMPORT_PREFLIGHT_LIMITS.files) throw new Error("OFFLINE_FILE_LIMIT");
  let sheets = 0, rows = 0, cells = 0, characters = 0;
  for (const file of input.files) {
    if (!file || typeof file.fileName !== "string" || !file.fileName || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !["1900", "1904"].includes(file.dateSystem) || !Array.isArray(file.sheets)) throw new Error("INVALID_OFFLINE_IMPORT_FILE");
    sheets += file.sheets.length;
    if (sheets > IMPORT_PREFLIGHT_LIMITS.sheets) throw new Error(`OFFLINE_SHEET_LIMIT:${file.fileName}`);
    const sheetNames = new Set<string>();
    for (const sheet of file.sheets) {
      if (sheetNames.has(sheet.name)) throw new Error(`DUPLICATE_OFFLINE_SHEET_NAME:${file.fileName}:${sheet.name}`);
      sheetNames.add(sheet.name);
      if (!sheet || typeof sheet.name !== "string" || sheet.headerRow !== 1 || !Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) throw new Error("INVALID_OFFLINE_IMPORT_SHEET");
      rows += sheet.rows.length;
      if (rows > IMPORT_PREFLIGHT_LIMITS.rows) throw new Error(`OFFLINE_ROW_LIMIT:${file.fileName}:${sheet.name}`);
      for (const row of [{ excelRow: 1, cells: sheet.headers }, ...sheet.rows]) {
        if (!row || !Number.isSafeInteger(row.excelRow) || row.excelRow < 1 || !Array.isArray(row.cells)) throw new Error("INVALID_OFFLINE_IMPORT_ROW");
        cells += row.cells.length;
        if (cells > IMPORT_PREFLIGHT_LIMITS.cells) throw new Error(`OFFLINE_CELL_LIMIT:${file.fileName}:${sheet.name}:${row.excelRow}`);
        for (const cell of row.cells) {
          if (!cell || !["blank", "text", "number", "formula", "boolean", "error", "date"].includes(cell.kind)
            || (cell.raw !== null && typeof cell.raw !== "string") || (cell.formula !== undefined && typeof cell.formula !== "string")
            || (cell.styleIndex !== undefined && (typeof cell.styleIndex !== "string" || !/^[0-9]{1,10}$/.test(cell.styleIndex)))
            || (cell.kind === "blank" && cell.raw !== null) || (cell.kind !== "blank" && cell.kind !== "formula" && cell.raw === null)) throw new Error("INVALID_OFFLINE_IMPORT_CELL");
          for (const value of [cell.raw, cell.formula ?? null, cell.styleIndex ?? null]) if (value !== null) {
            if (value.length > IMPORT_PREFLIGHT_LIMITS.textCharacters) throw new Error(`OFFLINE_CELL_TEXT_LIMIT:${file.fileName}:${sheet.name}:${row.excelRow}`);
            characters += value.length;
            if (characters > IMPORT_PREFLIGHT_LIMITS.aggregateCharacters) throw new Error(`OFFLINE_AGGREGATE_TEXT_LIMIT:${file.fileName}:${sheet.name}:${row.excelRow}`);
          }
        }
      }
    }
  }
  if (sheets > IMPORT_PREFLIGHT_LIMITS.sheets || rows > IMPORT_PREFLIGHT_LIMITS.rows || cells > IMPORT_PREFLIGHT_LIMITS.cells
    || characters > IMPORT_PREFLIGHT_LIMITS.aggregateCharacters) throw new Error("OFFLINE_AGGREGATE_LIMIT");
}

/** Read/validate/report only. This module neither imports a DB adapter nor creates executable write commands. */
export function preflightImport(input: ImportPreflightInput) {
  validateBounds(input);
  const issues: ImportPreflightIssue[] = [];
  const records: ImportPreflightRecord[] = [];
  const foundSheets = new Set<string>();
  const supportedSheets = new Map(IMPORT_PREFLIGHT_SHEETS.map(s => [s.name, s]));
  const byIdentity = new Map<string, ImportPreflightRecord[]>();
  const byTargetId = new Map<string, string>();
  const prior = new Map<string, ImportPriorIdentity>();
  const rejectedPriorKeys = new Set<string>();
  const conflictedRecords = new Set<ImportPreflightRecord>();
  const referenceEdges: { source: ImportPreflightRecord; target: ImportPreflightRecord; field: string; documentMember?: true }[] = [];
  const issue = (code: string, reason: string, position: Partial<Pick<ImportPreflightIssue, "fileName" | "sheet" | "excelRow" | "sourceId" | "field" | "rawValue">> = {},
    severity: ImportPreflightIssue["severity"] = "ERROR", relatedSourceKeys: readonly string[] = [], minimalAction = "保留原文并核对来源；不自动补值、改号或汇总。") => {
    if (issues.length >= IMPORT_PREFLIGHT_LIMITS.issues) throw new Error(`OFFLINE_ISSUE_LIMIT:${position.fileName ?? ""}:${position.sheet ?? ""}:${position.excelRow ?? ""}`);
    issues.push({ batchId: input.batchId, fileName: position.fileName ?? "", sheet: position.sheet ?? "", excelRow: position.excelRow ?? null,
      sourceId: position.sourceId ?? null, field: position.field ?? "", rawValue: position.rawValue ?? null, code, severity, reason, relatedSourceKeys, minimalAction });
  };
  if (input.priorManifest) {
    if (input.priorManifest.fixedSourceNamespace !== input.fixedSourceNamespace || !Array.isArray(input.priorManifest.identities)) {
      issue("PRIOR_NAMESPACE_MISMATCH", "前批来源命名空间与本批不一致；不合并身份或借用其他来源引用。");
    } else if (input.priorManifest.identities.length > IMPORT_PREFLIGHT_LIMITS.rows) {
      issue("PRIOR_MANIFEST_LIMIT", "前批映射记录数超过离线预检上限，未截断处理。");
    } else for (const entry of input.priorManifest.identities) {
      if (!entry || typeof entry !== "object") { issue("INVALID_PRIOR_IDENTITY", "前批映射记录不是合法对象。"); continue; }
      const key = identityKey(entry.entityType, entry.sourceKey);
      if (prior.has(key) || rejectedPriorKeys.has(key)) {
        prior.delete(key); rejectedPriorKeys.add(key);
        issue("INVALID_PRIOR_IDENTITY", "前批来源身份重复；全部同键记录作废，不保留任一条供引用。", { sourceId: typeof entry.sourceKey === "string" ? entry.sourceKey : null });
        continue;
      }
      if (!IMPORT_PREFLIGHT_SHEETS.some(s => s.entityType === entry.entityType) || typeof entry.sourceKey !== "string" || !entry.sourceKey
        || !/^[a-f0-9]{64}$/.test(entry.sourceRecordHash) || entry.targetId !== stableImportId("entity", input.fixedSourceNamespace, entry.entityType, entry.sourceKey) ) {
        rejectedPriorKeys.add(key);
        issue("INVALID_PRIOR_IDENTITY", "前批映射重复、摘要不合法或内部ID不符合固定来源身份合同。", { sourceId: entry.sourceKey });
      } else prior.set(key, entry);
    }
  }
  const fileNames = new Set<string>();
  const duplicatedFileNames = new Set<string>();
  for (const file of input.files) {
    if (fileNames.has(file.fileName)) {
      duplicatedFileNames.add(file.fileName);
      issue("DUPLICATE_INPUT_FILE_NAME", "多个输入文件同名，不能给出无歧义错误定位；同名文件全部隔离，身份不受改名影响。", { fileName: file.fileName });
    }
    fileNames.add(file.fileName);
  }
  for (const file of input.files) for (const sheet of file.sheets) {
    if (IMPORT_PREFLIGHT_GUIDE_SHEETS.includes(sheet.name) || IMPORT_PREFLIGHT_SUPPORT_SHEETS.includes(sheet.name)) continue;
    const contract = supportedSheets.get(sheet.name);
    if (!contract) { issue("UNKNOWN_INPUT_SHEET", "页签不是原18个业务输入页或精确已知说明页；可能为输入页名拼写错误。", { fileName: file.fileName, sheet: sheet.name }); continue; }
    foundSheets.add(sheet.name);
    const optionalFields = contract.optionalTrailingFields ?? [];
    const extendedFields = [...contract.fields, ...optionalFields];
    const activeFields = sheet.headers.length === extendedFields.length ? extendedFields : contract.fields;
    const headersMatch = (sheet.headers.length === contract.fields.length || (optionalFields.length > 0 && sheet.headers.length === extendedFields.length))
      && sheet.headers.every((c, i) => c.kind === "text" && c.raw === activeFields[i]!.header);
    if (!headersMatch) {
      issue("INPUT_HEADER_MISMATCH", "原18页154列表头必须原名、原序完整保留；仅允许15历史收退记录末尾追加已批准的可选原收款方式来源编号。", { fileName: file.fileName, sheet: sheet.name, excelRow: 1,
        field: contract.fields.map(f => f.header).join(" | "), rawValue: sheet.headers.map(c => c.raw ?? "").join(" | ") });
      continue;
    }
    const seenRowNumbers = new Set<number>();
    for (const row of sheet.rows) {
      if (row.cells.every(blank)) continue;
      const position = { fileName: file.fileName, sheet: sheet.name, excelRow: row.excelRow };
      if (row.excelRow < 2 || seenRowNumbers.has(row.excelRow)) issue("DUPLICATE_OR_INVALID_EXCEL_ROW", "业务记录的Excel行定位重复或覆盖表头。", position);
      seenRowNumbers.add(row.excelRow);
      if (row.cells.length > activeFields.length) issue("EXTRA_INPUT_CELLS", "业务记录在原字段范围之外含有额外单元格，未静默截断。", position);
      const rawValues = Object.fromEntries(activeFields.map((f, i) => [f.header, row.cells[i] ?? blankCell]));
      // Old eight-column files remain unknown, not inferred from names/current accounts.
      // Omitted extension is not inserted into rawValues or the original source hash.
      const normalizedValues: Record<string, string | null> = Object.fromEntries(optionalFields.map(f => [f.header, null]));
      const sourceCell = rawValues[contract.entityType === "ISSUE" ? "*问题编号" : "*来源编号"];
      const sourceId = sourceCell?.kind === "text" && !blank(sourceCell) && sourceCell.raw!.trim().length > 0 ? sourceCell.raw : null;
      let sourceKey = sourceId === null ? null : sourceKeyFor(sourceId);
      if (contract.entityType === "PAYMENT_ACCOUNT_HALL") {
        const account = rawValues["*账户来源编号"], hall = rawValues["*厅来源编号"];
        if (account?.kind === "text" && !blank(account) && hall?.kind === "text" && !blank(hall))
          sourceKey = `derived:${requestHash(["naijue-source-key-v1", contract.entityType, ["PAYMENT_ACCOUNT_HALL", sourceKeyFor(account.raw!), sourceKeyFor(hall.raw!)]])}`;
      }
      const rowPosition = { ...position, sourceId };
      for (const field of activeFields) {
        const cell = rawValues[field.header]!;
        const fieldPosition = { ...rowPosition, field: field.header, rawValue: cell.raw };
        normalizedValues[field.header] = null;
        if (blank(cell) || (cell.kind === "text" && cell.raw!.trim().length === 0)) {
          // Original intake permits unknown codes/source facts. Do not force users to fabricate them.
          if (field.required) issue(field.header === "*来源编号" ? "SOURCE_ID_OR_APPROVED_KEY_REQUIRED" : "REQUIRED_SOURCE_VALUE_UNKNOWN",
            field.header === "*来源编号" ? "缺少原来源编号；本切片不擅自从名称、行号或文件名生成来源键。可使用经核准的稳定自然键方案，现待接通。" : "原必填字段未知；保留空值，当前无法完成本对象的确定映射。", fieldPosition,
            "PENDING", [], "核查真实原件或核准保真/稳定键方案，不编造业务值。");
          continue;
        }
        if (cell.kind === "formula") { issue("FORMULA_NOT_VERIFIED", "公式及缓存结果未作为来源事实采信；只影响本单元格及依赖对象，原公式/缓存仍保留。", fieldPosition, "PENDING", [], "开发核验该公式的来源及值，不要求无关数据重新清洗。"); continue; }
        if (cell.kind === "error" || cell.kind === "boolean") { issue("UNSUPPORTED_SOURCE_CELL", "单元格为Excel错误或布尔类型，不能冒充来源文本或金额。", fieldPosition); continue; }
        if (field.type === "MONEY" || field.type === "INTEGER") {
          if (cell.kind !== "text" && cell.kind !== "number") { issue("INVALID_NUMERIC_CELL_KIND", "此字段不是十进制文本或原始数值单元格。", fieldPosition); continue; }
          if (numericPrecisionUnsafe(cell)) { issue("EXCEL_NUMERIC_PRECISION_UNVERIFIED", "Excel数值单元格超过15位有效数字，可能已经丢失原精度；不把XML数值当原件精确事实。", fieldPosition, "PENDING", [], "开发对照未失真的原件核实该数值；无需修改其他记录。"); continue; }
          try { normalizedValues[field.header] = field.type === "MONEY" ? parseImportCnyYuan(cell.raw!) : parseImportInteger(cell.raw!); }
          catch (error) { issue(error instanceof Error ? error.message : "INVALID_EXACT_NUMBER", "金额按人民币元最多两位、数量按int64精确整数接收；不使用浮点、四舍五入或截断。", fieldPosition); }
        } else if (field.type === "DATE" || field.type === "DATETIME") {
          issue("DATE_SEMANTICS_NOT_IMPLEMENTED", `原日期/时间及工作簿${file.dateSystem}日期制已保留；本切片未验证日期样式、Excel序列日期或来源时区，不猜测日期和当前时间。`, fieldPosition, "CAPABILITY", [], "由开发补齐日期元数据与已批准来源口径解析，不要求用户改写成文本来绕过程序缺口。");
        } else if (cell.kind !== "text") {
          issue("TEXT_IDENTITY_OR_VALUE_UNVERIFIED", "文本字段是数值或其他单元格类型，可能丢失前导零；未经来源契约佐证不自动转字符串。", fieldPosition, "PENDING", [], "开发核对原清洗契约及来源是否保持身份，不擅自补零或转换。");
        } else {
          normalizedValues[field.header] = cell.raw;
          if (field.allowed && !field.allowed.includes(cell.raw!)) issue("UNKNOWN_ENUM_VALUE", "来源枚举不在原合同明确值中，不猜测别名或默认状态。", fieldPosition);
        }
      }
      const productPriceFacts = contract.entityType !== "PRODUCT" ? null : Object.fromEntries(Object.entries(IMPORT_PREFLIGHT_PRODUCT_PRICE_FIELDS).map(([key, header]) => {
        const sourceCell = rawValues[header]!;
        const unset = blank(sourceCell), minorAmount = normalizedValues[header] ?? null;
        const state = unset ? "UNSET" as const : minorAmount !== null ? "VALUE" as const : "UNKNOWN" as const;
        const fact: ImportProductPriceFact = { state, yuan: state === "VALUE" ? sourceCell.raw : null, minorAmount,
          sourceHeader: header, sourceCell, provenance: unset ? "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" : state === "VALUE" ? "V03_EXACT_PRICE_COLUMN_VALUE" : "SOURCE_FACT_NOT_VERIFIED" };
        return [key, fact];
      })) as Readonly<Record<keyof typeof IMPORT_PREFLIGHT_PRODUCT_PRICE_FIELDS, ImportProductPriceFact>>;
      const record: ImportPreflightRecord = { ...position, entityType: contract.entityType, sourceId, sourceKey,
        targetId: sourceKey === null ? null : stableImportId("entity", input.fixedSourceNamespace, contract.entityType, sourceKey),
        sourceRecordHash: requestHash(Object.fromEntries(Object.entries(rawValues).map(([field, cell]) => [field, { kind: cell.kind, raw: cell.raw, ...(cell.formula === undefined ? {} : { formula: cell.formula }) }]))), rawValues, normalizedValues, productPriceFacts };
      records.push(record);
      if (sourceKey !== null) {
        const identity = identityKey(contract.entityType, sourceKey);
        const duplicates = byIdentity.get(identity) ?? [];
        if (duplicates.length) issue("DUPLICATE_SOURCE_IDENTITY", "同实体类别的来源身份重复，即使内容相同也不自动合并。", rowPosition, "ERROR", [sourceKey]);
        duplicates.push(record); byIdentity.set(identity, duplicates);
        const previous = prior.get(identity);
        if (previous && previous.sourceRecordHash !== record.sourceRecordHash) issue("PRIOR_SOURCE_CONTENT_CONFLICT", "同固定来源身份在前批与本批内容不同；不改为新随机身份。", rowPosition, "ERROR", [sourceKey]);
        const targetIdentity = byTargetId.get(record.targetId!);
        if (targetIdentity && targetIdentity !== identity) issue("DETERMINISTIC_ID_COLLISION", "不同来源身份产生相同内部ID；停止，不添加随机后缀。", rowPosition);
        else byTargetId.set(record.targetId!, identity);
      }
    }
  }
  if (!records.length) issue("NO_BUSINESS_RECORDS", "没有任何业务记录；空模板可通过表头检查，但不能称为已完成来源预检或导入。", {}, "PENDING");
  for (const contract of IMPORT_PREFLIGHT_SHEETS) if (!foundSheets.has(contract.name) && !contract.intakeOptional) issue("INPUT_SHEET_NOT_PRESENT",
    "本批未提供原业务输入页；分批准备可以待后批，但完整范围尚未核实。", { sheet: contract.name }, input.mode === "FINAL" ? "ERROR" : "PENDING");
  const relatedPosition = (r: ImportPreflightRecord, field: string) => ({ fileName: r.fileName, sheet: r.sheet, excelRow: r.excelRow, sourceId: r.sourceId, field, rawValue: r.rawValues[field]?.raw ?? null });
  for (const r of records.filter(record => record.entityType === "ISSUE")) {
    const targetSheet = r.normalizedValues["*涉及页签"], targetSource = r.normalizedValues["*来源编号"], state = r.normalizedValues["核对结果"];
    const targetContract = targetSheet == null ? undefined : supportedSheets.get(targetSheet);
    if (targetSheet != null && !targetContract) issue("ISSUE_TARGET_SHEET_UNKNOWN", "待处理记录引用的业务页签未知；保留原文，开发核对映射。", relatedPosition(r, "*涉及页签"));
    const targetIdentity = targetContract && targetSource != null ? identityKey(targetContract.entityType, sourceKeyFor(targetSource)) : null;
    const affected = targetIdentity === null ? [] : byIdentity.get(targetIdentity) ?? [];
    if (targetIdentity !== null && !affected.length && !prior.has(targetIdentity)) issue("ISSUE_TARGET_NOT_PRESENT", "待处理记录涉及的原对象尚不在本批或已核前批映射中。", relatedPosition(r, "*来源编号"), input.mode === "FINAL" ? "ERROR" : "PENDING", [sourceKeyFor(targetSource!)]);
    if (state !== "已解决") {
      const code = state === "明确排除" ? "SOURCE_EXCLUSION_APPROVAL_NOT_VERIFIED" : "UNRESOLVED_SOURCE_ISSUE";
      const reason = state === "明确排除" ? "来源写有明确排除，但本切片未验证排除对象、影响和真实核准依据；不能当作已获准排除。" : "来源待处理问题尚未明确解决；保留原问题及涉及对象，不能称其校验通过。";
      issue(code, reason, relatedPosition(r, "核对结果"), "PENDING");
      if (targetIdentity !== null) { prior.delete(targetIdentity); rejectedPriorKeys.add(targetIdentity); }
      for (const target of affected) {
        conflictedRecords.add(target);
        issue(code, reason, relatedPosition(target, r.normalizedValues["*问题字段"] ?? ""), "PENDING", [r.sourceKey ?? ""]);
      }
    }
    if (state === "已解决") issue("SOURCE_ISSUE_RESOLUTION_NOT_VERIFIED", "来源标记已解决已保留，但本切片未独立验证解决依据及具体字段语义。", relatedPosition(r, "核对结果"), "CAPABILITY");
  }
  for (const record of records) {
    const contract = supportedSheets.get(record.sheet)!;
    for (const field of [...contract.fields, ...(contract.optionalTrailingFields ?? [])]) if (field.referenceEntity) {
      const value = record.normalizedValues[field.header];
      if (value === null || value === undefined) continue;
      const key = sourceKeyFor(value), identity = identityKey(field.referenceEntity, key);
      const matches = byIdentity.get(identity);
      if ((matches?.length ?? 0) > 1) issue("AMBIGUOUS_SOURCE_REFERENCE", "引用对应多条来源记录，不能任选一条。", relatedPosition(record, field.header), "ERROR", [key]);
      else if (matches?.length === 1) {
        referenceEdges.push({ source: record, target: matches[0]!, field: field.header });
        if (["SALES_LINE", "SETTLEMENT", "TRANSFER_LINE"].includes(record.entityType) && ["SALES_HEADER", "TRANSFER_HEADER"].includes(field.referenceEntity))
          referenceEdges.push({ source: matches[0]!, target: record, field: "*来源编号", documentMember: true });
      }
      else if (!matches && !prior.has(identity)) issue("SOURCE_REFERENCE_NOT_PRESENT", input.mode === "STAGED" ? "引用目标不在本批或同命名空间前批映射中；标记待后批，未冒充无效终局或可正式接入。" : "完整预检仍缺少引用目标；不能用新UUID或名称代替。", relatedPosition(record, field.header), input.mode === "FINAL" ? "ERROR" : "PENDING", [key]);
    }
  }
  const unique = (entity: string, names: readonly string[], code: string, explanation: string) => {
    const seen = new Map<string, ImportPreflightRecord>();
    for (const record of records.filter(r => r.entityType === entity)) {
      const contract = supportedSheets.get(record.sheet)!;
      const fields = names.map(n => fullField(contract, n));
      const values = fields.map(f => record.normalizedValues[f]);
      if (values.some(v => v === null || v === undefined)) continue;
      const key = JSON.stringify(values), previous = seen.get(key);
      if (previous) {
        conflictedRecords.add(previous); conflictedRecords.add(record);
        for (const participant of [previous, record]) issue(code, explanation, relatedPosition(participant, fields.join(" + ")), "ERROR", [previous.sourceKey ?? "", record.sourceKey ?? ""]);
      }
      else seen.set(key, record);
    }
  };
  unique("CUSTOMER", ["原编码"], "DUPLICATE_CUSTOMER_CODE", "客户原编码重复，不合并客户和供应商身份。");
  unique("SUPPLIER", ["原编码"], "DUPLICATE_SUPPLIER_CODE", "供应商原编码重复。");
  unique("PRODUCT", ["款号"], "DUPLICATE_PRODUCT_CODE", "商品原款号重复。");
  unique("SKU", ["SKU编码"], "DUPLICATE_SKU_CODE", "正式SKU编码重复。");
  unique("SKU", ["商品来源编号", "颜色编码", "版型编码", "完整尺码"], "DUPLICATE_SKU_COMBINATION", "实际SKU四维组合重复；不生成笛卡尔积或合并原行。");
  unique("INVENTORY_BASELINE", ["仓库来源编号", "SKU来源编号"], "DUPLICATE_WAREHOUSE_SKU_BALANCE", "同仓SKU余额重复，即使同值也不相加；需核准互不重叠的分区证明及组合规则。");
  unique("PAYMENT_ACCOUNT_HALL", ["账户来源编号", "厅来源编号"], "DUPLICATE_ACCOUNT_HALL", "账户与厅的历史来源推荐关系重复；仅核对该关系，不产生账户或营业员权限，也不限制其他正常账户可选。");
  unique("SALES_LINE", ["单据来源编号", "原行号"], "DUPLICATE_DOCUMENT_LINE", "同一销货原行号重复，不重编原行。");
  unique("SETTLEMENT", ["单据来源编号", "原收退行号"], "DUPLICATE_SETTLEMENT_LINE", "同一销货原收退行号重复。");
  unique("TRANSFER_LINE", ["单据来源编号", "原行号"], "DUPLICATE_TRANSFER_LINE", "同一调拨原行号重复，不因同SKU合并。");
  const barcodeBindings = new Map<string, ImportPreflightRecord[]>();
  for (const r of records.filter(r => r.entityType === "BARCODE")) {
    const barcode = r.normalizedValues["*条码"], sku = r.normalizedValues["*SKU来源编号"];
    if (barcode == null || sku == null) continue;
    const bindings = barcodeBindings.get(barcode) ?? [];
    bindings.push(r); barcodeBindings.set(barcode, bindings);
  }
  for (const bindings of barcodeBindings.values()) if (new Set(bindings.map(r => r.normalizedValues["*SKU来源编号"])).size > 1) {
    const firstSku = bindings[0]!.normalizedValues["*SKU来源编号"]!;
    const otherSku = bindings.find(binding => binding.normalizedValues["*SKU来源编号"] !== firstSku)!.normalizedValues["*SKU来源编号"]!;
    const witnesses = [sourceKeyFor(firstSku), sourceKeyFor(otherSku)];
    for (const r of bindings) {
      conflictedRecords.add(r);
      issue("BARCODE_BINDS_MULTIPLE_SKUS", "完整原条码绑定多个SKU；停用绑定也不能改指其他SKU。", relatedPosition(r, "*条码"), "ERROR",
        witnesses);
    }
  }
  const sourceLineParents = new Set(records.filter(r => r.entityType === "SALES_LINE" || r.entityType === "TRANSFER_LINE")
    .map(r => identityKey(r.entityType, r.normalizedValues["*单据来源编号"] ?? "")));
  for (const r of records) {
    const value = (field: string): bigint | null => r.normalizedValues[field] == null ? null : BigInt(r.normalizedValues[field]!);
    const requirePositive = (field: string) => { const n = value(field); if (n !== null && n <= 0n) issue("EXPECTED_POSITIVE_INTEGER", "原行号或调拨数量必须为正整数，不自动翻转符号。", relatedPosition(r, field)); };
    if (r.entityType === "SALES_LINE" || r.entityType === "TRANSFER_LINE") requirePositive("*原行号");
    if (r.entityType === "SETTLEMENT") { requirePositive("*原收退行号"); const n = value("*金额"); if (n !== null && n < 0n) issue("SETTLEMENT_AMOUNT_MUST_BE_NONNEGATIVE", "收退金额是非负绝对值，方向由独立字段表达。", relatedPosition(r, "*金额")); }
    if (r.entityType === "TRANSFER_LINE") requirePositive("*原数量");
    if (r.entityType === "SALES_LINE") {
      const n = value("*原数量"), discount = value("原折扣十分位");
      if (n === 0n) issue("SALES_QUANTITY_ZERO", "销售/退换实际行数量不能为0，不凭单据类型翻号。", relatedPosition(r, "*原数量"));
      if (discount !== null && (discount < 0n || discount > 100n)) issue("DISCOUNT_TENTHS_RANGE", "原折扣十分位必须为0至100的明确来源整数。", relatedPosition(r, "原折扣十分位"));
    }
    if (r.entityType === "TRANSFER_HEADER" && r.normalizedValues["*调出仓来源编号"] !== null && r.normalizedValues["*调出仓来源编号"] === r.normalizedValues["*调入仓来源编号"])
      issue("TRANSFER_SAME_WAREHOUSE", "调出与调入仓必须不同，不重写原仓库事实。", relatedPosition(r, "*调入仓来源编号"));
    if (r.entityType === "WAREHOUSE" || r.entityType === "SKU") if (r.normalizedValues["*切换范围"] !== "本次完整核准") issue("CUTOFF_SCOPE_NOT_APPROVED", "正式仓/SKU含停用保留仍须核准完整范围；待核或排除不能表示缺余额为0。", relatedPosition(r, "*切换范围"), "PENDING");
    if (r.entityType === "SALES_HEADER" || r.entityType === "TRANSFER_HEADER") {
      const childType = r.entityType === "SALES_HEADER" ? "SALES_LINE" : "TRANSFER_LINE";
      if (r.sourceId !== null && !sourceLineParents.has(identityKey(childType, r.sourceId)))
        issue("DOCUMENT_HAS_NO_SOURCE_LINES", "单头没有任何原始明细；整单待后批/隔离，不能留下半张正式单据。", relatedPosition(r, "*来源编号"), input.mode === "FINAL" ? "ERROR" : "PENDING");
    }
  }
  // A malformed target is not an approved reference merely because its ID appeared.
  // Propagate source blockers through the dependency graph once, without O(n²) scans.
  const positionKey = (p: { fileName: string; sheet: string; excelRow: number | null }): string => JSON.stringify([p.fileName, p.sheet, p.excelRow]);
  const recordsByPosition = new Map<string, ImportPreflightRecord[]>();
  const blockedRecords = new Set<ImportPreflightRecord>(conflictedRecords);
  const blockingSeverity = new Map<ImportPreflightRecord, "ERROR" | "PENDING">();
  for (const record of records) {
    const key = positionKey(record), positioned = recordsByPosition.get(key) ?? [];
    positioned.push(record); recordsByPosition.set(key, positioned);
    if (duplicatedFileNames.has(record.fileName)) { blockedRecords.add(record); blockingSeverity.set(record, "ERROR"); }
  }
  for (const problem of issues) if (problem.severity !== "CAPABILITY" && problem.excelRow !== null)
    for (const record of recordsByPosition.get(positionKey(problem)) ?? []) {
      blockedRecords.add(record);
      if (blockingSeverity.get(record) !== "ERROR") blockingSeverity.set(record, problem.severity);
    }
  for (const duplicates of byIdentity.values()) if (duplicates.length > 1) for (const record of duplicates) { blockedRecords.add(record); blockingSeverity.set(record, "ERROR"); }
  for (const record of blockedRecords) if (!blockingSeverity.has(record)) blockingSeverity.set(record, "ERROR");
  const dependents = new Map<ImportPreflightRecord, typeof referenceEdges>();
  for (const edge of referenceEdges) { const edges = dependents.get(edge.target) ?? []; edges.push(edge); dependents.set(edge.target, edges); }
  const queue = [...blockedRecords];
  for (let i = 0; i < queue.length; i++) for (const edge of dependents.get(queue[i]!) ?? []) {
    const severity = blockingSeverity.get(edge.target) ?? "ERROR";
    if (blockedRecords.has(edge.source) && (blockingSeverity.get(edge.source) === "ERROR" || severity === "PENDING")) continue;
    blockedRecords.add(edge.source); blockingSeverity.set(edge.source, severity); queue.push(edge.source);
    issue(edge.documentMember ? "SOURCE_DOCUMENT_MEMBER_NOT_VALIDATED" : "SOURCE_REFERENCE_TARGET_NOT_VALIDATED",
      edge.documentMember ? "单据的任一明细/收退成员未通过来源检查；整张单据及兄弟行一起隔离，不导半张单。" : "引用目标存在，但其来源校验或依赖闭包仍有未决项；不当作已通过引用或已入库事实。", relatedPosition(edge.source, edge.field), severity, [edge.target.sourceKey ?? ""]);
  }
  const isolatedDocuments = records.filter(r => r.entityType === "SALES_HEADER" || r.entityType === "TRANSFER_HEADER").map(header => ({
    entityType: header.entityType, sourceKey: header.sourceKey, sourceId: header.sourceId,
    reason: "HISTORY_IMPORT_AND_BASELINE_AWARE_EDIT_NOT_IMPLEMENTED", sourceValidation: blockedRecords.has(header) ? "PENDING_OR_INVALID" : "CHECKED_WITHIN_SCOPE", sourceStatusPreserved: header.rawValues["*原审核状态"]?.raw ?? null,
  }));
  const capabilityBlockers = ["NO_MASTER_DATA_OR_XLSX_TO_DATABASE_IMPORT_PIPELINE", "NINE_PRICES_NOT_FULLY_PERSISTED", "BARCODE_PERSISTENCE_NOT_IMPLEMENTED",
    "HISTORY_IMPORT_AND_BASELINE_AWARE_EDIT_NOT_IMPLEMENTED", "FORMAL_DICTIONARY_MAPPING_NOT_VERIFIED", "DATE_AND_HISTORICAL_ECONOMICS_NOT_FULLY_VALIDATED",
    "EMPTY_TARGET_DATABASE_AND_FULL_CUTOFF_SOURCE_APPROVAL_NOT_VERIFIED"] as const;
  return { contractVersion: IMPORT_PREFLIGHT_CONTRACT_VERSION, batchId: input.batchId, fixedSourceNamespace: input.fixedSourceNamespace, mode: input.mode,
    databaseExecuted: false as const, importReady: false as const, publishReady: false as const,
    priceCompletenessVerified: false as const, blankPriceMeaning: "VERIFIED_V03_PRICE_COLUMN_BLANK_IS_UNSET" as const,
    historicalPaymentMethodSnapshotPolicy: { nativeTarget: "sales_settlement.payment_method_id_snapshot" as const,
      optionalSourceHeader: "原收款方式来源编号" as const, absentValue: "UNKNOWN_NOT_A_RECENT_RECOMMENDATION_FACT" as const,
      inferredFromDisplayNameOrCurrentAccount: false as const, providedReferenceAloneGrantsRecommendation: false as const },
    dataStatus: issues.some(i => i.severity === "ERROR") ? "INVALID" as const : issues.some(i => i.severity === "PENDING") ? "PENDING" as const : "CHECKED_WITHIN_SCOPE" as const,
    files: input.files, records, issues, capabilityBlockers, isolatedDocuments,
    recordChecks: records.map(r => ({ fileName: r.fileName, sheet: r.sheet, excelRow: r.excelRow, sourceKey: r.sourceKey,
      sourceValidation: blockedRecords.has(r) ? "PENDING_OR_INVALID" as const : "CHECKED_WITHIN_SCOPE" as const })),
    identityManifest: { fixedSourceNamespace: input.fixedSourceNamespace, identities: records.filter(r => r.entityType !== "ISSUE" && r.sourceKey !== null && !blockedRecords.has(r)).map(r => ({ entityType: r.entityType,
      sourceKey: r.sourceKey!, targetId: r.targetId!, sourceRecordHash: r.sourceRecordHash })) },
    limitations: ["离线算子预检不是正式导入或生产服务。", "缺少来源键的经批准自然键映射尚未接通；不造业务码。", "日期、正式字典、完整历史金额/状态/快照/身份语义仍待开发验证。", "前批manifest只支持离线引用和内容一致性检查，不证明任何对象已入库。", "缺库存行不推断为0；无全范围及最终增量核准，不发布。"] };
}
