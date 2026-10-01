/** Install and initialize a fresh clean-data runtime using the existing ③C model. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

function args(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i]?.startsWith("--")) throw new Error(`UNKNOWN_ARGUMENT: ${argv[i]}`);
    result[argv[i]!.slice(2)] = argv[++i] ?? "";
  }
  return result;
}

async function main(): Promise<void> {
const input = args(process.argv.slice(2));
const source = input.source;
const runtimeSchema = input.runtime;
const batch = input.batch;
const reportDir = input["report-dir"] ? resolve(input["report-dir"]) : null;
if (!source || !/^tplus_clean_[a-z0-9_]+$/.test(source) || !runtimeSchema || !/^v2_runtime_clean_[a-z0-9_]+$/.test(runtimeSchema) || !batch || !/^TPLUS-IMPORT-[0-9]{8}-[A-Z][0-9]+$/.test(batch) || !reportDir) {
  throw new Error("CLEAN_RUNTIME_ISOLATION_REQUIRED");
}
process.env.TPLUS_SOURCE_SCHEMA = source;
process.env.TPLUS_RUNTIME_SCHEMA = runtimeSchema;
process.env.TPLUS_IMPORT_BATCH = batch;
const { transaction, identifier } = await import("../historical-runtime/runtime/db.ts");
const { install, initialize } = await import("../historical-runtime/runtime/runtime.ts");
const { installBarcodes, generateHistoricalBarcodes } = await import("../historical-runtime/runtime/barcodes.ts");
const sourceStatus = await transaction(source, async (tx) => {
  const rows = await tx.query(`SELECT status FROM ${identifier(source)}.tplus_import_run WHERE batch_id=$1`, [batch]);
  const count = await tx.query(`SELECT count(*)::integer AS count FROM ${identifier(source)}.tplus_history_document WHERE batch_id=$1`, [batch]);
  return { status: rows.rows[0]?.status, expectedDocuments: Number(count.rows[0]?.count) };
});
if (sourceStatus.status !== "COMMITTED") throw new Error("SOURCE_BATCH_NOT_COMMITTED");
await install(runtimeSchema);
const first = await initialize(runtimeSchema);
const second = await initialize(runtimeSchema);
await installBarcodes();
const barcodeFirst = await generateHistoricalBarcodes();
const barcodeSecond = await generateHistoricalBarcodes();
const actual = await transaction(runtimeSchema, async (tx) => {
  const rows = await tx.query(`SELECT count(*)::integer AS documents,
    count(*) FILTER (WHERE status='APPROVED' AND baseline_was_included AND current_effect_active)::integer AS approvedBaseline,
    (SELECT count(*)::integer FROM ${identifier(runtimeSchema)}.revision) AS revisions,
    (SELECT count(*)::integer FROM ${identifier(runtimeSchema)}.posting) AS postings,
    (SELECT count(*)::integer FROM ${identifier(runtimeSchema)}.movement) AS movements,
    (SELECT count(*)::integer FROM ${identifier(runtimeSchema)}.idempotency_request) AS idempotencyRequests,
    (SELECT count(*)::integer FROM ${identifier(runtimeSchema)}.generated_barcode) AS generatedBarcodes
    FROM ${identifier(runtimeSchema)}.document`);
  return rows.rows[0];
});
const result = { status: "PASS", source, runtimeSchema, batch, sourceStatus, first, second, barcodeFirst: { inserted: barcodeFirst.inserted, total: barcodeFirst.total, exceptions: barcodeFirst.issues.length }, barcodeSecond: { inserted: barcodeSecond.inserted, total: barcodeSecond.total, exceptions: barcodeSecond.issues.length }, actual };
if (Number(actual.documents) !== sourceStatus.expectedDocuments || Number(actual.approvedbaseline) !== sourceStatus.expectedDocuments || Number(actual.revisions) !== sourceStatus.expectedDocuments || Number(actual.postings) !== 0 || Number(actual.movements) !== 0 || Number(actual.idempotencyrequests) !== 0 || second.created !== 0 || barcodeSecond.inserted !== 0 || Number(actual.generatedbarcodes) + barcodeFirst.issues.length !== barcodeFirst.total) {
  result.status = "STOP";
}
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "RUNTIME_INIT.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
if (result.status !== "PASS") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
