import {DataAccessError} from './access-errors.js';

export interface AccessOptions {
  readonly maxConnections: number;
  readonly connectionTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
  readonly idleTransactionTimeoutMs: number;
  readonly actionTimeoutMs: number;
}

export function accessOptions(input: Partial<AccessOptions> = {}): AccessOptions {
  const options = {maxConnections: 8, connectionTimeoutMs: 5000, idleTimeoutMs: 10000,
    statementTimeoutMs: 15000, lockTimeoutMs: 3000, idleTransactionTimeoutMs: 10000, actionTimeoutMs: 30000, ...input};
  for (const [key, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > (key === 'maxConnections' ? 32 : key === 'actionTimeoutMs' ? 6000000 : 300000)) throw new DataAccessError('INVALID_ACCESS_OPTIONS');
  }
  if (options.lockTimeoutMs > options.statementTimeoutMs || options.statementTimeoutMs > options.actionTimeoutMs) throw new DataAccessError('INVALID_TIMEOUT_ORDER');
  return Object.freeze(options);
}
