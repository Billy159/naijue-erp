import type { PgSalesClient } from "../../../adapters/postgres/src/sales-unit-of-work.ts";

// Source-owned finite CREATE/read/reopen admission floor, not an all-action
// maintenance ACL profile, role authorization or permission to grant anything.
// Call only on the original issuer admission lease, after its runtime purpose
// check. An independent V7 catalog/review still owns exact ACL/no-excess review.
const staffCreateReadCells = Object.freeze([
  {
    "table_name": "staff",
    "column_name": "id",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "name",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "role",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "hall_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "contact",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "employment_status",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "version",
    "privilege": "SELECT"
  },
  {
    "table_name": "staff",
    "column_name": "id",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "name",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "role",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "hall_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "contact",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "employment_status",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "version",
    "privilege": "INSERT"
  },
  {
    "table_name": "staff",
    "column_name": "id",
    "privilege": "UPDATE"
  },
  {
    "table_name": "user_account",
    "column_name": "id",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "staff_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "login_name",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "login_enabled",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "auth_version",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "version",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "created_at",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "updated_at",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "password_hash",
    "privilege": "SELECT"
  },
  {
    "table_name": "user_account",
    "column_name": "id",
    "privilege": "UPDATE"
  },
  {
    "table_name": "hall",
    "column_name": "id",
    "privilege": "SELECT"
  },
  {
    "table_name": "hall",
    "column_name": "name",
    "privilege": "SELECT"
  },
  {
    "table_name": "hall",
    "column_name": "enabled",
    "privilege": "SELECT"
  },
  {
    "table_name": "hall",
    "column_name": "name",
    "privilege": "UPDATE"
  },
  {
    "table_name": "audit_change",
    "column_name": "action",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "actor_account_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "after_values",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "before_values",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "new_version",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_account_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_category_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_color_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_customer_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_fit_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_hall_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_history_sales_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_history_transfer_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_payment_account_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_payment_method_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_product_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_sales_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_staff_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_supplier_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_transfer_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_type",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_warehouse_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "occurred_at",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "old_version",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "operation_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "audit_change",
    "column_name": "action",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "actor_account_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "after_values",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "before_values",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "id",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "new_version",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "object_type",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "occurred_at",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "old_version",
    "privilege": "INSERT"
  },
  {
    "table_name": "audit_change",
    "column_name": "operation_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "id",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "actor_account_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "request_key",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "request_hash",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "action",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "target_type",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "target_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "status",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "result_data",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "completed_at",
    "privilege": "SELECT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "action",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "actor_account_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "completed_at",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "id",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "request_hash",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "request_key",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "result_data",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "status",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "target_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "operation_receipt",
    "column_name": "target_type",
    "privilege": "INSERT"
  },
  {
    "table_name": "import_batch",
    "column_name": "status",
    "privilege": "SELECT"
  },
  {
    "table_name": "import_batch",
    "column_name": "inventory_mode",
    "privilege": "SELECT"
  },
  {
    "table_name": "auth_session",
    "column_name": "account_id",
    "privilege": "SELECT"
  },
  {
    "table_name": "auth_session",
    "column_name": "revoked_at",
    "privilege": "SELECT"
  }
].map(cell => Object.freeze(cell)));
const linkedAccountCreateCells = Object.freeze([
  {
    "table_name": "user_account",
    "column_name": "id",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "staff_id",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "login_name",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "login_enabled",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "auth_version",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "version",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "created_at",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "updated_at",
    "privilege": "INSERT"
  },
  {
    "table_name": "user_account",
    "column_name": "password_hash",
    "privilege": "INSERT"
  }
].map(cell => Object.freeze(cell)));
const staffCreateReadPrivilegeSql = `/* staff-maintenance:permission-admission-v1 */
WITH required AS (SELECT table_name,column_name,privilege
 FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS r(table_name text,column_name text,privilege text))
SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,
 pg_catalog.format('naijue_erp.%I',table_name),column_name,privilege)),false) AS allowed,
 count(*)::text AS cell_count FROM required`;

// PG returns a Result class, not necessarily a plain outer object. Only its
// own data rows/rowCount and the one plain exact row are accepted. Descriptor
// reads avoid invoking accessors; malformed reflection is evidence failure.
function completeStaffPermissionObservation(value: unknown, expectedCells: number): boolean {
  try {
    const data = (object: object, key: PropertyKey): PropertyDescriptor | undefined => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && Object.hasOwn(descriptor, "value") ? descriptor : undefined;
    };
    if (value === null || typeof value !== "object") return false;
    const count = data(value, "rowCount"), rows = data(value, "rows");
    if (!count || count.value !== 1 || !rows || !Array.isArray(rows.value)
      || Object.getPrototypeOf(rows.value) !== Array.prototype) return false;
    const length = data(rows.value, "length"), first = data(rows.value, "0");
    if (!length || length.value !== 1 || !first || first.enumerable !== true
      || Reflect.ownKeys(rows.value).length !== 2) return false;
    const row: unknown = first.value;
    if (row === null || typeof row !== "object" || Object.getPrototypeOf(row) !== Object.prototype) return false;
    const keys = Reflect.ownKeys(row);
    if (keys.length !== 2 || !keys.includes("allowed") || !keys.includes("cell_count")) return false;
    const allowed = data(row, "allowed"), cells = data(row, "cell_count");
    return allowed?.enumerable === true && allowed.value === true
      && cells?.enumerable === true && cells.value === String(expectedCells);
  } catch { return false; }
}

export async function assertStaffCreateReadPermissionAdmission(client: PgSalesClient, linkedAccountCreateSelected: boolean): Promise<void> {
  const cells = linkedAccountCreateSelected ? [...staffCreateReadCells, ...linkedAccountCreateCells] : staffCreateReadCells;
  const observed: unknown = await client.query(staffCreateReadPrivilegeSql, [JSON.stringify(cells)]);
  if (!completeStaffPermissionObservation(observed, cells.length))
    throw Object.assign(new Error("Selected staff CREATE/read runtime privileges are unavailable"), { code: "NATIVE_RUNTIME26_NOT_READY" });
}
