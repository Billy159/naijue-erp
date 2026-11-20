import type {HistoricalSettlementRetentionApproval} from '../../packages/application/src/unified-historical-settlement-retention.ts';
import type {HistoricalSalesHallApproval,historicalSalesHallApprovalWire} from '../../packages/application/src/unified-historical-sales-hall-evidence.ts';
import type {HistoricalLineAmountEvidence} from '../../packages/application/src/unified-historical-line-amount-evidence.ts';
import type {CurrentEffectiveAlignmentEvidence,currentEffectiveAlignmentDescriptor} from '../../packages/application/src/unified-current-effective-alignment.ts';
import type {SourceOccurrenceEvidence,reconcileSourceOccurrenceEvidence} from '../../packages/application/src/unified-import-source-reconciliation.ts';
import type {ExplicitZeroApproval, explicitZeroApprovalDescriptor} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import type {HistoricalStaffHallApproval, historicalStaffHallApprovalWire} from '../../packages/application/src/unified-historical-staff-hall-approval.ts';

export interface StreamPreflightOptions { historicalSettlementRetentionApproval?:HistoricalSettlementRetentionApproval;
  expectedManifestSha256?: string;
  allowSynthetic?: boolean;
  historicalSalesHallApproval?:HistoricalSalesHallApproval;
  historicalLineAmountEvidence?:HistoricalLineAmountEvidence;
  currentEffectiveAlignmentEvidence?:CurrentEffectiveAlignmentEvidence;
  /** External V1 evidence may be disk-backed; streamPreflight consumes and closes its temporary index. */
  sourceOccurrenceEvidence?:SourceOccurrenceEvidence;
  historicalStaffHallApproval?: HistoricalStaffHallApproval;
  explicitZeroApproval?: ExplicitZeroApproval;
}

/** Completed offline validation, not target admission or permission to import. */
export interface StreamPreflightSummary { historical_settlement_retention_approval?:{utf8:string;sha256:string};
  historical_hall_approval?:ReturnType<typeof historicalSalesHallApprovalWire>;
  current_effective_alignment?:ReturnType<typeof currentEffectiveAlignmentDescriptor>;
  historical_line_amount_differences?:number;
  historical_line_amount_execution_boundary?:'OFFLINE_ARCHIVE_ONLY';
  historical_line_amount_report?:{relative_path:string;row_count:number;bytes:number;sha256:string};
  historical_line_amount_evidence?:{relative_path:string;bytes:number;sha256:string};
  source_occurrence_reconciliation?:{evidence_sha256:string;report_sha256:string;counts:ReturnType<typeof reconcileSourceOccurrenceEvidence>['counts'];state:ReturnType<typeof reconcileSourceOccurrenceEvidence>['state']};
  explicit_zero_approval?: ReturnType<typeof explicitZeroApprovalDescriptor>;
  historical_staff_hall_approval?: ReturnType<typeof historicalStaffHallApprovalWire>;
  timings_ms: {
    metadata_ms: number;
    registry_ms: number;
    records_ms: number;
    relations_and_reconciliation_ms: number;
    index_hash_ms: number;
    total_ms: number;
    jsonl_read_ms: number;
    jsonl_decode_parse_ms: number;
  };
  /** Failed validation retains the original untrusted manifest value. */
  source_namespace: unknown;
  schema_declarations_sha256: string | undefined;
  package_stage: 'READY' | 'CLEANED';
  manifest_sha256: string;
  index_schema_version: 'UNIFIED_STREAM_FACTS_V3';
  index_sha256: string;
  index_bytes: number;
  validation_scope: 'STANDARD_PACKAGE_OFFLINE_V1';
  state: 'STREAM_PREFLIGHT_COMPLETE';
  checks_passed: boolean;
  complete_package_validation: true;
  import_eligible: false;
  business_database_writes: false;
  counts: Record<string, number>;
  issue_count: number;
  bytes_scanned: number;
  peak_rss_bytes: number;
  limits: {line_bytes: number; total_bytes: number; rows: number; issues: number; sqlite_cache_kib: number};
  remaining_checks: string[];
}

export function streamPreflight(directory: string, reportDirectory: string, options?: StreamPreflightOptions): Promise<StreamPreflightSummary>;
