import { requireDomain, DomainError } from '../../../packages/domain/src/errors.ts';
import { checkedImportedHistoryActor } from '../../../packages/application/src/imported-history-query-validation.ts';
import { parseHistoryRevisionCommand } from '../../../packages/application/src/history-revision-service.ts';
import type { HistoryRevisionDependencies } from '../../../packages/application/src/history-revision-contracts.ts';
import { checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { PgSalesPool } from '../../../adapters/postgres/src/sales-unit-of-work.ts';
import { importedHistoryReadSql, importedHistoryTransferHallScopeSql } from '../../../adapters/postgres/src/imported-history-query-reader.ts';

/** Original B07/v16 write policy. SQL fragments supply source facts, never a read
 * grant. The revision store repeats publication and current permissions under
 * its write locks, including on original-key recovery. No expectedVersion gate
 * belongs here: original committed receipts precede the store's CAS. */
export function createSourceConfirmedHistoryRevisionAuthorization(pool: PgSalesPool, capability: NativeRuntime26Capability): HistoryRevisionDependencies['authorization'] {
  const runtime = checkedNativeRuntime26Capability(capability);
  if (!runtime || typeof pool?.connect !== 'function') throw new TypeError('Original same-pool HISTORY write runtime required');
  return Object.freeze({ async authorize(actorInput, input, signal) {
    const actor = checkedImportedHistoryActor(actorInput), command = parseHistoryRevisionCommand(input);
    const permit = (value: unknown): void => requireDomain(value, 'FORBIDDEN', 'Historical write access denied');
    const active = () => permit(!signal.aborted);
    active(); const client = await pool.connect();
    let began = false, commitAttempted = false, discard: Error | boolean | undefined;
    const ready = async () => {
      try { await runtime.assertReady(client, 'HISTORY_REVISION'); active(); }
      catch (error) {
        if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'NATIVE_RUNTIME26_NOT_READY')
          throw new DomainError('HISTORY_REVISION_SCHEMA_NOT_READY', 'Reviewed historical write runtime unavailable');
        throw error;
      }
    };
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true; await ready();
      const identities = (await client.query(`/* history-write-policy:identity */ SELECT a.id,a.login_enabled,s.role,s.employment_status,s.hall_id,h.enabled AS hall_enabled
        FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=$1::uuid LIMIT 2`, [actor.accountId])).rows;
      active(); const current = identities[0];
      permit(identities.length === 1 && current?.id === actor.accountId && current.login_enabled === true
        && current.employment_status === '在职' && current.hall_id === actor.hallId
        && ['ADMIN', 'WAREHOUSE', 'SALESPERSON'].includes(current.role as string)
        && (current.hall_id === null || current.hall_enabled === true));
      const salesperson = current!.role === 'SALESPERSON';
      if (salesperson) permit(actor.hallId !== null);
      const facts = importedHistoryReadSql(command.kind);
      const scope = !salesperson ? 'TRUE' : command.kind === 'sales' ? 'h.hall_id=ANY($3::uuid[])' : importedHistoryTransferHallScopeSql(3, true);
      const rows = (await client.query(`/* history-write-policy:document */ SELECT h.id,h.source_status FROM ${facts.headerFrom}
        WHERE h.id=$2::uuid AND ${facts.publishedPredicate} AND ${facts.headerValidityPredicate} AND (${scope}) LIMIT 2`,
      salesperson ? [...facts.values, command.documentId, [actor.hallId]] : [...facts.values, command.documentId])).rows;
      active(); permit(rows.length === 1 && rows[0]!.id === command.documentId && ['DRAFT', 'APPROVED', 'VOID'].includes(rows[0]!.source_status as string));
      // v16 does not let header editing change an approved/void source identity.
      if (command.header !== undefined) permit(rows[0]!.source_status === 'DRAFT');
      await ready(); commitAttempted = true; await client.query('COMMIT'); active();
      return Object.freeze({ dataset: 'HISTORY' as const, kind: command.kind, documentId: command.documentId, actorAccountId: actor.accountId });
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : true;
      if (began && !commitAttempted) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : true;
        throw new AggregateError([error, rollback], 'Historical write authorization rollback failed');
      }
      throw error;
    } finally { client.release(discard); }
  } });
}
