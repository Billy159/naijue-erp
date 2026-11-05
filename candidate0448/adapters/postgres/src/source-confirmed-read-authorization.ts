import type { Pool } from "pg";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryQueryAuthorization, InventoryReadScope } from "../../../packages/application/src/inventory-query-contracts.ts";
import { checkedInventoryActor } from "../../../packages/application/src/inventory-query-service.ts";
import { checkedInventoryScope } from "../../../packages/application/src/inventory-query-validation.ts";
import type { SalesQueryAuthorization } from "../../../packages/application/src/sales-query-ports.ts";
import { activeSalesRead } from "../../../packages/application/src/sales-query-validation.ts";
import type { ProductQueryAuthorization } from "../../../packages/application/src/product-query-ports.ts";
import { activeProductRead, parseProductImageQuery, parseProductQuery } from "../../../packages/application/src/product-query-validation.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";

export interface PgReadAuthorizationResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgReadAuthorizationClient {
  query(text: string, values?: unknown[]): Promise<PgReadAuthorizationResult>;
  release(error?: Error | boolean): void;
}
export interface PgReadAuthorizationPool { connect(): Promise<PgReadAuthorizationClient> }
type PgPoolCompatibility = Pool extends PgReadAuthorizationPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;

export interface SourceConfirmedPostgresReadAuthorization {
  readonly inventory: InventoryQueryAuthorization;
  readonly sales: SalesQueryAuthorization;
  readonly products: ProductQueryAuthorization;
}
/** Existing scope validation permits at most 1000 warehouses. Read one extra and reject overflow. */
export const NATIVE_READ_MAX_AUTHORIZED_WAREHOUSES = 1000;
type Role = "ADMIN" | "WAREHOUSE" | "SALESPERSON";
export interface CurrentIdentity { readonly role: Role; readonly hallId: EntityId<"hall"> | null }
type Query = (sql: string, values?: unknown[]) => Promise<PgReadAuthorizationResult>;

function denied(): never { throw new DomainError("FORBIDDEN", "Current account is not authorized for business reads"); }
function activeInventoryRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("INVENTORY_READ_ABORTED", "Inventory read no longer active");
}
function nativeId<K extends "account" | "staff" | "hall" | "warehouse">(kind: K, value: unknown): EntityId<K> {
  if (typeof value !== "string") denied();
  try { return entityId(kind, value); } catch { return denied(); }
}

/** Only current non-secret account/staff/hall facts. This is NOT session authentication. */
async function currentIdentity(query: Query, actor: ActorContext): Promise<CurrentIdentity> {
  const rows = (await query(`/* read-authorization:identity */ SELECT a.id AS account_id, a.staff_id, a.login_enabled,
    s.role, s.employment_status, s.hall_id, h.id AS native_hall_id, h.enabled AS hall_enabled
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id = a.staff_id
    LEFT JOIN naijue_erp.hall h ON h.id = s.hall_id WHERE a.id = $1::uuid LIMIT 2`, [actor.accountId])).rows;
  if (rows.length !== 1) denied();
  const row = rows[0]!;
  if (nativeId("account", row.account_id) !== actor.accountId || row.login_enabled !== true || row.employment_status !== "在职"
    || (row.role !== "ADMIN" && row.role !== "WAREHOUSE" && row.role !== "SALESPERSON")) denied();
  nativeId("staff", row.staff_id);
  const hallId = row.hall_id === null ? null : nativeId("hall", row.hall_id);
  if (hallId !== actor.hallId || (row.role === "SALESPERSON" && hallId === null)
    || (hallId === null && (row.native_hall_id !== null || row.hall_enabled !== null))
    || (hallId !== null && (nativeId("hall", row.native_hall_id) !== hallId || row.hall_enabled !== true))) denied();
  return Object.freeze({ role: row.role, hallId });
}

/** Reuse current source policy facts on the caller's original active read client. */
export async function sourceConfirmedReadIdentityOn(client: Pick<PgReadAuthorizationClient, "query">, actor: ActorContext, signal: AbortSignal): Promise<CurrentIdentity> {
  if (signal.aborted) denied();
  const identity = await currentIdentity((sql, values) => client.query(sql, values), checkedInventoryActor(actor));
  if (signal.aborted || ("role" in actor && actor.role !== identity.role)) denied();
  return identity;
}

