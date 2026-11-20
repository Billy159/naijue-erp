import type { EntityId } from "../../../packages/domain/src/values.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";
import { booleanValue, stringValue } from "./codec.ts";

/** Technical proof windows, not business document/line limits. Overflow is unavailable,
 * never proof that no qualifying older account exists. No row set leaves PostgreSQL. */
export const CURRENT_ACCOUNT_RECENT_MAX_DOCUMENTS = 50;
export const CURRENT_ACCOUNT_RECENT_MAX_LINES_PER_DOCUMENT = 2000;
const MAX_PROOF_ROWS = CURRENT_ACCOUNT_RECENT_MAX_DOCUMENTS * CURRENT_ACCOUNT_RECENT_MAX_LINES_PER_DOCUMENT;
type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;

/** One bounded/set-based runtime proof per candidate set, never per account.
 * CUTOFF_HISTORY active contribution is not implemented/provable here and is NOT inferred.
 * Native sales_header is the whole source SALE family, including RETURN/EXCHANGE. */
const RECENT_ACCOUNT_SQL = `/* current-form:recent-account */ WITH candidate_documents AS MATERIALIZED (
  SELECT h.id, h.version, h.warehouse_id, h.business_date, h.updated_at
  FROM naijue_erp.sales_header h
  WHERE h.hall_id = $1::uuid AND h.status = 'APPROVED' AND h.stock_basis = 'RUNTIME_LEDGER'
    AND EXISTS (SELECT 1 FROM naijue_erp.sales_settlement ss
      JOIN naijue_erp.payment_account a ON a.id = ss.payment_account_id
      JOIN naijue_erp.payment_method m ON m.id = a.payment_method_id
      WHERE ss.sales_id = h.id AND a.enabled AND m.enabled
        AND a.payment_method_id = $2::uuid AND ss.payment_method_id_snapshot = a.payment_method_id)
  ORDER BY h.business_date DESC NULLS LAST, h.updated_at DESC, h.id DESC LIMIT $3
), bounded_documents AS MATERIALIZED (
  SELECT * FROM candidate_documents ORDER BY business_date DESC NULLS LAST, updated_at DESC, id DESC LIMIT $4
), current_lines AS MATERIALIZED (
  SELECT l.id, l.sales_id, l.sku_id, l.quantity
  FROM naijue_erp.sales_line l JOIN bounded_documents d ON d.id = l.sales_id WHERE l.is_current
  ORDER BY l.sales_id, l.line_no, l.id LIMIT $5
), active_effects AS MATERIALIZED (
  SELECT e.id, owner.sales_id, e.source_sales_line_id, e.sku_id, e.warehouse_id, e.business_date,
    e.source_document_version, e.quantity_delta, e.endpoint
  FROM naijue_erp.inventory_ledger e JOIN naijue_erp.sales_line owner ON owner.id = e.source_sales_line_id
  JOIN bounded_documents d ON d.id = owner.sales_id
  WHERE e.event_kind = 'APPROVE' AND e.reverses_entry_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger reversal WHERE reversal.reverses_entry_id = e.id)
  ORDER BY owner.sales_id, e.id LIMIT $5
), line_counts AS (
  SELECT sales_id, count(*) AS line_count FROM current_lines GROUP BY sales_id
), effect_counts AS (
  SELECT e.sales_id, count(*) AS effect_count,
    count(DISTINCT l.id) AS distinct_line_count,
    count(*) FILTER (WHERE l.id IS NOT NULL AND l.quantity <> 0
      AND e.sku_id = l.sku_id AND e.warehouse_id = d.warehouse_id AND e.business_date = d.business_date
      AND e.source_document_version = d.version AND e.quantity_delta::numeric = -l.quantity::numeric
      AND e.endpoint = 'SALES_WAREHOUSE') AS matching_count
  FROM active_effects e JOIN bounded_documents d ON d.id = e.sales_id
  LEFT JOIN current_lines l ON l.id = e.source_sales_line_id AND l.sales_id = e.sales_id GROUP BY e.sales_id
), valid_documents AS (
  SELECT d.* FROM bounded_documents d JOIN line_counts l ON l.sales_id = d.id
  JOIN effect_counts e ON e.sales_id = d.id
  WHERE l.line_count > 0 AND l.line_count <= $6 AND e.effect_count = l.line_count
    AND e.distinct_line_count = l.line_count AND e.matching_count = l.line_count
)
SELECT (SELECT ss.payment_account_id FROM valid_documents d
  JOIN naijue_erp.sales_settlement ss ON ss.sales_id = d.id
  JOIN naijue_erp.payment_account a ON a.id = ss.payment_account_id
  JOIN naijue_erp.payment_method m ON m.id = a.payment_method_id
  WHERE a.enabled AND m.enabled AND a.payment_method_id = $2::uuid
    AND ss.payment_method_id_snapshot = a.payment_method_id
  ORDER BY d.business_date DESC NULLS LAST, d.updated_at DESC, d.id DESC, ss.line_no ASC LIMIT 1) AS recent_account_id,
  (SELECT count(*) > $4 FROM candidate_documents) AS candidate_overflow,
  ((SELECT count(*) > $7 FROM current_lines) OR (SELECT count(*) > $7 FROM active_effects)
    OR EXISTS (SELECT 1 FROM line_counts WHERE line_count > $6)) AS proof_overflow`;

export async function readCurrentRecentAccount(query: Query, hallId: EntityId<"hall">,
  paymentMethodId: EntityId<"paymentMethod">): Promise<EntityId<"paymentAccount"> | null> {
  const rows = (await query(RECENT_ACCOUNT_SQL, [hallId, paymentMethodId, CURRENT_ACCOUNT_RECENT_MAX_DOCUMENTS + 1,
    CURRENT_ACCOUNT_RECENT_MAX_DOCUMENTS, MAX_PROOF_ROWS + 1, CURRENT_ACCOUNT_RECENT_MAX_LINES_PER_DOCUMENT, MAX_PROOF_ROWS])).rows;
  requireDomain(rows.length === 1, "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE", "Current recommendation proof did not return one bounded result");
  const row = rows[0]!; const overflow = booleanValue(row.candidate_overflow), proofOverflow = booleanValue(row.proof_overflow);
  const recent = row.recent_account_id === null ? null : entityId("paymentAccount", stringValue(row.recent_account_id));
  requireDomain(!proofOverflow && !(overflow && recent === null), "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE",
    "The bounded runtime recommendation proof is incomplete, not an empty recommendation");
  return recent;
}
