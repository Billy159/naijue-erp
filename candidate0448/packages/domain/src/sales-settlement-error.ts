import { DomainError } from './errors.ts';

/** Explicit business facts only. HTTP must never serialize arbitrary provider messages. */
export class SalesSettlementMismatchError extends DomainError {
  readonly netDue: bigint;
  readonly settled: bigint;
  readonly difference: bigint;
  constructor(netDue: bigint, settled: bigint) {
    super('SETTLEMENT_MISMATCH', 'Approval requires exact settlement');
    if (typeof netDue !== 'bigint' || typeof settled !== 'bigint') throw new TypeError('Settlement facts must be exact minor amounts');
    this.netDue = netDue; this.settled = settled; this.difference = netDue - settled;
    Object.freeze(this);
  }
}
