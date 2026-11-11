export const STANDARD_IMPORT_PROTOCOL = 'STANDARD_IMPORT_SQL_V1' as const;

export class UnifiedImportExecutionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'UnifiedImportExecutionError';
    this.code = code;
  }
}
