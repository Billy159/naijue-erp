import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { checkedProductActor } from "../../../packages/application/src/product-query-validation.ts";
import { maintenanceKinds } from "../../../packages/application/src/maintenance-commit-ports.ts";
import type { MaintenanceKind } from "../../../packages/application/src/maintenance-commit-ports.ts";
import { SETTINGS_AUDIT_FIELDS } from "../../../packages/application/src/settings-audit-ports.ts";
import type { SettingsAuditModule, SettingsAuditQuery, SettingsAuditRawPage, SettingsAuditReader } from "../../../packages/application/src/settings-audit-ports.ts";
import { activeSettingsAudit, parseSettingsAuditQuery, settingsAuditModulesFor } from "../../../packages/application/src/settings-audit-validation.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { StoreSettingsScope } from "../../../packages/application/src/store-settings-read-ports.ts";
import { storeSettingsId } from "../../../packages/application/src/store-settings-read-validation.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { EXACT_HISTORICAL_CUSTOMER_EXCLUSION, historicalCustomerExclusionEnabled } from "./party-read-reader.ts";
import type { HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";

/** Host derives these exact native members on the original active maintenance context. */
export interface SettingsAuditCoreReadCapability {
  readonly profile: "COMMITTED_CORE_SETTINGS_V14";
  readonly assertReady: (context: MaintenancePgContext, actor: ActorContext, signal: AbortSignal) => Promise<Pick<Extract<StoreSettingsScope, { kind: "CORE_MEMBERS" }>, "hallIds" | "warehouseIds">>;
}

const objects: Readonly<Record<SettingsAuditModule, readonly [string, string, string]>> = {
  PRODUCT: ["product", "name", "product_code"], CATEGORY: ["product_category", "name", "NULL::text"],
  COLOR: ["color", "name", "code"], FIT: ["fit", "name", "code"], HALL: ["hall", "name", "NULL::text"],
  WAREHOUSE: ["warehouse", "name", "NULL::text"], STAFF: ["staff", "name", "NULL::text"],
  ACCOUNT: ["user_account", "login_name", "NULL::text"], PAYMENT_METHOD: ["payment_method", "name", "NULL::text"],
  PAYMENT_ACCOUNT: ["payment_account", "name", "NULL::text"], CUSTOMER: ["customer", "name", "code"], SUPPLIER: ["supplier", "name", "code"]
};
// Only compile-time field names and authorized server-derived module constants enter SQL.
function projection(column: "before_values" | "after_values", modules: readonly SettingsAuditModule[]): string {
  return `CASE ${column === "before_values" ? "WHEN a.before_values IS NULL THEN NULL" : ""}
    WHEN jsonb_typeof(a.${column}) IS DISTINCT FROM 'object' THEN '{"invalid":true}'::jsonb
    ELSE CASE m.module ${modules.map(module => {
      const keys = SETTINGS_AUDIT_FIELDS[module].map(f => `'${f.key}'`).join(",");
      const rows = SETTINGS_AUDIT_FIELDS[module].filter(f => f.format === "rows").map(f => `'${f.key}'`);
      return `WHEN '${module}' THEN (SELECT COALESCE(jsonb_object_agg(k, CASE
        ${rows.length ? `WHEN k IN (${rows.join(",")}) THEN CASE WHEN a.${column}->k='null'::jsonb THEN 'null'::jsonb
          WHEN jsonb_typeof(a.${column}->k)='array' THEN jsonb_build_object('rowCount',jsonb_array_length(a.${column}->k))
          ELSE '{"invalid":true}'::jsonb END` : ""}
        WHEN octet_length((a.${column}->k)::text)>131072 THEN '{"invalid":true}'::jsonb
        ELSE a.${column}->k END), '{}'::jsonb)
        FROM unnest(ARRAY[${keys}]::text[]) AS f(k) WHERE a.${column} ? k)`;
    }).join("\n")} ELSE '{"invalid":true}'::jsonb END END`;
}
function statement(modules: readonly SettingsAuditModule[], excludeHistorical: boolean, core: boolean): string {
  const nativeObjects = modules.map((module, index) => {
    const [table, name, code] = objects[module];
    return `SELECT '${module}'::text AS module,id,${name} AS name,${code} AS code FROM naijue_erp.${table}${core ? ` WHERE id=ANY($${10 + index}::uuid[])` : module === "CUSTOMER" && excludeHistorical ? ` WHERE ${EXACT_HISTORICAL_CUSTOMER_EXCLUSION}` : ""}`;
  }).join(" UNION ALL ");
  return `/* settings-audit:page */ WITH objects AS (${nativeObjects}), matched AS MATERIALIZED (
    SELECT a.id,a.operation_id,a.object_type AS module,a.object_id,o.name AS object_name,o.code AS object_code,
      a.actor_account_id,s.id AS actor_staff_id,s.name AS actor_name,u.login_name AS actor_login_name,
      a.action,a.old_version,a.new_version,a.occurred_at
    FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r
      ON r.id=a.operation_id AND r.actor_account_id=a.actor_account_id AND r.target_type=a.object_type
      AND r.target_id=a.object_id AND r.action=a.action AND r.status='COMMITTED' AND r.result_data->>'version'=a.new_version::text
    JOIN objects o ON o.module=a.object_type AND o.id=a.object_id
    LEFT JOIN naijue_erp.user_account u ON u.id=a.actor_account_id LEFT JOIN naijue_erp.staff s ON s.id=u.staff_id
    WHERE a.object_type=ANY($1::text[]) AND ($2::uuid IS NULL OR a.object_id=$2::uuid)
      AND ($3::text='' OR strpos(lower(COALESCE(o.name,'')),lower($3))>0 OR strpos(lower(COALESCE(o.code,'')),lower($3))>0)
      AND ($4::text='' OR strpos(lower(COALESCE(s.name,'')),lower($4))>0 OR strpos(lower(COALESCE(u.login_name,'')),lower($4))>0)
      AND ($5::text IS NULL OR a.action=$5)
      AND ($6::date IS NULL OR a.occurred_at >= ($6::date::timestamp AT TIME ZONE 'Asia/Shanghai'))
      AND ($7::date IS NULL OR a.occurred_at < (($7::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai'))
  ), page AS (SELECT * FROM matched ORDER BY occurred_at DESC NULLS LAST,id DESC LIMIT $8 OFFSET $9),
  projected AS (SELECT m.id,m.occurred_at,jsonb_build_object(
    'id',m.id,'operation_id',m.operation_id,'module',m.module,'object_id',m.object_id,'object_name',m.object_name,'object_code',m.object_code,
    'actor_account_id',m.actor_account_id,'actor_staff_id',m.actor_staff_id,'actor_name',m.actor_name,'actor_login_name',m.actor_login_name,
    'action',m.action,'old_version',m.old_version,'new_version',m.new_version,
    'occurred_at',to_char(m.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'before_values',${projection("before_values", modules)},'after_values',${projection("after_values", modules)},
    'credential_actions',CASE WHEN m.module NOT IN ('STAFF','ACCOUNT') OR NOT (a.after_values ? 'account_credentials') THEN '[]'::jsonb
      WHEN jsonb_typeof(a.after_values->'account_credentials')='array' THEN
        CASE WHEN jsonb_array_length(a.after_values->'account_credentials')<=1000
          THEN (SELECT COALESCE(jsonb_agg(c->'action' ORDER BY n),'[]'::jsonb) FROM jsonb_array_elements(a.after_values->'account_credentials') WITH ORDINALITY AS credentials(c,n))
          ELSE 'null'::jsonb END ELSE 'null'::jsonb END) AS item
    FROM page m JOIN naijue_erp.audit_change a ON a.id=m.id
  ), packed AS (SELECT COALESCE(jsonb_agg(item ORDER BY occurred_at DESC NULLS LAST,id DESC),'[]'::jsonb) AS items FROM projected)
  SELECT (SELECT count(*)::text FROM matched) AS total,
    CASE WHEN octet_length(items::text)<=4194304 THEN items ELSE NULL END AS items,
    octet_length(items::text)>4194304 AS too_large FROM packed`;
}
/** Uses D1's actual identity/lock protocol. Count and bounded page share one statement snapshot.
 * No database mutations, migrations, hidden pool, retries or in-flight cancellation claims. */
export class PostgresSettingsAuditUnitOfWork implements SettingsAuditReader {
  private readonly driver: MaintenancePgUnitOfWork;
  private readonly excludeHistorical: boolean;
  private readonly core: SettingsAuditCoreReadCapability | undefined;
  constructor(driver: MaintenancePgUnitOfWork, capability: HistoricalCustomerExclusionCapability | null = null, core?: SettingsAuditCoreReadCapability) {
    if (typeof driver?.transaction !== "function") throw TypeError("Settings logs require the shared authorized driver");
    this.driver = driver; this.excludeHistorical = historicalCustomerExclusionEnabled(driver, capability);
    if (core !== undefined) {
      if (core === null || Object.getPrototypeOf(core) !== Object.prototype) throw TypeError("Explicit committed CORE settings audit capability required");
      const profile = Object.getOwnPropertyDescriptor(core, "profile"), verifier = Object.getOwnPropertyDescriptor(core, "assertReady");
      if (Reflect.ownKeys(core).length !== 2 || !profile || !("value" in profile) || profile.value !== "COMMITTED_CORE_SETTINGS_V14"
        || !verifier || !("value" in verifier) || typeof verifier.value !== "function") throw TypeError("Explicit committed CORE settings audit capability required");
      this.core = Object.freeze({ profile: "COMMITTED_CORE_SETTINGS_V14", assertReady: verifier.value.bind(core) });
    }
  }
  async read(actorInput: ActorContext, input: SettingsAuditQuery, signal: AbortSignal): Promise<SettingsAuditRawPage> {
    const actor = checkedProductActor(actorInput), query = parseSettingsAuditQuery(input); activeSettingsAudit(signal);
    const result = await this.driver.transaction(async context => {
      const { client, evidence } = context;
      // HALL obtains D1's administrator mutex BEFORE identity row locks, including ALL-module reads.
      await evidence.assertAllowed(actor, "HALL", "LIST"); activeSettingsAudit(signal);
      const roles = (await client.query(`/* settings-audit:role */ SELECT a.id AS account_id,s.role
        FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid`, [actor.accountId])).rows;
      requireDomain(roles.length === 1 && roles[0]!.account_id === actor.accountId && (roles[0]!.role === "ADMIN" || roles[0]!.role === "WAREHOUSE"), "FORBIDDEN", "Current log identity unavailable");
      const role = roles[0]!.role as "ADMIN" | "WAREHOUSE";
      let modules = settingsAuditModulesFor(role, query); let memberIds: readonly string[][] = [];
      if (this.core !== undefined) {
        requireDomain(query.module === "ALL" || query.module === "HALL" || query.module === "WAREHOUSE", "FORBIDDEN", "Committed CORE logs are limited to native stores and warehouses");
        const scope = await this.core.assertReady(context, actor, signal); activeSettingsAudit(signal);
        requireDomain(scope !== null && typeof scope === "object" && Array.isArray(scope.hallIds) && scope.hallIds.length === 22
          && Array.isArray(scope.warehouseIds) && scope.warehouseIds.length === 22, "FORBIDDEN", "Exact committed CORE log members unavailable");
        let hallIds: string[], warehouseIds: string[];
        try { hallIds = scope.hallIds.map(storeSettingsId); warehouseIds = scope.warehouseIds.map(storeSettingsId); }
        catch { throw new DomainError("FORBIDDEN", "Exact committed CORE log members unavailable"); }
        requireDomain(new Set(hallIds).size === 22 && new Set(warehouseIds).size === 22, "FORBIDDEN", "Exact committed CORE log members unavailable");
        modules = modules.filter(module => module === "HALL" || module === "WAREHOUSE");
        memberIds = modules.map(module => module === "HALL" ? hallIds : warehouseIds);
      }
      for (const module of modules) if (maintenanceKinds.includes(module as MaintenanceKind)) await evidence.assertAllowed(actor, module as MaintenanceKind, "LIST");
      activeSettingsAudit(signal);
      const rows = (await client.query(statement(modules, this.excludeHistorical, this.core !== undefined), [modules, query.objectId, query.objectSearch, query.actorSearch,
        query.action === "ALL" ? null : query.action, query.dateFrom, query.dateTo, query.pageSize, (query.page - 1) * query.pageSize, ...memberIds])).rows;
      activeSettingsAudit(signal);
      requireDomain(rows.length === 1 && rows[0]!.too_large === false && Array.isArray(rows[0]!.items), "INVALID_SETTINGS_AUDIT_DATA", "Bounded operation log page unavailable");
      return { role, total: rows[0]!.total, items: rows[0]!.items as readonly unknown[] };
    });
    activeSettingsAudit(signal); return result;
  }
}
