import type { InventoryLedgerPage, InventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-contracts.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { HttpQueryError } from '../transport/http-query.ts';

export type { InventoryLedgerBusinessType, InventoryLedgerCursor, InventoryLedgerEntry, InventoryLedgerFilter, InventoryLedgerPage, InventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-contracts.ts';
/** A target-only read. Possession of a ledger source ID never grants document access. */
export interface InventoryLedgerReader {
  readLedger(read: QueryRead<InventoryLedgerQuery>): Promise<InventoryLedgerPage>;
}
export interface InventoryLedgerCapability {
  readonly reader: InventoryLedgerReader;
  readonly onAccessFailure: (error: HttpQueryError) => void;
  /** A click intent only. The host must open this exact source through its own
   * current document authorization; inventory access and source IDs confer none. */
  readonly onOpenSource?: (entry: import('../../../../packages/application/src/inventory-ledger-query-contracts.ts').InventoryLedgerEntry) => boolean | Promise<boolean>;
}
