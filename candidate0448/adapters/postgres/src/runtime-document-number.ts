import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { checkedAllocatedDocumentNumber, checkedRuntimeDocumentNumberInput } from "../../../packages/application/src/runtime-document-number.ts";
import type { RuntimeDocumentNumberInput } from "../../../packages/application/src/runtime-document-number.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";

export type RuntimeDocumentNumberQuery = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
/** Caller owns the original preparation transaction and its current authorization
 * /reference checks. No pool, COMMIT, retry or secondary client is created here. */
export async function reserveRuntimeDocumentNumber(query: RuntimeDocumentNumberQuery, input: RuntimeDocumentNumberInput): Promise<string> {
  const value = checkedRuntimeDocumentNumberInput(input);
  await query("/* document-number:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`runtime-document-number:${value.kind}:${value.documentId}`]);
  const rows = (await query(`/* document-number:existing */ SELECT number,actor_account_id FROM naijue_erp.runtime_document_number_allocation
    WHERE document_kind=$1 AND document_id=$2::uuid FOR SHARE`, [value.kind, value.documentId])).rows;
  requireDomain(rows.length <= 1, "INVALID_DOCUMENT_NUMBER", "Unique persisted document allocation required");
  if (rows.length === 1) {
    requireDomain(rows[0]!.actor_account_id === value.actorAccountId, "FORBIDDEN", "Document allocation belongs to another account");
    return checkedAllocatedDocumentNumber(value.kind, rows[0]!.number);
  }
  const inserted = (await query(`/* document-number:reserve */ INSERT INTO naijue_erp.runtime_document_number_allocation
    (document_kind,document_id,actor_account_id) VALUES($1,$2::uuid,$3::uuid) RETURNING number,actor_account_id`,
  [value.kind, value.documentId, value.actorAccountId])).rows;
  requireDomain(inserted.length === 1 && inserted[0]!.actor_account_id === value.actorAccountId,
    "INVALID_DOCUMENT_NUMBER", "One actual database allocation required");
  return checkedAllocatedDocumentNumber(value.kind, inserted[0]!.number);
}
/** For a NEW SAVE. Existing saved rows retain their original number and are not
 * adopted/backfilled. A caller must pass their trusted creation account. */
export async function assertRuntimeDocumentNumber(query: RuntimeDocumentNumberQuery, input: RuntimeDocumentNumberInput & { readonly number: string }): Promise<void> {
  const value = checkedRuntimeDocumentNumberInput(input), number = checkedAllocatedDocumentNumber(value.kind, input.number);
  const rows = (await query(`/* document-number:validate */ SELECT number,actor_account_id FROM naijue_erp.runtime_document_number_allocation
    WHERE document_kind=$1 AND document_id=$2::uuid FOR SHARE`, [value.kind, value.documentId])).rows;
  requireDomain(rows.length === 1 && rows[0]!.number === number && rows[0]!.actor_account_id === value.actorAccountId,
    "DOCUMENT_NUMBER_MISMATCH", "Original actor/document/database number mapping required");
}
