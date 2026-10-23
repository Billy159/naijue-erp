import { maintenanceActions, maintenanceKinds, maintenanceReadIntents } from "../../../packages/application/src/maintenance-commit-ports.ts";
import type { MaintenanceCompletion, MaintenanceEvidenceSession, MaintenanceKind, MaintenanceReceipt, MaintenanceResult } from "../../../packages/application/src/maintenance-commit-ports.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import type { DocumentSpecificationSaveScope } from "../../../packages/application/src/document-specification.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient, PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";

export interface MaintenancePgContext {
  readonly client: { query(sql: string, values?: unknown[]): Promise<PgSalesResult> };
  readonly evidence: MaintenanceEvidenceSession;
}
export interface MaintenancePgUnitOfWork { transaction<T>(work: (context: MaintenancePgContext) => Promise<T>): Promise<T> }
type Query = MaintenancePgContext["client"]["query"];
// Only this constructor/transaction can register a driver or active context.
// Structural copies, caller booleans and a public prepare method are not proof.
const ownedDrivers = new WeakMap<object, PgSalesPool>();
const ownedContexts = new WeakMap<object, { pool: PgSalesPool; client: PgSalesClient; evidence: Evidence; assertActive: () => void }>();
interface DocumentAppendScope { readonly parent: DocumentSpecificationSaveScope; readonly productId: string; readonly operationId: string; readonly requestKey: string; readonly expectedVersion: number; readonly skuFacts: readonly Record<string, string | number | boolean>[] }
/** Identity-bearing token, issued only after this borrowed context completed its
 * exact append. A shape-compatible object or an arbitrary current xid is not proof. */
