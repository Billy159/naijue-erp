/**
 * ③B · T+ 真实数据正式导入 Demo。
 *
 * 这个入口只接受已经通过 ③A-2 的固定 IMPORT_MANIFEST，先把允许导入的
 * JSONL 流式装入事务内临时表，再一次性写入独立 PostgreSQL schema。
 * 不调用当前审核、收款或库存过账逻辑；历史单据只建立只读投影，库存只
 * 加载 rebuilt_stock 一次。
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";

type JsonRecord = Record<string, unknown>;
type ManifestDataset = {
  path: string;
  format: string;
  formalImportExecuted: boolean;
  automaticStockMutationOnLoad?: boolean;
  automaticFundsMutationOnLoad?: boolean;
  runtimeAuditReplayAllowed?: boolean;
  classification: string[];
  canImport: boolean;
  archiveOnly?: boolean;
  participatesInBusinessCalculation?: boolean;
  loadAction: string;
  sha256: string;
  bytes: number;
  recordCount: number;
};
type Manifest = {
  batchId: string;
  stage: string;
  outputRoot: string;
  executed: boolean;
  formalImportExecuted: boolean;
  demoBusinessStoreWritten: boolean;
  runtimeAuditReplayAllowed: boolean;
  preflightPassed: boolean;
  stage3BStarted: boolean;
  datasets: ManifestDataset[];
  counts: { importEligibleFiles: number; quarantineFiles: number; nonComputationalFiles: number };
  inventoryPolicy?: { mixedUnitQuantityControlTotal: string; negativeInventoryRows?: number };
};

type Options = {
  preflightDir: string;
  manifestPath: string;
  schema: string;
  database: string;
  user: string;
  host: string;
  port: string;
  execute: boolean;
  reportDir: string;
};

type DigestResult = { sha256: string; bytes: number; recordCount: number };

let EXPECTED_BATCH = "TPLUS-20260922-A2";
const EXPECTED_STAGE = "③A-2";
const IMPORTER_VERSION = "tplus-demo-importer/20260923.1";
const DEFAULT_SCHEMA = "tplus_demo_20260922_a2";
const DEFAULT_PREFLIGHT = resolve("data-cleaning/runs/accepted-preflight");
const DEFAULT_MANIFEST = resolve(DEFAULT_PREFLIGHT, "IMPORT_MANIFEST.json");
const BASELINE_SQL = resolve("data-cleaning/import/0001_database_baseline.sql");
const TARGET_SCHEMA_SQL = resolve("data-cleaning/import/target-schema.sql");

const EXPECTED_IMPORTABLE = new Set([
  "data/history/purchase_documents.jsonl",
  "data/history/purchase_lines.jsonl",
  "data/history/sales_documents.jsonl",
  "data/history/sales_funds.jsonl",
  "data/history/sales_lines.jsonl",
  "data/history/transfer_documents.jsonl",
  "data/history/transfer_lines.jsonl",
  "data/inventory/rebuilt_stock.jsonl",
  "data/master/categories.jsonl",
  "data/master/colors.jsonl",
  "data/master/customers.jsonl",
  "data/master/departments.jsonl",
  "data/master/employees.jsonl",
  "data/master/fits.jsonl",
  "data/master/fund_accounts.jsonl",
  "data/master/halls.jsonl",
  "data/master/parties.jsonl",
  "data/master/payment_methods.jsonl",
  "data/master/payment_methods_derived.jsonl",
  "data/master/product_barcodes.jsonl",
  "data/master/products.jsonl",
  "data/master/size_groups.jsonl",
  "data/master/sizes.jsonl",
  "data/master/skus.jsonl",
  "data/master/suppliers.jsonl",
  "data/master/units.jsonl",
  "data/master/warehouses.jsonl",
]);

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]!;
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else result[key] = "";
  }
  return result;
}

function optionsFromArgs(argv: string[]): Options {
  const args = parseArgs(argv);
  EXPECTED_BATCH = args.batch ?? EXPECTED_BATCH;
  return {
    preflightDir: resolve(args.preflight ?? DEFAULT_PREFLIGHT),
    manifestPath: resolve(args.manifest ?? DEFAULT_MANIFEST),
    schema: args.schema ?? DEFAULT_SCHEMA,
    database: args.database ?? process.env.POSTGRES_DB ?? "business_management",
    user: args.user ?? process.env.POSTGRES_USER ?? process.env.USER ?? "billy",
    host: args.host ?? process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: args.port ?? process.env.POSTGRES_PORT ?? "5432",
    execute: "execute" in args,
    reportDir: resolve(args["report-dir"] ?? "data-cleaning/runs/historical-import"),
  };
}

function quoteIdent(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`非法 PostgreSQL schema 名称：${value}`);
  return `"${value}"`;
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "\\N" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));
  const [code] = await once(child, "close") as [number | null];
  if (code !== 0) throw new Error(Buffer.concat(err).toString("utf8") || `${command} failed with ${code}`);
  return Buffer.concat(out).toString("utf8");
}

function psqlArgs(options: Options, database = options.database): string[] {
  const psql = process.env.PSQL_BIN ?? "psql";
  return [psql, "-h", options.host, "-p", options.port, "-U", options.user, "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
}

async function runPsqlScript(options: Options, script: string, database = options.database): Promise<string> {
  const args = psqlArgs(options, database);
  const command = args.shift()!;
  return commandOutputWithInput(command, args, script);
}

async function commandOutputWithInput(command: string, args: string[], input: string): Promise<string> {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));
  child.stdin.end(input);
  const [code] = await once(child, "close") as [number | null];
  if (code !== 0) throw new Error(Buffer.concat(err).toString("utf8") || `${command} failed with ${code}`);
  return Buffer.concat(out).toString("utf8");
}

class PsqlStream {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly out: Buffer[] = [];
  private readonly err: Buffer[] = [];

  constructor(private readonly options: Options) {
    const args = psqlArgs(options);
    const command = args.shift()!;
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (chunk) => this.out.push(Buffer.from(chunk)));
    this.child.stderr.on("data", (chunk) => this.err.push(Buffer.from(chunk)));
  }

  async write(text: string): Promise<void> {
    if (!this.child.stdin.write(text)) await once(this.child.stdin, "drain");
  }

  async finish(): Promise<string> {
    this.child.stdin.end();
    const [code] = await once(this.child, "close") as [number | null];
    if (code !== 0) throw new Error(Buffer.concat(this.err).toString("utf8") || `psql import failed with ${code}`);
    return Buffer.concat(this.out).toString("utf8");
  }

  async abort(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.child.kill("SIGTERM");
    await once(this.child, "close").catch(() => undefined);
  }
}

async function digestFile(filePath: string): Promise<DigestResult> {
  const stream = createReadStream(filePath);
  const hash = createHash("sha256");
  let bytes = 0;
  let recordCount = 0;
  let lastByte = -1;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk as Buffer);
    bytes += buffer.length;
    hash.update(buffer);
    for (const byte of buffer) if (byte === 10) recordCount += 1;
    if (buffer.length > 0) lastByte = buffer[buffer.length - 1]!;
  }
  if (bytes > 0 && lastByte !== 10) recordCount += 1;
  return { sha256: hash.digest("hex"), bytes, recordCount };
}

async function queryRows<T extends JsonRecord>(options: Options, schema: string, statement: string): Promise<T[]> {
  const scoped = `SET search_path TO ${quoteIdent(schema)}, public;\nSELECT COALESCE(json_agg(row_to_json(result)), '[]'::json)::text FROM (${statement}) AS result;\n`;
  const output = await runPsqlScript(options, scoped);
  const line = output.trim().split("\n").filter(Boolean).pop() ?? "[]";
  return JSON.parse(line) as T[];
}

async function verifyManifest(options: Options, manifest: Manifest): Promise<Map<string, ManifestDataset>> {
  const failures: string[] = [];
  if (manifest.batchId !== EXPECTED_BATCH) failures.push(`batchId=${manifest.batchId}`);
  if (manifest.stage !== EXPECTED_STAGE) failures.push(`stage=${manifest.stage}`);
  if (!manifest.preflightPassed || manifest.executed || manifest.formalImportExecuted || manifest.demoBusinessStoreWritten || manifest.runtimeAuditReplayAllowed || manifest.stage3BStarted) {
    failures.push("manifest gate flags are not the untouched ③A-2 state");
  }
  const byPath = new Map(manifest.datasets.map((dataset) => [dataset.path, dataset]));
  const importable = manifest.datasets.filter((dataset) => dataset.canImport).map((dataset) => dataset.path);
  if (importable.length !== EXPECTED_IMPORTABLE.size || importable.some((path) => !EXPECTED_IMPORTABLE.has(path)) || [...EXPECTED_IMPORTABLE].some((path) => !byPath.has(path))) {
    failures.push("importable dataset set differs from the approved manifest");
  }
  if (manifest.counts.importEligibleFiles !== EXPECTED_IMPORTABLE.size) failures.push("manifest importEligibleFiles mismatch");

  for (const dataset of manifest.datasets) {
    const filePath = resolve(options.preflightDir, dataset.path);
    if (dataset.canImport || dataset.classification.includes("隔离")) {
      try {
        const actual = await digestFile(filePath);
        if (actual.sha256 !== dataset.sha256 || actual.bytes !== dataset.bytes || actual.recordCount !== dataset.recordCount) {
          failures.push(`${dataset.path}: manifest=${dataset.sha256}/${dataset.bytes}/${dataset.recordCount}, actual=${actual.sha256}/${actual.bytes}/${actual.recordCount}`);
        }
      } catch (error) {
        failures.push(`${dataset.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (failures.length > 0) throw new Error(`导入前 manifest 校验失败：\n${failures.join("\n")}`);
  return byPath;
}

function sourceTargetMapSql(batch: string): string {
  return `
CREATE TEMP VIEW tplus_entity_map AS
SELECT
  s.dataset_path,
  s.source_id,
  s.source_sha256,
  s.record_sha256,
  CASE
    WHEN s.dataset_path='data/master/categories.jsonl' THEN 'CATEGORY'
    WHEN s.dataset_path='data/master/colors.jsonl' THEN 'COLOR'
    WHEN s.dataset_path='data/master/customers.jsonl' OR s.dataset_path='data/master/suppliers.jsonl' OR s.dataset_path='data/master/parties.jsonl' THEN 'PARTY'
    WHEN s.dataset_path='data/master/departments.jsonl' THEN 'DEPARTMENT'
    WHEN s.dataset_path='data/master/employees.jsonl' THEN 'EMPLOYEE'
    WHEN s.dataset_path='data/master/fits.jsonl' THEN 'FIT'
    WHEN s.dataset_path='data/master/fund_accounts.jsonl' THEN 'FUND_ACCOUNT'
    WHEN s.dataset_path='data/master/halls.jsonl' THEN 'HALL'
    WHEN s.dataset_path='data/master/payment_methods.jsonl' OR s.dataset_path='data/master/payment_methods_derived.jsonl' THEN 'PAYMENT_METHOD'
    WHEN s.dataset_path='data/master/product_barcodes.jsonl' THEN 'PRODUCT_BARCODE'
    WHEN s.dataset_path='data/master/products.jsonl' THEN 'PRODUCT'
    WHEN s.dataset_path='data/master/size_groups.jsonl' THEN 'SIZE_GROUP'
    WHEN s.dataset_path='data/master/sizes.jsonl' THEN 'SIZE'
    WHEN s.dataset_path='data/master/skus.jsonl' THEN 'SKU'
    WHEN s.dataset_path='data/master/units.jsonl' THEN 'UNIT'
    WHEN s.dataset_path='data/master/warehouses.jsonl' THEN 'WAREHOUSE'
    WHEN s.dataset_path='data/history/purchase_documents.jsonl' THEN 'HISTORICAL_DOCUMENT'
    WHEN s.dataset_path='data/history/sales_documents.jsonl' THEN 'HISTORICAL_DOCUMENT'
    WHEN s.dataset_path='data/history/transfer_documents.jsonl' THEN 'HISTORICAL_DOCUMENT'
    WHEN s.dataset_path='data/history/purchase_lines.jsonl' THEN 'HISTORICAL_LINE'
    WHEN s.dataset_path='data/history/sales_lines.jsonl' THEN 'HISTORICAL_LINE'
    WHEN s.dataset_path='data/history/transfer_lines.jsonl' THEN 'HISTORICAL_LINE'
    WHEN s.dataset_path='data/history/sales_funds.jsonl' THEN 'HISTORICAL_SALES_FUND'
    WHEN s.dataset_path='data/inventory/rebuilt_stock.jsonl' THEN 'INVENTORY_BALANCE'
    ELSE 'UNMAPPED'
  END AS target_type,
  CASE
    WHEN s.dataset_path='data/master/categories.jsonl' THEN tplus_uuid('category',s.source_id)
    WHEN s.dataset_path='data/master/colors.jsonl' THEN tplus_uuid('spec_value_color',s.source_id)
    WHEN s.dataset_path='data/master/customers.jsonl' OR s.dataset_path='data/master/suppliers.jsonl' OR s.dataset_path='data/master/parties.jsonl' THEN tplus_uuid('party',COALESCE(s.payload->>'partyId',s.source_id))
    WHEN s.dataset_path='data/master/departments.jsonl' THEN tplus_uuid('department',s.source_id)
    WHEN s.dataset_path='data/master/employees.jsonl' THEN tplus_uuid('employee',s.source_id)
    WHEN s.dataset_path='data/master/fits.jsonl' THEN tplus_uuid('fit',s.source_id)
    WHEN s.dataset_path='data/master/fund_accounts.jsonl' THEN tplus_uuid('fund_account',s.source_id)
    WHEN s.dataset_path='data/master/halls.jsonl' THEN tplus_uuid('hall',s.source_id)
    WHEN s.dataset_path='data/master/payment_methods.jsonl' OR s.dataset_path='data/master/payment_methods_derived.jsonl' THEN tplus_uuid('payment_method',s.source_id)
    WHEN s.dataset_path='data/master/product_barcodes.jsonl' THEN tplus_uuid('product_barcode',s.source_id)
    WHEN s.dataset_path='data/master/products.jsonl' THEN tplus_uuid('product',s.source_id)
    WHEN s.dataset_path='data/master/size_groups.jsonl' THEN tplus_uuid('size_group',s.source_id)
    WHEN s.dataset_path='data/master/sizes.jsonl' THEN tplus_uuid('spec_value_size',s.source_id)
    WHEN s.dataset_path='data/master/skus.jsonl' THEN tplus_uuid('sku',s.source_id)
    WHEN s.dataset_path='data/master/units.jsonl' THEN tplus_uuid('unit',s.source_id)
    WHEN s.dataset_path='data/master/warehouses.jsonl' THEN tplus_uuid('warehouse',s.source_id)
    WHEN s.dataset_path='data/history/purchase_documents.jsonl' THEN tplus_uuid('historical_purchase',s.source_id)
    WHEN s.dataset_path='data/history/sales_documents.jsonl' THEN tplus_uuid('historical_sale',s.source_id)
    WHEN s.dataset_path='data/history/transfer_documents.jsonl' THEN tplus_uuid('historical_transfer',s.source_id)
    WHEN s.dataset_path='data/history/purchase_lines.jsonl' THEN tplus_uuid('historical_purchase_line',s.source_id)
    WHEN s.dataset_path='data/history/sales_lines.jsonl' THEN tplus_uuid('historical_sale_line',s.source_id)
    WHEN s.dataset_path='data/history/transfer_lines.jsonl' THEN tplus_uuid('historical_transfer_line',s.source_id)
    WHEN s.dataset_path='data/history/sales_funds.jsonl' THEN tplus_uuid('historical_sales_fund',s.source_id)
    WHEN s.dataset_path='data/inventory/rebuilt_stock.jsonl' THEN tplus_uuid('inventory_balance',s.source_id)
    ELSE NULL
  END AS target_id
FROM tplus_stage s;

INSERT INTO tplus_source_lineage(batch_id,dataset_path,source_id,source_sha256,record_sha256,target_type,target_id)
SELECT ${sql(batch)},dataset_path,source_id,source_sha256,record_sha256,target_type,target_id FROM tplus_entity_map;

INSERT INTO tplus_id_map(batch_id,entity_type,source_id,target_id)
SELECT ${sql(batch)},target_type,source_id,target_id
FROM tplus_entity_map
WHERE target_type NOT IN ('HISTORICAL_DOCUMENT','HISTORICAL_LINE','HISTORICAL_SALES_FUND','INVENTORY_BALANCE')
ON CONFLICT DO NOTHING;
`;
}

function optionsSnapshot(alias: string): string {
  const color = `jsonb_build_object('dimensionId',tplus_uuid('dimension','COLOR'),'dimensionCode','COLOR','valueId',tplus_uuid('spec_value_color',${alias}.payload->>'colorId'),'valueCode',${alias}.payload->>'sourceColorCode','valueName',${alias}.payload->>'sourceColorName')`;
  const size = `jsonb_build_object('dimensionId',tplus_uuid('dimension','SIZE'),'dimensionCode','SIZE','valueId',tplus_uuid('spec_value_size',${alias}.payload->>'sizeId'),'valueCode',${alias}.payload->>'sourceSizeCode','valueName',${alias}.payload->>'sourceSizeName')`;
  return `jsonb_build_array(${color},${size})`;
}

function transformSql(options: Options, manifest: Manifest, gitSha: string, workspaceStateSha: string, manifestSha: string): string {
  const batch = sql(manifest.batchId);
  const schema = quoteIdent(options.schema);
  const expectedCount = (path: string): number => {
    const entry = manifest.datasets.find((dataset) => dataset.path === path);
    if (!entry || !entry.canImport || !Number.isSafeInteger(entry.recordCount)) throw new Error(`Missing approved dataset count: ${path}`);
    return entry.recordCount;
  };
  const expectedInventoryTotal = manifest.inventoryPolicy?.mixedUnitQuantityControlTotal;
  const expectedNegativeInventory = manifest.inventoryPolicy?.negativeInventoryRows;
  if (expectedInventoryTotal === undefined || expectedNegativeInventory === undefined || !/^-?\d+(?:\.\d+)?$/.test(expectedInventoryTotal)) throw new Error("Missing preflight inventory controls");
  const manifestValues = manifest.datasets.map((dataset) => {
    const isQuarantine = dataset.classification.includes("隔离");
    const status = dataset.canImport ? "IMPORTED" : isQuarantine ? "QUARANTINED" : "SKIPPED";
    const success = dataset.canImport ? dataset.recordCount : 0;
    const skipped = !dataset.canImport && !isQuarantine ? dataset.recordCount : 0;
    const quarantined = isQuarantine ? dataset.recordCount : 0;
    return `(${batch},${sql(dataset.path)},${sql(dataset.sha256)},${dataset.recordCount},${success},0,${skipped},${quarantined},${dataset.canImport ? "TRUE" : "FALSE"},${dataset.participatesInBusinessCalculation === true ? "TRUE" : "FALSE"},${sql(dataset.loadAction)},${sql(status)})`;
  }).join(",\n");
  const productUnitJoin = `JOIN tplus_stage unit_stage ON unit_stage.dataset_path='data/master/units.jsonl' AND unit_stage.payload->>'name'=p.payload->>'unit'`;
  const colorDimension = `tplus_uuid('dimension','COLOR')`;
  const sizeDimension = `tplus_uuid('dimension','SIZE')`;
  const categoryCode = `COALESCE(c.payload->>'code',c.source_id)`;
  const sourceDate = (alias: string, field: string) => `NULLIF(${alias}.payload->>'${field}','')::date`;
  const historyBusinessDate = `NULLIF(COALESCE(s.payload->>'businessDate',s.payload->>'date'),'')::date`;
  const historyDocCommon = `
  ${batch},s.dataset_path,s.source_id,
  tplus_uuid(CASE WHEN s.dataset_path='data/history/purchase_documents.jsonl' THEN 'historical_purchase' WHEN s.dataset_path='data/history/sales_documents.jsonl' THEN 'historical_sale' ELSE 'historical_transfer' END,s.source_id),
  CASE WHEN s.dataset_path='data/history/purchase_documents.jsonl' THEN 'purchase' WHEN s.dataset_path='data/history/sales_documents.jsonl' THEN 'sale' ELSE 'transfer' END,
  COALESCE(s.payload->>'sourceNumber',s.payload->>'sourceDocumentNumber'),
  ${historyBusinessDate},
  COALESCE(s.payload->>'sourceBusinessTypeCode',s.payload->>'sourceTypeCode'),
  COALESCE(s.payload->>'sourceBusinessType',s.payload->>'sourceBusinessTypeName'),
  CASE WHEN COALESCE(s.payload->>'partyId',s.payload->>'customerId',s.payload->>'settlementCustomerId') IS NULL THEN NULL ELSE tplus_uuid('party',COALESCE(s.payload->>'partyId',s.payload->>'customerId',s.payload->>'settlementCustomerId')) END,
  CASE WHEN s.payload->>'departmentId' IS NULL THEN NULL ELSE tplus_uuid('department',s.payload->>'departmentId') END,
  CASE WHEN s.payload->>'employeeId' IS NULL THEN NULL ELSE tplus_uuid('employee',s.payload->>'employeeId') END,
  CASE WHEN s.payload->>'warehouseId' IS NULL THEN NULL ELSE tplus_uuid('warehouse',s.payload->>'warehouseId') END,
  CASE WHEN s.payload->>'fromWarehouseId' IS NULL THEN NULL ELSE tplus_uuid('warehouse',s.payload->>'fromWarehouseId') END,
  CASE WHEN s.payload->>'toWarehouseId' IS NULL THEN NULL ELSE tplus_uuid('warehouse',s.payload->>'toWarehouseId') END,
  COALESCE(NULLIF(s.payload->>'lineCount','')::integer,0),
  NULLIF(COALESCE(s.payload->>'quantityTotalFromSourceLines',s.payload->>'quantityControlTotal'),'')::numeric,
  NULLIF(COALESCE(s.payload->>'amountTotalFromSourceLines',s.payload->>'amountAfterRounding',s.payload->>'amount'),'')::numeric,
  COALESCE((s.payload->>'readOnly')::boolean,TRUE),
  s.payload->>'auditStatus',s.payload->>'auditedBy',s.payload->>'auditedAt',s.payload->>'createdBy',s.payload->>'createdAt',
  COALESCE((s.payload->>'runtimeAuditReplayAllowed')::boolean,FALSE),
  COALESCE((s.payload->>'stockEffect')::boolean,FALSE),
  s.source_sha256,s.record_sha256,s.payload`;

  return `
SET search_path TO ${schema}, public;
INSERT INTO import_batch(id,file_name,sha256,importer_version,status)
VALUES (tplus_uuid('import_batch',${batch}),${sql(options.manifestPath)},${sql(manifestSha)},${sql(IMPORTER_VERSION)},'VALIDATED');
INSERT INTO tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256,rollback_note)
VALUES (${batch},${sql(`erp-v2-demo-real-tplus/${manifest.batchId}`)},${sql(options.schema)},${sql(options.database)},${sql(options.manifestPath)},${sql(manifestSha)},${batch},${sql(IMPORTER_VERSION)},'IMPORTING',${sql(gitSha)},${sql(workspaceStateSha)},${sql(`独立 schema，可通过 DROP SCHEMA ${options.schema} CASCADE 回滚；原 source/runtime 不参与写入。`)});
INSERT INTO tplus_import_file(batch_id,dataset_path,source_sha256,record_count,success_count,failure_count,skipped_count,quarantined_count,can_import,participates_in_business_calculation,load_action,status)
VALUES
${manifestValues};

${sourceTargetMapSql(manifest.batchId)}

-- 主档：只从已批准清单加载，不从旧 public 或 seed 读取。
INSERT INTO category(id,parent_id,code,code_normalized,name,enabled)
SELECT tplus_uuid('category',c.source_id),CASE WHEN c.payload->>'parentId' IS NULL THEN NULL ELSE tplus_uuid('category',c.payload->>'parentId') END,${categoryCode},lower(${categoryCode}),c.payload->>'name',TRUE
FROM tplus_stage c WHERE c.dataset_path='data/master/categories.jsonl';

INSERT INTO unit(id,code,code_normalized,name,quantity_scale,enabled)
SELECT tplus_uuid('unit',u.source_id),u.source_id,lower(u.source_id),u.payload->>'name',0,TRUE
FROM tplus_stage u WHERE u.dataset_path='data/master/units.jsonl';

INSERT INTO counterparty(id,code,code_normalized,name,enabled)
SELECT tplus_uuid('party',p.source_id),p.payload->>'sourceCode',lower(p.payload->>'sourceCode'),p.payload->>'name',TRUE
FROM tplus_stage p WHERE p.dataset_path='data/master/parties.jsonl';

INSERT INTO warehouse(id,code,code_normalized,name,type,enabled)
SELECT tplus_uuid('warehouse',w.source_id),w.payload->>'sourceCode',lower(w.payload->>'sourceCode'),w.payload->>'name',COALESCE(w.payload->>'usageMode','public'),TRUE
FROM tplus_stage w WHERE w.dataset_path='data/master/warehouses.jsonl';

INSERT INTO fit(id,code,code_normalized,name,enabled)
SELECT tplus_uuid('fit',f.source_id),f.payload->>'sourceCode',lower(f.payload->>'sourceCode'),f.payload->>'name',TRUE
FROM tplus_stage f WHERE f.dataset_path='data/master/fits.jsonl';

INSERT INTO spec_dimension(id,code,code_normalized,name,enabled)
VALUES (${colorDimension},'COLOR','color','颜色',TRUE),(${sizeDimension},'SIZE','size','尺码',TRUE);

INSERT INTO spec_value(id,dimension_id,code,code_normalized,name,sort_order,enabled)
SELECT tplus_uuid('spec_value_color',c.source_id),${colorDimension},c.payload->>'code',lower(c.payload->>'code'),c.payload->>'name',row_number() OVER (ORDER BY c.source_id)-1,TRUE
FROM tplus_stage c WHERE c.dataset_path='data/master/colors.jsonl';
INSERT INTO spec_value(id,dimension_id,code,code_normalized,name,sort_order,enabled)
SELECT tplus_uuid('spec_value_size',s.source_id),${sizeDimension},s.payload->>'code',lower(s.payload->>'code'),s.payload->>'name',row_number() OVER (ORDER BY s.source_id)-1,TRUE
FROM tplus_stage s WHERE s.dataset_path='data/master/sizes.jsonl';

INSERT INTO size_group(id,code,code_normalized,name,enabled)
SELECT tplus_uuid('size_group',g.source_id),g.payload->>'sourceCode',lower(g.payload->>'sourceCode'),g.payload->>'name',TRUE
FROM tplus_stage g WHERE g.dataset_path='data/master/size_groups.jsonl';

INSERT INTO product(id,code,code_normalized,name,category_id,unit_id,fit_id,counterparty_id,enabled,version)
SELECT tplus_uuid('product',p.source_id),p.payload->>'sourceCode',lower(p.payload->>'sourceCode'),p.payload->>'name',
  tplus_uuid('category',p.payload->>'categoryId'),tplus_uuid('unit',unit_stage.source_id),
  CASE WHEN p.payload->>'fitId' IS NULL THEN NULL ELSE tplus_uuid('fit',p.payload->>'fitId') END,
  CASE WHEN p.payload->>'supplierId' IS NULL THEN NULL ELSE tplus_uuid('party',p.payload->>'supplierId') END,TRUE,0
FROM tplus_stage p ${productUnitJoin} WHERE p.dataset_path='data/master/products.jsonl';

INSERT INTO tplus_product_source(batch_id,product_id,source_id,source_code,source_size_group_id,category_decision,source_payload)
SELECT ${batch},tplus_uuid('product',p.source_id),p.source_id,p.payload->>'sourceCode',CASE WHEN p.payload->>'sourceSizeGroupId' IS NULL THEN NULL ELSE tplus_uuid('size_group',p.payload->>'sourceSizeGroupId') END,COALESCE(p.payload->'categoryDecision','{}'::jsonb),p.payload
FROM tplus_stage p WHERE p.dataset_path='data/master/products.jsonl';

INSERT INTO price_type(id,code,code_normalized,name,enabled) VALUES
  (tplus_uuid('price_type','purchase'),'PURCHASE','purchase','采购价',TRUE),
  (tplus_uuid('price_type','retail'),'RETAIL','retail','零售价',TRUE),
  (tplus_uuid('price_type','wholesale5'),'WHOLESALE5','wholesale5','五级批发价（工厂店供货价）',TRUE),
  (tplus_uuid('price_type','wholesale6'),'WHOLESALE6','wholesale6','六级批发价（贴牌价）',TRUE),
  (tplus_uuid('price_type','wholesale7'),'WHOLESALE7','wholesale7','七级批发价（批发价）',TRUE),
  (tplus_uuid('price_type','wholesale8'),'WHOLESALE8','wholesale8','八级批发价（代理商供货价）',TRUE),
  (tplus_uuid('price_type','wholesale9'),'WHOLESALE9','wholesale9','九级批发价（工厂店零售价）',TRUE),
  (tplus_uuid('price_type','wholesale10'),'WHOLESALE10','wholesale10','十级批发价（葛玉珠）',TRUE),
  (tplus_uuid('price_type','minimum'),'MIN_PRICE','min_price','最低售价',TRUE);

INSERT INTO product_price(product_id,price_type_id,amount)
SELECT tplus_uuid('product',p.source_id),tplus_uuid('price_type',x.code),x.amount::numeric
FROM tplus_stage p
CROSS JOIN LATERAL (VALUES
  ('purchase',NULLIF(p.payload->>'purchasePrice','')),
  ('retail',NULLIF(p.payload->>'price','')),
  ('wholesale5',NULLIF(p.payload->>'wholesale5','')),
  ('wholesale6',NULLIF(p.payload->>'wholesale6','')),
  ('wholesale7',NULLIF(p.payload->>'wholesale7','')),
  ('wholesale8',NULLIF(p.payload->>'wholesale8','')),
  ('wholesale9',NULLIF(p.payload->>'wholesale9','')),
  ('wholesale10',NULLIF(p.payload->>'wholesale10','')),
  ('minimum',NULLIF(p.payload->>'minimumPrice',''))
) AS x(code,amount)
WHERE p.dataset_path='data/master/products.jsonl' AND x.amount IS NOT NULL;

INSERT INTO variant(id,product_id,option_key,enabled,version)
SELECT tplus_uuid('sku',s.source_id),tplus_uuid('product',s.payload->>'productId'),
  CASE WHEN ${colorDimension}::text < ${sizeDimension}::text
    THEN ${colorDimension}::text || '=' || tplus_uuid('spec_value_color',s.payload->>'colorId')::text || '|' || ${sizeDimension}::text || '=' || tplus_uuid('spec_value_size',s.payload->>'sizeId')::text
    ELSE ${sizeDimension}::text || '=' || tplus_uuid('spec_value_size',s.payload->>'sizeId')::text || '|' || ${colorDimension}::text || '=' || tplus_uuid('spec_value_color',s.payload->>'colorId')::text END,
  TRUE,0
FROM tplus_stage s WHERE s.dataset_path='data/master/skus.jsonl';
INSERT INTO variant_option(variant_id,dimension_id,spec_value_id)
SELECT tplus_uuid('sku',s.source_id),${colorDimension},tplus_uuid('spec_value_color',s.payload->>'colorId') FROM tplus_stage s WHERE s.dataset_path='data/master/skus.jsonl';
INSERT INTO variant_option(variant_id,dimension_id,spec_value_id)
SELECT tplus_uuid('sku',s.source_id),${sizeDimension},tplus_uuid('spec_value_size',s.payload->>'sizeId') FROM tplus_stage s WHERE s.dataset_path='data/master/skus.jsonl';

INSERT INTO tplus_product_barcode(batch_id,source_id,product_id,barcode,unit,is_default,binding_scope,sku_id,sku_binding_known,source_payload)
SELECT ${batch},b.source_id,tplus_uuid('product',b.payload->>'productId'),b.payload->>'barcode',b.payload->>'unit',COALESCE((b.payload->>'isDefault')::boolean,FALSE),COALESCE(b.payload->>'bindingScope','product_only'),CASE WHEN b.payload->>'skuId' IS NULL THEN NULL ELSE tplus_uuid('sku',b.payload->>'skuId') END,COALESCE((b.payload->>'skuBindingKnown')::boolean,FALSE),b.payload
FROM tplus_stage b WHERE b.dataset_path='data/master/product_barcodes.jsonl';

-- 角色、部门、营业厅、员工、结算方式和资金账户保留在 T+ 投影表，不伪造登录身份。
INSERT INTO tplus_department(batch_id,id,source_id,source_code,name,parent_id,hall_id,is_hall_source,source_payload)
SELECT ${batch},tplus_uuid('department',d.source_id),d.source_id,d.payload->>'sourceCode',d.payload->>'name',CASE WHEN d.payload->>'parentDepartmentId' IS NULL THEN NULL ELSE tplus_uuid('department',d.payload->>'parentDepartmentId') END,CASE WHEN d.payload->>'hallId' IS NULL THEN NULL ELSE tplus_uuid('hall',d.payload->>'hallId') END,COALESCE((d.payload->>'isHallSource')::boolean,FALSE),d.payload
FROM tplus_stage d WHERE d.dataset_path='data/master/departments.jsonl';
INSERT INTO tplus_hall(batch_id,id,source_id,source_code,name,department_id,default_customer_id,default_warehouse_id,warehouse_ids,source_payload)
SELECT ${batch},tplus_uuid('hall',h.source_id),h.source_id,h.payload->>'sourceCode',h.payload->>'name',tplus_uuid('department',h.payload->>'departmentId'),CASE WHEN h.payload->>'defaultCustomerId' IS NULL THEN NULL ELSE tplus_uuid('party',h.payload->>'defaultCustomerId') END,CASE WHEN h.payload->>'defaultWarehouseId' IS NULL THEN NULL ELSE tplus_uuid('warehouse',h.payload->>'defaultWarehouseId') END,COALESCE(ARRAY(SELECT tplus_uuid('warehouse',jsonb_array_elements_text(h.payload->'warehouseIds'))),'{}'),h.payload
FROM tplus_stage h WHERE h.dataset_path='data/master/halls.jsonl';
INSERT INTO tplus_employee(batch_id,id,source_id,source_code,name,department_id,hall_id,role,source_salesperson,login_enabled,login_identity_created,source_payload)
SELECT ${batch},tplus_uuid('employee',e.source_id),e.source_id,e.payload->>'sourceCode',e.payload->>'name',CASE WHEN e.payload->>'departmentId' IS NULL THEN NULL ELSE tplus_uuid('department',e.payload->>'departmentId') END,CASE WHEN e.payload->>'hallId' IS NULL THEN NULL ELSE tplus_uuid('hall',e.payload->>'hallId') END,e.payload->>'role',COALESCE((e.payload->>'isSourceSalesperson')::boolean,FALSE),COALESCE((e.payload->>'loginEnabled')::boolean,FALSE),COALESCE((e.payload->>'loginIdentityCreated')::boolean,FALSE),e.payload
FROM tplus_stage e WHERE e.dataset_path='data/master/employees.jsonl';
INSERT INTO tplus_party_role(batch_id,party_id,source_id,role,name,source_payload)
SELECT ${batch},tplus_uuid('party',COALESCE(r.payload->>'partyId',r.source_id)),r.payload->>'partyId',r.payload->>'role',r.payload->>'name',r.payload
FROM tplus_stage r WHERE r.dataset_path IN ('data/master/customers.jsonl','data/master/suppliers.jsonl');
INSERT INTO tplus_payment_method(batch_id,id,source_id,source_code,configuration_key,name,origin,source_payload)
SELECT ${batch},tplus_uuid('payment_method',p.source_id),p.source_id,p.payload->>'sourceCode',p.payload->>'configurationKey',p.payload->>'name',COALESCE(p.payload->>'origin','tplus'),p.payload
FROM tplus_stage p WHERE p.dataset_path IN ('data/master/payment_methods.jsonl','data/master/payment_methods_derived.jsonl');
INSERT INTO tplus_fund_account(batch_id,id,source_id,source_code,account_number,name,bank,account_type,source_department_id,primary_payment_method_id,hall_ids,source_latest_balance,balance_initialized,source_payload)
SELECT ${batch},tplus_uuid('fund_account',a.source_id),a.source_id,a.payload->>'sourceCode',a.payload->>'accountNumber',a.payload->>'name',a.payload->>'bank',a.payload->>'type',CASE WHEN a.payload->>'sourceDepartmentId' IS NULL THEN NULL ELSE tplus_uuid('department',a.payload->>'sourceDepartmentId') END,CASE WHEN a.payload->>'primaryPaymentMethodId' IS NULL THEN NULL ELSE tplus_uuid('payment_method',a.payload->>'primaryPaymentMethodId') END,COALESCE(ARRAY(SELECT tplus_uuid('hall',jsonb_array_elements_text(a.payload->'hallIds'))),'{}'),NULLIF(a.payload->'sourceEvidence'->>'最新余额','')::numeric,COALESCE((a.payload->>'balanceInitialized')::boolean,FALSE),a.payload
FROM tplus_stage a WHERE a.dataset_path='data/master/fund_accounts.jsonl';

-- 历史主单：只读归档；未审核、审核人、制单人未知的字段保持 null。
INSERT INTO tplus_history_document(batch_id,source_dataset,source_id,target_document_id,document_kind,source_number,business_date,source_business_type_code,source_business_type_name,source_party_id,source_department_id,source_employee_id,source_warehouse_id,source_from_warehouse_id,source_to_warehouse_id,line_count,quantity_total,amount_total,read_only,audit_status,audited_by,audited_at,created_by,created_at,runtime_audit_replay_allowed,stock_effect,source_sha256,source_record_sha256,source_payload)
SELECT ${historyDocCommon} FROM tplus_stage s WHERE s.dataset_path IN ('data/history/purchase_documents.jsonl','data/history/sales_documents.jsonl','data/history/transfer_documents.jsonl');

INSERT INTO business_document(id,number,type,status,document_date,source_warehouse_id,target_warehouse_id,actor_id,version,revision,inventory_mode,totals,note,created_at)
SELECT tplus_uuid('historical_sale',s.source_id),'HSALE-'||substr(md5(s.source_id),1,24),'SALE','NO_CHANGE',${sourceDate("s", "date")},CASE WHEN s.payload->>'warehouseId' IS NULL THEN NULL ELSE tplus_uuid('warehouse',s.payload->>'warehouseId') END,NULL,NULL,0,1,'HISTORICAL_ARCHIVE',jsonb_build_object('historical',TRUE,'sourceId',s.source_id,'sourceNumber',s.payload->>'sourceDocumentNumber','totalAmount',COALESCE(s.payload->>'amountAfterRounding',s.payload->>'amount'),'rounding',s.payload->>'rounding'),'T+历史销货只读归档',NULL
FROM tplus_stage s WHERE s.dataset_path='data/history/sales_documents.jsonl';
INSERT INTO business_document(id,number,type,status,document_date,source_warehouse_id,target_warehouse_id,actor_id,version,revision,inventory_mode,totals,note,created_at)
SELECT tplus_uuid('historical_transfer',s.source_id),'HTRANSFER-'||substr(md5(s.source_id),1,23),'TRANSFER','NO_CHANGE',${sourceDate("s", "businessDate")},tplus_uuid('warehouse',s.payload->>'fromWarehouseId'),tplus_uuid('warehouse',s.payload->>'toWarehouseId'),NULL,0,1,'HISTORICAL_ARCHIVE',jsonb_build_object('historical',TRUE,'sourceId',s.source_id,'sourceNumber',s.payload->>'sourceNumber','totalAmount',s.payload->>'amountTotalFromSourceLines'),'T+历史调拨只读归档',NULL
FROM tplus_stage s WHERE s.dataset_path='data/history/transfer_documents.jsonl';

-- 历史销货与调拨仅建立查询投影；不产生 inventory_posting / inventory_movement。
INSERT INTO document_line(id,document_id,variant_id,warehouse_id,direction,product_code,product_name,options_snapshot,color_name,size_name,unit_name,quantity,unit_price,amount,note)
SELECT tplus_uuid('historical_sale_line',s.source_id),tplus_uuid('historical_sale',s.payload->>'documentId'),tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'warehouseId'),'HISTORICAL_SALE',s.payload->>'sourceProductCode',s.payload->>'sourceProductName',${optionsSnapshot("s")},s.payload->>'sourceColorName',s.payload->>'sourceSizeName',s.payload->>'unit',abs((s.payload->>'quantity')::numeric),abs(NULLIF(s.payload->>'unitPrice','')::numeric),NULLIF(s.payload->>'amount','')::numeric,s.payload->>'note'
FROM tplus_stage s WHERE s.dataset_path='data/history/sales_lines.jsonl';
INSERT INTO document_line(id,document_id,variant_id,warehouse_id,direction,product_code,product_name,options_snapshot,color_name,size_name,unit_name,quantity,amount,note)
SELECT tplus_uuid('historical_transfer_line',s.source_id),tplus_uuid('historical_transfer',s.payload->>'documentId'),tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'fromWarehouseId'),'TRANSFER_CURRENT',s.payload->>'sourceProductCode',s.payload->>'sourceProductName',${optionsSnapshot("s")},s.payload->>'sourceColorName',s.payload->>'sourceSizeName',s.payload->>'unit',abs((s.payload->>'quantity')::numeric),NULLIF(s.payload->>'amount','')::numeric,NULL
FROM tplus_stage s WHERE s.dataset_path='data/history/transfer_lines.jsonl';

INSERT INTO tplus_history_line(batch_id,source_dataset,source_id,target_line_id,source_document_id,target_document_id,line_kind,product_id,color_id,size_id,sku_id,warehouse_id,from_warehouse_id,to_warehouse_id,source_product_code,source_product_name,source_color_code,source_color_name,source_size_code,source_size_name,source_quantity,stock_quantity_contribution,amount,unit_price,unit,stock_effect,read_only,source_sha256,source_record_sha256,source_lineage)
SELECT ${batch},s.dataset_path,s.source_id,tplus_uuid('historical_purchase_line',s.source_id),s.payload->>'documentId',tplus_uuid('historical_purchase',s.payload->>'documentId'),'purchase',tplus_uuid('product',s.payload->>'productId'),tplus_uuid('spec_value_color',s.payload->>'colorId'),tplus_uuid('spec_value_size',s.payload->>'sizeId'),tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'warehouseId'),NULL::uuid,NULL::uuid,s.payload->>'sourceProductCode',s.payload->>'sourceProductName',s.payload->>'sourceColorCode',s.payload->>'sourceColorName',s.payload->>'sourceSizeCode',s.payload->>'sourceSizeName',(s.payload->>'quantity')::numeric,(s.payload->>'quantity')::numeric,NULLIF(s.payload->>'amount','')::numeric,NULL,s.payload->>'unit',COALESCE((s.payload->>'stockEffect')::boolean,FALSE),TRUE,s.source_sha256,s.record_sha256,'{}'::jsonb
FROM tplus_stage s WHERE s.dataset_path='data/history/purchase_lines.jsonl'
UNION ALL
SELECT ${batch},s.dataset_path,s.source_id,tplus_uuid('historical_sale_line',s.source_id),s.payload->>'documentId',tplus_uuid('historical_sale',s.payload->>'documentId'),'sale',tplus_uuid('product',s.payload->>'productId'),tplus_uuid('spec_value_color',s.payload->>'colorId'),tplus_uuid('spec_value_size',s.payload->>'sizeId'),tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'warehouseId'),NULL::uuid,NULL::uuid,s.payload->>'sourceProductCode',s.payload->>'sourceProductName',s.payload->>'sourceColorCode',s.payload->>'sourceColorName',s.payload->>'sourceSizeCode',s.payload->>'sourceSizeName',(s.payload->>'quantity')::numeric,COALESCE((s.payload->>'stockQuantityContribution')::numeric,-(s.payload->>'quantity')::numeric),NULLIF(s.payload->>'amount','')::numeric,NULLIF(s.payload->>'unitPrice','')::numeric,s.payload->>'unit',COALESCE((s.payload->>'participatesInStockReconstruction')::boolean,FALSE),TRUE,s.source_sha256,s.record_sha256,COALESCE(s.payload->'sourcePurposeTags','{}'::jsonb)
FROM tplus_stage s WHERE s.dataset_path='data/history/sales_lines.jsonl'
UNION ALL
SELECT ${batch},s.dataset_path,s.source_id,tplus_uuid('historical_transfer_line',s.source_id),s.payload->>'documentId',tplus_uuid('historical_transfer',s.payload->>'documentId'),'transfer',tplus_uuid('product',s.payload->>'productId'),tplus_uuid('spec_value_color',s.payload->>'colorId'),tplus_uuid('spec_value_size',s.payload->>'sizeId'),tplus_uuid('sku',s.payload->>'skuId'),NULL::uuid,tplus_uuid('warehouse',s.payload->>'fromWarehouseId'),tplus_uuid('warehouse',s.payload->>'toWarehouseId'),s.payload->>'sourceProductCode',s.payload->>'sourceProductName',s.payload->>'sourceColorCode',s.payload->>'sourceColorName',s.payload->>'sourceSizeCode',s.payload->>'sourceSizeName',(s.payload->>'quantity')::numeric,(s.payload->>'quantity')::numeric,NULLIF(s.payload->>'amount','')::numeric,NULL,s.payload->>'unit',COALESCE((s.payload->>'stockEffect')::boolean,FALSE),TRUE,s.source_sha256,s.record_sha256,COALESCE(s.payload->'sourceLineage','{}'::jsonb)
FROM tplus_stage s WHERE s.dataset_path='data/history/transfer_lines.jsonl';

INSERT INTO tplus_sales_fund(batch_id,source_id,settlement_id,source_document_id,target_document_id,payment_method_id,fund_account_id,source_payment_method_code,source_payment_method_name,source_fund_account_code,source_fund_account_name,amount,direction,source_business_date,settled_at,read_only,runtime_funds_effect,source_sha256,source_record_sha256,source_payload)
SELECT ${batch},s.source_id,s.payload->>'settlementId',s.payload->>'documentId',tplus_uuid('historical_sale',s.payload->>'documentId'),tplus_uuid('payment_method',s.payload->>'paymentMethodId'),tplus_uuid('fund_account',s.payload->>'fundAccountId'),s.payload->>'sourcePaymentMethodCode',s.payload->>'sourcePaymentMethodName',s.payload->>'sourceFundAccountCode',s.payload->>'sourceFundAccountName',(s.payload->>'amount')::numeric,s.payload->>'direction',${sourceDate("s", "sourceBusinessDate")},s.payload->>'settledAt',TRUE,FALSE,s.source_sha256,s.record_sha256,s.payload
FROM tplus_stage s WHERE s.dataset_path='data/history/sales_funds.jsonl';

INSERT INTO inventory_balance(variant_id,warehouse_id,quantity,version)
SELECT tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'warehouseId'),(s.payload->>'quantity')::numeric,0
FROM tplus_stage s WHERE s.dataset_path='data/inventory/rebuilt_stock.jsonl';
INSERT INTO tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
SELECT ${batch},s.source_id,tplus_uuid('sku',s.payload->>'skuId'),tplus_uuid('warehouse',s.payload->>'warehouseId'),(s.payload->>'quantity')::numeric,s.payload->>'unit',(s.payload->>'openingQuantity')::numeric,${sourceDate("s", "cutoffSourceDate")},COALESCE((s.payload->>'snapshotUsed')::boolean,FALSE),COALESCE((s.payload->>'applyHistoricalDocumentsAgain')::boolean,FALSE),COALESCE(NULLIF(s.payload->>'sourceEventCount','')::integer,0),COALESCE(s.payload->'components','{}'::jsonb),s.payload
FROM tplus_stage s WHERE s.dataset_path='data/inventory/rebuilt_stock.jsonl';

-- 导入后硬门禁：任一控制量不符就回滚整批，不自动修数。
DO $$
DECLARE actual numeric;
BEGIN
  IF (SELECT count(*) FROM category) <> ${expectedCount("data/master/categories.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL category=%', (SELECT count(*) FROM category); END IF;
  IF (SELECT count(*) FROM product) <> ${expectedCount("data/master/products.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL product=%', (SELECT count(*) FROM product); END IF;
  IF (SELECT count(*) FROM variant) <> ${expectedCount("data/master/skus.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL sku=%', (SELECT count(*) FROM variant); END IF;
  IF (SELECT count(*) FROM business_document WHERE type='SALE' AND inventory_mode='HISTORICAL_ARCHIVE') <> ${expectedCount("data/history/sales_documents.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL sales=%', (SELECT count(*) FROM business_document WHERE type='SALE' AND inventory_mode='HISTORICAL_ARCHIVE'); END IF;
  IF (SELECT count(*) FROM document_line WHERE direction='HISTORICAL_SALE') <> ${expectedCount("data/history/sales_lines.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL sales_lines=%', (SELECT count(*) FROM document_line WHERE direction='HISTORICAL_SALE'); END IF;
  IF (SELECT count(*) FROM tplus_sales_fund) <> ${expectedCount("data/history/sales_funds.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL sales_funds=%', (SELECT count(*) FROM tplus_sales_fund); END IF;
  IF (SELECT count(*) FROM business_document WHERE type='TRANSFER' AND inventory_mode='HISTORICAL_ARCHIVE') <> ${expectedCount("data/history/transfer_documents.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL transfers=%', (SELECT count(*) FROM business_document WHERE type='TRANSFER' AND inventory_mode='HISTORICAL_ARCHIVE'); END IF;
  IF (SELECT count(*) FROM inventory_balance) <> ${expectedCount("data/inventory/rebuilt_stock.jsonl")} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL inventory_rows=%', (SELECT count(*) FROM inventory_balance); END IF;
  SELECT COALESCE(sum(quantity),0) INTO actual FROM inventory_balance;
  IF actual <> ${expectedInventoryTotal} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL inventory_total=%', actual; END IF;
  IF (SELECT count(*) FROM inventory_balance WHERE quantity < 0) <> ${expectedNegativeInventory} THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL negative_inventory=%', (SELECT count(*) FROM inventory_balance WHERE quantity < 0); END IF;
  IF EXISTS (SELECT 1 FROM tplus_history_line l LEFT JOIN variant v ON v.id=l.sku_id LEFT JOIN warehouse w ON w.id=l.warehouse_id LEFT JOIN warehouse wf ON wf.id=l.from_warehouse_id LEFT JOIN warehouse wt ON wt.id=l.to_warehouse_id WHERE v.id IS NULL OR (l.line_kind IN ('purchase','sale') AND w.id IS NULL) OR (l.line_kind='transfer' AND (wf.id IS NULL OR wt.id IS NULL))) THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL unresolved_history_line_fk'; END IF;
  IF EXISTS (SELECT 1 FROM tplus_sales_fund f LEFT JOIN business_document d ON d.id=f.target_document_id LEFT JOIN tplus_payment_method pm ON pm.id=f.payment_method_id LEFT JOIN tplus_fund_account fa ON fa.id=f.fund_account_id WHERE d.id IS NULL OR pm.id IS NULL OR fa.id IS NULL) THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL unresolved_sales_fund_fk'; END IF;
  IF (SELECT count(*) FROM inventory_posting) <> 0 OR (SELECT count(*) FROM inventory_movement) <> 0 THEN RAISE EXCEPTION 'POST_IMPORT_CONTROL historical replay detected'; END IF;
END $$;

UPDATE import_batch SET status='COMMITTED',committed_at=now() WHERE id=tplus_uuid('import_batch',${batch});
UPDATE tplus_import_run SET status='COMMITTED',committed_at=now(),success_count=(SELECT COALESCE(sum(success_count),0) FROM tplus_import_file WHERE batch_id=${batch}),failure_count=(SELECT COALESCE(sum(failure_count),0) FROM tplus_import_file WHERE batch_id=${batch}),skipped_count=(SELECT COALESCE(sum(skipped_count),0) FROM tplus_import_file WHERE batch_id=${batch}),quarantined_count=(SELECT COALESCE(sum(quarantined_count),0) FROM tplus_import_file WHERE batch_id=${batch}),counts=jsonb_build_object('products',(SELECT count(*) FROM product),'skus',(SELECT count(*) FROM variant),'salesDocuments',(SELECT count(*) FROM business_document WHERE type='SALE' AND inventory_mode='HISTORICAL_ARCHIVE'),'salesLines',(SELECT count(*) FROM document_line WHERE direction='HISTORICAL_SALE'),'salesFunds',(SELECT count(*) FROM tplus_sales_fund),'transfers',(SELECT count(*) FROM business_document WHERE type='TRANSFER' AND inventory_mode='HISTORICAL_ARCHIVE'),'transferLines',(SELECT count(*) FROM tplus_history_line WHERE line_kind='transfer'),'inventoryRows',(SELECT count(*) FROM inventory_balance),'inventoryControlTotal',(SELECT COALESCE(sum(quantity),0)::text FROM inventory_balance),'negativeInventoryRows',(SELECT count(*) FROM inventory_balance WHERE quantity<0),'unresolvedForeignKeys',0) WHERE batch_id=${batch};
`;
}

async function importStream(options: Options, manifest: Manifest, gitSha: string, workspaceStateSha: string, manifestSha: string): Promise<void> {
  const stream = new PsqlStream(options);
  try {
    await stream.write(`BEGIN;\nSET search_path TO ${quoteIdent(options.schema)}, public;\nCREATE TEMP TABLE tplus_stage(dataset_path text NOT NULL, source_id text NOT NULL, source_sha256 text NOT NULL, record_sha256 text NOT NULL, payload jsonb NOT NULL) ON COMMIT DROP;\n`);
    for (const dataset of manifest.datasets.filter((item) => item.canImport)) {
      const filePath = resolve(options.preflightDir, dataset.path);
      await stream.write("COPY tplus_stage(dataset_path,source_id,source_sha256,record_sha256,payload) FROM STDIN WITH (FORMAT csv, NULL '\\N');\n");
      const input = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
      let count = 0;
      for await (const rawLine of input) {
        const line = String(rawLine);
        if (!line.trim()) continue;
        const record = JSON.parse(line) as JsonRecord;
        const sourceId = typeof record.id === "string" ? record.id : "";
        if (!sourceId) throw new Error(`${dataset.path}: record id missing at line ${count + 1}`);
        await stream.write([dataset.path, sourceId, dataset.sha256, sha256(line), line].map(csv).join(",") + "\n");
        count += 1;
      }
      if (count !== dataset.recordCount) throw new Error(`${dataset.path}: import stream count ${count} != ${dataset.recordCount}`);
      await stream.write("\\.\n");
    }
    await stream.write(transformSql(options, manifest, gitSha, workspaceStateSha, manifestSha));
    await stream.write("COMMIT;\n\\q\n");
    await stream.finish();
  } catch (error) {
    await stream.abort();
    throw error;
  }
}

async function ensureSchema(options: Options): Promise<void> {
  const namespaceRows = await queryRows<{ exists: boolean }>(options, "public", `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=${sql(options.schema)}) AS exists`);
  const baseline = readFileSync(BASELINE_SQL, "utf8");
  if (!namespaceRows[0]?.exists) {
    // PostgreSQL 13+ provides gen_random_uuid() as a core function; this Demo
    // runtime does not require the optional pgcrypto extension package.
    await runPsqlScript(options, `CREATE SCHEMA ${quoteIdent(options.schema)};\nSET search_path TO ${quoteIdent(options.schema)}, public;\n${baseline}\n`);
  } else {
    const migrations = await queryRows<{ exists: boolean }>(options, options.schema, `SELECT to_regclass('schema_migration') IS NOT NULL AS exists`);
    if (!migrations[0]?.exists) await runPsqlScript(options, `SET search_path TO ${quoteIdent(options.schema)}, public;\n${baseline}\n`);
  }
  const targetSchema = readFileSync(TARGET_SCHEMA_SQL, "utf8");
  await runPsqlScript(options, `SET search_path TO ${quoteIdent(options.schema)}, public;\n${targetSchema}\n`);
}

async function checkEmptyTarget(options: Options): Promise<void> {
  const rows = await queryRows<{ products: string; documents: string; balances: string; runs: string }>(options, options.schema, `SELECT (SELECT count(*)::text FROM product) AS products,(SELECT count(*)::text FROM business_document) AS documents,(SELECT count(*)::text FROM inventory_balance) AS balances,(SELECT count(*)::text FROM tplus_import_run) AS runs`);
  const row = rows[0];
  if (!row) throw new Error("无法读取 Demo 目标空间状态");
  if (Number(row.products) !== 0 || Number(row.documents) !== 0 || Number(row.balances) !== 0 || Number(row.runs) !== 0) {
    throw new Error(`目标真实数据空间不是空白空间：products=${row.products}, documents=${row.documents}, balances=${row.balances}, runs=${row.runs}。为防止重复叠加，已停止。`);
  }
}

async function readTargetRun(options: Options): Promise<{ status: string; manifest_sha256: string } | null> {
  const rows = await queryRows<{ status: string; manifest_sha256: string }>(options, options.schema, `SELECT status,manifest_sha256 FROM tplus_import_run WHERE batch_id=${sql(EXPECTED_BATCH)}`);
  return rows[0] ?? null;
}

async function captureWorkspaceAsync(): Promise<{ gitSha: string; statusText: string; statusSha256: string }> {
  const gitSha = (await commandOutput("git", ["rev-parse", "HEAD"])).trim();
  const statusText = await commandOutput("git", ["status", "--porcelain=v1"]);
  return { gitSha, statusText, statusSha256: sha256(statusText) };
}

async function queryControlTotals(options: Options): Promise<JsonRecord> {
  const rows = await queryRows<JsonRecord>(options, options.schema, `
    SELECT
      (SELECT count(*) FROM category) AS categories,
      (SELECT count(*) FROM product) AS products,
      (SELECT count(*) FROM variant) AS skus,
      (SELECT count(*) FROM tplus_product_barcode WHERE batch_id=${sql(EXPECTED_BATCH)}) AS product_barcodes,
      (SELECT count(*) FROM tplus_party_role WHERE batch_id=${sql(EXPECTED_BATCH)} AND role='customer') AS customers,
      (SELECT count(*) FROM tplus_party_role WHERE batch_id=${sql(EXPECTED_BATCH)} AND role='supplier') AS suppliers,
      (SELECT count(*) FROM tplus_employee WHERE batch_id=${sql(EXPECTED_BATCH)}) AS employees,
      (SELECT count(*) FROM tplus_hall WHERE batch_id=${sql(EXPECTED_BATCH)}) AS halls,
      (SELECT count(*) FROM warehouse) AS warehouses,
      (SELECT count(*) FROM tplus_history_document WHERE batch_id=${sql(EXPECTED_BATCH)} AND document_kind='purchase') AS purchase_documents,
      (SELECT count(*) FROM tplus_history_line WHERE batch_id=${sql(EXPECTED_BATCH)} AND line_kind='purchase') AS purchase_lines,
      (SELECT count(*) FROM business_document WHERE type='SALE' AND inventory_mode='HISTORICAL_ARCHIVE') AS sales_documents,
      (SELECT count(*) FROM document_line WHERE direction='HISTORICAL_SALE') AS sales_lines,
      (SELECT count(*) FROM tplus_sales_fund WHERE batch_id=${sql(EXPECTED_BATCH)}) AS sales_funds,
      (SELECT count(*) FROM business_document WHERE type='TRANSFER' AND inventory_mode='HISTORICAL_ARCHIVE') AS transfers,
      (SELECT count(*) FROM tplus_history_line WHERE batch_id=${sql(EXPECTED_BATCH)} AND line_kind='transfer') AS transfer_lines,
      (SELECT count(*) FROM inventory_balance) AS inventory_rows,
      (SELECT COALESCE(sum(quantity),0)::text FROM inventory_balance) AS inventory_control_total,
      (SELECT count(*) FROM inventory_balance WHERE quantity<0) AS negative_inventory_rows,
      (SELECT count(*) FROM inventory_posting) AS inventory_postings,
      (SELECT count(*) FROM inventory_movement) AS inventory_movements,
      (SELECT count(*) FROM tplus_history_line l LEFT JOIN variant v ON v.id=l.sku_id LEFT JOIN warehouse w ON w.id=l.warehouse_id LEFT JOIN warehouse wf ON wf.id=l.from_warehouse_id LEFT JOIN warehouse wt ON wt.id=l.to_warehouse_id WHERE l.batch_id=${sql(EXPECTED_BATCH)} AND (v.id IS NULL OR (l.line_kind IN ('purchase','sale') AND w.id IS NULL) OR (l.line_kind='transfer' AND (wf.id IS NULL OR wt.id IS NULL)))) AS unresolved_history_line_fk,
      (SELECT count(*) FROM tplus_sales_fund f LEFT JOIN business_document d ON d.id=f.target_document_id LEFT JOIN tplus_payment_method pm ON pm.id=f.payment_method_id LEFT JOIN tplus_fund_account fa ON fa.id=f.fund_account_id WHERE f.batch_id=${sql(EXPECTED_BATCH)} AND (d.id IS NULL OR pm.id IS NULL OR fa.id IS NULL)) AS unresolved_sales_fund_fk,
      (SELECT count(*) FROM tplus_history_line WHERE batch_id=${sql(EXPECTED_BATCH)} AND target_document_id IS NULL) AS unresolved_history_document_fk
  `);
  return rows[0] ?? {};
}

function markdownControlTotals(actual: JsonRecord, manifest: Manifest, baseline: { gitSha: string; statusSha256: string; statusText: string }, options: Options, manifestSha: string): string {
  const value = (key: string) => key === "inventory_control_total" ? String(Number(actual[key] ?? "0")) : String(actual[key] ?? "0");
  return `# ③B 导入后控制总量\n\n生成时间：${new Date().toISOString()}。数据来自导入后 Demo 实际 schema \`${options.schema}\`，不是预检文件直接复读。\n\n## 导入空间\n\n- database：\`${options.database}\`\n- schema：\`${options.schema}\`\n- space key：\`erp-v2-demo-real-tplus/${EXPECTED_BATCH}\`\n- manifest SHA-256：\`${manifestSha}\`\n- import batch id：\`${EXPECTED_BATCH}\`\n\n## 控制量对照\n\n| 控制项 | ③A-2预检 | 导入后实际 | 结果 |\n|---|---:|---:|---|\n| 商品 | 2,941 | ${value("products")} | ${value("products") === "2941" ? "PASS" : "STOP"} |\n| SKU | 14,864 | ${value("skus")} | ${value("skus") === "14864" ? "PASS" : "STOP"} |\n| 商品级历史条码 | 2,943 | ${value("product_barcodes")} | ${value("product_barcodes") === "2943" ? "PASS" : "STOP"} |\n| 历史销货单 | 27,903 | ${value("sales_documents")} | ${value("sales_documents") === "27903" ? "PASS" : "STOP"} |\n| 历史销货明细 | 79,508 | ${value("sales_lines")} | ${value("sales_lines") === "79508" ? "PASS" : "STOP"} |\n| 有效历史现结 | 25,416 | ${value("sales_funds")} | ${value("sales_funds") === "25416" ? "PASS" : "STOP"} |\n| 有效历史调拨 | 13,946 | ${value("transfers")} | ${value("transfers") === "13946" ? "PASS" : "STOP"} |\n| 调拨明细 | 254,519 | ${value("transfer_lines")} | ${value("transfer_lines") === "254519" ? "PASS" : "STOP"} |\n| 重建库存键 | 137,940 | ${value("inventory_rows")} | ${value("inventory_rows") === "137940" ? "PASS" : "STOP"} |\n| 库存混合计量控制合计 | 80,794 | ${value("inventory_control_total")} | ${value("inventory_control_total") === "80794" ? "PASS" : "STOP"} |\n| 负库存键 | 1,231 | ${value("negative_inventory_rows")} | ${value("negative_inventory_rows") === "1231" ? "PASS" : "STOP"} |\n| 非空历史外键 unresolved | 0 | ${Number(value("unresolved_history_line_fk")) + Number(value("unresolved_sales_fund_fk")) + Number(value("unresolved_history_document_fk"))} | ${Number(value("unresolved_history_line_fk")) + Number(value("unresolved_sales_fund_fk")) + Number(value("unresolved_history_document_fk")) === 0 ? "PASS" : "STOP"} |\n\n## 防重与业务效果\n\n- inventory_posting：${value("inventory_postings")}；inventory_movement：${value("inventory_movements")}。历史导入没有调用审核／过账逻辑。\n- 历史销售、进货、调拨均保留只读归档；历史销售和调拨的查询投影状态为 \`NO_CHANGE\`，不会被当前审核／弃审流程再次生效。\n- 库存只来自 \`rebuilt_stock.jsonl\` 一次；没有把历史进货、销货、调拨事件再次写入库存流水。\n- SKU唯一性由 \`variant(product_id,option_key)\` 唯一约束保护；分类和非空核心外键由 PostgreSQL FK 及导入门禁保护。\n\n## 基线\n\n- 导入前 commit：\`${baseline.gitSha}\`\n- 导入前工作区状态 SHA-256：\`${baseline.statusSha256}\`\n- 工作区状态原文保存在同目录 \`IMPORT_BASELINE.json\`，未用于导入数据判断。\n\n结论：控制量全部 PASS 才允许进入阶段④；本报告若出现 STOP，必须停止并先查明差异，不能自动修数。\n`;
}

function markdownCleanControlTotals(actual: JsonRecord, manifest: Manifest, options: Options, manifestSha: string): string {
  const expected = (path: string) => manifest.datasets.find((item) => item.path === path)?.recordCount;
  const checks: Array<[string, string, string]> = [
    ["商品", "products", "data/master/products.jsonl"],
    ["SKU", "skus", "data/master/skus.jsonl"],
    ["历史商品条码", "product_barcodes", "data/master/product_barcodes.jsonl"],
    ["历史销售", "sales_documents", "data/history/sales_documents.jsonl"],
    ["销售行", "sales_lines", "data/history/sales_lines.jsonl"],
    ["收退款", "sales_funds", "data/history/sales_funds.jsonl"],
    ["可靠调拨", "transfers", "data/history/transfer_documents.jsonl"],
    ["调拨行", "transfer_lines", "data/history/transfer_lines.jsonl"],
    ["库存键", "inventory_rows", "data/inventory/rebuilt_stock.jsonl"],
  ];
  const rows = checks.map(([label, key, path]) => {
    const want = expected(path);
    const got = Number(actual[key]);
    return `| ${label} | ${want ?? "MISSING"} | ${got} | ${want === got ? "PASS" : "STOP"} |`;
  });
  const expectedTotal = manifest.inventoryPolicy?.mixedUnitQuantityControlTotal;
  const expectedNegative = manifest.inventoryPolicy?.negativeInventoryRows;
  rows.push(`| 库存控制合计 | ${expectedTotal} | ${actual.inventory_control_total} | ${String(expectedTotal) === String(Number(actual.inventory_control_total)) ? "PASS" : "STOP"} |`);
  rows.push(`| 负库存键 | ${expectedNegative} | ${actual.negative_inventory_rows} | ${expectedNegative === Number(actual.negative_inventory_rows) ? "PASS" : "STOP"} |`);
  const fk = Number(actual.unresolved_history_line_fk) + Number(actual.unresolved_sales_fund_fk) + Number(actual.unresolved_history_document_fk);
  rows.push(`| unresolved FK | 0 | ${fk} | ${fk === 0 ? "PASS" : "STOP"} |`);
  return `# Clean Source 导入控制量\n\n批次：${manifest.batchId}；schema：${options.schema}；manifest SHA-256：${manifestSha}。\n\n| 控制项 | Preflight | 导入后 | 结果 |\n|---|---:|---:|---|\n${rows.join("\n")}\n\n历史过账：inventory_posting=${actual.inventory_postings}，inventory_movement=${actual.inventory_movements}。\n`;
}

async function main(): Promise<void> {
  const options = optionsFromArgs(process.argv.slice(2));
  if (!options.execute) throw new Error("正式导入需要显式携带 --execute；未执行任何数据库写入。");
  if (EXPECTED_BATCH !== "TPLUS-20260922-A2" && (!/^TPLUS-IMPORT-[0-9]{8}-[A-Z][0-9]+$/.test(EXPECTED_BATCH) || !/^tplus_clean_[a-z0-9_]+$/.test(options.schema) || options.preflightDir === DEFAULT_PREFLIGHT || options.reportDir === resolve("data-cleaning/runs/historical-import"))) {
    throw new Error("CLEAN_IMPORT_ISOLATION_REQUIRED: 独立批次、tplus_clean_* schema、preflight和report目录必须显式提供");
  }
  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8")) as Manifest;
  const manifestSha = sha256(readFileSync(options.manifestPath));
  const baseline = await captureWorkspaceAsync();
  await verifyManifest(options, manifest);

  await ensureSchema(options);
  const existing = await readTargetRun(options);
  if (existing) {
    if (existing.status === "COMMITTED" && existing.manifest_sha256 === manifestSha) {
      const actual = await queryControlTotals(options);
      const reportDir = options.reportDir;
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "POST_IMPORT_CONTROL_TOTALS.md"), EXPECTED_BATCH === "TPLUS-20260922-A2" ? markdownControlTotals(actual, manifest, baseline, options, manifestSha) : markdownCleanControlTotals(actual, manifest, options, manifestSha), "utf8");
      console.log(JSON.stringify({ status: "ALREADY_COMMITTED", batchId: EXPECTED_BATCH, schema: options.schema, actual }, null, 2));
      return;
    }
    throw new Error(`目标空间已有批次 ${EXPECTED_BATCH}，状态=${existing.status} 或 manifest SHA 不一致；为防止重复叠加，已停止。`);
  }
  await checkEmptyTarget(options);

  mkdirSync(options.reportDir, { recursive: true });
  const baselinePath = join(options.reportDir, "IMPORT_BASELINE.json");
  writeFileSync(baselinePath, JSON.stringify({ capturedAt: new Date().toISOString(), gitSha: baseline.gitSha, workspaceStatusSha256: baseline.statusSha256, workspaceStatus: baseline.statusText, database: options.database, schema: options.schema, publicBackup: EXPECTED_BATCH === "TPLUS-20260922-A2" ? "data-cleaning/runs/historical-import/backups/PRE_IMPORT_PUBLIC_20260923.dump" : null }, null, 2) + "\n", "utf8");
  await importStream(options, manifest, baseline.gitSha, baseline.statusSha256, manifestSha);
  const actual = await queryControlTotals(options);
  const reportDir = options.reportDir;
  writeFileSync(join(reportDir, "POST_IMPORT_CONTROL_TOTALS.md"), EXPECTED_BATCH === "TPLUS-20260922-A2" ? markdownControlTotals(actual, manifest, baseline, options, manifestSha) : markdownCleanControlTotals(actual, manifest, options, manifestSha), "utf8");
  console.log(JSON.stringify({ status: "COMMITTED", batchId: EXPECTED_BATCH, schema: options.schema, actual }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