async function allInventoryWarehouses(query: Query): Promise<InventoryReadScope> {
  // Disabled warehouse/hall references remain readable historical facts. No enabled filter,
  // stock/catalog scan, import publication predicate, fabricated "all" entity or request labels.
  // The minimal native schema has no warehouse display_order; use its stable name/id order.
  const rows = (await query(`/* read-authorization:warehouses */ SELECT w.id, w.hall_id, w.name, h.id AS native_hall_id
    FROM naijue_erp.warehouse w LEFT JOIN naijue_erp.hall h ON h.id = w.hall_id
    ORDER BY w.name COLLATE "C", w.id LIMIT $1`, [NATIVE_READ_MAX_AUTHORIZED_WAREHOUSES + 1])).rows;
  requireDomain(rows.length <= NATIVE_READ_MAX_AUTHORIZED_WAREHOUSES, "INVENTORY_READ_TOO_LARGE", "Authorized warehouse scope exceeds the technical read bound");
  const warehouses = rows.map(row => {
    const id = nativeId("warehouse", row.id); const hallId = nativeId("hall", row.hall_id);
    if (nativeId("hall", row.native_hall_id) !== hallId || typeof row.name !== "string" || row.name.trim().length === 0) denied();
    return { id, hallId, label: row.name };
  });
  // Reuses exact ID/label/uniqueness/nonempty scope checks and preserves returned ordering.
  return checkedInventoryScope({ hallIds: [...new Set(warehouses.map(row => row.hallId))], warehouses });
}

/** Explicit opt-in native read policies. Supply a trusted pool with finite acquisition/query/statement
 * timeouts (e.g. BoundedPostgresPool); its lifecycle remains the caller's responsibility. Construction
 * does not connect, own/dispose a pool, authenticate a caller, install routes or grant commands.
 * Hosts MUST first authenticate the real session and capture its ActorContext. The fresh lookup
 * below supplements that authentication and rejects a changed/null-mismatched hall or disabled identity.
 * Transfer's existing canonical source-confirmed policy is deliberately not replaced here. */
export function createSourceConfirmedPostgresReadAuthorization(pool: PgReadAuthorizationPool): SourceConfirmedPostgresReadAuthorization {
  if (typeof pool?.connect !== "function") throw new TypeError("Native read authorization requires an explicit trusted PostgreSQL pool");
  async function snapshot<T>(actor: ActorContext, signal: AbortSignal, active: (signal: AbortSignal) => void,
    work: (identity: CurrentIdentity, query: Query) => Promise<T>): Promise<T> {
    active(signal); const client = await pool.connect();
    let began = false; let committing = false; let committed = false; let discard: Error | undefined;
    const query: Query = async (sql, values = []) => { active(signal); const result = await client.query(sql, values); active(signal); return result; };
    try {
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const identity = await currentIdentity(query, actor);
      const result = await work(identity, query); active(signal); committing = true;
      // Record the acknowledged boundary before the post-await abort check. A cancelled
      // response with a successful COMMIT must not issue a fictitious rollback afterward.
      await client.query("COMMIT"); committed = true; active(signal); return result;
    } catch (error) {
      if (!began || (committing && !committed)) discard = error instanceof Error ? error : new Error("Native read authorization failed");
      if (began && !committed) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Native read authorization rollback failed");
        throw new AggregateError([error, rollbackError], "Native read authorization and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  return Object.freeze({
    inventory: Object.freeze<InventoryQueryAuthorization>({ async authorize(actor, intent, signal) {
      const trusted = checkedInventoryActor(actor);
      if (intent?.kind !== "inventory" && intent?.kind !== "candidates") throw new TypeError("Unsupported inventory read intent");
      return snapshot(trusted, signal, activeInventoryRead, async (_identity, query) => allInventoryWarehouses(query));
    } }),
    sales: Object.freeze<SalesQueryAuthorization>({ async authorize(actor, intent, signal) {
      const trusted = checkedInventoryActor(actor);
      if (!["list", "detail", "history", "settlement-statistics"].includes(intent?.kind)) throw new TypeError("Unsupported sales read intent");
      return snapshot(trusted, signal, activeSalesRead, async identity => {
        if (identity.role !== "SALESPERSON") return Object.freeze({ kind: "all" as const });
        if (identity.hallId === null) denied();
        return Object.freeze({ kind: "restricted" as const, clauses: Object.freeze([Object.freeze({ hallId: identity.hallId })]) });
      });
    } }),
    products: Object.freeze<ProductQueryAuthorization>({ async authorize(actor, intent, signal) {
      const trusted = checkedInventoryActor(actor);
      if (!["basics", "specifications", "images", "image"].includes(intent?.kind)) throw new TypeError("Unsupported product read intent");
      const target = intent.kind === "image" ? parseProductImageQuery(intent.parameters) : parseProductQuery(intent.parameters);
      // Product existence/image ownership are enforced by the existing exact-target native reader.
      // Shared product facts have no product-hall ownership and do not require stock presence.
      return snapshot(trusted, signal, activeProductRead, async () => Object.freeze({ productId: target.productId }));
    } })
  });
}