export interface DocumentAppendEvidence { readonly purpose: 'DOCUMENT_SKU_APPEND_V1' }
const documentAppends = new WeakMap<object, { client: PgSalesClient; completion: MaintenanceCompletion; parent: DocumentSpecificationSaveScope; active: () => void }>();
export function readDocumentAppendEvidence(token: DocumentAppendEvidence, client: PgSalesClient): Readonly<{ completion: MaintenanceCompletion; parent: DocumentSpecificationSaveScope }> {
  const actual = documentAppends.get(token); requireDomain(actual?.client === client, 'TRANSACTION_SCOPE', 'Original same-client document append proof required');
  actual.active(); return { completion: structuredClone(actual.completion), parent: structuredClone(actual.parent) };
}
export function assertMaintenanceDriverPool(driver: object, pool: PgSalesPool): void {
  requireDomain(ownedDrivers.get(driver) === pool, "NATIVE_RUNTIME26_NOT_READY", "Actual maintenance driver must own the verified pool");
}
export function maintenanceContextClient(context: object, pool: PgSalesPool): PgSalesClient {
  const owned = ownedContexts.get(context);
  requireDomain(owned !== undefined && owned.pool === pool, "NATIVE_RUNTIME26_NOT_READY", "Original active maintenance context required");
  owned.assertActive(); return owned.client;
}
export function assertMaintenanceProductImagesPrepared(context: object, pool: PgSalesPool, completion: MaintenanceCompletion): void {
  maintenanceContextClient(context, pool);
  ownedContexts.get(context)!.evidence.assertProductImagesPrepared(completion);
}
type Identity = { readonly accountId: string; readonly hallId: string | null; readonly role: "ADMIN" | "WAREHOUSE" | "SALESPERSON" };
const uuid = (value: string): string => entityId("product", value);
function kind(value: MaintenanceKind): void { requireDomain(maintenanceKinds.includes(value), "FORBIDDEN", "Unknown maintenance family"); }
function key(value: string): string {
  requireDomain(typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value), "INVALID_REQUEST_KEY", "Original bounded request key required"); return value;
}
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647; }
function checkedResult(value: unknown, expectedKind: MaintenanceKind): MaintenanceResult {
  requireDomain(value !== null && typeof value === "object" && !Array.isArray(value) && Reflect.ownKeys(value).length === 4,
    "INVALID_DATABASE_VALUE", "Exact maintenance receipt result required");
  const r = value as Record<string, unknown>;
  requireDomain(typeof r.operationId === "string" && r.kind === expectedKind && typeof r.targetId === "string" && integer(r.version),
    "INVALID_DATABASE_VALUE", "Invalid maintenance receipt identities/version");
  return Object.freeze({ operationId: uuid(r.operationId), kind: expectedKind, targetId: uuid(r.targetId), version: r.version });
}
function boundedEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  requireDomain(serialized !== undefined && Buffer.byteLength(serialized, "utf8") <= 16 * 1024 * 1024,
    "INVALID_MAINTENANCE_EVIDENCE", "Bounded actual sparse evidence required");
  let entries = 0;
  function visit(node: unknown, depth: number): void {
    requireDomain(depth <= 16 && ++entries <= 500_000, "INVALID_MAINTENANCE_EVIDENCE", "Evidence nesting/cardinality exceeds technical limit");
    if (node === null || typeof node === "string" || typeof node === "boolean") return;
    if (typeof node === "number") { requireDomain(Number.isSafeInteger(node), "INVALID_MAINTENANCE_EVIDENCE", "Money/large quantities must remain exact text"); return; }
    requireDomain(typeof node === "object", "INVALID_MAINTENANCE_EVIDENCE", "JSON data evidence required");
    if (Array.isArray(node)) { for (const child of node) visit(child, depth + 1); return; }
    requireDomain(Object.getPrototypeOf(node) === Object.prototype, "INVALID_MAINTENANCE_EVIDENCE", "Plain sparse evidence required");
    for (const [name, child] of Object.entries(node)) {
      requireDomain(!/^(?:password|password_hash|passwordHash|currentPassword|newPassword|token|token_hash|tokenHash|cookie|authorization|secret)$/i.test(name),
        "INVALID_MAINTENANCE_EVIDENCE", "Credential content cannot enter audit evidence"); visit(child, depth + 1);
    }
  }
  visit(value, 0);
}
class Evidence implements MaintenanceEvidenceSession {
  private actor: string | undefined; private receipt: { key: string; kind: MaintenanceKind } | undefined;
  private identity: Identity | undefined; private readonly allowed = new Set<string>(); private completed = false;
  private administratorLock = false;
  private preparationAttempted = false; private preparedFingerprint: string | undefined;
  private readonly query: Query; private readonly assertActive: () => void;
  private readonly document: DocumentAppendScope | undefined;
  private completion: MaintenanceCompletion | undefined;
  constructor(query: Query, assertActive: () => void, document?: DocumentAppendScope) { this.query = query; this.assertActive = assertActive; this.document = document; }
  documentCompletion(): MaintenanceCompletion {
    this.assertActive(); requireDomain(this.document && this.completed && this.completion, 'TRANSACTION_SCOPE', 'Actual exact document append must complete');
    return structuredClone(this.completion);
  }
  private bind(actor: string): void {
    uuid(actor); requireDomain(this.actor === undefined || this.actor === actor, "TRANSACTION_SCOPE", "One trusted actor per maintenance transaction"); this.actor = actor;
  }
  private async prepareIdentity(family: MaintenanceKind): Promise<void> {
    kind(family);
    if (family !== "STAFF" && family !== "ACCOUNT" && family !== "HALL") return;
    requireDomain(this.identity === undefined || this.administratorLock, "TRANSACTION_SCOPE", "Administrator safety lock must precede every identity row lock");
    if (this.administratorLock) return;
    await this.query("/* maintenance:administrator-lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["naijue:maintenance:available-admin:v1"]);
    this.administratorLock = true;
  }
  private async current(actor: string): Promise<Identity> {
    this.assertActive();
    this.bind(actor); if (this.identity) return this.identity;
    const rows = (await this.query(`/* maintenance:identity */ SELECT a.id AS account_id,a.login_enabled,s.id AS staff_id,s.role,s.employment_status,s.hall_id
      FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid FOR SHARE OF a,s`, [actor])).rows;
    requireDomain(rows.length === 1, "FORBIDDEN", "Current maintenance identity unavailable"); const row = rows[0]!;
    requireDomain(row.account_id === actor && typeof row.staff_id === "string" && row.login_enabled === true && row.employment_status === "在职"
      && (row.role === "ADMIN" || row.role === "WAREHOUSE" || row.role === "SALESPERSON"), "FORBIDDEN", "Current maintenance identity unavailable"); uuid(row.staff_id);
    const hallId = row.hall_id === null ? null : typeof row.hall_id === "string" ? uuid(row.hall_id) : undefined;
    requireDomain(hallId !== undefined && (row.role !== "SALESPERSON" || hallId !== null), "FORBIDDEN", "Current maintenance hall unavailable");
    if (hallId !== null) {
      const halls = (await this.query("/* maintenance:hall */ SELECT id,enabled FROM naijue_erp.hall WHERE id=$1::uuid FOR SHARE", [hallId])).rows;
      requireDomain(halls.length === 1 && halls[0]!.id === hallId && halls[0]!.enabled === true, "FORBIDDEN", "Current maintenance hall unavailable");
    }
    return this.identity = Object.freeze({ accountId: actor, hallId, role: row.role });
  }
  private role(identity: Identity, family: MaintenanceKind): void {
    if (this.document) {
      const actor = this.document.parent.actor;
      requireDomain(family === 'PRODUCT' && identity.accountId === actor.accountId && identity.hallId === actor.hallId,
        'FORBIDDEN', 'Delegated append retains the original current document actor'); return;
    }
    kind(family); requireDomain(identity.role === "ADMIN" || (identity.role === "WAREHOUSE" && family !== "STAFF" && family !== "ACCOUNT"),
      "FORBIDDEN", "Current role cannot maintain this family");
  }
  async assertAllowed(actor: ActorContext, family: MaintenanceKind, action: string): Promise<void> {
    this.assertActive();
    await this.prepareIdentity(family);
    const identity = await this.current(actor.accountId); this.role(identity, family);
    if (this.document) requireDomain(action === 'EDIT', 'FORBIDDEN', 'Document delegation authorizes only this product append');
    const write = maintenanceActions[family].includes(action);
    requireDomain(identity.hallId === actor.hallId && (write || maintenanceReadIntents.some(intent => intent === action)), "FORBIDDEN", "Current maintenance scope/action unavailable");
    if (write) this.allowed.add(`${family}:${action}`);
  }
  async getReceipt(actorAccountId: string, requestKey: string, family: MaintenanceKind): Promise<MaintenanceReceipt | undefined> {
    this.assertActive(); kind(family); const originalKey = key(requestKey); this.bind(actorAccountId);
    if (this.document) requireDomain(originalKey === this.document.requestKey && family === 'PRODUCT', 'TRANSACTION_SCOPE', 'Exact internal append key required');
    requireDomain(this.receipt === undefined || (this.receipt.key === originalKey && this.receipt.kind === family), "TRANSACTION_SCOPE", "One original actor/key/family per transaction");
    this.receipt = { key: originalKey, kind: family };
    await this.prepareIdentity(family);
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${JSON.stringify([actorAccountId, originalKey])}`]);
    const identity = await this.current(actorAccountId); this.role(identity, family);
    const rows = (await this.query(`/* maintenance:receipt */ SELECT id,request_hash,action,target_type,target_id,result_data,
      to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at
      FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=$2`, [actorAccountId, originalKey])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Original key must resolve one receipt"); if (!rows.length) return undefined;
    const row = rows[0]!; requireDomain(row.target_type === family, "IDEMPOTENCY_CONFLICT", "Original actor/key belongs to another family");
    const result = checkedResult(row.result_data, family);
    requireDomain(row.id === result.operationId && row.target_id === result.targetId && typeof row.request_hash === "string" && /^[0-9a-f]{64}$/.test(row.request_hash)
      && typeof row.action === "string" && maintenanceActions[family].includes(row.action) && typeof row.completed_at === "string",
    "INVALID_DATABASE_VALUE", "Persisted maintenance receipt is incoherent");
    return Object.freeze({ result, requestHash: row.request_hash, action: row.action, completedAt: row.completed_at });
  }
  private checkedCompletion(input: MaintenanceCompletion): { value: MaintenanceCompletion; result: MaintenanceResult } {
    this.assertActive();
    const value = structuredClone(input); kind(value.kind); this.bind(value.actorAccountId);
    requireDomain(!this.completed && this.receipt?.key === value.requestKey && this.receipt.kind === value.kind
      && this.allowed.has(`${value.kind}:${value.action}`) && maintenanceActions[value.kind].includes(value.action),
    "TRANSACTION_SCOPE", "Completion requires the original locked and authorized command");
    const result: MaintenanceResult = checkedResult({ operationId: value.operationId, kind: value.kind, targetId: value.targetId, version: value.newVersion }, value.kind);
    requireDomain(/^[0-9a-f]{64}$/.test(value.requestHash) && (value.oldVersion === null || integer(value.oldVersion))
      && value.newVersion === (value.oldVersion ?? 0) + 1 && typeof value.completedAt === "string" && !Number.isNaN(Date.parse(value.completedAt))
      && /(?:Z|[+-]\d{2}:\d{2})$/.test(value.completedAt) && value.afterValues?.version === value.newVersion
      && (value.oldVersion === null ? value.beforeValues === null : value.beforeValues?.version === value.oldVersion),
    "INVALID_MAINTENANCE_EVIDENCE", "Exact old/new version and actual completion time required");
    boundedEvidence(value.beforeValues); boundedEvidence(value.afterValues);
    if (this.document) {
      const d = this.document;
      requireDomain(value.kind === 'PRODUCT' && value.action === 'EDIT' && value.targetId === d.productId && value.operationId === d.operationId
        && value.actorAccountId === d.parent.actor.accountId && value.requestKey === d.requestKey && value.completedAt === d.parent.completedAt
        && value.oldVersion === d.expectedVersion && value.newVersion === d.expectedVersion + 1
        && requestHash(value.beforeValues) === requestHash({ version: d.expectedVersion, skus: [] })
        && requestHash(value.afterValues) === requestHash({ version: d.expectedVersion + 1, skus: d.skuFacts }),
      'TRANSACTION_SCOPE', 'Document append cannot mutate retained root, SKU, barcode or image facts');
    }
    return { value, result };
  }
  async prepare(input: MaintenanceCompletion): Promise<void> {
    const { value } = this.checkedCompletion(input);
    requireDomain(!this.preparationAttempted, "TRANSACTION_SCOPE", "Prepare the original maintenance audit exactly once");
    this.preparationAttempted = true;
    const audit = await this.query(`/* maintenance:audit */ INSERT INTO naijue_erp.audit_change
      (id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
      VALUES($1::uuid,$1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8::jsonb,$9::jsonb,$10::timestamptz)`,
    [value.operationId, value.actorAccountId, value.kind, value.targetId, value.action, value.oldVersion, value.newVersion,
      value.beforeValues === null ? null : JSON.stringify(value.beforeValues), JSON.stringify(value.afterValues), value.completedAt]);
    requireDomain(audit.rowCount === 1, "INVALID_DATABASE_VALUE", "Actual original audit insert required before mutation");
    this.preparedFingerprint = requestHash(value);
  }
  async complete(input: MaintenanceCompletion): Promise<MaintenanceResult> {
    const { value, result } = this.checkedCompletion(input);
    if (!this.preparationAttempted) await this.prepare(value);
    requireDomain(this.preparedFingerprint !== undefined && this.preparedFingerprint === requestHash(value),
      "INVALID_MAINTENANCE_EVIDENCE", "Completion cannot change or bypass the original prepared audit");
    const rows = (await this.query(`/* maintenance:complete */ INSERT INTO naijue_erp.operation_receipt
      (id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
      VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid,'COMMITTED',$8::jsonb,$9::timestamptz) RETURNING result_data`,
    [value.operationId, value.actorAccountId, value.requestKey, value.requestHash, value.action, value.kind, value.targetId, JSON.stringify(result), value.completedAt])).rows;
    requireDomain(rows.length === 1, "INVALID_DATABASE_VALUE", "Actual maintenance receipt insert required");
    const persisted = checkedResult(rows[0]!.result_data, value.kind);
    requireDomain(JSON.stringify(persisted) === JSON.stringify(result), "INVALID_DATABASE_VALUE", "Committed receipt result differs from saved root");
    this.completed = true; this.completion = structuredClone(value); return persisted;
  }
  assertProductImagesPrepared(input: MaintenanceCompletion): void {
    const { value } = this.checkedCompletion(input);
    requireDomain(value.kind === "PRODUCT" && this.preparedFingerprint !== undefined
      && this.preparedFingerprint === requestHash(value), "PRODUCT_MEDIA_NOT_READY", "Exact PRODUCT audit must already be inserted on this transaction");
    const before = value.beforeValues?.images, after = value.afterValues.images;
    // No image changes is valid in an explicit media command. Otherwise both
    // changed sets (including an empty removal/addition side) must be present.
    requireDomain(before === undefined && after === undefined || Array.isArray(after)
      && (value.beforeValues === null ? before === undefined : Array.isArray(before)),
    "PRODUCT_MEDIA_NOT_READY", "Complete changed image sets must be in the prepared audit");
  }
}
/** Borrow the original managed document client. The caller's bound document
 * guard and issuer are checked before/after; this function never starts, commits,
 * releases or acquires a connection. The exact parent is closed by the deferred
 * database constraint before the outer SAVE may commit. */
export async function withDocumentSpecificationMaintenanceContext<T>(input: {
  readonly pool: PgSalesPool; readonly client: PgSalesClient; readonly runtime: NativeRuntime26Capability;
  readonly assertBound: () => void; readonly append: DocumentAppendScope;
}, work: (context: MaintenancePgContext) => Promise<T>): Promise<Readonly<{ value: T; proof: DocumentAppendEvidence }>> {
  const append = structuredClone(input.append); input.assertBound();
  uuid(append.productId); uuid(append.operationId); uuid(append.parent.documentId); uuid(append.parent.operationId); key(append.requestKey);
  requireDomain(append.operationId !== append.parent.operationId && append.requestKey === `doc-spec:${append.parent.operationId}:${append.productId}`
    && integer(append.expectedVersion) && append.skuFacts.length > 0, 'TRANSACTION_SCOPE', 'Exact original document append scope required');
  await input.runtime.assertReady(input.client, 'PRODUCT_MAINTENANCE'); input.assertBound();
  let open = true;
  const active = () => { requireDomain(open, 'TRANSACTION_CLOSED', 'Borrowed append context is closed'); input.assertBound(); };
  const query: Query = async (sql, values = []) => { active(); const r = await input.client.query(sql, values); active(); return r; };
  const evidence = new Evidence(query, active, append);
  const context = Object.freeze({ client: Object.freeze({ query }), evidence });
  ownedContexts.set(context, { pool: input.pool, client: input.client, evidence, assertActive: active });
  try {
    const value = await work(context), completion = evidence.documentCompletion();
    await input.runtime.assertReady(input.client, 'PRODUCT_MAINTENANCE'); input.assertBound();
    const proof: DocumentAppendEvidence = Object.freeze({ purpose: 'DOCUMENT_SKU_APPEND_V1' });
    documentAppends.set(proof, { client: input.client, completion, parent: append.parent, active: input.assertBound });
    return Object.freeze({ value, proof });
  } finally { open = false; ownedContexts.delete(context); }
}
/** One original client for leaf writes, current permissions, global key, audit and
 * receipt. Caller owns the shared bounded pool. No retry/migration or hidden pool. */
export class PostgresMaintenanceCommandUnitOfWork implements MaintenancePgUnitOfWork {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) {
    if (typeof pool?.connect !== "function") throw new TypeError("Explicit shared PostgreSQL pool required"); this.pool = pool;
    ownedDrivers.set(this, pool);
  }
  async transaction<T>(work: (context: MaintenancePgContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect(); let active = true, began = false, commitAttempted = false, discard: Error | undefined;
    const query: Query = (sql, values = []) => { requireDomain(active, "TRANSACTION_CLOSED", "Maintenance context cannot escape its callback"); return client.query(sql, values); };
    const assertActive = () => requireDomain(active, "TRANSACTION_CLOSED", "Maintenance context cannot escape its callback");
    const evidence = new Evidence(query, assertActive);
    const context = Object.freeze({ client: Object.freeze({ query }), evidence });
    ownedContexts.set(context, { pool: this.pool, client, evidence, assertActive });
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await work(context); active = false; commitAttempted = true; await client.query("COMMIT"); return result;
    } catch (error) {
      active = false; if (!began || commitAttempted) discard = error instanceof Error ? error : Error("Maintenance transaction outcome unknown");
      if (began && !commitAttempted) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : Error("Maintenance rollback failed");
        throw new AggregateError([error, rollbackError], "Maintenance work and rollback failed; connection discarded");
      }
      throw error;
    } finally { active = false; ownedContexts.delete(context); client.release(discard); }
  }
}
