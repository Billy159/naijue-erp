/** Driver diagnostics may include SQL, parameters or failing rows. Never expose them. */
export class DataAccessError extends Error {
  constructor(readonly code: string, readonly sqlState?: string) {
    super(code); this.name = 'DataAccessError';
  }
}

export function databaseError(error: unknown): DataAccessError {
  if (error instanceof DataAccessError) return error;
  const state = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return new DataAccessError('DATABASE_OPERATION_FAILED', /^[0-9A-Z]{5}$/.test(state) ? state : undefined);
}
