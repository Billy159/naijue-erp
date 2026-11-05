import type {HistoricalSalesHallApproval} from '../../packages/application/src/unified-historical-sales-hall-evidence.ts';
import type {HistoricalLineAmountEvidence} from '../../packages/application/src/unified-historical-line-amount-evidence.ts';
import type {BuildUnifiedImportPlanInput, StandardImportCurrentAdmin, StandardImportOccurrence, StandardImportTarget, UnifiedImportPlan} from '../../packages/application/src/unified-import-execution.ts';
import type {V2ProgressBounds} from '../../packages/application/src/unified-import-execution-v2.ts';
import type {MasterChunkPlanV2, MasterChunkV2} from '../../packages/application/src/unified-import-master-chunks-v2.ts';
import type {StreamPreflightSummary} from './stream-preflight.mjs';

export interface PrepareStreamPlanOptions extends Pick<BuildUnifiedImportPlanInput,
  'currentEffectiveAlignmentEvidence' | 'allowSynthetic' | 'historicalSalesAdmission' | 'explicitZeroApproval' | 'historicalStaffHallApproval' | 'registration'> {
  historicalSalesHallApproval?: HistoricalSalesHallApproval;
  historicalLineAmountEvidence?: HistoricalLineAmountEvidence;
  target: StandardImportTarget;
  initialization_identity: StandardImportCurrentAdmin;
  max_master_chunk_rows?: number;
}

export type StreamPlanCommon = Omit<UnifiedImportPlan,
  'format_version' | 'plan_sha256' | 'master_rows' | 'baseline_rows' | 'document_rows' | 'identity_registry' | 'target'> & {
  target: StandardImportTarget;
};

export interface PreparedStreamPlan {
  readonly historicalSalesHallApproval?: HistoricalSalesHallApproval;
  readonly historicalLineAmountEvidence?: HistoricalLineAmountEvidence;
  readonly sourceBindingMs: number;
  readonly totals: Readonly<{
    sales_net_due_cents: string;
    sales_quantity: string;
    sales_line_amount_cents: string;
    transfer_quantity: string;
    inventory_quantity: string;
    settlement_amount_cents: string;
  }>;
  readonly basePlanHash: string;
  readonly v2Hash: string;
  readonly planHash: string;
  readonly common: Readonly<StreamPlanCommon>;
  readonly schedule: Readonly<Omit<MasterChunkPlanV2, 'chunks'>>;
  readonly sourceV2Progress: Readonly<V2ProgressBounds>;
  readonly layoutHash: string;
  readonly summaryBindingHash: string;
  readonly masterChunkCount: number;
  readonly coalescedMasterChunkCount: number;
  readonly initializationIdentityHash: string;
  dispose(): Promise<void>;
}

export type StreamMasterMode = 'legacy' | 'coalesced';
/** Opaque, single-use cursor token consumed by streamTypedHash, not an array. */
declare const streamHashArrayToken: unique symbol;
export interface StreamHashArrayToken {readonly [streamHashArrayToken]: true;}

export function prepareStreamPlan(indexPath: string, summary: StreamPreflightSummary, manifestBytes: Uint8Array, options: PrepareStreamPlanOptions): Promise<PreparedStreamPlan>;
export function assertActiveStreamPlan(plan: unknown): asserts plan is PreparedStreamPlan;
export function iteratePreparedMasterRows(plan: PreparedStreamPlan, mode?: StreamMasterMode): AsyncGenerator<StandardImportOccurrence[], void, unknown>;
export function preparedMasterChunkTokens(plan: PreparedStreamPlan, mode?: StreamMasterMode): StreamHashArrayToken;
export function preparedMasterLayout(plan: PreparedStreamPlan, mode?: StreamMasterMode): StreamHashArrayToken;
export function iteratePreparedMasterChunks(plan: PreparedStreamPlan): AsyncGenerator<MasterChunkV2, void, unknown>;
