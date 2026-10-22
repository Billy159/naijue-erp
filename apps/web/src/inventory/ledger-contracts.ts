import type { InventoryLedgerPage, InventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-contracts.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { HttpQueryError } from '../transport/http-query.ts';

export type { InventoryLedgerCursor, InventoryLedgerEntry, InventoryLedgerPage, InventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-contracts.ts';
/** A target-only read. Possession of a ledger source ID never grants document access. */
export interface InventoryLedgerReader {
  readLedger(read: QueryRead<InventoryLedgerQuery>): Promise<InventoryLedgerPage>;
}
export interface InventoryLedgerCapability {
  readonly reader: InventoryLedgerReader;
  readonly onAccessFailure: (error: HttpQueryError) => void;
}
