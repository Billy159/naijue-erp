/** Host-owned structural resource ports, not business-writer access or authority
 * to execute arbitrary SQL. Callers retain their original fixed read statements,
 * issuer checks, transaction lifetime and one-owned-pool binding. No driver,
 * credentials, defaults or extra connection can be constructed by these types. */
export interface RuntimeDatabaseReadResult {
  readonly rows: Record<string, unknown>[];
  readonly rowCount: number | null;
}
export interface RuntimeDatabaseReadQuery {
  query(text: string, values?: unknown[]): Promise<RuntimeDatabaseReadResult>;
}
export interface RuntimeDatabaseReadClient extends RuntimeDatabaseReadQuery {
  release(error?: Error | boolean): void;
}
export interface RuntimeDatabaseReadPool {
  connect(): Promise<RuntimeDatabaseReadClient>;
}
/** Only the identity fields consumed by the original capacity binder. In
 * particular, this port neither exposes nor supplies a database password. */
export interface RuntimeDatabaseTargetIdentity {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
}
