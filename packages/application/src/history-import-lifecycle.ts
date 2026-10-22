import { requireDomain } from "../../domain/src/errors.ts";
import { HISTORY_MAPPING_VERSION, isHistoryCounts } from "./history-storage-contract.ts";
import type { HistoryCounts } from "./history-storage-contract.ts";

export const HISTORY_IMPORT_READBACK_VERSION = "HISTORY_IMPORT_READBACK_V1";
/** Frozen authorization-artifact identity, not a digest recomputed from SQL rows. */
export interface HistoryImportStageMetadata {
  readonly expectedCounts: Readonly<HistoryCounts>;
  readonly payloadHash: string;
}
export interface HistoryImportReconciliation {
  readonly actualCounts: Readonly<HistoryCounts>;
  readonly authorizedPayloadHash: string;
  readonly sourcePayloadHashRecomputed: false;
  readonly sqlFieldValidation: typeof HISTORY_IMPORT_READBACK_VERSION;
}
export function validateHistoryImportStageMetadata(value: unknown): asserts value is HistoryImportStageMetadata {
  requireDomain(value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "expectedCounts,payloadHash", "INVALID_HISTORY_IMPORT_METADATA",
  "V2 stage requires exactly expectedCounts and payloadHash; caller validation flags/actual counts are forbidden");
  const row = value as Record<string, unknown>;
  requireDomain(isHistoryCounts(row.expectedCounts) && typeof row.payloadHash === "string" && /^[a-f0-9]{64}$/.test(row.payloadHash),
    "INVALID_HISTORY_IMPORT_METADATA", "Exact nine-key nonnegative safe-integer history counts and authenticated artifact SHA256 required");
}
export function historyImportStageMetadata(mappingVersion: string, value: unknown): HistoryImportStageMetadata | undefined {
  if (mappingVersion !== HISTORY_MAPPING_VERSION) {
    requireDomain(value === undefined, "HISTORY_IMPORT_MAPPING_REQUIRED", "History metadata is forbidden outside the explicit V2 mapping"); return undefined;
  }
  validateHistoryImportStageMetadata(value); return structuredClone(value);
}
/** This slice has no audited SALES_LINE/SETTLEMENT mapper or SQL-field verifier.
 * Count equality or externally supplied `passed:true` cannot fill that capability. */
export function assertHistoryImportReadbackCapabilities(counts: Readonly<HistoryCounts>): void {
  requireDomain(counts.history_sales_line === 0, "HISTORY_IMPORT_SALES_LINE_NOT_IMPLEMENTED",
    "Nonzero SALES_LINE publication is closed until its typed source/field/binding mapper and read-back are implemented");
  requireDomain(counts.history_sales_settlement === 0, "HISTORY_IMPORT_SETTLEMENT_NOT_IMPLEMENTED",
    "Nonzero SETTLEMENT publication is closed until its typed source/field/payment-binding mapper and read-back are implemented");
  requireDomain(counts.history_sales_header === 0, "HISTORY_IMPORT_SALES_DOCUMENT_NOT_IMPLEMENTED",
    "A historical sales document cannot publish as a header without its implemented source-backed sales lines");
}
