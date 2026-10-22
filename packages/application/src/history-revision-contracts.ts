import type { ActorContext } from './ports.ts';
import type { ImportedHistoryKind } from './imported-history-query-ports.ts';

/** C01-20261022-v1: existing historical rows only; quantities and yuan amounts are exact strings. */
export interface HistoryRevisionLineChange {
  readonly lineId: string;
  readonly quantity?: string;
  readonly dealPrice?: string;
  readonly lineAmount?: string;
  readonly allocatedDiscount?: string | null;
}
export interface HistoryRevisionTotals { readonly grossAmount: string; readonly orderDiscount: string; readonly netDue: string }
export interface HistoryRevisionCommand {
  readonly kind: ImportedHistoryKind; readonly documentId: string; readonly expectedVersion: number;
  readonly requestKey: string; readonly reason: string; readonly lines: readonly HistoryRevisionLineChange[];
  readonly totals: HistoryRevisionTotals | null;
  readonly settlements: readonly { readonly settlementId: string; readonly amount: string }[];
}
export interface HistoryRevisionLine {
  readonly lineId: string; readonly skuId: string; readonly quantity: string;
  readonly dealPrice?: string; readonly lineAmount?: string; readonly allocatedDiscount?: string | null;
}
export interface HistoryRevisionSettlement { readonly settlementId: string; readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string }
/** Trusted transaction readback. This proof must be read with the locked original/effective document.
 * It is not a client input or evidence inferred from a business date/current employee hall. */
export interface HistoryRevisionCurrent {
  readonly kind: ImportedHistoryKind; readonly documentId: string; readonly version: number;
  readonly previousRevisionId: string | null; readonly importBatchId: string; readonly publishedOperationId: string;
  readonly documentManifestHash: string; readonly sourceStatus: 'DRAFT' | 'APPROVED' | 'VOID';
  readonly baselineEffect: 'INCLUDED_APPROVED' | 'EXCLUDED_NOT_EFFECTIVE'; readonly businessDate: string;
  readonly warehouseId: string | null; readonly fromWarehouseId: string | null; readonly toWarehouseId: string | null;
  readonly lines: readonly HistoryRevisionLine[]; readonly totals: HistoryRevisionTotals | null;
  readonly settlements: readonly HistoryRevisionSettlement[];
}
export interface HistoryRevisionEffect {
  readonly lineId: string; readonly warehouseId: string; readonly skuId: string;
  readonly endpoint: 'SALES_WAREHOUSE' | 'FROM' | 'TO'; readonly quantityDelta: string;
}
export interface HistoryRevisionPlan {
  readonly basis: 'CUTOFF_BASELINE_DELTA_V1'; readonly revisionId: string; readonly fromVersion: number; readonly toVersion: number;
  readonly before: HistoryRevisionCurrent; readonly after: HistoryRevisionCurrent;
  readonly effects: readonly HistoryRevisionEffect[]; readonly moneyChanged: boolean;
}
export interface HistoryRevisionGrant {
  readonly dataset: 'HISTORY'; readonly kind: ImportedHistoryKind; readonly documentId: string; readonly actorAccountId: string;
}
export interface HistoryRevisionReceipt {
  readonly operationId: string; readonly dataset: 'HISTORY'; readonly kind: ImportedHistoryKind;
  readonly documentId: string; readonly revisionId: string; readonly version: number; readonly ledgerEntryIds: readonly string[];
}
export interface HistoryRevisionDependencies {
  readonly authorization: { authorize(actor: ActorContext, command: HistoryRevisionCommand, signal: AbortSignal): Promise<HistoryRevisionGrant> };
  /** D3 store owns source/effective locks and CAS; D1 supplies the same-transaction posting/UoW port.
   * It checks original actor/key/hash replay before CAS, then plans from its locked current facts.
   * No in-memory/default implementation is used by the production service. */
  readonly store: { revise(actor: ActorContext, command: HistoryRevisionCommand, grant: HistoryRevisionGrant, now: string, signal: AbortSignal): Promise<HistoryRevisionReceipt> };
  readonly now: () => string;
}
